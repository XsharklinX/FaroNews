import { useMemo } from 'react';
import { highlightsToMarkdown } from '../core/highlight.js';
import { sourceOf, useStore } from '../data/store.js';
import { exportFile } from '../ports/share.js';

export default function Resaltados({ onOpen }) {
    const { articles, sources } = useStore();

    const items = useMemo(() => {
        const srcById = new Map(sources.map((s) => [s.id, s]));
        const newest = (a) => Math.max(...a.highlights.map((h) => h.createdAt));
        return articles
            .filter((a) => a.highlights?.length)
            .sort((a, b) => newest(b) - newest(a))
            .map((a) => ({ article: a, source: sourceOf(a, srcById) }));
    }, [articles, sources]);

    const total = items.reduce((sum, it) => sum + it.article.highlights.length, 0);
    const exportAll = () =>
        exportFile(
            'faro-resaltados.md',
            highlightsToMarkdown(items.map(({ article, source }) => ({ title: article.title, url: article.url, source: source?.title, highlights: article.highlights })))
        );

    if (!items.length) {
        return <p className="empty-note">Aquí se juntan las frases que resaltes. En el lector, selecciona un texto y toca «Resaltar».</p>;
    }

    return (
        <>
            <div className="block-head">
                <p className="sub-s">
                    {total} {total === 1 ? 'resaltado' : 'resaltados'} en {items.length} {items.length === 1 ? 'artículo' : 'artículos'}
                </p>
                <button type="button" className="link-btn" onClick={exportAll}>
                    Exportar Markdown
                </button>
            </div>
            <div className="rows">
                {items.map(({ article, source }) => (
                    <button type="button" className="quote-card" key={article.id} onClick={() => onOpen(article.id, [article.id], 'Resaltados')}>
                        {article.highlights.map((h) => (
                            <span className="quote" key={h.id}>
                                <q>{h.text}</q>
                                {h.note && <span className="note">{h.note}</span>}
                            </span>
                        ))}
                        <span className="quote-src">
                            {source?.title} · {article.title}
                        </span>
                    </button>
                ))}
            </div>
        </>
    );
}
