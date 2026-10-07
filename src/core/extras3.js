// Lógica de la tercera tanda, sin red ni disco: lo más contado, el mundo por
// país, vídeos de YouTube, comentarios de Hacker News, el buscador global y el
// libro electrónico.

import { countryOf, COUNTRY_NAMES } from './extras2.js';
import { htmlToText, matchesQuery } from './text.js';
import { clusterArticles } from './today.js';

const DAY = 86400000;
const when = (a) => a.publishedAt || a.fetchedAt || 0;

// --- Lo más contado hoy -------------------------------------------------------

// Historias que más fuentes distintas han contado en las últimas 24 horas.
// [{ ids, lead, sources: n, countries: n }], de más a menos.
export function mostCovered({ articles, sources, catalog, now = Date.now(), limit = 20 }) {
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const recent = articles.filter((a) => srcById.has(a.sourceId) && !a.dismissed && now - when(a) <= DAY && srcById.get(a.sourceId).kind !== 'web');
    return clusterArticles(recent)
        .map((members) => {
            const bySource = new Map();
            for (const m of members) if (!bySource.has(m.sourceId)) bySource.set(m.sourceId, m);
            const picked = [...bySource.values()];
            const countries = new Set(picked.map((m) => countryOf(srcById.get(m.sourceId), catalog)).filter(Boolean));
            // El titular que abre es el del artículo más reciente con foto, si hay.
            const lead = [...picked].sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)) || when(b) - when(a))[0];
            return { ids: picked.map((m) => m.id), lead, sources: picked.length, countries: countries.size };
        })
        .filter((c) => c.sources >= 2)
        .sort((a, b) => b.sources - a.sources || b.countries - a.countries || when(b.lead) - when(a.lead))
        .slice(0, limit);
}

// --- El mundo hoy -------------------------------------------------------------

// Cuántas noticias de las últimas 24 horas hay de medios de cada país.
export function worldToday({ articles, sources, catalog, now = Date.now() }) {
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const byCountry = new Map();
    for (const a of articles) {
        const source = srcById.get(a.sourceId);
        if (!source || a.dismissed || now - when(a) > DAY || source.kind === 'web') continue;
        const id = countryOf(source, catalog);
        if (!id) continue;
        if (!byCountry.has(id)) byCountry.set(id, []);
        byCountry.get(id).push(a);
    }
    return [...byCountry.entries()]
        .map(([id, list]) => ({ id, name: COUNTRY_NAMES[id] || id, count: list.length, articles: list.sort((a, b) => when(b) - when(a)) }))
        .sort((a, b) => b.count - a.count);
}

// --- YouTube dentro de Faro ---------------------------------------------------

export function youtubeId(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^(www|m|music)\./, '');
        if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || '';
        if (host !== 'youtube.com') return '';
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
        return m ? m[2] : '';
    } catch {
        return '';
    }
}

// Reproductor de YouTube en su modo de privacidad (no guarda cookies hasta reproducir).
export const youtubeEmbed = (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1`;

// --- Qué dice la gente --------------------------------------------------------

// De la búsqueda de Hacker News (Algolia) por la dirección del artículo, los
// hilos que la enlazan exactamente, el más comentado primero.
export function hnThreads(json, articleUrl) {
    const key = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    return (json?.hits || [])
        .filter((h) => key(h.url) === key(articleUrl) && h.num_comments > 0)
        .sort((a, b) => b.num_comments - a.num_comments)
        .map((h) => ({ where: 'Hacker News', id: h.objectID, title: h.title, comments: h.num_comments, points: h.points || 0, url: `https://news.ycombinator.com/item?id=${h.objectID}` }));
}

// Los primeros comentarios de un hilo de Hacker News, ya en texto.
export function hnComments(item, max = 3) {
    return (item?.children || [])
        .filter((c) => c.text && c.author)
        .slice(0, max)
        .map((c) => ({ author: c.author, text: htmlToText(c.text).slice(0, 400) }));
}

// Los hilos de Reddit que enlazan la dirección (respuesta de /api/info.json).
export function redditThreads(json) {
    return (json?.data?.children || [])
        .map((c) => c.data)
        .filter((d) => d && d.num_comments > 0)
        .sort((a, b) => b.num_comments - a.num_comments)
        .map((d) => ({ where: `r/${d.subreddit}`, id: d.id, title: d.title, comments: d.num_comments, points: d.score || 0, url: `https://www.reddit.com${d.permalink}` }));
}

// --- Un buscador para todo ----------------------------------------------------

const PERIODS = { semana: 7 * DAY, mes: 30 * DAY };

