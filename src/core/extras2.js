// Lógica de la segunda tanda de funciones, sin red ni disco: titulares cebo,
// país de cada fuente, la historia en el tiempo, canales de Telegram, páginas
// vigiladas, reglas automáticas, búsqueda en la web y ritmo de lectura.

import { htmlToText, norm } from './text.js';
import { titleTokens } from './today.js';

// --- Titulares cebo -----------------------------------------------------------

// Fórmulas que esconden la noticia para que se pinche. Se comparan sin tildes.
const BAIT = [
    /^(este|esta|estos|estas|el|la) (truco|app|aplicacion|gadget|detalle|error|habito|alimento|ajuste|metodo|secreto)\b/,
    /\bno (vas|podras|te vas) a creer\b/,
    /\b(lo|esto es lo) que (paso|ocurrio|sucedio|hizo) (despues|a continuacion)\b/,
    /\bte (sorprendera|dejara sin palabras|va a sorprender)\b/,
    /\bnadie (esperaba|sabia|se imaginaba|lo vio venir)\b/,
    /\b(la|esta es la) razon (por la que|de que|por la cual)\b/,
    /\bel motivo (es|por el que)\b/,
    /\bnunca (adivinaras|imaginarias)\b/,
    /\b(asi|esto) es (lo que|como)\b.*\b(cambia|cambiara|hace|pasa)\b/,
    /\b(estos|estas) son (los|las) \d+\b/,
    /\b(te contamos|te explicamos|te decimos) (por que|como|que|cual)\b/,
    /\b(lo que nadie te cuenta|lo que debes saber)\b/,
    /\b(you won't believe|here's why|this is why|what happened next|the reason why)\b/,
];

const firstSentence = (summary) => {
    const text = String(summary || '').replace(/\s+/g, ' ').trim();
    const end = text.search(/[.!?](\s|$)/);
    const sentence = (end > 0 ? text.slice(0, end + 1) : text).trim();
    return sentence.length >= 30 && sentence.length <= 200 ? sentence : '';
};

// Si el titular es cebo y la entradilla cuenta el dato, devuelve la primera
// frase de la entradilla para mostrar en su lugar. Si no, ''.
export function baitFix(title, summary) {
    const plain = norm(title);
    if (!BAIT.some((re) => re.test(plain))) return '';
    const sentence = firstSentence(summary);
    if (!sentence) return '';
    // Una entradilla que repite el titular no aporta nada.
    const words = [...titleTokens(sentence)];
    const own = titleTokens(title);
    const shared = words.filter((w) => own.has(w)).length;
    return shared >= Math.max(3, words.length * 0.7) ? '' : sentence;
}

// --- País de cada fuente -----------------------------------------------------

export const COUNTRY_NAMES = {
    es: 'España', mx: 'México', co: 'Colombia', ar: 'Argentina', cl: 'Chile', pe: 'Perú', ec: 'Ecuador', ve: 'Venezuela',
    uy: 'Uruguay', cr: 'Costa Rica', us: 'EE. UU.', do: 'Rep. Dominicana', pa: 'Panamá', gt: 'Guatemala', bo: 'Bolivia',
    py: 'Paraguay', pr: 'Puerto Rico', int: 'Internacional',
};
const TLD = /\.(es|mx|co|ar|cl|pe|ec|ve|uy|cr|do|pa|gt|bo|py|pr)$/;

// De dónde es un medio: lo que diga el catálogo y, si no, el dominio. Los
// medios en inglés sin país conocido cuentan como internacionales.
export function countryOf(source, catalog) {
    if (!source) return '';
    if (source.country) return source.country;
    const key = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
    const entry = catalog?.sources?.find((s) => key(s.feed) === key(source.feedUrl));
    if (entry?.country) return entry.country;
    try {
        const host = new URL(source.siteUrl || source.feedUrl).hostname.replace(/^www\./, '');
        const m = host.match(TLD) || host.match(/\.com\.(mx|co|ar|pe|ec|ve|uy|do|pa|gt|bo|py)$/);
        if (m) return m[1];
    } catch {
        // Dirección rara: sin país.
    }
    return entry?.lang === 'en' ? 'int' : '';
}

