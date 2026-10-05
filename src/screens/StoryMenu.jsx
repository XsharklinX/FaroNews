// Menú de una historia (pulsación larga) y hoja para comparar cómo titula
// cada fuente la misma noticia.

import { useState } from 'react';
import { relTime } from '../core/text.js';
import { titleWords } from '../core/today.js';
import { actions, sourceOf, useStore } from '../data/store.js';
import { shareLink } from '../ports/share.js';
import { Monogram, Sheet } from '../ui/bits.jsx';

export function StoryMenu({ id, onOpen }) {
    const { articles, sources, settings } = useStore();
    const [mode, setMode] = useState(null); // 'silenciar' | 'tema'
    const article = articles.find((a) => a.id === id);
    const source = sourceOf(article, new Map(sources.map((s) => [s.id, s])));
    if (!article || !source) return null;

    const close = actions.closeMenu;
    const words = titleWords(article.title);
    const followed = new Set((settings.topics || []).map((t) => t.name.toLowerCase()));
    const run = (fn) => () => {
        close();
        fn();
    };

    return (
        <Sheet title="Esta historia" subtitle={article.title} onClose={close}>
            <div className="card list">
                <button type="button" className="line-btn" onClick={run(() => onOpen(article.id))}>
                    <span>Leer</span>
                    <span className="sub-s">{article.minutes} min</span>
                </button>
                <button type="button" className="line-btn" onClick={run(() => actions.toggleSaved(article.id))}>
                    <span>{article.saved ? 'Quitar de Guardado' : 'Guardar para luego'}</span>
                </button>
                <button type="button" className="line-btn" onClick={run(() => shareLink({ title: article.title, url: article.url }))}>
                    <span>Compartir</span>
                </button>
            </div>

            <div className="block">
                <h3 className="label">Afinar Hoy</h3>
                <div className="card list">
                    {!source.loose && (
                        <button type="button" className="line-btn" onClick={run(() => actions.lessOf(source.id))}>
                            <span>Menos de {source.title}</span>
                            <span className="sub-s">baja su nivel</span>
                        </button>
                    )}
                    <button type="button" className="line-btn" aria-expanded={mode === 'silenciar'} onClick={() => setMode(mode === 'silenciar' ? null : 'silenciar')}>
                        <span>Silenciar una palabra</span>
                        <span className="sub-s">no vuelve a entrar en Hoy</span>
                    </button>
                    <button type="button" className="line-btn" aria-expanded={mode === 'tema'} onClick={() => setMode(mode === 'tema' ? null : 'tema')}>
                        <span>Seguir como tema</span>
                        <span className="sub-s">entra siempre en Hoy</span>
                    </button>
                </div>
                {mode && (
                    <div className="chips">
                        {words.map((w) => (
                            <button
                                key={w}
                                type="button"
                                className="chip-btn"
                                disabled={mode === 'tema' && followed.has(w.toLowerCase())}
                                onClick={run(() => {
                                    if (mode === 'silenciar') {
                                        actions.muteWord(w);
                                    } else {
                                        actions.saveTopic({ name: w, words: [w] });
                                        actions.toast(`Sigues el tema «${w}»`);
                                    }
                                })}
                            >
                                {w}
                            </button>
                        ))}
                        {words.length === 0 && <p className="hint">Este titular no tiene palabras que sirvan para eso.</p>}
                    </div>
                )}
            </div>

            <button type="button" className="btn-ghost" onClick={run(() => actions.dismiss(article.id))}>
                Descartar esta historia
            </button>
        </Sheet>
    );
}

export function CoverageSheet({ ids, onOpen }) {
    const { articles, sources } = useStore();
    const rows = ids
        .map((id) => articles.find((a) => a.id === id))
        .filter(Boolean)
        .map((article) => ({ article, source: sources.find((s) => s.id === article.sourceId) }))
        .filter((r) => r.source);
    const close = actions.closeCompare;

    return (
        <Sheet title="Cómo lo cuentan" subtitle={`${rows.length} de tus fuentes publicaron esta historia.`} onClose={close}>
            <div className="rows">
                {rows.map(({ article, source }) => (
                    <button
                        type="button"
                        className="cover"
                        key={article.id}
                        onClick={() => {
                            close();
                            onOpen(
                                article.id,
                                rows.map((r) => r.article.id),
                                'esta historia'
                            );
                        }}
                    >
                        <span className="story-meta">
                            <Monogram source={source} size={22} />
                            <span>{[source.title, relTime(article.publishedAt || article.fetchedAt), `${article.minutes} min`].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="story-title">{article.title}</span>
                        {article.summary && <span className="cover-sum">{article.summary}</span>}
                    </button>
                ))}
            </div>
        </Sheet>
    );
}
