// Lee RSS 2.0, RSS 1.0 (RDF), Atom y JSON Feed y los deja en una sola forma.
// Devuelve null si el texto no es un feed: así el descubridor sabe seguir buscando.

import { firstImage, htmlToText } from './text.js';
import { resolveUrl } from './url.js';

const kids = (el, name) => Array.from(el?.children || []).filter((c) => c.tagName.toLowerCase() === name);
const kid = (el, name) => kids(el, name)[0] || null;
const txt = (el, ...names) => {
    for (const name of names) {
        const value = (kid(el, name)?.textContent || '').trim();
        if (value) return value;
    }
    return '';
};
const toMs = (value) => {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
};

const VIDEO_HOST = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/;

export function isVideoUrl(url) {
    try {
        return VIDEO_HOST.test(new URL(url).hostname);
    } catch {
        return false;
    }
}

// «1:02:30», «45:10» o segundos sueltos -> minutos.
export function durationMinutes(value) {
    const parts = String(value || '').trim().split(':').map(Number);
    if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
    const seconds = parts.reduce((total, n) => total * 60 + n, 0);
    return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null;
}

import { unwrapRedirect } from './extras2.js';

function makeItem({ url, title, contentHtml, author, date, image, audio, duration }, baseUrl) {
    // Un episodio de podcast a veces no tiene página propia: vale su audio.
    // Los buscadores de noticias enlazan a través de su contador de clics.
    const link = unwrapRedirect(resolveUrl(url || audio, baseUrl));
    if (!link || !/^https?:/i.test(link)) return null;
    const text = htmlToText(contentHtml);
    const audioUrl = audio ? resolveUrl(audio, baseUrl) : '';
    return {
        // 'audio' = episodio de podcast, 'video' = vídeo, '' = artículo.
        kind: /^https:/i.test(audioUrl) ? 'audio' : VIDEO_HOST.test(new URL(link).hostname) ? 'video' : '',
        audio: /^https:/i.test(audioUrl) ? audioUrl : '',
        duration: durationMinutes(duration),
        url: link,
        title: htmlToText(title) || text.slice(0, 90) || link,
        contentHtml: contentHtml || '',
        summary: text.slice(0, 280),
        author: htmlToText(author),
        publishedAt: toMs(date),
        image: (image ? resolveUrl(image, baseUrl) : '') || firstImage(contentHtml),
    };
}

function mediaImage(el) {
    const group = kid(el, 'media:group') || el;
    const thumb = kid(group, 'media:thumbnail') || kid(el, 'media:thumbnail');
    if (thumb?.getAttribute('url')) return thumb.getAttribute('url');
    const media = kids(group, 'media:content').find((m) => /image/.test(m.getAttribute('type') || m.getAttribute('medium') || ''));
    if (media?.getAttribute('url')) return media.getAttribute('url');
    const enclosure = kids(el, 'enclosure').find((e) => /^image\//.test(e.getAttribute('type') || ''));
    return enclosure?.getAttribute('url') || '';
}

function parseRss(root, baseUrl) {
    const channel = kid(root, 'channel');
    const isRdf = root.tagName.toLowerCase() === 'rdf:rdf';
    const items = kids(isRdf ? root : channel, 'item');
    const siteUrl = resolveUrl(txt(channel, 'link'), baseUrl);
    const cover = kid(channel, 'itunes:image')?.getAttribute('href') || '';
    const logo = resolveUrl(cover || txt(kid(channel, 'image'), 'url'), baseUrl);
    return {
        title: htmlToText(txt(channel, 'title')),
        siteUrl,
        icon: /^https:/i.test(logo) ? logo : '',
        items: items
            .map((item) => {
                const guid = kid(item, 'guid');
                const sound = kids(item, 'enclosure').find((e) => /^audio\//.test(e.getAttribute('type') || ''));
                const guidIsLink = guid && guid.getAttribute('isPermaLink') !== 'false' && /^https?:/i.test(guid.textContent.trim());
                return makeItem(
                    {
                        url: txt(item, 'link') || (guidIsLink ? guid.textContent : ''),
                        title: txt(item, 'title'),
                        contentHtml: txt(item, 'content:encoded', 'description'),
                        // En las búsquedas de Bing Noticias, el medio que publica.
                        author: txt(item, 'dc:creator', 'author', 'news:source'),
                        date: txt(item, 'pubdate', 'dc:date'),
                        image: mediaImage(item) || kid(item, 'itunes:image')?.getAttribute('href') || (sound ? cover : ''),
                        audio: sound?.getAttribute('url') || '',
                        duration: txt(item, 'itunes:duration'),
                    },
                    siteUrl || baseUrl
                );
            })
            .filter(Boolean),
    };
}

function atomLink(el) {
    const links = kids(el, 'link');
    const pick = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate') || links[0];
    return pick?.getAttribute('href') || '';
}

function parseAtom(root, baseUrl) {
    const siteUrl = resolveUrl(atomLink(root), baseUrl);
    const logo = resolveUrl(txt(root, 'logo', 'icon'), baseUrl);
    return {
        title: htmlToText(txt(root, 'title')),
        siteUrl,
        icon: /^https:/i.test(logo) ? logo : '',
        items: kids(root, 'entry')
            .map((entry) => {
                const group = kid(entry, 'media:group');
                return makeItem(
                    {
                        url: atomLink(entry),
                        title: txt(entry, 'title'),
                        contentHtml: txt(entry, 'content', 'summary') || txt(group, 'media:description'),
                        author: txt(kid(entry, 'author'), 'name'),
                        date: txt(entry, 'published', 'updated'),
                        image: mediaImage(entry),
                    },
                    siteUrl || baseUrl
                );
            })
            .filter(Boolean),
    };
}

function parseJsonFeed(text, baseUrl) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || !/jsonfeed/i.test(data.version || '') || !Array.isArray(data.items)) return null;
    return {
        title: String(data.title || ''),
        siteUrl: resolveUrl(data.home_page_url, baseUrl),
        items: data.items
            .map((item) =>
                makeItem(
                    {
                        url: item.url || item.external_url,
                        title: item.title,
                        contentHtml: item.content_html || item.content_text || item.summary || '',
                        author: item.authors?.[0]?.name || item.author?.name,
                        date: item.date_published || item.date_modified,
                        image: item.image || item.banner_image,
                    },
                    baseUrl
                )
            )
            .filter(Boolean),
    };
}

export function parseFeed(raw, baseUrl) {
    const text = String(raw || '').replace(/^﻿/, '').trim();
    if (!text) return null;
    if (text.startsWith('{')) return parseJsonFeed(text, baseUrl);
    if (!text.startsWith('<')) return null;

    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const root = doc.documentElement;
    const name = root.tagName.toLowerCase();
    if (name === 'rss' || name === 'rdf:rdf') return parseRss(root, baseUrl);
    if (name === 'feed') return parseAtom(root, baseUrl);
    return null;
}
