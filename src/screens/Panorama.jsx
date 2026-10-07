// Pantallas para mirar el conjunto: lo más contado del día, el mundo por
// país y un buscador que mira en todo. Y tres hojas: el viaje, la nota de un
// artículo y el libro electrónico.

import { useEffect, useMemo, useRef, useState } from 'react';
import { mostCovered, searchAll, worldToday } from '../core/extras3.js';
import { agoLabel } from '../core/text.js';
import { actions, sourceOf, useStore } from '../data/store.js';
import { makeEpub } from '../ports/epub.js';
import { exportBinary } from '../ports/share.js';
import Icon from '../ui/Icon.jsx';
import StoryRow from '../ui/StoryRow.jsx';
import { Monogram, Sheet, Switch, Thumb } from '../ui/bits.jsx';

function Shell({ title, sub, onClose, children }) {
    return (
        <div className="overlay">
            <div className="screen">
                <header className="cat-head">
                    <button type="button" className="round round-surface" aria-label="Volver" onClick={onClose}>
                        <Icon name="atras" size={22} strokeWidth={2} />
                    </button>
                    <div>
                        <h1 className="title-l">{title}</h1>
                        {sub && <p className="sub">{sub}</p>}
                    </div>
                </header>
                {children}
            </div>
        </div>
    );
}

// --- Lo más contado hoy -------------------------------------------------------

export function Contado({ onClose, onOpen }) {
    const { articles, sources, catalog } = useStore();
    const top = useMemo(() => mostCovered({ articles, sources, catalog }), [articles, sources, catalog]);
    const srcById = new Map(sources.map((s) => [s.id, s]));
    return (
        <Shell title="Lo más contado" sub={`Las historias que más medios de los tuyos han contado en las últimas 24 horas, entre tus ${sources.length} sitios.`} onClose={onClose}>
            {top.length === 0 && <p className="empty-note">Hoy ninguna historia la cuentan dos o más de tus sitios. Con más sitios del mismo tema, aparecerán aquí.</p>}
            <ol className="ranked">
                {top.map((item, i) => (
                    <li key={item.lead.id}>
                        <button type="button" className="ranked-main" onClick={() => onOpen(item.lead.id, item.ids, 'lo más contado')}>
                            <span className="ranked-n">{i + 1}</span>
                            <span className="story-text">
                                <span className="story-title">{item.lead.titleEs || item.lead.title}</span>
                                <span className="sub-s">
                                    {item.sources} fuentes{item.countries > 1 ? ` · ${item.countries} países` : ''} · {agoLabel(item.lead.publishedAt || item.lead.fetchedAt)}
                                </span>
                            </span>
                            <Thumb src={item.lead.image} className="story-thumb" />
                        </button>
                        <button type="button" className="chip chip-btn2" onClick={() => actions.openCompare(item.ids)}>
                            Comparar cómo lo cuenta cada uno
                        </button>
                        <span className="ranked-logos">
                            {item.ids.slice(0, 6).map((id) => {
                                const a = articles.find((x) => x.id === id);
                                return <Monogram key={id} source={srcById.get(a?.sourceId)} size={18} />;
                            })}
                        </span>
                    </li>
                ))}
            </ol>
        </Shell>
    );
}

// --- El mundo hoy -------------------------------------------------------------

export function Mundo({ onClose, onOpen }) {
    const { articles, sources, catalog } = useStore();
    const world = useMemo(() => worldToday({ articles, sources, catalog }), [articles, sources, catalog]);
    const [picked, setPicked] = useState('');
    const current = world.find((c) => c.id === picked) || world[0];
    const max = Math.max(1, ...world.map((c) => c.count));
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const list = current ? current.articles.slice(0, 40) : [];
    return (
        <Shell title="El mundo hoy" sub="Lo que llegó en las últimas 24 horas, según el país de cada medio." onClose={onClose}>
            {world.length === 0 ? (
                <p className="empty-note">Ninguno de tus sitios tiene un país conocido. Los del catálogo sí lo traen.</p>
            ) : (
                <>
                    <div className="tiles" role="group" aria-label="Países">
                        {world.map((c) => (
                            <button key={c.id} type="button" className="tile" aria-pressed={current?.id === c.id} onClick={() => setPicked(c.id)} style={{ '--fill': `${Math.round((c.count / max) * 100)}%` }}>
                                <span>{c.name}</span>
                                <b>{c.count}</b>
                            </button>
                        ))}
                    </div>
                    <div className="rows">
                        {list.map((a) => (
                            <StoryRow key={a.id} article={a} source={sourceOf(a, srcById)} swipe={false} onOpen={() => onOpen(a.id, list.map((x) => x.id), current.name)} />
                        ))}
                    </div>
                </>
            )}
        </Shell>
    );
}

