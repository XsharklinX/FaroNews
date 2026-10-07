// Páginas vigiladas y reglas automáticas: dos herramientas para quien quiere
// que Faro trabaje por su cuenta.

import { useMemo, useState } from 'react';
import { RULE_ACTIONS, ruleMatches } from '../core/extras2.js';
import { agoLabel } from '../core/text.js';
import { actions, useStore } from '../data/store.js';
import { openExternal } from '../ports/share.js';
import Icon from '../ui/Icon.jsx';
import { Monogram, Sheet, Switch } from '../ui/bits.jsx';

// --- Páginas vigiladas -------------------------------------------------------

export function WatchSheet({ onClose }) {
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const add = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const address = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
            await actions.addWatch(address);
            onClose();
        } catch (err) {
            setError(String(err?.message || '').startsWith('Esa página') ? err.message : 'No se pudo abrir esa dirección. Revisa que esté bien escrita.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Sheet title="Vigilar una página" subtitle="Faro la revisa y te avisa cuando cambie su texto." onClose={onClose}>
            <form className="url-row" onSubmit={add}>
                <label htmlFor="url-vigilar" className="sr">
                    Dirección de la página
                </label>
                <input id="url-vigilar" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="Una convocatoria, un precio, unos resultados…" value={url} onChange={(e) => setUrl(e.target.value)} />
                <button type="submit" className="btn-go" disabled={busy || url.trim().length < 4}>
                    {busy ? '…' : 'Vigilar'}
                </button>
            </form>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            <p className="hint">Sirve para páginas que no son noticias. Faro guarda su texto y, al revisarla, te enseña qué líneas aparecieron y cuáles se fueron. Algunas páginas cambian solas (la hora, un contador) y avisarán de más.</p>
        </Sheet>
    );
}

