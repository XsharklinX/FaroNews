// Estado de la app y todas las operaciones sobre él. Las pantallas leen con
// useStore() y cambian cosas solo a través de `actions`.
//
// En memoria solo están los datos de cada artículo. Su texto (lo que más pesa)
// vive en la base de datos y se lee al abrirlo: ver ports/db.js.

import { useSyncExternalStore } from 'react';
import { buildBackup, parseBackup, planRestore } from '../core/backup.js';
import { discoverFeed, perWeek, readSource } from '../core/discover.js';
import { isVideoUrl } from '../core/feedParser.js';
import { findIcon } from '../core/icon.js';
import { imagesOf } from '../core/images.js';
import { bodyMatches } from '../core/insights.js';
import { DEFAULT_NOTIFY } from '../core/notify.js';
import { buildOpml, parseOpml } from '../core/opml.js';
import { extractReadable } from '../core/readable.js';
import { colorFor, htmlToText, readMinutes } from '../core/text.js';
import { buildToday } from '../core/today.js';
import { urlKey } from '../core/url.js';
import { MIN_READABLE } from '../core/links.js';
import { CATALOG_EVERY, newerCatalog } from '../core/catalog.js';
import bundledCatalog from '../catalog/catalog.json';
import { CATALOG_URL } from '../config.js';
import { effective, liveMutes, pauseLabel } from '../core/pause.js';
import { applyRules, diffLines, isWebSearch, pageLines, paceFactor, textHash, webSearchUrl } from '../core/extras2.js';
import { looksEnglish } from '../core/lang.js';
import { canTranslate, markSeen, notifyHistory, setWidget, syncDaily, syncWatcher, takeNotificationActions, translateTexts } from '../ports/background.js';
import { db } from '../ports/db.js';
import { tap } from '../ports/haptics.js';
import { fetchText } from '../ports/http.js';
import { cacheImages, initImages, unpinImages } from '../ports/images.js';
import { loadSnapshot, saveExternalCopy, saveSnapshot } from '../ports/snapshot.js';

const DEFAULT_READER = { font: 'serif', margin: 'normal', theme: 'auto' };
const DEFAULT_SETTINGS = {
    keywords: [],
    topics: [],
    muted: [],
    fontScale: 1,
    notifyAlerts: false,
    dailyOn: false,
    dailyTime: '07:30',
    onboarded: false,
    theme: 'auto',
    reader: DEFAULT_READER,
    notify: DEFAULT_NOTIFY,
    // Qué se ve en las listas: '', 'leer', 'ver' o 'escuchar'.
    listKind: '',
    tutorialDone: false,
    // Copia semanal en Documentos/Faro.
    autoCopy: true,
    autoCopyAt: 0,
    inboxSeenAt: 0,
    // Reglas automáticas, escudo contra espóileres y páginas vigiladas.
    rules: [],
    spoilers: [],
    watches: [],
    // Cuánto tarda el usuario en leer respecto a lo estimado, lectura a lectura.
    pace: [],
    // Cambiar los titulares cebo por el dato, y traducir los titulares en inglés.
    baitFix: true,
    translateTitles: true,
};
const WEEK = 7 * 86400000;
const REPAIR_EVERY = 86400000;
const REFRESH_EVERY = 30 * 60000;
const KEEP_DAYS = 30;
const FAIL_LIMIT = 3;
const BROKEN = String.fromCharCode(0xfffd);
const TOAST_MS = 5000;
// Con el feed entero ya en la mano no hace falta ir a buscar la página.
const ENOUGH_TEXT = 2500;
// Por encima de esto (unas 20 al día) un sitio entra en «lo importante» al seguirlo.
export const BUSY_PER_WEEK = 150;
const LEVEL_DOWN = { todo: 'importante', importante: 'alertas', alertas: 'alertas' };
const LEVEL_NAME = { todo: 'Entra todo', importante: 'Solo lo importante', alertas: 'Solo tus temas' };

// Artículos sueltos, guardados con «Compartir a Faro»: no vienen de un sitio seguido.
export const LOOSE_ID = 'loose';
export function sourceOf(article, srcById) {
    if (!article) return null;
    if (article.sourceId === LOOSE_ID) return { id: LOOSE_ID, title: article.site || 'Compartido', siteUrl: article.siteUrl || '', color: colorFor(article.site || 'faro'), loose: true };
    return srcById.get(article.sourceId) || null;
}

let state = {
    ready: false,
    sources: [],
    articles: [],
    settings: DEFAULT_SETTINGS,
    habits: {},
    today: { date: '', edition: 1, items: [] },
    refreshing: false,
    lastRefresh: 0,
    toast: null,
    menu: null,
    compare: null,
    // Dirección recibida desde «Compartir» de otra app, pendiente de decidir.
    shared: null,
    // Lo que pide abrir un aviso que el usuario tocó: { id } o { list: true }.
    pendingOpen: null,
    // Historial de avisos enviados, para la bandeja.
    inbox: [],
    // Lo que se está silenciando por un tiempo: { kind: 'word' | 'source' | 'topic', key, label }.
    pausing: null,
    // El catálogo de sitios: el de dentro de la app o uno más nuevo traído de la red.
    catalog: bundledCatalog,
    // Artículo al que se le están poniendo etiquetas.
    tagging: null,
    // Titulares con posible espóiler que el usuario ya destapó en esta sesión.
    revealed: new Set(),
    // Cambia cuando se guardan imágenes nuevas, para que las listas se repinten.
    imgTick: 0,
};
const listeners = new Set();

function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn();
}
const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
export const useStore = () => useSyncExternalStore(subscribe, () => state);
export const getState = () => state;

const newId = () => crypto.randomUUID();

// Varias operaciones seguidas (importar una lista, por ejemplo) avisan al
// vigilante una sola vez.
let watcherTimer;
function queueWatcherSync() {
    clearTimeout(watcherTimer);
    // Lo que está en pausa tampoco avisa.
    watcherTimer = setTimeout(() => syncWatcher(effective(state)), 400);
}

// Copia automática de lo irrecuperable, fuera de la base de datos: ver
// ports/snapshot.js. Se agrupan los cambios seguidos en una sola escritura.
let snapshotTimer;
function queueSnapshot() {
    if (!state.ready) return;
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => actions.snapshotNow(), 3000);
}

function patchArticle(id, patch) {
    let updated;
    const articles = state.articles.map((a) => (a.id === id ? (updated = { ...a, ...patch }) : a));
    if (!updated) return null;
    set({ articles });
    db.put('articles', updated);
    if ('saved' in patch || 'highlights' in patch) queueSnapshot();
    if ('read' in patch || 'dismissed' in patch) queueWidget();
    return updated;
}

// Hoy se elige sin los sitios, temas y palabras que el usuario tiene en pausa.
const todayInput = () => ({ articles: state.articles, habits: state.habits, ...effective(state) });

