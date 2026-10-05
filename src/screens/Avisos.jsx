// Avisos: de qué avisa Faro, cada cuánto y cuándo calla.

import { useEffect, useState } from 'react';
import { canWatch, DEFAULT_NOTIFY, FREQUENCIES, inQuietHours, notifySummary } from '../core/notify.js';
import { agoLabel } from '../core/text.js';
import { actions, useStore } from '../data/store.js';
import { askPermission, canNotify, notifyStatus, openNotifySettings, runWatcherNow, sendTestNotification } from '../ports/background.js';
import Icon from '../ui/Icon.jsx';
import { Logo, Monogram, Switch } from '../ui/bits.jsx';
import { DayLine, Group, Row } from '../ui/settings.jsx';

const SHOWN = 6;

export default function Avisos({ onClose }) {
    const { sources, articles, settings } = useStore();
    const notify = { ...DEFAULT_NOTIFY, ...settings.notify };
    const topics = settings.topics || [];
    const [status, setStatus] = useState(null);
    const [note, setNote] = useState('');
    const [allSites, setAllSites] = useState(false);

    const refreshStatus = () => notifyStatus().then(setStatus);
    useEffect(() => {
        refreshStatus();
        // Al volver de los ajustes de Android el permiso puede haber cambiado.
        const onVisible = () => document.visibilityState === 'visible' && refreshStatus();
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    const blocked = canNotify && status && !status.allowed;
    const live = notify.on && !blocked;
    const summary = notifySummary(sources, settings);
    const isOn = (s) => notify.on && canWatch(s) && Boolean(s.notify);
    // Los que ya avisan, arriba; el resto por orden alfabético.
    const sorted = [...sources].sort((a, b) => Number(isOn(b)) - Number(isOn(a)) || a.title.localeCompare(b.title, 'es'));
    const shown = allSites ? sorted : sorted.slice(0, SHOWN);

    // Así se verá un aviso: con el primer tema que avisa o, si no hay, con un sitio.
    const sampleTopic = topics.find((t) => t.notify !== false);
    const sampleSite = sorted.find(isOn) || sorted[0];
    const sampleStory = articles.find((a) => a.sourceId === sampleSite?.id) || articles[0];
    const sample = {
        heading: sampleTopic ? `Tema · ${sampleTopic.name}` : sampleSite?.title || 'Tu sitio',
        title: sampleStory?.title || 'El titular de la noticia aparece aquí',
    };

    // Encender cualquier aviso pide antes el permiso de Android.
    const allow = async () => {
        if (await askPermission()) {
            refreshStatus();
            return true;
        }
        refreshStatus();
        setNote('Android no dio permiso para enviar avisos. Puedes darlo en los ajustes del sistema.');
        return false;
    };
    const setMaster = async (on) => {
        setNote('');
        if (on && !(await allow())) return;
        actions.setNotify({ on });
    };
    // Marcar un tema o un sitio enciende los avisos si estaban apagados.
    const ensureOn = async () => {
        if (notify.on) return true;
        if (!(await allow())) return false;
        actions.setNotify({ on: true });
        return true;
    };
    const setDaily = async (on) => {
        setNote('');
        if (on && !(await allow())) return;
        actions.setSettings({ dailyOn: on });
    };

    return (
        <div className="overlay">
            <div className="screen">
                <header className="cat-head">
                    <button type="button" className="round round-surface" aria-label="Volver" onClick={onClose}>
                        <Icon name="atras" size={22} strokeWidth={2} />
                    </button>
                    <h1 className="title-l">Avisos</h1>
                </header>

                <div className={`bell-hero${live ? ' on' : ''}`}>
                    <div className="bell-top">
                        <span className="bell-mark">
                            <Icon name="campana" size={24} strokeWidth={1.8} />
                        </span>
                        <div>
                            <strong>{notify.on ? (blocked ? 'Bloqueados por Android' : 'Avisos activados') : 'Avisos desactivados'}</strong>
                            <span>
                                {!notify.on
                                    ? 'Faro revisa tus sitios aunque esté cerrado.'
                                    : blocked
                                      ? 'Faro no tiene permiso para mostrar notificaciones.'
                                      : summary
                                        ? `Te avisa de ${summary}${inQuietHours(notify) ? '. Ahora en silencio.' : '.'}`
                                        : 'Elige abajo de qué quieres enterarte.'}
                            </span>
                        </div>
                        <Switch checked={notify.on} onChange={setMaster} label="Avisos de Faro" />
                    </div>
                    {/* Una muestra de cómo llega un aviso al teléfono. */}
                    <div className="notif" aria-hidden="true">
                        <span className="notif-app">
                            <Logo size={12} tower="#FFFFFF" beam="#FFC53D" />
                        </span>
                        <div>
                            <small>Faro · ahora</small>
                            <b>{sample.heading}</b>
                            <span>{sample.title}</span>
                        </div>
                    </div>
                </div>

                {blocked && (
                    <button type="button" className="btn-lamp btn-big" onClick={openNotifySettings}>
                        Dar permiso en los ajustes de Android
                    </button>
                )}
                {!canNotify && <p className="hint">Los avisos funcionan en la app de Android, no en el navegador.</p>}
                {note && (
                    <p className="error" role="alert">
                        {note}
                    </p>
                )}

                <section className="set-group">
                    <h3 className="set-label">Tus temas</h3>
                    {topics.length > 0 ? (
                        <div className="chips">
                            {topics.map((t) => {
                                const on = notify.on && t.notify !== false;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        className="bell-chip"
                                        aria-pressed={on}
                                        aria-label={`Avisar del tema ${t.name}`}
                                        onClick={async () => {
                                            if (!on && !(await ensureOn())) return;
                                            actions.saveTopic({ ...t, notify: !on });
                                        }}
                                    >
                                        <Icon name="campana" size={15} strokeWidth={2} filled={on} />
                                        {t.name}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="hint">Crea un tema en Fuentes («Godot», «elecciones»…) y Faro te avisará cuando cualquiera de tus sitios lo mencione.</p>
                    )}
                    <p className="hint">Con sonido: un aviso por noticia, con su titular y resumen.</p>
                </section>

                <section className="set-group">
                    <h3 className="set-label">Tus sitios</h3>
                    {sorted.length > 0 ? (
                        <div className="set-list">
                            {shown.map((s) => (
                                <div className="site-line" key={s.id}>
                                    <Monogram source={s} size={34} />
                                    <span>
                                        {s.title}
                                        <small>{s.kind === 'page' ? 'Sin feed: vigila su portada' : s.perWeek >= 70 ? `Unas ${Math.round(s.perWeek / 7)} al día: pueden ser muchos avisos` : 'Todo lo que publique'}</small>
                                    </span>
                                    <Switch
                                        checked={isOn(s)}
                                        label={`Avisar de todo lo de ${s.title}`}
                                        onChange={async (on) => {
                                            if (!canWatch(s)) return;
                                            if (on && !(await ensureOn())) return;
                                            actions.updateSource(s.id, { notify: on });
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="hint">Cuando sigas algún sitio podrás pedir aviso de todo lo que publique.</p>
                    )}
                    {sorted.length > SHOWN && (
                        <button type="button" className="btn-ghost small" onClick={() => setAllSites(!allSites)}>
                            {allSites ? 'Ver menos' : `Ver los ${sorted.length} sitios`}
                        </button>
                    )}
                    <p className="hint">En silencio. Tres o más noticias seguidas del mismo sitio llegan juntas en un solo aviso.</p>
                </section>

                <section className="set-group">
                    <h3 className="set-label">Cada cuánto revisa</h3>
                    <div className="seg3" role="group" aria-label="Frecuencia de revisión">
                        {FREQUENCIES.map((f) => (
                            <button key={f.id} type="button" aria-pressed={notify.every === f.id} onClick={() => actions.setNotify({ every: f.id })}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <p className="hint">Android decide el momento exacto y puede retrasarlo para ahorrar batería.</p>
                </section>

                <section className="set-group">
                    <div className="set-line">
                        <span>
                            <b className="set-label">No molestar</b>
                            <small>Lo que salga en esas horas te llega al terminar.</small>
                        </span>
                        <Switch checked={notify.quietOn} onChange={(quietOn) => actions.setNotify({ quietOn })} label="No molestar" />
                    </div>
                    <DayLine from={notify.quietFrom} to={notify.quietTo} on={notify.quietOn} />
                    {notify.quietOn && (
                        <div className="times">
                            <label htmlFor="silencio-desde">
                                Desde
                                <input id="silencio-desde" type="time" value={notify.quietFrom} onChange={(e) => e.target.value && actions.setNotify({ quietFrom: e.target.value })} />
                            </label>
                            <label htmlFor="silencio-hasta">
                                Hasta
                                <input id="silencio-hasta" type="time" value={notify.quietTo} onChange={(e) => e.target.value && actions.setNotify({ quietTo: e.target.value })} />
                            </label>
                        </div>
                    )}
                </section>

                <section className="set-group">
                    <div className="set-line">
                        <span>
                            <b className="set-label">Aviso diario</b>
                            <small>«Hoy está listo», a la hora que elijas.</small>
                        </span>
                        <Switch checked={Boolean(settings.dailyOn)} onChange={setDaily} label="Aviso diario" />
                    </div>
                    {settings.dailyOn && (
                        <div className="times">
                            <label htmlFor="hora-aviso">
                                A las
                                <input id="hora-aviso" type="time" value={settings.dailyTime} onChange={(e) => e.target.value && actions.setSettings({ dailyTime: e.target.value })} />
                            </label>
                        </div>
                    )}
                </section>

                {canNotify && (
                    <>
                        <Group title="Comprobar">
                            <Row
                                icon="campana"
                                title="Enviar un aviso de prueba"
                                onClick={async () => {
                                    if (await allow()) sendTestNotification();
                                }}
                            />
                            <Row
                                icon="actualizar"
                                title="Revisar ahora"
                                value={status?.lastRun ? agoLabel(status.lastRun) : 'aún sin revisar'}
                                disabled={!notify.on}
                                onClick={() => {
                                    runWatcherNow();
                                    setTimeout(refreshStatus, 8000);
                                }}
                            />
                            <Row icon="ajustes" title="Sonido y vibración" value="Android" onClick={openNotifySettings} />
                        </Group>
                        {status?.totalSent > 0 && (
                            <p className="hint">
                                Faro te ha enviado {status.totalSent} {status.totalSent === 1 ? 'aviso' : 'avisos'} hasta ahora; {status.lastSent} en la última revisión.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
