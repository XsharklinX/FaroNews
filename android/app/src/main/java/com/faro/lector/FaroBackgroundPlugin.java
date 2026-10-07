package com.faro.lector;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.provider.Settings;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;

import org.json.JSONArray;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Puente entre la app y lo que pasa fuera de ella: el vigilante de avisos
 * (FeedWorker), los avisos que el usuario toca y lo que otras apps comparten.
 */
@CapacitorPlugin(name = "FaroBackground")
public class FaroBackgroundPlugin extends Plugin {

    private static final int MIN_MINUTES = 15;
    // La instancia viva, para que el servicio de reproducción le pase los toques.
    private static FaroBackgroundPlugin instance;

    // Texto recibido con «Compartir → Faro», a la espera de que la app lo recoja.
    private String pendingShared;
    // Aviso que el usuario tocó: qué noticia (o qué sitio) quiere abrir.
    private JSObject pendingOpen;
    // Acceso directo del icono que abrió la app: «hoy», «buscar», «guardado» o «anadir».
    private String pendingShortcut;
    private static final String ACTION_SHORTCUT = "com.faro.lector.SHORTCUT";

    @Override
    public void load() {
        // Los canales se crean ya, para que aparezcan en los ajustes de Android
        // aunque todavía no haya llegado ningún aviso.
        FeedWorker.ensureChannels(getContext());
        instance = this;
        capture(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String event = capture(intent);
        if (event != null) notifyListeners(event, new JSObject(), true);
    }

    /** Devuelve el evento que debe recibir la app, o null si el Intent no le interesa. */
    private String capture(Intent intent) {
        if (intent == null) return null;
        if (FeedWorker.ACTION_OPEN.equals(intent.getAction())) {
            pendingOpen = new JSObject();
            pendingOpen.put("url", intent.getStringExtra(FeedWorker.EXTRA_URL));
            pendingOpen.put("feed", intent.getStringExtra(FeedWorker.EXTRA_FEED));
            // Consumido: si la actividad se recrea no debe volver a abrirse.
            intent.setAction(Intent.ACTION_MAIN);
            return "opened";
        }
        if (ACTION_SHORTCUT.equals(intent.getAction()) && intent.getData() != null) {
            pendingShortcut = intent.getData().getLastPathSegment();
            intent.setAction(Intent.ACTION_MAIN);
            return pendingShortcut == null ? null : "shortcut";
        }
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null || text.trim().isEmpty()) return null;
            pendingShared = text;
            return "shared";
        }
        return null;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(FeedWorker.PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void consumeShared(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pendingShared);
        pendingShared = null;
        call.resolve(result);
    }

    @PluginMethod
    public void consumeShortcut(PluginCall call) {
        JSObject result = new JSObject();
        result.put("go", pendingShortcut);
        pendingShortcut = null;
        call.resolve(result);
    }

    @PluginMethod
    public void consumeOpen(PluginCall call) {
        JSObject result = new JSObject();
        result.put("open", pendingOpen);
        pendingOpen = null;
        call.resolve(result);
    }

    /** Noticias que el usuario guardó desde un aviso sin abrir la app. */
    @PluginMethod
    public void consumeSaves(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("saves", new JSONArray(prefs().getString(NotificationActionReceiver.PENDING_SAVES, "[]")));
            result.put("reads", new JSONArray(prefs().getString(NotificationActionReceiver.PENDING_READS, "[]")));
            result.put("mutes", new JSONArray(prefs().getString(NotificationActionReceiver.PENDING_MUTES, "[]")));
        } catch (Exception e) {
            result.put("saves", new JSONArray());
        }
        prefs().edit().remove(NotificationActionReceiver.PENDING_SAVES).remove(NotificationActionReceiver.PENDING_READS).remove(NotificationActionReceiver.PENDING_MUTES).apply();
        call.resolve(result);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        JSObject data = call.getData();
        SharedPreferences prefs = prefs();
        prefs.edit().putString("config", data.toString()).apply();

