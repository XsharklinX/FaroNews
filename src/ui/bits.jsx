// Piezas pequeñas que se repiten en todas las pantallas.

import { useEffect, useRef, useState } from 'react';
import { initials } from '../core/text.js';
import { localSrc } from '../ports/images.js';
import { savingData } from '../ports/net.js';
import Icon from './Icon.jsx';

// Respaldo cuando aún no se ha buscado el logo del sitio (source.icon). Se pide
// a su propio dominio, no a un servicio de terceros, para no contarle a nadie
// qué sigue el usuario.
function siteIcon(source) {
    try {
        const url = new URL(source.siteUrl);
        return url.protocol === 'https:' ? `${url.origin}/favicon.ico` : '';
    } catch {
        return '';
    }
}

// Logo del sitio; mientras carga, o si no lo hay, sus iniciales.
export function Monogram({ source, size = 40 }) {
    const icon = source?.icon || (source?.siteUrl ? siteIcon(source) : '');
    const [bad, setBad] = useState('');
    const [loaded, setLoaded] = useState('');
    return (
        <span
            className="mono"
            style={{ width: size, height: size, borderRadius: Math.round(size * 0.25), fontSize: Math.round(size * 0.35) }}
        >
            {initials(source?.title)}
            {icon && bad !== icon && (
                <img
                    className={`mono-img${loaded === icon ? ' on' : ''}`}
                    src={icon}
                    alt=""
                    loading="lazy"
                    onError={() => setBad(icon)}
                    // Un icono de 16 px ampliado se ve peor que las iniciales.
                    onLoad={(e) => (e.currentTarget.naturalWidth < 24 ? setBad(icon) : setLoaded(icon))}
                />
            )}
        </span>
    );
}

