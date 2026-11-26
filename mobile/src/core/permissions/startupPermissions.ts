/**
 * @format
 * Startup Permission Policy Service.
 *
 * Behavior:
 * - Checks location and camera permissions on app boot.
 * - If a permission is permanently granted (OS check() is already true at cold start,
 *   or previously confirmed permanent), it is NOT requested again.
 * - If a permission was granted "Only this time" (OS check() returns false on the next
 *   cold launch) or is not yet granted, it is requested every time the app starts.
 * - Tracks permanent state cleanly in AsyncStorage with in-memory fallback.
 */

import { Linking, PermissionsAndroid, Platform } from 'react-native';

export const STARTUP_PERMISSION_STORAGE_KEY = '@vcs:startup_permissions_v1';

export type StartupPermissionKey = 'location' | 'camera';

export type PermissionResolution =
  | 'permanent_granted'
  | 'session_granted'
  | 'denied'
  | 'never_ask_again'
  | 'unavailable';

export interface StartupPermissionSnapshot {
  location: PermissionResolution;
  camera: PermissionResolution;
  needsRequestOnBoot: boolean;
  allPermanentlyGranted: boolean;
}

export interface PersistedPermissionState {
  locationPermanent: boolean;
  cameraPermanent: boolean;
}

export interface StartupPermissionStorage {
  load(): Promise<PersistedPermissionState>;
  save(state: PersistedPermissionState): Promise<void>;
  clear(): Promise<void>;
}

class MemoryPermissionStorage implements StartupPermissionStorage {
  private state: PersistedPermissionState = {
    locationPermanent: false,
    cameraPermanent: false,
  };

  async load(): Promise<PersistedPermissionState> {
    return { ...this.state };
  }

  async save(state: PersistedPermissionState): Promise<void> {
    this.state = { ...state };
  }

  async clear(): Promise<void> {
    this.state = { locationPermanent: false, cameraPermanent: false };
  }
}

export class PluggablePermissionStorage implements StartupPermissionStorage {
  private fallback: StartupPermissionStorage = new MemoryPermissionStorage();
  private customStorage: StartupPermissionStorage | null = null;

  public setCustomStorage(storage: StartupPermissionStorage | null): void {
    this.customStorage = storage;
  }

  private getAsyncStorage(): {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  } | null {
    try {
      const mod = require('@react-native-async-storage/async-storage');
      const asyncStorage = mod?.default || mod;
      if (
        asyncStorage &&
        typeof asyncStorage.getItem === 'function' &&
        typeof asyncStorage.setItem === 'function'
      ) {
        return asyncStorage;
      }
    } catch {
      // Fallback to memory storage
    }
    return null;
  }

  async load(): Promise<PersistedPermissionState> {
    if (this.customStorage) {
      return this.customStorage.load();
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        const raw = await asyncStorage.getItem(STARTUP_PERMISSION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedPermissionState>;
          return {
            locationPermanent: Boolean(parsed.locationPermanent),
            cameraPermanent: Boolean(parsed.cameraPermanent),
          };
        }
      } catch {
        // Ignore parse error
      }
    }
    return this.fallback.load();
  }

  async save(state: PersistedPermissionState): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.save(state);
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.setItem(
          STARTUP_PERMISSION_STORAGE_KEY,
          JSON.stringify(state),
        );
      } catch {
        // Ignore write error
      }
    }
    return this.fallback.save(state);
  }

  async clear(): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.clear();
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.removeItem(STARTUP_PERMISSION_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    return this.fallback.clear();
  }
}

export const defaultStartupPermissionStorage = new PluggablePermissionStorage();

let sessionRequestedThisLaunch = false;

export function resetStartupPermissionSessionFlag(): void {
  sessionRequestedThisLaunch = false;
}

function getCameraPermissionModule(): {
  getCameraPermissionStatus?: () => Promise<string> | string;
  requestCameraPermission?: () => Promise<string>;
} | null {
  try {
    const vc = require('react-native-vision-camera');
    return vc?.Camera ?? null;
  } catch {
    return null;
  }
}

/**
 * Inspects OS permissions at app startup without showing any prompt.
 *
 * On Android 11+, "Only this time" grants expire when the app restarts, so
 * `PermissionsAndroid.check()` returns `false` on the next cold start, whereas
 * permanent ("While using the app") returns `true` on cold start.
 */
