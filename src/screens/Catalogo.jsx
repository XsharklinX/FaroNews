// Catálogo de sitios por tema. Cada feed del catálogo se comprueba contra la
// red con `node scripts/check-catalog.mjs` antes de entrar en catalog.json.
//
// Tres vistas en la misma pantalla: la portada (temas y sugerencias), un tema
// y los resultados de buscar. Tocar un sitio abre su vista previa.

import { useEffect, useMemo, useState } from 'react';
import catalog from '../catalog/catalog.json';
import { suggestSites } from '../core/insights.js';
import { agoLabel, matchesQuery } from '../core/text.js';
import { urlKey } from '../core/url.js';
import { actions, useStore } from '../data/store.js';
import { openExternal } from '../ports/share.js';
import Icon from '../ui/Icon.jsx';
import { Monogram, Sheet, Thumb } from '../ui/bits.jsx';

const NATIONAL = 'nacionales';
const LANGS = [
    { id: '', label: 'Todos' },
    { id: 'es', label: 'En español' },
    { id: 'en', label: 'En inglés' },
];

// El botón atrás de Android pregunta aquí antes de cerrar el catálogo: dentro
// de un tema, atrás vuelve a la portada.
export const catalogBack = { current: null };

// País por defecto: el de la región del teléfono si está en el catálogo.
function guessCountry() {
    const region = (navigator.language || '').split('-')[1]?.toLowerCase();
    return catalog.countries.some((c) => c.id === region) ? region : catalog.countries[0].id;
}

function pace(perWeek) {
    if (!perWeek) return '';
    if (perWeek >= 200) return 'Publica muchísimo';
    if (perWeek >= 7) return `Unos ${Math.round(perWeek / 7)} al día`;
    if (perWeek >= 3) return `Unos ${perWeek} por semana`;
    return 'Publica poco';
}

