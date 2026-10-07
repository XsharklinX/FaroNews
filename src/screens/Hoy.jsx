import { useMemo } from 'react';
import { actions, nextEditionCount, useStore } from '../data/store.js';
import Icon from '../ui/Icon.jsx';
import StoryRow, { StoryChips, StoryMeta } from '../ui/StoryRow.jsx';
import { headline, minutesFor } from '../ui/look.js';
import TopBar, { TopIcons } from '../ui/TopBar.jsx';
import { Thumb, useLongPress } from '../ui/bits.jsx';

const TOPICS = 'Tus temas';
const LOOSE = 'Más historias';
const AFTERNOON = 13;

// Agrupa las historias en secciones: primero los temas del usuario, después
// una sección por carpeta, en el orden en que aparece su mejor historia.
function toSections(items) {
    const map = new Map();
    for (const it of items) {
        const name = it.reason?.type === 'alerta' ? TOPICS : it.source.folder || LOOSE;
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(it);
    }
    const sections = [...map.entries()].map(([name, list]) => ({ name, list }));
    return sections.sort((a, b) => Number(b.name === TOPICS) - Number(a.name === TOPICS));
}

function Lighthouse() {
    return (
        <svg className="aldia-art" viewBox="0 0 390 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <path d="M118 150 L390 40 V250 Z" fill="#FFC53D" opacity="0.16" />
            <path d="M118 150 L390 96 V196 Z" fill="#FFC53D" opacity="0.22" />
            <path d="M96 150 L0 110 V190 Z" fill="#FFC53D" opacity="0.10" />
            <circle cx="300" cy="70" r="2" fill="#C9D3E6" />
            <circle cx="60" cy="56" r="1.5" fill="#C9D3E6" />
            <circle cx="210" cy="36" r="1.5" fill="#C9D3E6" />
            <circle cx="340" cy="290" r="1.5" fill="#C9D3E6" />
            <path d="M94 134h26l-4-18h-18z" fill="#F4F7FB" />
            <rect x="88" y="134" width="38" height="32" rx="6" fill="#FFC53D" />
            <path d="M90 174h34l14 190H76z" fill="#F4F7FB" />
            <path d="M86 236h42l3 40H83z" fill="#0A1326" opacity="0.85" />
            <path d="M0 364h390v56H0z" fill="#15244A" />
            <path d="M0 364c40-10 70 10 110 0s70-10 110 0 70 10 110 0 40-6 60 0v10H0z" fill="#1D3163" />
        </svg>
    );
}

// La historia que abre la edición: foto grande, titular y entradilla.
function Lead({ lead, also, onOpen }) {
    const press = useLongPress(() => actions.openMenu(lead.id));
    const { revealed } = useStore();
    const { article } = lead;
    const head = headline(article, revealed);
    return (
        <article className={`lead${article.read ? ' is-read' : ''}${head.spoiler ? ' spoiler' : ''}`} {...press.handlers}>
            <button type="button" className="lead-main" onClick={() => !press.guard() && (head.spoiler ? actions.reveal(lead.id) : onOpen(lead.id))}>
                <Thumb src={article.image} className="lead-img" />
                <h2>{head.title}</h2>
                {article.summary && !head.spoiler && <p className="lead-deck">{article.summary}</p>}
                <StoryMeta article={article} source={lead.source} reason={lead.reason} note={head.note} />
            </button>
            <StoryChips article={article} also={also} />
        </article>
    );
}

