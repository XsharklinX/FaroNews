import { useEffect, useMemo, useState } from 'react';
import { actions, BUSY_PER_WEEK, useStore } from '../data/store.js';
import Icon from '../ui/Icon.jsx';
import { LevelPicker, Monogram, Sheet, Switch } from '../ui/bits.jsx';
import { colorFor, relTime } from '../core/text.js';

const ERRORS = {
    EMPTY: 'Escribe o pega la dirección de un sitio.',
    UNREACHABLE: 'No se pudo abrir esa dirección. Revisa que esté bien escrita y que tengas conexión.',
    YOUTUBE_BUSY: 'Faro encontró el canal, pero YouTube no está entregando su lista de vídeos ahora mismo. Suele durar poco: prueba otra vez en unos minutos.',
    NO_FEED: 'Faro no encontró ni un feed ni titulares en esa página. Prueba con la dirección de su portada o de su sección de noticias.',
};

export default function AnadirSheet({ onClose, initialUrl = '' }) {
    const { sources } = useStore();
    const [url, setUrl] = useState(initialUrl);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [found, setFound] = useState(null);
    const [level, setLevel] = useState('todo');
    const [folder, setFolder] = useState('');
    const [offline, setOffline] = useState(true);

    const folders = useMemo(() => [...new Set(sources.map((s) => s.folder).filter(Boolean))].sort(), [sources]);

    const search = async (value) => {
        document.activeElement?.blur(); // Esconde el teclado para ver el resultado.
        setBusy(true);
        setError('');
        setFound(null);
        try {
            const preview = await actions.previewSite(value);
            setFound(preview);
            // Un sitio que publica muchísimo empieza en «lo importante».
            setLevel((preview.perWeek || 0) >= BUSY_PER_WEEK ? 'importante' : 'todo');
        } catch (err) {
            setError(ERRORS[err?.message] || ERRORS.UNREACHABLE);
        } finally {
            setBusy(false);
        }
    };

    // Con la dirección ya dada (compartida desde otra app) se busca sin esperar.
    useEffect(() => {
        if (initialUrl) search(initialUrl);
    }, []);

    const paste = async () => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) {
                setUrl(text);
                search(text);
            }
        } catch {
            setError('No se pudo leer el portapapeles. Pega la dirección en el campo.');
        }
    };

    const follow = () => {
        actions.addSource(found, { folder, level, offline });
        onClose();
    };

    return (
        <Sheet title="Añadir sitio" subtitle="Pega la dirección. Faro busca cómo seguirlo." onClose={onClose}>
            <form
                className="url-row"
                onSubmit={(e) => {
                    e.preventDefault();
                    search(url);
                }}
            >
                <label htmlFor="url-sitio" className="sr">
                    Dirección del sitio
                </label>
                <input id="url-sitio" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="Un sitio, canal de YouTube, perfil o podcast" value={url} onChange={(e) => setUrl(e.target.value)} />
                {url.trim() ? (
                    <button type="submit" className="btn-go" disabled={busy}>
                        {busy ? 'Buscando…' : 'Buscar'}
                    </button>
                ) : (
                    <button type="button" className="btn-go quiet" onClick={paste}>
                        Pegar
                    </button>
                )}
            </form>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {found && (
                <>
                    <div className="card pad found">
                        <div className="found-head">
                            <Monogram source={{ title: found.title, color: colorFor(found.feedUrl), icon: found.icon }} size={44} />
                            <div className="src-text">
                                <strong>{found.title}</strong>
                                <span>{found.perWeek ? `Unos ${found.perWeek} artículos por semana` : `${found.items.length} artículos disponibles`}</span>
                            </div>
                            <span className="pill-ok">
                                <Icon name="ok" size={14} strokeWidth={3} />
                                {found.kind === 'page' ? 'Titulares encontrados' : 'Feed encontrado'}
                            </span>
                        </div>
                        {found.items.length > 0 && (
                            <ul className="found-list">
                                {found.items.slice(0, 3).map((item) => (
                                    <li key={item.url}>
                                        <span>{item.title}</span>
                                        {item.publishedAt && <small>hace {relTime(item.publishedAt)}</small>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {found.kind === 'page' && !found.duplicate && (
                        <p className="hint">Este sitio no publica un feed, así que Faro leerá los titulares de su portada cada vez que actualice. Funciona, pero sin fechas y puede colarse algún enlace que no sea noticia.</p>
                    )}

                    {found.duplicate ? (
                        <p className="error" role="alert">
                            Ya sigues este sitio.
                        </p>
                    ) : (
                        <>
                            <div className="block">
                                <h3 className="label">Qué entra en Hoy</h3>
                                <LevelPicker value={level} onChange={setLevel} />
                                {(found.perWeek || 0) >= BUSY_PER_WEEK && <p className="hint">Este sitio publica mucho, así que Faro propone «Solo lo importante». Puedes cambiarlo.</p>}
                            </div>

                            <div className="card list">
                                <div className="opt opt-folder">
                                    <label htmlFor="carpeta">Carpeta</label>
                                    <input id="carpeta" type="text" placeholder="Sin carpeta" value={folder} onChange={(e) => setFolder(e.target.value)} />
                                    {folders.length > 0 && (
                                        <div className="chips">
                                            {folders.map((f) => (
                                                <button key={f} type="button" className="chip-btn" aria-pressed={folder === f} onClick={() => setFolder(folder === f ? '' : f)}>
                                                    {f}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="opt">
                                    <span>Guardar para leer sin conexión</span>
                                    <Switch checked={offline} onChange={setOffline} label="Guardar para leer sin conexión" />
                                </div>
                            </div>

                            <button type="button" className="btn-lamp btn-big" onClick={follow}>
                                Seguir este sitio
                            </button>
                        </>
                    )}
                </>
            )}
        </Sheet>
    );
}
