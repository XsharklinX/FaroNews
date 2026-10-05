import { describe, expect, it } from 'vitest';
import { base64ToBytes, decodeBody } from './decode.js';

const latin1 = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));
const utf8 = (text) => new TextEncoder().encode(text);

describe('decodeBody', () => {
    it('respeta la codificación que declara el XML', () => {
        const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><rss><title>Inspiración útil, qué año</title></rss>';
        expect(decodeBody(latin1(xml))).toContain('Inspiración útil, qué año');
    });

    it('usa la cabecera HTTP cuando el documento no dice nada', () => {
        expect(decodeBody(latin1('<rss><title>Señal</title></rss>'), 'text/xml; charset=ISO-8859-1')).toContain('Señal');
    });

    it('lee el charset de una página HTML', () => {
        expect(decodeBody(latin1('<html><head><meta charset="iso-8859-1"><title>Añadir</title>'))).toContain('Añadir');
    });

    it('deja el UTF-8 como está, con o sin BOM', () => {
        expect(decodeBody(utf8('<rss><title>Canción</title></rss>'), 'text/xml; charset=utf-8')).toContain('Canción');
        expect(decodeBody(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Niño')]))).toContain('Niño');
    });

    it('cae a Latin-1 si nadie declara nada y el UTF-8 sale roto', () => {
        expect(decodeBody(latin1('<rss><title>Montaña</title></rss>'))).toContain('Montaña');
    });

    it('ignora un nombre de codificación inventado', () => {
        expect(decodeBody(utf8('<?xml version="1.0" encoding="x-nada"?><a>ok</a>'))).toContain('ok');
    });
});

describe('base64ToBytes', () => {
    it('recupera los bytes originales', () => {
        expect([...base64ToBytes(btoa('añb'))]).toEqual([97, 241, 98]);
    });
});
