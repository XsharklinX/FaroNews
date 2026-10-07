// Qué dice la gente de un artículo: hilos de Hacker News y Reddit que lo
// enlazan. Solo se pregunta por la dirección del artículo, y solo cuando el
// usuario lo pide.

import { hnComments, hnThreads, redditThreads } from '../core/extras3.js';
import { fetchText } from './http.js';

const json = async (url) => JSON.parse((await fetchText(url)).text);

// { threads: [...], comments: [...] , reddit: 'ok' | 'bloqueado' }. Los
// comentarios son los primeros del hilo más comentado de Hacker News.
export async function whoTalks(articleUrl) {
    const [hn, rd] = await Promise.allSettled([
        json(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(articleUrl)}&restrictSearchableAttributes=url&hitsPerPage=10`),
        // Reddit rechaza a veces a quien no es un navegador: si falla, se ofrece su buscador.
        json(`https://www.reddit.com/api/info.json?url=${encodeURIComponent(articleUrl)}&limit=10`),
    ]);
    const threads = [...(hn.status === 'fulfilled' ? hnThreads(hn.value, articleUrl) : []), ...(rd.status === 'fulfilled' ? redditThreads(rd.value) : [])].sort((a, b) => b.comments - a.comments);
    let comments = [];
    const top = threads.find((t) => t.where === 'Hacker News');
    if (top) {
        try {
            comments = hnComments(await json(`https://hn.algolia.com/api/v1/items/${top.id}`));
        } catch {
            // Sin comentarios: se enseñan solo los hilos.
        }
    }
    return { threads, comments, reddit: rd.status === 'fulfilled' ? 'ok' : 'bloqueado', redditSearch: `https://www.reddit.com/search/?q=${encodeURIComponent(`url:${articleUrl}`)}` };
}
