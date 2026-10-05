// Convierte los bytes de una respuesta en texto con la codificación correcta.
// Muchos sitios en español siguen publicando en ISO-8859-1: leerlos como UTF-8
// rompe las tildes y las eñes.

const ascii = (bytes) => String.fromCharCode(...bytes.subarray(0, 2048));

export function sniffCharset(bytes, contentType = '') {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

    // Lo que declara el propio documento manda sobre la cabecera HTTP: es más
    // habitual que el servidor mienta por configuración que el documento.
    const head = ascii(bytes);
    const declared =
        /<\?xml[^>]*\bencoding=["']([\w-]+)/i.exec(head)?.[1] ||
        /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
        /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
    return (declared || '').toLowerCase();
}

export function decodeBody(bytes, contentType = '') {
    const charset = sniffCharset(bytes, contentType);
    if (charset && charset !== 'utf-8' && charset !== 'utf8') {
        try {
            return new TextDecoder(charset).decode(bytes);
        } catch {
            // Nombre de codificación desconocido: se intenta como UTF-8.
        }
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    // Nadie declaró nada y como UTF-8 sale roto: casi seguro es Latin-1.
    if (!charset && text.includes('�')) return new TextDecoder('windows-1252').decode(bytes);
    return text;
}

export function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
