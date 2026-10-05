import { useState } from 'react';
import { canWatch, DEFAULT_NOTIFY } from '../core/notify.js';
import { actions, isFailing, useStore } from '../data/store.js';
import { askPermission } from '../ports/background.js';
import { LevelPicker, Sheet, Switch } from '../ui/bits.jsx';

export default function FuenteSheet({ id, onClose, onNotify }) {
    const { sources, settings } = useStore();
    const notifyOn = { ...DEFAULT_NOTIFY, ...settings.notify }.on;
    const source = sources.find((s) => s.id === id);
    const [folder, setFolder] = useState(source?.folder || '');
    const [confirming, setConfirming] = useState(false);

    if (!source) return null;
    const update = (patch) => actions.updateSource(id, patch);

    return (
        <Sheet title={source.title} subtitle={source.feedUrl} onClose={onClose}>
            {isFailing(source) && (
                <p className="error" role="alert">
                    Faro lleva {source.failCount} intentos sin poder leer este sitio. Último error: {source.lastError || 'desconocido'}.
                </p>
            )}

            <div className="block">
                <h3 className="label">Qué entra en Hoy</h3>
                <LevelPicker value={source.level} onChange={(level) => update({ level })} />
            </div>

            <div className="card list">
                <div className="opt">
                    <label htmlFor="carpeta-fuente">Carpeta</label>
                    <input id="carpeta-fuente" type="text" placeholder="Sin carpeta" value={folder} onChange={(e) => setFolder(e.target.value)} onBlur={() => update({ folder: folder.trim() })} />
                </div>
                {canWatch(source) && (
                    <div className="opt opt-tall">
                        <span>
                            Avisarme de lo que publique
                            <small>Una notificación por noticia, o una sola si salen varias seguidas.</small>
                        </span>
                        <Switch
                            checked={notifyOn && Boolean(source.notify)}
                            label="Avisarme de lo que publique"
                            onChange={async (on) => {
                                // Encender el primer aviso pide el permiso de Android.
                                if (on && !notifyOn) {
                                    if (!(await askPermission())) {
                                        onClose();
                                        onNotify();
                                        return;
                                    }
                                    actions.setNotify({ on: true });
                                }
                                update({ notify: on });
                            }}
                        />
                    </div>
                )}
                <div className="opt">
                    <span>Fuente prioritaria</span>
                    <Switch checked={Boolean(source.priority)} onChange={(priority) => update({ priority })} label="Fuente prioritaria" />
                </div>
                <div className="opt">
                    <span>Guardar para leer sin conexión</span>
                    <Switch checked={Boolean(source.offline)} onChange={(offline) => update({ offline })} label="Guardar para leer sin conexión" />
                </div>
            </div>

            {confirming ? (
                <div className="confirm">
                    <p>Se borrarán también sus artículos, incluidos los guardados.</p>
                    <div className="confirm-row">
                        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="btn-warn solid"
                            onClick={() => {
                                actions.removeSource(id);
                                onClose();
                            }}
                        >
                            Dejar de seguir
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
                    Dejar de seguir este sitio
                </button>
            )}
        </Sheet>
    );
}
