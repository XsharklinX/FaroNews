import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { actions, useStore } from './data/store.js';
import { askPermission, canNotify, onNotificationOpen, onShared, onShortcut, setBars } from './ports/background.js';
import Ajustes from './screens/Ajustes.jsx';
import AnadirSheet from './screens/AnadirSheet.jsx';
import Avisos from './screens/Avisos.jsx';
import Biblioteca from './screens/Biblioteca.jsx';
import Catalogo, { catalogBack } from './screens/Catalogo.jsx';
import { Bandeja, Estadisticas, Gestos, Semana } from './screens/Extras.jsx';
import Fuentes from './screens/Fuentes.jsx';
import FuenteSheet from './screens/FuenteSheet.jsx';
import { FeedbackSheet, PauseSheet, TagsSheet } from './screens/Hojas.jsx';
import Hoy from './screens/Hoy.jsx';
import Lector from './screens/Lector.jsx';
import Lista from './screens/Lista.jsx';
import Onboarding from './screens/Onboarding.jsx';
import ShareSheet, { firstUrl } from './screens/ShareSheet.jsx';
import { CoverageSheet, StoryMenu } from './screens/StoryMenu.jsx';
import TemaSheet from './screens/TemaSheet.jsx';
import { Reglas, WatchSheet } from './screens/Vigilar.jsx';
import Icon from './ui/Icon.jsx';
import { MiniPlayer, PlayerSheet } from './ui/Player.jsx';
import { Chrome } from './ui/TopBar.jsx';
import { setLook } from './ui/look.js';
import { PullToRefresh, Sheet, Toast } from './ui/bits.jsx';
import { player, usePlayer } from './data/player.js';

const TABS = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'explorar', label: 'Explorar' },
    { id: 'biblioteca', label: 'Biblioteca' },
    { id: 'fuentes', label: 'Fuentes' },
];

