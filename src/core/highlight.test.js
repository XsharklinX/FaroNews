import { describe, expect, it } from 'vitest';
import { applyHighlights, highlightsToMarkdown } from './highlight.js';
import { buildToday, matchTopic } from './today.js';
import { firstImage, matchesQuery } from './text.js';

describe('applyHighlights', () => {
    const html = '<p>El cambio no exige tocar el <strong>código</strong> existente.</p><p>Solo hay que recompilar.</p>';

    it('marca un texto dentro de un párrafo', () => {
        const out = applyHighlights(html, [{ id: 'a', text: 'no exige tocar' }]);
        expect(out).toContain('<mark data-h="a">no exige tocar</mark>');
    });

    it('marca una selección que cruza etiquetas y párrafos', () => {
        const out = applyHighlights(html, [{ id: 'b', text: 'el código existente.\n\nSolo hay', note: 'ojo' }]);
        expect(out.match(/<mark data-h="b" data-note="1">/g)).toHaveLength(4);
        expect(out).toContain('<strong><mark data-h="b" data-note="1">código</mark></strong>');
        expect(out).toContain('<mark data-h="b" data-note="1">Solo hay</mark>');
    });

    it('deja el HTML igual si el texto ya no está', () => {
        expect(applyHighlights(html, [{ id: 'c', text: 'esto no aparece' }])).toBe(html);
        expect(applyHighlights(html, [])).toBe(html);
    });
});

describe('highlightsToMarkdown', () => {
    it('agrupa por artículo y añade las notas', () => {
        const md = highlightsToMarkdown([
            { title: 'Nota', url: 'https://sitio.example/n', source: 'Sitio', highlights: [{ text: 'Una cita', note: 'Mi apunte' }, { text: 'Otra' }] },
            { title: 'Vacío', url: 'https://sitio.example/v', highlights: [] },
        ]);
        expect(md).toContain('## [Nota](https://sitio.example/n)');
        expect(md).toContain('> Una cita\n\nMi apunte\n\n> Otra');
        expect(md).not.toContain('Vacío');
    });
});

describe('temas', () => {
    const topics = [{ name: 'Elecciones', words: ['elecciones', 'candidato', 'urnas'] }, { name: 'Godot', words: [] }];

    it('encuentra un tema por cualquiera de sus palabras, sin tildes', () => {
        expect(matchTopic({ title: 'El candidato cerró campaña' }, topics)).toBe('Elecciones');
        expect(matchTopic({ title: 'Sale GODOT 5' }, topics)).toBe('Godot');
        expect(matchTopic({ title: 'Nada que ver' }, topics)).toBeNull();
    });

    it('lleva el nombre del tema al motivo de Hoy', () => {
        const now = Date.parse('2026-10-03T12:00:00');
        const article = { id: 'a', sourceId: 's', title: 'Abren las urnas', summary: '', publishedAt: now - 3600000, fetchedAt: now, read: false, dismissed: false };
        const today = buildToday({ prev: null, articles: [article], sources: [{ id: 's', level: 'alertas' }], settings: { topics }, now });
        expect(today.items[0].reason).toEqual({ type: 'alerta', keyword: 'Elecciones' });
    });

    it('reparte Hoy entre secciones cuando una tiene muchas fuentes', () => {
        const now = Date.parse('2026-10-03T12:00:00');
        const sources = [
            ...Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, level: 'todo', folder: 'Gaming' })),
            { id: 'n', level: 'todo', folder: 'Nacionales' },
            { id: 'e', level: 'todo', folder: 'Economía' },
        ];
        const art = (id, sourceId, hoursAgo) => ({ id, sourceId, title: `Titular${id} asunto${id}`, summary: '', publishedAt: now - hoursAgo * 3600000, fetchedAt: now, read: false, dismissed: false });
        const articles = [
            ...sources.slice(0, 6).flatMap((s) => [1, 2, 3].map((n) => art(`${s.id}-${n}`, s.id, 1))),
            ...[1, 2, 3, 4].map((n) => art(`n-${n}`, 'n', 20)),
            ...[1, 2, 3, 4].map((n) => art(`e-${n}`, 'e', 20)),
        ];
        const today = buildToday({ prev: null, articles, sources, settings: {}, now });
        const gaming = today.items.filter((i) => i.id.startsWith('g')).length;
        expect(today.items).toHaveLength(12);
        expect(gaming).toBe(6);
    });
});

describe('texto', () => {
    it('saca la primera imagen útil', () => {
        const html = '<img src="https://feeds.feedburner.com/~r/x/1.gif"><p><img alt="" src="https://sitio.example/foto.jpg?w=1&amp;h=2"></p>';
        expect(firstImage(html)).toBe('https://sitio.example/foto.jpg?w=1&h=2');
        expect(firstImage('<p>sin imagen</p><img src="http://inseguro.example/a.jpg">')).toBe('');
    });

    it('busca todas las palabras sin tildes ni mayúsculas', () => {
        expect(matchesQuery('crisis ram', 'El CEO avisa de la Crisis de RAM', 'Xataka')).toBe(true);
        expect(matchesQuery('exportacion', 'Exportación a consolas')).toBe(true);
        expect(matchesQuery('crisis luna', 'El CEO avisa de la crisis de RAM')).toBe(false);
        expect(matchesQuery('  ', 'lo que sea')).toBe(true);
    });
});
