import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, buildBackup, parseBackup, planRestore } from './backup.js';
import { imageFileName, imagesOf, localizeImages, planEviction } from './images.js';
import { buildToday } from './today.js';
import { urlKey } from './url.js';
import { db, DB_NAME, splitArticle } from '../ports/db.js';

describe('migración de la base de datos', () => {
    it('pasa el texto de los artículos de la versión 1 a su propio almacén', async () => {
        // Base de datos tal como la dejaba la versión 0.2.
        const v1 = await openDB(DB_NAME, 1, {
            upgrade(d) {
                d.createObjectStore('sources', { keyPath: 'id' });
                d.createObjectStore('articles', { keyPath: 'id' });
                d.createObjectStore('meta');
            },
        });
        await v1.put('articles', { id: 'a', title: 'Uno', image: '', contentHtml: '<p>Hola <img src="https://sitio.example/f.jpg"></p>', fullHtml: '<p>Completo</p>', saved: true });
        await v1.put('articles', { id: 'b', title: 'Dos', image: 'https://sitio.example/ya.jpg', contentHtml: '<p>Corto</p>', fullHtml: '' });
        await v1.put('meta', { theme: 'dark' }, 'settings');
        v1.close();

        const articles = await db.all('articles');
        const a = articles.find((x) => x.id === 'a');
        expect(a).toMatchObject({ title: 'Uno', saved: true, full: true, image: 'https://sitio.example/f.jpg', chars: 4 });
        expect(a.contentHtml).toBeUndefined();
        expect(a.fullHtml).toBeUndefined();
        expect(articles.find((x) => x.id === 'b')).toMatchObject({ full: false, image: 'https://sitio.example/ya.jpg' });

        expect(await db.get('bodies', 'a')).toEqual({ id: 'a', contentHtml: '<p>Hola <img src="https://sitio.example/f.jpg"></p>', fullHtml: '<p>Completo</p>' });
        expect(await db.getMeta('settings')).toEqual({ theme: 'dark' });
        await db.close();
    });

    it('separa datos y texto', () => {
        const { meta, body } = splitArticle({ id: 'x', title: 'T', contentHtml: '<p>Texto</p>' });
        expect(meta).toMatchObject({ id: 'x', title: 'T', full: false, chars: 5 });
        expect(body).toEqual({ id: 'x', contentHtml: '<p>Texto</p>', fullHtml: '' });
    });
});

describe('copia de seguridad', () => {
    const sources = [{ id: 's1', title: 'Sitio', feedUrl: 'https://sitio.example/feed', folder: 'Tecnología', level: 'importante', failCount: 2 }];
    const articles = [
        { id: 'a1', sourceId: 's1', url: 'https://sitio.example/a', urlKey: urlKey('https://sitio.example/a'), title: 'Guardado', saved: true, highlights: [{ id: 'h1', text: 'cita', note: 'nota' }] },
        { id: 'a2', sourceId: 's1', url: 'https://sitio.example/b', urlKey: urlKey('https://sitio.example/b'), title: 'De paso', saved: false },
    ];
    const settings = { topics: [{ id: 't1', name: 'Godot', words: ['godot'] }], muted: ['fútbol'], theme: 'dark' };
    const backup = buildBackup({ sources, articles, settings, habits: { s1: { o: 3, s: 1, d: 0 }, borrada: { o: 9, s: 0, d: 0 } }, bodies: new Map([['a1', { contentHtml: '<p>c</p>', fullHtml: '<p>f</p>' }]]), version: '0.3.0' });

    it('copia fuentes, ajustes y solo los artículos guardados o resaltados', () => {
        expect(backup.format).toBe(BACKUP_FORMAT);
        expect(backup.sources).toEqual([{ title: 'Sitio', feedUrl: 'https://sitio.example/feed', folder: 'Tecnología', level: 'importante' }]);
        expect(backup.articles).toHaveLength(1);
        expect(backup.articles[0]).toMatchObject({ title: 'Guardado', feedUrl: 'https://sitio.example/feed', fullHtml: '<p>f</p>' });
        expect(backup.habits).toEqual({ 'https://sitio.example/feed': { o: 3, s: 1, d: 0 } });
    });

    it('se restaura en un teléfono vacío', () => {
        const plan = planRestore(parseBackup(JSON.stringify(backup)), { sources: [], articles: [], settings: { topics: [], muted: [] } });
        expect(plan.newSources).toHaveLength(1);
        expect(plan.newArticles).toHaveLength(1);
        expect(plan.settings).toMatchObject({ theme: 'dark', muted: ['fútbol'], onboarded: true });
        expect(plan.settings.topics.map((t) => t.name)).toEqual(['Godot']);
    });

    it('se fusiona con lo que ya hay sin duplicar ni borrar', () => {
        const current = {
            sources: [{ id: 'x', feedUrl: 'https://www.sitio.example/feed/' }],
            articles: [{ id: 'y', urlKey: urlKey('https://sitio.example/a'), saved: false, highlights: [{ id: 'h0', text: 'mía' }] }],
            settings: { topics: [{ id: 't9', name: 'godot', words: ['godot'] }, { id: 't8', name: 'Rust', words: ['rust'] }], muted: ['toros'] },
        };
        const plan = planRestore(backup, current);
        expect(plan.newSources).toHaveLength(0);
        expect(plan.newArticles).toHaveLength(0);
        expect(plan.mergeArticles).toEqual([{ id: 'y', saved: true, highlights: [{ id: 'h0', text: 'mía' }, { id: 'h1', text: 'cita', note: 'nota' }] }]);
        expect(plan.settings.topics.map((t) => t.name)).toEqual(['godot', 'Rust']);
        expect(plan.settings.muted).toEqual(['toros', 'fútbol']);
    });

    it('rechaza archivos que no son una copia, o de una versión más nueva', () => {
        expect(() => parseBackup('hola')).toThrow('no es una copia');
        expect(() => parseBackup('{"format":"otra"}')).toThrow('no es una copia');
        expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow('más nueva');
    });
});

