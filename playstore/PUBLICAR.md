# Publicar Faro en Google Play

Guía para subir la primera beta. Lo que ya está hecho va marcado; lo demás solo puedes hacerlo tú, desde tu cuenta.

## Lo que ya está preparado

- [x] **Archivo para subir**: `Release/Faro-<versión>/Faro-<versión>.aab`, firmado. Se genera con `pnpm release`.
- [x] **Identificador**: `com.faronews.app`. No se puede cambiar después de la primera subida.
- [x] **Versión**: sale de `package.json` (0.8.1 → código 801).
- [x] **Android de destino**: API 36 (Android 16).
- [x] **Icono, gráfico de funciones y 8 capturas**: en esta carpeta. Se regeneran con `pnpm playstore`.
- [x] **Textos de la ficha**: `ficha.md`.
- [x] **Política de privacidad**: `privacidad.html`, que se publica en https://xsharklinx.github.io/FaroNews/privacidad.html (ver «Lo que vive en GitHub Pages»).

## Antes de nada: copia de la clave de firma

`android/faro-release.jks` y `android/keystore.properties` solo existen en este ordenador y no están en git. Guarda una copia de los dos fuera de él (un gestor de contraseñas, un disco aparte). Al crear la app, acepta la **firma de aplicaciones de Play**: así Google guarda la clave definitiva y la tuya queda como «clave de subida», que se puede reponer si se pierde.

## Pasos en Play Console

1. **Cuenta de desarrollador** en https://play.google.com/console (pago único de 25 USD y verificación de identidad).
2. **Crear app**: nombre «Faro: lector de noticias», idioma español, tipo App, Gratis.
3. **Política de privacidad**: pega https://xsharklinx.github.io/FaroNews/privacidad.html en *Contenido de la app → Política de privacidad*. Antes comprueba que la dirección abre.
4. **Contenido de la app** (cuestionarios):
   - *Acceso a la app*: todas las funciones están disponibles sin credenciales.
   - *Anuncios*: no contiene anuncios.
   - *Clasificación de contenido*: categoría «Noticias»; la app muestra contenido de terceros elegido por el usuario.
   - *Público objetivo*: mayores de 13 años.
   - *Apps de noticias*: Faro es un lector/agregador, no un editor. Muestra el nombre de cada fuente y enlaza al original.
   - *Seguridad de los datos*: no recopila ni comparte datos. Lo que el usuario guarda queda en el dispositivo.
   - *Servicio en primer plano*: Play pregunta por el tipo «reproducción multimedia». Respuesta: reproduce podcasts con la pantalla apagada y muestra los controles en la notificación. Suele pedir un vídeo corto que lo enseñe.
   - *Permisos*: Internet, notificaciones y el servicio en primer plano de reproducción.
5. **Ficha de Play Store**: copia los textos de `ficha.md` y sube `icono-512.png`, `grafico-1024x500.png` y las capturas de `capturas/`.
6. **Prueba interna** (*Pruebas → Prueba interna → Crear versión*): sube el `.aab`, añade tu correo como tester y publica. Suele estar disponible en minutos y no pasa revisión completa: es la vía para las betas.
7. **Prueba cerrada**: si tu cuenta es personal y nueva, Google pide una prueba cerrada con al menos 12 testers durante 14 días antes de dejar publicar en producción.
8. **Producción**: cuando la prueba cerrada cumpla el requisito, promueve la versión.

## Lo que vive en GitHub Pages

El flujo `.github/workflows/catalogo.yml` publica, cada vez que subes cambios a `main`:

- La política de privacidad: https://xsharklinx.github.io/FaroNews/privacidad.html
- El catálogo que la app consulta cada semana: https://xsharklinx.github.io/FaroNews/catalog.json

Para que funcione, una sola vez: en el repositorio de GitHub, **Settings → Pages → Source: «GitHub Actions»**. Después, cualquier subida a `main` lo publica (o se lanza a mano desde la pestaña Actions).

## Cada beta nueva

1. Sube la versión en `package.json` (Google no acepta repetir número).
2. `pnpm release`
3. Sube `Release/Faro-<versión>/Faro-<versión>.aab` a la pista de pruebas.

## Cosas a tener presentes

- **Quien ya tenga Faro instalada a mano** (APK de `Release/`) no podrá actualizar desde Play: la firma de Play es distinta. Tendrá que desinstalar e instalar desde la tienda; conviene guardar antes una copia desde Ajustes → Copia de seguridad.
- **Las capturas muestran titulares, fotos y logos de medios reales.** Es lo habitual en lectores de noticias, pero si Google o un medio lo objeta, se pueden regenerar eligiendo otros sitios en `scripts/playstore.mjs`.
- **El catálogo incluye logos de terceros** dentro de la app, con el mismo criterio.
- **Requisito de API de destino**: Google lo sube cada año, normalmente en agosto. Si Play Console rechaza el archivo por eso, hay que subir `targetSdkVersion` en `android/variables.gradle`.
