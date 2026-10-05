import { describe, expect, it } from 'vitest';
import { newerCatalog, validCatalog } from './catalog.js';
import { articleBlocks, articleToText } from './export.js';
import { highlightsToObsidian, highlightsToReadwiseCsv } from './highlight.js';
import { planEviction } from './images.js';
import { looksEnglish, translateHtml } from './lang.js';
import { crc32, makeZip } from './zip.js';

const catalog = (updated, n = 60) => ({
    updated,
    categories: [{ id: 'tec', name: 'Tecnología' }],
    countries: [{ id: 'es', name: 'España' }],
    sources: Array.from({ length: n }, (_, i) => ({ name: `Sitio ${i}`, cat: 'tec', feed: `https://s${i}.com/feed` })),
});

describe('catálogo', () => {
    it('solo acepta uno completo y con temas que existen', () => {
        expect(validCatalog(catalog('2026-10-04'))).toBe(true);
        expect(validCatalog(catalog('2026-10-04', 3))).toBe(false);
        expect(validCatalog({ ...catalog('x'), sources: [{ name: 'A', cat: 'otro', feed: 'f' }] })).toBe(false);
        expect(validCatalog(null)).toBe(false);
    });

    it('se queda con el más reciente', () => {
        const old = catalog('2026-10-04');
        const fresh = catalog('2026-11-01');
        expect(newerCatalog(old, fresh)).toBe(fresh);
        expect(newerCatalog(fresh, old)).toBe(fresh);
        expect(newerCatalog(old, { roto: true })).toBe(old);
    });
});

describe('zip', () => {
    it('calcula el CRC conocido', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });

    it('arma un archivo con sus entradas', () => {
        const zip = makeZip([
            { name: 'año.md', text: 'hola' },
            { name: 'b.md', text: 'adiós' },
        ]);
        const view = new DataView(zip.buffer);
        expect(view.getUint32(0, true)).toBe(0x04034b50);
        // El final del archivo dice cuántas entradas hay.
        expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
        expect(view.getUint16(zip.length - 12, true)).toBe(2);
        expect(new TextDecoder().decode(zip)).toContain('adiós');
    });
});

describe('resaltados', () => {
    const items = [{ title: 'Uno: "dos"', url: 'https://x.com/a', source: 'Xataka', tags: ['ciencia ficción'], highlights: [{ text: 'Frase, con coma', note: 'nota', createdAt: Date.UTC(2026, 9, 4, 10) }] }];

    it('exporta el CSV de Readwise', () => {
        const csv = highlightsToReadwiseCsv(items);
        expect(csv.split('\n')[0]).toBe('"Highlight","Title","Author","URL","Note","Location","Date"');
        expect(csv.split('\n')[1]).toBe('"Frase, con coma","Uno: ""dos""","Xataka","https://x.com/a","nota","1","2026-10-04 10:00:00"');
    });

    it('exporta una nota de Obsidian por artículo', () => {
        const [note] = highlightsToObsidian(items);
        expect(note.name).toBe('Uno dos.md');
        expect(note.text).toContain('etiquetas: [faro, ciencia-ficción]');
        expect(note.text).toContain('> Frase, con coma\n\nnota');
    });
});

describe('exportar con fotos', () => {
    it('las fotos son bloques, pero no salen en el texto', () => {
        const blocks = articleBlocks('<p>Uno</p><figure><img src="https://x.com/a.jpg"><figcaption>Pie</figcaption></figure><p>Dos</p>');
        expect(blocks.map((b) => b.type)).toEqual(['p', 'img', 'nota', 'p']);
        expect(articleToText({ title: 'T', url: 'u', blocks })).not.toContain('a.jpg');
    });
});

describe('imágenes fijadas', () => {
    it('no se borran las de lo guardado', () => {
        const out = planEviction(
            [
                { url: 'a', size: 60, at: 1, pin: true },
                { url: 'b', size: 60, at: 2 },
                { url: 'c', size: 60, at: 3 },
            ],
            130
        );
        expect(out.map((e) => e.url)).toEqual(['b']);
    });
});

describe('idioma', () => {
    it('distingue inglés de español', () => {
        expect(looksEnglish('The director of the film said that it was not for the fans')).toBe(true);
        expect(looksEnglish('El director de la película dijo que no era para los fans')).toBe(false);
        expect(looksEnglish('Xbox Game Pass')).toBe(false);
    });

    it('traduce párrafo a párrafo y conserva las fotos', async () => {
        const html = await translateHtml('<h2>Title</h2><p>Hello <a href="#">world</a><img src="a.jpg"></p><ul><li>One</li></ul>', async (texts) => texts.map((t) => `[${t}]`));
        expect(html).toBe('<h2>[Title]</h2><p><img src="a.jpg">[Hello world]</p><ul><li>[One]</li></ul>');
    });
});
