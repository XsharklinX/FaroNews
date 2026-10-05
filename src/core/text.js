// Utilidades de texto compartidas por el motor. Sin dependencias de la app.

export const norm = (s) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

export function htmlToText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function readMinutes(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
}

export function relTime(ms, now = Date.now()) {
    if (!ms) return '';
    const min = Math.floor((now - ms) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h`;
    return `${Math.round(h / 24)} d`;
}

// Lo mismo dicho entero, para que no se confunda con una duración: «hace 12 min».
export function agoLabel(ms, now = Date.now()) {
    const rel = relTime(ms, now);
    return !rel || rel === 'ahora' ? rel : `hace ${rel}`;
}

const ARTICLES = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'the']);

export function initials(title) {
    const words = String(title || '?').split(/[^\p{L}\p{N}]+/u).filter((w) => w && !ARTICLES.has(w.toLowerCase()));
    const pick = words.length ? words : [String(title || '?')];
    return (pick[0][0] + (pick[1]?.[0] || pick[0][1] || '')).toUpperCase();
}

// Colores de monograma: todos aguantan texto blanco encima.
const COLORS = ['#2F55D4', '#B4410E', '#0E7A5F', '#6B3FA0', '#A8326B', '#1F6F8B', '#7A5C00'];

export function colorFor(seed) {
    let h = 0;
    for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
}

// Primera imagen útil de un HTML. Salta los píxeles de seguimiento.
const TRACKER = /(feedburner|pixel|doubleclick|\/stats?\/|\.gif(\?|$))/i;

export function firstImage(html) {
    for (const m of String(html || '').matchAll(/<img[^>]+src=["'](https:\/\/[^"']+)["']/gi)) {
        const url = m[1].replace(/&amp;/g, '&');
        if (!TRACKER.test(url)) return url;
    }
    return '';
}

// Texto sin formato (la descripción de un vídeo, por ejemplo) convertido en
// párrafos, con sus direcciones como enlaces.
export function plainToHtml(text) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return String(text || '')
        .trim()
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p) => `<p>${esc(p.trim()).replace(/https?:\/\/[^\s<]*[^\s<.,;:!?)\]]/g, (url) => `<a href="${url.replace(/"/g, '&quot;')}">${url}</a>`).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

export const looksLikeHtml = (text) => /<[a-z][^>]*>/i.test(String(text || ''));

// Búsqueda sin tildes ni mayúsculas: todas las palabras deben aparecer.
export function matchesQuery(query, ...fields) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = norm(fields.join(' '));
    return words.every((w) => hay.includes(w));
}

export function dateKey(now = Date.now()) {
    const d = new Date(now);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
