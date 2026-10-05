// Para sitios que no publican feed: saca los titulares directamente de la
// portada. Se buscan enlaces que parezcan artículos, no menús ni pies de página.

import { resolveUrl, urlKey } from './url.js';

const MIN_CHARS = 28;
const MAX_CHARS = 220;
const MAX_ITEMS = 40;
export const MIN_HEADLINES = 5;

const host = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};

// Una dirección de artículo suele ser larga o llevar números; «/deportes» no.
function looksLikeArticle(url) {
    const { pathname } = new URL(url);
    const parts = pathname.split('/').filter(Boolean);
    return parts.length >= 2 || /\d/.test(pathname) || pathname.length > 28;
}

function nearbyImage(anchor, baseUrl) {
    const box = anchor.querySelector('img') ? anchor : anchor.closest('article, li, section, div');
    const img = box?.querySelector('img');
    if (!img) return '';
    const src = resolveUrl(img.getAttribute('data-src') || img.getAttribute('src'), baseUrl);
    return /^https:/i.test(src) && !/\.(gif|svg)(\?|$)/i.test(src) ? src : '';
}

export function extractHeadlines(html, baseUrl) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const site = host(baseUrl);
    const byKey = new Map();

    for (const a of doc.querySelectorAll('a[href]')) {
        if (a.closest('nav, footer, aside')) continue;
        const url = resolveUrl(a.getAttribute('href'), baseUrl);
        if (!/^https?:/i.test(url) || host(url) !== site || !looksLikeArticle(url)) continue;

        const heading = a.querySelector('h1, h2, h3, h4') || a.closest('h1, h2, h3, h4');
        const title = (heading || a).textContent.replace(/\s+/g, ' ').trim();
        if (title.length < MIN_CHARS || title.length > MAX_CHARS || title.split(' ').length < 4) continue;

        const key = urlKey(url);
        const prev = byKey.get(key);
        // El mismo artículo suele enlazarse dos veces (foto y titular): se queda el titular.
        if (!prev || (heading && !prev.heading)) {
            byKey.set(key, { url, title, heading: Boolean(heading), image: prev?.image || nearbyImage(a, baseUrl) });
        } else if (!prev.image) {
            prev.image = nearbyImage(a, baseUrl);
        }
    }

    return [...byKey.values()].slice(0, MAX_ITEMS).map(({ url, title, image }) => ({
        url,
        title,
        contentHtml: '',
        summary: '',
        author: '',
        publishedAt: null,
        image,
        kind: '',
    }));
}