function rebuildToday() {
    const today = buildToday({ prev: state.today, ...todayInput() });
    set({ today });
    db.setMeta('today', today);
    queueWidget();
}

// Widget de la pantalla de inicio: lo que queda de la edición y sus primeros
// titulares, lo no leído delante. Se avisa a Android con un poco de retraso
// para juntar los cambios seguidos.
let widgetTimer;
function queueWidget() {
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(() => {
        const byId = new Map(state.articles.map((a) => [a.id, a]));
        const items = state.today.items.map((it) => byId.get(it.id)).filter(Boolean);
        const pending = items.filter((a) => !a.read);
        const minutes = pending.reduce((sum, a) => sum + (a.minutes || 0), 0);
        setWidget({
            status: !items.length ? '' : pending.length ? `${items.length - pending.length} de ${items.length} · ${minutes} min` : 'Estás al día',
            empty: !state.sources.length ? 'Abre Faro y elige los sitios que quieres seguir.' : items.length ? 'Leíste toda la edición. Lo demás puede esperar.' : 'No hay historias nuevas por ahora.',
            items: pending.slice(0, 3).map((a) => ({ title: a.title, read: false })),
        });
    }, 600);
}

// Aviso breve en la parte baja, con una acción opcional para deshacer.
let toastTimer;
function showToast(text, undo) {
    clearTimeout(toastTimer);
    set({ toast: { id: newId(), text, undo } });
    toastTimer = setTimeout(() => set({ toast: null }), TOAST_MS);
}

// Lo que el usuario hace con cada fuente: abrir (o), guardar (s), descartar (d).
function habit(sourceId, kind, amount = 1) {
    if (sourceId === LOOSE_ID) return;
    const prev = state.habits[sourceId] || { o: 0, s: 0, d: 0 };
    const habits = { ...state.habits, [sourceId]: { ...prev, [kind]: Math.max(0, prev[kind] + amount) } };
    set({ habits });
    db.setMeta('habits', habits);
    queueSnapshot();
}

function makeSource({ title, siteUrl = '', icon, feedUrl, kind = '', folder = '', level = 'todo', offline = true, priority = false, notify = false, color, perWeek: pace = null, lastOkAt = 0, country = '' }) {
    return {
        id: newId(),
        title,
        // País del medio, si viene del catálogo. Si no, se deduce del dominio.
        country,
        siteUrl,
        // Logo del sitio. Sin definir = todavía no se ha buscado.
        icon,
        feedUrl,
        // 'page' = sitio sin feed: se leen los titulares de su portada.
        kind,
        folder: (folder || '').trim(),
        level,
        offline,
        priority,
        // Avisar de todo lo que publique, con la app cerrada.
        notify,
        color: color || colorFor(feedUrl),
        createdAt: Date.now(),
        lastOkAt,
        lastError: '',
        failCount: 0,
        perWeek: pace,
    };
}

// Datos y texto de un artículo nuevo a partir de un item leído de la fuente.
function makeArticle(sourceId, item, now, extra = {}) {
    const text = htmlToText(item.contentHtml);
    const id = newId();
    return {
        meta: {
            id,
            sourceId,
            url: item.url,
            urlKey: urlKey(item.url),
            title: item.title,
            summary: item.summary,
            author: item.author,
            image: item.image,
            // 'audio' = episodio de podcast, 'video' = vídeo, '' = artículo.
            kind: item.kind || '',
            audio: item.audio || '',
            duration: item.duration ?? null,
            publishedAt: item.publishedAt,
            fetchedAt: now,
            minutes: item.duration || readMinutes(text),
            chars: text.length,
            full: Boolean(item.fullHtml),
            read: false,
            saved: false,
            dismissed: false,
            ...extra,
        },
        body: { id, contentHtml: item.contentHtml || '', fullHtml: item.fullHtml || '' },
    };
}

// Convierte los items de una fuente en artículos nuevos, saltando los que ya hay.
function ingest(source, items) {
    const known = new Map(state.articles.map((a) => [a.urlKey, a]));
    const now = Date.now();
    const added = [];
    for (const item of items) {
        const key = urlKey(item.url);
        const existing = known.get(key);
        if (existing) {
            // Artículo guardado con la codificación rota por una versión anterior.
            if (existing.title?.includes(BROKEN) && !item.title.includes(BROKEN)) {
                patchArticle(existing.id, { title: item.title, summary: item.summary });
                db.get('bodies', existing.id).then((body) => db.put('bodies', { ...body, id: existing.id, contentHtml: item.contentHtml }));
            }
            continue;
        }
        const article = makeArticle(source.id, item, now);
        // Reglas automáticas del usuario: guardar, etiquetar, dar por leída o descartar.
        const ruled = applyRules(state.settings.rules, article.meta);
        if (ruled) Object.assign(article.meta, ruled, ruled.read ? { readAt: now } : {});
        known.set(key, article.meta);
        added.push(article);
    }
    if (added.length) {
        set({ articles: [...state.articles, ...added.map((a) => a.meta)] });
        db.putMany('articles', added.map((a) => a.meta));
        db.putMany('bodies', added.map((a) => a.body));
    }
    return added;
}

function saveSource(source) {
    const exists = state.sources.some((s) => s.id === source.id);
    set({ sources: exists ? state.sources.map((s) => (s.id === source.id ? source : s)) : [...state.sources, source] });
    db.put('sources', source);
    queueWatcherSync();
    queueSnapshot();
}

async function refreshOne(source) {
    try {
        const res = await fetchText(source.feedUrl);
        const feed = readSource(res.text, res.url, source.kind);
        if (!feed) throw new Error(source.kind === 'page' ? 'La página ya no muestra titulares' : 'El feed dejó de ser válido');
        ingest(source, feed.items);
        markSeen(source.feedUrl, feed.items.map((i) => i.url));
        const current = state.sources.find((s) => s.id === source.id);
        if (current) {
            const siteUrl = current.siteUrl || feed.siteUrl || '';
            // El logo se busca una sola vez, la primera que se conoce la web del sitio.
            // Un canal de YouTube seguido antes de la 0.3.1 se quedó con el icono de YouTube.
            const wrong = /youtube\.com/.test(siteUrl) && !current.iconFixed && !/yt3|ggpht|googleusercontent|catalog-icons/.test(current.icon || '');
            const icon = current.icon === undefined || wrong ? feed.icon || (siteUrl ? await findIcon(siteUrl, fetchText) : '') : current.icon;
            saveSource({ ...current, siteUrl, icon, iconFixed: true, failCount: 0, lastError: '', lastOkAt: Date.now(), perWeek: perWeek(feed.items) ?? current.perWeek });
        }
    } catch (err) {
        const current = state.sources.find((s) => s.id === source.id);
        if (!current) return;
        const failing = { ...current, failCount: (current.failCount || 0) + 1, lastError: String(err?.message || err) };
        saveSource(failing);
        if (failing.failCount >= FAIL_LIMIT) await repair(failing);
    }
}

