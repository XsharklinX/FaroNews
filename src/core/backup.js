// Copia de seguridad: un solo archivo con todo lo que el usuario ha construido
// (fuentes, temas, ajustes, lo guardado y lo resaltado). Lo que Faro puede
// volver a descargar (artículos sin guardar) no se copia.
//
// Las fuentes y los artículos se identifican por su dirección, no por su id
// interno, para que la copia se pueda fusionar con lo que ya haya en el teléfono.

import { urlKey } from './url.js';

export const BACKUP_FORMAT = 'faro-backup';
export const BACKUP_VERSION = 1;

const SOURCE_FIELDS = ['title', 'siteUrl', 'icon', 'feedUrl', 'kind', 'folder', 'level', 'offline', 'priority', 'notify', 'color', 'perWeek', 'pausedUntil'];
const ARTICLE_FIELDS = ['url', 'title', 'summary', 'author', 'image', 'publishedAt', 'fetchedAt', 'minutes', 'kind', 'audio', 'duration', 'read', 'saved', 'highlights', 'pos', 'site', 'tags', 'imported', 'note'];
const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]));

// bodies: Map id -> { contentHtml, fullHtml } de los artículos que se guardan.
export function buildBackup({ sources, articles, settings, habits, bodies = new Map(), version = '', now = Date.now() }) {
    const feedOf = new Map(sources.map((s) => [s.id, s.feedUrl]));
    const keep = articles.filter((a) => a.saved || a.highlights?.length);
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        app: version,
        createdAt: new Date(now).toISOString(),
        settings,
        sources: sources.map((s) => pick(s, SOURCE_FIELDS)),
        // Los hábitos se guardan por dirección del feed: los ids cambian al restaurar.
        habits: Object.fromEntries(Object.entries(habits || {}).filter(([id]) => feedOf.has(id)).map(([id, h]) => [feedOf.get(id), h])),
        articles: keep.map((a) => ({
            ...pick(a, ARTICLE_FIELDS),
            feedUrl: feedOf.get(a.sourceId) || '',
            contentHtml: bodies.get(a.id)?.contentHtml || '',
            fullHtml: bodies.get(a.id)?.fullHtml || '',
        })),
    };
}

// Devuelve la copia validada o lanza un error con un motivo legible.
export function parseBackup(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('El archivo no es una copia de Faro.');
    }
    if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.sources) || !Array.isArray(data.articles)) {
        throw new Error('El archivo no es una copia de Faro.');
    }
    if (data.version > BACKUP_VERSION) throw new Error('La copia es de una versión más nueva de Faro. Actualiza la app para restaurarla.');
    return data;
}

const byName = (list) => new Map(list.map((t) => [t.name.toLowerCase(), t]));

// Calcula qué hay que añadir o cambiar para fusionar una copia con el estado
// actual. No borra nada: lo que ya está en el teléfono se conserva.
export function planRestore(backup, { sources, articles, settings }) {
    const haveFeed = new Map(sources.map((s) => [urlKey(s.feedUrl), s]));
    const newSources = backup.sources.filter((s) => s.feedUrl && !haveFeed.has(urlKey(s.feedUrl)));

    const topics = [...(settings.topics || [])];
    const known = byName(topics);
    for (const t of backup.settings?.topics || []) if (t?.name && !known.has(t.name.toLowerCase())) topics.push(t);
    const muted = [...new Set([...(settings.muted || []), ...(backup.settings?.muted || [])])];

    const haveArticle = new Map(articles.map((a) => [a.urlKey, a]));
    const newArticles = [];
    const mergeArticles = [];
    for (const a of backup.articles) {
        if (!a.url) continue;
        const existing = haveArticle.get(urlKey(a.url));
        if (!existing) {
            newArticles.push(a);
            continue;
        }
        const ids = new Set((existing.highlights || []).map((h) => h.id));
        const extra = (a.highlights || []).filter((h) => !ids.has(h.id));
        if ((a.saved && !existing.saved) || extra.length) {
            mergeArticles.push({ id: existing.id, saved: existing.saved || Boolean(a.saved), highlights: [...(existing.highlights || []), ...extra] });
        }
    }

    return {
        newSources,
        newArticles,
        mergeArticles,
        // Los ajustes de la copia mandan, salvo las listas, que se suman.
        settings: { ...settings, ...backup.settings, topics, muted, onboarded: true },
        habits: backup.habits || {},
    };
}
