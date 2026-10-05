// Persistencia local en IndexedDB. Todo lo que Faro sabe vive aquí, en el
// dispositivo. El resto de la app no toca IndexedDB directamente.
//
// Versión 2: el texto de cada artículo (lo que más pesa) vive en `bodies`,
// aparte de sus datos. Así al arrancar solo se cargan en memoria los datos, y
// el texto se lee cuando se abre el artículo.

import { openDB } from 'idb';
import { firstImage, htmlToText } from '../core/text.js';

export const DB_NAME = 'faro';

// Separa un artículo de la versión 1 en datos y texto.
export function splitArticle(article) {
    const { contentHtml = '', fullHtml = '', ...meta } = article;
    return {
        meta: { ...meta, image: meta.image || firstImage(contentHtml), chars: meta.chars ?? htmlToText(contentHtml).length, full: Boolean(fullHtml) },
        body: { id: article.id, contentHtml, fullHtml },
    };
}

let dbPromise;
const open = () =>
    (dbPromise ||= openDB(DB_NAME, 2, {
        async upgrade(db, oldVersion, _newVersion, tx) {
            if (oldVersion < 1) {
                db.createObjectStore('sources', { keyPath: 'id' });
                db.createObjectStore('articles', { keyPath: 'id' });
                db.createObjectStore('meta');
            }
            if (oldVersion < 2) {
                db.createObjectStore('bodies', { keyPath: 'id' });
                if (oldVersion === 1) {
                    const articles = tx.objectStore('articles');
                    const bodies = tx.objectStore('bodies');
                    for (let cursor = await articles.openCursor(); cursor; cursor = await cursor.continue()) {
                        const { meta, body } = splitArticle(cursor.value);
                        bodies.put(body);
                        cursor.update(meta);
                    }
                }
            }
        },
    }));

export const db = {
    async all(store) {
        return (await open()).getAll(store);
    },
    async get(store, key) {
        return (await open()).get(store, key);
    },
    async put(store, value) {
        return (await open()).put(store, value);
    },
    async putMany(store, values) {
        if (!values.length) return;
        const tx = (await open()).transaction(store, 'readwrite');
        for (const value of values) tx.store.put(value);
        await tx.done;
    },
    async delMany(store, keys) {
        if (!keys.length) return;
        const tx = (await open()).transaction(store, 'readwrite');
        for (const key of keys) tx.store.delete(key);
        await tx.done;
    },
    // Recorre un almacén registro a registro, sin cargarlo entero en memoria.
    async scan(store, visit) {
        const tx = (await open()).transaction(store);
        for (let cursor = await tx.store.openCursor(); cursor; cursor = await cursor.continue()) visit(cursor.value);
    },
    async getMeta(key) {
        return (await open()).get('meta', key);
    },
    async setMeta(key, value) {
        return (await open()).put('meta', value, key);
    },
    // Solo para pruebas: cierra y olvida la conexión.
    async close() {
        if (dbPromise) (await dbPromise).close();
        dbPromise = null;
    },
};
