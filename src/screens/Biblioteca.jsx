// Lo que el usuario quiso conservar: artículos guardados, frases resaltadas y
// la cola de podcasts.

import { useState } from 'react';
import { clock, player, usePlayer } from '../data/player.js';
import { useStore } from '../data/store.js';
import Icon from '../ui/Icon.jsx';
import TopBar from '../ui/TopBar.jsx';
import { Monogram, Thumb } from '../ui/bits.jsx';
import Lista from './Lista.jsx';
import Resaltados from './Resaltados.jsx';

const PANES = [
    { id: 'guardado', label: 'Guardado' },
    { id: 'resaltados', label: 'Resaltados' },
    { id: 'cola', label: 'Cola' },
];

function Cola({ onOpen }) {
    const { queue, current, playing, time, duration } = usePlayer();
    const { articles, sources } = useStore();
    const byId = new Map(articles.map((a) => [a.id, a]));
    const inQueue = queue.filter((id) => byId.has(id));
    // Episodios empezados que ya no están en la cola: se pueden retomar.
    const started = articles.filter((a) => a.kind === 'audio' && a.audioPos > 5 && !queue.includes(a.id)).sort((a, b) => (b.readAt || b.fetchedAt) - (a.readAt || a.fetchedAt));

    if (!inQueue.length && !started.length) {
        return <p className="empty-note">Aquí esperan los podcasts que pongas en cola. Abre un episodio y toca «A la cola», o «Escuchar» para que suene ya.</p>;
    }

    const row = (article, queued, first) => {
        const source = sources.find((s) => s.id === article.sourceId);
        const isCurrent = article.id === current;
        const total = isCurrent && duration ? duration : (article.duration || 0) * 60;
        const at = isCurrent ? time : article.audioPos || 0;
        const left = total > at ? `quedan ${clock(total - at)}` : article.duration ? `${article.duration} min` : 'Podcast';
        return (
            <div className="q-row" key={article.id}>
                <button type="button" className="q-main" onClick={() => onOpen(article.id, [article.id], 'Cola')}>
                    {article.image ? <Thumb src={article.image} className="q-img" /> : <Monogram source={source} size={52} />}
                    <span className="q-text">
                        <strong>{article.title}</strong>
                        <span>
                            {source?.title} · {left}
                        </span>
                        {total > 0 && at > 5 && (
                            <span className="q-prog">
                                <i style={{ width: `${Math.min(100, (at / total) * 100)}%` }} />
                            </span>
                        )}
                    </span>
                </button>
                {queued && !first && !isCurrent && (
                    <button type="button" className="round" aria-label="Subir en la cola" onClick={() => player.moveUp(article.id)}>
                        <Icon name="subir" size={18} />
                    </button>
                )}
                <button type="button" className="round" aria-label={isCurrent && playing ? 'Pausar' : 'Reproducir'} onClick={() => player.play(article.id)}>
                    <Icon name={isCurrent && playing ? 'pausa' : 'play'} size={18} filled />
                </button>
                {queued && (
                    <button type="button" className="round" aria-label="Quitar de la cola" onClick={() => player.remove(article.id)}>
                        <Icon name="cerrar" size={18} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            {inQueue.length > 0 && <div className="rows">{inQueue.map((id, i) => row(byId.get(id), true, i === 0))}</div>}
            {started.length > 0 && (
                <>
                    <div className="sec">
                        <h3 className="label">A medias</h3>
                    </div>
                    <div className="rows">{started.slice(0, 20).map((a) => row(a, false, false))}</div>
                </>
            )}
        </>
    );
}

export default function Biblioteca({ onOpen }) {
    const { articles } = useStore();
    const { queue } = usePlayer();
    const [pane, setPane] = useState('guardado');
    const counts = {
        guardado: articles.filter((a) => a.saved).length,
        resaltados: articles.reduce((sum, a) => sum + (a.highlights?.length || 0), 0),
        cola: queue.length,
    };

    return (
        <div className="screen">
            <TopBar title="Biblioteca" />
            <div className="tabs" role="group" aria-label="Qué ver">
                {PANES.map((p) => (
                    <button key={p.id} type="button" aria-pressed={pane === p.id} onClick={() => setPane(p.id)}>
                        {p.label}
                        {counts[p.id] > 0 ? ` ${counts[p.id]}` : ''}
                    </button>
                ))}
            </div>
            {pane === 'guardado' && <Lista mode="guardado" onOpen={onOpen} />}
            {pane === 'resaltados' && <Resaltados onOpen={onOpen} />}
            {pane === 'cola' && <Cola onOpen={onOpen} />}
        </div>
    );
}
