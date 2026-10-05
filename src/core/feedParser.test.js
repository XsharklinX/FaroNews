import { describe, expect, it } from 'vitest';
import { parseFeed } from './feedParser.js';

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>El Taller &amp; Cía</title>
    <link>https://taller.example/</link>
    <item>
      <title>Primera <b>nota</b></title>
      <link>/notas/1?utm_source=rss</link>
      <description>Resumen corto</description>
      <content:encoded><![CDATA[<p>Texto <strong>completo</strong> de la nota.</p>]]></content:encoded>
      <dc:creator>Ana</dc:creator>
      <pubDate>Sat, 03 Oct 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Sin enlace</title>
      <guid isPermaLink="false">abc-123</guid>
    </item>
    <item>
      <title>Con guid</title>
      <guid>https://taller.example/notas/2</guid>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Bitácora</title>
  <link rel="self" href="https://bitacora.example/atom.xml"/>
  <link rel="alternate" href="https://bitacora.example/"/>
  <entry>
    <title>Entrada uno</title>
    <link rel="alternate" href="https://bitacora.example/uno"/>
    <updated>2026-10-02T10:00:00Z</updated>
    <summary>Un resumen</summary>
    <author><name>Luis</name></author>
  </entry>
</feed>`;

describe('parseFeed', () => {
    it('lee RSS 2.0 con contenido completo, autor y fecha', () => {
        const feed = parseFeed(RSS, 'https://taller.example/feed');
        expect(feed.title).toBe('El Taller & Cía');
        expect(feed.siteUrl).toBe('https://taller.example/');
        expect(feed.items).toHaveLength(2);
        const [first, second] = feed.items;
        expect(first.url).toBe('https://taller.example/notas/1?utm_source=rss');
        expect(first.title).toBe('Primera nota');
        expect(first.contentHtml).toContain('<strong>completo</strong>');
        expect(first.summary).toBe('Texto completo de la nota.');
        expect(first.author).toBe('Ana');
        expect(first.publishedAt).toBe(Date.parse('2026-10-03T08:00:00Z'));
        expect(second.url).toBe('https://taller.example/notas/2');
    });

    it('lee Atom y elige el enlace alternate', () => {
        const feed = parseFeed(ATOM, 'https://bitacora.example/atom.xml');
        expect(feed.title).toBe('Bitácora');
        expect(feed.siteUrl).toBe('https://bitacora.example/');
        expect(feed.items[0]).toMatchObject({ url: 'https://bitacora.example/uno', title: 'Entrada uno', author: 'Luis', summary: 'Un resumen' });
    });

    it('lee JSON Feed', () => {
        const json = JSON.stringify({
            version: 'https://jsonfeed.org/version/1.1',
            title: 'Notas',
            home_page_url: 'https://notas.example',
            items: [{ url: 'https://notas.example/a', title: 'A', content_text: 'Hola', date_published: '2026-10-01T00:00:00Z' }],
        });
        const feed = parseFeed(json, 'https://notas.example/feed.json');
        expect(feed.items[0]).toMatchObject({ url: 'https://notas.example/a', title: 'A', summary: 'Hola' });
    });

    it('devuelve null si no es un feed', () => {
        expect(parseFeed('<!doctype html><html><body>Hola</body></html>', 'https://x.example')).toBeNull();
        expect(parseFeed('{"otra":"cosa"}', 'https://x.example')).toBeNull();
        expect(parseFeed('', 'https://x.example')).toBeNull();
    });
});
