// Pinta un artículo en un PDF de solo texto, con la misma jerarquía que el
// lector: titular, créditos y cuerpo en serif. La librería se carga al usarla.

import { articleCredit, toLatin1 } from '../core/export.js';

const PAGE = { width: 595.28, height: 841.89, margin: 62 };
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

// Devuelve el PDF en base64.
export async function articlePdf({ title, source, author, date, url, blocks }) {
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
        const lines = doc.splitTextToSize(clean, PAGE.width - PAGE.margin * 2 - indent);
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

    write(title, STYLES.title);
    write(articleCredit({ source, author, date }), STYLES.credit);
    write(url, STYLES.url);
    for (const block of blocks) write(block.text, STYLES[block.type] || STYLES.p);

    // Pie con el número de página.
    const pages = doc.getNumberOfPages();
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140);
    for (let n = 1; n <= pages; n++) {
        doc.setPage(n);
        doc.text(`Faro · ${n} de ${pages}`.replace('·', '-'), PAGE.width / 2, PAGE.height - 30, { align: 'center' });
    }
    return doc.output('datauristring').split(',')[1];
}
