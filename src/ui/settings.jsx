// Piezas de las pantallas de opciones: filas que se despliegan, selector de
// tema con miniaturas, editor de palabras y la línea de las 24 horas.

import { useState } from 'react';
import Icon from './Icon.jsx';

// Fila con icono, título y valor. Si lleva hijos se despliega al tocarla; si
// lleva `onClick`, navega.
export function Row({ icon, title, value, onClick, children, danger = false, disabled = false }) {
    const [open, setOpen] = useState(false);
    const folds = Boolean(children);
    return (
        <div className={`set-row${open ? ' open' : ''}`}>
            <button type="button" className="set-main" aria-expanded={folds ? open : undefined} disabled={disabled} onClick={folds ? () => setOpen(!open) : onClick}>
                <span className={`set-icon${danger ? ' warn' : ''}`}>
                    <Icon name={icon} size={19} strokeWidth={1.8} />
                </span>
                <span className="set-title">{title}</span>
                {value && <span className="set-value">{value}</span>}
                <span className="set-chev">
                    <Icon name="siguiente" size={16} />
                </span>
            </button>
            {folds && open && <div className="set-body">{children}</div>}
        </div>
    );
}

export function Group({ title, children }) {
    return (
        <section className="set-group">
            {title && <h3 className="set-label">{title}</h3>}
            <div className="set-list">{children}</div>
        </section>
    );
}

const THEMES = [
    { id: 'auto', label: 'Automático' },
    { id: 'light', label: 'Claro' },
    { id: 'dark', label: 'Oscuro' },
];

// Tres miniaturas de la app: se ve lo que se elige antes de elegirlo.
export function ThemePicker({ value, onChange }) {
    return (
        <div className="themes" role="group" aria-label="Tema de la app">
            {THEMES.map((t) => (
                <button key={t.id} type="button" className="theme" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
                    <span className={`theme-art ${t.id}`} aria-hidden="true">
                        <i />
                        <i />
                        <i />
                    </span>
                    {t.label}
                </button>
            ))}
        </div>
    );
}

// Lista de palabras como etiquetas: se añaden con Intro o coma y se quitan tocándolas.
export function TagEditor({ id, values, onChange, placeholder }) {
    const [draft, setDraft] = useState('');
    const add = (text = draft) => {
        const fresh = text
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s && !values.some((v) => v.toLowerCase() === s.toLowerCase()));
        setDraft('');
        if (fresh.length) onChange([...values, ...fresh]);
    };
    return (
        <div className="tags">
            {values.map((word) => (
                <button key={word} type="button" className="tag-chip" aria-label={`Quitar ${word}`} onClick={() => onChange(values.filter((v) => v !== word))}>
                    {word}
                    <Icon name="cerrar" size={13} strokeWidth={2.2} />
                </button>
            ))}
            <input
                id={id}
                type="text"
                enterKeyHint="done"
                value={draft}
                placeholder={placeholder}
                onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                onBlur={() => add()}
            />
        </div>
    );
}

const minutesOf = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

// Las 24 horas del día con el tramo de silencio sombreado y la hora actual.
export function DayLine({ from, to, on }) {
    const a = minutesOf(from);
    const b = minutesOf(to);
    const spans = !on || a === b ? [] : a < b ? [[a, b]] : [[a, 1440], [0, b]];
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const pct = (min) => `${(min / 1440) * 100}%`;
    return (
        <div className="dayline" role="img" aria-label={on ? `En silencio de ${from} a ${to}` : 'Sin horas de silencio'}>
            <div className="dayline-bar">
                {spans.map(([s, e]) => (
                    <i key={s} style={{ left: pct(s), width: pct(e - s) }} />
                ))}
                <b style={{ left: pct(now) }} />
            </div>
            <div className="dayline-ticks">
                {['0', '6', '12', '18', '24'].map((h) => (
                    <span key={h}>{h}</span>
                ))}
            </div>
        </div>
    );
}
