// Hojas pequeñas: etiquetas de un artículo guardado, y el comentario o la
// sugerencia de sitio que el usuario manda a quien publica Faro.

import { useEffect, useMemo, useState } from 'react';
import { FEEDBACK_EMAIL } from '../config.js';
import { PAUSES, pauseLabel, pauseUntil } from '../core/pause.js';
import { actions, useStore } from '../data/store.js';
import { deviceInfo } from '../ports/background.js';
import { QUOTE_STYLES, quoteImage } from '../ports/quote.js';
import { wikiSummary } from '../ports/wiki.js';
import { exportBinary, openExternal, shareText } from '../ports/share.js';
import { Sheet } from '../ui/bits.jsx';
import { TagEditor } from '../ui/settings.jsx';

export function TagsSheet({ id }) {
    const { articles } = useStore();
    const article = articles.find((a) => a.id === id);
    // Etiquetas ya usadas en otros artículos, para no escribirlas otra vez.
    const known = useMemo(() => [...new Set(articles.flatMap((a) => a.tags || []))].sort((a, b) => a.localeCompare(b, 'es')), [articles]);
    if (!article) return null;
    const tags = article.tags || [];
    const others = known.filter((t) => !tags.includes(t));

    return (
        <Sheet title="Etiquetas" subtitle={article.title} onClose={actions.closeTags}>
            <TagEditor id="etiquetas" values={tags} onChange={(next) => actions.setTags(id, next)} placeholder="Añadir una etiqueta" />
            {others.length > 0 && (
                <div className="block">
                    <h3 className="label">Tus etiquetas</h3>
                    <div className="chips">
                        {others.map((t) => (
                            <button key={t} type="button" className="chip-btn" onClick={() => actions.setTags(id, [...tags, t])}>
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <p className="hint">Sirven para encontrar lo guardado en Biblioteca y viajan con tus resaltados al exportarlos.</p>
            <button type="button" className="btn-lamp btn-big" onClick={actions.closeTags}>
                Listo
            </button>
        </Sheet>
    );
}

const KINDS = {
    comentario: { title: 'Enviar comentario', subtitle: 'Qué falla, qué echas en falta o qué cambiarías.', subject: 'Comentario sobre Faro', placeholder: 'Cuéntalo con tus palabras' },
    sitio: { title: 'Sugerir un sitio', subtitle: 'Para que entre en el catálogo de todos.', subject: 'Sitio para el catálogo de Faro', placeholder: 'Por qué merece estar (opcional)' },
};

// `kind`: 'comentario' o 'sitio'.
export function FeedbackSheet({ kind, onClose }) {
    const [text, setText] = useState('');
    const [site, setSite] = useState('');
    const [device, setDevice] = useState(null);
    const copy = KINDS[kind];
    useEffect(() => {
        deviceInfo().then(setDevice);
    }, []);

    const ready = kind === 'sitio' ? site.trim().length > 3 : text.trim().length > 3;
    const send = async () => {
        const footer = `Faro ${__APP_VERSION__}${device?.model ? ` · ${device.model}` : ''}${device?.android ? ` · Android ${device.android}` : ''}`;
        const body = [kind === 'sitio' ? `Sitio: ${site.trim()}` : '', text.trim(), '', footer].filter((line, i) => line || i === 2).join('\n');
        // Con un correo configurado se abre ya dirigido; sin él, el usuario elige por dónde mandarlo.
        if (FEEDBACK_EMAIL) openExternal(`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`);
        else await shareText(copy.subject, `${copy.subject}\n\n${body}`);
        onClose();
    };

    return (
        <Sheet title={copy.title} subtitle={copy.subtitle} onClose={onClose}>
            {kind === 'sitio' && (
                <div className="field">
                    <label htmlFor="sugerir-sitio">Dirección o nombre del sitio</label>
                    <input id="sugerir-sitio" type="text" inputMode="url" placeholder="ejemplo.com" value={site} onChange={(e) => setSite(e.target.value)} />
                </div>
            )}
            <div className="field">
                <label htmlFor="comentario-texto">{kind === 'sitio' ? 'Comentario' : 'Tu comentario'}</label>
                <textarea id="comentario-texto" rows={5} placeholder={copy.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <p className="hint">
                Se añade la versión de Faro{device?.model ? ` (${__APP_VERSION__}) y tu teléfono (${device.model})` : ''}, nada más. {FEEDBACK_EMAIL ? 'Se abre tu aplicación de correo para que lo envíes tú.' : 'Eliges tú por dónde mandarlo.'}
            </p>
            <button type="button" className="btn-lamp btn-big" disabled={!ready} onClick={send}>
                {FEEDBACK_EMAIL ? 'Abrir el correo' : 'Enviar'}
            </button>
        </Sheet>
    );
}

const WHAT = { word: 'No entra en Hoy ni te avisa lo que la mencione.', source: 'Sus historias no entran en Hoy ni te avisan. En Explorar siguen estando.', topic: 'Deja de entrar en Hoy por este tema y de avisarte.' };

// Callar un sitio, un tema o una palabra durante un tiempo. `target` viene de
// actions.openPause: { kind, key, label }.
export function PauseSheet({ target }) {
    const [choice, setChoice] = useState('semana');
    const until = pauseUntil(choice);
    const name = target.kind === 'word' ? `«${target.label}»` : target.label;
    return (
        <Sheet title={`Silenciar ${name}`} subtitle={WHAT[target.kind]} onClose={actions.closePause}>
            <div className="pause-list" role="group" aria-label="Durante cuánto tiempo">
                {PAUSES.map((p) => (
                    <button key={p.id} type="button" aria-pressed={choice === p.id} onClick={() => setChoice(p.id)}>
                        <span>{p.label}</span>
                        {choice === p.id && p.id !== 'siempre' && p.id !== 'dia' && <small>vuelve {pauseLabel(until).replace('hasta ', '')}</small>}
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="btn-lamp btn-big"
                onClick={() => {
                    actions.closePause();
                    actions.pause(target, until);
                }}
            >
                Silenciar
            </button>
        </Sheet>
    );
}

// Una frase resaltada como imagen, con el titular y la fuente.
export function QuoteSheet({ text, title, source, onClose }) {
    const [style, setStyle] = useState(QUOTE_STYLES[0].id);
    const [image, setImage] = useState('');
    useEffect(() => {
        let alive = true;
        quoteImage({ text, title, source, style }).then((png) => alive && setImage(png));
        return () => {
            alive = false;
        };
    }, [text, title, source, style]);

    return (
        <Sheet title="Compartir la frase" subtitle="Una imagen con la cita, el titular y la fuente." onClose={onClose}>
            <div className="quote-preview">{image && <img src={`data:image/png;base64,${image}`} alt={`Imagen con la cita: ${text}`} />}</div>
            <div className="choice" role="group" aria-label="Fondo de la imagen">
                {QUOTE_STYLES.map((s) => (
                    <button key={s.id} type="button" aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>
                        {s.label}
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="btn-lamp btn-big"
                disabled={!image}
                onClick={async () => {
                    await exportBinary('faro-cita.png', image);
                    onClose();
                }}
            >
                Compartir imagen
            </button>
        </Sheet>
    );
}

// Ficha corta de Wikipedia de lo que el usuario seleccionó en el lector.
export function WikiSheet({ term, onClose }) {
    const [page, setPage] = useState(undefined);
    useEffect(() => {
        let alive = true;
        wikiSummary(term).then((found) => alive && setPage(found));
        return () => {
            alive = false;
        };
    }, [term]);

    return (
        <Sheet title={page?.title || term} subtitle={page && !page.exact ? `Lo más parecido a «${term}» en Wikipedia` : 'De Wikipedia en español'} onClose={onClose}>
            {page === undefined && <p className="hint">Buscando…</p>}
            {page === null && <p className="hint">Wikipedia no tiene una página para «{term}». Prueba a seleccionar solo el nombre.</p>}
            {page && (
                <div className="wiki">
                    {page.image && <img src={page.image} alt="" />}
                    <p>{page.extract}</p>
                </div>
            )}
            {page && (
                <button type="button" className="btn-ghost" onClick={() => openExternal(page.url)}>
                    Leer en Wikipedia
                </button>
            )}
        </Sheet>
    );
}
