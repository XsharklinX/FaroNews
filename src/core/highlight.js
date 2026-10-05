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
