# Faro: plan por fases

Faro vigila los sitios que le importan al usuario y cada día le entrega una
lista corta y terminable de lo que vale la pena leer. Todo vive en el teléfono:
sin cuenta y sin servidor.

Este plan parte de la versión 0.2.1. Cada fase termina en una versión que se
puede usar a diario; el orden busca que lo que más se nota llegue antes y que
nada dependa de algo que todavía no existe.

## Dónde estamos (0.2.1)

Hecho y funcionando:

- Añadir sitios por dirección, catálogo de 101 sitios por tema y país, OPML.
- Hoy como portada con secciones, edición de tarde y motivo de cada elección.
- Temas (seguir un asunto en todas las fuentes), silencios y niveles por fuente.
- Aprendizaje de hábitos por fuente, nivel automático para sitios muy activos.
- Lector limpio con opciones de lectura, resaltados con notas y exportación.
- Buscador, guardados, deshacer, menú de historia, comparar cobertura.
- Avisos de temas con la app cerrada y aviso diario.

Deuda conocida, que la fase 3 ataca primero:

- Tirar para actualizar, deslizar en el lector y la vibración no se han probado
  en un teléfono.
- No hay copia de seguridad: si se desinstala la app se pierde todo.
- El buscador solo mira título y resumen, no el texto completo.
- Las imágenes no se guardan para leer sin conexión, solo el texto.
- Sin firma de publicación: solo existe el APK de depuración.
- Todo el código está sin commit, en una rama de otro proyecto.

## Fase 3 · Confianza (0.3)

Que se pueda depender de Faro sin miedo a perder nada ni a que falle.

- **Copia de seguridad.** Exportar e importar un archivo con fuentes, temas,
  silencios, guardados, resaltados y ajustes.
- **Repositorio propio y firma.** Rama o repositorio de Faro, primer commit,
  keystore y APK de publicación.
- **Prueba en teléfono real** de todos los gestos, y arreglo de lo que salga.
- **Sin conexión de verdad.** Guardar también las imágenes de lo que entra en
  Hoy, con un límite de espacio.
- **Rendimiento con muchas fuentes.** Listas largas sin tirones y arranque
  rápido con miles de artículos guardados.
- **Estados de error claros.** Sin conexión, sitio caído, feed que cambió de
  dirección (con propuesta de arreglo automático).
- **Accesibilidad.** Lector de pantalla, tamaños de letra del sistema y
  contraste revisado en los dos temas.

## Fase 4 · Más de dónde elegir (0.4)

Hoy Faro solo sigue sitios con feed. Esta fase amplía qué se puede seguir.

- **YouTube.** Pegar la dirección de un canal y seguirlo; los vídeos con su
  miniatura y duración.
- **Sitios sin feed.** Marcar en la página dónde están los titulares y que Faro
  la vigile.
- **Reddit, Mastodon y Bluesky** como fuentes, que ya publican feeds.
- **Podcasts.** Seguir un programa y escuchar los episodios desde Faro.
- **Catálogo más grande.** Más países (Ecuador, Venezuela, Uruguay, Costa Rica,
  Estados Unidos en español), más temas (salud, motor, viajes, música) y un
  buscador dentro del catálogo.
- **Compartir a Faro.** Desde el navegador, «Compartir → Faro» para guardar un
  artículo suelto o seguir el sitio.
- **Sugerencias.** «Quien sigue esto también sigue…», calculado con el propio
  catálogo, sin enviar nada fuera.

## Fase 5 · Entender (0.5)

Pasar de ordenar noticias a explicarlas. La IA es opcional y con la clave del
usuario; la app sigue completa sin ella.

- **Resumen del día.** Un párrafo arriba en Hoy con lo que pasó.
- **En breve.** Punto clave, contexto e impacto al abrir un artículo.
- **Traducción** para seguir fuentes en otros idiomas.
- **Seguir una historia.** Marcar una noticia y que Faro avise cuando haya
  novedades sobre lo mismo, aunque cambien las palabras del titular.
- **Cronología de un tema.** Lo que se ha publicado de un tema, ordenado en el
  tiempo.
- **Agrupado mejor.** Hoy se juntan historias por parecido del titular; con
  nombres propios y fechas se equivoca menos.
- **Aprendizaje por tema**, no solo por fuente: qué asuntos abres y cuáles no.

## Fase 6 · Fuera de la app (0.6)

Que Faro sirva sin abrirlo.

- **Widget** de pantalla de inicio con los titulares principales.
- **Escuchar Hoy.** Lectura en voz alta como lista de reproducción, con
  controles en la pantalla de bloqueo.
- **Aviso diario con contenido.** «Hoy está listo: 12 historias, 28 min» y el
  titular principal, en vez de un recordatorio genérico.
- **Avisos por tema con más control.** Horas de silencio y agrupar varios en
  uno.
- **Compartir bonito.** Una cita resaltada como imagen con la fuente.

## Fase 7 · Tu archivo (0.7)

Lo leído como algo que se puede volver a encontrar y usar.

- **Buscador en el texto completo**, con filtros por fuente, tema y fecha.
- **Etiquetas y colecciones** en lo guardado.
- **Exportación a Obsidian y Notion** de resaltados y notas, con formato propio.
- **Resumen semanal.** Qué leíste, qué temas subieron, qué fuentes ya no abres
  (y la propuesta de dejar de seguirlas).
- **Archivar una página entera** para conservarla aunque el sitio la borre.

## Fase 8 · Publicar (1.0)

Lo que falta para que otra persona la instale desde Play Store.

- **Ficha de Play Store**: capturas, descripción, política de privacidad.
- **Inglés** además de español, en la app y en el catálogo.
- **Tableta y horizontal**: lista y lector lado a lado.
- **Sincronización opcional** entre dispositivos, sin servidor propio: un
  archivo en la nube que el usuario elija.
- **Arranque guiado definitivo**, con lo aprendido de quien la haya probado.
- **Telegram** como canal extra, si sigue teniendo sentido.

## Cómo decidir el orden

- La fase 3 va primero porque todo lo demás añade datos que hoy se pueden
  perder.
- Las fases 4 a 7 son independientes entre sí y se pueden reordenar según lo
  que más se eche de menos al usar la app.
- La fase 5 es la única con coste por uso (la clave de IA); conviene dejarla
  después de que el resto esté asentado.
- La fase 8 solo tiene sentido cuando la app lleve semanas en uso diario.
