// Crea el keystore de firma y su fichero de credenciales.
//
//   pnpm keystore
//
// El keystore se genera **en tu máquina** y nunca entra al repositorio: tanto el
// .jks como keystore.properties están en .gitignore. La contraseña se genera al
// azar y se escribe solo en ese fichero: no se imprime por pantalla, para que
// no acabe en un historial de terminal ni en un log.
//
// AVISO IMPORTANTE: haz una copia de seguridad del .jks y de keystore.properties
// fuera del proyecto. Sin ellos no se puede publicar una actualización de la
// app: Android solo acepta actualizar con la misma firma.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ANDROID = resolve(HERE, '..', 'android');
const KEYSTORE = resolve(ANDROID, 'faro-release.jks');
const PROPERTIES = resolve(ANDROID, 'keystore.properties');
const ALIAS = 'faro';

if (existsSync(KEYSTORE)) {
    console.log(`El keystore ya existe: ${KEYSTORE}`);
    console.log('Si de verdad quieres uno nuevo, muévelo o bórralo primero.');
    console.log('Ojo: cambiar de clave impide actualizar una app ya instalada.');
    process.exit(0);
}

// 32 bytes en base64url: suficiente entropía y sin caracteres que compliquen
// el escapado en Gradle o en la línea de comandos.
const password = randomBytes(32).toString('base64url');

// keytool viene con el JDK. Si no está en el PATH se usa el de JAVA_HOME.
const keytool = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';

console.log('Generando el keystore de firma…');

try {
    execFileSync(
        existsSync(keytool) ? keytool : 'keytool',
        [
            '-genkeypair',
            '-keystore', KEYSTORE,
            '-alias', ALIAS,
            '-keyalg', 'RSA',
            '-keysize', '4096',
            // 10 000 días: Play exige que el certificado siga siendo válido
            // hasta bien pasado 2033.
            '-validity', '10000',
            '-storepass', password,
            '-keypass', password,
            '-dname', 'CN=Faro, OU=Faro, O=Faro, L=Unknown, ST=Unknown, C=ES',
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] }
    );
} catch {
    console.error('\nNo se pudo ejecutar keytool.');
    console.error('Viene con el JDK: comprueba que está en el PATH (java -version) o que JAVA_HOME apunta a un JDK.');
    process.exit(1);
}

writeFileSync(
    PROPERTIES,
    [
        '# Credenciales de firma. NO subir a ningún repositorio.',
        '# Generado por scripts/create-keystore.mjs',
        `storeFile=${KEYSTORE.replace(/\\/g, '/')}`,
        `storePassword=${password}`,
        `keyAlias=${ALIAS}`,
        `keyPassword=${password}`,
        '',
    ].join('\n'),
    'utf8'
);

console.log(`
Listo.

  Keystore     ${KEYSTORE}
  Credenciales ${PROPERTIES}

La contraseña se ha generado al azar y está escrita en keystore.properties.
Guarda una copia de los dos ficheros fuera del proyecto.
`);
