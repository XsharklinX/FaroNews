package com.faro.lector;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.util.Xml;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.text.HtmlCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Revisa los feeds con la app cerrada y avisa de lo nuevo que el usuario pidió:
 * lo que toca uno de sus temas, y todo lo de los sitios que marcó.
 *
 * No guarda artículos: de eso se encarga la app al abrirse. Solo recuerda qué
 * enlaces vio en cada feed, para no avisar dos veces de lo mismo. La primera
 * vez que ve un feed toma nota sin avisar.
 *
 * Cómo se presentan los avisos:
 *   - Un tema: un aviso por noticia, con sonido (canal «Tus temas»).
 *   - Un sitio: un aviso por noticia si son una o dos; si salen más, uno solo
 *     con la lista de titulares. En silencio (canal «Tus sitios»).
 *   - En horas de silencio no se revisa nada: lo que salga se avisa después.
 */
public class FeedWorker extends Worker {

    static final String PREFS = "faro_background";
    static final String WORK = "faro_feed_check";
    static final String CHANNEL_TOPICS = "temas";
    static final String CHANNEL_SOURCES = "fuentes";
    static final String ACTION_OPEN = "com.faro.lector.OPEN";
    static final String ACTION_SAVE = "com.faro.lector.SAVE";
    static final String EXTRA_URL = "url";
    static final String EXTRA_FEED = "feed";
    static final String EXTRA_ID = "notification_id";

    private static final String GROUP_TOPICS = "faro_temas";
    private static final int SUMMARY_TOPICS_ID = 1001;
    private static final int TEST_ID = 1002;
    private static final int TIMEOUT_MS = 15000;
    private static final int MAX_PER_RUN = 8;
    private static final int BUNDLE_FROM = 3;
    private static final int MAX_IMAGES = 3;
    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private static final int LAMP = 0xFFFFC53D;
    static final String HISTORY = "history";
    private static final int HISTORY_MAX = 60;
    private static final int MAX_PAGE_BYTES = 3 * 1024 * 1024;
    private static final int MAX_HEADLINES = 40;

    private static class Item {
        String title = "";
        String link = "";
        String text = "";
        String image = "";
    }

    private static class Topic {
        String name;
        List<String> words = new ArrayList<>();
    }

    private static class Hit {
        Item item;
        String topic;
        String feedTitle;
        String feedUrl;
    }

    private int sent = 0;
    private int images = 0;
    private JSONArray noted = new JSONArray();

    public FeedWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONObject config = new JSONObject(prefs.getString("config", "{}"));
            JSONArray feeds = config.optJSONArray("feeds");
            if (!config.optBoolean("enabled", false) || feeds == null) return Result.success();
            if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return Result.success();
            // En horas de silencio no se toca nada: así lo nuevo sigue siendo
            // nuevo en la primera revisión de la mañana.
            if (isQuiet(config.optJSONObject("quiet"), Calendar.getInstance())) return Result.success();

            ensureChannels(context);
            List<Topic> topics = topics(config);
            List<String> muted = words(config.optJSONArray("muted"));
            List<Hit> topicHits = new ArrayList<>();
            List<Object[]> sourceHits = new ArrayList<>();

            for (int i = 0; i < feeds.length(); i++) {
                JSONObject feed = feeds.getJSONObject(i);
                boolean all = feed.optBoolean("notify", false);
                if (!all && topics.isEmpty()) continue;

                String url = feed.optString("url");
                // Sitio sin feed: se leen los titulares de su portada.
                boolean page = "page".equals(feed.optString("kind"));
                List<Item> items;
                try {
                    items = page ? fetchPage(url) : fetch(url);
                } catch (Exception e) {
                    continue; // Un sitio caído no impide revisar los demás.
                }

                // Los titulares de una portada no salen escritos igual que en la
                // app, así que el vigilante lleva su propia cuenta de lo visto.
                String seenKey = (page ? "seenpage:" : "seen:") + url;
                Set<String> seen = prefs.getStringSet(seenKey, null);
                Set<String> now = new HashSet<>();
                for (Item item : items) now.add(item.link);
                prefs.edit().putStringSet(seenKey, now).apply();
                if (seen == null) continue;

                List<Item> fresh = new ArrayList<>();
                for (Item item : items) {
                    if (seen.contains(item.link)) continue;
                    String text = normalize(item.title + " " + item.text);
                    if (matches(text, muted)) continue;
                    String topic = matchTopic(text, topics);
                    if (topic != null) {
                        Hit hit = new Hit();
                        hit.item = item;
                        hit.topic = topic;
                        hit.feedTitle = feed.optString("title");
                        hit.feedUrl = url;
                        topicHits.add(hit);
                    } else if (all) {
                        fresh.add(item);
                    }
                }
                if (!fresh.isEmpty()) sourceHits.add(new Object[] { feed.optString("title"), url, fresh });
            }

