// Qué red está usando el teléfono, para el ahorro de datos. El WebView de
// Android cuenta si la conexión es móvil o si el sistema pidió ahorrar datos.

let saverOn = true;

export function setDataSaver(on) {
    saverOn = on;
}

// ¿Hay que ahorrar ahora? Solo con datos móviles (o con el ahorro de Android
// activado) y con la opción encendida. Si el teléfono no lo dice, no se ahorra.
export function savingData() {
    if (!saverOn) return false;
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    if (!conn) return false;
    return conn.saveData === true || conn.type === 'cellular';
}

export function onNetworkChange(callback) {
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    if (!conn?.addEventListener) return () => {};
    conn.addEventListener('change', callback);
    return () => conn.removeEventListener('change', callback);
}
