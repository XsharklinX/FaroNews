// Lo que pasa fuera de la app: el vigilante de avisos (nativo, WorkManager),
// el aviso diario, los avisos que el usuario toca y lo que otras apps comparten.
// Fuera de Android todo esto no hace nada.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { watcherConfig } from '../core/notify.js';

const Native = registerPlugin('FaroBackground');
const DAILY_ID = 1;

export const canNotify = Capacitor.isNativePlatform();

export async function askPermission() {
    if (!canNotify) return false;
    try {
        const res = await LocalNotifications.requestPermissions();
        return res.display === 'granted';
    } catch {
        return false;
    }
}

// Si Android deja avisar, y cuándo y con qué resultado fue la última revisión.
export async function notifyStatus() {
    if (!canNotify) return { allowed: false, lastRun: 0, lastSent: 0, totalSent: 0 };
    try {
        return await Native.status();
    } catch {
        return { allowed: false, lastRun: 0, lastSent: 0, totalSent: 0 };
    }
}

// Lo que Faro ha avisado últimamente: [{ heading, title, url, feed, at }].
export async function notifyHistory() {
    if (!canNotify) return [];
    try {
        return (await Native.history()).history || [];
    } catch {
        return [];
    }
}

export function openNotifySettings() {
    if (canNotify) Native.openSettings().catch(() => {});
}

export function sendTestNotification() {
    if (canNotify) Native.test().catch(() => {});
}

// Le dice al vigilante qué revisar, cada cuánto y cuándo callar.
export function syncWatcher({ sources, settings }) {
    if (!canNotify) return;
    Native.configure(watcherConfig(sources, settings)).catch(() => {});
}

// Lo que la app ya trajo no debe volver como aviso.
export function markSeen(url, links) {
    if (!canNotify) return;
    Native.markSeen({ url, links }).catch(() => {});
}

export async function syncDaily(settings) {
    if (!canNotify) return;
    try {
        await LocalNotifications.cancel({ notifications: [{ id: DAILY_ID }] });
        if (!settings.dailyOn) return;
        const [hour, minute] = String(settings.dailyTime || '07:30').split(':').map(Number);
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: DAILY_ID,
                    title: 'Hoy está listo',
                    body: 'Tu selección del día te espera en Faro.',
                    schedule: { on: { hour, minute }, allowWhileIdle: true },
                },
            ],
        });
    } catch {
        // Sin permiso de avisos no hay nada que programar.
    }
}

// Escucha un evento nativo y recoge también lo que llegó antes de que la app
// estuviera lista (por ejemplo, el aviso que la abrió).
function listen(event, consume, callback) {
    if (!canNotify) return () => {};
    const deliver = () => consume().then((value) => value && callback(value)).catch(() => {});
    deliver();
    const handle = Native.addListener(event, deliver);
    return () => handle.then((h) => h.remove());
}

// Texto que otra app compartió con Faro.
export const onShared = (callback) => listen('shared', () => Native.consumeShared().then((res) => res?.text), callback);

// Acceso directo del icono (pulsación larga): 'hoy', 'guardado', 'buscar' o 'anadir'.
export const onShortcut = (callback) => listen('shortcut', () => Native.consumeShortcut().then((res) => res?.go), callback);

// Aviso que el usuario tocó: { url, feed }. Sin url = abrir las novedades del sitio.
export const onNotificationOpen = (callback) => listen('opened', () => Native.consumeOpen().then((res) => res?.open), callback);

// Noticias guardadas desde un aviso con la app cerrada: [{ url, feed }].
export async function takeSavedFromNotifications() {
    if (!canNotify) return [];
    try {
        return (await Native.consumeSaves()).saves || [];
    } catch {
        return [];
    }
}

export function runWatcherNow() {
    if (canNotify) Native.runNow().catch(() => {});
}

// Lo que el usuario toca en la notificación del podcast: 'toggle', 'back',
// 'forward' o 'stop'.
export function onMedia(callback) {
    if (!canNotify) return () => {};
    const handle = Native.addListener('media', (data) => callback(data?.action));
    return () => handle.then((h) => h.remove());
}

// Dice a Android qué está sonando, para que no cierre la app con la pantalla
// apagada y ponga los controles en la notificación. Sin `info`, deja de sonar.
export function syncPlayback(info) {
    if (!canNotify) return;
    (info ? Native.playback(info) : Native.playbackStop()).catch(() => {});
}

// Barras de estado y de navegación del color de la pantalla que hay debajo.
export function setBars(color, dark) {
    if (canNotify) Native.setBars({ color, dark }).catch(() => {});
}

export async function deviceInfo() {
    if (!canNotify) return { model: 'navegador', android: '' };
    try {
        return await Native.device();
    } catch {
        return { model: '', android: '' };
    }
}

// Traducción inglés → español hecha en el teléfono. La primera vez descarga
// el idioma; si no puede, lanza un error con el mensaje 'MODEL'.
export const canTranslate = canNotify;
export async function translateTexts(texts) {
    return (await Native.translate({ texts })).texts;
}
