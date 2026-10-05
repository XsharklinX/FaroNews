// Encuentra el logo de un sitio leyendo los iconos que declara su portada.
// Se prefiere el más grande: un favicon de 16 px ampliado se ve borroso.

import { resolveUrl } from './url.js';

function sizeOf(link) {
    const sizes = link.getAttribute('sizes') || '';
    const biggest = Math.max(0, ...[...sizes.matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1])));
    if (biggest) return biggest;
    // Sin tamaño declarado: los de Apple suelen ser de 180 px; el resto, pequeños.
    return /apple-touch-icon/i.test(link.getAttribute('rel') || '') ? 180 : 32;
}

// Devuelve las direcciones candidatas, de mejor a peor.
export function iconCandidates(html, baseUrl) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const links = Array.from(doc.querySelectorAll('link[rel][href]')).filter((l) => /(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/i.test(l.getAttribute('rel')));
    const found = links
        .map((l) => ({ url: resolveUrl(l.getAttribute('href'), baseUrl), size: sizeOf(l) }))
        .filter((c) => /^https:/i.test(c.url))
        .sort((a, b) => b.size - a.size)
        .map((c) => c.url);
    let fallback = '';
    let avatar = '';
    try {
        const url = new URL(baseUrl);
        if (url.protocol === 'https:') fallback = `${url.origin}/favicon.ico`;
        // En YouTube el icono de la página es el de YouTube; el del canal es su avatar.
        if (/(^|\.)youtube\.com$/.test(url.hostname)) avatar = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    } catch {
        // Dirección no válida: no hay respaldo.
    }
    return [...new Set([/^https:/i.test(avatar) ? avatar : '', ...found, fallback].filter(Boolean))];
}

// fetchText(url) -> { text, url }. Devuelve '' si no hay portada que leer.
export async function findIcon(siteUrl, fetchText) {
    if (!/^https?:/i.test(siteUrl || '')) return '';
    try {
        const page = await fetchText(siteUrl);
        return iconCandidates(page.text, page.url)[0] || '';
    } catch {
        return '';
    }
}
