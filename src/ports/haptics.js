// Vibración corta para confirmar un gesto. Fuera de Android no hace nada.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function tap(strong = false) {
    if (!Capacitor.isNativePlatform()) return;
    Haptics.impact({ style: strong ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}
