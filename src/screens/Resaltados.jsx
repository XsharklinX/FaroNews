import { useMemo, useState } from 'react';
import { highlightsToMarkdown, highlightsToObsidian, highlightsToReadwiseCsv } from '../core/highlight.js';
import { matchesQuery } from '../core/text.js';
import { bytesToBase64, makeZip } from '../core/zip.js';
import { sourceOf, useStore } from '../data/store.js';
import { exportBinary, exportFile } from '../ports/share.js';
import Icon from '../ui/Icon.jsx';
import { Sheet } from '../ui/bits.jsx';

const FORMATS = [
    { id: 'md', label: 'Markdown', hint: 'un solo archivo .md' },
    { id: 'obsidian', label: 'Obsidian', hint: 'una nota por artículo, en un .zip' },
    { id: 'readwise', label: 'Readwise', hint: 'archivo .csv para importar' },
];

export default function Resaltados({ onOpen }) {
    const { articles, sources } = useStore();
    const [query, setQuery] = useState('');
    const [exporting, setExporting] = useState(false);

    const all = useMemo(() => {
        const srcById = new Map(sources.map((s) => [s.id, s]));
        const newest = (a) => Math.max(0, ...(a.highlights || []).map((h) => h.createdAt));
        return articles
            .filter((a) => a.highlights?.length || a.note)
            .sort((a, b) => newest(b) - newest(a))
            .map((a) => ({ article: a, source: sourceOf(a, srcById) }));
    }, [articles, sources]);

    // Al buscar se mira en la frase, en la nota, en el titular y en las etiquetas;
    // de cada artículo solo quedan los resaltados que coinciden.
    const searching = query.trim().length > 0;
    const items = useMemo(() => {
        if (!searching) return all.map((it) => ({ ...it, highlights: it.article.highlights || [] }));
        return all
            .map((it) => {
                const whole = matchesQuery(query, it.article.title, it.article.note, it.source?.title, ...(it.article.tags || []));
                const own = it.article.highlights || [];
                return { ...it, whole, highlights: whole ? own : own.filter((h) => matchesQuery(query, h.text, h.note)) };
            })
            .filter((it) => it.highlights.length || (it.whole && it.article.note));
    }, [all, query, searching]);

    const total = items.reduce((sum, it) => sum + it.highlights.length, 0);
    const exportAs = async (format) => {
        setExporting(false);
        // Se exporta lo que se ve: con una búsqueda puesta, solo lo encontrado.
        const data = items.map(({ article, source, highlights }) => ({ title: article.title, url: article.url, source: source?.title, tags: article.tags, note: article.note, highlights }));
        if (format === 'md') await exportFile('faro-resaltados.md', highlightsToMarkdown(data));
        else if (format === 'readwise') await exportFile('faro-readwise.csv', highlightsToReadwiseCsv(data));
        else await exportBinary('faro-obsidian.zip', bytesToBase64(makeZip(highlightsToObsidian(data))));
    };

    if (!all.length) {
        return <p className="empty-note">Aquí se juntan las frases que resaltes. En el lector, selecciona un texto y toca el lápiz.</p>;
    }

    return (
        <>
            <div className="search lone">
                <Icon name="buscar" size={18} />
                <label htmlFor="buscar-resaltados" className="sr">
                    Buscar en los resaltados
                </label>
                <input id="buscar-resaltados" type="search" enterKeyHint="search" placeholder="Buscar en tus resaltados y notas" value={query} onChange={(e) => setQuery(e.target.value)} />
                {searching && (
                    <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                        <Icon name="cerrar" size={18} />
                    </button>
                )}
            </div>
            <div className="block-head">
                <p className="sub-s">
                    {total} {total === 1 ? 'resaltado' : 'resaltados'} en {items.length} {items.length === 1 ? 'artículo' : 'artículos'}
                </p>
                <button type="button" className="link-btn" disabled={!total} onClick={() => setExporting(true)}>
                    Exportar
                </button>
            </div>
            {items.length === 0 && <p className="empty-note">Ningún resaltado coincide con esa búsqueda.</p>}
            <div className="rows">
                {items.map(({ article, source, highlights }) => (
                    <button type="button" className="quote-card" key={article.id} onClick={() => onOpen(article.id, [article.id], 'Resaltados')}>
                        {article.note && <span className="article-note">{article.note}</span>}
                        {highlights.map((h) => (
                            <span className="quote" key={h.id}>
                                <q>{h.text}</q>
                                {h.note && <span className="note">{h.note}</span>}
                            </span>
                        ))}
                        <span className="quote-src">
                            {source?.title} · {article.title}
                            {article.tags?.length ? ` · ${article.tags.map((t) => `#${t}`).join(' ')}` : ''}
                        </span>
                    </button>
                ))}
            </div>

            {exporting && (
                <Sheet title="Exportar resaltados" subtitle={searching ? `Solo los ${total} que coinciden con la búsqueda.` : `Los ${total} resaltados, con sus notas y etiquetas.`} onClose={() => setExporting(false)}>
                    <div className="card list">
                        {FORMATS.map((f) => (
                            <button key={f.id} type="button" className="line-btn" onClick={() => exportAs(f.id)}>
                                <span>{f.label}</span>
                                <span className="sub-s">{f.hint}</span>
                            </button>
                        ))}
                    </div>
                </Sheet>
            )}
        </>
    );
}
