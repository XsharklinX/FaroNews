import { describe, expect, it } from 'vitest';
import { buildOpml, parseOpml } from './opml.js';
import { cleanHtml, extractReadable } from './readable.js';
import { initials, looksLikeHtml, plainToHtml, readMinutes, relTime } from './text.js';
import { urlKey } from './url.js';

describe('urlKey', () => {
    it('ignora seguimiento, www, fragmento y barra final', () => {
        expect(urlKey('https://www.Sitio.example/nota/?utm_source=x&id=7#top')).toBe(urlKey('https://sitio.example/nota?id=7'));
        expect(urlKey('https://sitio.example/a')).not.toBe(urlKey('https://sitio.example/b'));
    });
});

describe('opml', () => {
    it('exporta y vuelve a importar conservando carpetas', () => {
        const sources = [
            { title: 'Rust & Cía', feedUrl: 'https://rust.example/feed?a=1&b=2', siteUrl: 'https://rust.example', folder: 'Desarrollo' },
            { title: 'Suelto', feedUrl: 'https://suelto.example/rss', siteUrl: '', folder: '' },
        ];
        expect(parseOpml(buildOpml(sources))).toEqual(sources);
    });

    it('devuelve vacío con un archivo que no es OPML', () => {
        expect(parseOpml('esto no es xml <')).toEqual([]);
    });
});

describe('cleanHtml', () => {
    it('quita scripts y manejadores, y resuelve enlaces e imágenes', () => {
        const dirty = '<p onclick="x()">Hola <a href="/otra">enlace</a></p><script>alert(1)</script><img src="/foto.png"><img src="http://inseguro.example/a.png">';
        const html = cleanHtml(dirty, 'https://sitio.example/nota');
        expect(html).not.toMatch(/script|onclick|inseguro/);
        expect(html).toContain('href="https://sitio.example/otra"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('src="https://sitio.example/foto.png"');
    });
});

describe('extractReadable', () => {
    it('saca el cuerpo del artículo de una página completa', () => {
        const body = Array.from({ length: 12 }, (_, i) => `<p>Párrafo ${i} con texto suficiente para que parezca un artículo de verdad y no un menú.</p>`).join('');
        const page = `<html><head><title>Nota</title></head><body><nav><a href="/">Inicio</a></nav><article><h1>Nota</h1>${body}</article><footer>Pie</footer></body></html>`;
        const out = extractReadable(page, 'https://sitio.example/nota');
        expect(out.text).toContain('Párrafo 11');
        expect(out.html).not.toContain('Pie');
    });

    it('devuelve null si no hay artículo', () => {
        expect(extractReadable('<html><body><p>Corto</p></body></html>', 'https://sitio.example')).toBeNull();
    });
});

describe('plainToHtml', () => {
    it('hace párrafos y enlaces, y no deja pasar etiquetas', () => {
        const html = plainToHtml('Mira el curso: https://sitio.example/curso?a=1&b=2.\nSegunda línea\n\n<script>x</script> fin');
        expect(html).toBe(
            '<p>Mira el curso: <a href="https://sitio.example/curso?a=1&amp;b=2">https://sitio.example/curso?a=1&amp;b=2</a>.<br>Segunda línea</p><p>&lt;script&gt;x&lt;/script&gt; fin</p>'
        );
        expect(looksLikeHtml('texto con a < b')).toBe(false);
        expect(looksLikeHtml('<p>hola</p>')).toBe(true);
    });
});

describe('texto', () => {
    it('formatea tiempos, minutos e iniciales', () => {
        const now = 1e12;
        expect(relTime(now - 30000, now)).toBe('ahora');
        expect(relTime(now - 5 * 60000, now)).toBe('5 min');
        expect(relTime(now - 3 * 3600000, now)).toBe('3 h');
        expect(relTime(now - 3 * 86400000, now)).toBe('3 d');
        expect(readMinutes('palabra '.repeat(660))).toBe(3);
        expect(initials('El Taller Indie')).toBe('TI');
        expect(initials('Xataka')).toBe('XA');
        expect(initials('DW Español')).toBe('DE');
        expect(initials('La Silla Vacía')).toBe('SV');
        expect(initials('El Tiempo')).toBe('TI');
    });
});