// --- Un buscador para todo ----------------------------------------------------

const PERIODS = [
    { id: '', label: 'Siempre' },
    { id: 'semana', label: 'Esta semana' },
    { id: 'mes', label: 'Este mes' },
];

export function Buscar({ onClose, onOpen, onSite, onCatalog }) {
    const { articles, sources, catalog } = useStore();
    const [query, setQuery] = useState('');
    const [period, setPeriod] = useState('');
    const [savedOnly, setSavedOnly] = useState(false);
    const [inText, setInText] = useState(new Set());
    const input = useRef(null);
    useEffect(() => input.current?.focus(), []);
    // El texto completo se mira cuando el usuario deja de escribir.
    useEffect(() => {
        setInText(new Set());
        if (query.trim().length < 3) return undefined;
        let alive = true;
        const timer = setTimeout(() => actions.searchBodies(query).then((ids) => alive && setInText(ids)), 400);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [query]);
    const found = useMemo(() => searchAll({ query, articles, sources, catalog, inText, period, savedOnly }), [query, articles, sources, catalog, inText, period, savedOnly]);
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const order = found.articles.map((a) => a.id);
    const nothing = query.trim().length >= 2 && !found.articles.length && !found.highlights.length && !found.sources.length && !found.catalog.length;

    return (
        <Shell title="Buscar" onClose={onClose}>
            <div className="search">
                <Icon name="buscar" size={18} />
                <label htmlFor="buscar-todo-global" className="sr">
                    Buscar en todo Faro
                </label>
                <input id="buscar-todo-global" ref={input} type="search" enterKeyHint="search" placeholder="Artículos, notas, resaltados, sitios…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {query && (
                    <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                        <Icon name="cerrar" size={18} />
                    </button>
                )}
            </div>
            <div className="chips-row" role="group" aria-label="Filtros">
                {PERIODS.map((p) => (
                    <button key={p.id} type="button" className="tab-chip" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                        {p.label}
                    </button>
                ))}
                <button type="button" className="tab-chip" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>
                    Solo guardado
                </button>
            </div>
            {query.trim().length < 2 && <p className="hint">Busca en el titular, el texto completo, tus notas, tus resaltados, las etiquetas, tus sitios y el catálogo, todo a la vez.</p>}
            {nothing && <p className="empty-note">Nada coincide con «{query.trim()}».</p>}

            {found.articles.length > 0 && (
                <section className="block">
                    <h3 className="label">Artículos · {found.articles.length}</h3>
                    <div className="rows">
                        {found.articles.map((a) => (
                            <StoryRow key={a.id} article={a} source={sourceOf(a, srcById)} swipe={false} onOpen={() => onOpen(a.id, order, 'la búsqueda')} />
                        ))}
                    </div>
                </section>
            )}
            {found.highlights.length > 0 && (
                <section className="block">
                    <h3 className="label">Resaltados · {found.highlights.length}</h3>
                    <div className="rows">
                        {found.highlights.map((h) => (
                            <button type="button" className="quote-card" key={h.id} onClick={() => onOpen(h.article.id, [h.article.id], 'la búsqueda')}>
                                <span className="quote">
                                    <q>{h.text}</q>
                                    {h.note && <span className="note">{h.note}</span>}
                                </span>
                                <span className="quote-src">{h.article.title}</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}
            {found.sources.length > 0 && (
                <section className="block">
                    <h3 className="label">Tus sitios</h3>
                    <div className="set-list">
                        {found.sources.map((s) => (
                            <button type="button" className="site-line" key={s.id} onClick={() => onSite(s.id)}>
                                <Monogram source={s} size={30} />
                                <span>
                                    {s.title}
                                    <small>{s.folder || 'Sin carpeta'}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}
            {found.catalog.length > 0 && (
                <section className="block">
                    <h3 className="label">En el catálogo</h3>
                    <div className="set-list">
                        {found.catalog.map((s) => (
                            <button type="button" className="site-line" key={s.feed} onClick={onCatalog}>
                                <Monogram source={{ title: s.name, icon: s.icon }} size={30} />
                                <span>
                                    {s.name}
                                    <small>{s.desc}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </Shell>
    );
}

// --- Llévatelo todo antes de un viaje ----------------------------------------

export function ViajeSheet({ onClose }) {
    const { packing } = useStore();
    const counts = useMemo(() => actions.tripCounts(), []);
    const [pick, setPick] = useState({ today: true, saved: true, latest: false });
    const total = (pick.today ? counts.today : 0) + (pick.saved ? counts.saved : 0) + (pick.latest ? counts.latest : 0);
    const rows = [
        { id: 'today', label: 'La edición de Hoy', n: counts.today },
        { id: 'saved', label: 'Lo guardado', n: counts.saved },
        { id: 'latest', label: 'Lo último sin leer de tus sitios', n: counts.latest },
    ];
    return (
        <Sheet title="Para leer sin conexión" subtitle="Faro descarga el texto completo y las fotos para un avión, el metro o donde no haya red." onClose={onClose}>
            <div className="set-list">
                {rows.map((r) => (
                    <div className="site-line" key={r.id}>
                        <span>
                            {r.label}
                            <small>
                                {r.n} {r.n === 1 ? 'artículo' : 'artículos'}
                            </small>
                        </span>
                        <Switch checked={pick[r.id]} onChange={(on) => setPick({ ...pick, [r.id]: on })} label={r.label} />
                    </div>
                ))}
            </div>
            {packing ? (
                <div className="trip-progress" role="status">
                    <div className="meter-bar">
                        <i style={{ width: `${(packing.done / Math.max(1, packing.total)) * 100}%`, background: 'var(--lamp)' }} />
                    </div>
                    <span className="sub-s">
                        {packing.done} de {packing.total} · puedes cerrar esta hoja, sigue en segundo plano
                    </span>
                </div>
            ) : (
                <p className="hint">Mejor con wifi: pueden ser varias decenas de megas. Las fotos de lo guardado no se borran después; las demás dejan sitio a lo nuevo con el tiempo.</p>
            )}
            <button type="button" className="btn-lamp btn-big" disabled={!total || Boolean(packing)} onClick={() => actions.packForTrip(pick)}>
                {packing ? 'Descargando…' : `Descargar ${total} ${total === 1 ? 'artículo' : 'artículos'}`}
            </button>
        </Sheet>
    );
}

// --- Nota de un artículo ------------------------------------------------------

export function NoteSheet({ article, onClose }) {
    const [text, setText] = useState(article.note || '');
    return (
        <Sheet title="Tu nota" subtitle={article.title} onClose={onClose}>
            <div className="field">
                <label htmlFor="nota-articulo" className="sr">
                    Nota sobre el artículo
                </label>
                <textarea id="nota-articulo" rows={6} placeholder="Qué te pareció, para qué te sirve, con qué lo relacionas…" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <p className="hint">Se ve en Biblioteca, entra en el buscador y sale al exportar a Obsidian o Readwise.</p>
            <button
                type="button"
                className="btn-lamp btn-big"
                onClick={() => {
                    actions.setNote(article.id, text);
                    onClose();
                }}
            >
                Guardar la nota
            </button>
            {article.note && (
                <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                        actions.setNote(article.id, '');
                        onClose();
                    }}
                >
                    Borrar la nota
                </button>
            )}
        </Sheet>
    );
}

// --- Libro electrónico --------------------------------------------------------

// Botón que convierte un grupo de artículos en EPUB y lo comparte.
export function EpubButton({ items, title, subtitle, file, label = 'Como libro electrónico (EPUB)', className = 'btn-ghost' }) {
    const [progress, setProgress] = useState(null);
    const go = async () => {
        if (!items.length || progress) return;
        setProgress({ done: 0, total: items.length });
        try {
            const book = await makeEpub({ title, subtitle, items, onProgress: (done, total) => setProgress({ done, total }) });
            await exportBinary(file, book);
        } catch {
            actions.toast('No se pudo preparar el libro');
        } finally {
            setProgress(null);
        }
    };
    return (
        <button type="button" className={className} disabled={!items.length || Boolean(progress)} onClick={go}>
            {progress ? `Preparando el libro… ${progress.done} de ${progress.total}` : label}
        </button>
    );
}
