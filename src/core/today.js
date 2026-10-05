// Arma la selección de «Hoy»: pocas historias, cada una con su motivo.
//
// Una historia puede venir de varias fuentes a la vez: se agrupan por parecido
// del titular y se muestra una sola tarjeta.

import { dateKey, norm } from './text.js';

const STOP = new Set(
    'de la el los las un una unos unas y en a que por para con del al se su sus es lo como mas pero sin sobre entre contra tras desde hasta ante segun cuando donde quien esta este estos estas tiene tienen sera han hay fue son the of and to in for on with is at by from this that are was'.split(' ')
);

export const LIMIT = 12;
const MAX_ALERTS = 8;
const WINDOW_MS = 36 * 3600000;
const SIMILAR = 0.5;

export function titleTokens(title) {
    return new Set(
        norm(title)
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 2 && !STOP.has(w))
    );
}

// Palabras con peso de un titular, tal como están escritas, para ofrecerlas al
// silenciar o al seguir un tema.
export function titleWords(title, max = 6) {
    const seen = new Set();
    const out = [];
    for (const word of String(title || '').split(/[^\p{L}\p{N}]+/u)) {
        const key = norm(word);
        if (word.length < 4 || STOP.has(key) || seen.has(key) || /^\d+$/.test(word)) continue;
        seen.add(key);
        out.push(word);
        if (out.length === max) break;
    }
    return out;
}

function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const t of a) if (b.has(t)) shared++;
    return shared / (a.size + b.size - shared);
}

// Agrupa artículos de fuentes distintas que cuentan lo mismo.
export function clusterArticles(articles) {
    const groups = [];
    for (const article of articles) {
        const tokens = titleTokens(article.title);
        const group = groups.find(
            (g) => jaccard(g.tokens, tokens) >= SIMILAR && !g.members.some((m) => m.sourceId === article.sourceId)
        );
        if (group) group.members.push(article);
        else groups.push({ tokens, members: [article] });
    }
    return groups.map((g) => g.members);
}

export function matchKeyword(article, keywords) {
    const hay = norm(`${article.title} ${article.summary || ''}`);
    return keywords.find((k) => k.trim() && hay.includes(norm(k.trim()))) || null;
}

// Un tema es un nombre y las palabras que lo delatan. Las alertas antiguas
// (una lista de palabras sueltas) se leen como temas de una sola palabra.
export function topicsOf(settings) {
    if (settings?.topics) return settings.topics;
    return (settings?.keywords || []).map((k) => ({ name: k, words: [k] }));
}

export const topicWords = (topic) => (topic.words?.length ? topic.words : [topic.name]);

export function matchTopic(article, topics) {
    const hay = norm(`${article.title} ${article.summary || ''}`);
    const hit = topics.find((t) => topicWords(t).some((w) => w.trim() && hay.includes(norm(w.trim()))));
    return hit ? hit.name : null;
}

const when = (a) => a.publishedAt || a.fetchedAt || 0;

// Cuánto le interesa una fuente al usuario, de -0,5 a 2, según lo que hace con
// ella: abrir suma, guardar suma más, descartar resta. El +3 del divisor evita
// que dos o tres gestos sueltos pesen demasiado.
export function affinity(habit) {
    if (!habit) return 0;
    const { o = 0, s = 0, d = 0 } = habit;
    return (o + 2 * s - 1.5 * d) / (o + s + d + 3);
}
const HABIT_POINTS = 12;
const LIKES = 0.5;

