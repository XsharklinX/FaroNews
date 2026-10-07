// Ficha corta de Wikipedia en español para un nombre o un término. Solo se
// pregunta por la palabra que el usuario tocó.

import { norm } from '../core/text.js';
import { fetchText } from './http.js';

const API = 'https://es.wikipedia.org';

async function json(url) {
    return JSON.parse((await fetchText(url)).text);
}

// { title, extract, image, url } o null si Wikipedia no tiene nada.
export async function wikiSummary(term) {
    const clean = String(term || '').replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    // Primero se busca la página que mejor encaja, por si el texto no es el título exacto.
    let title = clean;
    try {
        const found = await json(`${API}/w/api.php?action=opensearch&search=${encodeURIComponent(clean)}&limit=1&namespace=0&format=json`);
        if (found?.[1]?.[0]) title = found[1][0];
        else return null;
    } catch {
        // Si la búsqueda falla se prueba con el texto tal cual.
    }
    try {
        const page = await json(`${API}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
        if (!page?.extract || page.type === 'disambiguation') return null;
        // `exact`: la página se llama como lo seleccionado; si no, es solo lo más parecido.
        return { exact: norm(page.title).includes(norm(clean)) || norm(clean).includes(norm(page.title)), title: page.title, extract: page.extract, image: page.thumbnail?.source || '', url: page.content_urls?.mobile?.page || `${API}/wiki/${encodeURIComponent(title)}` };
    } catch {
        return null;
    }
}
