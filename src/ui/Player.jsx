// Mini reproductor fijo sobre la barra de abajo, y la hoja con la cola.

import { clock, player, RATES, usePlayer } from '../data/player.js';
import { useStore } from '../data/store.js';
import Icon from './Icon.jsx';
import { Monogram, Sheet, Thumb } from './bits.jsx';

export function MiniPlayer() {
    const { current, playing, time, duration, queue } = usePlayer();
    const { articles, sources } = useStore();
    const article = articles.find((a) => a.id === current);
    if (!article) return null;
    const source = sources.find((s) => s.id === article.sourceId);
    const left = duration ? `quedan ${clock(duration - time)}` : article.duration ? `${article.duration} min` : 'Podcast';

    return (
        <div className="mini">
            <button type="button" className="mini-main" onClick={() => player.setOpen(true)} aria-label="Abrir el reproductor">
                {article.image ? <Thumb src={article.image} className="mini-img" /> : <Monogram source={source} size={36} />}
                <span className="mini-text">
                    <strong>{article.title}</strong>
                    <span>
                        {source?.title} · {left}
                        {queue.length > 1 ? ` · ${queue.length - 1} en cola` : ''}
                    </span>
                </span>
            </button>
            <button type="button" className="mini-play" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={player.toggle}>
                <Icon name={playing ? 'pausa' : 'play'} size={18} filled />
            </button>
            <div className="mini-bar">
                <i style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
            </div>
        </div>
    );
}

export function PlayerSheet() {
    const { current, playing, time, duration, queue, rate, open } = usePlayer();
    const { articles, sources } = useStore();
    if (!open) return null;
    const byId = new Map(articles.map((a) => [a.id, a]));
    const article = byId.get(current);
    const titleOf = (id) => sources.find((s) => s.id === byId.get(id)?.sourceId)?.title || '';
    const waiting = queue.filter((id) => id !== current && byId.has(id));

    return (
        <Sheet title="Escuchar" subtitle={article ? titleOf(current) : 'La cola está vacía'} onClose={() => player.setOpen(false)}>
            {article && (
                <div className="card pad">
                    <strong className="now-title">{article.title}</strong>
                    <label htmlFor="posicion-audio" className="sr">
                        Posición
                    </label>
                    <input id="posicion-audio" className="seek" type="range" min="0" max={Math.max(1, Math.floor(duration))} value={Math.floor(time)} onChange={(e) => player.seek(Number(e.target.value))} />
                    <div className="now-times">
                        <span>{clock(time)}</span>
                        <span>{duration ? `-${clock(duration - time)}` : ''}</span>
                    </div>
                    <div className="now-controls">
                        <button type="button" className="round" aria-label="Retroceder 15 segundos" onClick={() => player.skip(-15)}>
                            −15
                        </button>
                        <button type="button" className="now-play" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={player.toggle}>
                            <Icon name={playing ? 'pausa' : 'play'} size={26} filled />
                        </button>
                        <button type="button" className="round" aria-label="Avanzar 30 segundos" onClick={() => player.skip(30)}>
                            +30
                        </button>
                    </div>
                    <div className="field">
                        <span className="field-label">Velocidad</span>
                        <div className="choice" role="group" aria-label="Velocidad">
                            {RATES.map((r) => (
                                <button key={r} type="button" aria-pressed={rate === r} onClick={() => player.setRate(r)}>
                                    {String(r).replace('.', ',')}×
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="block">
                <h3 className="label">A continuación</h3>
                {waiting.length ? (
                    <div className="card list">
                        {waiting.map((id, i) => (
                            <div className="src-row" key={id}>
                                <button type="button" className="src-main" onClick={() => player.play(id)}>
                                    <span className="src-text">
                                        <strong>{byId.get(id).title}</strong>
                                        <span>
                                            {titleOf(id)}
                                            {byId.get(id).duration ? ` · ${byId.get(id).duration} min` : ''}
                                        </span>
                                    </span>
                                </button>
                                {i > 0 && (
                                    <button type="button" className="round" aria-label="Subir en la cola" onClick={() => player.moveUp(id)}>
                                        <Icon name="subir" size={18} />
                                    </button>
                                )}
                                <button type="button" className="round" aria-label="Quitar de la cola" onClick={() => player.remove(id)}>
                                    <Icon name="cerrar" size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="hint">Añade episodios a la cola desde cualquier podcast y sonarán uno tras otro.</p>
                )}
            </div>

            {article && (
                <button type="button" className="btn-ghost" onClick={player.stop}>
                    Parar y vaciar la cola
                </button>
            )}
        </Sheet>
    );
}