// Cuántas fuentes de cada país cuentan una historia: [{ id, name, count }].
export function countryMix(sources, catalog) {
    const counts = new Map();
    for (const source of sources) {
        const id = countryOf(source, catalog) || '?';
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ id, name: COUNTRY_NAMES[id] || 'Sin país conocido', count })).sort((a, b) => b.count - a.count);
}

// --- La historia en el tiempo ------------------------------------------------

const DAY = 86400000;

// Lo que tus fuentes publicaron antes sobre lo mismo que este artículo: se
// parecen si comparten al menos tres palabras con peso del titular, y más de
// un tercio de ellas. Como mucho uno por día, el más antiguo arriba.
export function storyTimeline(article, articles, { max = 6, days = 60 } = {}) {
    const mine = new Set(titleTokens(article.title));
    if (mine.size < 3) return [];
    // Tres palabras en común como mínimo, y más de un tercio de las del titular.
    const need = Math.max(3, Math.ceil(mine.size * 0.35));
    const when = (a) => a.publishedAt || a.fetchedAt || 0;
    const from = when(article) - days * DAY;
    const byDay = new Map();
    for (const other of articles) {
        if (other.id === article.id || other.dismissed) continue;
        const t = when(other);
        if (t >= when(article) || t < from) continue;
        const shared = [...titleTokens(other.title)].filter((w) => mine.has(w)).length;
        if (shared < need) continue;
        const day = Math.floor(t / DAY);
        const prev = byDay.get(day);
        if (!prev || shared > prev.shared) byDay.set(day, { article: other, shared });
    }
    return [...byDay.values()]
        .sort((a, b) => when(b.article) - when(a.article))
        .slice(0, max)
        .map((x) => x.article);
}

// --- Canales públicos de Telegram --------------------------------------------

// t.me/canal, t.me/s/canal o @canal → la página pública del canal.
export function telegramFeedUrl(input) {
    const m = String(input || '').trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/(?:s\/)?([A-Za-z][\w]{3,})\/?(?:\d+)?(?:[?#].*)?$/);
    return m ? `https://t.me/s/${m[1]}` : '';
}

// Lee la página pública de un canal (t.me/s/canal) como si fuera un feed.
export function parseTelegram(html, url) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const posts = [...doc.querySelectorAll('.tgme_widget_message[data-post]')];
    if (!posts.length) return null;
    const title = doc.querySelector('.tgme_channel_info_header_title')?.textContent.trim() || doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const icon = doc.querySelector('.tgme_page_photo_image img, .tgme_channel_info_header img')?.getAttribute('src') || '';
    const items = posts
        .map((post) => {
            const textEl = post.querySelector('.tgme_widget_message_text');
            const contentHtml = textEl ? textEl.innerHTML : '';
            const text = htmlToText(contentHtml);
            const photo = post.querySelector('.tgme_widget_message_photo_wrap')?.getAttribute('style') || '';
            const image = (photo.match(/url\(['"]?([^'")]+)['"]?\)/) || [])[1] || '';
            if (!text && !image) return null;
            const firstLine = text.split(/\n|(?<=[.!?])\s/)[0].trim();
            return {
                kind: '',
                audio: '',
                duration: null,
                url: `https://t.me/${post.getAttribute('data-post')}`,
                title: (firstLine.length > 120 ? `${firstLine.slice(0, 117).replace(/\s+\S*$/, '')}…` : firstLine) || 'Foto',
                contentHtml: `${image ? `<p><img src="${image}"></p>` : ''}${contentHtml ? `<p>${contentHtml}</p>` : ''}`,
                summary: text.slice(0, 280),
                author: '',
                publishedAt: Date.parse(post.querySelector('time[datetime]')?.getAttribute('datetime') || '') || null,
                image,
            };
        })
        .filter(Boolean)
        .reverse();
    return { title, siteUrl: url.replace('/s/', '/'), icon, items };
}

// --- Buscar un tema en toda la web --------------------------------------------

// Bing Noticias ofrece la búsqueda como RSS (para uso personal en un lector).
export const webSearchUrl = (query) => `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=es&cc=es`;
export const isWebSearch = (url) => /^https:\/\/www\.bing\.com\/news\/search/.test(String(url || ''));

// Los enlaces de Bing pasan por su contador de clics: se saca la dirección real.
export function unwrapRedirect(link) {
    try {
        const url = new URL(link);
        if (/(^|\.)bing\.com$/.test(url.hostname) && url.pathname.includes('apiclick')) {
            const real = url.searchParams.get('url');
            if (real && /^https?:/i.test(real)) return real;
        }
    } catch {
        // No es una dirección: se deja tal cual.
    }
    return link;
}

// --- Páginas vigiladas -------------------------------------------------------

// El texto visible de una página, línea a línea, sin menús, scripts ni pies.
export function pageLines(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    for (const el of doc.querySelectorAll('script,style,noscript,svg,iframe,nav,header,footer,form,[aria-hidden="true"]')) el.remove();
    const root = doc.querySelector('main, article, [role="main"]') || doc.body;
    if (!root) return [];
    const lines = [];
    for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,dt,dd,blockquote,figcaption,a,span,div')) {
        // Solo los elementos que tienen texto propio, para no repetir el de sus hijos.
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
        if (own.length >= 3) lines.push(own);
    }
    return [...new Set(lines)].slice(0, 800);
}

