// Pantallas pequeñas: bandeja de avisos, estadísticas de lectura y la guía de gestos.

import { useEffect, useMemo } from 'react';
import { readingStats, weeklyPicks } from '../core/insights.js';
import { effective } from '../core/pause.js';
import { paceFactor } from '../core/extras2.js';
import { agoLabel } from '../core/text.js';
import { urlKey } from '../core/url.js';
import { actions, useStore } from '../data/store.js';
import { canNotify } from '../ports/background.js';
import Icon from '../ui/Icon.jsx';
import StoryRow from '../ui/StoryRow.jsx';
import { Monogram } from '../ui/bits.jsx';

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

const dayLabel = (ms) => {
    const start = (t) => new Date(t).setHours(0, 0, 0, 0);
    const diff = Math.round((start(Date.now()) - start(ms)) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
};

// Historial de lo que Faro avisó, aunque la notificación ya no esté.
export function Bandeja({ onClose, onNotify }) {
    const { inbox, settings, sources } = useStore();
    const byFeed = useMemo(() => new Map(sources.map((s) => [urlKey(s.feedUrl), s])), [sources]);
    const seenAt = settings.inboxSeenAt || 0;

    // Al entrar se dan por vistos; el punto se queda en los que eran nuevos.
    useEffect(() => {
        actions.loadInbox();
        return () => actions.setSettings({ inboxSeenAt: Date.now() });
    }, []);

    const groups = useMemo(() => {
        const map = new Map();
        for (const entry of inbox) {
            const key = dayLabel(entry.at);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(entry);
        }
        return [...map.entries()];
    }, [inbox]);

    return (
        <Shell title="Avisos" sub="Lo que Faro te avisó, aunque ya hayas borrado la notificación." onClose={onClose}>
            {groups.map(([day, list]) => (
                <section className="block" key={day}>
                    <h3 className="label">{day}</h3>
                    <div className="card list">
                        {list.map((entry, i) => (
                            <button type="button" className="inbox-row" key={`${entry.at}-${i}`} onClick={() => actions.handleOpen({ url: entry.url || '', feed: entry.feed || '' })}>
                                <Monogram source={byFeed.get(urlKey(entry.feed || '')) || { title: entry.heading }} size={36} />
                                <span className="src-text">
                                    <strong>{entry.title}</strong>
                                    <span>
                                        {entry.heading} · {agoLabel(entry.at)}
                                    </span>
                                </span>
                                {entry.at > seenAt && <span className="dot" />}
                            </button>
                        ))}
                    </div>
                </section>
            ))}
            {inbox.length === 0 && (
                <p className="empty-note">
                    {canNotify ? 'Todavía no hay avisos. Cuando Faro te avise de un tema o de un sitio, quedará apuntado aquí.' : 'La bandeja se llena en la app de Android, que es donde llegan los avisos.'}
                </p>
            )}
            <button type="button" className="btn-ghost" onClick={onNotify}>
                Elegir de qué me avisa Faro
            </button>
        </Shell>
    );
}

// Resumen de la semana: cómo fue y lo mejor que quedó sin leer.
export function Semana({ onClose, onOpen }) {
    const { articles, sources, settings, habits, today } = useStore();
    const stats = useMemo(() => readingStats(articles, sources), [articles, sources]);
    const picks = useMemo(() => weeklyPicks({ articles, habits, skip: new Set(today.items.map((it) => it.id)), ...effective({ sources, settings }) }), [articles, sources, settings, habits, today]);
    const order = picks.map((p) => p.article.id);
    const minutes = picks.reduce((sum, p) => sum + (p.article.minutes || 0), 0);

    return (
        <Shell title="Tu semana" sub={stats.count ? `Leíste ${stats.count} ${stats.count === 1 ? 'historia' : 'historias'} en ${stats.minutes} min.` : 'Esta semana no has leído nada en Faro.'} onClose={onClose}>
            <div className="bars week" role="img" aria-label={stats.days.map((d) => `${d.label}: ${d.count}`).join(', ')}>
                {stats.days.map((d, i) => (
                    <div className="bar-col" key={i}>
                        <span className="bar-n">{d.count || ''}</span>
                        <span className={`bar-fill${i === 6 ? ' today' : ''}${d.count ? '' : ' zero'}`} style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / stats.best) * 100)}%` }} />
                        <span className="bar-l">{d.label}</span>
                    </div>
                ))}
            </div>

            <section className="block">
                <h3 className="label">Lo que te quedó</h3>
                {picks.length > 0 ? (
                    <>
                        <p className="hint">
                            {picks.length} {picks.length === 1 ? 'historia' : 'historias'} de estos siete días que encajan contigo · {minutes} min. Como mucho dos por sitio.
                        </p>
                        <div className="rows">
                            {picks.map(({ article, source }) => (
                                <StoryRow key={article.id} article={article} source={source} onOpen={() => onOpen(article.id, order, 'Tu semana')} />
                            ))}
                        </div>
                    </>
                ) : (
                    <p className="empty-note">No te quedó nada pendiente de esta semana.</p>
                )}
            </section>
        </Shell>
    );
}

export function Estadisticas({ onClose, onWeek }) {
    const { articles, sources, settings } = useStore();
    const pace = paceFactor(settings.pace);
    const reads = (settings.pace || []).length;
    const stats = useMemo(() => readingStats(articles, sources), [articles, sources]);
    // Días seguidos leyendo, contando hacia atrás desde hoy.
    const streak = [...stats.days].reverse().findIndex((d) => !d.count);
    const run = streak === -1 ? 7 : streak;
    const logoOf = (name) => sources.find((s) => s.title === name);
    const hours = stats.minutes >= 60 ? `${Math.floor(stats.minutes / 60)} h ${stats.minutes % 60} min` : `${stats.minutes} min`;

    return (
        <Shell title="Tu lectura" sub="Los últimos siete días. Se calcula en tu teléfono y no sale de él." onClose={onClose}>
            <div className="stats3">
                <div>
                    <b>{stats.count}</b>
                    <span>{stats.count === 1 ? 'historia' : 'historias'}</span>
                </div>
                <div>
                    <b>{hours}</b>
                    <span>leyendo</span>
                </div>
                <div>
                    <b>{stats.saved + stats.highlights}</b>
                    <span>guardadas y resaltados</span>
                </div>
            </div>

            <section className="block">
                <h3 className="label">Por día</h3>
                <div className="card pad">
                    <div className="bars" role="img" aria-label={stats.days.map((d) => `${d.label}: ${d.count}`).join(', ')}>
                        {stats.days.map((d, i) => (
                            <div className="bar-col" key={i}>
                                <span className="bar-n">{d.count || ''}</span>
                                <span className={`bar-fill${i === 6 ? ' today' : ''}${d.count ? '' : ' zero'}`} style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / stats.best) * 100)}%` }} />
                                <span className="bar-l">{d.label}</span>
                            </div>
                        ))}
                    </div>
                    <p className="hint">
                        {run > 1 ? `Llevas ${run} días seguidos leyendo. ` : ''}
                        {stats.moment ? `Sueles leer ${stats.moment}.` : ''}
                    </p>
                </div>
            </section>

            {[
                ['Lo que más lees', stats.folders],
                ['Tus sitios', stats.sources],
            ].map(
                ([label, rows]) =>
                    rows.length > 0 && (
                        <section className="block" key={label}>
                            <h3 className="label">{label}</h3>
                            <div className="card pad">
                                {rows.map((row) => (
                                    <div className={`rank${logoOf(row.name) ? ' logo' : ''}`} key={row.name}>
                                        {logoOf(row.name) && <Monogram source={logoOf(row.name)} size={24} />}
                                        <span className="rank-name">{row.name}</span>
                                        <span className="rank-track">
                                            <i style={{ width: `${(row.count / rows[0].count) * 100}%` }} />
                                        </span>
                                        <span className="rank-n">{row.count}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )
            )}

            <section className="block">
                <h3 className="label">Tu ritmo</h3>
                <p className="hint">
                    {reads < 5
                        ? `Faro aún está aprendiendo a qué velocidad lees (${reads} de 5 lecturas completas). Después, los minutos de cada historia serán los tuyos.`
                        : pace < 0.95
                          ? `Lees un ${Math.round((1 / pace - 1) * 100)} % más rápido que la media. Los minutos de cada historia ya están a tu ritmo.`
                          : pace > 1.05
                            ? `Te tomas un ${Math.round((pace - 1) * 100)} % más de tiempo que la media. Los minutos de cada historia ya están a tu ritmo.`
                            : 'Lees a la velocidad media. Los minutos de cada historia ya están a tu ritmo.'}
                </p>
            </section>

            <button type="button" className="btn-ghost" onClick={onWeek}>
                Ver lo que te quedó esta semana
            </button>

            {stats.count === 0 && <p className="empty-note">Aún no hay lecturas que contar. Faro empieza a apuntarlas desde esta versión.</p>}
        </Shell>
    );
}

const TIPS = [
    { icon: 'derecha', title: 'Desliza a la derecha', text: 'Guarda la historia para luego.' },
    { icon: 'izquierda', title: 'Desliza a la izquierda', text: 'La descarta. Puedes deshacerlo.' },
    { icon: 'pulsar', title: 'Mantén pulsada una historia', text: 'Menos de ese sitio, silenciar una palabra o seguirla como tema.' },
    { icon: 'bajar', title: 'Tira hacia abajo', text: 'Busca novedades en Hoy y en Explorar.' },
    { icon: 'derecha', title: 'En el lector, desliza de lado', text: 'Pasa a la historia siguiente o vuelve a la anterior.' },
];

// Se muestra una vez, la primera vez que hay historias que tocar.
export function Gestos() {
    const done = () => actions.setSettings({ tutorialDone: true });
    return (
        <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && done()}>
            <div className="sheet tips" role="dialog" aria-modal="true" aria-label="Cómo se usa Faro">
                <div className="sheet-handle" />
                <h1 className="title-m">Faro se maneja con gestos</h1>
                <div className="card list">
                    {TIPS.map((tip) => (
                        <div className="tip" key={tip.title}>
                            <span className={`tip-icon ${tip.icon}`} aria-hidden="true" />
                            <span className="src-text">
                                <strong>{tip.title}</strong>
                                <span>{tip.text}</span>
                            </span>
                        </div>
                    ))}
                </div>
                <button type="button" className="btn-lamp btn-big" onClick={done}>
                    Entendido
                </button>
                <p className="hint">Puedes volver a ver esto en Ajustes.</p>
            </div>
        </div>
    );
}
