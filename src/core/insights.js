// Lo que Faro puede deducir de lo que ya sabe: qué sitios sugerir y cómo lee
// el usuario. Todo se calcula en el teléfono.

import { norm } from './text.js';
import { urlKey } from './url.js';

const DAY = 86400000;
const BUSY = 150;

// Sitios del catálogo de los mismos temas que el usuario ya sigue.
export function suggestSites(catalog, sources, limit = 4) {
    const followed = new Set(sources.map((s) => urlKey(s.feedUrl)));
    const groupOf = (entry) => `${entry.cat}/${entry.country || ''}`;
    // Por cada tema, uno de los sitios que ya sigue: es el «porque» de la sugerencia.
    const because = new Map();
    for (const entry of catalog.sources) {
        if (followed.has(urlKey(entry.feed)) && !because.has(groupOf(entry))) because.set(groupOf(entry), entry.name);
    }
    return catalog.sources
        .filter((entry) => because.has(groupOf(entry)) && !followed.has(urlKey(entry.feed)))
        // Primero los recomendados; los que publican muchísimo, al final.
        .sort((a, b) => Number(Boolean(b.top)) - Number(Boolean(a.top)) || Number((a.perWeek || 0) >= BUSY) - Number((b.perWeek || 0) >= BUSY))
        .slice(0, limit)
        .map((entry) => ({ ...entry, because: because.get(groupOf(entry)) }));
}

const startOfDay = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

// Resumen de lectura de los últimos siete días, a partir de la hora en que se
// abrió cada artículo (readAt).
export function readingStats(articles, sources, now = Date.now()) {
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const today = startOfDay(now);
    const from = today - 6 * DAY;
    const read = articles.filter((a) => a.readAt && a.readAt >= from && !a.dismissed);

    const days = Array.from({ length: 7 }, (_, i) => {
        const start = from + i * DAY;
        const list = read.filter((a) => startOfDay(a.readAt) === startOfDay(start));
        return {
            label: new Intl.DateTimeFormat('es', { weekday: 'short' }).format(new Date(start)).replace('.', ''),
            count: list.length,
            minutes: list.reduce((sum, a) => sum + (a.minutes || 0), 0),
        };
    });

    const tally = (keyOf) => {
        const map = new Map();
        for (const a of read) {
            const key = keyOf(a);
            if (key) map.set(key, (map.get(key) || 0) + 1);
        }
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    };

    const hours = [0, 0, 0, 0]; // madrugada, mañana, tarde, noche
    for (const a of read) hours[Math.floor(new Date(a.readAt).getHours() / 6)]++;
    const moments = ['de madrugada', 'por la mañana', 'por la tarde', 'por la noche'];

    return {
        count: read.length,
        minutes: read.reduce((sum, a) => sum + (a.minutes || 0), 0),
        saved: read.filter((a) => a.saved).length,
        highlights: read.reduce((sum, a) => sum + (a.highlights?.length || 0), 0),
        days,
        best: Math.max(1, ...days.map((d) => d.count)),
        sources: tally((a) => srcById.get(a.sourceId)?.title),
        folders: tally((a) => srcById.get(a.sourceId)?.folder),
        moment: read.length ? moments[hours.indexOf(Math.max(...hours))] : '',
    };
}

// Busca en el texto de un artículo: todas las palabras, sin tildes ni mayúsculas.
export function bodyMatches(query, body) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const text = norm(String(body?.fullHtml || body?.contentHtml || '').replace(/<[^>]+>/g, ' '));
    return words.every((w) => text.includes(w));
}
