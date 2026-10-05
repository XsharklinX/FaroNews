import { describe, expect, it } from 'vitest';
import { articleBlocks, articleToText, fileSlug, toLatin1 } from './export.js';
import { linkPlan } from './links.js';

describe('articleBlocks', () => {
    it('saca párrafos, títulos, listas y citas en orden', () => {
        const blocks = articleBlocks('<p>Uno  dos</p><h2>Título</h2><ul><li>Punto</li></ul><blockquote><p>Dicho</p></blockquote><script>x()</script>');
        expect(blocks).toEqual([
            { type: 'p', text: 'Uno dos' },
            { type: 'h', text: 'Título' },
            { type: 'li', text: 'Punto' },
            { type: 'cita', text: 'Dicho' },
        ]);
    });

    it('acepta texto sin marcas', () => {
        expect(articleBlocks('Primera línea\nSegunda')).toEqual([
            { type: 'p', text: 'Primera línea' },
            { type: 'p', text: 'Segunda' },
        ]);
    });
});

describe('articleToText', () => {
    it('pone titular, créditos, dirección y cuerpo', () => {
        const text = articleToText({ title: 'Hola', source: 'Xataka', author: 'Ana', date: null, url: 'https://x.com/a', blocks: [{ type: 'p', text: 'Cuerpo' }, { type: 'li', text: 'Punto' }] });
        expect(text).toBe('Hola\nXataka · Ana\nhttps://x.com/a\n\nCuerpo\n\n• Punto\n\nEnviado desde Faro');
    });
});

describe('toLatin1', () => {
    it('cambia los signos tipográficos y quita lo que un PDF no sabe pintar', () => {
        expect(toLatin1('“Año” — niño… 🚀 ¿sí?')).toBe('"Año" - niño... ¿sí?');
    });
});

describe('fileSlug', () => {
    it('hace un nombre de archivo del titular', () => {
        expect(fileSlug('¡Así será el año 2027!')).toBe('asi-sera-el-ano-2027');
        expect(fileSlug('')).toBe('articulo');
    });
});

describe('linkPlan', () => {
    it('lee en Faro los artículos y saca fuera lo demás', () => {
        expect(linkPlan('https://www.xataka.com/moviles/algo', 'https://www.xataka.com/otro')).toBe('faro');
        expect(linkPlan('https://www.youtube.com/watch?v=1')).toBe('fuera');
        expect(linkPlan('https://sitio.com/informe.pdf')).toBe('fuera');
        expect(linkPlan('https://sitio.com/')).toBe('fuera');
        expect(linkPlan('mailto:a@b.com')).toBe('fuera');
        expect(linkPlan('https://sitio.com/a#nota', 'https://sitio.com/a')).toBe('nada');
        expect(linkPlan('nada')).toBe('nada');
    });
});
