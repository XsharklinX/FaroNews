// «Explorar», lo guardado, la vista de un tema y la página de un sitio: la
// misma lista con distinto filtro, y un buscador que mira también dentro del texto.

import { useEffect, useMemo, useRef, useState } from 'react';
import { matchesQuery } from '../core/text.js';
import { affinity, matchTopic } from '../core/today.js';
import { actions, sourceOf, useStore } from '../data/store.js';
import Icon from '../ui/Icon.jsx';
import StoryRow from '../ui/StoryRow.jsx';
import TopBar from '../ui/TopBar.jsx';
import { Monogram } from '../ui/bits.jsx';

const PAGE = 60;
const when = (a) => a.publishedAt || a.fetchedAt || 0;
const KINDS = [
    { id: 'leer', label: 'Leer', test: (a) => !a.kind },
    { id: 'ver', label: 'Ver', test: (a) => a.kind === 'video' },
    { id: 'escuchar', label: 'Escuchar', test: (a) => a.kind === 'audio' },
];

// `focus` cambia cuando hay que poner el cursor en el buscador (acceso directo
// «Buscar» del icono).
export default function Lista({ mode, topic, sourceId, onOpen, onClose, onEditSource, focus = 0 }) {
    const { sources, articles, settings, habits } = useStore();
    const [unreadOnly, setUnreadOnly] = useState(true);
    const [shown, setShown] = useState(PAGE);
    const [query, setQuery] = useState('');
    const [folder, setFolder] = useState('');
    // Artículos cuyo texto (no solo el titular) contiene lo buscado.
    const [inText, setInText] = useState(null);
    const input = useRef(null);
    const saved = mode === 'guardado';
    const isTopic = mode === 'tema';
    const isSite = mode === 'sitio';
    const site = isSite ? sources.find((s) => s.id === sourceId) : null;
    const searching = query.trim().length > 0;
    const kind = KINDS.find((k) => k.id === settings.listKind) || null;

    useEffect(() => {
        if (focus) input.current?.focus();
    }, [focus]);

    // La búsqueda dentro del texto lee la base de datos: se espera a que el
    // usuario deje de escribir.
    useEffect(() => {
        setInText(null);
        if (query.trim().length < 3) return undefined;
        let alive = true;
        const timer = setTimeout(() => actions.searchBodies(query).then((ids) => alive && setInText(ids)), 400);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [query]);

    const base = useMemo(() => {
        const srcById = new Map(sources.map((s) => [s.id, s]));
        return articles
            .map((article) => ({ article, source: sourceOf(article, srcById) }))
            .filter((it) => it.source)
            .filter(({ article: a }) => {
                if (isSite) return a.sourceId === sourceId;
                if (isTopic) return Boolean(matchTopic(a, [topic]));
                if (saved) return a.saved;
                return true;
            });
    }, [articles, sources, saved, isTopic, isSite, topic, sourceId]);

    const list = useMemo(
        () =>
            base
                .filter(({ article: a, source }) => {
                    if (kind && !kind.test(a)) return false;
                    if (folder && (source.folder || '') !== folder) return false;
                    if (searching) return matchesQuery(query, a.title, a.summary, source.title) || Boolean(inText?.has(a.id));
                    // Al buscar se mira en todo, también lo leído y lo descartado.
                    if (saved || isTopic) return true;
                    return !a.dismissed && (!unreadOnly || !a.read);
                })
                .sort((a, b) => when(b.article) - when(a.article)),
        [base, kind, folder, searching, query, inText, saved, isTopic, unreadOnly]
    );

    const hasMedia = useMemo(() => base.some((it) => it.article.kind), [base]);
    const folders = useMemo(() => (mode === 'todo' ? [...new Set(sources.map((s) => s.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')) : []), [sources, mode]);

    if (isSite && !site) return null;

    const order = list.slice(0, shown).map((it) => it.article.id);
    const title = isSite ? site.title : isTopic ? topic.name : saved ? 'Guardado' : 'Explorar';
    const isFollowed = (settings.topics || []).some((t) => t.name.toLowerCase() === query.trim().toLowerCase());
    const canFilterRead = !saved && !isTopic;
    const unread = isSite ? base.filter((it) => !it.article.read && !it.article.dismissed).length : 0;
    const opened = isSite && base.length ? Math.round((base.filter((it) => it.article.readAt).length / base.length) * 100) : 0;
    const liking = isSite ? affinity(habits[site.id]) : 0;
    const textOnly = searching && inText ? list.filter((it) => !matchesQuery(query, it.article.title, it.article.summary, it.source.title)).length : 0;
    const count = `${list.length} ${list.length === 1 ? 'artículo' : 'artículos'}${searching ? (list.length === 1 ? ' encontrado' : ' encontrados') : canFilterRead && unreadOnly ? ' sin leer' : ''}`;
    const showChips = canFilterRead || hasMedia || folders.length > 1;

    return (
        <div className="screen">
            {mode === 'todo' && <TopBar title="Explorar" note={count} />}

            {onClose && (
                <div className="head-row">
                    <button type="button" className="round round-surface" aria-label="Volver" onClick={onClose}>
                        <Icon name="atras" size={22} strokeWidth={2} />
                    </button>
                    {isSite && (
                        <button type="button" className="round" aria-label={`Ajustes de ${site.title}`} onClick={() => onEditSource(site.id)}>
                            <Icon name="ajustes" size={22} strokeWidth={1.8} />
                        </button>
                    )}
                </div>
            )}

            {isSite && (
                <>
                    <div className="site-head">
                        <Monogram source={site} size={52} />
                        <div>
                            <h1 className="title-m">{site.title}</h1>
                            <p className="sub">
                                {[site.folder, liking >= 0.5 ? 'sueles abrirla' : liking <= -0.25 ? 'sueles descartarla' : '', site.kind === 'page' ? 'sin feed' : ''].filter(Boolean).join(' · ') || 'Sin carpeta'}
                            </p>
                        </div>
                    </div>
                    <div className="stats3">
                        <div>
                            <b>{site.perWeek ? (site.perWeek >= 7 ? Math.round(site.perWeek / 7) : site.perWeek) : '–'}</b>
                            <span>{site.perWeek >= 7 || !site.perWeek ? 'al día' : 'por semana'}</span>
                        </div>
                        <div>
                            <b>{unread}</b>
                            <span>sin leer</span>
                        </div>
                        <div>
                            <b>{opened}%</b>
                            <span>las abres</span>
                        </div>
                    </div>
                </>
            )}

            {isTopic && (
                <div>
                    <h1 className="title-l">{title}</h1>
                    <p className="sub">{count} en todas tus fuentes</p>
                </div>
            )}

            {!isTopic && (
                <div className="search">
                    <Icon name="buscar" size={18} />
                    <label htmlFor={`buscar-${mode}`} className="sr">
                        Buscar
                    </label>
                    <input
                        id={`buscar-${mode}`}
                        ref={input}
                        type="search"
                        enterKeyHint="search"
                        placeholder={isSite ? `Buscar en ${site.title}` : saved ? 'Buscar en lo guardado' : 'Buscar en todo lo recibido'}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setShown(PAGE);
                        }}
                    />
                    {searching && (
                        <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                            <Icon name="cerrar" size={18} />
                        </button>
                    )}
                </div>
            )}

            {/* Una sola fila de filtros: leído, tipo de contenido y carpeta. */}
            {showChips && (
                <div className="chips-row" role="group" aria-label="Filtros">
                    {canFilterRead && !searching && (
                        <button type="button" className="tab-chip" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(!unreadOnly)}>
                            Sin leer
                        </button>
                    )}
                    {hasMedia &&
                        KINDS.map((k) => (
                            <button key={k.id} type="button" className="tab-chip" aria-pressed={kind?.id === k.id} onClick={() => actions.setSettings({ listKind: kind?.id === k.id ? '' : k.id })}>
                                {k.label}
                            </button>
                        ))}
                    {folders.length > 1 &&
                        folders.map((f) => (
                            <button key={f} type="button" className="tab-chip" aria-pressed={folder === f} onClick={() => setFolder(folder === f ? '' : f)}>
                                {f}
                            </button>
                        ))}
                    {isSite && unread > 0 && !searching && (
                        <button type="button" className="tab-chip act" onClick={() => actions.markAllRead(site.id)}>
                            Marcar todo leído
                        </button>
                    )}
                </div>
            )}

            {(searching || saved) && (
                <div className="notes">
                    {saved && list.length > 0 && <p className="sub-s">{count}</p>}
                    {searching && mode === 'todo' && !isFollowed && query.trim().length >= 3 && (
                        <button type="button" className="btn-ghost small" onClick={() => actions.saveTopic({ name: query.trim(), words: [query.trim()] })}>
                            Seguir «{query.trim()}» como tema
                        </button>
                    )}
                    {searching && isFollowed && <p className="hint">Ya sigues «{query.trim()}» como tema: lo que lo mencione entra en Hoy.</p>}
                    {textOnly > 0 && (
                        <p className="hint">
                            {textOnly} {textOnly === 1 ? 'resultado lo menciona' : 'resultados lo mencionan'} dentro del texto, no en el titular.
                        </p>
                    )}
                </div>
            )}

            {list.length === 0 ? (
                <p className="empty-note">
                    {searching
                        ? 'Nada coincide con esa búsqueda.'
                        : kind
                          ? `No hay nada para ${kind.label.toLowerCase()} aquí.`
                          : isTopic
                            ? 'Ninguna de tus fuentes ha mencionado este tema todavía.'
                            : saved
                              ? 'Aquí aparece lo que guardes para luego. Desliza una historia a la derecha o usa el marcador del lector.'
                              : 'No queda nada por leer.'}
                </p>
            ) : (
                <div className="rows">
                    {list.slice(0, shown).map(({ article, source }) => (
                        <StoryRow key={article.id} article={article} source={source} swipe={!saved && !isTopic && !searching} onOpen={() => onOpen(article.id, order, title)} />
                    ))}
                </div>
            )}

            {list.length > shown && (
                <button type="button" className="btn-ghost more" onClick={() => setShown(shown + PAGE)}>
                    Ver más
                </button>
            )}
        </div>
    );
}
