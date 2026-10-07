// Traer lo guardado en otras apps de lectura: Pocket (CSV o HTML de su
// exportación) y Omnivore (JSON, suelto o dentro del .zip). Devuelven
// [{ url, title, tags, savedAt, read }].

const clean = (s) => String(s || '').trim();

// Una fila CSV, con comillas y comas dentro de los campos.
function csvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            if (row.some((f) => f !== '')) rows.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
    return rows;
}

// Pocket desde 2024: title,url,time_added,tags,status (tags separadas por |).
export function parsePocketCsv(text) {
    const [head, ...rows] = csvRows(String(text || ''));
    if (!head) return [];
    const col = (name) => head.findIndex((h) => clean(h).toLowerCase() === name);
    const [ti, ui, ai, gi, si] = ['title', 'url', 'time_added', 'tags', 'status'].map(col);
    if (ui < 0) return [];
    return rows
        .map((r) => ({
            url: clean(r[ui]),
            title: clean(r[ti]) || clean(r[ui]),
            tags: clean(r[gi]).split(/[|,]/).map(clean).filter(Boolean),
            savedAt: Number(r[ai]) * 1000 || Date.now(),
            read: clean(r[si]).toLowerCase() === 'archive',
        }))
        .filter((it) => /^https?:\/\//i.test(it.url));
}

// La exportación antigua de Pocket: ril_export.html, con «Unread» y «Read Archive».
export function parsePocketHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const out = [];
    let read = false;
    for (const el of doc.querySelectorAll('h1, a[href]')) {
        if (el.tagName === 'H1') {
            read = /archive|read/i.test(el.textContent) && !/unread/i.test(el.textContent);
            continue;
        }
        const url = clean(el.getAttribute('href'));
        if (!/^https?:\/\//i.test(url)) continue;
        out.push({
            url,
            title: clean(el.textContent) || url,
            tags: clean(el.getAttribute('tags')).split(',').map(clean).filter(Boolean),
            savedAt: Number(el.getAttribute('time_added')) * 1000 || Date.now(),
            read,
        });
    }
    return out;
}

// Omnivore: metadata_*.json, una lista de artículos con labels y estado.
export function parseOmnivore(json) {
    const list = Array.isArray(json) ? json : [];
    return list
        .map((a) => ({
            url: clean(a.url || a.originalArticleUrl),
            title: clean(a.title) || clean(a.url),
            tags: (a.labels || []).map((l) => clean(typeof l === 'string' ? l : l?.name)).filter(Boolean),
            savedAt: Date.parse(a.savedAt || a.createdAt || '') || Date.now(),
            read: a.state === 'Archived' || (a.readingProgressPercent || a.readingProgress || 0) >= 98,
        }))
        .filter((it) => /^https?:\/\//i.test(it.url));
}

// Saca los archivos de texto de un .zip. Solo entiende «sin comprimir» y
// «deflate», que es lo que usan estas exportaciones.
export async function unzipTexts(bytes, wanted = () => true) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0) throw new Error('No es un archivo .zip');
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const out = [];
    const decoder = new TextDecoder();
    for (let i = 0; i < count; i++) {
        const method = view.getUint16(at + 10, true);
        const size = view.getUint32(at + 20, true);
        const nameLen = view.getUint16(at + 28, true);
        const extraLen = view.getUint16(at + 30, true);
        const commentLen = view.getUint16(at + 32, true);
        const local = view.getUint32(at + 42, true);
        const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
        at += 46 + nameLen + extraLen + commentLen;
        if (!wanted(name)) continue;
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const raw = bytes.subarray(start, start + size);
        let data = raw;
        if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        else if (method !== 0) continue;
        out.push({ name, text: decoder.decode(data) });
    }
    return out;
}

// Reconoce el archivo que el usuario eligió y devuelve lo que trae.
export async function readExport(name, bytes) {
    const lower = name.toLowerCase();
    const text = () => new TextDecoder().decode(bytes);
    if (lower.endsWith('.zip')) {
        const files = await unzipTexts(bytes, (n) => /\.(json|csv|html?)$/i.test(n));
        const found = [];
        for (const f of files) found.push(...(await readExport(f.name, new TextEncoder().encode(f.text))));
        return found;
    }
    if (lower.endsWith('.csv')) return parsePocketCsv(text());
    if (/\.html?$/.test(lower)) return parsePocketHtml(text());
    if (lower.endsWith('.json')) {
        try {
            return parseOmnivore(JSON.parse(text()));
        } catch {
            return [];
        }
    }
    return [];
}
