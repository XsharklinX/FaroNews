package com.faro.lector;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Mantiene viva la app mientras suena un podcast con la pantalla apagada y
 * pone los controles en la notificación. El sonido lo sigue reproduciendo la
 * app: este servicio solo avisa a Android de que hay algo sonando y devuelve
 * a la app lo que el usuario toca en la notificación.
 */
public class PlaybackService extends Service {

    static final String ACTION_UPDATE = "com.faro.lector.PLAY_UPDATE";
    static final String ACTION_TOGGLE = "com.faro.lector.PLAY_TOGGLE";
    static final String ACTION_BACK = "com.faro.lector.PLAY_BACK";
    static final String ACTION_FORWARD = "com.faro.lector.PLAY_FORWARD";
    static final String ACTION_STOP = "com.faro.lector.PLAY_STOP";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_ARTIST = "artist";
    static final String EXTRA_PLAYING = "playing";

    private static final String CHANNEL = "reproduccion";
    private static final int ID = 7001;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (action == null || ACTION_STOP.equals(action)) {
            if (action != null) FaroBackgroundPlugin.dispatchMedia("stop");
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_TOGGLE.equals(action)) FaroBackgroundPlugin.dispatchMedia("toggle");
        else if (ACTION_BACK.equals(action)) FaroBackgroundPlugin.dispatchMedia("back");
        else if (ACTION_FORWARD.equals(action)) FaroBackgroundPlugin.dispatchMedia("forward");
        else if (ACTION_UPDATE.equals(action)) show(intent);
        return START_NOT_STICKY;
    }

    private void show(Intent intent) {
        boolean playing = intent.getBooleanExtra(EXTRA_PLAYING, false);
        Notification notification = build(intent.getStringExtra(EXTRA_TITLE), intent.getStringExtra(EXTRA_ARTIST), playing);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        try {
            ServiceCompat.startForeground(this, ID, notification, type);
        } catch (Exception e) {
            // Android no deja pasar a primer plano desde el fondo: se queda sin controles.
            stopSelf();
            return;
        }
        // En pausa la notificación se puede descartar; el servicio deja de retener la app.
        if (!playing) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
    }

    private PendingIntent tap(String action, int code) {
        Intent intent = new Intent(this, PlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification build(String title, String artist, boolean playing) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Reproducción", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Controles del podcast que está sonando");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_faro)
            .setContentTitle(title == null ? "Faro" : title)
            .setContentText(artist)
            .setContentIntent(content)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .addAction(0, "−15 s", tap(ACTION_BACK, 1))
            .addAction(0, playing ? "Pausar" : "Seguir", tap(ACTION_TOGGLE, 2))
            .addAction(0, "+30 s", tap(ACTION_FORWARD, 3))
            .setDeleteIntent(tap(ACTION_STOP, 4))
            .build();
    }
}
