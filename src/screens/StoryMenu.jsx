// Menú de una historia (pulsación larga) y hoja para comparar cómo titula
// cada fuente la misma noticia.

import { COUNTRY_NAMES, countryMix, countryOf } from '../core/extras2.js';
import { relTime } from '../core/text.js';
import { titleWords } from '../core/today.js';
import { actions, sourceOf, useStore } from '../data/store.js';
import { shareLink } from '../ports/share.js';
import Icon from '../ui/Icon.jsx';
import { StoryMeta } from '../ui/StoryRow.jsx';
import { Monogram, Sheet, Thumb } from '../ui/bits.jsx';
import { Group, Row } from '../ui/settings.jsx';

export function StoryMenu({ id, onOpen }) {
    const { articles, sources, settings } = useStore();
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
    // Las cuatro cosas que más se hacen con una historia, a un toque.
    const quick = [
        { icon: 'todo', label: 'Leer', go: run(() => onOpen(article.id)) },
        { icon: 'guardado', label: article.saved ? 'Guardada' : 'Guardar', on: article.saved, go: run(() => actions.toggleSaved(article.id)) },
        { icon: 'compartir', label: 'Enviar', go: run(() => shareLink({ title: article.title, url: article.url })) },
        { icon: 'ok', label: article.read ? 'No leída' : 'Leída', go: run(() => actions.markRead(article.id, !article.read)) },
    ];

    return (
        <Sheet title="Esta historia" onClose={close}>
            <div className="menu-story">
                <div className="story-text">
                    <span className="story-title">{article.title}</span>
                    <StoryMeta article={article} source={source} />
                </div>
                <Thumb src={article.image} className="story-thumb" />
            </div>

            <div className="quick">
                {quick.map((q) => (
                    <button key={q.label} type="button" aria-pressed={Boolean(q.on)} onClick={q.go}>
                        <Icon name={q.icon} size={22} strokeWidth={1.8} filled={Boolean(q.on)} />
                        {q.label}
                    </button>
                ))}
            </div>

            <Group title="Afinar Hoy">
                {!source.loose && <Row icon="subir" flip title={`Menos de ${source.title}`} value="baja su nivel" onClick={run(() => actions.lessOf(source.id))} />}
                {!source.loose && <Row icon="pausa" title={`Pausar ${source.title}`} value="un día, una semana…" onClick={run(() => actions.openPause({ kind: 'source', key: source.id, label: source.title }))} />}
                <Row icon="silenciar" title="Silenciar una palabra" value="eliges cuánto tiempo">
                    <div className="chips">
                        {words.map((w) => (
                            <button key={w} type="button" className="chip-btn" onClick={run(() => actions.openPause({ kind: 'word', key: w, label: w }))}>
                                {w}
                            </button>
                        ))}
                    </div>
                    {words.length === 0 && <p className="hint">Este titular no tiene palabras que sirvan para eso.</p>}
                </Row>
                <Row icon="destello" title="Seguir como tema" value="entra siempre">
                    <div className="chips">
                        {words.map((w) => (
                            <button
                                key={w}
                                type="button"
                                className="chip-btn"
                                disabled={followed.has(w.toLowerCase())}
                                onClick={run(() => {
                                    actions.saveTopic({ name: w, words: [w] });
                                    actions.toast(`Sigues el tema «${w}»`);
                                })}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                    {words.length === 0 && <p className="hint">Este titular no tiene palabras que sirvan para eso.</p>}
                </Row>
                {article.saved && <Row icon="editar" title="Etiquetas" value={(article.tags || []).join(', ') || 'ninguna'} onClick={run(() => actions.openTags(article.id))} />}
                <Row icon="cerrar" title="Descartar esta historia" danger onClick={run(() => actions.dismiss(article.id))} />
            </Group>
        </Sheet>
    );
}

export function CoverageSheet({ ids, onOpen }) {
    const { articles, sources, catalog } = useStore();
    const rows = ids
        .map((id) => articles.find((a) => a.id === id))
        .filter(Boolean)
        .map((article) => ({ article, source: sources.find((s) => s.id === article.sourceId) }))
        .filter((r) => r.source);
    const close = actions.closeCompare;
    // De qué países son los medios que la cuentan.
    const mix = countryMix(rows.map((r) => r.source), catalog);
    const known = mix.filter((m) => m.id !== '?');
    const total = rows.length;
    const SHADES = ['var(--ink)', 'var(--lamp)', 'var(--ink3)', 'var(--line)'];

    return (
        <Sheet title="Cómo lo cuentan" subtitle={`${rows.length} de tus fuentes publicaron esta historia.`} onClose={close}>
            {known.length > 0 && (
                <div className="mix">
                    <div className="mix-bar" role="img" aria-label={mix.map((m) => `${m.name}: ${m.count}`).join(', ')}>
                        {mix.map((m, i) => (
                            <i key={m.id} style={{ width: `${(m.count / total) * 100}%`, background: SHADES[Math.min(i, SHADES.length - 1)] }} />
                        ))}
                    </div>
                    <div className="mix-legend">
                        {mix.map((m, i) => (
                            <span key={m.id}>
                                <i style={{ background: SHADES[Math.min(i, SHADES.length - 1)] }} />
                                {m.name} {m.count}
                            </span>
                        ))}
                    </div>
                    {known.length === 1 && mix.length === 1 && total > 1 && <p className="mix-note">Todas tus fuentes que la cuentan son de {known[0].name}. Puede faltar otra mirada.</p>}
                </div>
            )}
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
                            <span>{[source.title, COUNTRY_NAMES[countryOf(source, catalog)] || '', relTime(article.publishedAt || article.fetchedAt), `${article.minutes} min`].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="story-title">{article.title}</span>
                        {article.summary && <span className="cover-sum">{article.summary}</span>}
                    </button>
                ))}
            </div>
        </Sheet>
    );
}
