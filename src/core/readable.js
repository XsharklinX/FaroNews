// Texto limpio para el lector. Todo HTML que llega de un sitio es de terceros:
// pasa por DOMPurify antes de pintarse, sin excepción.

import DOMPurify from 'dompurify';
import { Readability } from '@mozilla/readability';
import { resolveUrl } from './url.js';

const FORBID_TAGS = ['style', 'script', 'iframe', 'form', 'input', 'button', 'select', 'textarea', 'object', 'embed', 'svg', 'link', 'meta'];
const FORBID_ATTR = ['style', 'class', 'id', 'width', 'height', 'srcset', 'sizes', 'loading'];

export function cleanHtml(html, baseUrl) {
    const safe = DOMPurify.sanitize(String(html || ''), { USE_PROFILES: { html: true }, FORBID_TAGS, FORBID_ATTR });
    const doc = new DOMParser().parseFromString(`<div>${safe}</div>`, 'text/html');
    const root = doc.body.firstElementChild;

    for (const a of root.querySelectorAll('a[href]')) {
        const href = resolveUrl(a.getAttribute('href'), baseUrl);
        if (/^https?:/i.test(href)) {
            a.setAttribute('href', href);
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        } else {
            a.removeAttribute('href');
        }
    }
    for (const img of root.querySelectorAll('img')) {
        const src = resolveUrl(img.getAttribute('src') || img.getAttribute('data-src'), baseUrl);
        if (/^https:/i.test(src)) {
            img.setAttribute('src', src);
            img.setAttribute('loading', 'lazy');
        } else {
            img.remove();
        }
    }
    return root.innerHTML;
}

// Extrae el cuerpo del artículo de la página completa. Devuelve null si
// Readability no encuentra nada que parezca un artículo.
export function extractReadable(pageHtml, url) {
    const doc = new DOMParser().parseFromString(String(pageHtml || ''), 'text/html');
    const base = doc.createElement('base');
    base.setAttribute('href', url);
    doc.head.prepend(base);
    const article = new Readability(doc).parse();
    if (!article?.content || (article.textContent || '').trim().length < 200) return null;
    return { html: cleanHtml(article.content, url), text: article.textContent.replace(/\s+/g, ' ').trim(), title: (article.title || '').trim() };
}
