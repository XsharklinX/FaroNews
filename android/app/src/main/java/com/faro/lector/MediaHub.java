package com.faro.lector;

import android.content.Context;
import android.os.Bundle;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * La sesión de medios de Faro: la comparten la notificación del podcast y
 * Android Auto. El sonido lo reproduce la app; aquí solo se cuenta qué suena y
 * se devuelven a la app los botones que se pulsen fuera de ella.
 */
final class MediaHub {

    private static MediaSessionCompat session;
    private static JSONArray queue = new JSONArray();

    private MediaHub() {}

    static synchronized MediaSessionCompat session(Context context) {
        if (session != null) return session;
        session = new MediaSessionCompat(context.getApplicationContext(), "Faro");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                FaroBackgroundPlugin.dispatchMedia("toggle");
            }

            @Override
            public void onPause() {
                FaroBackgroundPlugin.dispatchMedia("toggle");
            }

            @Override
            public void onSkipToNext() {
                FaroBackgroundPlugin.dispatchMedia("next");
            }

            @Override
            public void onRewind() {
                FaroBackgroundPlugin.dispatchMedia("back");
            }

            @Override
            public void onFastForward() {
                FaroBackgroundPlugin.dispatchMedia("forward");
            }

            @Override
            public void onSkipToPrevious() {
                FaroBackgroundPlugin.dispatchMedia("back");
            }

            @Override
            public void onPlayFromMediaId(String mediaId, Bundle extras) {
                FaroBackgroundPlugin.dispatchMedia("play:" + mediaId);
            }

            @Override
            public void onStop() {
                FaroBackgroundPlugin.dispatchMedia("stop");
            }
        });
        session.setActive(true);
        return session;
    }

    /** Lo que suena ahora y la cola, tal como los cuenta la app. */
    static synchronized void update(Context context, String title, String artist, boolean playing, long positionMs, long durationMs, JSONArray nextQueue) {
        MediaSessionCompat s = session(context);
        if (nextQueue != null) queue = nextQueue;
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist);
        if (durationMs > 0) meta.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        s.setMetadata(meta.build());
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_REWIND | PlaybackStateCompat.ACTION_FAST_FORWARD | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID | PlaybackStateCompat.ACTION_STOP;
        s.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, Math.max(0, positionMs), playing ? 1f : 0f)
            .build());
    }

    static synchronized void stop(Context context) {
        if (session == null) return;
        session.setPlaybackState(new PlaybackStateCompat.Builder().setState(PlaybackStateCompat.STATE_STOPPED, 0, 0f).build());
    }

    /** La cola, para que Android Auto la enseñe y se pueda elegir un episodio. */
    static synchronized List<MediaBrowserCompat.MediaItem> items() {
        List<MediaBrowserCompat.MediaItem> out = new ArrayList<>();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject entry = queue.optJSONObject(i);
            if (entry == null) continue;
            MediaDescriptionCompat description = new MediaDescriptionCompat.Builder()
                .setMediaId(entry.optString("id"))
                .setTitle(entry.optString("title"))
                .setSubtitle(entry.optString("artist"))
                .build();
            out.add(new MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE));
        }
        return out;
    }
}
