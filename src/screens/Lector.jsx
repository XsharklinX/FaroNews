import { useEffect, useMemo, useRef, useState } from 'react';
import { articleBlocks, articleToText, fileSlug } from '../core/export.js';
import { storyTimeline } from '../core/extras2.js';
import { youtubeEmbed, youtubeId } from '../core/extras3.js';
import { applyHighlights } from '../core/highlight.js';
import { localizeImages } from '../core/images.js';
import { looksEnglish, translateHtml } from '../core/lang.js';
import { linkPlan } from '../core/links.js';
import { cleanHtml } from '../core/readable.js';
import { agoLabel, looksLikeHtml, plainToHtml } from '../core/text.js';
import { resolveUrl } from '../core/url.js';
import { player, usePlayer } from '../data/player.js';
import { actions, sourceOf, useStore } from '../data/store.js';
import { canTranslate, translateTexts } from '../ports/background.js';
import { tap } from '../ports/haptics.js';
import { localSrc } from '../ports/images.js';
import { exportBinary, exportFile, openExternal, shareLink } from '../ports/share.js';
import { QuoteSheet, WikiSheet } from './Hojas.jsx';
import { NoteSheet } from './Panorama.jsx';
import { whoTalks } from '../ports/gente.js';
import { savingData } from '../ports/net.js';
import Icon from '../ui/Icon.jsx';
import { lengthLabel } from '../ui/StoryRow.jsx';
import { Monogram, Sheet, Switch, Thumb } from '../ui/bits.jsx';

const SCALES = [0.9, 1, 1.15, 1.3, 1.5];
const SWIPE = 90;

export const READER_FONTS = [
    { id: 'serif', label: 'Serif' },
    { id: 'sans', label: 'Sin serif' },
    { id: 'dislexia', label: 'Para dislexia' },
];
export const READER_MARGINS = [
    { id: 'normal', label: 'Normal' },
    { id: 'ancho', label: 'Estrecha' },
];
export const READER_THEMES = [
    { id: 'auto', label: 'Auto' },
    { id: 'claro', label: 'Claro' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'noche', label: 'Noche' },
];

