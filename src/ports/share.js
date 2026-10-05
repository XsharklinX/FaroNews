// Compartir un enlace y sacar un archivo de la app, en dispositivo y en navegador.

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const TYPES = { zip: 'application/zip', csv: 'text/csv', json: 'application/json', md: 'text/markdown', txt: 'text/plain', pdf: 'application/pdf', opml: 'text/xml' };
const typeOf = (name) => TYPES[name.split('.').pop()] || 'text/plain';

export async function shareLink({ title, url }) {
    try {
        if (Capacitor.isNativePlatform()) await Share.share({ title, url });
        else if (navigator.share) await navigator.share({ title, url });
        else await navigator.clipboard.writeText(url);
    } catch {
        // El usuario cerró el diálogo de compartir: no hay nada que hacer.
    }
}

function download(name, blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function shareCached(name, options) {
    const file = await Filesystem.writeFile({ path: name, directory: Directory.Cache, ...options });
    try {
        await Share.share({ title: name, files: [file.uri] });
    } catch {
        // El usuario cerró el diálogo de compartir.
    }
}

export async function exportFile(name, text) {
    if (Capacitor.isNativePlatform()) return shareCached(name, { data: text, encoding: Encoding.UTF8 });
    return download(name, new Blob([text], { type: typeOf(name) }));
}

// Lo mismo para un archivo que no es texto (un PDF), dado en base64.
export async function exportBinary(name, base64) {
    if (Capacitor.isNativePlatform()) return shareCached(name, { data: base64 });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return download(name, new Blob([bytes], { type: typeOf(name) }));
}

// Manda un texto por donde el usuario elija: correo, mensajería, notas…
export async function shareText(title, text) {
    try {
        if (Capacitor.isNativePlatform()) await Share.share({ title, text });
        else if (navigator.share) await navigator.share({ title, text });
        else await navigator.clipboard.writeText(text);
    } catch {
        // El usuario cerró el diálogo de compartir.
    }
}

// Abre una dirección fuera de Faro: en el navegador o en la app que le toque.
export function openExternal(url) {
    // En Android, Capacitor manda al navegador cualquier dirección ajena a la app.
    if (Capacitor.isNativePlatform()) window.location.href = url;
    else window.open(url, '_blank', 'noopener');
}