// Un sitio que deja de responder suele haber cambiado la dirección de su feed.
// Se vuelve a buscar desde su portada, como mucho una vez al día.
async function repair(source) {
    if (!source.siteUrl || Date.now() - (source.repairAt || 0) < REPAIR_EVERY) return;
    let found = null;
    try {
        found = await discoverFeed(source.siteUrl, fetchText);
    } catch {
        // El sitio sigue caído o ya no publica nada que se pueda seguir.
    }
    const current = state.sources.find((s) => s.id === source.id);
    if (!current) return;
    const moved = found && found.feed.items.length > 0 && urlKey(found.feedUrl) !== urlKey(current.feedUrl) && !state.sources.some((s) => urlKey(s.feedUrl) === urlKey(found.feedUrl));
    if (!moved) {
        saveSource({ ...current, repairAt: Date.now() });
        return;
    }
    const fixed = { ...current, feedUrl: found.feedUrl, kind: found.kind || '', failCount: 0, lastError: '', lastOkAt: Date.now(), repairAt: Date.now() };
    saveSource(fixed);
    ingest(fixed, found.feed.items);
    markSeen(fixed.feedUrl, found.feed.items.map((i) => i.url));
    showToast(`${current.title} cambió de dirección y Faro la encontró`);
}

async function pool(items, size, worker) {
    const queue = [...items];
    await Promise.all(
        Array.from({ length: Math.min(size, queue.length) }, async () => {
            while (queue.length) await worker(queue.shift());
        })
    );
}

function dropArticles(ids) {
    if (!ids.length) return;
    const gone = new Set(ids);
    set({ articles: state.articles.filter((a) => !gone.has(a.id)) });
    db.delMany('articles', ids);
    db.delMany('bodies', ids);
}

function prune() {
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    const inToday = new Set(state.today.items.flatMap((it) => [it.id, ...(it.also || [])]));
    const old = state.articles.filter((a) => !a.saved && !a.highlights?.length && !inToday.has(a.id) && (a.publishedAt || a.fetchedAt) < cutoff && a.fetchedAt < cutoff);
    dropArticles(old.map((a) => a.id));
}

// Deja lo que entra en «Hoy» listo para leer sin conexión: el texto completo y
// las imágenes de cada historia.
async function downloadToday() {
    const offline = new Set(state.sources.filter((s) => s.offline).map((s) => s.id));
    const ids = new Set(state.today.items.map((it) => it.id));
    const wanted = state.articles.filter((a) => ids.has(a.id) && offline.has(a.sourceId));
    await pool(wanted.filter((a) => !a.full && !a.fullTried), 3, (a) => actions.ensureFullText(a.id));

    const urls = [];
    for (const article of wanted) {
        const body = await db.get('bodies', article.id);
        urls.push(...imagesOf(article, body?.fullHtml || body?.contentHtml));
    }
    if (await cacheImages(urls)) set({ imgTick: state.imgTick + 1 });
}

// Archivo: lo guardado se conserva entero en el teléfono (texto y fotos),
// aunque el sitio lo borre después.
async function archive(id) {
    const article = state.articles.find((a) => a.id === id);
    if (!article?.saved || article.kind) return;
    await actions.ensureFullText(id);
    const body = await db.get('bodies', id);
    const kept = Boolean(body?.fullHtml || body?.contentHtml);
    if (await cacheImages(imagesOf(article, body?.fullHtml || body?.contentHtml), { pin: true })) set({ imgTick: state.imgTick + 1 });
    if (kept && state.articles.some((a) => a.id === id && a.saved)) patchArticle(id, { archived: true });
}

// Catálogo: el guardado de una consulta anterior y, cada semana, el publicado.
async function loadCatalog() {
    let catalog = newerCatalog(bundledCatalog, await db.getMeta('catalog'));
    if (catalog !== bundledCatalog) set({ catalog });
    if (!CATALOG_URL || Date.now() - ((await db.getMeta('catalogAt')) || 0) < CATALOG_EVERY) return;
    try {
        const remote = JSON.parse((await fetchText(CATALOG_URL)).text);
        db.setMeta('catalogAt', Date.now());
        const next = newerCatalog(catalog, remote);
        if (next !== catalog) {
            catalog = next;
            set({ catalog });
            db.setMeta('catalog', catalog);
        }
    } catch {
        // Sin red o archivo ilegible: se sigue con el que hay.
    }
}

// Titulares en inglés traducidos para las listas. Solo en el teléfono, solo
// con wifi la primera vez (el idioma pesa unos 30 MB) y de 30 en 30.
let translating = false;
async function translateTitles() {
    if (!canTranslate || translating || state.settings.translateTitles === false) return;
    const pending = state.articles
        .filter((a) => !a.titleEs && !a.titleChecked && !a.dismissed && !a.kind)
        .sort((a, b) => (b.publishedAt || b.fetchedAt) - (a.publishedAt || a.fetchedAt))
        .slice(0, 60);
    const english = pending.filter((a) => looksEnglish(`${a.title}. ${a.summary || ''}`)).slice(0, 30);
    const notEnglish = pending.filter((a) => !english.includes(a));
    translating = true;
    try {
        const out = english.length ? await translateTexts(english.map((a) => a.title), { wifiOnly: true }) : [];
        const byId = new Map(english.map((a, i) => [a.id, out[i]]));
        const skip = new Set(notEnglish.map((a) => a.id));
        const changed = [];
        set({
            articles: state.articles.map((a) => {
                if (byId.get(a.id)) return (changed.push({ ...a, titleEs: byId.get(a.id), titleChecked: true }), changed.at(-1));
                if (skip.has(a.id)) return (changed.push({ ...a, titleChecked: true }), changed.at(-1));
                return a;
            }),
        });
        db.putMany('articles', changed);
    } catch {
        // Sin wifi o sin el idioma descargado: se intenta en la próxima actualización.
    } finally {
        translating = false;
    }
}

// Páginas vigiladas: se compara su texto con el de la última vez. Las líneas
// se guardan aparte (pueden ser cientos); en ajustes queda solo el resumen.
async function checkWatch(watch) {
    try {
        const res = await fetchText(watch.url);
        const lines = pageLines(res.text);
        if (!lines.length) throw new Error('La página no tiene texto que comparar');
        const hash = textHash(lines);
        const before = (await db.getMeta(`watch:${watch.id}`)) || [];
        const changed = Boolean(watch.hash) && hash !== watch.hash;
        if (changed || !watch.hash) await db.setMeta(`watch:${watch.id}`, lines);
        return { ...watch, hash, checkedAt: Date.now(), error: '', ...(changed ? { changedAt: Date.now(), diff: diffLines(before, lines), seen: false } : {}) };
    } catch (err) {
        return { ...watch, checkedAt: Date.now(), error: String(err?.message || err) };
    }
}
async function checkWatches() {
    const list = state.settings.watches || [];
    if (!list.length) return;
    const fresh = [];
    for (const watch of list) fresh.push(await checkWatch(watch));
    const now = state.settings.watches || [];
    actions.setSettings({ watches: now.map((w) => fresh.find((f) => f.id === w.id) || w) });
}

