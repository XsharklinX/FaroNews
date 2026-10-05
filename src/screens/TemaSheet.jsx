import { useState } from 'react';
import { actions } from '../data/store.js';
import { Sheet, Switch } from '../ui/bits.jsx';
import { TagEditor } from '../ui/settings.jsx';

// Crear o editar un tema. `topic` sin id es uno nuevo.
export default function TemaSheet({ topic, onClose }) {
    const isNew = !topic.id;
    const [name, setName] = useState(topic.name || '');
    const [words, setWords] = useState(topic.words || []);
    const [notify, setNotify] = useState(topic.notify !== false);

    const save = () => {
        actions.saveTopic({ ...topic, name, words: words.length ? words : [name.trim()], notify });
        onClose();
    };

    return (
        <Sheet title={isNew ? 'Nuevo tema' : 'Editar tema'} subtitle="Faro lo busca en todas tus fuentes a la vez." onClose={onClose}>
            <div className="card pad">
                <div className="field">
                    <label htmlFor="tema-nombre">Nombre</label>
                    <input id="tema-nombre" type="text" placeholder="Elecciones, Godot, tipos de interés…" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                    <label htmlFor="tema-palabras">Palabras que lo delatan</label>
                    <TagEditor id="tema-palabras" values={words} onChange={setWords} placeholder="Añadir una palabra" />
                    <p className="hint">Si un titular o resumen contiene alguna, el artículo es de este tema. Vacío: se usa el nombre.</p>
                </div>
            </div>

            <div className="card list">
                <div className="opt opt-tall">
                    <span>
                        Avisarme
                        <small>Con los avisos activados, llega una notificación cuando aparece algo nuevo.</small>
                    </span>
                    <Switch checked={notify} onChange={setNotify} label="Avisarme de este tema" />
                </div>
            </div>

            <button type="button" className="btn-lamp btn-big" onClick={save} disabled={!name.trim()}>
                {isNew ? 'Seguir este tema' : 'Guardar cambios'}
            </button>
            {!isNew && (
                <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                        actions.removeTopic(topic.id);
                        onClose();
                    }}
                >
                    Dejar de seguir este tema
                </button>
            )}
        </Sheet>
    );
}
