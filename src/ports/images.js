// Imágenes guardadas en el teléfono para leer sin conexión. Solo en Android:
// en el navegador de desarrollo no hay dónde guardarlas y se usan las de la red.

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { imageFileName, MAX_IMAGE, planEviction } from '../core/images.js';
import { db } from './db.js';

const native = Capacitor.isNativePlatform();
const DIR = 'img';
// url -> { url, path, uri, size, at, src }
const index = new Map();

const persist = () => db.setMeta('images', [...index.values()].map(({ src: _, ...entry }) => entry));

export async function initImages() {
    if (!native) return;
    for (const entry of (await db.getMeta('images')) || []) index.set(entry.url, { ...entry, src: Capacitor.convertFileSrc(entry.uri) });
}

// Dirección de la copia local de una imagen, o '' si no está guardada.
export const localSrc = (url) => index.get(url)?.src || '';
export const imagesStats = () => ({ count: index.size, bytes: [...index.values()].reduce((sum, e) => sum + e.size, 0) });

async function download(url) {
    const res = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 15000, readTimeout: 20000 });
    if (res.status >= 400 || typeof res.data !== 'string') throw new Error(`HTTP ${res.status}`);
    const size = Math.floor(res.data.length * 0.75);
    if (size < 200 || size > MAX_IMAGE) throw new Error('tamaño');
    const path = `${DIR}/${imageFileName(url)}`;
    const file = await Filesystem.writeFile({ path, data: res.data, directory: Directory.Data, recursive: true });
    index.set(url, { url, path, uri: file.uri, size, at: Date.now(), src: Capacitor.convertFileSrc(file.uri) });
}

// Guarda las imágenes que falten y borra las más antiguas si se pasa del
// espacio reservado. Devuelve cuántas guardó. Con `pin`, las deja fijadas: son
// de un artículo guardado y no se borran para hacer sitio.
export async function cacheImages(urls, { pin = false } = {}) {
    if (!native) return 0;
    const pending = [...new Set(urls)].filter((u) => !index.has(u));
    let saved = 0;
    for (const url of pending) {
        try {
            await download(url);
            saved++;
        } catch {
            // Imagen caída o demasiado grande: se queda la de la red.
        }
    }
    for (const entry of planEviction([...index.values()])) {
        index.delete(entry.url);
        await Filesystem.deleteFile({ path: entry.path, directory: Directory.Data }).catch(() => {});
    }
    let changed = saved > 0;
    if (pin) {
        for (const url of urls) {
            const entry = index.get(url);
            if (entry && !entry.pin) {
                entry.pin = true;
                changed = true;
            }
        }
    }
    if (changed) await persist();
    return saved;
}

// Suelta las imágenes de un artículo que deja de estar guardado.
export async function unpinImages(urls) {
    if (!native) return;
    let changed = false;
    for (const url of urls) {
        const entry = index.get(url);
        if (entry?.pin) {
            delete entry.pin;
            changed = true;
        }
    }
    if (changed) await persist();
}

export async function clearImages() {
    if (!native) return;
    index.clear();
    await Filesystem.rmdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {});
    await persist();
}
