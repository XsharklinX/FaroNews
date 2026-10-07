// Ficha de un sitio: cuánto entra en Hoy, su carpeta y cómo se comporta.

import { useMemo, useState } from 'react';
import { canWatch, DEFAULT_NOTIFY } from '../core/notify.js';
import { isPaused, pauseLabel } from '../core/pause.js';
import { agoLabel } from '../core/text.js';
import { actions, isFailing, useStore } from '../data/store.js';
import { askPermission } from '../ports/background.js';
import { openExternal } from '../ports/share.js';
import { LevelPicker, Monogram, Sheet } from '../ui/bits.jsx';
import { Group, Row, SwitchRow } from '../ui/settings.jsx';

const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};

export default function FuenteSheet({ id, onClose, onNotify }) {
    const { sources, settings } = useStore();
    const notifyOn = { ...DEFAULT_NOTIFY, ...settings.notify }.on;
    const source = sources.find((s) => s.id === id);
    const [draft, setDraft] = useState('');
    const [confirming, setConfirming] = useState(false);
    const folders = useMemo(() => [...new Set(sources.map((s) => s.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [sources]);

    if (!source) return null;
    const update = (patch) => actions.updateSource(id, patch);
    const addFolder = () => {
        if (draft.trim()) update({ folder: draft.trim() });
        setDraft('');
    };

    return (
        <Sheet title={source.title} onClose={onClose}>
            <div className="peek-head">
                <Monogram source={source} size={48} />
                <div className="src-text">
                    <strong>{hostOf(source.siteUrl || source.feedUrl)}</strong>
                    <span>{[source.kind === 'page' ? 'Sin feed: se leen sus titulares' : source.perWeek ? (source.perWeek >= 7 ? `Unas ${Math.round(source.perWeek / 7)} al día` : `Unas ${source.perWeek} por semana`) : '', source.lastOkAt ? `actualizado ${agoLabel(source.lastOkAt)}` : ''].filter(Boolean).join(' · ')}</span>
                </div>
            </div>

            {isFailing(source) && (
                <p className="error" role="alert">
                    Faro lleva {source.failCount} intentos sin poder leer este sitio. Último error: {source.lastError || 'desconocido'}.
                </p>
            )}

            <section className="set-group">
                <h3 className="set-label">Qué entra en Hoy</h3>
                <LevelPicker value={source.level} onChange={(level) => update({ level })} />
            </section>

            <section className="set-group">
                <h3 className="set-label">Carpeta</h3>
                <div className="chips">
                    {folders.map((f) => (
                        <button key={f} type="button" className="chip-btn" aria-pressed={source.folder === f} onClick={() => update({ folder: source.folder === f ? '' : f })}>
                            {f}
                        </button>
                    ))}
                    <label htmlFor="carpeta-fuente" className="sr">
                        Carpeta nueva
                    </label>
                    <input
                        id="carpeta-fuente"
                        className="chip-input"
                        type="text"
                        enterKeyHint="done"
                        placeholder="+ Nueva"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                        onBlur={addFolder}
                    />
                </div>
            </section>

            <Group>
                {canWatch(source) && (
                    <SwitchRow
                        icon="campana"
                        title="Avisarme de lo que publique"
                        hint="Un aviso por noticia, o uno solo si salen varias seguidas."
                        checked={notifyOn && Boolean(source.notify)}
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
                )}
                <SwitchRow icon="destello" title="Fuente prioritaria" hint="Sus historias suben en Hoy." checked={Boolean(source.priority)} onChange={(priority) => update({ priority })} />
                <SwitchRow icon="descarga" title="Leer sin conexión" hint="Guarda texto y fotos de lo que entra en Hoy." checked={Boolean(source.offline)} onChange={(offline) => update({ offline })} />
            </Group>

            <Group>
                {isPaused(source.pausedUntil) ? (
                    <Row icon="play" title="Reanudar" value={`en pausa ${pauseLabel(source.pausedUntil)}`} onClick={() => actions.pause({ kind: 'source', key: id, label: source.title }, 0)} />
                ) : (
                    <Row
                        icon="pausa"
                        title="Pausar un tiempo"
                        value="sin Hoy ni avisos"
                        onClick={() => {
                            onClose();
                            actions.openPause({ kind: 'source', key: id, label: source.title });
                        }}
                    />
                )}
                <Row icon="actualizar" title="Actualizar ahora" onClick={() => actions.refreshSource(id)} />
                {source.siteUrl && <Row icon="abrir" title="Abrir el sitio" value={hostOf(source.siteUrl)} onClick={() => openExternal(source.siteUrl)} />}
                {!confirming && <Row icon="cerrar" title="Dejar de seguir" danger onClick={() => setConfirming(true)} />}
            </Group>

            {confirming && (
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
            )}
        </Sheet>
    );
}
