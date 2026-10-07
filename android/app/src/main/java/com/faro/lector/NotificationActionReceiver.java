package com.faro.lector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Botones de un aviso. Ninguno abre la app: apuntan lo que el usuario pidió en
 * una lista que Faro recoge la próxima vez que se abre, y quitan el aviso.
 *
 *   Guardar             la noticia pasa a Guardado
 *   Ya la vi            la noticia se da por leída
 *   Silenciar 1 semana  el tema deja de avisar y de entrar en Hoy durante siete días
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    static final String PENDING_SAVES = "pending_saves";
    static final String PENDING_READS = "pending_reads";
    static final String PENDING_MUTES = "pending_mutes";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        SharedPreferences prefs = context.getSharedPreferences(FeedWorker.PREFS, Context.MODE_PRIVATE);
        try {
            if (FeedWorker.ACTION_SAVE.equals(action) || FeedWorker.ACTION_SEEN.equals(action)) {
                String url = intent.getStringExtra(FeedWorker.EXTRA_URL);
                if (url == null) return;
                JSONObject entry = new JSONObject();
                entry.put("url", url);
                entry.put("feed", intent.getStringExtra(FeedWorker.EXTRA_FEED));
                add(prefs, FeedWorker.ACTION_SAVE.equals(action) ? PENDING_SAVES : PENDING_READS, entry);
            } else if (FeedWorker.ACTION_MUTE.equals(action)) {
                String topic = intent.getStringExtra(FeedWorker.EXTRA_TOPIC);
                if (topic == null) return;
                JSONObject entry = new JSONObject();
                entry.put("topic", topic);
                entry.put("at", System.currentTimeMillis());
                add(prefs, PENDING_MUTES, entry);
                dropTopic(prefs, topic);
            } else {
                return;
            }
        } catch (Exception ignored) {
            // Una lista corrupta se da por perdida: no debe romper el aviso.
        }
        NotificationManagerCompat.from(context).cancel(intent.getIntExtra(FeedWorker.EXTRA_ID, 0));
    }

    private static void add(SharedPreferences prefs, String key, JSONObject entry) throws Exception {
        JSONArray list = new JSONArray(prefs.getString(key, "[]"));
        list.put(entry);
        prefs.edit().putString(key, list.toString()).apply();
    }

    /** El vigilante deja de avisar de ese tema ya, sin esperar a que se abra la app. */
    private static void dropTopic(SharedPreferences prefs, String name) throws Exception {
        JSONObject config = new JSONObject(prefs.getString("config", "{}"));
        JSONArray topics = config.optJSONArray("topics");
        if (topics == null) return;
        JSONArray kept = new JSONArray();
        for (int i = 0; i < topics.length(); i++) {
            JSONObject topic = topics.optJSONObject(i);
            if (topic != null && !name.equals(topic.optString("name"))) kept.put(topic);
        }
        config.put("topics", kept);
        prefs.edit().putString("config", config.toString()).apply();
    }
}
