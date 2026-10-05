import { describe, expect, it } from 'vitest';
import { buildToday, clusterArticles } from './today.js';

const NOW = Date.parse('2026-10-03T12:00:00');
const H = 3600000;

const src = (id, extra = {}) => ({ id, title: id, level: 'todo', priority: false, ...extra });
const art = (id, sourceId, title, hoursAgo = 1, extra = {}) => ({
    id,
    sourceId,
    title,
    summary: '',
    publishedAt: NOW - hoursAgo * H,
    fetchedAt: NOW,
    read: false,
    dismissed: false,
    ...extra,
});
const build = (articles, sources, settings = {}, prev = null) => buildToday({ prev, articles, sources, settings, now: NOW });

describe('clusterArticles', () => {
    it('junta la misma historia de fuentes distintas, no de la misma', () => {
        const groups = clusterArticles([
            art('a', 's1', 'El motor añade exportación a consolas'),
            art('b', 's2', 'El motor añade exportación directa a consolas'),
            art('c', 's1', 'El motor añade exportación a consolas (actualizado)'),
            art('d', 's3', 'Nueva guía de sombreadores'),
        ]);
        expect(groups.map((g) => g.map((a) => a.id))).toEqual([['a', 'b'], ['c'], ['d']]);
    });
});

describe('buildToday', () => {
    it('pone primero las alertas y explica el motivo', () => {
        const today = build(
            [art('a', 's1', 'Algo reciente', 1), art('b', 's1', 'Novedades de Taurí en el instalador', 20)],
            [src('s1')],
            { keywords: ['tauri'] }
        );
        expect(today.items.map((i) => i.id)).toEqual(['b', 'a']);
        expect(today.items[0].reason).toEqual({ type: 'alerta', keyword: 'tauri' });
        expect(today.items[1].reason).toEqual({ type: 'reciente' });
    });

    it('agrupa una historia de varias fuentes en una sola tarjeta', () => {
        const today = build(
            [art('a', 's1', 'El motor añade exportación a consolas'), art('b', 's2', 'El motor añade exportación directa a consolas')],
            [src('s1'), src('s2')]
        );
        expect(today.items).toHaveLength(1);
        expect(today.items[0]).toMatchObject({ id: 'a', also: ['b'], reason: { type: 'cluster', count: 2 } });
    });

    it('respeta el nivel de cada fuente', () => {
        const sources = [src('alertas', { level: 'alertas' }), src('imp', { level: 'importante' }), src('todo')];
        const today = build(
            [
                art('a', 'alertas', 'Nada que ver'),
                art('b', 'alertas', 'Sale Godot nuevo'),
                art('c', 'imp', 'Tema cualquiera'),
                art('d', 'todo', 'Otra cosa distinta'),
            ],
            sources,
            { keywords: ['godot'] }
        );
        // «c» es de una fuente en «lo importante» y no destaca: entra solo porque sobra sitio.
        expect(today.items.map((i) => i.id).sort()).toEqual(['b', 'c', 'd']);
        expect(today.items.at(-1).id).toBe('c');
    });

    it('deja fuera lo de «lo importante» que no destaca cuando el día se llena', () => {
        const sources = [src('imp', { level: 'importante' }), src('todo')];
        const filler = Array.from({ length: 12 }, (_, i) => art(`t${i}`, 'todo', `Relato${i} tema${i}`, 20));
        const today = build([art('floja', 'imp', 'Nota sin más', 1), ...filler], sources);
        expect(today.items).toHaveLength(12);
        expect(today.items.some((i) => i.id === 'floja')).toBe(false);
    });

    it('sube lo que el usuario suele abrir y baja lo que descarta', () => {
        const sources = [src('gusta'), src('cansa')];
        const articles = [art('a', 'cansa', 'Una cosa cualquiera', 1), art('b', 'gusta', 'Otra cosa distinta', 5)];
        const habits = { gusta: { o: 12, s: 4, d: 0 }, cansa: { o: 0, s: 0, d: 9 } };
        const today = buildToday({ prev: null, articles, sources, settings: {}, habits, now: NOW });
        expect(today.items.map((i) => i.id)).toEqual(['b', 'a']);
        expect(today.items[0].reason).toEqual({ type: 'habito' });
    });

    it('recuerda la edición durante el día y la reinicia al cambiar de fecha', () => {
        const sources = [src('s1')];
        const tarde = build([art('a', 's1', 'Algo nuevo')], sources, {}, { date: '2026-10-03', edition: 2, items: [] });
        expect(tarde.edition).toBe(2);
        const manana = build([art('a', 's1', 'Algo nuevo')], sources, {}, { date: '2026-10-02', edition: 2, items: [] });
        expect(manana.edition).toBe(1);
    });

    it('deja fuera lo silenciado, lo leído, lo descartado y lo viejo', () => {
        const today = build(
            [
                art('a', 's1', 'Fútbol: resultados'),
                art('b', 's1', 'Ya leído', 1, { read: true }),
                art('c', 's1', 'Descartado', 1, { dismissed: true }),
                art('d', 's1', 'De la semana pasada', 100),
                art('e', 's1', 'Vigente'),
            ],
            [src('s1')],
            { muted: ['futbol'] }
        );
        expect(today.items.map((i) => i.id)).toEqual(['e']);
    });

    it('mantiene lo ya elegido hoy y no pasa del límite', () => {
        const sources = [src('s1')];
        const first = Array.from({ length: 12 }, (_, i) => art(`a${i}`, 's1', `Historia número ${i} sobre tema${i}`, i + 1));
        const today = build(first, sources);
        expect(today.items).toHaveLength(12);

        const read = first.map((a) => ({ ...a, read: true }));
        const later = build([...read, art('nuevo', 's1', 'Llegó después')], sources, {}, today);
        expect(later.items).toHaveLength(12);
        expect(later.items.some((i) => i.id === 'nuevo')).toBe(false);
    });

    it('impide que una fuente muy activa llene Hoy ella sola', () => {
        const sources = [src('mucho'), src('poco'), src('otro'), src('cuarto')];
        const many = Array.from({ length: 20 }, (_, i) => art(`m${i}`, 'mucho', `Portada ${i} asunto${i}`, 1));
        const quiet = ['poco', 'otro', 'cuarto'].flatMap((s) => Array.from({ length: 4 }, (_, i) => art(`${s}${i}`, s, `Relato${s}${i} tema${s}${i}`, 20)));
        const today = build([...many, ...quiet], sources);
        expect(today.items).toHaveLength(12);
        expect(today.items.filter((i) => i.id.startsWith('m'))).toHaveLength(3);
    });

    it('rellena con la fuente activa si las demás no tienen nada reciente', () => {
        const sources = [src('mucho'), src('poco'), src('otro'), src('cuarto')];
        const many = Array.from({ length: 20 }, (_, i) => art(`m${i}`, 'mucho', `Portada ${i} asunto${i}`, 1));
        const today = build([...many, art('p', 'poco', 'Una nota tranquila', 20)], sources);
        expect(today.items).toHaveLength(12);
        expect(today.items.some((i) => i.id === 'p')).toBe(true);
    });

    it('deja entrar una alerta aunque el día ya esté lleno', () => {
        const sources = [src('s1')];
        const first = Array.from({ length: 12 }, (_, i) => art(`a${i}`, 's1', `Historia número ${i} sobre tema${i}`, i + 1));
        const today = build(first, sources);
        const later = build([...first, art('alerta', 's1', 'Sale Godot nuevo')], sources, { keywords: ['godot'] }, today);
        expect(later.items).toHaveLength(13);
        expect(later.items[0].id).toBe('alerta');
    });

    it('empieza de cero al cambiar de día', () => {
        const prev = { date: '2026-10-02', items: [{ id: 'viejo', score: 99, reason: { type: 'reciente' }, also: [] }] };
        const today = build([art('viejo', 's1', 'De ayer', 30, { read: true }), art('a', 's1', 'De hoy')], [src('s1')], {}, prev);
        expect(today.date).toBe('2026-10-03');
        expect(today.items.map((i) => i.id)).toEqual(['a']);
    });
});
