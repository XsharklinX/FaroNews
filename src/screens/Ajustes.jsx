// Ajustes: todo lo que no es elegir sitios o temas. Arriba lo que se ve y se
// toca a diario (resumen, tema, lectura); debajo, filas que se despliegan.

import { useMemo, useRef, useState } from 'react';
import { readingStats } from '../core/insights.js';
import { liveMutes, pauseLabel } from '../core/pause.js';
import { readExport } from '../core/importers.js';
import { canTranslate } from '../ports/background.js';
import { DEFAULT_NOTIFY, notifySummary } from '../core/notify.js';
import { agoLabel } from '../core/text.js';
import { actions, useStore } from '../data/store.js';
import { clearImages, imagesStats } from '../ports/images.js';
import { exportFile } from '../ports/share.js';
import Icon from '../ui/Icon.jsx';
import { Switch } from '../ui/bits.jsx';
import { Group, Row, SwitchRow, TagEditor, ThemePicker } from '../ui/settings.jsx';
import { ReadingOptions } from './Lector.jsx';

const BUDGET_MB = 80;

export default function Ajustes({ onClose, onNotify, onStats, onFeedback, onRules, onTrip }) {
    const { sources, articles, settings, habits, refreshing, lastRefresh } = useStore();
    const fileRef = useRef(null);
    const backupRef = useRef(null);
    const importRef = useRef(null);
    const [backupNote, setBackupNote] = useState('');
    const [stats, setStats] = useState(imagesStats());
    const [note, setNote] = useState('');
    const notify = { ...DEFAULT_NOTIFY, ...settings.notify };
    const summary = notifySummary(sources, settings);
    const learned = Object.values(habits).reduce((sum, h) => sum + h.o + h.s + h.d, 0);
    const week = useMemo(() => readingStats(articles, sources), [articles, sources]);
    const usedMb = stats.bytes / 1048576;
    const topics = (settings.topics || []).length;
    const timed = Object.entries(liveMutes(settings.mutedUntil));

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const added = await actions.importOpml(await file.text());
        setNote(added ? `Se añadieron ${added} sitios. Faro los está actualizando.` : 'No había sitios nuevos en ese archivo.');
    };

    // Lo guardado en Pocket u Omnivore.
    const onImport = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const items = await readExport(file.name, new Uint8Array(await file.arrayBuffer()));
            if (!items.length) {
                setNote('Ese archivo no trae artículos que Faro reconozca. Usa la exportación de Pocket (.csv o .html) o de Omnivore (.zip o .json).');
                return;
            }
            const done = actions.importSaved(items);
            setNote(`${done.added} artículos añadidos a Guardado${done.skipped ? ` (${done.skipped} ya estaban)` : ''}. El texto de cada uno se descarga al abrirlo.`);
        } catch {
            setNote('No se pudo leer ese archivo.');
        }
    };

    const saveBackup = async () => {
        const day = new Date().toISOString().slice(0, 10);
        await exportFile(`faro-copia-${day}.json`, await actions.exportBackup());
        setBackupNote('Copia creada. Guárdala fuera del teléfono: en la nube, en el correo o en el ordenador.');
    };
    const onBackupFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const done = await actions.restoreBackup(await file.text());
            setBackupNote(`Copia restaurada: ${done.sources} sitios y ${done.articles} artículos añadidos. Lo que ya tenías sigue ahí.`);
        } catch (err) {
            setBackupNote(err.message);
        }
    };

    return (
        <div className="overlay">
            <div className="screen">
                <header className="cat-head">
                    <button type="button" className="round round-surface" aria-label="Volver" onClick={onClose}>
                        <Icon name="atras" size={22} strokeWidth={2} />
                    </button>
                    <h1 className="title-l">Ajustes</h1>
                </header>

                {/* Tu semana de un vistazo; al tocarla se abre «Tu lectura». */}
                <button type="button" className="me" onClick={onStats} aria-label="Ver tu lectura de la semana">
                    <span className="me-nums">
                        <span>
                            <b>{week.count}</b>
                            {week.count === 1 ? 'leída esta semana' : 'leídas esta semana'}
                        </span>
                        <span>
                            <b>{sources.length}</b>
                            {sources.length === 1 ? 'sitio' : 'sitios'}
                        </span>
                        <span>
                            <b>{topics}</b>
                            {topics === 1 ? 'tema' : 'temas'}
                        </span>
                    </span>
                    <span className="me-week" aria-hidden="true">
                        {week.days.map((d, i) => (
                            <span key={i}>
                                <i className={i === 6 ? 'today' : ''} style={{ height: `${Math.max(8, (d.count / week.best) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
                                {d.label.slice(0, 1).toUpperCase()}
                            </span>
                        ))}
                    </span>
                </button>

                <section className="set-group">
                    <h3 className="set-label">Apariencia</h3>
                    <ThemePicker value={settings.theme} onChange={(theme) => actions.setSettings({ theme })} />
                    {canTranslate && (
                        <div className="set-list">
                            <SwitchRow icon="editar" title="Tamaño de letra del teléfono" hint="Faro usa el tamaño de texto que elegiste en los ajustes de Android." checked={Boolean(settings.systemText)} onChange={(systemText) => actions.setSettings({ systemText })} />
                        </div>
                    )}
                </section>

                <section className="set-group">
                    <h3 className="set-label">Lectura</h3>
                    <ReadingOptions preview />
                </section>

                <Group title="Qué te llega">
                    <Row icon="campana" title="Avisos" value={notify.on ? summary || 'activados' : 'desactivados'} onClick={onNotify} />
                    <Row icon="silenciar" title="Palabras silenciadas" value={settings.muted.length + timed.length ? String(settings.muted.length + timed.length) : 'ninguna'}>
                        <TagEditor id="silencio" values={settings.muted} placeholder="Añadir una palabra" onChange={(muted) => actions.setSettings({ muted })} />
                        {timed.length > 0 && (
                            <div className="chips">
                                {timed.map(([word, until]) => (
                                    <button key={word} type="button" className="tag-chip" aria-label={`Quitar el silencio de ${word}`} onClick={() => actions.pause({ kind: 'word', key: word, label: word }, 0)}>
                                        {word} · {pauseLabel(until)}
                                        <Icon name="cerrar" size={13} strokeWidth={2.2} />
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="hint">Lo que mencione estas palabras no entra en Hoy ni te avisa. Desde el menú de una historia puedes callar una solo por un tiempo.</p>
                    </Row>
                    <Row icon="ajustes" title="Reglas automáticas" value={(settings.rules || []).length ? String((settings.rules || []).length) : 'ninguna'} onClick={onRules} />
                    <Row icon="gesto" title="Escudo contra espóileres" value={(settings.spoilers || []).length ? String(settings.spoilers.length) : 'apagado'}>
                        <TagEditor id="spoilers" values={settings.spoilers || []} placeholder="Una serie, un libro, un equipo…" onChange={(spoilers) => actions.setSettings({ spoilers })} />
                        <p className="hint">Los titulares que los mencionen salen borrosos hasta que los toques, y los avisos no enseñan el titular.</p>
                    </Row>
                    <SwitchRow icon="ok" title="Desactivar titulares cebo" hint="Si un titular esconde la noticia, se cambia por el dato de la entradilla." checked={settings.baitFix !== false} onChange={(baitFix) => actions.setSettings({ baitFix })} />
                    {canTranslate && <SwitchRow icon="enlace" title="Traducir titulares en inglés" hint="En las listas, en el teléfono. La primera vez descarga el idioma con wifi." checked={settings.translateTitles !== false} onChange={(translateTitles) => actions.setSettings({ translateTitles })} />}
                    <Row icon="destello" title="Lo que Faro aprende" value={learned ? `${learned} gestos` : 'nada aún'}>
                        <p className="hint">Lo que abres y guardas sube esas fuentes en Hoy; lo que descartas las baja. Se calcula y se queda en tu teléfono.</p>
                        <button type="button" className="btn-ghost small" onClick={actions.resetHabits} disabled={!learned}>
                            Olvidar lo aprendido
                        </button>
                    </Row>
                </Group>

                <Group title="Tus datos">
                    <Row icon="copia" title="Copia de seguridad" value={settings.autoCopy !== false ? 'semanal' : 'manual'}>
                        <div className="set-line">
                            <span>
                                Copia semanal automática
                                <small>En Documentos/Faro. {settings.autoCopyAt ? `Última: ${new Date(settings.autoCopyAt).toLocaleDateString('es')}.` : 'Todavía no se ha hecho ninguna.'}</small>
                            </span>
                            <Switch checked={settings.autoCopy !== false} onChange={(autoCopy) => actions.setSettings({ autoCopy })} label="Copia semanal automática" />
                        </div>
                        <div className="set-actions">
                            <button type="button" className="btn-ghost small" onClick={saveBackup}>
                                Guardar una copia
                            </button>
                            <button type="button" className="btn-ghost small" onClick={() => backupRef.current?.click()}>
                                Restaurar
                            </button>
                            <button
                                type="button"
                                className="btn-ghost small"
                                onClick={async () => setBackupNote((await actions.copyToDocuments()) ? 'Copia guardada en Documentos/Faro/faro-copia.json.' : 'No se pudo escribir en Documentos. Usa «Guardar una copia» y elige dónde dejarla.')}
                            >
                                Copiar a Documentos
                            </button>
                        </div>
                        <p className="hint" role="status">
                            {backupNote || 'Lleva tus fuentes, temas, guardados y resaltados. Restaurar suma a lo que ya hay; la carpeta Documentos sobrevive a desinstalar Faro.'}
                        </p>
                    </Row>
                    <Row icon="descarga" title="Llévatelo todo para un viaje" value="sin conexión" onClick={onTrip} />
                    <SwitchRow icon="descarga" title="Ahorro de datos" hint="Con datos móviles, sin fotos ni descargas para leer sin conexión. Con wifi, todo normal." checked={settings.dataSaver !== false} onChange={(dataSaver) => actions.setSettings({ dataSaver })} />
                    <Row icon="descarga" title="Sin conexión" value={stats.count ? `${usedMb.toFixed(1)} MB` : 'vacío'}>
                        <div className="meter-bar" role="img" aria-label={`${usedMb.toFixed(1)} de ${BUDGET_MB} MB usados`}>
                            <i style={{ width: `${Math.min(100, (usedMb / BUDGET_MB) * 100)}%` }} />
                        </div>
                        <p className="hint">
                            {stats.count ? `${stats.count} imágenes · ${usedMb.toFixed(1)} de ${BUDGET_MB} MB.` : 'Sin imágenes guardadas.'} Faro guarda el texto y las imágenes de lo que entra en Hoy; lo más antiguo se borra solo.
                        </p>
                        <button
                            type="button"
                            className="btn-ghost small"
                            disabled={!stats.count}
                            onClick={async () => {
                                await clearImages();
                                setStats(imagesStats());
                            }}
                        >
                            Borrar las imágenes
                        </button>
                    </Row>
                    <Row icon="fuentes" title="Traer de otra app" value="Pocket, Omnivore, Feedly…">
                        <div className="set-actions">
                            <button type="button" className="btn-ghost small" onClick={() => importRef.current?.click()}>
                                Lo guardado en Pocket u Omnivore
                            </button>
                            <button type="button" className="btn-ghost small" onClick={() => fileRef.current?.click()}>
                                Fuentes de Feedly o Inoreader (OPML)
                            </button>
                            <button type="button" className="btn-ghost small" onClick={() => exportFile('faro-fuentes.opml', actions.exportOpml())} disabled={!sources.length}>
                                Exportar OPML
                            </button>
                        </div>
                        <p className="hint" role="status">
                            {note || 'Pocket: exporta desde su web (.csv o .html). Omnivore: el .zip de su exportación. Feedly e Inoreader: el archivo OPML de tus fuentes. Desde aquí también puedes exportar las tuyas.'}
                        </p>
                    </Row>
                    <Row icon="actualizar" title={refreshing ? 'Actualizando…' : 'Actualizar ahora'} value={lastRefresh ? agoLabel(lastRefresh) : ''} onClick={actions.refreshAll} disabled={refreshing || !sources.length} />
                </Group>
                <input ref={backupRef} id="copia-file" type="file" accept=".json,application/json" hidden onChange={onBackupFile} />
                <input ref={importRef} id="importar-file" type="file" accept=".csv,.html,.htm,.json,.zip,text/csv,text/html,application/json,application/zip" hidden onChange={onImport} />
                <input ref={fileRef} id="opml-file" type="file" accept=".opml,.xml,text/xml,text/x-opml,application/xml" hidden onChange={onFile} />

                <Group title="Ayuda">
                    <Row icon="grafico" title="Tu lectura" value="7 días" onClick={onStats} />
                    <Row icon="editar" title="Enviar comentario" value="fallos e ideas" onClick={onFeedback} />
                    <Row
                        icon="gesto"
                        title="Ver los gestos"
                        onClick={() => {
                            actions.setSettings({ tutorialDone: false });
                            onClose();
                        }}
                    />
                </Group>

                <p className="version">Faro {__APP_VERSION__}</p>
            </div>
        </div>
    );
}
