// Cómo se enseña un titular y cuánto se tarda en leerlo, según los ajustes del
// usuario. La app llama a setLook() en cada cambio de ajustes; las listas lo
// leen al pintar.

import { baitFix, myMinutes, paceFactor } from '../core/extras2.js';
import { matchKeyword } from '../core/today.js';

let look = { bait: true, translate: true, spoilers: [], pace: 1 };

export function setLook(settings) {
    look = {
        bait: settings.baitFix !== false,
        translate: settings.translateTitles !== false,
        spoilers: settings.spoilers || [],
        pace: paceFactor(settings.pace),
    };
}

export const paceNow = () => look.pace;

// Minutos de lectura a tu ritmo.
export const minutesFor = (article) => myMinutes(article.minutes, look.pace);

// Lo que se enseña de un titular: { title, note, spoiler }.
//   spoiler  palabra del escudo que lo tapa (y el título va borroso)
//   note     «traducido» o «titular cebo»
export function headline(article, revealed) {
    const hit = look.spoilers.length && !revealed?.has(article.id) ? look.spoilers.find((w) => matchKeyword(article, [w])) : null;
    if (hit) return { title: article.title, note: `posible espóiler de ${hit} · toca para verlo`, spoiler: hit };
    if (look.translate && article.titleEs) return { title: article.titleEs, note: 'traducido', original: article.title };
    const fixed = look.bait ? baitFix(article.title, article.summary) : '';
    if (fixed) return { title: fixed, note: 'titular cebo, te dejamos el dato', original: article.title };
    return { title: article.title, note: '' };
}
