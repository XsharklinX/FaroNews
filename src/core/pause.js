// Silenciar por un tiempo: un sitio, un tema o una palabra se callan hasta una
// fecha y vuelven solos. Mientras dura, no entran en Hoy ni avisan; en
// Explorar se siguen viendo.
//
//   sitio    source.pausedUntil
//   tema     topic.pausedUntil
//   palabra  settings.mutedUntil[palabra]   (las silenciadas para siempre siguen en settings.muted)

const DAY = 86400000;
// «Hasta que yo lo quite»: una fecha que no llega.
export const FOREVER = 8640000000000000;

export const PAUSES = [
    { id: 'dia', label: 'Hasta mañana' },
    { id: 'semana', label: 'Una semana' },
    { id: 'mes', label: 'Un mes' },
    { id: 'siempre', label: 'Hasta que yo lo quite' },
];

// Cuándo termina cada opción. «Hasta mañana» acaba a las 7: la primera
// edición del día siguiente ya lo trae de vuelta.
export function pauseUntil(id, now = Date.now()) {
    if (id === 'siempre') return FOREVER;
    if (id === 'dia') {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(7, 0, 0, 0);
        return d.getTime();
    }
    return now + (id === 'mes' ? 30 : 7) * DAY;
}

export const isPaused = (until, now = Date.now()) => Number(until) > now;

// «hasta el 12 de octubre», o «hasta que lo quites».
export function pauseLabel(until, now = Date.now()) {
    if (!isPaused(until, now)) return '';
    if (until >= FOREVER) return 'hasta que lo quites';
    const date = new Date(until);
    const sameDay = date.toDateString() === new Date(now + DAY).toDateString() || date.toDateString() === new Date(now).toDateString();
    return sameDay ? 'hasta mañana' : `hasta el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(date)}`;
}

// Lo que de verdad cuenta ahora para elegir Hoy y para avisar: sin los sitios
// ni los temas en pausa, y con las palabras calladas por un tiempo sumadas a
// las silenciadas para siempre.
export function effective({ sources, settings }, now = Date.now()) {
    const timed = Object.entries(settings?.mutedUntil || {})
        .filter(([, until]) => isPaused(until, now))
        .map(([word]) => word);
    return {
        sources: sources.filter((s) => !isPaused(s.pausedUntil, now)),
        settings: {
            ...settings,
            muted: [...(settings?.muted || []), ...timed],
            topics: (settings?.topics || []).filter((t) => !isPaused(t.pausedUntil, now)),
        },
    };
}

// Las pausas de palabras que ya vencieron se quitan para no acumularlas.
export function liveMutes(mutedUntil, now = Date.now()) {
    return Object.fromEntries(Object.entries(mutedUntil || {}).filter(([, until]) => isPaused(until, now)));
}
