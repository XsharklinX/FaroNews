import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// El WebView de Android sirve la app desde https://localhost (scheme de Capacitor).
// Los artículos traen HTML de terceros: nunca se les permite ejecutar scripts.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    "connect-src 'self' https:",
    "object-src 'none'",
    // Solo el reproductor de YouTube en su modo de privacidad, para ver vídeos en el lector.
    "frame-src https://www.youtube-nocookie.com",
    "base-uri 'self'",
].join('; ');

const cspPlugin = {
    name: 'inject-csp-production',
    apply: 'build',
    transformIndexHtml(html) {
        return html.replace(
            '<meta name="viewport"',
            `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="viewport"`
        );
    },
};

// En el dispositivo las peticiones salen por CapacitorHttp (nativo, sin CORS).
// En el navegador de desarrollo no hay nativo, así que el servidor de Vite hace
// de intermediario. Solo existe en `pnpm dev`: no llega al APK.
const devProxyPlugin = {
    name: 'faro-dev-proxy',
    configureServer(server) {
        server.middlewares.use('/__proxy', async (req, res) => {
            const target = new URL(req.url, 'http://x').searchParams.get('url') || '';
            if (!/^https?:\/\//i.test(target)) {
                res.statusCode = 400;
                res.end('url inválida');
                return;
            }
            try {
                const r = await fetch(target, {
                    redirect: 'follow',
                    headers: { 'user-agent': 'Faro/0.1 (lector de feeds)', accept: '*/*' },
                    signal: AbortSignal.timeout(15000),
                });
                res.statusCode = r.status;
                // Bytes tal cual: la codificación se resuelve en la app, igual que en el dispositivo.
                res.setHeader('content-type', 'application/octet-stream');
                res.setHeader('x-content-type', r.headers.get('content-type') || '');
                res.setHeader('x-final-url', r.url);
                res.end(Buffer.from(await r.arrayBuffer()));
            } catch (err) {
                res.statusCode = 502;
                res.end(String(err?.message || err));
            }
        });
    },
};

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{js,jsx}'],
    },
    plugins: [react(), cspPlugin, devProxyPlugin],
    // La versión sale de package.json: es el único sitio donde se cambia.
    define: { __APP_VERSION__: JSON.stringify(version) },
    // jsPDF trae de serie dos librerías para pintar HTML e SVG que Faro no usa
    // (el PDF es solo texto): se cambian por un módulo vacío para no cargar con ellas.
    resolve: {
        alias: {
            html2canvas: fileURLToPath(new URL('./src/ports/vacio.js', import.meta.url)),
            canvg: fileURLToPath(new URL('./src/ports/vacio.js', import.meta.url)),
        },
    },
    optimizeDeps: { include: ['jspdf'] },
    // Capacitor copia dist/ dentro del APK y lo sirve desde la raíz del scheme.
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
    },
    server: {
        host: true,
        port: 5174,
    },
});