// Imagen de un artículo. Si no carga, desaparece sin dejar hueco.
export function Thumb({ src, className }) {
    const [failed, setFailed] = useState(null);
    if (!src || failed === src) return null;
    // Si hay copia en el teléfono se usa esa: funciona sin conexión. Si no, con
    // el ahorro de datos y en datos móviles, la foto no se descarga.
    const local = localSrc(src);
    if (!local && savingData()) return null;
    return <img className={className} src={local || src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />;
}

export const LEVELS = [
    { id: 'todo', label: 'Entra todo', short: 'Todo', hint: 'Cada artículo puede entrar en Hoy.' },
    { id: 'importante', label: 'Solo lo importante', short: 'Lo importante', hint: 'Entra lo que coincide con tus temas o lo que cubren varias fuentes. Lo demás, solo si sobra sitio.' },
    { id: 'alertas', label: 'Solo tus temas', short: 'Tus temas', hint: 'El sitio queda en silencio salvo que mencione uno de tus temas.' },
];
const BARS = { todo: 3, importante: 2, alertas: 1 };

// Tres haces: cuantos más encendidos, más deja pasar la fuente.
export function LevelMeter({ level, big = false }) {
    const on = BARS[level] ?? 3;
    return (
        <span className={`meter${big ? ' meter-big' : ''}`} aria-hidden="true">
            <i className={on >= 3 ? 'on' : ''} />
            <i className={on >= 2 ? 'on' : ''} />
            <i className="on" />
        </span>
    );
}

export function LevelPicker({ value, onChange }) {
    return (
        <div className="levels">
            <div className="levels-row" role="group" aria-label="Qué entra en Hoy">
                {LEVELS.map((l) => (
                    <button key={l.id} type="button" className="level" aria-pressed={value === l.id} onClick={() => onChange(l.id)}>
                        <LevelMeter level={l.id} big />
                        <span>{l.short}</span>
                    </button>
                ))}
            </div>
            <p className="hint">{LEVELS.find((l) => l.id === value)?.hint}</p>
        </div>
    );
}

export function Switch({ checked, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
            <span />
        </button>
    );
}

// Varias opciones excluyentes en una fila.
export function Choice({ label, value, options, onChange }) {
    return (
        <div className="choice" role="group" aria-label={label}>
            {options.map((o) => (
                <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Sheet({ title, subtitle, onClose, children }) {
    return (
        <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
                <div className="sheet-handle" />
                <div className="sheet-head">
                    <div>
                        <h1>{title}</h1>
                        {subtitle && <p className="sub">{subtitle}</p>}
                    </div>
                    <button type="button" className="round" aria-label="Cerrar" onClick={onClose}>
                        <Icon name="cerrar" size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// Pulsación larga (o clic derecho). Devuelve los manejadores y un `guard` que
// dice si el clic que sigue debe ignorarse por haber sido una pulsación larga.
export function useLongPress(onLongPress, ms = 480) {
    const timer = useRef(null);
    const fired = useRef(false);
    const start = useRef(null);
    const cancel = () => clearTimeout(timer.current);
    useEffect(() => cancel, []);
    return {
        handlers: {
            onTouchStart: (e) => {
                fired.current = false;
                start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                cancel();
                timer.current = setTimeout(() => {
                    fired.current = true;
                    onLongPress();
                }, ms);
            },
            onTouchMove: (e) => {
                const s = start.current;
                if (s && (Math.abs(e.touches[0].clientX - s.x) > 10 || Math.abs(e.touches[0].clientY - s.y) > 10)) cancel();
            },
            onTouchEnd: cancel,
            onTouchCancel: cancel,
            onContextMenu: (e) => {
                e.preventDefault();
                if (!fired.current) onLongPress();
                fired.current = true;
            },
        },
        guard: () => {
            const was = fired.current;
            fired.current = false;
            return was;
        },
    };
}

// Deslizar a la derecha guarda, a la izquierda descarta.
export function Swipe({ onRight, onLeft, children }) {
    const ref = useRef(null);
    const drag = useRef(null);
    const THRESHOLD = 90;

    const move = (x) => {
        if (ref.current) ref.current.style.transform = x ? `translateX(${x}px)` : '';
    };
    const start = (e) => {
        const t = e.touches[0];
        drag.current = { x: t.clientX, y: t.clientY, dx: 0, axis: null };
        if (ref.current) ref.current.style.transition = 'none';
    };
    const onMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const t = e.touches[0];
        const dx = t.clientX - d.x;
        const dy = t.clientY - d.y;
        if (!d.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (d.axis !== 'x') return;
        d.dx = dx;
        move(dx);
    };
    const end = () => {
        const d = drag.current;
        drag.current = null;
        if (ref.current) ref.current.style.transition = '';
        move(0);
        if (!d || d.axis !== 'x') return;
        if (d.dx > THRESHOLD) onRight?.();
        else if (d.dx < -THRESHOLD) onLeft?.();
    };

    return (
        <div className="swipe">
            <span className="swipe-hint left">Guardar</span>
            <span className="swipe-hint right">Descartar</span>
            <div className="swipe-body" ref={ref} onTouchStart={start} onTouchMove={onMove} onTouchEnd={end} onTouchCancel={end}>
                {children}
            </div>
        </div>
    );
}

// Tirar hacia abajo desde el principio de la lista para actualizar.
export function PullToRefresh({ onRefresh, busy, className, children }) {
    const box = useRef(null);
    const pull = useRef(null);
    const [dist, setDist] = useState(0);
    const TRIGGER = 72;

    const start = (e) => {
        pull.current = box.current.scrollTop <= 0 ? { y: e.touches[0].clientY, x: e.touches[0].clientX, d: 0 } : null;
    };
    const onMove = (e) => {
        const p = pull.current;
        if (!p) return;
        const dy = e.touches[0].clientY - p.y;
        const dx = Math.abs(e.touches[0].clientX - p.x);
        if (dy <= 0 || dx > dy || box.current.scrollTop > 0) {
            p.d = 0;
            setDist(0);
            return;
        }
        p.d = Math.min(110, dy * 0.5);
        setDist(p.d);
    };
    const end = () => {
        const p = pull.current;
        pull.current = null;
        setDist(0);
        if (p && p.d >= TRIGGER) onRefresh();
    };

    const shown = busy ? 56 : dist;
    return (
        <div className={className} ref={box} onTouchStart={start} onTouchMove={onMove} onTouchEnd={end} onTouchCancel={end}>
            <div className={`ptr${busy ? ' busy' : ''}${dist >= TRIGGER ? ' ready' : ''}`} style={{ height: shown, opacity: Math.min(1, shown / 50) }} aria-hidden={!busy}>
                <span className="ptr-lamp" style={{ transform: `rotate(${dist * 3}deg)` }} />
                <span>{busy ? 'Buscando novedades…' : dist >= TRIGGER ? 'Suelta para actualizar' : 'Tira para actualizar'}</span>
            </div>
            {children}
        </div>
    );
}

export function Toast({ toast, onUndo }) {
    if (!toast) return null;
    return (
        <div className="toast" role="status" key={toast.id}>
            <span>{toast.text}</span>
            {toast.undo && (
                <button type="button" onClick={onUndo}>
                    Deshacer
                </button>
            )}
        </div>
    );
}

export function Logo({ size = 22, tower = 'currentColor', beam = 'var(--lamp)' }) {
    return (
        <svg width={size} height={size} viewBox="150 110 230 290" aria-hidden="true">
            <g strokeWidth="10" strokeLinejoin="round">
                <path d="M184 136h44l8 248h-60z" fill={tower} stroke={tower} />
                <path d="M262 142l110-22v76l-110-22z" fill={beam} stroke={beam} />
                <path d="M262 234l70-14v60l-70-14z" fill={beam} stroke={beam} />
            </g>
        </svg>
    );
}