            // Los temas van primero: son lo que el usuario pidió expresamente.
            for (Hit hit : topicHits) {
                if (sent >= MAX_PER_RUN) break;
                postItem(context, CHANNEL_TOPICS, GROUP_TOPICS, "Tema · " + hit.topic, hit.item, hit.feedTitle, hit.feedUrl);
            }
            if (topicHits.size() > 1) postTopicSummary(context, Math.min(topicHits.size(), MAX_PER_RUN));

            for (Object[] entry : sourceHits) {
                if (sent >= MAX_PER_RUN) break;
                String title = (String) entry[0];
                String url = (String) entry[1];
                @SuppressWarnings("unchecked")
                List<Item> fresh = (List<Item>) entry[2];
                if (fresh.size() >= BUNDLE_FROM) {
                    postBundle(context, title, url, fresh);
                } else {
                    for (Item item : fresh) {
                        if (sent >= MAX_PER_RUN) break;
                        postItem(context, CHANNEL_SOURCES, "faro_sitio_" + url.hashCode(), title, item, null, url);
                    }
                }
            }
        } catch (Exception e) {
            // Una revisión fallida no es grave: en la siguiente se reintenta.
        }
        saveHistory(prefs);
        prefs.edit()
            .putLong("last_run", System.currentTimeMillis())
            .putInt("last_sent", sent)
            .putInt("total_sent", prefs.getInt("total_sent", 0) + sent)
            .apply();
        return Result.success();
    }

    // --- Configuración -------------------------------------------------------

    private static List<String> words(JSONArray array) {
        List<String> out = new ArrayList<>();
        if (array == null) return out;
        for (int i = 0; i < array.length(); i++) {
            String word = array.optString(i, "").trim();
            if (!word.isEmpty()) out.add(word);
        }
        return out;
    }

    private static List<Topic> topics(JSONObject config) {
        List<Topic> out = new ArrayList<>();
        JSONArray array = config.optJSONArray("topics");
        if (array != null) {
            for (int i = 0; i < array.length(); i++) {
                JSONObject json = array.optJSONObject(i);
                if (json == null) continue;
                Topic topic = new Topic();
                topic.name = json.optString("name");
                topic.words = words(json.optJSONArray("words"));
                if (topic.words.isEmpty() && !topic.name.isEmpty()) topic.words.add(topic.name);
                if (!topic.words.isEmpty()) out.add(topic);
            }
        }
        // Configuración guardada por una versión anterior: palabras sueltas.
        for (String word : words(config.optJSONArray("keywords"))) {
            Topic topic = new Topic();
            topic.name = word;
            topic.words.add(word);
            out.add(topic);
        }
        return out;
    }

    private static int minutes(String hhmm, int fallback) {
        try {
            String[] parts = hhmm.split(":");
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Igual que inQuietHours() de src/core/notify.js: el tramo puede cruzar la medianoche. */
    static boolean isQuiet(JSONObject quiet, Calendar now) {
        if (quiet == null || !quiet.optBoolean("on", false)) return false;
        int from = minutes(quiet.optString("from", "23:00"), 23 * 60);
        int to = minutes(quiet.optString("to", "07:00"), 7 * 60);
        int current = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        if (from == to) return false;
        return from < to ? current >= from && current < to : current >= from || current < to;
    }

    private static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
    }

    private static boolean matches(String normalizedText, List<String> words) {
        for (String word : words) {
            if (normalizedText.contains(normalize(word))) return true;
        }
        return false;
    }

    private static String matchTopic(String normalizedText, List<Topic> topics) {
        for (Topic topic : topics) {
            if (matches(normalizedText, topic.words)) return topic.name;
        }
        return null;
    }

    // --- Lectura de feeds ----------------------------------------------------

    private static HttpURLConnection open(String address) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(address).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "Faro/0.1 (lector de feeds)");
        return conn;
    }

    private static List<Item> fetch(String address) throws Exception {
        HttpURLConnection conn = open(address);
        try (InputStream in = conn.getInputStream()) {
            return parse(in);
        } finally {
            conn.disconnect();
        }
    }

    private static String plain(String html) {
        String text = html.replaceAll("<[^>]+>", " ").replaceAll("&[a-zA-Z#0-9]+;", " ").replaceAll("\\s+", " ").trim();
        return text.length() > 600 ? text.substring(0, 600) : text;
    }

    private static final Pattern IMAGE = Pattern.compile("<img[^>]+src=[\"'](https://[^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

    private static String firstImage(String html) {
        Matcher matcher = IMAGE.matcher(html);
        while (matcher.find()) {
            String url = matcher.group(1).replace("&amp;", "&");
            // Los píxeles de seguimiento no son la foto de la noticia.
            if (!url.contains("feedburner") && !url.contains("pixel") && !url.endsWith(".gif")) return url;
        }
        return "";
    }

    // RSS y Atom. El parser detecta la codificación por sí mismo.
    private static List<Item> parse(InputStream in) throws Exception {
        XmlPullParser parser = Xml.newPullParser();
        try {
            parser.setFeature("http://xmlpull.org/v1/doc/features.html#relaxed", true);
        } catch (Exception ignored) {
            // No todos los parsers admiten el modo tolerante.
        }
        parser.setInput(in, null);

        List<Item> items = new ArrayList<>();
        Item current = null;
        for (int event = parser.getEventType(); event != XmlPullParser.END_DOCUMENT; event = parser.next()) {
            String raw = parser.getName();
            if (raw == null) continue;
            // Con o sin prefijo: «media:thumbnail» y «thumbnail» son lo mismo aquí.
            String name = raw.substring(raw.indexOf(':') + 1);
            if (event == XmlPullParser.START_TAG) {
                if ("item".equals(name) || "entry".equals(name)) {
                    current = new Item();
                } else if (current == null) {
                    continue;
                } else if ("title".equals(name) && current.title.isEmpty()) {
                    current.title = plain(text(parser));
                } else if ("link".equals(name)) {
                    String href = parser.getAttributeValue(null, "href");
                    String rel = parser.getAttributeValue(null, "rel");
                    if (href != null) {
                        if (rel == null || "alternate".equals(rel)) current.link = href.trim();
                    } else if (current.link.isEmpty()) {
                        current.link = text(parser);
                    }
                } else if ("thumbnail".equals(name) || "enclosure".equals(name) || "content".equals(name)) {
                    String url = parser.getAttributeValue(null, "url");
                    String type = parser.getAttributeValue(null, "type");
                    String medium = parser.getAttributeValue(null, "medium");
                    boolean image = "thumbnail".equals(name) || (type != null && type.startsWith("image/")) || "image".equals(medium);
                    if (url != null && image && current.image.isEmpty()) current.image = url.trim();
                    else if (url == null && "content".equals(name) && current.text.isEmpty()) current.text = plain(text(parser));
                } else if ("description".equals(name) || "summary".equals(name) || "encoded".equals(name)) {
                    // Muchos sitios no declaran la foto aparte: va dentro del texto.
                    String html = text(parser);
                    if (current.image.isEmpty()) current.image = firstImage(html);
                    if (current.text.isEmpty()) current.text = plain(html);
                }
            } else if (event == XmlPullParser.END_TAG && current != null && ("item".equals(name) || "entry".equals(name))) {
                if (!current.link.isEmpty() && !current.title.isEmpty()) items.add(current);
                current = null;
            }
        }
        return items;
    }

    private static String text(XmlPullParser parser) {
        try {
            return parser.nextText().trim();
        } catch (Exception e) {
            return "";
        }
    }

    private static Bitmap loadImage(String address) {
        if (address == null || !address.startsWith("https://")) return null;
        try {
            HttpURLConnection conn = open(address);
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) > 0) {
                    out.write(buffer, 0, read);
                    if (out.size() > MAX_IMAGE_BYTES) return null;
                }
                byte[] data = out.toByteArray();
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = 1;
                while (bounds.outWidth / options.inSampleSize > 1024) options.inSampleSize *= 2;
                return BitmapFactory.decodeByteArray(data, 0, data.length, options);
            } finally {
                conn.disconnect();
            }
        } catch (Exception e) {
            return null;
        }
    }

    // --- Sitios sin feed -----------------------------------------------------

    private static final Pattern ANCHOR = Pattern.compile("<a\\b[^>]*\\bhref=[\"']([^\"'#]+)[\"'][^>]*>(.*?)</a>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CHARSET = Pattern.compile("charset=[\"']?([\\w-]+)", Pattern.CASE_INSENSITIVE);

    private static String host(URL url) {
        String host = url.getHost().toLowerCase(Locale.ROOT);
        return host.startsWith("www.") ? host.substring(4) : host;
    }

    /** Mismas reglas que extractHeadlines() de src/core/scrape.js, sin árbol DOM. */
    private static List<Item> fetchPage(String address) throws Exception {
        HttpURLConnection conn = open(address);
        String html;
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) > 0 && out.size() < MAX_PAGE_BYTES) out.write(buffer, 0, read);
            Charset charset = Charset.forName("UTF-8");
            Matcher declared = CHARSET.matcher(String.valueOf(conn.getContentType()));
            try {
                if (declared.find()) charset = Charset.forName(declared.group(1));
            } catch (Exception ignored) {
                // Codificación desconocida: se lee como UTF-8.
            }
            html = new String(out.toByteArray(), charset);
        } finally {
            conn.disconnect();
        }

        URL base = conn.getURL();
        String site = host(base);
        List<Item> items = new ArrayList<>();
        Set<String> links = new HashSet<>();
        Matcher matcher = ANCHOR.matcher(html);
        while (matcher.find() && items.size() < MAX_HEADLINES) {
            URL url;
            try {
                url = new URL(base, matcher.group(1).trim().replace("&amp;", "&"));
            } catch (Exception e) {
                continue;
            }
            if (!url.getProtocol().startsWith("http") || !host(url).equals(site)) continue;
            // Una dirección de artículo suele ser larga o llevar números; «/deportes» no.
            String path = url.getPath();
            int parts = 0;
            for (String part : path.split("/")) if (!part.isEmpty()) parts++;
            if (parts < 2 && !path.matches(".*\\d.*") && path.length() <= 28) continue;

            String title = HtmlCompat.fromHtml(matcher.group(2).replaceAll("<[^>]+>", " "), HtmlCompat.FROM_HTML_MODE_LEGACY).toString().replaceAll("\\s+", " ").trim();
            if (title.length() < 28 || title.length() > 220 || title.split(" ").length < 4) continue;

            Item item = new Item();
            item.link = url.toString();
            item.title = title;
            if (links.add(item.link)) items.add(item);
        }
        return items;
    }

    // --- Avisos --------------------------------------------------------------

    /** Apunta el aviso en el historial que la app muestra en su bandeja. */
    private void remember(String heading, String title, String url, String feedUrl) {
        try {
            JSONObject entry = new JSONObject();
            entry.put("heading", heading);
            entry.put("title", title);
            entry.put("url", url == null ? "" : url);
            entry.put("feed", feedUrl == null ? "" : feedUrl);
            entry.put("at", System.currentTimeMillis());
            noted.put(entry);
        } catch (Exception ignored) {
            // Un apunte que falla no debe impedir el aviso.
        }
    }

    private void saveHistory(SharedPreferences prefs) {
        if (noted.length() == 0) return;
        try {
            JSONArray old = new JSONArray(prefs.getString(HISTORY, "[]"));
            JSONArray all = new JSONArray();
            // Lo más reciente primero.
            for (int i = noted.length() - 1; i >= 0; i--) all.put(noted.get(i));
            for (int i = 0; i < old.length() && all.length() < HISTORY_MAX; i++) all.put(old.get(i));
            prefs.edit().putString(HISTORY, all.toString()).apply();
        } catch (Exception ignored) {
            // Historial ilegible: se empieza de nuevo la próxima vez.
        }
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.deleteNotificationChannel("alertas"); // Canal único de versiones anteriores.

        NotificationChannel topics = new NotificationChannel(CHANNEL_TOPICS, "Tus temas", NotificationManager.IMPORTANCE_DEFAULT);
        topics.setDescription("Noticias que mencionan uno de los temas que sigues");
        topics.enableLights(true);
        topics.setLightColor(LAMP);
        manager.createNotificationChannel(topics);

        NotificationChannel sources = new NotificationChannel(CHANNEL_SOURCES, "Tus sitios", NotificationManager.IMPORTANCE_LOW);
        sources.setDescription("Noticias nuevas de los sitios de los que pediste aviso");
        manager.createNotificationChannel(sources);
    }

    private static PendingIntent openIntent(Context context, String url, String feedUrl, int requestCode) {
        Intent open = new Intent(context, MainActivity.class);
        open.setAction(ACTION_OPEN);
        // Cada aviso necesita un Intent distinto para que no se pisen entre sí.
        open.setData(Uri.parse("faro://abrir/" + requestCode));
        if (url != null) open.putExtra(EXTRA_URL, url);
        if (feedUrl != null) open.putExtra(EXTRA_FEED, feedUrl);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static NotificationCompat.Builder base(Context context, String channel) {
        return new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_faro)
            .setColor(LAMP)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION);
    }

    private static void show(Context context, int id, NotificationCompat.Builder builder) {
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // El usuario retiró el permiso entre la comprobación y el aviso.
        }
    }

    /** Un aviso por noticia: titular, foto si la hay, y «Guardar» sin abrir la app. */
    private void postItem(Context context, String channel, String group, String heading, Item item, String subText, String feedUrl) {
        int id = item.link.hashCode();

        Intent save = new Intent(context, NotificationActionReceiver.class);
        save.setAction(ACTION_SAVE);
        save.setData(Uri.parse("faro://guardar/" + id));
        save.putExtra(EXTRA_URL, item.link);
        save.putExtra(EXTRA_FEED, feedUrl);
        save.putExtra(EXTRA_ID, id);
        PendingIntent saveIntent = PendingIntent.getBroadcast(context, id, save, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = base(context, channel)
            .setContentTitle(heading)
            .setContentText(item.title)
            .setContentIntent(openIntent(context, item.link, feedUrl, id))
            .setGroup(group)
            .addAction(0, "Guardar para luego", saveIntent);
        if (subText != null && !subText.isEmpty()) builder.setSubText(subText);

        Bitmap picture = images < MAX_IMAGES ? loadImage(item.image) : null;
        if (picture != null) {
            images++;
            // La foto se ve grande al desplegar el aviso; plegado, en miniatura.
            builder.setLargeIcon(picture).setStyle(new NotificationCompat.BigPictureStyle().bigPicture(picture).bigLargeIcon((Bitmap) null).setSummaryText(item.title));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(item.title));
        }
        show(context, id, builder);
        remember(heading, item.title, item.link, feedUrl);
        sent++;
    }

    /** Varias noticias de un mismo sitio: un solo aviso con la lista de titulares. */
    private void postBundle(Context context, String feedTitle, String feedUrl, List<Item> fresh) {
        int id = ("lote:" + feedUrl).hashCode();
        NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle();
        int shown = Math.min(fresh.size(), 5);
        for (int i = 0; i < shown; i++) style.addLine(fresh.get(i).title);
        if (fresh.size() > shown) style.setSummaryText("y " + (fresh.size() - shown) + " más");

        NotificationCompat.Builder builder = base(context, CHANNEL_SOURCES)
            .setContentTitle(feedTitle)
            .setContentText(fresh.size() + " noticias nuevas")
            .setNumber(fresh.size())
            .setStyle(style)
            // Sin dirección de artículo: al tocarlo se abre la lista de novedades.
            .setContentIntent(openIntent(context, null, feedUrl, id));
        show(context, id, builder);
        remember(feedTitle + " · " + fresh.size() + " noticias nuevas", fresh.get(0).title, null, feedUrl);
        sent++;
    }

    private static void postTopicSummary(Context context, int count) {
        NotificationCompat.Builder builder = base(context, CHANNEL_TOPICS)
            .setContentTitle("Tus temas")
            .setContentText(count + " noticias nuevas")
            .setGroup(GROUP_TOPICS)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setContentIntent(openIntent(context, null, null, SUMMARY_TOPICS_ID));
        show(context, SUMMARY_TOPICS_ID, builder);
    }

    /** Aviso de muestra, para que el usuario vea cómo llegan y pruebe el sonido. */
    static void postTest(Context context) {
        ensureChannels(context);
        String text = "Cuando salga una noticia de tus temas o de los sitios que elijas, Faro te lo dirá aquí.";
        NotificationCompat.Builder builder = base(context, CHANNEL_TOPICS)
            .setContentTitle("Así llega un aviso de Faro")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openIntent(context, null, null, TEST_ID));
        show(context, TEST_ID, builder);
    }
}
