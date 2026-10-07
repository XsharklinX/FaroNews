import { describe, expect, it } from 'vitest';
import { applyRules, baitFix, countryMix, countryOf, diffLines, myMinutes, pageLines, paceFactor, parseTelegram, storyTimeline, telegramFeedUrl, textHash, unwrapRedirect, webSearchUrl } from './extras2.js';
import { parseOmnivore, parsePocketCsv, parsePocketHtml, readExport } from './importers.js';
import { makeZip } from './zip.js';

describe('titulares cebo', () => {
    it('cambia el titular cebo por el dato de la entradilla', () => {
        const fix = baitFix('Este truco borra Apple Intelligence de tu Mac y te devuelve 12 GB al instante', 'Apple Intelligence ocupa unos 12 GB en el Mac y se puede desactivar desde Ajustes del sistema. Te explicamos los pasos.');
        expect(fix).toBe('Apple Intelligence ocupa unos 12 GB en el Mac y se puede desactivar desde Ajustes del sistema.');
    });

    it('deja en paz los titulares normales o sin entradilla útil', () => {
        expect(baitFix('Valve confirma el precio de su nueva consola', 'Valve ha confirmado hoy el precio.')).toBe('');
        expect(baitFix('No vas a creer lo que pasó', '')).toBe('');
    });
});

describe('país de cada fuente', () => {
    const catalog = { sources: [{ feed: 'https://listindiario.com/', country: 'do' }, { feed: 'https://www.theverge.com/rss/index.xml', lang: 'en' }] };
    it('lo saca del catálogo, del dominio o del idioma', () => {
        expect(countryOf({ feedUrl: 'https://listindiario.com/' }, catalog)).toBe('do');
        expect(countryOf({ feedUrl: 'https://elpais.com/rss', siteUrl: 'https://www.marca.es' }, catalog)).toBe('es');
        expect(countryOf({ feedUrl: 'https://www.eluniversal.com.mx/rss' }, catalog)).toBe('mx');
        expect(countryOf({ feedUrl: 'https://www.theverge.com/rss/index.xml' }, catalog)).toBe('int');
    });
    it('cuenta cuántas fuentes hay de cada país', () => {
        const mix = countryMix([{ country: 'es' }, { country: 'es' }, { country: 'mx' }], catalog);
        expect(mix).toEqual([{ id: 'es', name: 'España', count: 2 }, { id: 'mx', name: 'México', count: 1 }]);
    });
});

describe('la historia en el tiempo', () => {
    const DAY = 86400000;
    const a = (id, title, daysAgo) => ({ id, title, publishedAt: 100 * DAY - daysAgo * DAY });
    it('trae lo anterior sobre lo mismo, uno por día', () => {
        const now = a('0', 'Valve confirma el precio de la Steam Machine', 0);
        const list = [now, a('1', 'Se filtra el precio de la Steam Machine de Valve', 3), a('2', 'Steam Machine: Valve anuncia su nueva consola', 20), a('3', 'Otra Steam Machine de Valve vista hoy', 20), a('4', 'Nintendo anuncia un Direct', 2), a('5', 'Valve Steam Machine precio mañana', -1)];
        expect(storyTimeline(now, list).map((x) => x.id)).toEqual(['1', '2']);
    });
});

describe('Telegram', () => {
    it('reconoce el enlace de un canal', () => {
        expect(telegramFeedUrl('https://t.me/durov')).toBe('https://t.me/s/durov');
        expect(telegramFeedUrl('t.me/s/ultimahora/123')).toBe('https://t.me/s/ultimahora');
        expect(telegramFeedUrl('https://xataka.com')).toBe('');
    });
    it('lee los mensajes de la página pública', () => {
        const html = `<div class="tgme_channel_info_header_title"><span>Canal</span></div>
          <div class="tgme_widget_message" data-post="canal/1"><div class="tgme_widget_message_text">Primer mensaje largo. Segunda frase</div><time datetime="2026-10-01T10:00:00+00:00"></time></div>
          <div class="tgme_widget_message" data-post="canal/2"><a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.tg/x.jpg')"></a><time datetime="2026-10-02T10:00:00+00:00"></time></div>`;
        const feed = parseTelegram(html, 'https://t.me/s/canal');
        expect(feed.title).toBe('Canal');
        expect(feed.items.map((i) => i.url)).toEqual(['https://t.me/canal/2', 'https://t.me/canal/1']);
        expect(feed.items[1].title).toBe('Primer mensaje largo.');
        expect(feed.items[0].image).toBe('https://cdn.tg/x.jpg');
    });
});

