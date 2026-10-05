// Un artículo listo para salir de Faro: como texto llano o como bloques que
// luego se pintan en un PDF.

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figcaption';
const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

// Párrafos, títulos, citas y listas del artículo, en orden: [{ type, text }].
export function articleBlocks(html) {
    const doc = new DOMParser().parseFromString(`<div id="raiz">${html || ''}</div>`, 'text/html');
    const root = doc.getElementById('raiz');
    for (const el of root.querySelectorAll('script,style,figure > img,noscript')) el.remove();
    const blocks = [];
    for (const el of root.querySelectorAll(BLOCKS)) {
        // Una cita o un punto de lista que contiene párrafos: valen los párrafos.
        if (el.querySelector(BLOCKS)) continue;
        const text = el.tagName === 'PRE' ? el.textContent.trim() : clean(el.textContent);
        if (!text) continue;
        const tag = el.tagName.toLowerCase();
        const type = /^h\d$/.test(tag) ? 'h' : tag === 'li' ? 'li' : tag === 'pre' ? 'pre' : tag === 'figcaption' ? 'nota' : el.closest('blockquote') ? 'cita' : 'p';
        blocks.push({ type, text });
    }
    if (blocks.length) return blocks;
    // Texto sin marcas: cada línea es un párrafo.
    return root.textContent
        .split(/\n+/)
        .map(clean)
        .filter(Boolean)
        .map((text) => ({ type: 'p', text }));
}

// La línea de créditos: «Xataka · Ana Pérez · 4 de octubre de 2026».
export function articleCredit({ source, author, date }) {
    const day = date ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date)) : '';
    return [source, author, day].filter(Boolean).join(' · ');
}

export function articleToText({ title, source, author, date, url, blocks }) {
    const body = blocks.map((b) => (b.type === 'li' ? `• ${b.text}` : b.type === 'cita' ? `«${b.text}»` : b.text));
    return [title, articleCredit({ source, author, date }), url, '', ...body.flatMap((line) => [line, '']), 'Enviado desde Faro'].filter((line, i, all) => line || all[i - 1]).join('\n');
}

const SWAPS = [
    [/[‘’‚′]/g, "'"],
    [/[“”„″]/g, '"'],
    [/[–—−]/g, '-'],
    [/…/g, '...'],
    [/•/g, '·'],
    [/[    ]/g, ' '],
    [/€/g, 'EUR'],
];

// Las fuentes estándar de un PDF solo conocen Latin-1: se cambian los signos
// tipográficos por su equivalente y se quita lo que no existe (emojis, etc.).
export function toLatin1(text) {
    let out = String(text || '');
    for (const [from, to] of SWAPS) out = out.replace(from, to);
    return out.replace(/[^\n\x20-\x7E¡-ÿ]/g, '').replace(/ {2,}/g, ' ');
}

// Nombre de archivo a partir del titular.
export function fileSlug(title) {
    const slug = String(title || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '');
    return slug || 'articulo';
}