describe('imágenes sin conexión', () => {
    it('elige la portada y las primeras del texto, sin repetir', () => {
        const html = '<img src="https://a.example/1.jpg"><img src="http://inseguro.example/2.jpg"><img src="https://a.example/1.jpg"><img src="https://a.example/3.png?x=1&amp;y=2">';
        expect(imagesOf({ image: 'https://a.example/portada.jpg' }, html)).toEqual(['https://a.example/portada.jpg', 'https://a.example/1.jpg', 'https://a.example/3.png?x=1&y=2']);
        expect(imagesOf({ image: '' }, '')).toEqual([]);
    });

    it('borra las más antiguas hasta caber en el espacio reservado', () => {
        const entries = [
            { url: 'nueva', size: 40, at: 3 },
            { url: 'vieja', size: 40, at: 1 },
            { url: 'media', size: 40, at: 2 },
        ];
        expect(planEviction(entries, 100).map((e) => e.url)).toEqual(['vieja']);
        expect(planEviction(entries, 200)).toEqual([]);
    });

    it('cambia en el texto solo las imágenes que tienen copia', () => {
        const html = '<p><img alt="" src="https://a.example/1.jpg"><img src="https://a.example/2.jpg"></p>';
        const out = localizeImages(html, (url) => (url.endsWith('1.jpg') ? 'https://localhost/_capacitor_file_/img/x.jpg' : ''));
        expect(out).toBe('<p><img alt="" src="https://localhost/_capacitor_file_/img/x.jpg"><img src="https://a.example/2.jpg"></p>');
    });

    it('da a cada dirección un nombre de archivo estable', () => {
        expect(imageFileName('https://a.example/foto.JPG?w=1')).toBe(imageFileName('https://a.example/foto.JPG?w=1'));
        expect(imageFileName('https://a.example/foto.JPG?w=1')).toMatch(/^[a-z0-9]+\.jpg$/);
        expect(imageFileName('https://a.example/1.jpg')).not.toBe(imageFileName('https://a.example/2.jpg'));
    });
});

describe('rendimiento', () => {
    it('arma Hoy con miles de artículos en una fracción de segundo', () => {
        const now = Date.parse('2026-10-03T12:00:00');
        const sources = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, level: 'todo', folder: `c${i % 8}` }));
        const articles = Array.from({ length: 6000 }, (_, i) => ({
            id: `a${i}`,
            sourceId: `s${i % 60}`,
            title: `Titular ${i} sobre asunto${i % 900} y cosa${i % 37}`,
            summary: 'Resumen',
            // Un millar son de las últimas 36 horas; el resto, más viejos.
            publishedAt: now - (i < 1000 ? (i % 36) * 3600000 : (40 + (i % 600)) * 3600000),
            fetchedAt: now,
            read: false,
            dismissed: false,
        }));
        const start = performance.now();
        const today = buildToday({ prev: null, articles, sources, settings: { topics: [{ name: 'Tema', words: ['asunto7'] }] }, now });
        const ms = performance.now() - start;
        expect(today.items.length).toBeGreaterThanOrEqual(12);
        expect(ms).toBeLessThan(1500);
    });
});