export default function App() {
    const { ready, sources, settings, refreshing, toast, menu, compare, shared, pendingOpen, today, tagging, pausing } = useStore();
    const playing = usePlayer();
    const [tab, setTab] = useState('hoy');
    const [reader, setReader] = useState(null);
    // false, true o { url } cuando la dirección ya viene dada.
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null);
    const [catalog, setCatalog] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [topicEdit, setTopicEdit] = useState(null);
    const [topicView, setTopicView] = useState(null);
    const [siteView, setSiteView] = useState(null);
    const [inboxOpen, setInboxOpen] = useState(false);
    const [statsOpen, setStatsOpen] = useState(false);
    const [weekOpen, setWeekOpen] = useState(false);
    const [watchAdd, setWatchAdd] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(false);
    // Hoja del botón «Añadir» de Fuentes: catálogo, dirección o tema.
    const [addMenu, setAddMenu] = useState(false);
    // 'comentario' o 'sitio': lo que el usuario escribe a quien publica Faro.
    const [feedback, setFeedback] = useState(null);
    // Sube cuando hay que poner el cursor en el buscador de Explorar.
    const [searchFocus, setSearchFocus] = useState(0);
    const chrome = useRef({ onInbox: () => setInboxOpen(true), onSettings: () => setSettingsOpen(true) }).current;

    // Titulares cebo, traducción, espóileres y ritmo de lectura: se aplican al pintar.
    setLook(settings);

    // Tema elegido en Ajustes. «auto» deja decidir al teléfono.
    useEffect(() => {
        if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = settings.theme;
    }, [settings.theme]);

    // Las barras del sistema toman el color de lo que hay debajo: el arranque
    // guiado, el lector con su fondo o la app con el tema elegido.
    const bars = useRef('');
    useEffect(() => {
        if (!ready) return undefined;
        const paint = () => {
            const top = document.querySelector('.onb') || document.querySelector('.reader:not(.read-sample)') || document.documentElement;
            const raw = top.classList.contains('onb') ? '#0A1326' : getComputedStyle(top).getPropertyValue('--bg').trim() || '#FFFFFF';
            // El CSS compilado abrevia los colores (#fff): Android los quiere enteros.
            const color = /^#[0-9a-f]{3}$/i.test(raw) ? `#${[...raw.slice(1)].map((c) => c + c).join('')}` : raw;
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
            const dark = r * 0.299 + g * 0.587 + b * 0.114 < 140;
            if (bars.current === color) return;
            bars.current = color;
            setBars(color, dark);
        };
        paint();
        // El teléfono puede pasar de claro a oscuro con la app abierta.
        const scheme = window.matchMedia('(prefers-color-scheme: dark)');
        scheme.addEventListener('change', paint);
        return () => scheme.removeEventListener('change', paint);
    }, [ready, settings.theme, settings.reader.theme, settings.onboarded, sources.length > 0, Boolean(reader)]);

    // Cada pestaña empieza arriba, no donde se dejó la anterior.
    useEffect(() => {
        document.querySelector('.main')?.scrollTo(0, 0);
    }, [tab]);

    // El botón atrás de Android cierra lo que esté encima antes de salir.
    const back = useRef(null);
    back.current = () => {
        if (shared) actions.setShared(null);
        else if (playing.open) player.setOpen(false);
        else if (pausing) actions.closePause();
        else if (tagging) actions.closeTags();
        else if (feedback) setFeedback(null);
        else if (menu) actions.closeMenu();
        else if (compare) actions.closeCompare();
        else if (addMenu) setAddMenu(false);
        else if (watchAdd) setWatchAdd(false);
        else if (adding) setAdding(false);
        else if (topicEdit) setTopicEdit(null);
        else if (editing) setEditing(null);
        else if (reader) setReader(reader.back || null);
        else if (catalog) {
            if (!catalogBack.current?.()) setCatalog(false);
        }
        else if (topicView) setTopicView(null);
        else if (siteView) setSiteView(null);
        else if (weekOpen) setWeekOpen(false);
        else if (rulesOpen) setRulesOpen(false);
        else if (statsOpen) setStatsOpen(false);
        else if (inboxOpen) setInboxOpen(false);
        else if (notifyOpen) setNotifyOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (tab !== 'hoy') setTab('hoy');
        else CapApp.exitApp();
    };
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return undefined;
        const handle = CapApp.addListener('backButton', () => back.current());
        const resume = CapApp.addListener('appStateChange', ({ isActive }) => {
            // Al salir se guarda la copia automática: es cuando Android puede matar la app.
            if (!isActive) {
                actions.snapshotNow();
                return;
            }
            actions.refreshIfStale();
            actions.applyNotificationSaves();
            actions.loadInbox();
        });
        return () => {
            handle.then((h) => h.remove());
            resume.then((h) => h.remove());
        };
    }, []);

    // «Compartir → Faro» desde el navegador u otra app.
    useEffect(
        () =>
            onShared((text) => {
                const url = firstUrl(text);
                if (url) actions.setShared(url);
            }),
        []
    );

    // Avisos: el que el usuario tocó para entrar y lo que guardó sin abrir la app.
    // Se espera a que los datos estén cargados para poder buscar la noticia.
    useEffect(() => {
        if (!ready) return undefined;
        actions.applyNotificationSaves();
        actions.loadInbox();
        return onNotificationOpen((open) => actions.handleOpen(open));
    }, [ready]);
    useEffect(() => {
        if (!pendingOpen) return;
        setSettingsOpen(false);
        setNotifyOpen(false);
        setCatalog(false);
        setInboxOpen(false);
        if (pendingOpen.id) {
            setReader({ id: pendingOpen.id, list: [pendingOpen.id], origin: 'Avisos' });
        } else if (pendingOpen.sourceId) {
            setReader(null);
            setSiteView(pendingOpen.sourceId);
        } else {
            setReader(null);
            setTab('explorar');
        }
        actions.clearPendingOpen();
    }, [pendingOpen]);

    // Recién instalada, Faro pide una vez el permiso de notificaciones de
    // Android. Si se concede, los avisos quedan encendidos; lo que avisa se
    // elige después en Ajustes → Avisos.
    useEffect(() => {
        if (!ready || !canNotify || settings.notifyAsked) return;
        const firstRun = !settings.onboarded && !sources.length;
        actions.setSettings({ notifyAsked: true });
        if (firstRun) askPermission().then((granted) => granted && actions.setNotify({ on: true }));
    }, [ready]);

    // Accesos directos del icono (pulsación larga en el lanzador).
    useEffect(() => {
        if (!ready) return undefined;
        return onShortcut((go) => {
            setReader(null);
            setSettingsOpen(false);
            setNotifyOpen(false);
            setStatsOpen(false);
            setInboxOpen(false);
            setCatalog(false);
            setSiteView(null);
            setTopicView(null);
            setAddMenu(false);
            if (go === 'anadir') {
                setTab('fuentes');
                setAdding(true);
                return;
            }
            setAdding(false);
            if (go === 'guardado') setTab('biblioteca');
            else if (go === 'buscar') {
                setTab('explorar');
                setSearchFocus((n) => n + 1);
            } else setTab('hoy');
        });
    }, [ready]);

    if (!ready) return <div className="boot" />;

    const open = (id, list, origin) => setReader({ id, list, origin });
    const openOne = (id) => open(id, [id], 'Hoy');

    if (!settings.onboarded && !sources.length && !shared) {
        return (
            <div className="app solo">
                <Onboarding />
            </div>
        );
    }

    return (
        <Chrome.Provider value={chrome}>
        <div className={`app${playing.current ? ' has-player' : ''}`}>
            <PullToRefresh className="main" onRefresh={actions.refreshAll} busy={refreshing && (tab === 'hoy' || tab === 'explorar')}>
                {tab === 'hoy' && <Hoy onOpen={open} onAdd={() => setAdding(true)} onCatalog={() => setCatalog(true)} onTab={setTab} onWeek={() => setWeekOpen(true)} />}
                {tab === 'explorar' && <Lista mode="todo" onOpen={open} focus={searchFocus} />}
                {tab === 'biblioteca' && <Biblioteca onOpen={open} />}
                {tab === 'fuentes' && <Fuentes onCatalog={() => setCatalog(true)} onEdit={setSiteView} onTopicEdit={setTopicEdit} onTopicOpen={setTopicView} onWatch={() => setWatchAdd(true)} />}
            </PullToRefresh>

            {tab === 'fuentes' && (
                <div className="fab-holder">
                    <button type="button" className="fab" onClick={() => setAddMenu(true)}>
                        <Icon name="mas" size={18} strokeWidth={2.2} />
                        Añadir
                    </button>
                </div>
            )}
            <MiniPlayer />
            <nav className="nav" aria-label="Secciones">
                {TABS.map((t) => (
                    <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                        <Icon name={t.id} strokeWidth={tab === t.id ? 2.1 : 1.8} />
                        {t.label}
                    </button>
                ))}
            </nav>

            {settingsOpen && <Ajustes onClose={() => setSettingsOpen(false)} onNotify={() => setNotifyOpen(true)} onStats={() => setStatsOpen(true)} onFeedback={() => setFeedback('comentario')} onRules={() => setRulesOpen(true)} />}
            {rulesOpen && <Reglas onClose={() => setRulesOpen(false)} />}
            {statsOpen && <Estadisticas onClose={() => setStatsOpen(false)} onWeek={() => setWeekOpen(true)} />}
            {weekOpen && <Semana onClose={() => setWeekOpen(false)} onOpen={open} />}
            {inboxOpen && <Bandeja onClose={() => setInboxOpen(false)} onNotify={() => setNotifyOpen(true)} />}
            {siteView && (
                <div className="overlay">
                    <Lista mode="sitio" sourceId={siteView} onOpen={open} onClose={() => setSiteView(null)} onEditSource={setEditing} />
                </div>
            )}
            {notifyOpen && <Avisos onClose={() => setNotifyOpen(false)} />}
            {topicView && (
                <div className="overlay">
                    <Lista mode="tema" topic={topicView} onOpen={open} onClose={() => setTopicView(null)} />
                </div>
            )}
            {catalog && <Catalogo onClose={() => setCatalog(false)} onAddByUrl={() => setAdding(true)} onSuggest={() => setFeedback('sitio')} onRead={(id, site) => setReader({ id, list: [id], origin: '', linked: `Vista previa de ${site}`, back: reader })} />}
            {reader && (
                <Lector
                    {...reader}
                    onClose={() => setReader(reader.back || null)}
                    onNavigate={(id) => setReader({ ...reader, id })}
                    // Un enlace abierto dentro de Faro: al volver se regresa al artículo de antes.
                    onLink={(id) => setReader({ id, list: [id], origin: '', linked: true, back: reader })}
                />
            )}
            {addMenu && (
                <Sheet title="Añadir" onClose={() => setAddMenu(false)}>
                    <div className="card list">
                        <button
                            type="button"
                            className="line-btn"
                            onClick={() => {
                                setAddMenu(false);
                                setCatalog(true);
                            }}
                        >
                            <span>Del catálogo</span>
                            <span className="sub-s">sitios elegidos por tema</span>
                        </button>
                        <button
                            type="button"
                            className="line-btn"
                            onClick={() => {
                                setAddMenu(false);
                                setAdding(true);
                            }}
                        >
                            <span>Por su dirección</span>
                            <span className="sub-s">web, YouTube, podcast, Telegram…</span>
                        </button>
                        <button
                            type="button"
                            className="line-btn"
                            onClick={() => {
                                setAddMenu(false);
                                setTopicEdit({});
                            }}
                        >
                            <span>Un tema</span>
                            <span className="sub-s">un asunto en tus fuentes o en toda la web</span>
                        </button>
                        <button
                            type="button"
                            className="line-btn"
                            onClick={() => {
                                setAddMenu(false);
                                setWatchAdd(true);
                            }}
                        >
                            <span>Vigilar una página</span>
                            <span className="sub-s">te avisa cuando cambie</span>
                        </button>
                    </div>
                </Sheet>
            )}
            {topicEdit && <TemaSheet topic={topicEdit} onClose={() => setTopicEdit(null)} />}
            {adding && <AnadirSheet onClose={() => setAdding(false)} initialUrl={adding.url || ''} />}
            {editing && <FuenteSheet id={editing} onClose={() => setEditing(null)} onNotify={() => setNotifyOpen(true)} />}
            {compare && <CoverageSheet ids={compare} onOpen={open} />}
            {menu && <StoryMenu id={menu} onOpen={openOne} />}
            {tagging && <TagsSheet id={tagging} />}
            {watchAdd && <WatchSheet onClose={() => setWatchAdd(false)} />}
            {pausing && <PauseSheet target={pausing} />}
            {feedback && <FeedbackSheet kind={feedback} onClose={() => setFeedback(null)} />}
            {shared && (
                <ShareSheet
                    url={shared}
                    onClose={() => actions.setShared(null)}
                    onOpen={(id) => open(id, [id], 'Guardado')}
                    onFollow={(url) => {
                        actions.setShared(null);
                        setAdding({ url });
                    }}
                />
            )}

            <PlayerSheet />
            {!settings.tutorialDone && today.items.length > 0 && !reader && <Gestos />}

            <Toast toast={toast} onUndo={actions.undoToast} />
        </div>
        </Chrome.Provider>
    );
}
