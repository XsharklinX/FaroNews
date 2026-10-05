// Descarga el logo de cada sitio del catálogo y lo deja dentro de la app, en
// public/catalog-icons/, como PNG de 96 px. Así los logos se ven siempre: sin
// conexión, sin depender de que el sitio deje enlazar su icono y sin pedir nada
// a terceros.
//
//   node scripts/catalog-icons.mjs            rehace todos
//   node scripts/catalog-icons.mjs --missing  solo los que faltan
//
// Necesita Playwright con Chromium para pintar cada icono (ico, svg, png…) a
// un tamaño común. No es una dependencia de Faro: se toma de otro proyecto de
// este equipo, o de la ruta que diga FARO_PLAYWRIGHT.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const { decodeBody } = await import('../src/core/decode.js');
const { iconCandidates } = await import('../src/core/icon.js');
const { chromium } = createRequire(process.env.FARO_PLAYWRIGHT || 'F:/Programacion/$harky/package.json')('playwright');

const FILE = new URL('../src/catalog/catalog.json', import.meta.url);
const OUT = new URL('../public/catalog-icons/', import.meta.url);
const SIZE = 96;
const MIN = 32;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Mobile Safari/537.36';

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function pageOf(url) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') || ''), url: res.url };
}

const catalog = JSON.parse(await readFile(FILE, 'utf8'));
// Con --missing solo se buscan los logos que faltan; sin él se rehacen todos.
const onlyMissing = process.argv.includes('--missing');
if (!onlyMissing) await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, userAgent: UA });

// Pinta el primer candidato que cargue con tamaño suficiente.
async function render(urls, file) {
    for (const url of urls) {
        const page = await context.newPage();
        try {
            await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${SIZE}px;height:${SIZE}px;object-fit:contain}</style><img src="${url.replace(/"/g, '&quot;')}">`);
            const width = await page.evaluate(
                () =>
                    new Promise((done) => {
                        const img = document.querySelector('img');
                        const finish = () => done(img.naturalWidth);
                        if (img.complete) finish();
                        img.onload = finish;
                        img.onerror = () => done(0);
                        setTimeout(() => done(img.naturalWidth), 12000);
                    })
            );
            if (width >= MIN) {
                await writeFile(new URL(file, OUT), await page.locator('img').screenshot({ omitBackground: true }));
                return true;
            }
        } catch {
            // Se prueba el siguiente candidato.
        } finally {
            await page.close();
        }
    }
    return false;
}

let done = 0;
const missing = [];
const queue = catalog.sources.filter((source) => !onlyMissing || !String(source.icon || '').startsWith('catalog-icons/'));
done = catalog.sources.length - queue.length;
await Promise.all(
    Array.from({ length: 6 }, async () => {
        while (queue.length) {
            const source = queue.shift();
            const file = `${slug(source.name)}-${source.country || source.cat}.png`;
            let ok = false;
            try {
                // Un canal de YouTube tiene su avatar en la página del canal, no en el feed.
                const start = source.cat === 'video' && source.feed.includes('channel_id=') ? `https://www.youtube.com/channel/${source.feed.split('channel_id=')[1]}` : source.site;
                const page = await pageOf(start);
                ok = await render(iconCandidates(page.text, page.url), file);
            } catch {
                ok = false;
            }
            // Segunda vía, solo aquí al preparar el catálogo (nunca desde el
            // teléfono del usuario): el servicio de iconos de Google, probando
            // el dominio del sitio y el de su feed, con y sin subdominio.
            if (!ok) {
                const hosts = new Set();
                for (const url of [source.site, source.feed]) {
                    try {
                        const host = new URL(url).hostname.replace(/^www\./, '');
                        hosts.add(host);
                        const parts = host.split('.');
                        if (parts.length > 2) hosts.add(parts.slice(1).join('.'));
                    } catch {
                        // Dirección no válida.
                    }
                }
                ok = await render([...hosts].map((h) => `https://www.google.com/s2/favicons?domain=${h}&sz=128`), file);
            }
            if (ok) {
                source.icon = `catalog-icons/${file}`;
                done++;
            } else {
                delete source.icon;
                missing.push(source.name);
            }
        }
    })
);
await browser.close();

await writeFile(FILE, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${done} de ${catalog.sources.length} sitios con logo guardado.`);
if (missing.length) console.log(`Sin logo (se quedan con sus iniciales): ${missing.join(', ')}`);
