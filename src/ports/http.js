// Única puerta de salida a la red. En el dispositivo va por CapacitorHttp
// (nativo: sin CORS). En el navegador de desarrollo, por el proxy de Vite.
//
// Siempre se piden bytes, no texto: la codificación la decide decodeBody.

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { base64ToBytes, decodeBody } from '../core/decode.js';

const TIMEOUT = 15000;
const HEADERS = {
    'User-Agent': 'Faro/0.1 (lector de feeds)',
    Accept: 'application/rss+xml, application/atom+xml, application/feed+json, text/html;q=0.9, */*;q=0.8',
};

const header = (headers, name) => {
    const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name);
    return key ? String(headers[key]) : '';
};

// Una imagen como «data:» para poder pintarla en un PDF sin que el navegador
// la bloquee por venir de otro sitio.
export async function fetchDataUrl(url) {
    if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: TIMEOUT, readTimeout: TIMEOUT });
        if (res.status >= 400 || typeof res.data !== 'string') throw new Error(`HTTP ${res.status}`);
        return `data:${header(res.headers, 'content-type').split(';')[0] || 'image/jpeg'};base64,${res.data}`;
    }
    const res = await fetch(`/__proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(TIMEOUT + 2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('x-content-type') || 'image/jpeg').split(';')[0];
    const blob = new Blob([await res.arrayBuffer()], { type });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export async function fetchText(url) {
    if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
            url,
            headers: HEADERS,
            responseType: 'arraybuffer',
            connectTimeout: TIMEOUT,
            readTimeout: TIMEOUT,
        });
        if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
        const bytes = typeof res.data === 'string' ? base64ToBytes(res.data) : new TextEncoder().encode(JSON.stringify(res.data));
        return { text: decodeBody(bytes, header(res.headers, 'content-type')), url: res.url || url };
    }

    const res = await fetch(`/__proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(TIMEOUT + 2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { text: decodeBody(bytes, res.headers.get('x-content-type') || ''), url: res.headers.get('x-final-url') || url };
}
