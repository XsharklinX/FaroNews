import { describe, expect, it } from 'vitest';
import { discoverFeed, feedLinksFromHtml, perWeek } from './discover.js';

const FEED = `<rss version="2.0"><channel><title>Sitio</title><link>https://sitio.example</link>
<item><title>Uno</title><link>https://sitio.example/uno</link></item></channel></rss>`;

const fakeNet = (pages) => async (url) => {
    if (!(url in pages)) throw new Error('HTTP 404');
    return { text: pages[url], url };
};

describe('discoverFeed', () => {
    it('acepta un feed pegado directamente', async () => {
        const found = await discoverFeed('https://sitio.example/feed.xml', fakeNet({ 'https://sitio.example/feed.xml': FEED }));
        expect(found.feedUrl).toBe('https://sitio.example/feed.xml');
        expect(found.feed.items).toHaveLength(1);
    });

    it('sigue el <link rel="alternate"> de la portada y añade https://', async () => {
        const html = '<html><head><link rel="alternate" type="application/rss+xml" href="/noticias/rss"></head></html>';
        const found = await discoverFeed('sitio.example', fakeNet({ 'https://sitio.example': html, 'https://sitio.example/noticias/rss': FEED }));
        expect(found.feedUrl).toBe('https://sitio.example/noticias/rss');
    });

    it('prueba las rutas habituales cuando la portada no declara feed', async () => {
        const found = await discoverFeed('https://sitio.example', fakeNet({ 'https://sitio.example': '<html></html>', 'https://sitio.example/rss.xml': FEED }));
        expect(found.feedUrl).toBe('https://sitio.example/rss.xml');
    });

    it('prefiere un feed vivo a uno abandonado, y usa el abandonado si no hay otro', async () => {
        const now = Date.parse('2026-10-03T12:00:00Z');
        const feedAt = (date) => `<rss version="2.0"><channel><title>Sitio</title>
            <item><title>Uno</title><link>https://sitio.example/uno</link><pubDate>${date}</pubDate></item></channel></rss>`;
        const old = feedAt('Mon, 05 Jan 2026 10:00:00 GMT');
        const fresh = feedAt('Fri, 02 Oct 2026 10:00:00 GMT');
        const home = 'https://sitio.example';

        const both = await discoverFeed(home, fakeNet({ [home]: '<html></html>', [`${home}/feed`]: old, [`${home}/feedburner.xml`]: fresh }), now);
        expect(both.feedUrl).toBe(`${home}/feedburner.xml`);

        const onlyOld = await discoverFeed(home, fakeNet({ [home]: '<html></html>', [`${home}/feed`]: old }), now);
        expect(onlyOld.feedUrl).toBe(`${home}/feed`);
    });

    it('distingue sitio inalcanzable de sitio sin feed', async () => {
        await expect(discoverFeed('https://nada.example', fakeNet({}))).rejects.toThrow('UNREACHABLE');
        await expect(discoverFeed('https://sitio.example', fakeNet({ 'https://sitio.example': '<html></html>' }))).rejects.toThrow('NO_FEED');
    });
});

describe('feedLinksFromHtml', () => {
    it('ignora los alternate que no son feeds', () => {
        const html = `<link rel="alternate" hreflang="en" href="/en">
            <link rel="alternate" type="application/atom+xml" href="https://otro.example/atom">`;
        expect(feedLinksFromHtml(html, 'https://sitio.example')).toEqual(['https://otro.example/atom']);
    });
});

describe('perWeek', () => {
    it('estima el ritmo con las fechas del feed', () => {
        const day = 86400000;
        const items = Array.from({ length: 14 }, (_, i) => ({ publishedAt: i * day }));
        expect(perWeek(items)).toBe(8);
        expect(perWeek([{ publishedAt: 1 }])).toBeNull();
    });
});