// Un tema que también busca en toda la web lleva una fuente de búsqueda
// asociada (Bing Noticias). Se crea, se cambia o se quita con el tema.
function syncWebTopic(next, prev) {
    const prevSource = prev?.webSourceId && state.sources.find((s) => s.id === prev.webSourceId);
    if (!next?.web) {
        if (prevSource) actions.removeSource(prevSource.id);
        if (next) delete next.webSourceId;
        return;
    }
    const url = webSearchUrl(next.words?.length ? next.words.join(' OR ') : next.name);
    if (prevSource && prevSource.feedUrl === url) {
        next.webSourceId = prevSource.id;
        if (prevSource.title !== `${next.name} en la web`) saveSource({ ...prevSource, title: `${next.name} en la web` });
        return;
    }
    if (prevSource) actions.removeSource(prevSource.id);
    const source = makeSource({ title: `${next.name} en la web`, siteUrl: 'https://www.bing.com/news', feedUrl: url, kind: 'web', folder: 'Búsquedas', icon: '' });
    next.webSourceId = source.id;
    saveSource(source);
    refreshOne(source).then(() => {
        rebuildToday();
        downloadToday();
    });
}

// Cuántas historias traería una edición nueva ahora mismo.
export function nextEditionCount() {
    return buildToday({ prev: { date: state.today.date, edition: 2, items: [] }, ...todayInput() }).items.length;
}

// Un artículo que no viene de ninguna fuente seguida: lo compartido desde otra
// app o un enlace abierto desde el texto de otro artículo.
function looseArticle(page, readable, extra) {
    const host = new URL(page.url).hostname.replace(/^www\./, '');
    const item = {
        url: page.url,
        title: readable?.title || host,
        summary: (readable?.text || '').slice(0, 280),
        contentHtml: '',
        fullHtml: readable?.html || '',
        author: '',
        image: '',
        publishedAt: null,
    };
    return makeArticle(LOOSE_ID, item, Date.now(), {
        site: host,
        siteUrl: new URL(page.url).origin,
        fullTried: true,
        minutes: readMinutes(readable?.text || ''),
        ...extra,
    });
}

// Últimos titulares de un sitio del catálogo, ya pedidos en esta sesión.
const peeks = new Map();

