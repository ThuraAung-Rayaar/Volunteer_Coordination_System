/**
 * @format
 * Cross-cutting Location Provider contract and implementations (P0-07).
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { isMockMode } from '../../app/configuration/dataMode';

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
  isMocked: boolean;
}

export interface LocationProvider {
  requestPermission(): Promise<'granted' | 'denied' | 'unavailable'>;
  getCurrentPosition(): Promise<LocationFix>;
}

/**
 * Mock location provider used in Mock Mode and unit tests.
 * Never calls native Android/iOS APIs or hardware sensors.
 */
export class MockLocationProvider implements LocationProvider {
  private currentFix: LocationFix;
  private permissionState: 'granted' | 'denied' | 'unavailable' = 'granted';

  constructor(defaultFix?: Partial<LocationFix>) {
    this.currentFix = {
      latitude: defaultFix?.latitude ?? 16.805,
      longitude: defaultFix?.longitude ?? 96.155,
      accuracyM: defaultFix?.accuracyM ?? 15,
      capturedAt: defaultFix?.capturedAt ?? new Date().toISOString(),
      isMocked: defaultFix?.isMocked ?? true,
    };
  }

  public setMockFix(fix: Partial<LocationFix>): void {
    this.currentFix = {
      ...this.currentFix,
      ...fix,
      capturedAt: fix.capturedAt ?? new Date().toISOString(),
    };
  }

  public setPermissionState(state: 'granted' | 'denied' | 'unavailable'): void {
    this.permissionState = state;
  }

  async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
    return this.permissionState;
  }

  async getCurrentPosition(): Promise<LocationFix> {
    if (this.permissionState === 'denied') {
      throw new Error('Location permission denied.');
    }
    if (this.permissionState === 'unavailable') {
      throw new Error('Device location services are unavailable.');
    }
    return {
      ...this.currentFix,
      capturedAt: new Date().toISOString(),
    };
  }
}

/**
 * Native device location provider.
 * Uses PermissionsAndroid on Android + dynamic navigator.geolocation / @react-native-community/geolocation.
 * Fails fast with clear error if permissions are denied or GPS fix is unavailable.
 * NEVER falls back to hardcoded mock coordinates.
 */
export class NativeDeviceLocationProvider implements LocationProvider {
  private customGeolocationModule: any = null;

  /**
   * Allows injecting a custom geolocation module for testing or platform bridges.
   */
  public setCustomGeolocationModule(mod: any): void {
    this.customGeolocationModule = mod;
  }

  async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
    if (Platform.OS === 'android') {
      if (!PermissionsAndroid || typeof PermissionsAndroid.request !== 'function') {
        return 'unavailable';
      }
      try {
        const fineLocation = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
        const coarseLocation = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;

        const hasFine = await PermissionsAndroid.check(fineLocation);
        if (hasFine) {
          return 'granted';
        }

        const granted = await PermissionsAndroid.requestMultiple([
          fineLocation,
          coarseLocation,
        ]);

        if (
          granted[fineLocation] === PermissionsAndroid.RESULTS.GRANTED ||
          granted[coarseLocation] === PermissionsAndroid.RESULTS.GRANTED
        ) {
          return 'granted';
        }
        return 'denied';
      } catch {
        return 'unavailable';
      }
    }

    if (Platform.OS === 'ios') {
      const geo = this.resolveGeolocationModule();
      if (geo && typeof geo.requestAuthorization === 'function') {
        try {
          geo.requestAuthorization();
          return 'granted';
        } catch {
          return 'unavailable';
        }
      }
      return 'granted';
    }

    return 'unavailable';
  }

  async getCurrentPosition(): Promise<LocationFix> {
    const permission = await this.requestPermission();
    if (permission === 'denied') {
      throw new Error('Location permission denied. Cannot capture device GPS telemetry.');
    }
    if (permission === 'unavailable') {
      throw new Error('Device location services are unavailable.');
    }

    const geo = this.resolveGeolocationModule();
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      throw new Error('No device geolocation service is available.');
    }

    return new Promise<LocationFix>((resolve, reject) => {
      geo.getCurrentPosition(
        (position: any) => {
          if (!position || !position.coords) {
            reject(new Error('Invalid GPS fix received from device.'));
            return;
          }
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy ?? null,
            capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
            isMocked: Boolean(position.mocked),
          });
        },
        (error: any) => {
          const message = error?.message || 'Failed to capture GPS fix.';
          reject(new Error(`Device GPS fix failed: ${message}`));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        },
      );
    });
  }

  private resolveGeolocationModule(): any {
    if (this.customGeolocationModule) {
      return this.customGeolocationModule;
    }
    try {
      const communityGeo = require('@react-native-community/geolocation');
      return communityGeo.default || communityGeo;
    } catch {
      try {
        const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
        if (g && g.navigator && g.navigator.geolocation) {
          return g.navigator.geolocation;
        }
      } catch {
        // Fallthrough
      }
      return null;
    }
  }
}

export const defaultMockLocationProvider = new MockLocationProvider();
export const defaultNativeLocationProvider = new NativeDeviceLocationProvider();

/**
 * Default location provider that branches based on global dataMode:
 * - In Mock Mode: uses defaultMockLocationProvider (returns Yangon demo coordinates)
 * - In HTTP Mode: uses defaultNativeLocationProvider (queries hardware sensors; fails fast if denied)
 */
export const defaultLocationProvider: LocationProvider = {
  async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
    if (isMockMode()) {
      return defaultMockLocationProvider.requestPermission();
    }
    return defaultNativeLocationProvider.requestPermission();
  },
  async getCurrentPosition(): Promise<LocationFix> {
    if (isMockMode()) {
      return defaultMockLocationProvider.getCurrentPosition();
    }
    return defaultNativeLocationProvider.getCurrentPosition();
  },
};
