// Prueba contra la red cómo seguiría Faro una o varias direcciones, con el
// mismo código y el mismo User-Agent que la app.
//
//   node scripts/try-source.mjs https://www.youtube.com/@canal https://sitio.com

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const { decodeBody } = await import('../src/core/decode.js');
const { discoverFeed } = await import('../src/core/discover.js');

async function fetchText(url) {
    const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Faro/0.1 (lector de feeds)', Accept: 'application/rss+xml, application/atom+xml, application/feed+json, text/html;q=0.9, */*;q=0.8' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') || ''), url: res.url };
}

for (const site of process.argv.slice(2)) {
    try {
        const { feedUrl, feed, kind } = await discoverFeed(site, fetchText);
        const first = feed.items[0];
        console.log(`OK    ${site}`);
        console.log(`      ${kind === 'page' ? 'sin feed, titulares de la página' : 'feed'}: ${feedUrl}`);
        console.log(`      «${feed.title}» · ${feed.items.length} entradas · primera [${first?.kind || 'artículo'}]: ${first?.title?.slice(0, 80)}`);
        console.log(`      imagen: ${first?.image ? 'sí' : 'no'} · audio: ${first?.audio ? 'sí' : 'no'} · duración: ${first?.duration ?? '-'}`);
    } catch (err) {
        console.log(`FALLA ${site}: ${err.message}`);
    }
}
