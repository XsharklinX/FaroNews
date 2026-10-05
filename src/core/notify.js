// Reglas de los avisos que no dependen de Android: qué se le pide vigilar al
// teléfono y cuándo toca callar. El vigilante nativo (FeedWorker.java) aplica
// estas mismas reglas con la app cerrada.

import { topicWords, topicsOf } from './today.js';

export const DEFAULT_NOTIFY = { on: false, every: 30, quietOn: true, quietFrom: '23:00', quietTo: '07:00' };
export const FREQUENCIES = [
    { id: 15, label: '15 min' },
    { id: 30, label: '30 min' },
    { id: 60, label: '1 hora' },
];

// Todos los sitios se pueden vigilar con la app cerrada. De los que no tienen
// feed, el vigilante lee los titulares de la portada.
export const canWatch = (source) => Boolean(source.feedUrl);

// Lo que recibe el vigilante. Se revisan solo los sitios que hacen falta: los
// marcados para avisar de todo, o todos si hay algún tema con aviso.
export function watcherConfig(sources, settings) {
    const notify = { ...DEFAULT_NOTIFY, ...settings.notify };
    const topics = topicsOf(settings)
        .filter((t) => t.notify !== false)
        .map((t) => ({ name: t.name, words: topicWords(t) }));
    return {
        enabled: Boolean(notify.on),
        everyMinutes: notify.every,
        quiet: { on: Boolean(notify.quietOn), from: notify.quietFrom, to: notify.quietTo },
        feeds: sources.filter(canWatch).map((s) => ({ url: s.feedUrl, title: s.title, notify: Boolean(s.notify), ...(s.kind === 'page' ? { kind: 'page' } : {}) })),
        topics,
        muted: settings.muted || [],
    };
}

const toMinutes = (hhmm, fallback) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : fallback;
};

// El tramo de silencio puede cruzar la medianoche (23:00 a 07:00).
export function inQuietHours(notify, date = new Date()) {
    if (!notify?.quietOn) return false;
    const from = toMinutes(notify.quietFrom, 23 * 60);
    const to = toMinutes(notify.quietTo, 7 * 60);
    const now = date.getHours() * 60 + date.getMinutes();
    if (from === to) return false;
    return from < to ? now >= from && now < to : now >= from || now < to;
}

// Resumen en una frase de lo que hay configurado, para la pantalla de Avisos.
export function notifySummary(sources, settings) {
    const config = watcherConfig(sources, settings);
    const sites = config.feeds.filter((f) => f.notify).length;
    const parts = [];
    if (config.topics.length) parts.push(config.topics.length === 1 ? '1 tema' : `${config.topics.length} temas`);
    if (sites) parts.push(sites === 1 ? '1 sitio' : `${sites} sitios`);
    return parts.join(' y ');
}
