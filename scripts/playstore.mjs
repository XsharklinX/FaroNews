// Genera el material gráfico de la ficha de Google Play en playstore/:
//
//   playstore/icono-512.png              icono de la ficha (512 × 512)
//   playstore/grafico-1024x500.png       gráfico de funciones
//   playstore/capturas/01-….png          capturas de teléfono (1080 × 1920)
//
//   pnpm playstore
//
// Las capturas salen de la app de verdad, con contenido real de ese momento:
// el script arranca el servidor de desarrollo, recorre la app y compone cada
// pantalla sobre un fondo con su frase. Necesita Playwright con Chromium, que
// no es dependencia de Faro: se toma de otro proyecto de este equipo o de la
// ruta que diga FARO_PLAYWRIGHT.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'playstore');
const SHOTS = join(OUT, 'capturas');
const URL_APP = 'http://localhost:5174/';
const { chromium } = createRequire(process.env.FARO_PLAYWRIGHT || 'F:/Programacion/$harky/package.json')('playwright');

const font = (pkg, file) => readFileSync(join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', file)).toString('base64');
const FONTS = `
@font-face { font-family: Titular; font-weight: 200 800; src: url(data:font/woff2;base64,${font('newsreader', 'newsreader-latin-wght-normal.woff2')}) format('woff2'); }
@font-face { font-family: Interfaz; font-weight: 100 900; src: url(data:font/woff2;base64,${font('hanken-grotesk', 'hanken-grotesk-latin-wght-normal.woff2')}) format('woff2'); }`;
const TOWER = `<g stroke-width="10" stroke-linejoin="round"><path d="M184 136h44l8 248h-60z" fill="#F4F7FB" stroke="#F4F7FB"/><path d="M262 142l110-22v76l-110-22z" fill="#FFC53D" stroke="#FFC53D"/><path d="M262 234l70-14v60l-70-14z" fill="#FFC53D" stroke="#FFC53D"/></g>`;

// Las pantallas de la ficha, en el orden en que se verán, con su frase.
const SCREENS = [
    ['hoy', 'Lo esencial de hoy, en una lista que se termina'],
    ['lector', 'Lee sin anuncios ni distracciones'],
    ['catalogo', 'Casi 300 sitios elegidos, por tema y por país'],
    ['vista-previa', 'Mira qué publica un sitio antes de seguirlo'],
    ['explorar', 'Todo lo recibido, con buscador en el texto'],
    ['fuentes', 'Tú decides cuánto entra de cada sitio'],
    ['ajustes', 'Letra, tamaño y fondo a tu manera'],
    ['al-dia', 'Y cuando terminas, terminas'],
];

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(URL_APP)).ok) return;
        } catch {
            // Aún arrancando.
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('El servidor de desarrollo no arrancó.');
}

// Espera a que las fotos a la vista hayan cargado, para no capturar huecos grises.
const settle = (page, ms = 9000) =>
    page
        .waitForFunction(
            () =>
                [...document.querySelectorAll('img')]
                    .filter((img) => {
                        const r = img.getBoundingClientRect();
                        return r.bottom > 0 && r.top < innerHeight && r.width > 30;
                    })
                    .every((img) => img.complete),
            null,
            { timeout: ms }
        )
        .catch(() => {})
        .then(() => page.waitForTimeout(500));

async function capture(browser) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, colorScheme: 'light', hasTouch: true, locale: 'es-ES' });
    const page = await ctx.newPage();
    const raw = {};
    const shot = async (name) => {
        await settle(page);
        raw[name] = (await page.screenshot({ type: 'png' })).toString('base64');
        console.log('  pantalla', name);
    };

    await page.goto(URL_APP);
    await page.waitForSelector('.onb');
    for (const topic of ['Tecnología', 'Ciencia', 'Gaming', 'Cine y cultura']) await page.click(`.onb-chip:has-text("${topic}")`);
    await page.click('text=/Armar mi Hoy/');
    await page.waitForSelector('.lead', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.click('.tips >> text=Entendido').catch(() => {});
    await shot('hoy');

    await page.click('.lead-main');
    await page.waitForSelector('.prose', { timeout: 30000 });
    await page.waitForTimeout(2500);
    await shot('lector');
    await page.click('.reader [aria-label="Volver"]');

    await page.click('nav >> text=Explorar');
    await shot('explorar');

    await page.click('nav >> text=Fuentes');
    await shot('fuentes');
    await page.evaluate(() => document.querySelector('.main').scrollTo(0, 99999));
    await page.click('text=Explorar el catálogo');
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('.overlay').scrollTo(0, 300));
    await shot('catalogo');
    await page.fill('#buscar-catalogo', 'Kudasai');
    await page.locator('.overlay .cat-main').first().click();
    await page.waitForSelector('.peek-item', { timeout: 30000 });
    await shot('vista-previa');
    await page.click('.sheet [aria-label="Cerrar"]');
    await page.fill('#buscar-catalogo', '');
    await page.click('.overlay [aria-label="Volver"]');

    await page.click('.top [aria-label="Ajustes"]');
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('.overlay').scrollTo(0, 150));
    await shot('ajustes');
    await page.click('.overlay [aria-label="Volver"]');

    // Estás al día: se da por leída la edición entera.
    await page.click('nav >> text=Hoy');
    for (let i = 0; i < 8 && (await page.locator('.sec button').count()); i++) await page.locator('.sec button').first().click();
    if (await page.locator('.lead-main').count()) {
        await page.click('.lead-main');
        await page.waitForTimeout(800);
        await page.click('.reader [aria-label="Volver"]');
    }
    await page.waitForSelector('.aldia', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('.main').scrollTo(0, 0));
    await page.waitForTimeout(4500); // a que se vaya el aviso de «marcadas como leídas»
    await shot('al-dia');
    await ctx.close();
    return raw;
}

