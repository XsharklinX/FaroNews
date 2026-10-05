// Un .zip mínimo, sin compresión: lo justo para juntar varias notas de texto
// en un solo archivo que se pueda compartir.

const TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

// files: [{ name, text }]. Devuelve los bytes del .zip.
export function makeZip(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const push = (list, bytes) => {
        list.push(bytes);
        return bytes.length;
    };
    const header = (size, fill) => {
        const view = new DataView(new ArrayBuffer(size));
        fill(view);
        return new Uint8Array(view.buffer);
    };

    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = encoder.encode(file.text);
        const crc = crc32(data);
        const common = (view, at) => {
            view.setUint16(at, 20, true); // versión necesaria
            view.setUint16(at + 2, 0x0800, true); // nombres en UTF-8
            view.setUint16(at + 4, 0, true); // sin compresión
            view.setUint16(at + 6, 0, true); // hora
            view.setUint16(at + 8, 0x21, true); // fecha: 1980-01-01
            view.setUint32(at + 10, crc, true);
            view.setUint32(at + 14, data.length, true);
            view.setUint32(at + 18, data.length, true);
            view.setUint16(at + 22, name.length, true);
            view.setUint16(at + 24, 0, true); // sin campo extra
        };
        const local = header(30, (view) => {
            view.setUint32(0, 0x04034b50, true);
            common(view, 4);
        });
        central.push(
            header(46, (view) => {
                view.setUint32(0, 0x02014b50, true);
                view.setUint16(4, 20, true); // versión que lo creó
                common(view, 6);
                view.setUint32(42, offset, true);
            }),
            name
        );
        offset += push(parts, local) + push(parts, name) + push(parts, data);
    }

    const centralSize = central.reduce((sum, b) => sum + b.length, 0);
    const end = header(22, (view) => {
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(8, files.length, true);
        view.setUint16(10, files.length, true);
        view.setUint32(12, centralSize, true);
        view.setUint32(16, offset, true);
    });
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((sum, b) => sum + b.length, 0));
    let at = 0;
    for (const bytes of all) {
        out.set(bytes, at);
        at += bytes.length;
    }
    return out;
}

export function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}
