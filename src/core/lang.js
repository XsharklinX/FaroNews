// Idioma de un texto, a ojo, y traducción de un artículo párrafo a párrafo.
// La traducción en sí la hace el teléfono (ports/background.js); aquí solo se
// decide qué se traduce y cómo se recompone el artículo.

const EN = new Set('the of and to in is that for with on as was are by this from at be have has it its an will their not but which they were been can more about into than who what when after over new his her you we our your'.split(' '));
const ES = new Set('el la los las de del que y en un una por con para se su sus es al lo como más pero fue son ha han no sí este esta estos entre cuando sobre también ya desde hasta muy sin porque nos según qué cómo'.split(' '));

// ¿Está en inglés? Compara cuántas palabras muy comunes de cada idioma aparecen.
export function looksEnglish(text) {
    const words = String(text || '').toLowerCase().match(/[a-záéíóúñü']+/g) || [];
    if (words.length < 6) return false;
    let en = 0;
    let es = 0;
    for (const word of words) {
        if (EN.has(word)) en++;
        if (ES.has(word)) es++;
    }
    return en >= 2 && en > es * 2;
}

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th';

// Traduce el texto de cada párrafo, título y punto de lista. `translate` recibe
// la lista de textos y devuelve la misma lista traducida. Dentro de un párrafo
// se pierden los enlaces y las negritas: es el precio de traducir frases enteras.
export async function translateHtml(html, translate) {
    const doc = new DOMParser().parseFromString(`<div id="raiz">${html || ''}</div>`, 'text/html');
    const root = doc.getElementById('raiz');
    const targets = [...root.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS) && el.textContent.trim().length > 1);
    if (!targets.length) return html;
    const texts = targets.map((el) => el.textContent.replace(/\s+/g, ' ').trim());
    const out = await translate(texts);
    targets.forEach((el, i) => {
        // Las fotos de dentro del párrafo se conservan, delante del texto.
        const images = [...el.querySelectorAll('img')];
        el.textContent = out[i] || texts[i];
        for (const img of images.reverse()) el.prepend(img);
    });
    return root.innerHTML;
}