// Controles de lectura. Se usan en el lector y en Ajustes; allí llevan una
// muestra (`preview`), porque no hay artículo delante en el que verlo.
export function ReadingOptions({ preview = false }) {
    const { settings } = useStore();
    const reader = settings.reader;
    return (
        <div className="read-opts">
            {preview && (
                <div className="reader read-sample" data-theme={reader.theme} data-font={reader.font} aria-hidden="true">
                    <div className="prose" style={{ fontSize: `${19 * settings.fontScale}px` }}>
                        <p>El faro no decide adónde va el barco: solo enseña dónde están las rocas. Así se lee un artículo con estos ajustes.</p>
                    </div>
                </div>
            )}
            <div className="sizes" role="group" aria-label="Tamaño de letra">
                {SCALES.map((scale) => (
                    <button key={scale} type="button" aria-pressed={settings.fontScale === scale} aria-label={`Tamaño ${Math.round(scale * 100)} %`} style={{ fontSize: `${15 * scale}px` }} onClick={() => actions.setSettings({ fontScale: scale })}>
                        A
                    </button>
                ))}
            </div>
            <div className="faces2" role="group" aria-label="Tipo de letra">
                {READER_FONTS.map((f) => (
                    <button key={f.id} type="button" className={`face ${f.id}`} aria-pressed={reader.font === f.id} onClick={() => actions.setReader({ font: f.id })}>
                        <b>Aa</b>
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="swatches" role="group" aria-label="Fondo al leer">
                {READER_THEMES.map((t) => (
                    <button key={t.id} type="button" className="swatch" aria-pressed={reader.theme === t.id} onClick={() => actions.setReader({ theme: t.id })}>
                        <i className={t.id} />
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="set-line">
                <span>
                    Columna estrecha
                    <small>Más margen a los lados del texto.</small>
                </span>
                <Switch checked={reader.margin === 'ancho'} onChange={(on) => actions.setReader({ margin: on ? 'ancho' : 'normal' })} label="Columna estrecha" />
            </div>
            <div className="set-line">
                <span>
                    Pasar páginas
                    <small>Como un libro: toca los bordes o desliza para pasar de página.</small>
                </span>
                <Switch checked={Boolean(reader.paged)} onChange={(paged) => actions.setReader({ paged })} label="Pasar páginas" />
            </div>
            <div className="set-line">
                <span>
                    Más espacio entre líneas y letras
                    <small>Ayuda a leer con dislexia o con la vista cansada.</small>
                </span>
                <Switch checked={reader.spacing === 'amplio'} onChange={(on) => actions.setReader({ spacing: on ? 'amplio' : 'normal' })} label="Más espacio entre líneas y letras" />
            </div>
            <div className="set-line">
                <span>
                    Alto contraste
                    <small>Todo el texto en el color más oscuro, y algo más grueso.</small>
                </span>
                <Switch checked={Boolean(reader.contrast)} onChange={(contrast) => actions.setReader({ contrast })} label="Alto contraste" />
            </div>
        </div>
    );
}

function HighlightSheet({ articleId, highlight, onClose, onShare }) {
    const [note, setNote] = useState(highlight.note || '');
    return (
        <Sheet title="Resaltado" onClose={onClose}>
            <blockquote className="quote-big">{highlight.text}</blockquote>
            <div className="field">
                <label htmlFor="nota-resaltado">Nota</label>
                <textarea id="nota-resaltado" rows={4} placeholder="Qué te hizo resaltarlo" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button
                type="button"
                className="btn-lamp btn-big"
                onClick={() => {
                    actions.updateHighlight(articleId, highlight.id, { note: note.trim() });
                    onClose();
                }}
            >
                Guardar nota
            </button>
            <button type="button" className="btn-ghost" onClick={onShare}>
                Compartir como imagen
            </button>
            <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                    actions.removeHighlight(articleId, highlight.id);
                    onClose();
                }}
            >
                Quitar resaltado
            </button>
        </Sheet>
    );
}

// Enviar el artículo fuera de Faro: su enlace, su texto o un PDF.
function SendSheet({ onPick, onClose }) {
    return (
        <Sheet title="Enviar" subtitle="El texto y el PDF llevan el artículo completo, sin anuncios." onClose={onClose}>
            <div className="card list">
                <button type="button" className="line-btn" onClick={() => onPick('enlace')}>
                    <span>
                        <Icon name="enlace" size={20} strokeWidth={1.8} />
                        Enlace
                    </span>
                    <span className="sub-s">la dirección del artículo</span>
                </button>
                <button type="button" className="line-btn" onClick={() => onPick('txt')}>
                    <span>
                        <Icon name="todo" size={20} strokeWidth={1.8} />
                        Texto
                    </span>
                    <span className="sub-s">archivo .txt</span>
                </button>
                <button type="button" className="line-btn" onClick={() => onPick('pdf')}>
                    <span>
                        <Icon name="documento" size={20} strokeWidth={1.8} />
                        PDF
                    </span>
                    <span className="sub-s">con sus fotos</span>
                </button>
                <button type="button" className="line-btn" onClick={() => onPick('pdf-texto')}>
                    <span>
                        <Icon name="documento" size={20} strokeWidth={1.8} />
                        PDF sin fotos
                    </span>
                    <span className="sub-s">más ligero, para imprimir</span>
                </button>
            </div>
        </Sheet>
    );
}

// `linked`: el artículo se abrió desde un enlace de otro; `onLink` abre uno así.
export default function Lector({ id, list, origin, linked = false, onClose, onNavigate, onLink }) {
    const { articles, sources, settings, imgTick } = useStore();
    const article = articles.find((a) => a.id === id);
    const source = sourceOf(article, new Map(sources.map((s) => [s.id, s])));
    // El texto no está en memoria: se lee al abrir el artículo.
    const [body, setBody] = useState(null);
    const scrollRef = useRef(null);
    const proseRef = useRef(null);
    const touch = useRef(null);
    // Posición de lectura: dónde va ahora, si el usuario ya movió la página y
    // dónde la dejó Faro por su cuenta (para no confundir una cosa con otra).
    const pos = useRef({ value: 0, moved: false, auto: 0 });
    const [progress, setProgress] = useState(0);
    const [selected, setSelected] = useState('');
    const [editing, setEditing] = useState(null);
    const [options, setOptions] = useState(false);
    const [sending, setSending] = useState(false);
    // Nombre o término que el usuario quiere buscar en Wikipedia.
    const [lookup, setLookup] = useState('');
    const [noting, setNoting] = useState(false);
    // Qué dice la gente: null = sin pedir, 'cargando', o lo encontrado.
    const [talk, setTalk] = useState(null);
    const [videoOn, setVideoOn] = useState(false);
    // Modo libro: página actual y total.
    const [pages, setPages] = useState({ n: 1, total: 1 });
    // Resaltado que se está compartiendo como imagen.
    const [quoting, setQuoting] = useState(null);
    // Traducción: si se está viendo y si se está haciendo ahora.
    const [translated, setTranslated] = useState(false);
    const [translating, setTranslating] = useState(false);
    const opening = useRef(false);
    const playing = usePlayer();

    useEffect(() => {
        // Un podcast no se da por leído al abrirlo, sino al escucharlo entero.
        if (article?.kind !== 'audio') actions.open(id);
        actions.ensureFullText(id);
        pos.current = { value: 0, moved: false, auto: 0 };
        scrollRef.current?.scrollTo(0, 0);
        setProgress(0);
        setSelected('');
        const openedAt = Date.now();
        const estimate = article?.kind ? 0 : article?.minutes || 0;
        // Al salir del artículo se guarda hasta dónde se llegó y, si se leyó
        // entero, cuánto se tardó frente a lo estimado (para «a tu ritmo»).
        return () => {
            if (pos.current.moved) actions.setPosition(id, pos.current.value);
            if (estimate >= 2 && pos.current.value >= 0.85) actions.recordPace((Date.now() - openedAt) / 60000 / estimate);
        };
    }, [id]);

    // Texto seleccionado dentro del artículo: ofrece resaltarlo.
    useEffect(() => {
        const onSelection = () => {
            const sel = window.getSelection();
            const inside = sel && !sel.isCollapsed && proseRef.current?.contains(sel.anchorNode) && proseRef.current.contains(sel.focusNode);
            setSelected(inside ? sel.toString() : '');
        };
        document.addEventListener('selectionchange', onSelection);
        return () => document.removeEventListener('selectionchange', onSelection);
    }, []);

    useEffect(() => {
        setBody(null);
        setTranslated(false);
        setTalk(null);
        setVideoOn(false);
        setPages({ n: 1, total: 1 });
    }, [id]);
    // Se vuelve a leer cuando llega el texto completo.
    useEffect(() => {
        let alive = true;
        actions.loadBody(id).then((found) => alive && setBody(found || { contentHtml: '', fullHtml: '' }));
        return () => {
            alive = false;
        };
    }, [id, article?.full]);

    const html = useMemo(() => {
        if (!article || !body) return '';
        // De un vídeo o un podcast solo vale lo que trae su feed: la página
        // (YouTube, por ejemplo) no es un artículo que se pueda leer.
        const feedText = looksLikeHtml(body.contentHtml) ? cleanHtml(body.contentHtml, article.url) : cleanHtml(plainToHtml(body.contentHtml), article.url);
        // Algunas páginas dejan suelta la fecha en formato de máquina: no se muestra.
        const base = (article.kind ? feedText : body.fullHtml || feedText).replace(/>\s*\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?\s*</g, '><');
        // La traducción no lleva resaltados: están hechos sobre el texto original.
        if (translated && body.esHtml) return localizeImages(body.esHtml, localSrc);
        const localized = localizeImages(applyHighlights(base, article.highlights), localSrc);
        // Ahorro de datos: las fotos que no están en el teléfono esperan a que se toquen.
        return savingData() ? localized.replace(/<img[^>]+src=["'](https:[^"']+)["'][^>]*>/gi, (all, src) => `<button type="button" class="load-img" data-src="${src}">Ver la foto</button>`) : localized;
    }, [article?.id, article?.kind, body, article?.highlights, imgTick, translated]);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => setExpanded(false), [id]);
    const isMedia = Boolean(article?.kind);
    const videoSite = /youtu/.test(article?.url || '') ? 'YouTube' : 'el sitio';

    // Vuelve al punto donde se dejó un artículo a medias. Se repite si el texto
    // completo llega después, mientras el usuario no haya movido la página.
    const savedPos = article?.pos || 0;
    const book = Boolean(settings.reader.paged) && !article?.kind;
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return undefined;
        const frame = requestAnimationFrame(() => {
            // En modo libro se cuentan las páginas en cuanto el texto está puesto.
            if (book) setPages({ n: Math.round(el.scrollLeft / el.clientWidth) + 1, total: Math.max(1, Math.round(el.scrollWidth / el.clientWidth)) });
            if (pos.current.moved || savedPos < 0.05 || savedPos > 0.9) return;
            if (book) {
                const W = el.clientWidth;
                el.scrollLeft = Math.round((savedPos * (el.scrollWidth - W)) / W) * W;
                pos.current.auto = el.scrollLeft;
            } else {
                el.scrollTop = savedPos * (el.scrollHeight - el.clientHeight);
                pos.current.auto = el.scrollTop;
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [id, html, savedPos, book]);

    if (!article) return null;

    const index = list.indexOf(id);
    const next = index >= 0 ? list[index + 1] : null;
    const prev = index > 0 ? list[index - 1] : null;
    const nextArticle = next ? articles.find((a) => a.id === next) : null;
    const reader = settings.reader;

    const paged = Boolean(reader.paged) && !isMedia;
    const onScroll = (e) => {
        const el = e.currentTarget;
        if (paged) {
            const total = Math.max(1, Math.round(el.scrollWidth / el.clientWidth));
            const n = Math.min(total, Math.round(el.scrollLeft / el.clientWidth) + 1);
            setPages({ n, total });
        }
        const max = paged ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
        const at = paged ? el.scrollLeft : el.scrollTop;
        const value = max > 0 ? Math.min(1, at / max) : 1;
        pos.current.value = value;
        if (Math.abs(at - pos.current.auto) > 4) pos.current.moved = true;
        setProgress(value);
    };
    const highlight = () => {
        if (selected.trim().length < 3) return;
        actions.addHighlight(id, selected);
        window.getSelection()?.removeAllRanges();
        setSelected('');
    };
    // Un enlace del texto se intenta leer aquí mismo; si la página no se deja,
    // o no es un artículo, se abre fuera.
    const followLink = (href) => {
        const plan = linkPlan(href, article.url);
        if (plan === 'nada' || opening.current) return;
        if (plan === 'fuera') {
            openExternal(href);
            return;
        }
        opening.current = true;
        actions.toast('Abriendo en Faro…');
        actions
            .openLink(href)
            .then((found) => {
                if (found) {
                    actions.clearToast();
                    onLink(found);
                } else {
                    actions.toast('Esa página no se deja leer aquí: se abre en el navegador');
                    openExternal(href);
                }
            })
            .finally(() => {
                opening.current = false;
            });
    };
    const send = async (format) => {
        setSending(false);
        if (format === 'enlace') {
            shareLink({ title: article.title, url: article.url });
            return;
        }
        const blocks = articleBlocks(html);
        if (!blocks.length) {
            actions.toast('Este artículo no tiene texto que enviar');
            return;
        }
        const data = { title: article.title, source: source?.title, author: article.author, date: article.publishedAt, url: article.url, blocks };
        try {
            if (format === 'txt') {
                await exportFile(`${fileSlug(article.title)}.txt`, articleToText(data));
            } else {
                actions.toast('Preparando el PDF…');
                const { articlePdf } = await import('../ports/pdf.js');
                const pdf = await articlePdf({ ...data, images: format === 'pdf' });
                actions.clearToast();
                await exportBinary(`${fileSlug(article.title)}.pdf`, pdf);
            }
        } catch {
            actions.toast('No se pudo preparar el archivo');
        }
    };
    // Traduce al español dentro del teléfono y guarda el resultado.
    const translate = async () => {
        if (translated) {
            setTranslated(false);
            return;
        }
        if (body.esHtml) {
            setTranslated(true);
            return;
        }
        setTranslating(true);
        try {
            const feedText = looksLikeHtml(body.contentHtml) ? cleanHtml(body.contentHtml, article.url) : cleanHtml(plainToHtml(body.contentHtml), article.url);
            const esHtml = await translateHtml(body.fullHtml || feedText, translateTexts);
            const [esTitle] = await translateTexts([article.title]);
            setBody(await actions.saveTranslation(id, esHtml, esTitle));
            setTranslated(true);
        } catch (err) {
            actions.toast(String(err?.message || err).includes('MODEL') ? 'No se pudo descargar el idioma. La primera vez hace falta conexión.' : 'No se pudo traducir este artículo');
        } finally {
            setTranslating(false);
        }
    };
    // Modo libro: pasar a la página siguiente o a la anterior (y, en la última, a la historia siguiente).
    const turn = (dir) => {
        const el = scrollRef.current;
        if (!el) return;
        const W = el.clientWidth;
        const target = Math.round(el.scrollLeft / W + dir) * W;
        if (target > el.scrollWidth - W + 2) {
            if (next) onNavigate(next);
            return;
        }
        if (target < 0) {
            if (prev) onNavigate(prev);
            return;
        }
        el.scrollTo({ left: target, behavior: 'smooth' });
    };
    const onPageTap = (e) => {
        if (!paged || selected || e.target.closest?.('a, button, mark, input, textarea, iframe')) return;
        const box = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width;
        if (x < 0.3) turn(-1);
        else if (x > 0.7) turn(1);
    };
    const onProseClick = (e) => {
        const photo = e.target.closest?.('.load-img');
        if (photo) {
            const img = document.createElement('img');
            img.src = photo.getAttribute('data-src');
            img.alt = '';
            photo.replaceWith(img);
            return;
        }
        const link = e.target.closest?.('a[href]');
        if (link) {
            e.preventDefault();
            const href = resolveUrl(link.getAttribute('href'), article.url);
            if (href) followLink(href);
            return;
        }
        const mark = e.target.closest?.('mark[data-h]');
        const found = mark && (article.highlights || []).find((h) => h.id === mark.getAttribute('data-h'));
        if (found) setEditing(found);
    };

    // Deslizar de lado pasa a la historia siguiente o a la anterior.
    const onTouchStart = (e) => {
        const wide = e.target.closest?.('pre, table');
        touch.current = wide ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = (e) => {
        const start = touch.current;
        touch.current = null;
        if (!start || selected) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 2) return;
        if (paged) {
            turn(dx < 0 ? 1 : -1);
            return;
        }
        const target = dx < 0 ? next : prev;
        if (target) {
            tap();
            onNavigate(target);
        }
    };
    const askPeople = async () => {
        setTalk('cargando');
        try {
            setTalk(await whoTalks(article.url));
        } catch {
            setTalk({ threads: [], comments: [], reddit: 'bloqueado', redditSearch: `https://www.reddit.com/search/?q=${encodeURIComponent(article.url)}` });
        }
    };

    const meta = [agoLabel(article.publishedAt || article.fetchedAt), article.kind ? lengthLabel(article) : `${article.minutes} min de lectura`].filter(Boolean).join(' · ');
    // La foto del artículo abre el texto, salvo que el texto ya empiece con una.
    const hero = !isMedia && article.image && html && !/<img/i.test(html.slice(0, 1500));
    const timeline = useMemo(() => (article && !article.kind ? storyTimeline(article, articles) : []), [article?.id, articles]);
    // Una selección de una a cinco palabras parece un nombre o un término.
    const short = selected.trim().length >= 3 && selected.trim().length <= 60 && selected.trim().split(/\s+/).length <= 5;
    const english = canTranslate && !isMedia && Boolean(body) && looksEnglish(`${article.title}. ${article.summary || ''}`);
    const tags = article.tags || [];

    return (
        <div className="reader" data-theme={reader.theme} data-font={reader.font} data-margin={reader.margin} data-spacing={reader.spacing || 'normal'} data-contrast={reader.contrast ? 'si' : 'no'}>
            <div className="reader-bar">
                <div style={{ width: `${progress * 100}%` }} />
            </div>

            <div className="reader-top">
                <button type="button" className="round" aria-label="Volver" onClick={onClose}>
                    <Icon name="atras" size={22} strokeWidth={2} />
                </button>
                <span className="sub-s">
                    {paged && pages.total > 1 ? `Página ${pages.n} de ${pages.total}` : typeof linked === 'string' ? linked : linked ? 'Abierto desde un enlace' : index >= 0 && list.length > 1 ? `${index + 1} de ${list.length} en ${origin}` : ''}
                </span>
                <button type="button" className="round" aria-label="Opciones de lectura" onClick={() => setOptions(true)}>
                    Aa
                </button>
                <a className="round" aria-label="Abrir en el sitio original" href={article.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="abrir" size={20} strokeWidth={1.8} />
                </a>
            </div>

            <div className={`reader-scroll${paged ? ' paged' : ''}`} ref={scrollRef} onScroll={onScroll} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={onPageTap} key={`${id}${paged ? 'p' : ''}`}>
                <div className="story-meta">
                    <Monogram source={source} size={16} />
                    <span>
                        <b>{source?.title}</b> · {meta}
                    </span>
                </div>

                <h1 className="reader-title">{translated && body?.esTitle ? body.esTitle : article.title}</h1>
                {(article.author || (article.saved && article.archived)) && (
                    <p className="reader-by">{[article.author ? `Por ${article.author}` : '', article.saved && article.archived ? 'Copia guardada en tu teléfono' : ''].filter(Boolean).join(' · ')}</p>
                )}

                {(
                    <div className="reader-chips">
                        {english && (
                            <button type="button" className="tab-chip" aria-pressed={translated} disabled={translating} onClick={translate}>
                                {translating ? 'Traduciendo…' : translated ? 'Ver el original' : 'Traducir al español'}
                            </button>
                        )}
                        {article.saved && (
                            <button type="button" className="tab-chip" onClick={() => actions.openTags(id)}>
                                {tags.length ? tags.map((t) => `#${t}`).join(' ') : '+ Etiqueta'}
                            </button>
                        )}
                        <button type="button" className="tab-chip" aria-pressed={Boolean(article.note)} onClick={() => setNoting(true)}>
                            {article.note ? 'Tu nota' : '+ Nota'}
                        </button>
                    </div>
                )}
                {translated && <p className="hint reader-note">Traducción automática hecha en tu teléfono. Puede tener errores.</p>}

                {hero && <Thumb src={article.image} className="reader-hero" />}

                {article.kind === 'video' && youtubeId(article.url) && (
                    <>
                        {/* El vídeo se ve aquí, con el reproductor de YouTube en su modo de privacidad. */}
                        {videoOn ? (
                            <div className="video embed">
                                <iframe src={`${youtubeEmbed(youtubeId(article.url))}&autoplay=1`} title={article.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                            </div>
                        ) : (
                            <button type="button" className="video" onClick={() => setVideoOn(true)} aria-label="Ver el vídeo aquí">
                                <Thumb src={article.image} className="video-img" />
                                <span className="video-play">
                                    <Icon name="play" size={30} filled />
                                </span>
                            </button>
                        )}
                        <div className="video-actions">
                            {!videoOn && (
                                <button type="button" className="btn-lamp" onClick={() => setVideoOn(true)}>
                                    <Icon name="play" size={18} filled />
                                    Ver aquí
                                </button>
                            )}
                            <a className="btn-ghost" href={article.url} target="_blank" rel="noopener noreferrer">
                                Abrir en YouTube
                            </a>
                        </div>
                        {videoOn && <p className="hint">Si el vídeo no se reproduce aquí, su canal no lo permite fuera de YouTube: ábrelo en YouTube.</p>}
                    </>
                )}
                {article.kind === 'video' && !youtubeId(article.url) && (
                    <>
                        <a className="video" href={article.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver el vídeo en ${videoSite}`}>
                            <Thumb src={article.image} className="video-img" />
                            <span className="video-play">
                                <Icon name="play" size={30} filled />
                            </span>
                        </a>
                        <a className="btn-lamp btn-big" href={article.url} target="_blank" rel="noopener noreferrer">
                            <Icon name="play" size={18} filled />
                            Ver en {videoSite}
                        </a>
                    </>
                )}
                {article.kind === 'audio' && (
                    <div className="audio">
                        <Thumb src={article.image} className="audio-img" />
                        <div className="audio-actions">
                            <button type="button" className="btn-lamp" onClick={() => player.play(id)}>
                                <Icon name={playing.current === id && playing.playing ? 'pausa' : 'play'} size={18} filled />
                                {playing.current === id && playing.playing ? 'Pausar' : article.audioPos > 5 || (playing.current === id && playing.time > 5) ? 'Seguir escuchando' : 'Escuchar'}
                            </button>
                            {playing.current !== id && (
                                <button type="button" className="btn-ghost" onClick={() => actions.toast(player.enqueue(id) ? 'Añadido a la cola' : 'Ya estaba en la cola')}>
                                    A la cola
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {isMedia && html && <h2 className="label">{article.kind === 'video' ? 'Descripción del vídeo' : 'Sobre este episodio'}</h2>}

                {!body ? null : html ? (
                    <div className={`prose${isMedia ? ' prose-desc' : ''}${isMedia && !expanded ? ' clamp' : ''}`} ref={proseRef} onClick={onProseClick} style={{ fontSize: `${19 * settings.fontScale}px` }} dangerouslySetInnerHTML={{ __html: html }} />
                ) : isMedia ? null : (
                    <p className="empty-note">Este sitio solo publica el titular. Ábrelo en el sitio original para leerlo completo.</p>
                )}
                {/* La descripción de un vídeo suele ser larga y llena de enlaces: se muestra el principio. */}
                {isMedia && html && !expanded && html.length > 700 && (
                    <button type="button" className="btn-ghost" onClick={() => setExpanded(true)}>
                        Ver la descripción completa
                    </button>
                )}

                {/* Lo que tus fuentes publicaron antes sobre lo mismo. */}
                {body && timeline.length > 0 && (
                    <section className="history">
                        <h2 className="label">Cómo llegamos aquí</h2>
                        <ol className="tl-list">
                            <li className="now">
                                <span className="sub-s">{agoLabel(article.publishedAt || article.fetchedAt) || 'Ahora'}</span>
                                <span className="tl-title">Esta noticia</span>
                            </li>
                            {timeline.map((past) => (
                                <li key={past.id}>
                                    <button type="button" onClick={() => onLink(past.id)}>
                                        <span className="sub-s">
                                            {agoLabel(past.publishedAt || past.fetchedAt)} · {sources.find((s) => s.id === past.sourceId)?.title || past.site}
                                        </span>
                                        <span className="tl-title">{past.title}</span>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}

                {/* Qué se comenta de este artículo en Hacker News y Reddit, solo si se pide. */}
                {body && !isMedia && (
                    <section className="people">
                        <h2 className="label">Qué dice la gente</h2>
                        {talk === null && (
                            <button type="button" className="btn-ghost" onClick={askPeople}>
                                Buscar comentarios en Reddit y Hacker News
                            </button>
                        )}
                        {talk === 'cargando' && <p className="hint">Buscando…</p>}
                        {talk && talk !== 'cargando' && (
                            <>
                                {talk.threads.length === 0 && <p className="hint">No encontramos a nadie comentando este artículo{talk.reddit === 'bloqueado' ? ' en Hacker News, y Reddit no respondió.' : '.'}</p>}
                                {talk.threads.slice(0, 4).map((t) => (
                                    <a key={`${t.where}${t.id}`} className="thread" href={t.url} target="_blank" rel="noopener noreferrer">
                                        <b>{t.where}</b>
                                        <span>
                                            {t.comments} {t.comments === 1 ? 'comentario' : 'comentarios'} · {t.points} puntos
                                        </span>
                                    </a>
                                ))}
                                {talk.comments.map((c, i) => (
                                    <blockquote key={i} className="comment">
                                        <p>{c.text}</p>
                                        <span>{c.author} en Hacker News</span>
                                    </blockquote>
                                ))}
                                {talk.reddit === 'bloqueado' && (
                                    <a className="link-btn" href={talk.redditSearch} target="_blank" rel="noopener noreferrer">
                                        Buscarlo en Reddit
                                    </a>
                                )}
                            </>
                        )}
                    </section>
                )}

                {/* Lectura continua: al terminar, la siguiente historia espera aquí. */}
                {body && nextArticle && (
                    <button type="button" className="next-up" onClick={() => onNavigate(next)}>
                        <span className="label">A continuación</span>
                        <span className="story-title">{nextArticle.title}</span>
                        <span className="sub-s">
                            {sources.find((s) => s.id === nextArticle.sourceId)?.title || nextArticle.site} · {lengthLabel(nextArticle)}
                        </span>
                    </button>
                )}
            </div>

            <div className="reader-tools">
                <button type="button" className="ract" aria-label="Guardar para luego" aria-pressed={article.saved} onClick={() => actions.toggleSaved(id, { silent: true })}>
                    <Icon name="guardado" strokeWidth={1.8} filled={article.saved} />
                </button>
                {/* pointerdown y no click: al tocar fuera, Android suelta la selección antes del click. */}
                <button
                    type="button"
                    className={`ract${selected ? ' live' : ''}`}
                    aria-label="Resaltar el texto seleccionado"
                    onPointerDown={(e) => {
                        if (!selected) return;
                        e.preventDefault();
                        highlight();
                    }}
                    onClick={() => (selected ? highlight() : actions.toast('Selecciona un texto del artículo para resaltarlo'))}
                >
                    <Icon name="resaltar" size={selected ? 18 : 22} strokeWidth={1.8} />
                    {selected && 'Resaltar'}
                </button>
                {/* Un nombre o un término corto seleccionado: se puede buscar en Wikipedia. */}
                {short && (
                    <button
                        type="button"
                        className="ract live"
                        onPointerDown={(e) => {
                            e.preventDefault();
                            setLookup(selected.trim());
                        }}
                        onClick={() => setLookup(selected.trim())}
                    >
                        ¿Quién es?
                    </button>
                )}
                <button type="button" className="ract" aria-label="Enviar" onClick={() => setSending(true)}>
                    <Icon name="compartir" strokeWidth={1.8} />
                </button>
                {next ? (
                    <button type="button" className="reader-next" onClick={() => onNavigate(next)}>
                        Siguiente
                        <Icon name="siguiente" size={18} />
                    </button>
                ) : (
                    <button type="button" className="reader-next" onClick={onClose}>
                        {linked ? 'Volver' : 'Listo'}
                    </button>
                )}
            </div>

            {sending && <SendSheet onPick={send} onClose={() => setSending(false)} />}
            {lookup && <WikiSheet term={lookup} onClose={() => setLookup('')} />}
            {noting && <NoteSheet article={article} onClose={() => setNoting(false)} />}
            {editing && (
                <HighlightSheet
                    articleId={id}
                    highlight={editing}
                    onClose={() => setEditing(null)}
                    onShare={() => {
                        setQuoting(editing);
                        setEditing(null);
                    }}
                />
            )}
            {quoting && <QuoteSheet text={quoting.text} title={article.title} source={source?.title} onClose={() => setQuoting(null)} />}
            {options && (
                <Sheet title="Lectura" subtitle="Se aplica a todos los artículos." onClose={() => setOptions(false)}>
                    <ReadingOptions />
                </Sheet>
            )}
        </div>
    );
}