// Busca en artículos (titular, entradilla, etiquetas y nota), resaltados,
// sitios seguidos y catálogo. `inText`: ids cuyo texto completo coincide.
export function searchAll({ query, articles, sources, catalog, inText = new Set(), period = '', savedOnly = false, now = Date.now() }) {
    const q = String(query || '').trim();
    if (q.length < 2) return { articles: [], highlights: [], sources: [], catalog: [] };
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const recent = (a) => !PERIODS[period] || now - when(a) <= PERIODS[period];
    const pool = articles.filter((a) => recent(a) && (!savedOnly || a.saved));
    const found = pool
        .filter((a) => matchesQuery(q, a.title, a.titleEs, a.summary, a.note, srcById.get(a.sourceId)?.title, ...(a.tags || [])) || inText.has(a.id))
        .sort((a, b) => Number(Boolean(b.saved)) - Number(Boolean(a.saved)) || when(b) - when(a));
    const highlights = pool.flatMap((a) => (a.highlights || []).filter((h) => matchesQuery(q, h.text, h.note)).map((h) => ({ ...h, article: a })));
    const followed = new Set(sources.map((s) => s.feedUrl));
    return {
        articles: found.slice(0, 60),
        highlights: highlights.slice(0, 20),
        sources: sources.filter((s) => matchesQuery(q, s.title, s.folder, s.siteUrl)).slice(0, 10),
        catalog: (catalog?.sources || []).filter((s) => !followed.has(s.feed) && matchesQuery(q, s.name, s.desc)).slice(0, 8),
    };
}

// --- Libro electrónico --------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// HTML de un artículo convertido a XHTML válido para el EPUB: sin scripts,
// sin estilos, sin iframes, y las fotos cambiadas por las que van dentro del
// libro (o quitadas si no están).
export function toXhtml(html, images = new Map()) {
    const doc = new DOMParser().parseFromString(`<div id="raiz">${html || ''}</div>`, 'text/html');
    const root = doc.getElementById('raiz');
    for (const el of root.querySelectorAll('script,style,iframe,video,audio,form,input,button,svg,noscript,object,embed')) el.remove();
    for (const img of root.querySelectorAll('img')) {
        const inside = images.get(img.getAttribute('src'));
        if (inside) {
            for (const attr of [...img.attributes]) img.removeAttribute(attr.name);
            img.setAttribute('src', inside);
            img.setAttribute('alt', '');
        } else img.remove();
    }
    for (const el of root.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) if (!['href', 'src', 'alt'].includes(attr.name)) el.removeAttribute(attr.name);
    }
    return new XMLSerializer().serializeToString(root).replace(/^<div[^>]*>|<\/div>$/g, '').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}

// Los archivos de un EPUB 3: [{ name, text | bytes }], el mimetype primero.
// chapters: [{ title, credit, url, html }]; images: [{ name, bytes, type }].
export function buildEpub({ title, subtitle = '', chapters, images = [], id = `faro-${Date.now()}`, date = new Date() }) {
    const xhtml = (heading, body) =>
        `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es"><head><meta charset="utf-8"/><title>${esc(heading)}</title><link rel="stylesheet" href="estilo.css"/></head><body>${body}</body></html>`;
    const files = [
        { name: 'mimetype', text: 'application/epub+zip' },
        { name: 'META-INF/container.xml', text: '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/libro.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
        { name: 'OEBPS/estilo.css', text: 'body{font-family:serif;line-height:1.5;margin:0 4%}h1{font-size:1.5em;line-height:1.2;margin:0 0 .3em}.credito{font-family:sans-serif;font-size:.8em;color:#555;margin:0 0 1.4em}img{max-width:100%;height:auto;display:block;margin:1em auto}.portada{text-align:center;margin-top:30%}.portada p{font-family:sans-serif;color:#555}' },
    ];
    const items = chapters.map((c, i) => ({ ...c, file: `cap${String(i + 1).padStart(3, '0')}.xhtml` }));
    files.push({ name: 'OEBPS/portada.xhtml', text: xhtml(title, `<div class="portada"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>`) });
    files.push({
        name: 'OEBPS/indice.xhtml',
        text: xhtml('Índice', `<nav epub:type="toc" id="toc"><h1>Índice</h1><ol>${items.map((c) => `<li><a href="${c.file}">${esc(c.title)}</a></li>`).join('')}</ol></nav>`),
    });
    for (const c of items) {
        files.push({ name: `OEBPS/${c.file}`, text: xhtml(c.title, `<h1>${esc(c.title)}</h1><p class="credito">${esc(c.credit)}${c.url ? ` · <a href="${esc(c.url)}">original</a>` : ''}</p>${c.html}`) });
    }
    for (const img of images) files.push({ name: `OEBPS/${img.name}`, bytes: img.bytes });
    const manifest = [
        '<item id="estilo" href="estilo.css" media-type="text/css"/>',
        '<item id="portada" href="portada.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="indice" href="indice.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        ...items.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`),
        ...images.map((img, i) => `<item id="img${i + 1}" href="${img.name}" media-type="${img.type}"/>`),
    ].join('');
    const spine = ['<itemref idref="portada"/>', '<itemref idref="indice"/>', ...items.map((c, i) => `<itemref idref="c${i + 1}"/>`)].join('');
    files.push({
        name: 'OEBPS/libro.opf',
        text: `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="es"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${esc(id)}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>es</dc:language><dc:creator>Faro</dc:creator><meta property="dcterms:modified">${date.toISOString().slice(0, 19)}Z</meta></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`,
    });
    return files;
}
