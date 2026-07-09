import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

const UPDATE_INTERVAL_MS = 60;
const SENSITIVITY = 1.4;
const MAX_TILT_DEG = 15;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Shared value with the device's left/right tilt in degrees, clamped to ±MAX_TILT_DEG. Falls back to 0 if the sensor is unavailable. */
export function useDeviceTilt(): SharedValue<number> {
  const tilt = useSharedValue(0);
  // NativeTabs mantiene la pantalla montada al cambiar de tab: sin este gate, el sensor
  // seguiría emitiendo (~16×/s) y animando tanques invisibles.
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;

    let subscription: { remove: () => void } | undefined;
    let cancelled = false;

    async function subscribe() {
      const available = await DeviceMotion.isAvailableAsync();
      if (!available || cancelled) return;

      await DeviceMotion.requestPermissionsAsync();
      if (cancelled) return;

      DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = DeviceMotion.addListener(({ rotation }) => {
        const gammaDeg = (rotation.gamma * 180) / Math.PI;
        tilt.value = clamp(gammaDeg * SENSITIVITY, -MAX_TILT_DEG, MAX_TILT_DEG);
      });
    }

    subscribe();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [tilt, isFocused]);

  return tilt;
}
