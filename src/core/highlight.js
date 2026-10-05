// Pinta los resaltados del usuario dentro del HTML de un artículo, y exporta
// todos los resaltados a Markdown.
//
// Un resaltado se guarda como el texto que el usuario seleccionó. Para volver a
// encontrarlo se comparan los textos sin espacios: la selección mete saltos de
// línea entre párrafos que en el HTML no existen.

const squash = (s) => String(s || '').replace(/\s+/g, '');

export function applyHighlights(html, highlights) {
    if (!html || !highlights?.length) return html || '';
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;

    for (const h of highlights) {
        const needle = squash(h.text);
        if (!needle) continue;

        // Mapa de cada carácter visible a su nodo de texto y posición.
        const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
        const map = [];
        let hay = '';
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.nodeValue;
            for (let i = 0; i < text.length; i++) {
                if (/\s/.test(text[i])) continue;
                hay += text[i];
                map.push({ node, offset: i });
            }
        }

        const start = hay.indexOf(needle);
        if (start < 0) continue;
        const first = map[start];
        const last = map[start + needle.length - 1];

        // Un <mark> por cada nodo de texto que toca la selección, de atrás hacia
        // delante para que partir un nodo no descoloque los anteriores.
        const nodes = [...new Set(map.slice(start, start + needle.length).map((m) => m.node))];
        for (const node of nodes.reverse()) {
            const from = node === first.node ? first.offset : 0;
            const to = node === last.node ? last.offset + 1 : node.nodeValue.length;
            const range = doc.createRange();
            range.setStart(node, from);
            range.setEnd(node, to);
            const mark = doc.createElement('mark');
            mark.setAttribute('data-h', h.id);
            if (h.note) mark.setAttribute('data-note', '1');
            range.surroundContents(mark);
        }
    }
    return root.innerHTML;
}

// items: [{ title, url, source, highlights: [{ text, note }] }]
export function highlightsToMarkdown(items) {
    const blocks = items
        .filter((it) => it.highlights?.length)
        .map((it) => {
            const quotes = it.highlights.map((h) => `> ${h.text}${h.note ? `\n\n${h.note}` : ''}`).join('\n\n');
            return `## [${it.title}](${it.url})\n\n${it.source ? `*${it.source}*\n\n` : ''}${quotes}`;
        });
    return `# Resaltados de Faro\n\n${blocks.join('\n\n---\n\n')}\n`;
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

// El formato de importación de Readwise: una fila por resaltado.
export function highlightsToReadwiseCsv(items) {
    const rows = [['Highlight', 'Title', 'Author', 'URL', 'Note', 'Location', 'Date']];
    for (const it of items) {
        (it.highlights || []).forEach((h, i) => {
            rows.push([h.text, it.title, it.source || '', it.url, h.note || '', i + 1, h.createdAt ? new Date(h.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '']);
        });
    }
    return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

const noteName = (title) =>
    String(title || 'Sin título')
        .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Sin título';

// Para Obsidian: una nota por artículo, con sus datos arriba (propiedades) y
// cada resaltado como cita. Devuelve [{ name, text }].
export function highlightsToObsidian(items) {
    const used = new Set();
    return items
        .filter((it) => it.highlights?.length)
        .map((it) => {
            let name = noteName(it.title);
            for (let n = 2; used.has(name.toLowerCase()); n++) name = `${noteName(it.title)} ${n}`;
            used.add(name.toLowerCase());
            const tags = ['faro', ...(it.tags || [])].map((t) => t.replace(/\s+/g, '-'));
            const head = ['---', `fuente: ${JSON.stringify(it.source || '')}`, `url: ${it.url}`, `etiquetas: [${tags.join(', ')}]`, '---'];
            const quotes = it.highlights.map((h) => `> ${h.text.replace(/\n+/g, ' ')}${h.note ? `\n\n${h.note}` : ''}`);
            return { name: `${name}.md`, text: `${head.join('\n')}\n\n# ${it.title}\n\n[Artículo original](${it.url})\n\n${quotes.join('\n\n')}\n` };
        });
}