        JSArray feeds = call.getArray("feeds");
        boolean enabled = data.optBoolean("enabled", false) && feeds != null && feeds.length() > 0;
        // Android no permite revisar más a menudo que cada 15 minutos.
        int every = Math.max(MIN_MINUTES, data.optInt("everyMinutes", 30));
        WorkManager manager = WorkManager.getInstance(getContext());
        if (enabled) {
            Constraints online = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(FeedWorker.class, every, TimeUnit.MINUTES)
                .setConstraints(online)
                .build();
            // Solo se reprograma si cambió la frecuencia: hacerlo siempre
            // reiniciaría la cuenta en cada apertura de la app.
            boolean same = prefs.getInt("every", 0) == every;
            manager.enqueueUniquePeriodicWork(FeedWorker.WORK, same ? ExistingPeriodicWorkPolicy.KEEP : ExistingPeriodicWorkPolicy.UPDATE, request);
            prefs.edit().putInt("every", every).apply();
        } else {
            manager.cancelUniqueWork(FeedWorker.WORK);
            prefs.edit().remove("every").apply();
        }
        call.resolve();
    }

    /** La app ya mostró estos enlaces: el vigilante no debe avisar de ellos. */
    @PluginMethod
    public void markSeen(PluginCall call) {
        String url = call.getString("url");
        JSArray links = call.getArray("links");
        if (url == null || links == null) {
            call.reject("Faltan url o links");
            return;
        }
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < links.length(); i++) seen.add(links.optString(i));
        prefs().edit().putStringSet("seen:" + url, seen).apply();
        call.resolve();
    }

    /** Si Android deja avisar, y cuándo y con qué resultado fue la última revisión. */
    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences prefs = prefs();
        JSObject result = new JSObject();
        result.put("allowed", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("lastRun", prefs.getLong("last_run", 0));
        result.put("lastSent", prefs.getInt("last_sent", 0));
        result.put("totalSent", prefs.getInt("total_sent", 0));
        call.resolve(result);
    }

    /** Lo que Faro ha avisado últimamente, para la bandeja de la app. */
    @PluginMethod
    public void history(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("history", new JSONArray(prefs().getString(FeedWorker.HISTORY, "[]")));
        } catch (Exception e) {
            result.put("history", new JSONArray());
        }
        call.resolve(result);
    }

    /** Abre los ajustes de avisos de Faro en Android: sonido, vibración y canales. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void test(PluginCall call) {
        FeedWorker.postTest(getContext());
        call.resolve();
    }

    /** Lo que el usuario tocó en la notificación del podcast: toggle, back, forward o stop. */
    static void dispatchMedia(String action) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        instance.notifyListeners("media", data);
    }

    /** Muestra o actualiza la notificación de lo que suena y retiene la app mientras suene. */
    @PluginMethod
    public void playback(PluginCall call) {
        Intent intent = new Intent(getContext(), PlaybackService.class).setAction(PlaybackService.ACTION_UPDATE);
        intent.putExtra(PlaybackService.EXTRA_TITLE, call.getString("title", "Faro"));
        intent.putExtra(PlaybackService.EXTRA_ARTIST, call.getString("artist", ""));
        intent.putExtra(PlaybackService.EXTRA_PLAYING, Boolean.TRUE.equals(call.getBoolean("playing", false)));
        // La misma información para la pantalla de bloqueo y Android Auto.
        MediaHub.update(getContext(), call.getString("title", "Faro"), call.getString("artist", ""), Boolean.TRUE.equals(call.getBoolean("playing", false)),
            (long) (call.getDouble("position", 0d) * 1000), (long) (call.getDouble("duration", 0d) * 1000), call.getArray("queue"));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
        } catch (Exception e) {
            // Con la app en segundo plano Android puede negarse: el audio sigue sin notificación.
        }
        call.resolve();
    }

    @PluginMethod
    public void playbackStop(PluginCall call) {
        MediaHub.stop(getContext());
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    /** Lo que enseña el widget de Hoy: { status, empty, items: [{ title, read }] }. */
    @PluginMethod
    public void setWidget(PluginCall call) {
        prefs().edit().putString(HoyWidget.DATA, call.getData().toString()).apply();
        HoyWidget.refresh(getContext());
        call.resolve();
    }

    /** Con `follow`, el texto de la app sigue el tamaño de letra elegido en Android. */
    @PluginMethod
    public void setTextZoom(PluginCall call) {
        final boolean follow = Boolean.TRUE.equals(call.getBoolean("follow", false));
        final float scale = getContext().getResources().getConfiguration().fontScale;
        getActivity().runOnUiThread(() -> getBridge().getWebView().getSettings().setTextZoom(follow ? Math.round(scale * 100) : 100));
        call.resolve();
    }

    /** Pinta las barras del sistema del color de la pantalla que hay debajo. */
    @PluginMethod
    public void setBars(PluginCall call) {
        final String color = call.getString("color", "#FFFFFF");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                int value = Color.parseColor(color);
                window.setBackgroundDrawable(new ColorDrawable(value));
                window.setStatusBarColor(value);
                window.setNavigationBarColor(value);
                WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
                bars.setAppearanceLightStatusBars(!dark);
                bars.setAppearanceLightNavigationBars(!dark);
            } catch (Exception e) {
                // Color mal escrito: se quedan como estaban.
            }
        });
        call.resolve();
    }

    /** Modelo y versión de Android, para acompañar un comentario del usuario. */
    @PluginMethod
    public void device(PluginCall call) {
        JSObject result = new JSObject();
        result.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        result.put("android", Build.VERSION.RELEASE);
        call.resolve(result);
    }

    /**
     * Traduce textos del inglés al español dentro del teléfono. La primera vez
     * descarga el modelo de idioma (unos 30 MB); después funciona sin conexión.
     */
    @PluginMethod
    public void translate(PluginCall call) {
        JSArray texts = call.getArray("texts");
        if (texts == null || texts.length() == 0) {
            call.reject("Sin texto");
            return;
        }
        TranslatorOptions options = new TranslatorOptions.Builder().setSourceLanguage(TranslateLanguage.ENGLISH).setTargetLanguage(TranslateLanguage.SPANISH).build();
        Translator translator = Translation.getClient(options);
        translator
            // Los titulares de las listas se traducen solo si el idioma ya está o hay wifi.
            .downloadModelIfNeeded(Boolean.TRUE.equals(call.getBoolean("wifiOnly", false)) ? new DownloadConditions.Builder().requireWifi().build() : new DownloadConditions.Builder().build())
            .addOnSuccessListener(done -> translateNext(translator, texts, 0, new JSArray(), call))
            .addOnFailureListener(error -> {
                translator.close();
                call.reject("MODEL");
            });
    }

    private void translateNext(Translator translator, JSArray texts, int index, JSArray out, PluginCall call) {
        if (index >= texts.length()) {
            translator.close();
            JSObject result = new JSObject();
            result.put("texts", out);
            call.resolve(result);
            return;
        }
        String text = texts.optString(index, "");
        translator
            .translate(text)
            .addOnSuccessListener(translated -> {
                out.put(translated);
                translateNext(translator, texts, index + 1, out, call);
            })
            .addOnFailureListener(error -> {
                // Un párrafo que falla se deja en su idioma y se sigue con el resto.
                out.put(text);
                translateNext(translator, texts, index + 1, out, call);
            });
    }

    /** Lanza una revisión inmediata, sin esperar al siguiente turno. */
    @PluginMethod
    public void runNow(PluginCall call) {
        WorkManager.getInstance(getContext()).enqueue(new OneTimeWorkRequest.Builder(FeedWorker.class).build());
        call.resolve();
    }
}
