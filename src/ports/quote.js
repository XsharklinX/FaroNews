// Pinta una frase resaltada como imagen para compartirla: la cita en grande,
// de dónde sale y la marca de Faro. Devuelve el PNG en base64.

const W = 1080;
const H = 1350;
const PAD = 96;
const SERIF = '"Newsreader Variable", Georgia, serif';
const SANS = '"Hanken Grotesk Variable", system-ui, sans-serif';

export const QUOTE_STYLES = [
    { id: 'noche', label: 'Noche', bg: '#0A1326', ink: '#FFFFFF', soft: '#C9D3E6', tower: '#F4F7FB' },
    { id: 'papel', label: 'Papel', bg: '#FFFFFF', ink: '#0E1116', soft: '#5E6672', tower: '#0F1B33' },
    { id: 'sepia', label: 'Sepia', bg: '#F3EAD6', ink: '#33291A', soft: '#6A5A42', tower: '#33291A' },
];
const LAMP = '#FFC53D';

// Parte un texto en líneas que quepan en el ancho dado.
function wrap(ctx, text, width) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > width) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function clampLines(ctx, lines, max, width) {
    if (lines.length <= max) return lines;
    const kept = lines.slice(0, max);
    let last = kept[max - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, '');
    kept[max - 1] = `${last}…`;
    return kept;
}

export async function quoteImage({ text, title, source, style = 'noche' }) {
    const look = QUOTE_STYLES.find((s) => s.id === style) || QUOTE_STYLES[0];
    // Las letras de la app tienen que estar cargadas o el lienzo usa otras.
    await Promise.all([document.fonts.load(`500 60px ${SERIF}`), document.fonts.load(`600 30px ${SANS}`)]).catch(() => {});

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = look.bg;
    ctx.fillRect(0, 0, W, H);

    // El haz del faro, de fondo.
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = LAMP;
    ctx.beginPath();
    ctx.moveTo(-40, 150);
    ctx.lineTo(W, 520);
    ctx.lineTo(W, 1020);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // La marca, arriba: torre y dos haces.
    const mark = (x, y, s) => {
        ctx.fillStyle = look.tower;
        ctx.beginPath();
        ctx.moveTo(x + 8 * s, y);
        ctx.lineTo(x + 52 * s, y);
        ctx.lineTo(x + 60 * s, y + 248 * s);
        ctx.lineTo(x, y + 248 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = LAMP;
        for (const [top, len, h] of [[6, 110, 76], [98, 70, 60]]) {
            ctx.beginPath();
            ctx.moveTo(x + 86 * s, y + (top + 16) * s);
            ctx.lineTo(x + (86 + len) * s, y + top * s - 6 * s);
            ctx.lineTo(x + (86 + len) * s, y + (top + h) * s);
            ctx.lineTo(x + 86 * s, y + (top + h - 16) * s);
            ctx.closePath();
            ctx.fill();
        }
    };
    mark(PAD, PAD, 0.24);
    ctx.fillStyle = look.soft;
    ctx.font = `600 30px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Faro', PAD + 62, PAD + 30);

    // La cita: la letra se encoge hasta que cabe.
    const quote = `«${String(text).replace(/\s+/g, ' ').trim()}»`;
    const width = W - PAD * 2;
    const room = H - 260 - 330;
    let size = 78;
    let lines = [];
    for (; size >= 38; size -= 4) {
        ctx.font = `500 ${size}px ${SERIF}`;
        lines = wrap(ctx, quote, width);
        if (lines.length * size * 1.24 <= room) break;
    }
    lines = clampLines(ctx, lines, Math.floor(room / (size * 1.24)), width);
    ctx.fillStyle = look.ink;
    ctx.textBaseline = 'alphabetic';
    const block = lines.length * size * 1.24;
    let y = 260 + (room - block) / 2 + size;
    for (const line of lines) {
        ctx.fillText(line, PAD, y);
        y += size * 1.24;
    }

    // De dónde sale.
    ctx.fillStyle = LAMP;
    ctx.fillRect(PAD, H - 262, 72, 6);
    ctx.fillStyle = look.ink;
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText(source || '', PAD, H - 196);
    ctx.fillStyle = look.soft;
    ctx.font = `400 30px ${SANS}`;
    clampLines(ctx, wrap(ctx, title || '', width), 2, width).forEach((line, i) => ctx.fillText(line, PAD, H - 146 + i * 42));

    return canvas.toDataURL('image/png').split(',')[1];
}
