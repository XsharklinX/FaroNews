import { describe, expect, it } from 'vitest';
import { findIcon, iconCandidates } from './icon.js';

describe('iconCandidates', () => {
    it('ordena por tamaño y deja favicon.ico como último recurso', () => {
        const html = `<head>
            <link rel="shortcut icon" href="/favicon-16.png" sizes="16x16">
            <link rel="apple-touch-icon" href="/apple.png">
            <link rel="icon" type="image/png" sizes="32x32 192x192" href="https://cdn.sitio.example/icon-192.png">
            <link rel="stylesheet" href="/estilo.css">
            <link rel="icon" href="http://inseguro.example/i.png" sizes="512x512">
        </head>`;
        expect(iconCandidates(html, 'https://sitio.example/portada')).toEqual([
            'https://cdn.sitio.example/icon-192.png',
            'https://sitio.example/apple.png',
            'https://sitio.example/favicon-16.png',
            'https://sitio.example/favicon.ico',
        ]);
    });

    it('en YouTube pone primero el avatar del canal', () => {
        const html = '<meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900"><link rel="icon" href="https://www.youtube.com/s/desktop/favicon.ico" sizes="48x48">';
        expect(iconCandidates(html, 'https://www.youtube.com/channel/UC123')[0]).toBe('https://yt3.googleusercontent.com/avatar=s900');
        expect(iconCandidates(html, 'https://sitio.example/')[0]).not.toContain('yt3');
    });

    it('sin iconos declarados propone solo favicon.ico', () => {
        expect(iconCandidates('<html></html>', 'https://sitio.example/a/b')).toEqual(['https://sitio.example/favicon.ico']);
    });
});

describe('findIcon', () => {
    it('lee la portada y devuelve el mejor icono', async () => {
        const net = async (url) => ({ text: '<link rel="apple-touch-icon" href="/t.png">', url });
        expect(await findIcon('https://sitio.example', net)).toBe('https://sitio.example/t.png');
    });

    it('devuelve vacío si el sitio no responde o no hay dirección', async () => {
        const down = async () => {
            throw new Error('HTTP 500');
        };
        expect(await findIcon('https://sitio.example', down)).toBe('');
        expect(await findIcon('', down)).toBe('');
    });
});
