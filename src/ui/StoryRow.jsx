import { agoLabel } from '../core/text.js';
import Icon from './Icon.jsx';
import { actions, useStore } from '../data/store.js';
import { headline, minutesFor } from './look.js';
import { Monogram, Swipe, Thumb, useLongPress } from './bits.jsx';

export function reasonLabel(reason) {
    if (reason?.type === 'alerta') return `tema ${reason.keyword}`;
    if (reason?.type === 'prioritaria') return 'prioritaria';
    if (reason?.type === 'habito') return 'sueles abrirlo';
    return '';
}

export function lengthLabel(article) {
    if (article.kind === 'video') return 'vídeo';
    if (article.kind === 'audio') return article.duration ? `podcast ${article.duration} min` : 'podcast';
    return `${minutesFor(article)} min`;
}

// La línea bajo el titular: punto de «sin leer», logo, fuente, hace cuánto,
// cuánto se tarda y por qué está en Hoy.
export function StoryMeta({ article, source, reason, note = '' }) {
    const rest = [agoLabel(article.publishedAt || article.fetchedAt), lengthLabel(article), reasonLabel(reason), note].filter(Boolean).join(' · ');
    // En una búsqueda en la web, el nombre que importa es el del medio que lo publica.
    const name = source?.kind === 'web' && article.author ? article.author : source?.title;
    return (
        <span className="story-meta">
            {!article.read && <span className="unread" />}
            <Monogram source={source} size={16} />
            <span>
                <b>{name}</b> · {rest}
            </span>
        </span>
    );
}

// Lo que no cabe en la línea: comparar fuentes, guardado y resaltados.
export function StoryChips({ article, also = [] }) {
    if (!also.length && !article.saved && !article.highlights?.length && !article.note) return null;
    return (
        <div className="story-chips">
            {also.length > 0 && (
                <button type="button" className="chip chip-btn2" onClick={() => actions.openCompare([article.id, ...also])}>
                    Comparar {also.length + 1} fuentes
                </button>
            )}
            {article.saved && <span className="chip">Guardado</span>}
            {article.note && <span className="chip">Con nota</span>}
            {article.highlights?.length > 0 && (
                <span className="chip">
                    {article.highlights.length} {article.highlights.length === 1 ? 'resaltado' : 'resaltados'}
                </span>
            )}
        </div>
    );
}

// Una historia en una lista: titular, línea de datos y miniatura.
// `also` son los ids de los artículos de otras fuentes que cuentan lo mismo.
export default function StoryRow({ article, source, reason, also = [], onOpen, swipe = true }) {
    const press = useLongPress(() => actions.openMenu(article.id));
    const { revealed } = useStore();
    const head = headline(article, revealed);
    // Un posible espóiler se destapa con el primer toque y se abre con el segundo.
    const tap = () => (head.spoiler ? actions.reveal(article.id) : onOpen());

    const body = (
        <div className={`story${article.read ? ' is-read' : ''}${head.spoiler ? ' spoiler' : ''}`} {...press.handlers}>
            <button type="button" className="story-main" onClick={() => !press.guard() && tap()} title={head.original || undefined}>
                <span className="story-text">
                    <span className="story-title">{head.title}</span>
                    <StoryMeta article={article} source={source} reason={reason} note={head.note} />
                </span>
                {article.image && (
                    <span className="media-box">
                        <Thumb src={article.image} className="story-thumb" />
                        {article.kind && (
                            <span className="media-badge">
                                <Icon name={article.kind === 'video' ? 'play' : 'audio'} size={14} filled={article.kind === 'video'} />
                            </span>
                        )}
                    </span>
                )}
            </button>
            <StoryChips article={article} also={also} />
        </div>
    );

    if (!swipe) return body;
    return (
        <Swipe onRight={() => actions.toggleSaved(article.id)} onLeft={() => actions.dismiss(article.id)}>
            {body}
        </Swipe>
    );
}
