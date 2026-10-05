// Comprueba contra la red cada sitio del catálogo y guarda la dirección real
// de su feed. Los feeds caducan: conviene repetirlo antes de publicar.
//
//   node scripts/check-catalog.mjs            solo informa
//   node scripts/check-catalog.mjs --write    guarda el feed de los que funcionan
//   node scripts/check-catalog.mjs --prune    además quita los que fallan
//   node scripts/check-catalog.mjs --report informe.md   deja la lista de fallos en un archivo
//
// Si algún sitio falla, termina con código 1: así la revisión semanal
// automática (.github/workflows/catalogo.yml) puede avisar.
//
// Usa el mismo User-Agent y el mismo código de descubrimiento que la app, así
// que lo que pasa aquí es lo que verá el usuario.

import { readFile, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const { decodeBody } = await import('../src/core/decode.js');
const { discoverFeed, perWeek, readSource, youtubeFeedFromHtml } = await import('../src/core/discover.js');
const { iconCandidates } = await import('../src/core/icon.js');

const FILE = new URL('../src/catalog/catalog.json', import.meta.url);
const STALE_DAYS = 45;
const write = process.argv.includes('--write') || process.argv.includes('--prune');
const prune = process.argv.includes('--prune');
const reportAt = process.argv.indexOf('--report');
const reportFile = reportAt > -1 ? process.argv[reportAt + 1] : '';

async function fetchText(url) {
    const res = await fetch(url, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'Faro/0.1 (lector de feeds)',
            Accept: 'application/rss+xml, application/atom+xml, application/feed+json, text/html;q=0.9, */*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { text: decodeBody(bytes, res.headers.get('content-type') || ''), url: res.url };
}

// Primer icono candidato que de verdad responde con una imagen.
async function resolveIcon(siteUrl) {
    try {
        const page = await fetchText(siteUrl);
        for (const url of iconCandidates(page.text, page.url)) {
            try {
                const res = await fetch(url, { headers: { 'User-Agent': 'Faro/0.1 (lector de feeds)' }, signal: AbortSignal.timeout(10000) });
                const type = res.headers.get('content-type') || '';
                const bytes = (await res.arrayBuffer()).byteLength;
                if (res.ok && bytes > 200 && (/image|icon|octet-stream/i.test(type) || /\.(png|ico|svg|jpe?g|webp)(\?|$)/i.test(url))) return url;
            } catch {
                // Se prueba el siguiente.
            }
        }
    } catch {
        // Sin portada no hay logo.
    }
    return '';
}

async function check(source) {
    try {
        // Una entrada ya comprobada se relee tal cual; una nueva se descubre.
        const { feedUrl, feed, kind = source.feed ? source.kind || '' : '' } = source.feed && source.kind === 'page'
            ? { feedUrl: source.feed, kind: 'page', feed: readSource((await fetchText(source.feed)).text, source.feed, 'page') || { items: [] } }
            : await discoverFeed(source.feed || source.url, fetchText);
        const dates = feed.items.map((i) => i.publishedAt).filter(Boolean);
        const ageDays = dates.length ? (Date.now() - Math.max(...dates)) / 86400000 : null;
        if (!feed.items.length) return { ok: false, why: 'feed vacío' };
        if (ageDays !== null && ageDays > STALE_DAYS) return { ok: false, why: `sin publicar desde hace ${Math.round(ageDays)} días` };
        const site = feed.siteUrl || new URL(feedUrl).origin;
        const media = feed.items[0]?.kind || '';
        return { ok: true, feedUrl, kind, media, title: feed.title || '', site, icon: await resolveIcon(site), items: feed.items.length, perWeek: perWeek(feed.items) };
    } catch (err) {
        // YouTube limita su servicio de feeds a ratos. El id del canal sale de
        // su página, así que la dirección del feed es segura aunque hoy no conteste.
        if (err.message === 'YOUTUBE_BUSY') {
            const start = source.feed || source.url;
            const feedUrl = start.includes('/feeds/videos.xml') ? start : youtubeFeedFromHtml((await fetchText(start)).text);
            if (feedUrl) return { ok: true, unverified: true, feedUrl, kind: '', media: 'video', title: '', site: source.site || start, icon: source.icon || (await resolveIcon(start)), items: 0, perWeek: source.perWeek ?? null };
        }
        return { ok: false, why: err.message };
    }
}

const catalog = JSON.parse(await readFile(FILE, 'utf8'));
const queue = catalog.sources.map((source) => ({ source }));
const results = [];
await Promise.all(
    Array.from({ length: 8 }, async () => {
        while (queue.length) {
            const job = queue.shift();
            results.push({ source: job.source, ...(await check(job.source)) });
        }
    })
);

const failed = results.filter((r) => !r.ok);
for (const r of results.filter((x) => x.ok)) {
    console.log(`ok    ${(r.kind === 'page' ? 'PÁGINA' : r.media || 'feed').padEnd(6)} ${r.source.cat.padEnd(11)} ${r.source.name.padEnd(24)} ${String(r.items).padStart(3)} items  ${String(r.perWeek ?? '?').padStart(4)}/sem  ${r.feedUrl}`);
}
// Una palabra del nombre debería aparecer en el título de lo encontrado.
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
for (const r of results.filter((x) => x.ok)) {
    const words = plain(r.source.name).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    if (r.title && words.length && !words.some((w) => plain(r.title + r.feedUrl).includes(w))) {
        console.log(`OJO   ${r.source.name.padEnd(24)} se encontró «${r.title}» (${r.feedUrl})`);
    }
    if (r.source.cat === 'podcasts' && r.media !== 'audio') console.log(`OJO   ${r.source.name.padEnd(24)} está en Podcasts pero no trae audio (${r.feedUrl})`);
    if (r.source.cat === 'video' && r.media !== 'video') console.log(`OJO   ${r.source.name.padEnd(24)} está en YouTube pero no trae vídeos (${r.feedUrl})`);
}
for (const r of results.filter((x) => x.unverified)) console.log(`SIN COMPROBAR ${r.source.name.padEnd(20)} YouTube no contestó; se guarda por el id del canal (${r.feedUrl})`);
for (const r of failed) console.log(`FALLA ${r.source.cat.padEnd(11)} ${r.source.name.padEnd(24)} ${r.why}`);
console.log(`\n${results.length - failed.length} de ${results.length} funcionan. Con logo: ${results.filter((r) => r.ok && r.icon).length}.`);
for (const r of results.filter((x) => x.ok && !x.icon)) console.log(`sin logo: ${r.source.name} (${r.site})`);

if (write) {
    for (const r of results) {
        if (r.ok) {
            r.source.feed = r.feedUrl;
            if (r.kind) r.source.kind = r.kind;
            else delete r.source.kind;
            delete r.source.url;
            r.source.site = r.site;
            // Los logos del catálogo se guardan con `pnpm catalog:icons`; aquí solo
            // se rellena el de un sitio nuevo que todavía no tiene.
            if (!r.source.icon && r.icon) r.source.icon = r.icon;
            if (r.perWeek) r.source.perWeek = r.perWeek;
        }
    }
    // La fecha es lo que la app compara para saber si este catálogo es más nuevo que el suyo.
    catalog.updated = new Date().toISOString().slice(0, 10);
    if (prune) {
        const bad = new Set(failed.map((r) => r.source));
        catalog.sources = catalog.sources.filter((s) => !bad.has(s));
    }
    await writeFile(FILE, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(prune ? `Guardado. Se quitaron ${failed.length}.` : 'Guardado.');
}

if (reportFile) {
    const lines = failed.map((r) => `- **${r.source.name}** (${r.source.cat}): ${r.why} — ${r.source.feed || r.source.url}`);
    await writeFile(reportFile, `${results.length - failed.length} de ${results.length} sitios del catálogo responden.

${lines.length ? `Fallan ${lines.length}:

${lines.join('
')}` : 'Ninguno falla.'}
`);
}
process.exit(failed.length ? 1 : 0);