async function render(browser, html, width, height, file) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${FONTS} html,body{margin:0}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    writeFileSync(file, await page.screenshot({ type: 'png', omitBackground: false }));
    await page.close();
}

const framed = (image, caption) => `
<style>
  .lienzo { width: 1080px; height: 1920px; background: #0A1326; overflow: hidden; position: relative; font-family: Interfaz, sans-serif; }
  .haz { position: absolute; inset: 0; }
  h1 { position: absolute; left: 84px; right: 84px; top: 118px; margin: 0; font: 600 78px/1.08 Titular, serif; letter-spacing: -0.02em; color: #FFFFFF; text-wrap: balance; }
  .marca { position: absolute; left: 84px; top: 56px; display: flex; align-items: center; gap: 12px; font: 600 30px Interfaz, sans-serif; color: #FFC53D; }
  .movil { position: absolute; left: 120px; top: 500px; width: 840px; border-radius: 64px; padding: 14px; background: #1B2A4F; box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55); }
  .movil img { display: block; width: 100%; border-radius: 52px; }
</style>
<div class="lienzo">
  <svg class="haz" viewBox="0 0 1080 1920"><path d="M-40 250 L1080 760 V1500 Z" fill="#FFC53D" opacity="0.07"/><path d="M-40 250 L1080 980 V1300 Z" fill="#FFC53D" opacity="0.06"/></svg>
  <div class="marca"><svg width="26" height="34" viewBox="150 110 230 290">${TOWER}</svg>Faro</div>
  <h1>${caption}</h1>
  <div class="movil"><img src="data:image/png;base64,${image}"></div>
</div>`;

const feature = `
<style>
  .g { width: 1024px; height: 500px; background: #0A1326; position: relative; overflow: hidden; }
  .g h1 { position: absolute; left: 372px; top: 132px; margin: 0; font: 600 132px/1 Titular, serif; letter-spacing: -0.03em; color: #FFFFFF; }
  .g p { position: absolute; left: 378px; top: 286px; margin: 0; width: 560px; font: 500 34px/1.25 Interfaz, sans-serif; color: #C9D3E6; }
</style>
<div class="g">
  <svg width="1024" height="500" viewBox="0 0 1024 500" style="position:absolute;inset:0"><path d="M262 148 L1024 -40 V240 Z" fill="#FFC53D" opacity="0.10"/><path d="M262 232 L1024 300 V520 Z" fill="#FFC53D" opacity="0.07"/></svg>
  <svg width="300" height="378" viewBox="150 110 230 290" style="position:absolute;left:70px;top:62px">${TOWER}</svg>
  <h1>Faro</h1>
  <p>Las noticias de los sitios que te importan, en una lista que se termina.</p>
</div>`;

// El icono de la ficha va a sangre: Google Play le pone las esquinas.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" style="display:block"><rect width="512" height="512" fill="#0F1B33"/><g transform="translate(-18 4)">${TOWER}</g></svg>`;

const server = spawn('pnpm', ['dev'], { cwd: ROOT, shell: true, stdio: 'ignore' });
const stop = () => {
    try {
        if (process.platform === 'win32') execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: 'ignore' });
        else server.kill();
    } catch {
        // Ya estaba parado.
    }
};

try {
    await waitForServer();
    rmSync(SHOTS, { recursive: true, force: true });
    mkdirSync(SHOTS, { recursive: true });
    const browser = await chromium.launch();
    console.log('Recorriendo la app…');
    const raw = await capture(browser);
    console.log('Componiendo…');
    let n = 0;
    for (const [name, caption] of SCREENS) {
        n += 1;
        await render(browser, framed(raw[name], caption), 1080, 1920, join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`));
    }
    await render(browser, feature, 1024, 500, join(OUT, 'grafico-1024x500.png'));
    await render(browser, icon, 512, 512, join(OUT, 'icono-512.png'));
    await browser.close();
    console.log(`Listo: ${n} capturas, el gráfico y el icono en playstore/`);
} finally {
    stop();
}
