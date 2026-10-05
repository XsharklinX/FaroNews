// Pinta un artículo en un PDF con la misma jerarquía que el lector: titular,
// créditos, cuerpo en serif y sus fotos. La librería se carga al usarla.

import { articleCredit, toLatin1 } from '../core/export.js';
import { fetchDataUrl } from './http.js';

const PAGE = { width: 595.28, height: 841.89, margin: 62 };
const CONTENT = PAGE.width - PAGE.margin * 2;
const MAX_PX = 1400;
const STYLES = {
    title: { font: 'bold', size: 22, lead: 1.18, after: 10 },
    credit: { font: 'normal', size: 10.5, lead: 1.3, after: 2, color: 110 },
    url: { font: 'normal', size: 9, lead: 1.3, after: 22, color: 110 },
    p: { font: 'normal', size: 12, lead: 1.5, after: 9 },
    h: { font: 'bold', size: 14, lead: 1.25, after: 6, before: 8 },
    li: { font: 'normal', size: 12, lead: 1.5, after: 5, indent: 14, bullet: true },
    cita: { font: 'italic', size: 12, lead: 1.5, after: 9, indent: 18, color: 70 },
    pre: { font: 'normal', size: 10, lead: 1.4, after: 9, indent: 10 },
    nota: { font: 'italic', size: 10, lead: 1.35, after: 9, color: 110 },
};

// Una foto lista para el PDF: en JPEG y a un tamaño razonable. Las que vienen
// de otro sitio se piden como datos, porque el navegador no deja leerlas si no.
async function loadImage(src) {
    const own = src.startsWith('data:') || src.startsWith(window.location.origin);
    const url = own ? src : await fetchDataUrl(src);
    const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
    });
    // Iconos y píxeles de seguimiento no son fotos del artículo.
    if (img.naturalWidth < 200 || img.naturalHeight < 80) return null;
    const scale = Math.min(1, MAX_PX / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.82), ratio: canvas.height / canvas.width };
}

// Devuelve el PDF en base64. `images: false` lo deja en solo texto.
export async function articlePdf({ title, source, author, date, url, blocks, images = true }) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const bottom = PAGE.height - PAGE.margin;
    let y = PAGE.margin;

    const write = (text, style) => {
        const clean = toLatin1(text);
        if (!clean.trim()) return;
        const indent = style.indent || 0;
        doc.setFont('times', style.font);
        doc.setFontSize(style.size);
        doc.setTextColor(style.color || 20);
        const step = style.size * style.lead;
        const lines = doc.splitTextToSize(clean, CONTENT - indent);
        y += style.before || 0;
        lines.forEach((line, i) => {
            if (y + step > bottom) {
                doc.addPage();
                y = PAGE.margin;
            }
            y += step;
            if (style.bullet && i === 0) doc.text('·', PAGE.margin + 3, y);
            doc.text(line, PAGE.margin + indent, y);
        });
        y += style.after;
    };

    const draw = async (src) => {
        let picture = null;
        try {
            picture = await loadImage(src);
        } catch {
            // Foto caída: el artículo sale sin ella.
        }
        if (!picture) return;
        // Ninguna foto ocupa más de media página.
        const height = Math.min(CONTENT * picture.ratio, (PAGE.height - PAGE.margin * 2) * 0.5);
        const width = height / picture.ratio;
        if (y + height + 8 > bottom) {
            doc.addPage();
            y = PAGE.margin;
        }
        doc.addImage(picture.data, 'JPEG', PAGE.margin + (CONTENT - width) / 2, y + 6, width, height, undefined, 'FAST');
        y += height + 18;
    };

    write(title, STYLES.title);
    write(articleCredit({ source, author, date }), STYLES.credit);
    write(url, STYLES.url);
    const seen = new Set();
    for (const block of blocks) {
        if (block.type !== 'img') write(block.text, STYLES[block.type] || STYLES.p);
        else if (images && !seen.has(block.src)) {
            seen.add(block.src);
            await draw(block.src);
        }
    }

    // Pie con el número de página.
    const pages = doc.getNumberOfPages();
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140);
    for (let n = 1; n <= pages; n++) {
        doc.setPage(n);
        doc.text(`Faro - ${n} de ${pages}`, PAGE.width / 2, PAGE.height - 30, { align: 'center' });
    }
    return doc.output('datauristring').split(',')[1];
}
