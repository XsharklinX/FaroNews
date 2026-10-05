// Lógica de las imágenes guardadas para leer sin conexión. Aquí no hay red ni
// disco: solo decidir qué se guarda, qué se borra y cómo se sustituye.

export const IMAGE_BUDGET = 80 * 1024 * 1024;
export const MAX_IMAGE = 3 * 1024 * 1024;
const PER_ARTICLE = 8;

// Imágenes de un artículo que merece la pena guardar: la de portada y las
// primeras del texto.
export function imagesOf(article, html = '') {
    const urls = [article.image];
    for (const m of String(html).matchAll(/<img[^>]+src=["'](https:\/\/[^"']+)["']/gi)) urls.push(m[1].replace(/&amp;/g, '&'));
    return [...new Set(urls.filter((u) => /^https:/i.test(u || '')))].slice(0, PER_ARTICLE);
}

// entries: [{ url, size, at, pin }]. Devuelve las que hay que borrar (las más
// antiguas) para que el total quepa en el presupuesto. Las fijadas (`pin`:
// fotos de artículos guardados) no se tocan.
export function planEviction(entries, budget = IMAGE_BUDGET) {
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    const out = [];
    for (const entry of entries.filter((e) => !e.pin).sort((a, b) => a.at - b.at)) {
        if (total <= budget) break;
        out.push(entry);
        total -= entry.size;
    }
    return out;
}

// Cambia en un HTML cada imagen por su copia local, si la hay.
export function localizeImages(html, resolve) {
    return String(html || '').replace(/(<img[^>]+src=["'])(https:\/\/[^"']+)(["'])/gi, (all, pre, url, post) => {
        const local = resolve(url.replace(/&amp;/g, '&'));
        return local ? `${pre}${local}${post}` : all;
    });
}

// Nombre de archivo estable para una dirección.
export function imageFileName(url) {
    let h1 = 0x811c9dc5;
    let h2 = 5381;
    for (let i = 0; i < url.length; i++) {
        const c = url.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = (Math.imul(h2, 33) + c) >>> 0;
    }
    const ext = (url.split(/[?#]/)[0].match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1] || 'img').toLowerCase();
    return `${h1.toString(36)}${h2.toString(36)}.${ext}`;
}
