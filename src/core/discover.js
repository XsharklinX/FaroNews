// A partir de lo que el usuario pega (un dominio, una página, un canal, un
// perfil o un feed), encuentra cómo seguirlo.

import { parseFeed } from './feedParser.js';
import { extractHeadlines, MIN_HEADLINES } from './scrape.js';
import { resolveUrl, withScheme } from './url.js';

const FEED_TYPES = /(rss|atom)\+xml|application\/(feed\+)?json/i;
const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed/', '/feedburner.xml'];
const STALE_MS = 60 * 86400000;
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml';

export function feedLinksFromHtml(html, baseUrl) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const links = Array.from(doc.querySelectorAll('link[rel~="alternate"]'))
        .filter((l) => FEED_TYPES.test(l.getAttribute('type') || ''))
        .map((l) => resolveUrl(l.getAttribute('href'), baseUrl))
        .filter(Boolean);
    // Los feeds de comentarios van al final: casi nunca son lo que se busca.
    const unique = [...new Set(links)];
    return [...unique.filter((u) => !/comment/i.test(u)), ...unique.filter((u) => /comment/i.test(u))];
}

export function pageTitle(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const og = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    return (og || doc.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim();
}

// Plataformas conocidas: la dirección del feed se deduce de la del perfil, sin
// tener que abrir la página (que a veces bloquea a quien no es un navegador).
export function knownFeeds(input) {
    let url;
    try {
        url = new URL(input);
    } catch {
        return [];
    }
    const host = url.hostname.replace(/^(www|m|old|new)\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    let m;

    if (host === 'youtube.com') {
        if ((m = path.match(/^\/channel\/(UC[\w-]{20,})/))) return [`${YT_FEED}?channel_id=${m[1]}`];
        if (path === '/playlist' && url.searchParams.get('list')) return [`${YT_FEED}?playlist_id=${url.searchParams.get('list')}`];
        return [];
    }
    if (host === 'reddit.com') {
        if ((m = path.match(/^\/(r|user|u)\/([\w-]+)/))) return [`https://www.reddit.com/${m[1] === 'u' ? 'user' : m[1]}/${m[2]}/.rss`];
        return [];
    }
    if (host === 'bsky.app') {
        if ((m = path.match(/^\/profile\/([^/]+)/))) return [`https://bsky.app/profile/${m[1]}/rss`];
        return [];
    }
    // Mastodon y compatibles, en cualquier servidor: /@usuario y /tags/etiqueta.
    if ((m = path.match(/^\/@[\w.-]+$/)) || (m = path.match(/^\/tags\/[\w-]+$/))) return [`${url.origin}${m[0]}.rss`];
    return [];
}

// La página de un canal de YouTube (youtube.com/@nombre) lleva dentro su id.
// Se busca primero donde la página habla de sí misma (su dirección canónica y
// su propio enlace de feed): otros ids del código son de canales recomendados.
export function youtubeFeedFromHtml(html) {
    const text = String(html || '');
    const m =
        text.match(/rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{20,})"/) ||
        text.match(/channel_id=(UC[\w-]{20,})/) ||
        text.match(/"externalId":"(UC[\w-]{20,})"/) ||
        text.match(/"channelId":"(UC[\w-]{20,})"/);
    return m ? `${YT_FEED}?channel_id=${m[1]}` : '';
}

const isYouTube = (url) => /(^|\.)youtube\.com$/.test(new URL(url).hostname);

// Lee una fuente ya seguida. `kind` es 'page' para sitios sin feed.
export function readSource(text, url, kind) {
    if (kind === 'page') {
        const items = extractHeadlines(text, url);
        return items.length ? { title: pageTitle(text), siteUrl: new URL(url).origin, items } : null;
    }
    return parseFeed(text, url);
}

// fetchText(url) -> { text, url } donde url es la dirección final tras redirecciones.
// Devuelve { feedUrl, feed, kind? }. kind 'page' = sin feed, se leen los titulares.
export async function discoverFeed(input, fetchText, now = Date.now(), wait = (ms) => new Promise((done) => setTimeout(done, ms))) {
    const start = withScheme(input);
    if (!start) throw new Error('EMPTY');

    // El servicio de feeds de YouTube falla a ratos con 404 o 500 aunque el
    // canal exista: se le dan tres oportunidades.
    const tryFeed = async (url) => {
        const attempts = url.startsWith(YT_FEED) ? 3 : 1;
        for (let i = 0; i < attempts; i++) {
            if (i) await wait(800);
            try {
                const res = await fetchText(url);
                const feed = parseFeed(res.text, res.url);
                return feed ? { feedUrl: res.url, feed } : null;
            } catch {
                // Se reintenta si quedan oportunidades.
            }
        }
        return null;
    };

    const known = knownFeeds(start);
    for (const url of known) {
        const found = await tryFeed(url);
        if (found) return found;
    }
    if (known.some((url) => url.startsWith(YT_FEED))) throw new Error('YOUTUBE_BUSY');

    let page;
    try {
        page = await fetchText(start);
    } catch {
        throw new Error('UNREACHABLE');
    }

    const direct = parseFeed(page.text, page.url);
    if (direct) return { feedUrl: page.url, feed: direct };

    // Algunos sitios dejan publicado un feed viejo que ya nadie actualiza.
    // Se sigue buscando hasta dar con uno vivo; el viejo queda como último recurso.
    const origin = new URL(page.url).origin;
    const youtube = isYouTube(page.url) ? youtubeFeedFromHtml(page.text) : '';
    const candidates = [youtube, ...feedLinksFromHtml(page.text, page.url), ...(isYouTube(page.url) ? [] : COMMON_PATHS.map((path) => origin + path))];
    let fallback = null;
    for (const url of [...new Set(candidates.filter(Boolean))]) {
        const found = await tryFeed(url);
        if (!found) continue;
        if (isAlive(found.feed, now) && !/comment/i.test(found.feedUrl)) return found;
        fallback ||= found;
    }
    // El canal existe (se encontró su id) pero el servicio de feeds no contesta.
    if (youtube && !fallback) throw new Error('YOUTUBE_BUSY');

    const useful = (found) => found && found.feed.items.length > 0 && !/comment/i.test(found.feedUrl);
    if (useful(fallback)) return fallback;

    // Sin feed que sirva: si la portada tiene titulares reconocibles, se sigue la página.
    const items = extractHeadlines(page.text, page.url);
    if (items.length >= MIN_HEADLINES) {
        return { feedUrl: page.url, kind: 'page', feed: { title: pageTitle(page.text), siteUrl: origin, items } };
    }
    if (fallback) return fallback;

    throw new Error('NO_FEED');
}

function isAlive(feed, now) {
    if (!feed.items.length) return false;
    const dates = feed.items.map((i) => i.publishedAt).filter(Boolean);
    return !dates.length || now - Math.max(...dates) <= STALE_MS;
}

// Artículos por semana, estimados con las fechas del propio feed.
export function perWeek(items) {
    const dates = items.map((i) => i.publishedAt).filter(Boolean);
    if (dates.length < 2) return null;
    const days = Math.max(1, (Math.max(...dates) - Math.min(...dates)) / 86400000);
    return Math.max(1, Math.round((dates.length / days) * 7));
}
