// Un grupo de artículos (la edición de Hoy, lo guardado) como libro EPUB para
// leer en un Kindle, un Kobo o cualquier lector de libros electrónicos.

import { articleCredit } from '../core/export.js';
import { buildEpub, toXhtml } from '../core/extras3.js';
import { cleanHtml } from '../core/readable.js';
import { looksLikeHtml, plainToHtml } from '../core/text.js';
import { bytesToBase64, makeZip } from '../core/zip.js';
import { db } from './db.js';
import { fetchDataUrl } from './http.js';

const MAX_IMAGES = 60;
const PER_ARTICLE = 4;

function dataUrlBytes(url) {
    const [head, data] = url.split(',');
    const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const raw = atob(data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { type, bytes };
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// items: [{ article, source }]. onProgress(hechos, total). Devuelve el EPUB en base64.
export async function makeEpub({ title, subtitle, items, onProgress = () => {} }) {
    const chapters = [];
    const images = [];
    let n = 0;
    for (const { article, source } of items) {
        const body = (await db.get('bodies', article.id)) || {};
        const raw = body.fullHtml || (looksLikeHtml(body.contentHtml) ? body.contentHtml : plainToHtml(body.contentHtml || article.summary || ''));
        let html = cleanHtml(raw, article.url);
        // La foto principal va delante si el texto no empieza ya con una.
        if (article.image && !/<img/i.test(html.slice(0, 1500))) html = `<p><img src="${article.image}"></p>${html}`;
        const map = new Map();
        const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, '&')).slice(0, PER_ARTICLE);
        for (const src of srcs) {
            if (images.length >= MAX_IMAGES || map.has(src)) continue;
            try {
                const { type, bytes } = dataUrlBytes(await fetchDataUrl(src));
                if (!EXT[type] || bytes.length < 500 || bytes.length > 3 * 1024 * 1024) continue;
                const name = `img${images.length + 1}.${EXT[type]}`;
                images.push({ name, bytes, type });
                map.set(src, name);
            } catch {
                // Foto caída: el capítulo va sin ella.
            }
        }
        chapters.push({ title: article.titleEs || article.title, credit: articleCredit({ source: source?.title, author: article.author, date: article.publishedAt }), url: article.url, html: toXhtml(html, map) });
        onProgress(++n, items.length);
    }
    return bytesToBase64(makeZip(buildEpub({ title, subtitle, chapters, images })));
}