const host = (entry) => {
    try {
        return new URL(entry.site || entry.feed).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};
const nameOf = (id) => catalog.categories.find((c) => c.id === id)?.name || '';
const asSource = (entry) => ({ title: entry.name, icon: entry.icon });

// Lo último que ha publicado un sitio, para decidir antes de seguirlo.
function Preview({ entry, on, onToggle, onRead, onClose }) {
    const [items, setItems] = useState(null);
    const [failed, setFailed] = useState(false);
    const [opening, setOpening] = useState('');

    useEffect(() => {
        let alive = true;
        setItems(null);
        setFailed(false);
        actions
            .peekFeed(entry.feed, entry.kind)
            .then((found) => alive && setItems(found))
            .catch(() => alive && setFailed(true));
        return () => {
            alive = false;
        };
    }, [entry.feed, entry.kind]);

    // Un artículo se lee aquí mismo, sin seguir el sitio; un vídeo o un
    // podcast se abre en su página.
    const read = async (item) => {
        if (opening) return;
        if (item.kind) {
            openExternal(item.url);
            return;
        }
        setOpening(item.url);
        const id = await actions.openLink(item.url);
        setOpening('');
        if (id) onRead(id, entry.name);
        else openExternal(item.url);
    };

    const facts = [nameOf(entry.cat), entry.kind === 'page' ? 'Sin feed: se leen sus titulares' : pace(entry.perWeek), entry.lang === 'en' ? 'En inglés' : ''].filter(Boolean);

    return (
        <Sheet title={entry.name} subtitle={entry.desc} onClose={onClose}>
            <div className="peek-head">
                <Monogram source={asSource(entry)} size={48} />
                <div className="src-text">
                    <strong>{host(entry)}</strong>
                    <span>{facts.join(' · ')}</span>
                </div>
            </div>

            <div className="block">
                <h3 className="label">Lo último</h3>
                {failed && <p className="hint">No se pudo leer el sitio ahora mismo. Puedes seguirlo igual: Faro lo volverá a intentar al actualizar.</p>}
                {!items && !failed && (
                    <div className="peek-list" aria-label="Cargando">
                        {[0, 1, 2, 3].map((i) => (
                            <div className="peek-skel" key={i}>
                                <span />
                                <span />
                            </div>
                        ))}
                    </div>
                )}
                {items && items.length === 0 && <p className="hint">El sitio no tiene nada publicado ahora mismo.</p>}
                {items && items.length > 0 && (
                    <div className="peek-list">
                        {items.map((item) => (
                            <button type="button" className="peek-item" key={item.url} onClick={() => read(item)} disabled={Boolean(opening)}>
                                <span className="story-text">
                                    <span className="story-title">{item.title}</span>
                                    <span className="sub-s">{opening === item.url ? 'Abriendo…' : [agoLabel(item.publishedAt), item.kind === 'video' ? 'vídeo' : item.kind === 'audio' ? 'podcast' : ''].filter(Boolean).join(' · ') || 'Leer'}</span>
                                </span>
                                <Thumb src={item.image} className="peek-thumb" />
                            </button>
                        ))}
                    </div>
                )}
                {items && items.length > 0 && <p className="hint">Toca un titular para leerlo sin seguir el sitio.</p>}
            </div>

            <button type="button" className={on ? 'btn-ghost' : 'btn-lamp btn-big'} onClick={onToggle}>
                {on ? 'Dejar de seguir' : `Seguir ${entry.name}`}
            </button>
        </Sheet>
    );
}

function Row({ entry, on, tag, onOpen, onToggle }) {
    return (
        <div className="cat-row">
            <button type="button" className="cat-main" onClick={onOpen} aria-label={`Ver ${entry.name} antes de seguir`}>
                <Monogram source={asSource(entry)} size={44} />
                <span className="src-text">
                    <strong>
                        {entry.name}
                        {entry.lang === 'en' && <span className="tag">EN</span>}
                    </strong>
                    <span>{entry.desc}</span>
                    <span className="cat-meta">
                        {tag && <b>{tag}</b>}
                        {entry.kind === 'page' ? 'Sin feed' : pace(entry.perWeek)}
                    </span>
                </span>
            </button>
            <button type="button" className={`follow${on ? ' on' : ''}`} aria-pressed={on} onClick={onToggle}>
                {on && <Icon name="ok" size={16} strokeWidth={3} />}
                {on ? 'Siguiendo' : 'Seguir'}
            </button>
        </div>
    );
}

export default function Catalogo({ onClose, onAddByUrl, onRead }) {
    const { sources, settings } = useStore();
    const [cat, setCat] = useState('');
    const [query, setQuery] = useState('');
    const [lang, setLang] = useState('');
    const [peek, setPeek] = useState(null);
    const searching = query.trim().length > 0;
    const country = settings.country || guessCountry();

    const followed = useMemo(() => new Map(sources.map((s) => [urlKey(s.feedUrl), s.id])), [sources]);
    const isFollowed = (entry) => followed.has(urlKey(entry.feed));
    const follow = (entry) => actions.followCatalog(entry, nameOf(entry.cat));
    const toggle = (entry) => (isFollowed(entry) ? actions.removeSource(followed.get(urlKey(entry.feed))) : follow(entry));

    // Atrás: primero la vista previa, luego el tema, luego el catálogo.
    useEffect(() => {
        catalogBack.current = () => {
            if (peek) setPeek(null);
            else if (cat) setCat('');
            else return false;
            return true;
        };
        return () => {
            catalogBack.current = null;
        };
    }, [peek, cat]);

    // Portada: cada tema con sus primeros logos y cuántos sitios sigues ya.
    const topics = useMemo(
        () =>
            catalog.categories.map((c) => {
                const all = catalog.sources.filter((s) => s.cat === c.id && (c.id !== NATIONAL || s.country === country));
                const faces = [...all].sort((a, b) => Number(Boolean(b.top)) - Number(Boolean(a.top))).filter((s) => String(s.icon || '').startsWith('catalog-icons/'));
                return { ...c, count: all.length, mine: all.filter((s) => followed.has(urlKey(s.feed))).length, faces: faces.slice(0, 4) };
            }),
        [country, followed]
    );
    const suggestions = useMemo(() => suggestSites(catalog, sources, 8), [sources]);

    const inTopic = useMemo(() => catalog.sources.filter((s) => s.cat === cat && (cat !== NATIONAL || s.country === country)), [cat, country]);
    const hasEnglish = inTopic.some((s) => s.lang === 'en') && inTopic.some((s) => s.lang !== 'en');
    const list = useMemo(() => {
        const base = searching ? catalog.sources.filter((s) => matchesQuery(query, s.name, s.desc, host(s), nameOf(s.cat))) : inTopic.filter((s) => !lang || (s.lang || 'es') === lang);
        // Recomendadas primero; después, en español antes que en inglés.
        return [...base].sort((a, b) => Number(Boolean(b.top)) - Number(Boolean(a.top)) || Number(a.lang === 'en') - Number(b.lang === 'en') || a.name.localeCompare(b.name, 'es'));
    }, [inTopic, lang, query, searching]);
    const pending = list.filter((s) => s.top && !isFollowed(s));

    const openTopic = (id) => {
        setCat(id);
        setLang('');
        document.querySelector('.overlay')?.scrollTo(0, 0);
    };
    const back = () => (cat && !searching ? setCat('') : onClose());
    const view = searching ? 'buscar' : cat ? 'tema' : 'portada';

    return (
        <div className="overlay">
            <div className="screen">
                <header className="cat-head">
                    <button type="button" className="round round-surface" aria-label="Volver" onClick={back}>
                        <Icon name="atras" size={22} strokeWidth={2} />
                    </button>
                    <div>
                        <h1 className="title-l">{view === 'tema' ? nameOf(cat) : 'Catálogo'}</h1>
                        <p className="sub">
                            {view === 'tema'
                                ? `${inTopic.length} ${inTopic.length === 1 ? 'sitio' : 'sitios'}. Toca uno para ver qué publica antes de seguirlo.`
                                : `${catalog.sources.length} sitios comprobados en ${catalog.categories.length} temas.`}
                        </p>
                    </div>
                </header>

                <div className="search">
                    <Icon name="buscar" size={18} />
                    <label htmlFor="buscar-catalogo" className="sr">
                        Buscar en el catálogo
                    </label>
                    <input id="buscar-catalogo" type="search" placeholder="Buscar un sitio o un tema" value={query} onChange={(e) => setQuery(e.target.value)} />
                    {searching && (
                        <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                            <Icon name="cerrar" size={18} />
                        </button>
                    )}
                </div>

                {view === 'portada' && (
                    <>
                        {suggestions.length > 0 && (
                            <section className="block">
                                <h3 className="label">Para ti</h3>
                                <div className="scroller sug-row">
                                    {suggestions.map((entry) => (
                                        <div className="sug" key={entry.feed}>
                                            <button type="button" className="sug-main" onClick={() => setPeek(entry)}>
                                                <Monogram source={asSource(entry)} size={44} />
                                                <strong>{entry.name}</strong>
                                                <span>Porque sigues {entry.because}</span>
                                            </button>
                                            <button type="button" className="follow" onClick={() => follow(entry)}>
                                                Seguir
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section className="block">
                            <h3 className="label">Temas</h3>
                            <div className="topic-grid">
                                {topics.map((t) => (
                                    <button type="button" className="topic" key={t.id} onClick={() => openTopic(t.id)}>
                                        <span className="faces">
                                            {t.faces.map((s) => (
                                                <Monogram key={s.feed} source={asSource(s)} size={30} />
                                            ))}
                                        </span>
                                        <strong>{t.name}</strong>
                                        <span>
                                            {t.count} {t.count === 1 ? 'sitio' : 'sitios'}
                                            {t.mine > 0 && <b> · sigues {t.mine}</b>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </>
                )}

                {view === 'tema' && (cat === NATIONAL || hasEnglish) && (
                    <div className="chips-row" role="group" aria-label={cat === NATIONAL ? 'País' : 'Idioma'}>
                        {cat === NATIONAL
                            ? catalog.countries.map((c) => (
                                  <button key={c.id} type="button" className="tab-chip" aria-pressed={c.id === country} onClick={() => actions.setSettings({ country: c.id })}>
                                      {c.name}
                                  </button>
                              ))
                            : LANGS.map((l) => (
                                  <button key={l.id} type="button" className="tab-chip" aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>
                                      {l.label}
                                  </button>
                              ))}
                    </div>
                )}

                {view === 'tema' && pending.length > 1 && (
                    <button type="button" className="btn-ghost" onClick={() => pending.forEach(follow)}>
                        Seguir las {pending.length} recomendadas
                    </button>
                )}

                {view === 'buscar' && (
                    <p className="sub-s">
                        {list.length} {list.length === 1 ? 'sitio encontrado' : 'sitios encontrados'}
                    </p>
                )}
                {view !== 'portada' && list.length === 0 && <p className="empty-note">{searching ? 'Nada en el catálogo coincide. Puedes añadirlo por su dirección, aquí abajo.' : 'No hay sitios con ese filtro.'}</p>}

                {view !== 'portada' && list.length > 0 && (
                    <div className="card list">
                        {list.map((entry) => (
                            <Row
                                key={entry.feed}
                                entry={entry}
                                on={isFollowed(entry)}
                                tag={searching ? nameOf(entry.cat) : entry.top ? 'Recomendada' : ''}
                                onOpen={() => setPeek(entry)}
                                onToggle={() => toggle(entry)}
                            />
                        ))}
                    </div>
                )}

                <div className="cat-foot">
                    <p className="hint">¿No está el sitio que buscas? Faro puede seguir casi cualquier web, canal de YouTube o podcast.</p>
                    <button type="button" className="btn-ghost" onClick={onAddByUrl}>
                        Añadir un sitio por su dirección
                    </button>
                </div>
            </div>

            {peek && <Preview entry={peek} on={isFollowed(peek)} onToggle={() => toggle(peek)} onRead={onRead} onClose={() => setPeek(null)} />}
        </div>
    );
}
