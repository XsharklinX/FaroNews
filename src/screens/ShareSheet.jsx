// Lo que llega desde «Compartir → Faro» de otra app: una dirección. El usuario
// decide si guarda ese artículo o sigue el sitio entero.

import { useState } from 'react';
import { actions } from '../data/store.js';
import { Sheet } from '../ui/bits.jsx';

// Lo compartido suele ser «Título https://…»: se toma la primera dirección.
export function firstUrl(text) {
    const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
    return m ? m[0].replace(/[).,;]+$/, '') : '';
}

export default function ShareSheet({ url, onClose, onFollow, onOpen }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const save = async () => {
        setBusy(true);
        setError('');
        try {
            const id = await actions.saveLoose(url);
            onClose();
            onOpen(id);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <Sheet title="Compartido con Faro" subtitle={url} onClose={onClose}>
            <button type="button" className="btn-lamp btn-big" onClick={save} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar este artículo'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => onFollow(url)} disabled={busy}>
                Seguir este sitio
            </button>
            <p className="hint">Guardar deja el artículo en Guardado, con su texto, para leerlo cuando quieras. Seguir el sitio trae también lo que publique a partir de ahora.</p>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
        </Sheet>
    );
}
