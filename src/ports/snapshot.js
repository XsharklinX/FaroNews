// Copia automática de lo que no se puede volver a descargar (fuentes, temas,
// ajustes, guardados y resaltados), en un archivo propio de la app.
//
// Por qué existe: los datos viven en IndexedDB, dentro del WebView. Si Android
// mata la app en mitad de una escritura (pasa al instalar una actualización),
// el WebView puede encontrar esa base de datos corrupta y borrarla entera. Este
// archivo queda fuera de su alcance y permite recuperarlo todo al arrancar.

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const native = Capacitor.isNativePlatform();
const FILE = 'faro-datos.json';
const TEMP = 'faro-datos.nuevo.json';
const where = { directory: Directory.Data };

// Se escribe aparte y se renombra: si la app muere a mitad, la copia anterior
// sigue entera.
export async function saveSnapshot(text) {
    if (!native) return;
    await Filesystem.writeFile({ ...where, path: TEMP, data: text, encoding: Encoding.UTF8 });
    await Filesystem.deleteFile({ ...where, path: FILE }).catch(() => {});
    await Filesystem.rename({ from: TEMP, to: FILE, directory: Directory.Data, toDirectory: Directory.Data });
}

// Copia en Documentos/Faro: una carpeta del teléfono que sobrevive a
// desinstalar la app y que el usuario puede ver, copiar o subir a la nube.
export const EXTERNAL_PATH = 'Faro/faro-copia.json';

export async function saveExternalCopy(text) {
    if (!native) return false;
    try {
        await Filesystem.writeFile({ directory: Directory.Documents, path: EXTERNAL_PATH, data: text, encoding: Encoding.UTF8, recursive: true });
        return true;
    } catch {
        return false;
    }
}

export async function loadSnapshot() {
    if (!native) return '';
    for (const path of [FILE, TEMP]) {
        try {
            const { data } = await Filesystem.readFile({ ...where, path, encoding: Encoding.UTF8 });
            if (data) return data;
        } catch {
            // No existe: se prueba el siguiente.
        }
    }
    return '';
}
