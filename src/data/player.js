// Reproductor de podcasts: un único audio para toda la app, con cola y
// velocidad, que sigue sonando al cambiar de pantalla.

import { useSyncExternalStore } from 'react';
import { actions, getState } from './store.js';

const KEY = 'faro-reproductor';
export const RATES = [1, 1.25, 1.5, 2];
const audio = typeof Audio !== 'undefined' ? new Audio() : null;
if (audio) audio.preload = 'none';

let state = { queue: [], current: null, playing: false, time: 0, duration: 0, rate: 1, open: false };
const listeners = new Set();

try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) state = { ...state, queue: saved.queue || [], current: saved.current || null, rate: saved.rate || 1 };
} catch {
    // Sin almacenamiento: se empieza con la cola vacía.
}

function set(patch) {
    state = { ...state, ...patch };
    try {
        localStorage.setItem(KEY, JSON.stringify({ queue: state.queue, current: state.current, rate: state.rate }));
    } catch {
        // No es grave: la cola no sobrevivirá al cierre.
    }
    for (const fn of listeners) fn();
}
const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
export const usePlayer = () => useSyncExternalStore(subscribe, () => state);

const articleOf = (id) => getState().articles.find((a) => a.id === id);
const sourceTitle = (article) => getState().sources.find((s) => s.id === article?.sourceId)?.title || '';

// Guarda por dónde va el episodio, para retomarlo otro día.
let lastSaved = 0;
function remember(force = false) {
    if (!state.current || !audio) return;
    if (!force && Math.abs(audio.currentTime - lastSaved) < 10) return;
    lastSaved = audio.currentTime;
    actions.setAudioPosition(state.current, audio.currentTime);
}

function describe(article) {
    if (!('mediaSession' in navigator) || !article) return;
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: article.title,
            artist: sourceTitle(article),
            artwork: article.image ? [{ src: article.image }] : [],
        });
    } catch {
        // El sistema no admite metadatos: se reproduce igual.
    }
}

function load(id, autoplay) {
    const article = articleOf(id);
    if (!audio || !article?.audio) return;
    remember(true);
    audio.src = article.audio;
    audio.playbackRate = state.rate;
    const resumeAt = article.audioPos || 0;
    audio.onloadedmetadata = () => {
        if (resumeAt > 5 && resumeAt < audio.duration - 15) audio.currentTime = resumeAt;
        set({ duration: audio.duration || 0 });
        // Muchos feeds no dicen cuánto dura el episodio: se apunta al cargarlo.
        if (!article.duration && Number.isFinite(audio.duration)) actions.setAudioDuration(id, audio.duration);
    };
    set({ current: id, time: resumeAt, duration: 0 });
    describe(article);
    if (autoplay) audio.play().catch(() => set({ playing: false }));
}

export const player = {
    // Reproduce ya este episodio; lo pone el primero de la cola.
    play(id) {
        if (state.current === id) {
            player.toggle();
            return;
        }
        set({ queue: [id, ...state.queue.filter((q) => q !== id)] });
        load(id, true);
    },
    enqueue(id) {
        if (state.queue.includes(id)) return false;
        set({ queue: [...state.queue, id] });
        if (!state.current) load(id, false);
        return true;
    },
    toggle() {
        if (!audio || !state.current) return;
        if (!audio.src) load(state.current, true);
        else if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
    },
    seek(seconds) {
        if (!audio || !Number.isFinite(seconds)) return;
        audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
        set({ time: audio.currentTime });
    },
    skip(delta) {
        if (audio) player.seek(audio.currentTime + delta);
    },
    setRate(rate) {
        if (audio) audio.playbackRate = rate;
        set({ rate });
    },
    next() {
        const index = state.queue.indexOf(state.current);
        const queue = state.queue.filter((q) => q !== state.current);
        const following = queue[Math.min(index, queue.length - 1)] || null;
        set({ queue });
        if (following) load(following, true);
        else player.stop();
    },
    remove(id) {
        if (id === state.current) {
            player.next();
            return;
        }
        set({ queue: state.queue.filter((q) => q !== id) });
    },
    // Sube un episodio un puesto en la cola.
    moveUp(id) {
        const i = state.queue.indexOf(id);
        if (i < 1) return;
        const queue = [...state.queue];
        [queue[i - 1], queue[i]] = [queue[i], queue[i - 1]];
        set({ queue });
    },
    stop() {
        remember(true);
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
        }
        set({ queue: [], current: null, playing: false, time: 0, duration: 0, open: false });
    },
    setOpen(open) {
        set({ open });
    },
};

if (audio) {
    audio.addEventListener('play', () => set({ playing: true }));
    audio.addEventListener('pause', () => {
        remember(true);
        set({ playing: false });
    });
    audio.addEventListener('timeupdate', () => {
        remember();
        set({ time: audio.currentTime, duration: audio.duration || state.duration });
    });
    audio.addEventListener('ended', () => {
        const done = state.current;
        actions.setAudioPosition(done, 0);
        actions.open(done); // Escuchado entero: cuenta como leído.
        player.next();
    });
    audio.addEventListener('error', () => {
        if (state.current && audio.src) actions.toast('No se pudo reproducir ese episodio. Revisa la conexión.');
        set({ playing: false });
    });
    if ('mediaSession' in navigator) {
        const handle = (name, fn) => {
            try {
                navigator.mediaSession.setActionHandler(name, fn);
            } catch {
                // Acción no disponible en este sistema.
            }
        };
        handle('play', () => player.toggle());
        handle('pause', () => player.toggle());
        handle('seekbackward', () => player.skip(-15));
        handle('seekforward', () => player.skip(30));
        handle('nexttrack', () => player.next());
    }
}

export function clock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
