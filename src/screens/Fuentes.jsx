import { useMemo, useState } from 'react';
import catalog from '../catalog/catalog.json';
import { suggestSites } from '../core/insights.js';
import { relTime } from '../core/text.js';
import { matchTopic, topicWords } from '../core/today.js';
import { actions, isFailing, useStore } from '../data/store.js';
import Icon from '../ui/Icon.jsx';
import TopBar from '../ui/TopBar.jsx';
import { Monogram } from '../ui/bits.jsx';

const LEVEL_TEXT = { todo: 'Entra todo', importante: 'Solo lo importante', alertas: 'Solo tus temas' };

// Ritmo de un sitio, en la unidad que se entiende mejor.
function pace(source) {
    if (!source.perWeek) return '';
    return source.perWeek >= 7 ? `${Math.round(source.perWeek / 7)} al día` : `${source.perWeek} por semana`;
}

export default function Fuentes({ onCatalog, onEdit, onTopicEdit, onTopicOpen }) {
    const { sources, articles, settings } = useStore();
    const [pane, setPane] = useState('sitios');

    const { folders, failing } = useMemo(() => {
        const unread = new Map();
        for (const a of articles) if (!a.read && !a.dismissed) unread.set(a.sourceId, (unread.get(a.sourceId) || 0) + 1);
        const map = new Map();
        for (const s of [...sources].sort((a, b) => a.title.localeCompare(b.title, 'es'))) {
            const key = s.folder || 'Sin carpeta';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push({ source: s, unread: unread.get(s.id) || 0 });
        }
        return {
            folders: [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')),
            failing: sources.filter(isFailing).length,
        };
    }, [sources, articles]);

    const suggestions = useMemo(() => suggestSites(catalog, sources, 3), [sources]);
    const topics = settings.topics || [];
    const topicCounts = useMemo(() => new Map(topics.map((t) => [t.id, articles.filter((a) => matchTopic(a, [t])).length])), [topics, articles]);

    return (
        <div className="screen">
            <TopBar title="Fuentes" note={failing > 0 ? `${failing} ${failing === 1 ? 'sitio necesita' : 'sitios necesitan'} revisión` : ''} />

            <div className="tabs" role="group" aria-label="Qué ver">
                <button type="button" aria-pressed={pane === 'sitios'} onClick={() => setPane('sitios')}>
                    Sitios {sources.length || ''}
                </button>
                <button type="button" aria-pressed={pane === 'temas'} onClick={() => setPane('temas')}>
                    Temas {topics.length || ''}
                </button>
            </div>

            {pane === 'sitios' && (
                <>
                    {folders.map(([folder, list]) => (
                        <section key={folder}>
                            <div className="sec">
                                <h3 className="label">{folder}</h3>
                            </div>
                            <div className="rows">
                                {list.map(({ source, unread }) => (
                                    <div className="src-row" key={source.id}>
                                        <button type="button" className="src-main" onClick={() => onEdit(source.id)}>
                                            <Monogram source={source} size={36} />
                                            <span className="src-text">
                                                <strong>{source.title}</strong>
                                                {isFailing(source) ? (
                                                    <span className="warn">Sin respuesta{source.lastOkAt ? ` desde hace ${relTime(source.lastOkAt)}` : ''}</span>
                                                ) : (
                                                    <span className="clip">{[LEVEL_TEXT[source.level] || LEVEL_TEXT.todo, pace(source), source.priority ? 'prioritaria' : ''].filter(Boolean).join(' · ')}</span>
                                                )}
                                            </span>
                                            {!isFailing(source) && (
                                                <span className={`src-count${unread ? '' : ' zero'}`} aria-label={`${unread} sin leer`}>
                                                    {unread}
                                                </span>
                                            )}
                                        </button>
                                        {isFailing(source) && (
                                            <button type="button" className="btn-warn" onClick={() => actions.refreshSource(source.id)}>
                                                Revisar
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}

                    {sources.length === 0 && <p className="empty-note">Todavía no sigues ningún sitio. Elige algunos del catálogo o añade cualquier web con el botón «Añadir».</p>}

                    {suggestions.length > 0 && (
                        <section>
                            <div className="sec">
                                <h3 className="label">Quizá te interese</h3>
                            </div>
                            <div className="rows">
                                {suggestions.map((entry) => (
                                    <div className="cat-row" key={entry.feed}>
                                        <Monogram source={{ title: entry.name, icon: entry.icon }} size={36} />
                                        <div className="src-text">
                                            <strong>{entry.name}</strong>
                                            <span>{entry.desc}</span>
                                            <span className="cat-meta">Porque sigues {entry.because}</span>
                                        </div>
                                        <button type="button" className="follow" onClick={() => actions.followCatalog(entry, catalog.categories.find((c) => c.id === entry.cat)?.name || '')}>
                                            Seguir
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="sec">
                        <h3 className="label">Más sitios</h3>
                    </div>
                    <button type="button" className="cat-entry" onClick={onCatalog}>
                        <span>
                            <strong>Explorar el catálogo</strong>
                            <small>Sitios elegidos de tecnología, videojuegos, libros, actualidad y más</small>
                        </span>
                        <Icon name="siguiente" size={20} />
                    </button>
                </>
            )}

            {pane === 'temas' && (
                <>
                    {topics.length > 0 && (
                        <div className="rows">
                            {topics.map((t) => (
                                <div className="src-row" key={t.id}>
                                    <button type="button" className="src-main" onClick={() => onTopicOpen(t)}>
                                        <span className="topic-mark">#</span>
                                        <span className="src-text">
                                            <strong>{t.name}</strong>
                                            <span className="clip">{topicWords(t).join(', ')}</span>
                                        </span>
                                        <span className={`src-count${topicCounts.get(t.id) ? '' : ' zero'}`}>{topicCounts.get(t.id)}</span>
                                    </button>
                                    <button type="button" className="round" aria-label={`Editar el tema ${t.name}`} onClick={() => onTopicEdit(t)}>
                                        <Icon name="editar" size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="hint">Un tema sigue un asunto en todas tus fuentes a la vez, sin importar qué sitio lo publique: «Godot», «elecciones», «tipos de interés». Lo que lo mencione entra siempre en Hoy.</p>
                    <button type="button" className="btn-ghost more" onClick={() => onTopicEdit({})}>
                        Nuevo tema
                    </button>
                </>
            )}

            {/* Sitio para que el botón flotante no tape la última fila. */}
            <div style={{ height: 72, flex: 'none' }} />
        </div>
    );
}
