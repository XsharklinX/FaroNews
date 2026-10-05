package com.faro.lector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Botón «Guardar para luego» de un aviso. No abre la app: apunta la noticia en
 * una lista que Faro recoge la próxima vez que se abre, y quita el aviso.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    static final String PENDING_SAVES = "pending_saves";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!FeedWorker.ACTION_SAVE.equals(intent.getAction())) return;
        String url = intent.getStringExtra(FeedWorker.EXTRA_URL);
        if (url == null) return;

        SharedPreferences prefs = context.getSharedPreferences(FeedWorker.PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray saves = new JSONArray(prefs.getString(PENDING_SAVES, "[]"));
            JSONObject entry = new JSONObject();
            entry.put("url", url);
            entry.put("feed", intent.getStringExtra(FeedWorker.EXTRA_FEED));
            saves.put(entry);
            prefs.edit().putString(PENDING_SAVES, saves.toString()).apply();
        } catch (Exception ignored) {
            // Una lista corrupta se da por perdida: no debe romper el aviso.
        }
        NotificationManagerCompat.from(context).cancel(intent.getIntExtra(FeedWorker.EXTRA_ID, 0));
    }
}
