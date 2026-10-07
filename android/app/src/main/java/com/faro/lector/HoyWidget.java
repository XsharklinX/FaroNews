package com.faro.lector;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget de la pantalla de inicio: los primeros titulares de la edición de
 * Hoy y cuánto queda por leer. No descarga nada por su cuenta: pinta lo que la
 * app le dejó la última vez que cambió Hoy (FaroBackgroundPlugin.setWidget).
 */
public class HoyWidget extends AppWidgetProvider {

    static final String DATA = "widget";
    private static final int[] LINES = { R.id.widget_line1, R.id.widget_line2, R.id.widget_line3 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, render(context));
    }

    /** Vuelve a pintar todos los widgets que el usuario tenga puestos. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HoyWidget.class));
        if (ids.length > 0) manager.updateAppWidget(ids, render(context));
    }

    private static RemoteViews render(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_hoy);
        int ink = ContextCompat.getColor(context, R.color.widget_ink);
        int faint = ContextCompat.getColor(context, R.color.widget_ink3);
        String status = "";
        JSONArray items = new JSONArray();
        String empty = "Abre Faro para preparar la edición de hoy.";
        try {
            JSONObject data = new JSONObject(context.getSharedPreferences(FeedWorker.PREFS, Context.MODE_PRIVATE).getString(DATA, "{}"));
            status = data.optString("status", "");
            empty = data.optString("empty", empty);
            JSONArray found = data.optJSONArray("items");
            if (found != null) items = found;
        } catch (Exception ignored) {
            // Datos ilegibles: se muestra el widget vacío.
        }

        views.setTextViewText(R.id.widget_status, status);
        for (int i = 0; i < LINES.length; i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) {
                views.setViewVisibility(LINES[i], View.GONE);
                continue;
            }
            views.setViewVisibility(LINES[i], View.VISIBLE);
            views.setTextViewText(LINES[i], item.optString("title"));
            // Lo ya leído se queda, apagado.
            views.setTextColor(LINES[i], item.optBoolean("read") ? faint : ink);
        }
        views.setViewVisibility(R.id.widget_empty, items.length() == 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_empty, empty);

        // Tocar el widget abre Faro en Hoy.
        Intent open = new Intent(context, MainActivity.class);
        open.setAction("com.faro.lector.SHORTCUT");
        open.setData(Uri.parse("faro://ir/hoy"));
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 7100, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }
}