export async function inspectStartupPermissions(
  storage: StartupPermissionStorage = defaultStartupPermissionStorage,
): Promise<StartupPermissionSnapshot> {
  const persisted = await storage.load();

  if (Platform.OS === 'android') {
    if (!PermissionsAndroid || typeof PermissionsAndroid.check !== 'function') {
      return {
        location: 'unavailable',
        camera: 'unavailable',
        needsRequestOnBoot: false,
        allPermanentlyGranted: false,
      };
    }

    try {
      const [hasFine, hasCoarse, hasCamera] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA),
      ]);

      const hasLocation = Boolean(hasFine || hasCoarse);
      const nextPersisted: PersistedPermissionState = {
        locationPermanent: hasLocation && (!sessionRequestedThisLaunch || persisted.locationPermanent),
        cameraPermanent: Boolean(hasCamera) && (!sessionRequestedThisLaunch || persisted.cameraPermanent),
      };

      // If OS check is already true on cold start before any request this launch, it's permanent.
      if (
        nextPersisted.locationPermanent !== persisted.locationPermanent ||
        nextPersisted.cameraPermanent !== persisted.cameraPermanent
      ) {
        await storage.save(nextPersisted);
      }

      const locationRes: PermissionResolution = hasLocation
        ? nextPersisted.locationPermanent
          ? 'permanent_granted'
          : 'session_granted'
        : 'denied';
      const cameraRes: PermissionResolution = hasCamera
        ? nextPersisted.cameraPermanent
          ? 'permanent_granted'
          : 'session_granted'
        : 'denied';

      const allPermanentlyGranted =
        locationRes === 'permanent_granted' && cameraRes === 'permanent_granted';

      return {
        location: locationRes,
        camera: cameraRes,
        needsRequestOnBoot: !hasLocation || !hasCamera,
        allPermanentlyGranted,
      };
    } catch {
      return {
        location: 'unavailable',
        camera: 'unavailable',
        needsRequestOnBoot: false,
        allPermanentlyGranted: false,
      };
    }
  }

  if (Platform.OS === 'ios') {
    const cam = getCameraPermissionModule();
    let cameraStatus: PermissionResolution = 'denied';
    if (cam && typeof cam.getCameraPermissionStatus === 'function') {
      try {
        const raw = await cam.getCameraPermissionStatus();
        if (raw === 'granted' || raw === 'authorized') {
          cameraStatus = 'permanent_granted';
        }
      } catch {
        cameraStatus = 'denied';
      }
    }
    const locationStatus: PermissionResolution = persisted.locationPermanent
      ? 'permanent_granted'
      : 'denied';
    return {
      location: locationStatus,
      camera: cameraStatus,
      needsRequestOnBoot:
        locationStatus !== 'permanent_granted' ||
        cameraStatus !== 'permanent_granted',
      allPermanentlyGranted:
        locationStatus === 'permanent_granted' &&
        cameraStatus === 'permanent_granted',
    };
  }

  return {
    location: 'unavailable',
    camera: 'unavailable',
    needsRequestOnBoot: false,
    allPermanentlyGranted: false,
  };
}

/**
 * Requests only the permissions that are NOT permanently granted.
 * If all permissions are already permanently granted, returns immediately without prompting.
 */
export async function requestStartupPermissionsIfNeeded(
  storage: StartupPermissionStorage = defaultStartupPermissionStorage,
): Promise<StartupPermissionSnapshot> {
  const current = await inspectStartupPermissions(storage);
  if (current.allPermanentlyGranted || !current.needsRequestOnBoot) {
    return current;
  }

  if (Platform.OS === 'android') {
    if (!PermissionsAndroid || typeof PermissionsAndroid.requestMultiple !== 'function') {
      return current;
    }

    const toRequest: Array<
      (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]
    > = [];

    if (current.location !== 'permanent_granted' && current.location !== 'session_granted') {
      toRequest.push(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );
    }
    if (current.camera !== 'permanent_granted' && current.camera !== 'session_granted') {
      toRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    if (toRequest.length === 0) {
      return current;
    }

    sessionRequestedThisLaunch = true;
    try {
      const results = await PermissionsAndroid.requestMultiple(toRequest);
      const fineRes = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const coarseRes = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
      const camRes = results[PermissionsAndroid.PERMISSIONS.CAMERA];

      let location: PermissionResolution = current.location;
      if (toRequest.includes(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) {
        if (
          fineRes === PermissionsAndroid.RESULTS.GRANTED ||
          coarseRes === PermissionsAndroid.RESULTS.GRANTED
        ) {
          location = 'session_granted';
        } else if (
          fineRes === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN &&
          coarseRes === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ) {
          location = 'never_ask_again';
        } else {
          location = 'denied';
        }
      }

      let camera: PermissionResolution = current.camera;
      if (toRequest.includes(PermissionsAndroid.PERMISSIONS.CAMERA)) {
        if (camRes === PermissionsAndroid.RESULTS.GRANTED) {
          camera = 'session_granted';
        } else if (camRes === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          camera = 'never_ask_again';
        } else {
          camera = 'denied';
        }
      }

      return {
        location,
        camera,
        needsRequestOnBoot:
          (location === 'denied') || (camera === 'denied'),
        allPermanentlyGranted:
          location === 'permanent_granted' && camera === 'permanent_granted',
      };
    } catch {
      return current;
    }
  }

  if (Platform.OS === 'ios') {
    sessionRequestedThisLaunch = true;
    let location: PermissionResolution = current.location;
    if (location !== 'permanent_granted') {
      try {
        const geo = require('@react-native-community/geolocation');
        const mod = geo?.default || geo;
        if (mod && typeof mod.requestAuthorization === 'function') {
          mod.requestAuthorization();
          location = 'session_granted';
        }
      } catch {
        // Ignore if module unavailable
      }
    }

    let camera: PermissionResolution = current.camera;
    const cam = getCameraPermissionModule();
    if (camera !== 'permanent_granted' && cam && typeof cam.requestCameraPermission === 'function') {
      try {
        const res = await cam.requestCameraPermission();
        camera = res === 'granted' || res === 'authorized' ? 'permanent_granted' : 'denied';
      } catch {
        camera = 'denied';
      }
    }

    const persisted = await storage.load();
    await storage.save({
      locationPermanent: location === 'permanent_granted' || persisted.locationPermanent,
      cameraPermanent: camera === 'permanent_granted' || persisted.cameraPermanent,
    });

    return {
      location,
      camera,
      needsRequestOnBoot:
        location !== 'permanent_granted' || camera !== 'permanent_granted',
      allPermanentlyGranted:
        location === 'permanent_granted' && camera === 'permanent_granted',
    };
  }

  return current;
}

export async function openAppPermissionSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Ignore if unsupported
  }
}
