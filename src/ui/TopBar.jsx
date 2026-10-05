// Cabecera de las cuatro pestañas: fecha o nota arriba, título en serif y, a
// la derecha, la campana de avisos y los ajustes.

import { createContext, useContext } from 'react';
import { useStore } from '../data/store.js';
import Icon from './Icon.jsx';

// La app dice aquí qué abren la campana y los ajustes.
export const Chrome = createContext({ onInbox: () => {}, onSettings: () => {} });

export function TopIcons() {
    const { onInbox, onSettings } = useContext(Chrome);
    const { inbox, settings } = useStore();
    const unseen = inbox.some((entry) => entry.at > (settings.inboxSeenAt || 0));
    return (
        <div className="top-icons">
            <button type="button" className="icon-btn" aria-label={unseen ? 'Avisos: hay nuevos' : 'Avisos'} onClick={onInbox}>
                <Icon name="campana" size={22} strokeWidth={1.8} />
                {unseen && <span className="bell-dot" />}
            </button>
            <button type="button" className="icon-btn" aria-label="Ajustes" onClick={onSettings}>
                <Icon name="ajustes" size={22} strokeWidth={1.8} />
            </button>
        </div>
    );
}

export default function TopBar({ title, note }) {
    return (
        <header className="top">
            <div>
                {note && <p className="top-date">{note}</p>}
                <h1 className="top-title">{title}</h1>
            </div>
            <TopIcons />
        </header>
    );
}
