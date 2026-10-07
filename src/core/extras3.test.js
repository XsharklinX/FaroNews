import { describe, expect, it } from 'vitest';
import { buildEpub, hnComments, hnThreads, mostCovered, redditThreads, searchAll, toXhtml, worldToday, youtubeId } from './extras3.js';
import { unzipTexts } from './importers.js';
import { makeZip } from './zip.js';

const NOW = Date.UTC(2026, 9, 6, 12);
const H = 3600000;
const sources = [
    { id: 'a', title: 'Listín Diario', feedUrl: 'https://listindiario.com/', country: 'do' },
    { id: 'b', title: 'El País', feedUrl: 'https://elpais.com/rss', country: 'es' },
    { id: 'c', title: 'Milenio', feedUrl: 'https://milenio.com/rss', country: 'mx' },
];
const art = (id, sourceId, title, hoursAgo, extra = {}) => ({ id, sourceId, title, summary: '', publishedAt: NOW - hoursAgo * H, ...extra });

describe('lo más contado y el mundo', () => {
    const articles = [
        art('1', 'a', 'La cumbre del clima termina sin acuerdo sobre el carbón', 2),
        art('2', 'b', 'La cumbre del clima termina sin acuerdo sobre carbón y petróleo', 3),
        art('3', 'c', 'Cumbre del clima: termina sin acuerdo sobre el carbón', 5),
        art('4', 'a', 'Cierre de la autopista Duarte este fin de semana', 1),
        art('5', 'b', 'La cumbre del clima termina sin acuerdo sobre el carbón', 40),
    ];
    it('ordena por cuántas fuentes cuentan cada historia', () => {
        const top = mostCovered({ articles, sources, now: NOW });
        expect(top).toHaveLength(1);
        expect(top[0]).toMatchObject({ sources: 3, countries: 3 });
    });
    it('cuenta las noticias del día por país del medio', () => {
        expect(worldToday({ articles, sources, now: NOW }).map((c) => [c.id, c.count])).toEqual([['do', 2], ['es', 1], ['mx', 1]]);
    });
});

describe('YouTube', () => {
    it('saca el id del vídeo de cualquier forma de enlace', () => {
        expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ');
        expect(youtubeId('https://www.youtube.com/shorts/abcdefgh')).toBe('abcdefgh');
        expect(youtubeId('https://xataka.com/a')).toBe('');
    });
});

describe('qué dice la gente', () => {
    it('se queda con los hilos que enlazan exactamente el artículo', () => {
        const json = { hits: [{ objectID: '1', url: 'https://www.x.com/a/', num_comments: 30, points: 90, title: 'A' }, { objectID: '2', url: 'https://x.com/otro', num_comments: 99 }, { objectID: '3', url: 'http://x.com/a', num_comments: 0 }] };
        expect(hnThreads(json, 'https://x.com/a').map((t) => [t.id, t.comments])).toEqual([['1', 30]]);
        expect(hnComments({ children: [{ author: 'ana', text: '<p>Hola &amp; adiós</p>' }, { text: '' }] })).toEqual([{ author: 'ana', text: 'Hola & adiós' }]);
        expect(redditThreads({ data: { children: [{ data: { subreddit: 'tech', id: 'q', title: 'T', num_comments: 5, score: 10, permalink: '/r/tech/q' } }] } })[0].url).toBe('https://www.reddit.com/r/tech/q');
    });
});

describe('buscador global', () => {
    it('busca en artículos, notas, resaltados, sitios y catálogo', () => {
        const articles = [art('1', 'a', 'Sanderson en Santo Domingo', 2, { saved: true }), art('2', 'b', 'Otra cosa', 3, { note: 'Recordar a Sanderson' }), art('3', 'c', 'Nada', 3, { highlights: [{ id: 'h', text: 'Sanderson escribe rápido' }] }), art('4', 'c', 'Vieja de Sanderson', 24 * 40)];
        const catalog = { sources: [{ name: 'Cosmere.es', desc: 'Brandon Sanderson', feed: 'https://cosmere.es/' }] };
        const out = searchAll({ query: 'sanderson', articles, sources, catalog, period: 'mes', now: NOW });
        expect(out.articles.map((a) => a.id)).toEqual(['1', '2']);
        expect(out.highlights.map((h) => h.article.id)).toEqual(['3']);
        expect(out.catalog.map((c) => c.name)).toEqual(['Cosmere.es']);
        expect(searchAll({ query: 'sanderson', articles, sources, catalog, savedOnly: true, now: NOW }).articles.map((a) => a.id)).toEqual(['1']);
    });
});

describe('libro electrónico', () => {
    it('deja el HTML como XHTML limpio y arma un EPUB legible', async () => {
        const x = toXhtml('<p class="a" onclick="x()">Hola<br>mundo</p><script>x</script><img src="https://f/1.jpg"><img src="https://f/2.jpg">', new Map([['https://f/1.jpg', 'img1.jpg']]));
        expect(x).toBe('<p>Hola<br />mundo</p><img src="img1.jpg" alt="" />');
        const files = buildEpub({ title: 'Hoy', chapters: [{ title: 'Uno & dos', credit: 'Xataka', url: 'https://x.com', html: x }], images: [{ name: 'img1.jpg', bytes: new Uint8Array([1, 2]), type: 'image/jpeg' }] });
        expect(files[0]).toEqual({ name: 'mimetype', text: 'application/epub+zip' });
        const zip = makeZip(files);
        const names = (await unzipTexts(zip)).map((f) => f.name);
        expect(names).toContain('OEBPS/cap001.xhtml');
        const opf = (await unzipTexts(zip, (n) => n.endsWith('.opf')))[0].text;
        expect(opf).toContain('properties="nav"');
        expect(opf).toContain('<itemref idref="c1"/>');
        const cap = (await unzipTexts(zip, (n) => n.endsWith('cap001.xhtml')))[0].text;
        expect(() => new DOMParser().parseFromString(cap, 'application/xhtml+xml').querySelector('parsererror') && (() => { throw new Error('xhtml roto'); })()).not.toThrow();
        expect(cap).toContain('Uno &amp; dos');
    });
});
