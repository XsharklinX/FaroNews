// Normalización de URLs: la misma noticia llega con parámetros de seguimiento
// distintos según por dónde se enlace, y no debe contarse dos veces.

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$)/i;

export function withScheme(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function resolveUrl(url, base) {
    const value = String(url || '').trim();
    if (!value) return '';
    try {
        return new URL(value, base || undefined).href;
    } catch {
        return '';
    }
}

export function urlKey(url) {
    try {
        const u = new URL(url);
        u.hash = '';
        u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
        for (const name of [...u.searchParams.keys()]) {
            if (TRACKING.test(name)) u.searchParams.delete(name);
        }
        u.searchParams.sort();
        const path = u.pathname.replace(/\/+$/, '');
        const query = u.searchParams.toString();
        return `${u.hostname}${path}${query ? `?${query}` : ''}`;
    } catch {
        return String(url || '').trim();
    }
}
