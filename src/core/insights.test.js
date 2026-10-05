import { describe, expect, it } from 'vitest';
import { bodyMatches, readingStats, suggestSites } from './insights.js';

describe('suggestSites', () => {
    const catalog = {
        sources: [
            { name: 'Vandal', feed: 'https://vandal.example/feed', cat: 'gaming', top: true },
            { name: 'Eurogamer', feed: 'https://eurogamer.example/feed', cat: 'gaming' },
            { name: '3DJuegos', feed: 'https://3d.example/feed', cat: 'gaming', top: true },
            { name: 'Ruidoso', feed: 'https://ruidoso.example/feed', cat: 'gaming', top: true, perWeek: 700 },
            { name: 'El Tiempo', feed: 'https://tiempo.example/feed', cat: 'nacionales', country: 'co', top: true },
            { name: 'Clarín', feed: 'https://clarin.example/feed', cat: 'nacionales', country: 'ar', top: true },
            { name: 'Naukas', feed: 'https://naukas.example/feed', cat: 'ciencia', top: true },
        ],
    };

    it('sugiere sitios de los temas que ya sigues, y dice por qué', () => {
        const out = suggestSites(catalog, [{ feedUrl: 'https://www.vandal.example/feed/' }]);
        expect(out.map((s) => s.name)).toEqual(['3DJuegos', 'Ruidoso', 'Eurogamer']);
        expect(out[0].because).toBe('Vandal');
    });

    it('no mezcla países ni sugiere temas ajenos', () => {
        const out = suggestSites(catalog, [{ feedUrl: 'https://tiempo.example/feed' }]);
        expect(out).toEqual([]);
        expect(suggestSites(catalog, [])).toEqual([]);
    });
});

describe('readingStats', () => {
    const now = new Date(2026, 9, 4, 20, 0).getTime();
    const at = (daysAgo, hour) => new Date(2026, 9, 4 - daysAgo, hour, 0).getTime();
    const sources = [{ id: 's1', title: 'Xataka', folder: 'Tecnología' }, { id: 's2', title: 'Vandal', folder: 'Gaming' }];
    const articles = [
        { sourceId: 's1', readAt: at(0, 9), minutes: 4, saved: true, highlights: [{}, {}] },
        { sourceId: 's1', readAt: at(0, 10), minutes: 6 },
        { sourceId: 's2', readAt: at(2, 22), minutes: 3 },
        { sourceId: 's1', readAt: at(9, 9), minutes: 50 },
        { sourceId: 's2', minutes: 5 },
        { sourceId: 's2', readAt: at(1, 9), minutes: 9, dismissed: true },
    ];

    it('resume la última semana', () => {
        const stats = readingStats(articles, sources, now);
        expect(stats).toMatchObject({ count: 3, minutes: 13, saved: 1, highlights: 2, best: 2, moment: 'por la mañana' });
        expect(stats.days).toHaveLength(7);
        expect(stats.days[6]).toMatchObject({ count: 2, minutes: 10 });
        expect(stats.days[4].count).toBe(1);
        expect(stats.sources).toEqual([{ name: 'Xataka', count: 2 }, { name: 'Vandal', count: 1 }]);
        expect(stats.folders[0]).toEqual({ name: 'Tecnología', count: 2 });
    });

    it('funciona sin nada leído', () => {
        expect(readingStats([], sources, now)).toMatchObject({ count: 0, minutes: 0, best: 1, moment: '' });
    });
});

describe('bodyMatches', () => {
    it('busca en el texto, prefiriendo el completo', () => {
        const body = { contentHtml: '<p>Resumen corto</p>', fullHtml: '<p>El <b>hidrógeno</b> llegará por un tubo de 38 km</p>' };
        expect(bodyMatches('hidrogeno tubo', body)).toBe(true);
        expect(bodyMatches('resumen', body)).toBe(false);
        expect(bodyMatches('resumen', { contentHtml: '<p>Resumen corto</p>', fullHtml: '' })).toBe(true);
        expect(bodyMatches('', body)).toBe(false);
    });
});