export default function Hoy({ onOpen, onAdd, onCatalog, onTab, onWeek }) {
    const { sources, articles, today, refreshing } = useStore();
    const edition = today.edition || 1;
    const afternoon = new Date().getHours() >= AFTERNOON;
    const sunday = new Date().getDay() === 0;

    const view = useMemo(() => {
        const byId = new Map(articles.map((a) => [a.id, a]));
        const srcById = new Map(sources.map((s) => [s.id, s]));
        const items = today.items
            .map((it) => {
                const article = byId.get(it.id);
                const source = article && srcById.get(article.sourceId);
                const also = (it.also || []).filter((id) => byId.has(id) && srcById.has(byId.get(id).sourceId));
                return article && source ? { ...it, article, source, also } : null;
            })
            .filter(Boolean);
        const pending = items.filter((it) => !it.article.read);
        return {
            items,
            pending,
            done: items.length - pending.length,
            minutes: pending.reduce((sum, it) => sum + minutesFor(it.article), 0),
            waiting: articles.filter((a) => !a.read && !a.dismissed).length,
            // Lo que traería la edición de tarde; solo se mira cuando puede salir.
            nextEdition: edition === 1 && afternoon && sources.length ? nextEditionCount() : 0,
        };
    }, [articles, sources, today, edition, afternoon]);

    const fecha = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

    if (!sources.length) {
        return (
            <div className="screen empty">
                <TopBar title="Hoy" note={fecha} />
                <p className="empty-lede">Faro vigila los sitios que te importan y cada día te entrega una lista corta de lo que vale la pena leer.</p>
                <button type="button" className="btn-lamp btn-big" onClick={onCatalog}>
                    Elegir sitios del catálogo
                </button>
                <button type="button" className="btn-ghost" onClick={onAdd}>
                    Añadir un sitio por su dirección
                </button>
                <p className="hint">El catálogo trae sitios de tecnología, videojuegos, actualidad, economía y más. También puedes pegar la dirección de cualquier web.</p>
            </div>
        );
    }

    if (!view.pending.length) {
        return (
            <div className="screen aldia">
                <TopIcons />
                <Lighthouse />
                <div className="aldia-body">
                    <h1 className="title-xl">Estás al día</h1>
                    <p className="aldia-lede">
                        {view.items.length
                            ? `Leíste ${view.items.length === 1 ? 'la historia' : `las ${view.items.length} historias`} de ${edition > 1 ? 'la tarde' : 'hoy'}. Lo demás puede esperar.`
                            : 'No hay historias nuevas por ahora. Lo demás puede esperar.'}
                    </p>
                    {view.nextEdition > 0 && view.items.length > 0 && (
                        <div className="night-card lamp">
                            <div>
                                <strong>Edición de tarde lista</strong>
                                <span>
                                    {view.nextEdition} {view.nextEdition === 1 ? 'historia nueva' : 'historias nuevas'} desde esta mañana.
                                </span>
                            </div>
                            <button type="button" className="btn-lamp" onClick={actions.nextEdition}>
                                Abrir
                            </button>
                        </div>
                    )}
                    {sunday && (
                        <div className="night-card">
                            <div>
                                <strong>Resumen de la semana</strong>
                                <span>Cómo fue y lo mejor que te quedó sin leer.</span>
                            </div>
                            <button type="button" className="btn-night" onClick={onWeek}>
                                Ver
                            </button>
                        </div>
                    )}
                    {edition === 1 && view.items.length > 0 && !afternoon && <p className="aldia-note">La edición de tarde sale a partir de la 1.</p>}
                    {view.waiting > 0 && (
                        <div className="night-card">
                            <div>
                                <strong>
                                    {view.waiting} {view.waiting === 1 ? 'artículo más' : 'artículos más'} en Explorar
                                </strong>
                                <span>Sin ordenar por importancia, por si quieres seguir.</span>
                            </div>
                            <button type="button" className="btn-night" onClick={() => onTab('explorar')}>
                                Explorar
                            </button>
                        </div>
                    )}
                    <button type="button" className="night-link" onClick={actions.refreshAll} disabled={refreshing}>
                        <Icon name="actualizar" size={18} />
                        {refreshing ? 'Buscando novedades…' : 'Buscar novedades'}
                    </button>
                </div>
            </div>
        );
    }

    // La edición no se reordena al leer: lo leído se queda en su sitio, apagado.
    const [lead, ...rest] = view.items;
    const sections = toSections(rest);
    // «Siguiente» en el lector sigue el orden en que se ven las historias.
    const order = [lead.id, ...sections.flatMap((s) => s.list.map((it) => it.id))];
    const open = (id) => onOpen(id, order, 'Hoy');

    return (
        <div className="screen">
            <TopBar title="Hoy" note={fecha} />

            <div className="tabs" role="group" aria-label="Edición">
                {edition === 1 && (
                    <button type="button" aria-pressed="true">
                        Mañana
                    </button>
                )}
                {edition === 1 ? (
                    <button
                        type="button"
                        aria-pressed="false"
                        onClick={() => (view.nextEdition > 0 ? actions.nextEdition() : actions.toast(afternoon ? 'Aún no hay historias nuevas para la tarde' : 'La edición de tarde sale a partir de la 1'))}
                    >
                        Tarde{view.nextEdition > 0 ? ` · ${view.nextEdition}` : ''}
                    </button>
                ) : (
                    <button type="button" aria-pressed="true">
                        Tarde
                    </button>
                )}
                <span className="count">
                    {view.done} de {view.items.length} · {view.minutes} min
                </span>
            </div>
            <div className="prog" role="img" aria-label={`${view.done} de ${view.items.length} leídas`}>
                <i style={{ width: `${(view.done / view.items.length) * 100}%` }} />
            </div>

            {sunday && (
                <button type="button" className="cat-entry week-entry" onClick={onWeek}>
                    <span>
                        <strong>Resumen de la semana</strong>
                        <small>Cómo fue y lo mejor que te quedó sin leer</small>
                    </span>
                    <Icon name="siguiente" size={20} />
                </button>
            )}

            <Lead lead={lead} also={lead.also} onOpen={open} />

            {sections.map((section) => {
                const unread = section.list.filter((it) => !it.article.read).map((it) => it.id);
                return (
                    <section key={section.name}>
                        <div className="sec">
                            <h3 className="label">{section.name}</h3>
                            {unread.length > 0 && (
                                <button type="button" onClick={() => actions.markListRead(unread)}>
                                    Marcar leída
                                </button>
                            )}
                        </div>
                        <div className="rows">
                            {section.list.map((it) => (
                                <StoryRow key={it.id} article={it.article} source={it.source} reason={it.reason} also={it.also} swipe={!it.article.read} onOpen={() => open(it.id)} />
                            ))}
                        </div>
                    </section>
                );
            })}

            <div className="end">
                <b>Fin de la edición</b>
                {view.pending.length === 1 ? 'Te queda una historia.' : `Te quedan ${view.pending.length} historias.`} Lo demás está en Explorar.
            </div>
        </div>
    );
}
