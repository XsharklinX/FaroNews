import { agoLabel } from '../core/text.js';
import Icon from './Icon.jsx';
import { actions } from '../data/store.js';
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
    return `${article.minutes} min`;
}

// La línea bajo el titular: punto de «sin leer», logo, fuente, hace cuánto,
// cuánto se tarda y por qué está en Hoy.
export function StoryMeta({ article, source, reason }) {
    const rest = [agoLabel(article.publishedAt || article.fetchedAt), lengthLabel(article), reasonLabel(reason)].filter(Boolean).join(' · ');
    return (
        <span className="story-meta">
            {!article.read && <span className="unread" />}
            <Monogram source={source} size={16} />
            <span>
                <b>{source?.title}</b> · {rest}
            </span>
        </span>
    );
}

// Lo que no cabe en la línea: comparar fuentes, guardado y resaltados.
export function StoryChips({ article, also = [] }) {
    if (!also.length && !article.saved && !article.highlights?.length) return null;
    return (
        <div className="story-chips">
            {also.length > 0 && (
                <button type="button" className="chip chip-btn2" onClick={() => actions.openCompare([article.id, ...also])}>
                    Comparar {also.length + 1} fuentes
                </button>
            )}
            {article.saved && <span className="chip">Guardado</span>}
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

    const body = (
        <div className={`story${article.read ? ' is-read' : ''}`} {...press.handlers}>
            <button type="button" className="story-main" onClick={() => !press.guard() && onOpen()}>
                <span className="story-text">
                    <span className="story-title">{article.title}</span>
                    <StoryMeta article={article} source={source} reason={reason} />
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
