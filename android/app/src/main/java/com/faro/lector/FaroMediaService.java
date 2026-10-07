package com.faro.lector;

import android.os.Bundle;
import android.support.v4.media.MediaBrowserCompat;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import java.util.List;

/**
 * Lo que Android Auto ve de Faro: la cola de podcasts y los controles. Solo
 * funciona con Faro abierto (aunque esté en segundo plano), porque el sonido
 * lo reproduce la propia app.
 */
public class FaroMediaService extends MediaBrowserServiceCompat {

    private static final String ROOT = "faro";

    @Override
    public void onCreate() {
        super.onCreate();
        setSessionToken(MediaHub.session(this).getSessionToken());
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        return new BrowserRoot(ROOT, null);
    }

    @Override
    public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(ROOT.equals(parentId) ? MediaHub.items() : null);
    }
}
