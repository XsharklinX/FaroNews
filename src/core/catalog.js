// El catálogo viene dentro de la app y, si quien la publica lo aloja en una
// dirección, también se puede traer de la red. Aquí se decide cuál vale.

export const CATALOG_EVERY = 7 * 86400000;
const MIN_SOURCES = 50;

// Un catálogo descargado solo se acepta si tiene la forma esperada: uno roto
// dejaría la app sin sitios que ofrecer.
export function validCatalog(data) {
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.countries) || !Array.isArray(data.sources)) return false;
    if (!data.categories.length || data.sources.length < MIN_SOURCES) return false;
    const cats = new Set(data.categories.map((c) => c?.id));
    return data.categories.every((c) => c?.id && c?.name) && data.sources.every((s) => s?.name && s?.feed && cats.has(s.cat));
}

// De dos catálogos, el más reciente; si el candidato no vale o no es más
// nuevo, se queda el que ya había.
export function newerCatalog(current, candidate) {
    if (!validCatalog(candidate)) return current;
    return String(candidate.updated || '') > String(current.updated || '') ? candidate : current;
}