// Huella corta del texto, para saber si cambió sin guardar dos copias.
export function textHash(lines) {
    let h = 2166136261;
    for (const ch of lines.join('\n')) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h.toString(36);
}

// Qué líneas aparecieron y cuáles se fueron.
export function diffLines(before, after) {
    const old = new Set(before);
    const now = new Set(after);
    return { added: after.filter((l) => !old.has(l)).slice(0, 12), removed: before.filter((l) => !now.has(l)).slice(0, 12) };
}

// --- Reglas automáticas ------------------------------------------------------

export const RULE_ACTIONS = [
    { id: 'guardar', label: 'Guardar' },
    { id: 'etiquetar', label: 'Guardar con etiqueta' },
    { id: 'leida', label: 'Marcar como leída' },
    { id: 'descartar', label: 'Descartar' },
];

// rule: { sourceId?, word?, kind?: ''|'leer'|'ver'|'escuchar', action, tag? }
export function ruleMatches(rule, article) {
    if (rule.sourceId && article.sourceId !== rule.sourceId) return false;
    if (rule.kind === 'leer' && article.kind) return false;
    if (rule.kind === 'ver' && article.kind !== 'video') return false;
    if (rule.kind === 'escuchar' && article.kind !== 'audio') return false;
    if (rule.word) {
        const hay = norm(`${article.title} ${article.summary || ''}`);
        if (!norm(rule.word).split(/\s*,\s*/).filter(Boolean).some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay))) return false;
    }
    return Boolean(rule.sourceId || rule.word || rule.kind);
}

// Lo que las reglas cambian en un artículo, o null si ninguna aplica.
export function applyRules(rules, article) {
    let patch = null;
    for (const rule of rules || []) {
        if (rule.off || !ruleMatches(rule, article)) continue;
        patch ||= {};
        if (rule.action === 'guardar' || rule.action === 'etiquetar') patch.saved = true;
        if (rule.action === 'etiquetar' && rule.tag) patch.tags = [...new Set([...(patch.tags || article.tags || []), rule.tag])];
        if (rule.action === 'leida') patch.read = true;
        if (rule.action === 'descartar') patch.dismissed = true;
    }
    return patch;
}

// --- Ritmo de lectura --------------------------------------------------------

const MIN_SAMPLES = 5;

// Cuánto tarda el usuario respecto a la media (1 = como la media, 0,5 = el
// doble de rápido), con la mediana de sus últimas lecturas completas.
export function paceFactor(samples) {
    const list = (samples || []).filter((x) => x > 0.15 && x < 4).slice(-40);
    if (list.length < MIN_SAMPLES) return 1;
    const sorted = [...list].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    return Math.min(2.5, Math.max(0.4, mid));
}

export const myMinutes = (minutes, factor = 1) => Math.max(1, Math.round((minutes || 1) * factor));