export const actions = {
    // Lo último de un sitio sin seguirlo: para la vista previa del catálogo.
    async peekFeed(feedUrl, kind = '') {
        if (peeks.has(feedUrl)) return peeks.get(feedUrl);
        // Un sitio sin feed se lee tal cual, sin volver a buscarle uno.
        const feed = kind === 'page' ? readSource((await fetchText(feedUrl)).text, feedUrl, 'page') || { items: [] } : (await discoverFeed(feedUrl, fetchText)).feed;
        const items = feed.items
            .filter((item) => item.title && item.url)
            .slice(0, 8)
            .map(({ title, url, image, publishedAt, kind }) => ({ title, url, image: image || '', publishedAt: publishedAt || null, kind: kind || '' }));
        peeks.set(feedUrl, items);
        return items;
    },

    async init() {
        const [sources, articles, settings, today, lastRefresh, habits] = await Promise.all([
            db.all('sources'),
            db.all('articles'),
            db.getMeta('settings'),
            db.getMeta('today'),
            db.getMeta('lastRefresh'),
            db.getMeta('habits'),
            initImages(),
        ]);
        const merged = {
            ...DEFAULT_SETTINGS,
            ...settings,
            reader: { ...DEFAULT_READER, ...settings?.reader },
            // Quien tenía encendido el aviso de temas de versiones anteriores lo conserva.
            notify: { ...DEFAULT_NOTIFY, on: Boolean(settings?.notifyAlerts), ...settings?.notify },
        };
        // Las alertas de versiones anteriores pasan a ser temas.
        if (!settings?.topics && settings?.keywords?.length) {
            merged.topics = settings.keywords.map((k) => ({ id: newId(), name: k, words: [k], notify: true }));
        }
        // Vídeos traídos por una versión que aún no los distinguía de un artículo.
        for (const a of articles) if (a.kind === undefined) a.kind = isVideoUrl(a.url) ? 'video' : '';
        // Quien ya tenía sitios no necesita el arranque guiado.
        if (sources.length) merged.onboarded = true;
        set({ sources, articles, settings: merged, habits: habits || {}, today: today || state.today, lastRefresh: lastRefresh || 0 });

        // Base de datos vacía pero hay copia automática: el WebView borró los
        // datos (ver ports/snapshot.js). Se recuperan antes de mostrar nada.
        let recovered = false;
        if (!sources.length && !settings) {
            const copy = await loadSnapshot();
            if (copy) {
                try {
                    await actions.restoreBackup(copy);
                    recovered = true;
                } catch {
                    // Copia ilegible: se arranca de cero.
                }
            }
        }
        set({ ready: true });
        if (recovered) showToast('Faro recuperó tus datos tras un fallo del sistema');
        rebuildToday();
        queueWatcherSync();
        actions.refreshIfStale();
        // Aunque no toque actualizar, lo de Hoy debe quedar listo para leer sin
        // conexión (por ejemplo, tras instalar una versión nueva).
        if (!state.refreshing) downloadToday();
        loadCatalog();
        // Las pausas de palabras que ya vencieron se retiran; las de sitios y temas caducan solas.
        if (Object.keys(state.settings.mutedUntil || {}).length !== Object.keys(liveMutes(state.settings.mutedUntil)).length) actions.setSettings({ mutedUntil: liveMutes(state.settings.mutedUntil) });
        queueWidget();
        // Lo guardado con versiones anteriores también pasa al archivo.
        pool(state.articles.filter((x) => x.saved && !x.archived && !x.kind && !x.imported), 2, (x) => archive(x.id));
        translateTitles();
    },

    // Al abrir la app o volver a ella: solo actualiza si ya pasó un rato.
    refreshIfStale() {
        if (state.ready && state.sources.length && Date.now() - state.lastRefresh > REFRESH_EVERY) actions.refreshAll();
    },

    // Busca cómo seguir lo que el usuario pegó y devuelve una vista previa.
    async previewSite(input) {
        const { feedUrl, feed, kind = '' } = await discoverFeed(input, fetchText);
        const duplicate = state.sources.find((s) => urlKey(s.feedUrl) === urlKey(feedUrl));
        const siteUrl = feed.siteUrl || new URL(feedUrl).origin;
        return {
            feedUrl,
            kind,
            title: feed.title || new URL(feedUrl).hostname,
            siteUrl,
            icon: feed.icon || (await findIcon(siteUrl, fetchText)),
            items: feed.items,
            perWeek: perWeek(feed.items),
            duplicate: Boolean(duplicate),
        };
    },

    addSource(preview, { folder = '', level = 'todo', offline = true, priority = false } = {}) {
        const source = makeSource({ ...preview, folder, level, offline, priority, lastOkAt: Date.now() });
        saveSource(source);
        ingest(source, preview.items || []);
        markSeen(source.feedUrl, (preview.items || []).map((i) => i.url));
        rebuildToday();
        downloadToday();
        return source;
    },

    // Seguir sitios del catálogo: ya están comprobados, no hace falta buscarlos.
    // Los que publican muchísimo entran en «lo importante».
    async followMany(entries, { quiet = false } = {}) {
        const have = new Set(state.sources.map((s) => urlKey(s.feedUrl)));
        const added = entries
            .filter((e) => !have.has(urlKey(e.feed)))
            .map((e) => {
                const busy = (e.perWeek || 0) >= BUSY_PER_WEEK;
                const source = makeSource({ title: e.name, siteUrl: e.site || '', icon: e.icon, feedUrl: e.feed, kind: e.kind || '', folder: e.folder, level: busy ? 'importante' : 'todo', perWeek: e.perWeek ?? null, country: e.country || '' });
                saveSource(source);
                return { source, busy };
            });
        const busy = added.filter((a) => a.busy).map((a) => a.source.title);
        if (busy.length && !quiet) {
            showToast(busy.length === 1 ? `${busy[0]} publica mucho: solo entra lo importante.` : `${busy.length} sitios publican mucho: de ellos solo entra lo importante.`);
        }
        await pool(added.map((a) => a.source), 4, refreshOne);
        rebuildToday();
        downloadToday();
        return added.length;
    },

    followCatalog(entry, folder) {
        return actions.followMany([{ ...entry, folder }]);
    },

    updateSource(id, patch) {
        const current = state.sources.find((s) => s.id === id);
        if (!current) return;
        saveSource({ ...current, ...patch });
        rebuildToday();
    },

    removeSource(id) {
        const gone = state.articles.filter((a) => a.sourceId === id).map((a) => a.id);
        set({ sources: state.sources.filter((s) => s.id !== id) });
        db.delMany('sources', [id]);
        dropArticles(gone);
        rebuildToday();
        queueWatcherSync();
        queueSnapshot();
    },

    async refreshSource(id) {
        const source = state.sources.find((s) => s.id === id);
        if (!source) return;
        await refreshOne(source);
        rebuildToday();
    },

    async refreshAll() {
        if (state.refreshing || !state.sources.length) return;
        set({ refreshing: true });
        try {
            await pool(state.sources, 4, refreshOne);
            const lastRefresh = Date.now();
            set({ lastRefresh });
            db.setMeta('lastRefresh', lastRefresh);
            rebuildToday();
            prune();
        } finally {
            set({ refreshing: false });
        }
        downloadToday();
        checkWatches();
        translateTitles();
    },

    // Abrir un artículo en el lector: lo marca como leído y cuenta como interés.
    open(id) {
        const article = state.articles.find((a) => a.id === id);
        if (!article) return;
        if (!article.read) habit(article.sourceId, 'o');
        // La hora de la primera lectura alimenta las estadísticas.
        patchArticle(id, { read: true, readAt: article.readAt || Date.now() });
    },
    markRead(id, read = true) {
        patchArticle(id, { read });
    },
    // Texto de un artículo, que no está en memoria.
    loadBody(id) {
        return db.get('bodies', id);
    },
    // Hasta dónde llegó el lector en un artículo, de 0 a 1.
    setPosition(id, pos) {
        const article = state.articles.find((a) => a.id === id);
        if (article && Math.abs((article.pos || 0) - pos) > 0.02) patchArticle(id, { pos });
    },

    toggleSaved(id, { silent = false } = {}) {
        const article = state.articles.find((x) => x.id === id);
        if (!article) return;
        const saved = !article.saved;
        patchArticle(id, { saved });
        habit(article.sourceId, 's', saved ? 1 : -1);
        tap();
        if (!silent) showToast(saved ? 'Guardada para luego' : 'Quitada de Guardado', () => actions.toggleSaved(id, { silent: true }));
        if (saved) archive(id);
        else {
            patchArticle(id, { archived: false });
            db.get('bodies', id).then((body) => unpinImages(imagesOf(article, body?.fullHtml || body?.contentHtml)));
        }
    },

    dismiss(id) {
        const article = state.articles.find((x) => x.id === id);
        if (!article) return;
        const before = { dismissed: article.dismissed, read: article.read };
        patchArticle(id, { dismissed: true, read: true });
        habit(article.sourceId, 'd');
        rebuildToday();
        tap();
        showToast('Descartada', () => {
            patchArticle(id, before);
            habit(article.sourceId, 'd', -1);
            rebuildToday();
        });
    },

    // «Menos de esta fuente»: baja un escalón su nivel y lo cuenta como desinterés.
    lessOf(sourceId) {
        const source = state.sources.find((s) => s.id === sourceId);
        if (!source) return;
        const level = LEVEL_DOWN[source.level];
        habit(sourceId, 'd', 2);
        if (level === source.level) {
            rebuildToday();
            showToast(`${source.title} ya solo entra por tus temas.`);
            return;
        }
        actions.updateSource(sourceId, { level });
        showToast(`${source.title} pasa a «${LEVEL_NAME[level]}»`, () => {
            actions.updateSource(sourceId, { level: source.level });
            habit(sourceId, 'd', -2);
        });
    },

    muteWord(word) {
        const clean = word.trim();
        const muted = state.settings.muted || [];
        if (!clean || muted.some((m) => m.toLowerCase() === clean.toLowerCase())) return;
        actions.setSettings({ muted: [...muted, clean] });
        showToast(`«${clean}» silenciada`, () => actions.setSettings({ muted }));
    },

    // Empieza la edición de tarde: un Hoy nuevo con lo llegado desde la mañana.
    nextEdition() {
        set({ today: { date: state.today.date, edition: (state.today.edition || 1) + 1, items: [] } });
        rebuildToday();
        downloadToday();
    },

    resetHabits() {
        set({ habits: {} });
        db.setMeta('habits', {});
        rebuildToday();
        showToast('Faro olvidó lo aprendido');
    },

    // Menú de una historia (pulsación larga) y comparación de cobertura.
    openMenu(id) {
        window.getSelection?.()?.removeAllRanges();
        tap(true);
        set({ menu: id });
    },
    closeMenu() {
        set({ menu: null });
    },
    openCompare(ids) {
        set({ compare: ids });
    },
    closeCompare() {
        set({ compare: null });
    },

    // El usuario tocó un aviso. Con dirección: se abre esa noticia (trayéndola
    // antes si la app aún no la tenía). Sin dirección: las novedades.
    async handleOpen({ url, feed }) {
        const find = () => (url ? state.articles.find((a) => a.urlKey === urlKey(url)) : null);
        let article = find();
        if (url && !article) {
            const source = feed && state.sources.find((s) => urlKey(s.feedUrl) === urlKey(feed));
            if (source) {
                await refreshOne(source);
                rebuildToday();
                article = find();
            }
        }
        if (url && !article) showToast('Esa noticia ya no está en el sitio. Aquí tienes lo último.');
        // Aviso agrupado de un sitio: se abre la página de ese sitio.
        const site = !article && feed ? state.sources.find((s) => urlKey(s.feedUrl) === urlKey(feed)) : null;
        set({ pendingOpen: article ? { id: article.id } : site ? { sourceId: site.id } : { list: true } });
        if (site) actions.refreshSource(site.id);
        else if (!url) actions.refreshAll();
    },
    clearPendingOpen() {
        set({ pendingOpen: null });
    },

    // Aplica lo que el usuario guardó desde un aviso sin abrir la app.
    async applyNotificationSaves() {
        const { saves, reads, mutes } = await takeNotificationActions();
        // «Silenciar 1 semana» en el aviso de un tema: la semana cuenta desde que se tocó.
        for (const mute of mutes) {
            const topic = (state.settings.topics || []).find((t) => t.name === mute.topic);
            if (topic) actions.pause({ kind: 'topic', key: topic.id, label: topic.name }, (mute.at || Date.now()) + 7 * 86400000, { quiet: true });
        }
        if (mutes.length) queueWatcherSync();
        const touched = [...saves, ...reads];
        if (!touched.length) return;
        const feeds = new Set(touched.map((s) => s.feed).filter(Boolean).map(urlKey));
        const missing = touched.some((s) => !state.articles.some((a) => a.urlKey === urlKey(s.url)));
        if (missing) {
            await pool(state.sources.filter((s) => feeds.has(urlKey(s.feedUrl))), 4, refreshOne);
            rebuildToday();
        }
        let done = 0;
        for (const save of saves) {
            const article = state.articles.find((a) => a.urlKey === urlKey(save.url));
            if (!article) continue;
            if (!article.saved) {
                patchArticle(article.id, { saved: true });
                habit(article.sourceId, 's');
            }
            done++;
        }
        // «Ya la vi»: se da por leída sin contarla como interés.
        for (const read of reads) {
            const article = state.articles.find((a) => a.urlKey === urlKey(read.url));
            if (article && !article.read) patchArticle(article.id, { read: true });
        }
        if (reads.length) rebuildToday();
        if (done) showToast(done === 1 ? 'Guardada desde un aviso' : `${done} guardadas desde los avisos`);
    },

    // Por dónde va un episodio de podcast, en segundos.
    setAudioPosition(id, seconds) {
        if (state.articles.some((a) => a.id === id)) patchArticle(id, { audioPos: Math.floor(seconds) });
    },

    setAudioDuration(id, seconds) {
        const minutes = Math.max(1, Math.round(seconds / 60));
        if (state.articles.some((a) => a.id === id)) patchArticle(id, { duration: minutes, minutes });
    },

    markAllRead(sourceId) {
        const ids = state.articles.filter((a) => a.sourceId === sourceId && !a.read).map((a) => a.id);
        if (!ids.length) return;
        const apply = (read) => {
            const target = new Set(ids);
            const changed = [];
            set({ articles: state.articles.map((a) => (target.has(a.id) ? (changed.push({ ...a, read }), changed.at(-1)) : a)) });
            db.putMany('articles', changed);
            rebuildToday();
        };
        apply(true);
        showToast(`${ids.length} marcadas como leídas`, () => apply(false));
    },

    // Artículos cuyo texto contiene todas las palabras buscadas.
    async searchBodies(query) {
        const hits = new Set();
        await db.scan('bodies', (body) => {
            if (bodyMatches(query, body)) hits.add(body.id);
        });
        return hits;
    },

    async loadInbox() {
        set({ inbox: await notifyHistory() });
    },

    // Dirección que llega desde «Compartir» de otra app.
    setShared(url) {
        set({ shared: url || null });
    },

    // Guarda un artículo suelto por su dirección, sin seguir el sitio.
    async saveLoose(url) {
        const key = urlKey(url);
        const existing = state.articles.find((a) => a.urlKey === key);
        if (existing) {
            if (!existing.saved) patchArticle(existing.id, { saved: true });
            showToast('Ya estaba en Faro: guardada para luego');
            return existing.id;
        }
        let page;
        try {
            page = await fetchText(url);
        } catch {
            throw new Error('No se pudo abrir esa dirección. Revisa la conexión.');
        }
        const article = looseArticle(page, extractReadable(page.text, page.url), { saved: true });
        set({ articles: [...state.articles, article.meta] });
        db.put('articles', article.meta);
        db.put('bodies', article.body);
        showToast('Guardada para luego');
        return article.meta.id;
    },

    // Abre dentro de Faro un enlace del texto de un artículo. Devuelve el id
    // de lo que hay que mostrar, o null si esa página no se deja leer aquí.
    async openLink(url) {
        const known = (href) => state.articles.find((a) => a.urlKey === urlKey(href));
        const existing = known(url);
        if (existing) return existing.id;
        let page;
        try {
            page = await fetchText(url);
        } catch {
            return null;
        }
        // El enlace podía ser un acortador que lleva a algo que ya está aquí.
        const landed = known(page.url);
        if (landed) return landed.id;
        const readable = extractReadable(page.text, page.url);
        if ((readable?.text || '').length < MIN_READABLE) return null;
        // No es una noticia recibida: se lee y no aparece en las listas.
        const article = looseArticle(page, readable, { read: true, dismissed: true, readAt: Date.now() });
        set({ articles: [...state.articles, article.meta] });
        db.put('articles', article.meta);
        db.put('bodies', article.body);
        return article.meta.id;
    },

    // Da por leídas varias historias a la vez (una sección de Hoy).
    markListRead(ids) {
        const pending = new Set(state.articles.filter((a) => ids.includes(a.id) && !a.read).map((a) => a.id));
        if (!pending.size) return;
        const apply = (read) => {
            const changed = [];
            set({ articles: state.articles.map((a) => (pending.has(a.id) ? (changed.push({ ...a, read }), changed.at(-1)) : a)) });
            db.putMany('articles', changed);
            queueWidget();
        };
        apply(true);
        showToast(pending.size === 1 ? 'Marcada como leída' : `${pending.size} marcadas como leídas`, () => apply(false));
    },

    // Etiquetas de un artículo guardado.
    setTags(id, tags) {
        const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
        patchArticle(id, { tags: clean });
        queueSnapshot();
    },
    openTags(id) {
        set({ tagging: id });
    },
    closeTags() {
        set({ tagging: null });
    },
    // Guarda la traducción de un artículo para no repetirla.
    async saveTranslation(id, esHtml, esTitle) {
        const body = (await db.get('bodies', id)) || { id, contentHtml: '', fullHtml: '' };
        const next = { ...body, esHtml, esTitle };
        await db.put('bodies', next);
        return next;
    },

    // Silenciar por un tiempo. `target`: { kind, key, label }; `until`: hasta cuándo.
    openPause(target) {
        set({ pausing: target });
    },
    closePause() {
        set({ pausing: null });
    },
    pause(target, until, { quiet = false } = {}) {
        const { kind, key, label } = target;
        let undo = null;
        if (kind === 'source') {
            const source = state.sources.find((s) => s.id === key);
            if (!source) return;
            const before = source.pausedUntil || 0;
            saveSource({ ...source, pausedUntil: until });
            undo = () => actions.pause(target, before, { quiet: true });
        } else if (kind === 'topic') {
            const topics = state.settings.topics || [];
            if (!topics.some((t) => t.id === key)) return;
            const before = topics.find((t) => t.id === key).pausedUntil || 0;
            actions.setSettings({ topics: topics.map((t) => (t.id === key ? { ...t, pausedUntil: until } : t)) });
            undo = () => actions.pause(target, before, { quiet: true });
        } else {
            // Una palabra «hasta que yo lo quite» va con las silenciadas de siempre.
            const word = key.trim();
            const before = { muted: state.settings.muted || [], mutedUntil: state.settings.mutedUntil || {} };
            const timed = { ...before.mutedUntil };
            delete timed[word];
            const forever = until >= 8640000000000000;
            const muted = before.muted.filter((m) => m.toLowerCase() !== word.toLowerCase());
            if (forever) muted.push(word);
            else if (until > Date.now()) timed[word] = until;
            actions.setSettings({ muted, mutedUntil: timed });
            undo = () => actions.setSettings(before);
        }
        rebuildToday();
        queueWatcherSync();
        queueSnapshot();
        if (quiet) return;
        const text = pauseLabel(until);
        showToast(text ? `${kind === 'word' ? `«${label}»` : label} en silencio ${text}` : `${kind === 'word' ? `«${label}»` : label} vuelve a contar`, undo);
    },

    // Páginas vigiladas.
    async addWatch(url) {
        const page = await fetchText(url);
        const lines = pageLines(page.text);
        if (!lines.length) throw new Error('Esa página no tiene texto que se pueda comparar.');
        const doc = new DOMParser().parseFromString(page.text, 'text/html');
        const title = (doc.querySelector('title')?.textContent || new URL(page.url).hostname).replace(/\s+/g, ' ').trim().slice(0, 80);
        const watch = { id: newId(), url: page.url, title, hash: textHash(lines), checkedAt: Date.now(), changedAt: 0, diff: null, seen: true };
        await db.setMeta(`watch:${watch.id}`, lines);
        actions.setSettings({ watches: [...(state.settings.watches || []), watch] });
        showToast('Faro te avisará cuando cambie');
        return watch;
    },
    removeWatch(id) {
        actions.setSettings({ watches: (state.settings.watches || []).filter((w) => w.id !== id) });
        db.setMeta(`watch:${id}`, null);
    },
    seeWatch(id) {
        actions.setSettings({ watches: (state.settings.watches || []).map((w) => (w.id === id ? { ...w, seen: true } : w)) });
    },
    checkWatches,

    // Reglas automáticas.
    saveRule(rule) {
        const rules = state.settings.rules || [];
        const clean = { ...rule, id: rule.id || newId() };
        actions.setSettings({ rules: rules.some((r) => r.id === clean.id) ? rules.map((r) => (r.id === clean.id ? clean : r)) : [...rules, clean] });
        return clean;
    },
    removeRule(id) {
        actions.setSettings({ rules: (state.settings.rules || []).filter((r) => r.id !== id) });
    },
    // Aplica una regla a lo que ya está en Faro. Devuelve cuántos cambió.
    applyRuleNow(rule) {
        const changed = [];
        set({
            articles: state.articles.map((a) => {
                const patch = applyRules([rule], a);
                if (!patch) return a;
                return (changed.push({ ...a, ...patch }), changed.at(-1));
            }),
        });
        db.putMany('articles', changed);
        rebuildToday();
        queueSnapshot();
        return changed.length;
    },

    // Lo guardado en Pocket u Omnivore. items: [{ url, title, tags, savedAt, read }].
    importSaved(items) {
        const known = new Set(state.articles.map((a) => a.urlKey));
        const added = [];
        for (const it of items) {
            const key = urlKey(it.url);
            if (known.has(key)) continue;
            known.add(key);
            let host = '';
            try {
                host = new URL(it.url).hostname.replace(/^www\./, '');
            } catch {
                continue;
            }
            const article = makeArticle(LOOSE_ID, { url: it.url, title: it.title || host, summary: '', contentHtml: '', fullHtml: '', author: '', image: '', publishedAt: it.savedAt || null }, it.savedAt || Date.now(), {
                saved: true,
                read: Boolean(it.read),
                tags: it.tags || [],
                site: host,
                siteUrl: `https://${host}`,
                // El texto se trae al abrirlo, no todo de golpe.
                imported: true,
            });
            added.push(article);
        }
        if (added.length) {
            set({ articles: [...state.articles, ...added.map((a) => a.meta)] });
            db.putMany('articles', added.map((a) => a.meta));
            db.putMany('bodies', added.map((a) => a.body));
            queueSnapshot();
        }
        return { added: added.length, skipped: items.length - added.length };
    },

    // Cuánto tardó de verdad en leer un artículo, frente a lo estimado.
    recordPace(ratio) {
        if (!(ratio > 0.15 && ratio < 4)) return;
        const samples = [...(state.settings.pace || []), Math.round(ratio * 100) / 100].slice(-40);
        actions.setSettings({ pace: samples });
    },

    // Espóileres que el usuario ya decidió ver.
    reveal(id) {
        set({ revealed: new Set([...state.revealed, id]) });
    },

    toast: showToast,
    clearToast() {
        clearTimeout(toastTimer);
        set({ toast: null });
    },
    undoToast() {
        const undo = state.toast?.undo;
        actions.clearToast();
        undo?.();
    },

    setSettings(patch) {
        const settings = { ...state.settings, ...patch };
        set({ settings });
        db.setMeta('settings', settings);
        queueSnapshot();
        if ('topics' in patch || 'muted' in patch || 'mutedUntil' in patch) rebuildToday();
        if ('topics' in patch || 'muted' in patch || 'mutedUntil' in patch || 'notify' in patch || 'spoilers' in patch || 'watches' in patch) queueWatcherSync();
        if ('dailyOn' in patch || 'dailyTime' in patch) syncDaily(settings);
    },
    setNotify(patch) {
        actions.setSettings({ notify: { ...DEFAULT_NOTIFY, ...state.settings.notify, ...patch } });
    },
    setReader(patch) {
        actions.setSettings({ reader: { ...state.settings.reader, ...patch } });
    },

    saveTopic(topic) {
        const topics = state.settings.topics || [];
        const clean = { notify: true, ...topic, id: topic.id || newId(), name: topic.name.trim(), words: topic.words.map((w) => w.trim()).filter(Boolean) };
        syncWebTopic(clean, topics.find((t) => t.id === clean.id));
        const exists = topics.some((t) => t.id === clean.id);
        actions.setSettings({ topics: exists ? topics.map((t) => (t.id === clean.id ? clean : t)) : [...topics, clean] });
        return clean;
    },
    removeTopic(id) {
        syncWebTopic(null, (state.settings.topics || []).find((t) => t.id === id));
        actions.setSettings({ topics: (state.settings.topics || []).filter((t) => t.id !== id) });
    },

    addHighlight(articleId, text) {
        const article = state.articles.find((a) => a.id === articleId);
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!article || clean.length < 3) return null;
        const highlight = { id: newId(), text: clean, note: '', createdAt: Date.now() };
        patchArticle(articleId, { highlights: [...(article.highlights || []), highlight] });
        habit(article.sourceId, 's');
        tap();
        return highlight;
    },
    updateHighlight(articleId, id, patch) {
        const article = state.articles.find((a) => a.id === articleId);
        if (article) patchArticle(articleId, { highlights: (article.highlights || []).map((h) => (h.id === id ? { ...h, ...patch } : h)) });
    },
    removeHighlight(articleId, id) {
        const article = state.articles.find((a) => a.id === articleId);
        if (article) patchArticle(articleId, { highlights: (article.highlights || []).filter((h) => h.id !== id) });
    },

    // Trae la página del artículo y guarda su texto limpio. No hace falta si el
    // feed ya traía el artículo entero, ni tiene sentido en vídeos y podcasts.
    async ensureFullText(id) {
        const article = state.articles.find((a) => a.id === id);
        if (!article || article.full || article.fullTried || article.kind || article.chars > ENOUGH_TEXT) return;
        try {
            const res = await fetchText(article.url);
            const readable = extractReadable(res.text, res.url);
            if (readable) {
                const body = (await db.get('bodies', id)) || { id, contentHtml: '' };
                await db.put('bodies', { ...body, fullHtml: readable.html });
                patchArticle(id, { full: true, fullTried: true, minutes: readMinutes(readable.text), summary: article.summary || readable.text.slice(0, 280) });
            } else {
                patchArticle(id, { fullTried: true });
            }
        } catch {
            // Sin red: se reintenta la próxima vez que se abra.
        }
    },

    async importOpml(text) {
        const have = new Set(state.sources.map((s) => urlKey(s.feedUrl)));
        const entries = parseOpml(text).filter((e) => !have.has(urlKey(e.feedUrl)));
        for (const e of entries) {
            let host = e.feedUrl;
            try {
                host = new URL(e.feedUrl).hostname;
            } catch {
                continue;
            }
            saveSource(makeSource({ title: e.title || host, siteUrl: e.siteUrl, feedUrl: e.feedUrl, folder: e.folder || '' }));
        }
        if (entries.length) actions.refreshAll();
        return entries.length;
    },

    exportOpml() {
        return buildOpml(state.sources);
    },

    // Escribe ya la copia automática. También se llama al salir de la app.
    async snapshotNow() {
        clearTimeout(snapshotTimer);
        if (!state.ready) return;
        try {
            const copy = await actions.exportBackup();
            await saveSnapshot(copy);
            // Una vez por semana, además, a Documentos/Faro.
            if (state.settings.autoCopy !== false && Date.now() - (state.settings.autoCopyAt || 0) > WEEK && (await saveExternalCopy(copy))) {
                actions.setSettings({ autoCopyAt: Date.now() });
            }
        } catch {
            // Sin espacio o sin permiso: se reintenta con el siguiente cambio.
        }
    },

    // Copia en Documentos/Faro ahora mismo. Devuelve si se pudo escribir.
    async copyToDocuments() {
        const ok = await saveExternalCopy(await actions.exportBackup());
        if (ok) actions.setSettings({ autoCopyAt: Date.now() });
        return ok;
    },

    // Copia de seguridad: todo lo que el usuario ha construido, en un archivo.
    async exportBackup() {
        const keep = state.articles.filter((a) => a.saved || a.highlights?.length);
        const bodies = new Map();
        for (const a of keep) bodies.set(a.id, await db.get('bodies', a.id));
        return JSON.stringify(buildBackup({ ...state, bodies, version: __APP_VERSION__ }));
    },

    // Fusiona una copia con lo que ya hay: añade lo que falta, no borra nada.
    async restoreBackup(text) {
        const backup = parseBackup(text);
        const plan = planRestore(backup, state);

        for (const s of plan.newSources) saveSource(makeSource(s));
        const idByFeed = new Map(state.sources.map((s) => [urlKey(s.feedUrl), s.id]));

        const now = Date.now();
        const added = plan.newArticles.map((a) => {
            const sourceId = (a.feedUrl && idByFeed.get(urlKey(a.feedUrl))) || LOOSE_ID;
            const { contentHtml, fullHtml, feedUrl: _, ...rest } = a;
            const article = makeArticle(sourceId, { ...a, contentHtml, fullHtml }, a.fetchedAt || now, {
                ...rest,
                sourceId,
                fullTried: Boolean(fullHtml),
                site: a.site || new URL(a.url).hostname.replace(/^www\./, ''),
            });
            return article;
        });
        if (added.length) {
            set({ articles: [...state.articles, ...added.map((a) => a.meta)] });
            await db.putMany('articles', added.map((a) => a.meta));
            await db.putMany('bodies', added.map((a) => a.body));
        }
        for (const m of plan.mergeArticles) patchArticle(m.id, { saved: m.saved, highlights: m.highlights });

        const habits = { ...state.habits };
        for (const [feedUrl, h] of Object.entries(plan.habits)) {
            const id = idByFeed.get(urlKey(feedUrl));
            if (id && !habits[id]) habits[id] = h;
        }
        set({ habits });
        db.setMeta('habits', habits);
        actions.setSettings(plan.settings);

        rebuildToday();
        if (plan.newSources.length) actions.refreshAll();
        return { sources: plan.newSources.length, articles: added.length + plan.mergeArticles.length };
    },
};

export const isFailing = (source) => (source.failCount || 0) >= FAIL_LIMIT;
