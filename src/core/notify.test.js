import { describe, expect, it } from 'vitest';
import { inQuietHours, notifySummary, watcherConfig } from './notify.js';

const sources = [
    { feedUrl: 'https://a.example/feed', title: 'A', notify: true },
    { feedUrl: 'https://b.example/feed', title: 'B' },
    { feedUrl: 'https://c.example/', title: 'C', kind: 'page', notify: true },
];
const settings = {
    notify: { on: true, every: 15, quietOn: true, quietFrom: '22:30', quietTo: '06:00' },
    topics: [
        { name: 'Elecciones', words: ['urnas', 'candidato'] },
        { name: 'Godot', words: [] },
        { name: 'Callado', words: ['x'], notify: false },
    ],
    muted: ['fútbol'],
};

describe('watcherConfig', () => {
    it('arma lo que recibe el vigilante', () => {
        expect(watcherConfig(sources, settings)).toEqual({
            enabled: true,
            everyMinutes: 15,
            quiet: { on: true, from: '22:30', to: '06:00' },
            feeds: [
                { url: 'https://a.example/feed', title: 'A', notify: true },
                { url: 'https://b.example/feed', title: 'B', notify: false },
                { url: 'https://c.example/', title: 'C', notify: true, kind: 'page' },
            ],
            topics: [
                { name: 'Elecciones', words: ['urnas', 'candidato'] },
                { name: 'Godot', words: ['Godot'] },
            ],
            muted: ['fútbol'],
            spoilers: [],
            watches: [],
        });
    });

    it('viene apagado y con valores sensatos si nunca se configuró', () => {
        const config = watcherConfig([], {});
        expect(config).toMatchObject({ enabled: false, everyMinutes: 30, quiet: { on: true, from: '23:00', to: '07:00' }, feeds: [], topics: [] });
    });

    it('resume lo configurado en una frase', () => {
        expect(notifySummary(sources, settings)).toBe('2 temas y 2 sitios');
        expect(notifySummary([], {})).toBe('');
    });
});

describe('inQuietHours', () => {
    const at = (h, m = 0) => new Date(2026, 9, 4, h, m);
    const night = { quietOn: true, quietFrom: '23:00', quietTo: '07:00' };

    it('entiende un tramo que cruza la medianoche', () => {
        expect(inQuietHours(night, at(23, 0))).toBe(true);
        expect(inQuietHours(night, at(3))).toBe(true);
        expect(inQuietHours(night, at(6, 59))).toBe(true);
        expect(inQuietHours(night, at(7, 0))).toBe(false);
        expect(inQuietHours(night, at(15))).toBe(false);
    });

    it('entiende un tramo dentro del mismo día', () => {
        const siesta = { quietOn: true, quietFrom: '14:00', quietTo: '16:30' };
        expect(inQuietHours(siesta, at(15))).toBe(true);
        expect(inQuietHours(siesta, at(16, 30))).toBe(false);
        expect(inQuietHours(siesta, at(9))).toBe(false);
    });

    it('no calla si está apagado o el tramo está vacío', () => {
        expect(inQuietHours({ ...night, quietOn: false }, at(3))).toBe(false);
        expect(inQuietHours({ quietOn: true, quietFrom: '08:00', quietTo: '08:00' }, at(8))).toBe(false);
    });
});
