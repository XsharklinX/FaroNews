// Compila Faro y deja lo que se instala o se sube en Release/, a la vista:
//
//   Release/Faro-0.7.0/Faro-0.7.0.aab          para subir a Google Play
//   Release/Faro-0.7.0/Faro-0.7.0.apk          firmado, para instalar a mano
//   Release/Faro-0.7.0/Faro-0.7.0-debug.apk    de depuración
//
//   pnpm release            compila todo
//   pnpm release --no-debug sin el APK de depuración
//
// La versión sale de package.json. Google Play no admite subir dos veces el
// mismo número: hay que subirlo antes de cada envío.

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(ROOT, 'android');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const withDebug = !process.argv.includes('--no-debug');
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' });

if (!existsSync(join(ANDROID, 'keystore.properties'))) {
    console.error('Falta android/keystore.properties: sin firma, Google Play no acepta el archivo. Créalo con `pnpm keystore`.');
    process.exit(1);
}

console.log(`\nFaro ${version}: compilando…\n`);
run('pnpm build');
run('pnpm exec cap sync android');
const gradle = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(`${gradle} bundleRelease assembleRelease${withDebug ? ' assembleDebug' : ''} -q`, ANDROID);

const out = join(ROOT, 'Release', `Faro-${version}`);
mkdirSync(out, { recursive: true });
const built = join(ANDROID, 'app', 'build', 'outputs');
const files = [
    [join(built, 'bundle', 'release', 'app-release.aab'), `Faro-${version}.aab`, 'para subir a Google Play'],
    [join(built, 'apk', 'release', 'app-release.apk'), `Faro-${version}.apk`, 'firmado, para instalar a mano'],
    ...(withDebug ? [[join(built, 'apk', 'debug', 'app-debug.apk'), `Faro-${version}-debug.apk`, 'de depuración']] : []),
];

console.log(`\nListo en Release/Faro-${version}/`);
for (const [from, name, what] of files) {
    copyFileSync(from, join(out, name));
    console.log(`  ${name.padEnd(28)} ${(statSync(from).size / 1048576).toFixed(1).padStart(5)} MB  ${what}`);
}