export function buildToday({ prev, articles, sources, settings, habits = {}, now = Date.now(), limit = LIMIT }) {
    const date = dateKey(now);
    const byId = new Map(articles.map((a) => [a.id, a]));
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const topics = topicsOf(settings);
    const muted = settings?.muted || [];

    // Lo ya leído hoy se queda fijo: es el progreso del día. Lo que sigue sin
    // leer vuelve a competir, para que una fuente recién añadida tenga sitio.
    const kept = prev?.date === date ? prev.items.filter((it) => byId.get(it.id)?.read && !byId.get(it.id).dismissed) : [];
    const taken = new Set(kept.flatMap((it) => [it.id, ...(it.also || [])]));

    const fresh = articles
        .filter((a) => srcById.has(a.sourceId) && !a.dismissed && !a.read && !taken.has(a.id))
        .filter((a) => now - when(a) <= WINDOW_MS)
        .filter((a) => !matchKeyword(a, muted))
        .sort((a, b) => when(b) - when(a));

    const candidates = [];
    for (const members of clusterArticles(fresh)) {
        const count = new Set(members.map((m) => m.sourceId)).size;
        const keyword = members.map((m) => matchTopic(m, topics)).find(Boolean) || null;
        // «Lo importante» no cierra la puerta: lo que no destaca queda de
        // reserva y solo entra si al final sobra sitio.
        const strong = Boolean(keyword) || count >= 2;
        const eligible = members.filter((m) => {
            const src = srcById.get(m.sourceId);
            if (src.level === 'alertas') return Boolean(matchTopic(m, topics));
            if (src.level === 'importante') return strong || src.priority;
            return true;
        });
        const reserve = eligible.length ? [] : members.filter((m) => srcById.get(m.sourceId).level === 'importante');
        if (!eligible.length && !reserve.length) continue;

        const pool = eligible.length ? eligible : reserve;
        const head = pool.find((m) => srcById.get(m.sourceId).priority) || pool[0];
        const priority = Boolean(srcById.get(head.sourceId).priority);
        const liking = affinity(habits[head.sourceId]);
        const ageHours = (now - when(head)) / 3600000;
        const score = (keyword ? 50 : 0) + (priority ? 20 : 0) + 15 * (count - 1) + Math.max(0, 24 - ageHours) + HABIT_POINTS * liking;
        const reason = keyword
            ? { type: 'alerta', keyword }
            : count >= 2
              ? { type: 'cluster', count }
              : priority
                ? { type: 'prioritaria' }
                : liking >= LIKES
                  ? { type: 'habito' }
                  : { type: 'reciente' };

        candidates.push({ id: head.id, score, reason, also: members.filter((m) => m.id !== head.id).map((m) => m.id), spare: !eligible.length });
    }

    candidates.sort((a, b) => b.score - a.score);

    // Una fuente que publica mucho no puede llenar Hoy ella sola: hay un tope
    // por fuente. Las alertas se lo saltan, y también el límite del día, porque
    // el usuario pidió verlas siempre.
    // Lo mismo por sección (carpeta): con muchas fuentes de un tema, ese tema no
    // se come el día.
    const perSource = Math.max(3, Math.ceil(limit / Math.max(1, sources.length)));
    const folders = new Set(sources.map((s) => s.folder || ''));
    const perFolder = Math.max(4, Math.ceil(limit / Math.max(1, folders.size)));
    const used = new Map();
    const usedFolder = new Map();
    const folderOf = (id) => srcById.get(byId.get(id)?.sourceId)?.folder || '';
    const count = (id) => used.get(byId.get(id)?.sourceId) || 0;
    const take = (it) => {
        used.set(byId.get(it.id).sourceId, count(it.id) + 1);
        usedFolder.set(folderOf(it.id), (usedFolder.get(folderOf(it.id)) || 0) + 1);
    };
    const isAlert = (it) => it.reason.type === 'alerta';
    kept.filter((it) => !isAlert(it)).forEach(take);

    const items = [...kept];
    const overCap = [];
    const spare = [];
    let alerts = kept.filter(isAlert).length;
    const full = () => items.length - alerts >= limit;
    for (const c of candidates) {
        if (c.spare) {
            spare.push(c);
            continue;
        }
        if (isAlert(c) && alerts < MAX_ALERTS) {
            alerts++;
        } else if (full()) {
            continue;
        } else if (count(c.id) >= perSource || (usedFolder.get(folderOf(c.id)) || 0) >= perFolder) {
            overCap.push(c);
            continue;
        } else {
            take(c);
        }
        items.push(c);
    }
    // Si las demás fuentes no tenían nada reciente, el hueco se rellena.
    for (const c of [...overCap, ...spare]) {
        if (full()) break;
        items.push(c);
    }
    items.sort((a, b) => b.score - a.score);
    // La edición (mañana o tarde) se conserva dentro del mismo día.
    return { date, edition: prev?.date === date ? prev.edition || 1 : 1, items: items.map(({ spare: _, ...it }) => it) };
}