// La lista, dentro de Fuentes.
export function Paginas({ onAdd }) {
    const { settings } = useStore();
    const watches = settings.watches || [];
    const [open, setOpen] = useState('');
    if (!watches.length) {
        return (
            <>
                <p className="empty-note">Vigila páginas que no son noticias: una convocatoria, el precio de algo, una lista de resultados. Faro te avisa cuando cambian.</p>
                <button type="button" className="btn-ghost more" onClick={onAdd}>
                    Vigilar una página
                </button>
            </>
        );
    }
    return (
        <>
            <div className="rows">
                {watches.map((w) => {
                    const fresh = w.changedAt && !w.seen;
                    return (
                        <div className={`watch${fresh ? ' fresh' : ''}`} key={w.id}>
                            <button
                                type="button"
                                className="watch-main"
                                aria-expanded={open === w.id}
                                onClick={() => {
                                    setOpen(open === w.id ? '' : w.id);
                                    if (fresh) actions.seeWatch(w.id);
                                }}
                            >
                                <span className="src-text">
                                    <strong>{w.title}</strong>
                                    <span className={w.error ? 'warn' : ''}>
                                        {w.error ? `No se pudo revisar: ${w.error}` : w.changedAt ? `Cambió ${agoLabel(w.changedAt)}` : 'Sin cambios'}
                                        {w.checkedAt ? ` · revisada ${agoLabel(w.checkedAt)}` : ''}
                                    </span>
                                </span>
                                {fresh && <span className="dot" aria-label="Cambio sin ver" />}
                            </button>
                            {open === w.id && (
                                <div className="watch-body">
                                    {w.diff && (w.diff.added.length || w.diff.removed.length) ? (
                                        <div className="diff">
                                            {w.diff.added.map((l, i) => (
                                                <p key={`a${i}`} className="add">
                                                    + {l}
                                                </p>
                                            ))}
                                            {w.diff.removed.map((l, i) => (
                                                <p key={`r${i}`} className="del">
                                                    − {l}
                                                </p>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="hint">Todavía no ha cambiado desde que la vigilas.</p>
                                    )}
                                    <div className="set-actions">
                                        <button type="button" className="btn-ghost small" onClick={() => openExternal(w.url)}>
                                            Abrir la página
                                        </button>
                                        <button type="button" className="btn-ghost small" onClick={() => actions.removeWatch(w.id)}>
                                            Dejar de vigilar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="hint pad-x">Se revisan al actualizar y, con los avisos activados, también con Faro cerrado.</p>
        </>
    );
}

// --- Reglas automáticas ------------------------------------------------------

const KINDS = [
    { id: '', label: 'Cualquiera' },
    { id: 'leer', label: 'Artículos' },
    { id: 'ver', label: 'Vídeos' },
    { id: 'escuchar', label: 'Podcasts' },
];

function describe(rule, sources) {
    const parts = [];
    if (rule.sourceId) parts.push(`de ${sources.find((s) => s.id === rule.sourceId)?.title || 'un sitio que ya no sigues'}`);
    if (rule.word) parts.push(`que diga «${rule.word}»`);
    if (rule.kind) parts.push(KINDS.find((k) => k.id === rule.kind)?.label.toLowerCase());
    const action = RULE_ACTIONS.find((a) => a.id === rule.action)?.label || '';
    return `${action}${rule.action === 'etiquetar' && rule.tag ? ` #${rule.tag}` : ''} lo ${parts.join(', ')}`;
}

function RuleSheet({ rule, onClose }) {
    const { sources, articles } = useStore();
    const [draft, setDraft] = useState({ sourceId: '', word: '', kind: '', action: 'guardar', tag: '', ...rule });
    const set = (patch) => setDraft({ ...draft, ...patch });
    const week = Date.now() - 7 * 86400000;
    const hits = useMemo(() => articles.filter((a) => (a.publishedAt || a.fetchedAt) >= week && ruleMatches(draft, a)).length, [articles, draft]);
    const valid = (draft.sourceId || draft.word.trim() || draft.kind) && (draft.action !== 'etiquetar' || draft.tag.trim());
    const sorted = [...sources].sort((a, b) => a.title.localeCompare(b.title, 'es'));

    return (
        <Sheet title={rule.id ? 'Editar regla' : 'Nueva regla'} subtitle="Se aplica a lo que llegue a partir de ahora." onClose={onClose}>
            <div className="rule-step">Cuando llegue algo…</div>
            <div className="field">
                <label htmlFor="regla-sitio">De este sitio</label>
                <select id="regla-sitio" className="select" value={draft.sourceId} onChange={(e) => set({ sourceId: e.target.value })}>
                    <option value="">De cualquier sitio</option>
                    {sorted.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.title}
                        </option>
                    ))}
                </select>
            </div>
            <div className="field">
                <label htmlFor="regla-palabra">Que diga</label>
                <input id="regla-palabra" type="text" placeholder="análisis, entrevista… (varias, separadas por comas)" value={draft.word} onChange={(e) => set({ word: e.target.value })} />
            </div>
            <div className="field">
                <span className="field-label">Que sea</span>
                <div className="choice" role="group" aria-label="Tipo">
                    {KINDS.map((k) => (
                        <button key={k.id} type="button" aria-pressed={draft.kind === k.id} onClick={() => set({ kind: k.id })}>
                            {k.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="rule-step">…entonces</div>
            <div className="pause-list" role="group" aria-label="Qué hacer">
                {RULE_ACTIONS.map((a) => (
                    <button key={a.id} type="button" aria-pressed={draft.action === a.id} onClick={() => set({ action: a.id })}>
                        <span>{a.label}</span>
                    </button>
                ))}
            </div>
            {draft.action === 'etiquetar' && (
                <div className="field">
                    <label htmlFor="regla-etiqueta">Etiqueta</label>
                    <input id="regla-etiqueta" type="text" placeholder="juegos, para leer…" value={draft.tag} onChange={(e) => set({ tag: e.target.value.replace(/^#/, '') })} />
                </div>
            )}
            <p className="hint">{valid ? (hits ? `La última semana habría encontrado ${hits} ${hits === 1 ? 'artículo' : 'artículos'}.` : 'La última semana no habría encontrado nada.') : 'Elige al menos un sitio, una palabra o un tipo.'}</p>
            <button
                type="button"
                className="btn-lamp btn-big"
                disabled={!valid}
                onClick={() => {
                    const saved = actions.saveRule({ ...draft, word: draft.word.trim(), tag: draft.tag.trim() });
                    onClose();
                    // También vale para lo que ya está en Faro.
                    const done = actions.applyRuleNow(saved);
                    actions.toast(done ? `Regla guardada · aplicada a ${done} ${done === 1 ? 'artículo' : 'artículos'}` : 'Regla guardada');
                }}
            >
                {rule.id ? 'Guardar cambios' : 'Crear regla'}
            </button>
            {rule.id && (
                <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                        actions.removeRule(rule.id);
                        onClose();
                    }}
                >
                    Borrar la regla
                </button>
            )}
        </Sheet>
    );
}

export function Reglas({ onClose }) {
    const { settings, sources } = useStore();
    const rules = settings.rules || [];
    const [editing, setEditing] = useState(null);
    return (
        <div className="overlay">
            <div className="screen">
                <header className="cat-head">
                    <button type="button" className="round round-surface" aria-label="Volver" onClick={onClose}>
                        <Icon name="atras" size={22} strokeWidth={2} />
                    </button>
                    <div>
                        <h1 className="title-l">Reglas</h1>
                        <p className="sub">Faro hace por ti lo que harías a mano con cada noticia que llega.</p>
                    </div>
                </header>
                {rules.length > 0 ? (
                    <div className="set-list">
                        {rules.map((r) => (
                            <div className="site-line" key={r.id}>
                                {r.sourceId ? <Monogram source={sources.find((s) => s.id === r.sourceId)} size={30} /> : <span className="topic-mark">⚙</span>}
                                <button type="button" className="rule-text" onClick={() => setEditing(r)}>
                                    {describe(r, sources)}
                                </button>
                                <Switch checked={!r.off} onChange={(on) => actions.saveRule({ ...r, off: !on })} label="Regla activa" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="empty-note">Por ejemplo: guarda con la etiqueta #juegos los análisis de 3DJuegos, o descarta lo que diga «horóscopo» venga de donde venga.</p>
                )}
                <button type="button" className="btn-lamp btn-big" onClick={() => setEditing({})}>
                    Nueva regla
                </button>
            </div>
            {editing && <RuleSheet rule={editing} onClose={() => setEditing(null)} />}
        </div>
    );
}