describe('búsqueda en la web', () => {
    it('saca la dirección real de los enlaces de Bing', () => {
        expect(unwrapRedirect('http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3a%2f%2fwww.larazon.es%2fnota&c=1')).toBe('https://www.larazon.es/nota');
        expect(unwrapRedirect('https://xataka.com/a')).toBe('https://xataka.com/a');
        expect(webSearchUrl('Brandon Sanderson')).toContain('q=Brandon%20Sanderson');
    });
});

describe('páginas vigiladas', () => {
    it('saca el texto visible y detecta qué cambió', () => {
        const before = pageLines('<nav>Menú</nav><main><h1>Becas</h1><p>Plazo hasta el 15 de octubre</p><script>x</script></main>');
        const after = pageLines('<main><h1>Becas</h1><p>Plazo ampliado hasta el 30 de octubre</p></main>');
        expect(before).toEqual(['Becas', 'Plazo hasta el 15 de octubre']);
        expect(textHash(before)).not.toBe(textHash(after));
        expect(diffLines(before, after)).toEqual({ added: ['Plazo ampliado hasta el 30 de octubre'], removed: ['Plazo hasta el 15 de octubre'] });
    });
});

describe('reglas', () => {
    const art = { sourceId: 's1', title: 'Análisis de Metroid Prime 4', summary: '', kind: '' };
    it('aplica la acción de las que coinciden', () => {
        expect(applyRules([{ sourceId: 's1', word: 'analisis', action: 'etiquetar', tag: 'juegos' }], art)).toEqual({ saved: true, tags: ['juegos'] });
        expect(applyRules([{ sourceId: 's2', action: 'descartar' }], art)).toBe(null);
        expect(applyRules([{ word: 'metroid, zelda', action: 'leida' }], art)).toEqual({ read: true });
        expect(applyRules([{ kind: 'ver', action: 'descartar' }], art)).toBe(null);
        expect(applyRules([{ action: 'descartar' }], art)).toBe(null);
    });
});

describe('ritmo de lectura', () => {
    it('usa la mediana cuando hay suficientes lecturas', () => {
        expect(paceFactor([0.5, 0.5])).toBe(1);
        expect(paceFactor([0.5, 0.6, 0.55, 0.5, 9, 0.52])).toBe(0.52);
        expect(myMinutes(10, 0.52)).toBe(5);
        expect(myMinutes(1, 0.4)).toBe(1);
    });
});

describe('importar de otras apps', () => {
    it('lee Pocket en CSV y en HTML, y Omnivore', async () => {
        const csv = 'title,url,time_added,tags,status\n"Uno, dos",https://a.com/1,1700000000,lectura|ciencia,unread\nTres,https://a.com/3,1700000100,,archive\n';
        expect(parsePocketCsv(csv)).toEqual([
            { url: 'https://a.com/1', title: 'Uno, dos', tags: ['lectura', 'ciencia'], savedAt: 1700000000000, read: false },
            { url: 'https://a.com/3', title: 'Tres', tags: [], savedAt: 1700000100000, read: true },
        ]);
        const html = '<h1>Unread</h1><ul><li><a href="https://b.com/x" time_added="1700000000" tags="a,b">X</a></li></ul><h1>Read Archive</h1><ul><li><a href="https://b.com/y">Y</a></li></ul>';
        expect(parsePocketHtml(html).map((i) => [i.url, i.read, i.tags.length])).toEqual([['https://b.com/x', false, 2], ['https://b.com/y', true, 0]]);
        expect(parseOmnivore([{ title: 'O', url: 'https://c.com/o', labels: [{ name: 'cosmere' }], state: 'Archived' }])).toEqual([{ url: 'https://c.com/o', title: 'O', tags: ['cosmere'], savedAt: expect.any(Number), read: true }]);
        const zip = makeZip([{ name: 'metadata_0_to_1.json', text: JSON.stringify([{ title: 'Z', url: 'https://d.com/z' }]) }]);
        expect((await readExport('omnivore.zip', zip)).map((i) => i.url)).toEqual(['https://d.com/z']);
    });
});
