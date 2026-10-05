// Importar y exportar la lista de fuentes en OPML, el formato que entienden
// todos los lectores de feeds.

const esc = (s) =>
    String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export function parseOpml(text) {
    const doc = new DOMParser().parseFromString(String(text || '').trim(), 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const out = [];
    const walk = (el, folder) => {
        for (const node of Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'outline')) {
            const feedUrl = node.getAttribute('xmlUrl');
            const title = node.getAttribute('title') || node.getAttribute('text') || '';
            if (feedUrl) {
                out.push({ title, feedUrl, siteUrl: node.getAttribute('htmlUrl') || '', folder });
            } else {
                walk(node, title || folder);
            }
        }
    };
    const body = doc.querySelector('body');
    if (body) walk(body, '');
    return out;
}

export function buildOpml(sources) {
    const folders = new Map();
    for (const s of sources) {
        const key = s.folder || '';
        if (!folders.has(key)) folders.set(key, []);
        folders.get(key).push(s);
    }
    const line = (s, pad) =>
        `${pad}<outline type="rss" text="${esc(s.title)}" title="${esc(s.title)}" xmlUrl="${esc(s.feedUrl)}" htmlUrl="${esc(s.siteUrl)}"/>`;
    const body = [...folders.entries()]
        .map(([folder, list]) =>
            folder
                ? `    <outline text="${esc(folder)}" title="${esc(folder)}">\n${list.map((s) => line(s, '      ')).join('\n')}\n    </outline>`
                : list.map((s) => line(s, '    ')).join('\n')
        )
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Fuentes de Faro</title></head>\n  <body>\n${body}\n  </body>\n</opml>\n`;
}
