import { describe, expect, it } from 'vitest';
import { weeklyPicks } from './insights.js';
import { effective, FOREVER, isPaused, liveMutes, pauseLabel, pauseUntil } from './pause.js';
import { buildToday } from './today.js';

const NOW = new Date(2026, 9, 5, 15, 0).getTime();
const DAY = 86400000;

describe('pausas', () => {
    it('calcula hasta cuando dura cada opcion', () => {
        expect(new Date(pauseUntil('dia', NOW)).getHours()).toBe(7);
        expect(pauseUntil('dia', NOW)).toBeGreaterThan(NOW);
        expect(pauseUntil('semana', NOW)).toBe(NOW + 7 * DAY);
        expect(pauseUntil('siempre', NOW)).toBe(FOREVER);
        expect(isPaused(NOW - 1, NOW)).toBe(false);
        expect(isPaused(undefined, NOW)).toBe(false);
    });

    it('lo dice con palabras', () => {
        expect(pauseLabel(pauseUntil('dia', NOW), NOW)).toBe('hasta mañana');
        expect(pauseLabel(NOW + 7 * DAY, NOW)).toBe('hasta el 12 de octubre');
        expect(pauseLabel(FOREVER, NOW)).toBe('hasta que lo quites');
        expect(pauseLabel(NOW - 1, NOW)).toBe('');
    });

    it('quita de lo que cuenta los sitios, temas y palabras en pausa', () => {
        const out = effective(
            {
                sources: [{ id: 'a' }, { id: 'b', pausedUntil: NOW + DAY }, { id: 'c', pausedUntil: NOW - DAY }],
                settings: { muted: ['sorteo'], mutedUntil: { mundial: NOW + DAY, vieja: NOW - DAY }, topics: [{ name: 'Godot' }, { name: 'Elecciones', pausedUntil: FOREVER }] },
            },
            NOW
        );
        expect(out.sources.map((s) => s.id)).toEqual(['a', 'c']);
        expect(out.settings.muted).toEqual(['sorteo', 'mundial']);
        expect(out.settings.topics.map((t) => t.name)).toEqual(['Godot']);
        expect(liveMutes({ mundial: NOW + DAY, vieja: NOW - DAY }, NOW)).toEqual({ mundial: NOW + DAY });
    });

    it('un sitio en pausa no entra en Hoy', () => {
        const sources = [
            { id: 'a', title: 'A', level: 'todo' },
            { id: 'b', title: 'B', level: 'todo', pausedUntil: NOW + DAY },
        ];
        const articles = ['a', 'b'].map((id, i) => ({ id: `n${i}`, sourceId: id, title: `Noticia distinta numero ${i} de ${id}`, summary: '', publishedAt: NOW - 3600000, fetchedAt: NOW, minutes: 3 }));
        const today = buildToday({ prev: null, articles, ...effective({ sources, settings: {} }, NOW), now: NOW });
        expect(today.items.map((it) => it.id)).toEqual(['n0']);
    });
});

describe('resumen de la semana', () => {
    const sources = [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', priority: true },
    ];
    const art = (id, sourceId, extra = {}) => ({ id, sourceId, title: `Titular ${id}`, summary: '', publishedAt: NOW - DAY, fetchedAt: NOW - DAY, minutes: 4, ...extra });

    it('trae lo no leido de la semana, lo mejor primero y sin abusar de un sitio', () => {
        const articles = [art('1', 'a'), art('2', 'a'), art('3', 'a'), art('4', 'b'), art('5', 'a', { read: true }), art('6', 'b', { publishedAt: NOW - 9 * DAY, fetchedAt: NOW - 9 * DAY }), art('7', 'b', { kind: 'video' })];
        const picks = weeklyPicks({ articles, sources, settings: {}, habits: { a: { o: 0, s: 0, d: 0 } }, now: NOW });
        expect(picks[0].article.id).toBe('4');
        expect(picks.map((p) => p.article.id).sort()).toEqual(['1', '2', '4']);
    });

    it('se salta lo que ya esta en Hoy', () => {
        const picks = weeklyPicks({ articles: [art('1', 'a'), art('2', 'a')], sources, settings: {}, skip: new Set(['1']), now: NOW });
        expect(picks.map((p) => p.article.id)).toEqual(['2']);
    });
});
