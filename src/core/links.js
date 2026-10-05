// Qué hacer con un enlace que aparece dentro de un artículo: leerlo en Faro,
// abrirlo fuera o no hacer nada.

import { urlKey } from './url.js';

// Sitios que no son artículos: vídeo, redes, tiendas. Se abren en su app.
const OUT_HOSTS = /(^|\.)(youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|facebook\.com|tiktok\.com|whatsapp\.com|t\.me|spotify\.com|twitch\.tv|play\.google\.com|apps\.apple\.com|amazon\.[a-z.]+|amzn\.to|maps\.google\.[a-z.]+)$/i;
const FILES = /\.(pdf|zip|rar|7z|apk|exe|dmg|jpe?g|png|gif|webp|svg|mp3|mp4|m4a|mov|avi|docx?|xlsx?|pptx?)$/i;

// Por debajo de esto no es un artículo: es una portada, un aviso o un muro de pago.
export const MIN_READABLE = 600;

// 'faro' = intentar leerlo aquí, 'fuera' = navegador u otra app, 'nada' = es
// un salto dentro del mismo artículo.
export function linkPlan(href, current = '') {
    let url;
    try {
        url = new URL(href);
    } catch {
        return 'nada';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'fuera';
    if (current && urlKey(href) === urlKey(current)) return 'nada';
    if (OUT_HOSTS.test(url.hostname) || FILES.test(url.pathname)) return 'fuera';
    // La portada de un sitio no es una noticia.
    if (url.pathname.replace(/\/+$/, '') === '') return 'fuera';
    return 'faro';
}
