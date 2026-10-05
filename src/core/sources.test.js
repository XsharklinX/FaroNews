import { describe, expect, it } from 'vitest';
import { discoverFeed, knownFeeds, readSource, youtubeFeedFromHtml } from './discover.js';
import { durationMinutes, parseFeed } from './feedParser.js';
import { extractHeadlines } from './scrape.js';

const fakeNet = (pages) => async (url) => {
    if (!(url in pages)) throw new Error('HTTP 404');
    return { text: pages[url], url };
};

describe('knownFeeds', () => {
    it('deduce el feed de YouTube, Reddit, Bluesky y Mastodon', () => {
        expect(knownFeeds('https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA')).toEqual(['https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA']);
        expect(knownFeeds('https://www.youtube.com/playlist?list=PL123')).toEqual(['https://www.youtube.com/feeds/videos.xml?playlist_id=PL123']);
        expect(knownFeeds('https://old.reddit.com/r/godot/')).toEqual(['https://www.reddit.com/r/godot/.rss']);
        expect(knownFeeds('https://bsky.app/profile/bsky.app')).toEqual(['https://bsky.app/profile/bsky.app/rss']);
        expect(knownFeeds('https://mastodon.social/@Gargron')).toEqual(['https://mastodon.social/@Gargron.rss']);
        expect(knownFeeds('https://fosstodon.org/tags/rust')).toEqual(['https://fosstodon.org/tags/rust.rss']);
    });

    it('no inventa nada para sitios normales ni para un canal por nombre', () => {
        expect(knownFeeds('https://xataka.com/categoria/moviles')).toEqual([]);
        expect(knownFeeds('https://www.youtube.com/@fireship')).toEqual([]);
        expect(knownFeeds('no es una url')).toEqual([]);
    });
});

describe('YouTube', () => {
    it('saca el id del canal de su página y sigue el feed', async () => {
        // La página menciona antes a otro canal (recomendado): no debe confundirse.
        const page = '<html><script>var r = {"browseId":"UC2Xd-TjJByJyK2w1zNwY0zQ"}</script><link rel="canonical" href="https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA"></html>';
        expect(youtubeFeedFromHtml(page)).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA');

        const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Canal</title>
            <entry><title>Un vídeo</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><published>2026-10-01T10:00:00Z</published>
            <media:group><media:thumbnail url="https://i.ytimg.com/vi/abc/hq.jpg"/><media:description>De qué va</media:description></media:group></entry></feed>`;
        const found = await discoverFeed(
            'youtube.com/@canal',
            fakeNet({ 'https://youtube.com/@canal': page, 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA': atom })
        );
        expect(found.feed.items[0]).toMatchObject({ kind: 'video', title: 'Un vídeo', image: 'https://i.ytimg.com/vi/abc/hq.jpg', summary: 'De qué va' });
    });
});

describe('reintentos', () => {
    it('insiste con YouTube cuando su servicio de feeds falla a la primera', async () => {
        const feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA';
        const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Canal</title><entry><title>Vídeo</title><link href="https://www.youtube.com/watch?v=a"/></entry></feed>';
        let calls = 0;
        const flaky = async (url) => {
            if (url !== feedUrl) throw new Error('HTTP 404');
            if (++calls < 3) throw new Error('HTTP 500');
            return { text: atom, url };
        };
        const found = await discoverFeed('https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA', flaky, Date.now(), async () => {});
        expect(calls).toBe(3);
        expect(found.feed.items).toHaveLength(1);
    });
});

describe('YouTube caído', () => {
    it('distingue «el canal existe pero YouTube no responde» de «no hay feed»', async () => {
        const page = '<link rel="canonical" href="https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA">';
        const net = fakeNet({ 'https://www.youtube.com/@canal': page });
        await expect(discoverFeed('https://www.youtube.com/@canal', net, Date.now(), async () => {})).rejects.toThrow('YOUTUBE_BUSY');
        await expect(discoverFeed('https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA', fakeNet({}), Date.now(), async () => {})).rejects.toThrow('YOUTUBE_BUSY');
    });
});

describe('podcasts', () => {
    it('reconoce el audio, la duración y la carátula del programa', () => {
        const rss = `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Programa</title>
            <link>https://programa.example</link><itunes:image href="https://programa.example/caratula.jpg"/>
            <item><title>Episodio 12</title><enclosure url="https://cdn.example/12.mp3" type="audio/mpeg" length="1"/>
            <itunes:duration>1:02:30</itunes:duration><description>Hablamos de cosas</description></item></channel></rss>`;
        const item = parseFeed(rss, 'https://programa.example/feed').items[0];
        expect(item).toMatchObject({ kind: 'audio', audio: 'https://cdn.example/12.mp3', duration: 63, url: 'https://cdn.example/12.mp3', image: 'https://programa.example/caratula.jpg' });
    });

    it('convierte duraciones', () => {
        expect(durationMinutes('45:10')).toBe(45);
        expect(durationMinutes('1800')).toBe(30);
        expect(durationMinutes('')).toBeNull();
        expect(durationMinutes('pronto')).toBeNull();
    });
});

describe('sitios sin feed', () => {
    const cards = Array.from(
        { length: 6 },
        (_, i) => `<article><a href="/2026/10/nota-${i}"><img src="https://sitio.example/f${i}.jpg"></a>
            <h2><a href="/2026/10/nota-${i}?utm_source=portada">Titular número ${i} de una noticia cualquiera</a></h2></article>`
    ).join('');
    const home = `<html><head><title>Diario Sin Feed</title></head><body>
        <nav><a href="/secciones/deportes-y-mas">Una sección del menú con texto largo</a></nav>
        ${cards}
        <a href="https://otro.example/2026/nota">Enlace largo a otro sitio que no cuenta aquí</a>
        <a href="/contacto">Contacto</a>
        <footer><a href="/2026/10/aviso-legal-largo">Aviso legal y política de privacidad</a></footer></body></html>`;

    it('saca titulares de la portada y descarta menús, pies y otros sitios', () => {
        const items = extractHeadlines(home, 'https://sitio.example/');
        expect(items).toHaveLength(6);
        expect(items[0]).toMatchObject({ title: 'Titular número 0 de una noticia cualquiera', image: 'https://sitio.example/f0.jpg' });
        expect(items[0].url).toContain('/2026/10/nota-0');
    });

    it('sigue la página cuando no hay feed, y la vuelve a leer igual', async () => {
        const found = await discoverFeed('sitio.example', fakeNet({ 'https://sitio.example': home }));
        expect(found).toMatchObject({ kind: 'page', feedUrl: 'https://sitio.example' });
        expect(found.feed.title).toBe('Diario Sin Feed');
        expect(readSource(home, 'https://sitio.example', 'page').items).toHaveLength(6);
    });

    it('prefiere los titulares de la página a un feed de comentarios o vacío', async () => {
        const withComments = home.replace('<head>', '<head><link rel="alternate" type="application/rss+xml" href="/comments/feed/">');
        const comments = '<rss version="2.0"><channel><title>Comentarios</title><item><title>Comentario de alguien</title><link>https://sitio.example/c1</link></item></channel></rss>';
        const found = await discoverFeed('sitio.example', fakeNet({ 'https://sitio.example': withComments, 'https://sitio.example/comments/feed/': comments }));
        expect(found.kind).toBe('page');
    });

    it('sigue diciendo que no hay feed si la página no tiene titulares', async () => {
        await expect(discoverFeed('https://sitio.example', fakeNet({ 'https://sitio.example': '<html><a href="/a/b">Corto</a></html>' }))).rejects.toThrow('NO_FEED');
    });
});
