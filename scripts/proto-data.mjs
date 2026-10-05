// Reúne contenido real (titulares, fotos y logos de sitios del catálogo) para
// las maquetas de diseño. Escribe un JSON con las imágenes incrustadas.
//
//   node scripts/proto-data.mjs <salida.json>

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const { decodeBody } = await import('../src/core/decode.js');
const { parseFeed } = await import('../src/core/feedParser.js');
const { htmlToText, readMinutes, relTime } = await import('../src/core/text.js');
const { chromium } = createRequire(process.env.FARO_PLAYWRIGHT || 'F:/Programacion/$harky/package.json')('playwright');

const WANT = ['Xataka', 'Hipertextual', 'Vandal', '3DJuegos', 'BBC Mundo', 'DW Español', 'El Tiempo', 'Semana', 'Babelia', 'El Cultural', 'El Hilo', 'Marca', 'Espinof', 'Naukas'];
const catalog = JSON.parse(await readFile(new URL('../src/catalog/catalog.json', import.meta.url), 'utf8'));
const catName = (id) => catalog.categories.find((c) => c.id === id)?.name || '';

async function fetchText(url) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Faro/0.1 (lector de feeds)' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') || '');
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 640, height: 400 } });

// Foto recortada a 16:10 y comprimida, como data URI.
async function photo(url, width) {
    const page = await context.newPage();
    try {
        const height = Math.round(width / 1.6);
        await page.setViewportSize({ width, height });
        await page.setContent(`<style>html,body{margin:0}img{display:block;width:${width}px;height:${height}px;object-fit:cover}</style><img src="${url.replace(/"/g, '&quot;')}">`);
        const ok = await page.evaluate(() => new Promise((done) => {
            const img = document.querySelector('img');
            const finish = () => done(img.naturalWidth > 200);
            if (img.complete) finish();
            img.onload = finish;
            img.onerror = () => done(false);
            setTimeout(() => done(img.naturalWidth > 200), 12000);
        }));
        if (!ok) return '';
        const buffer = await page.screenshot({ type: 'jpeg', quality: 62 });
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch {
        return '';
    } finally {
        await page.close();
    }
}

const sources = [];
const stories = [];
for (const name of WANT) {
    const entry = catalog.sources.find((s) => s.name === name && s.cat !== 'video');
    if (!entry) continue;
    try {
        const feed = parseFeed(await fetchText(entry.feed), entry.feed);
        const items = (feed?.items || []).filter((i) => i.title && i.title.length > 30).slice(0, 4);
        if (!items.length) continue;
        let logo = '';
        if (entry.icon?.startsWith('catalog-icons/')) {
            logo = `data:image/png;base64,${(await readFile(new URL(`../public/${entry.icon}`, import.meta.url))).toString('base64')}`;
        }
        sources.push({ name, folder: catName(entry.cat), logo, perDay: entry.perWeek ? Math.max(1, Math.round(entry.perWeek / 7)) : null, unread: items.length * 3 + (name.length % 7) });
        for (const item of items.slice(0, 2)) {
            const text = htmlToText(item.contentHtml);
            const paragraphs = text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“])/).reduce((acc, sentence) => {
                const last = acc[acc.length - 1];
                if (last && last.length < 260) acc[acc.length - 1] = `${last} ${sentence}`;
                else acc.push(sentence);
                return acc;
            }, []).slice(0, 4);
            stories.push({
                source: name,
                folder: catName(entry.cat),
                title: item.title,
                deck: item.summary.slice(0, 150).replace(/\s+\S*$/, '…'),
                author: item.author || '',
                ago: relTime(item.publishedAt || Date.now()),
                minutes: item.duration || readMinutes(text),
                kind: item.kind || '',
                image: item.image || '',
                paragraphs,
            });
        }
        console.log('ok   ', name, items.length);
    } catch (err) {
        console.log('falla', name, err.message);
    }
}

// Las fotos: grande para la que abre, pequeña para el resto.
let lead = true;
for (const story of stories) {
    if (!story.image) continue;
    story.image = await photo(story.image, lead ? 720 : 300);
    if (story.image) lead = false;
}
await browser.close();

const out = { date: new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), sources, stories: stories.filter((s) => s.image || s.kind === 'audio') };
await writeFile(process.argv[2], JSON.stringify(out));
console.log(`${out.stories.length} historias de ${out.sources.length} sitios · ${Math.round(JSON.stringify(out).length / 1024)} KB`);
