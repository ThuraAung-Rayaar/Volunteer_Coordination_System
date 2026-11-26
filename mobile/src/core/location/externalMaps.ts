/**
 * @format
 * Opens turn-by-turn directions in an installed system map application
 * (Google Maps, Apple Maps, or Android `geo:` handler) and falls back to
 * opening Play Store / App Store to download a maps app when none is installed.
 */

import { Linking, Platform } from 'react-native';

export interface OpenDirectionsOptions {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface OpenDirectionsResult {
  opened: boolean;
  target: 'map_app' | 'app_store' | 'unavailable';
  url?: string;
}

const ANDROID_MAPS_PLAY_STORE_MARKET =
  'market://details?id=com.google.android.apps.maps';
const ANDROID_MAPS_PLAY_STORE_WEB =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.maps';
const IOS_MAPS_APP_STORE_SCHEME =
  'itms-apps://itunes.apple.com/app/id585027354';
const IOS_MAPS_APP_STORE_WEB =
  'https://apps.apple.com/app/google-maps/id585027354';

async function tryOpenFirstSupportedUrl(
  candidates: readonly string[],
): Promise<string | null> {
  for (const url of candidates) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return url;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export function buildSystemMapCandidates(
  latitude: number,
  longitude: number,
  label?: string,
  platformOs: string = Platform.OS,
): string[] {
  const safeLabel = (label ?? '').trim();
  const encodedLabel = safeLabel ? encodeURIComponent(safeLabel) : '';

  if (platformOs === 'ios') {
    return [
      `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
      encodedLabel
        ? `maps://?daddr=${latitude},${longitude}&q=${encodedLabel}`
        : `maps://?daddr=${latitude},${longitude}`,
    ];
  }

  return [
    `google.navigation:q=${latitude},${longitude}`,
    encodedLabel
      ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
  ];
}

export function buildStoreFallbackCandidates(
  platformOs: string = Platform.OS,
): string[] {
  if (platformOs === 'ios') {
    return [IOS_MAPS_APP_STORE_SCHEME, IOS_MAPS_APP_STORE_WEB];
  }
  return [ANDROID_MAPS_PLAY_STORE_MARKET, ANDROID_MAPS_PLAY_STORE_WEB];
}

export async function openDirectionsInSystemMap({
  latitude,
  longitude,
  label,
}: OpenDirectionsOptions): Promise<OpenDirectionsResult> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { opened: false, target: 'unavailable' };
  }

  const mapCandidates = buildSystemMapCandidates(latitude, longitude, label);
  const openedMapUrl = await tryOpenFirstSupportedUrl(mapCandidates);
  if (openedMapUrl) {
    return { opened: true, target: 'map_app', url: openedMapUrl };
  }

  const storeCandidates = buildStoreFallbackCandidates();
  const openedStoreUrl = await tryOpenFirstSupportedUrl(storeCandidates);
  if (openedStoreUrl) {
    return { opened: true, target: 'app_store', url: openedStoreUrl };
  }

  // Last-resort attempt directly opening store web listing without canOpenURL gate
  const fallbackStoreUrl = storeCandidates[storeCandidates.length - 1];
  try {
    await Linking.openURL(fallbackStoreUrl);
    return { opened: true, target: 'app_store', url: fallbackStoreUrl };
  } catch {
    return { opened: false, target: 'unavailable' };
  }
}
