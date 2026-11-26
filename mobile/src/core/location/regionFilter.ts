/**
 * @format
 * Region inference & event filtering so Volunteer Event Discovery focuses on
 * the region the user is currently in instead of showing the entire country.
 */

import type { EventSummary } from '../../domain/models/event';

export interface RegionDefinition {
  code: string;
  label: string;
  /** [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]];
  /** [latitude, longitude] */
  center: [number, number];
  keywords: readonly string[];
}

export const MYANMAR_REGIONS: readonly RegionDefinition[] = [
  {
    code: 'yangon',
    label: 'Yangon Region',
    bounds: [[16.35, 95.90], [17.40, 96.60]],
    center: [16.80528, 96.15611],
    keywords: [
      'yangon',
      'kamayut',
      'dagon',
      'hlaing',
      'sanchaung',
      'bahan',
      'tamwe',
      'thanlyin',
      'mingaladon',
      'insein',
      'botahtaung',
      'pabedan',
      'latha',
      'kyauktada',
      'pazundaung',
      'hlainthaya',
      'shwepyithar',
      'okkalapa',
      'thingangyun',
      'thaketa',
      'mayangone',
      'yankin',
      'riverwalk plaza',
    ],
  },
  {
    code: 'naypyidaw',
    label: 'Naypyidaw',
    bounds: [[19.30, 95.65], [20.20, 96.50]],
    center: [19.7633, 96.0785],
    keywords: ['naypyidaw', 'nay pyi taw', 'pyinmana', 'zabuthiri', 'lewe', 'tatkon'],
  },
  {
    code: 'mandalay',
    label: 'Mandalay Region',
    bounds: [[19.30, 95.20], [22.40, 96.80]],
    center: [21.9588, 96.0891],
    keywords: [
      'mandalay',
      'chanayethazan',
      'aungmyaythazan',
      'mahaaungmyay',
      'chanmyathazi',
      'pyigyidagun',
      'amarapura',
      'pyin oo lwin',
      'meiktila',
      'kyaukse',
      'nyoung-u',
      'bagan',
    ],
  },
  {
    code: 'bago',
    label: 'Bago Region',
    bounds: [[16.75, 94.70], [19.35, 97.10]],
    center: [17.3304, 96.4814],
    keywords: ['bago', 'pyay', 'pyi', 'taungoo', 'nyaunglebin', 'thayarwady'],
  },
  {
    code: 'ayeyarwady',
    label: 'Ayeyarwady Region',
    bounds: [[15.65, 94.20], [18.30, 95.90]],
    center: [16.7792, 94.7321],
    keywords: ['ayeyarwady', 'irrawaddy', 'pathein', 'hinthada', 'maubin', 'pyapon', 'bogale'],
  },
  {
    code: 'magway',
    label: 'Magway Region',
    bounds: [[18.80, 93.90], [22.20, 95.90]],
    center: [20.1544, 94.9453],
    keywords: ['magway', 'pakokku', 'minbu', 'chauk', 'taungdwingyi', 'thayet'],
  },
  {
    code: 'sagaing',
    label: 'Sagaing Region',
    bounds: [[21.50, 93.90], [27.30, 96.90]],
    center: [22.1142, 95.1353],
    keywords: ['sagaing', 'monywa', 'shwebo', 'kalay', 'katha', 'tamu'],
  },
  {
    code: 'tanintharyi',
    label: 'Tanintharyi Region',
    bounds: [[9.60, 97.50], [15.20, 99.40]],
    center: [14.0828, 98.194],
    keywords: ['tanintharyi', 'dawei', 'myeik', 'kawthaung'],
  },
  {
    code: 'mon',
    label: 'Mon State',
    bounds: [[14.90, 96.90], [17.50, 98.20]],
    center: [16.4905, 97.6282],
    keywords: ['mon state', 'mawlamyine', 'thaton', 'ye ', 'mudon', 'kyaikto'],
  },
  {
    code: 'kayin',
    label: 'Kayin State',
    bounds: [[15.20, 96.30], [19.50, 98.70]],
    center: [16.8905, 97.6282],
    keywords: ['kayin', 'hpa-an', 'hpa an', 'myawaddy', 'kawkareik'],
  },
  {
    code: 'kayah',
    label: 'Kayah State',
    bounds: [[18.25, 96.90], [19.95, 97.90]],
    center: [19.6742, 97.2094],
    keywords: ['kayah', 'loikaw', 'demoso'],
  },
  {
    code: 'shan',
    label: 'Shan State',
    bounds: [[19.30, 96.15], [24.15, 101.20]],
    center: [20.7892, 97.0378],
    keywords: ['shan', 'taunggyi', 'inle', 'kalaw', 'lashio', 'kengtung', 'tachileik'],
  },
  {
    code: 'rakhine',
    label: 'Rakhine State',
    bounds: [[17.25, 92.15], [21.50, 94.85]],
    center: [20.1442, 92.8961],
    keywords: ['rakhine', 'sittwe', 'kyaukpyu', 'thandwe', 'maungdaw'],
  },
  {
    code: 'chin',
    label: 'Chin State',
    bounds: [[20.65, 93.10], [24.10, 94.15]],
    center: [22.6413, 93.6181],
    keywords: ['chin', 'hakha', 'falam', 'tedim', 'mindat'],
  },
  {
    code: 'kachin',
    label: 'Kachin State',
    bounds: [[23.60, 96.00], [28.55, 98.90]],
    center: [25.3833, 97.4],
    keywords: ['kachin', 'myitkyina', 'bhamo', 'putao', 'mohnyin'],
  },
];

function boundsArea(bounds: [[number, number], [number, number]]): number {
  const [[south, west], [north, east]] = bounds;
  return Math.max(0.0001, (north - south) * (east - west));
}

function isWithinBounds(
  lat: number,
  lng: number,
  bounds: [[number, number], [number, number]],
): boolean {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

export function detectRegionFromCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): RegionDefinition | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  // Prefer the smallest containing bounding box (e.g. Yangon before Bago overlap)
  const matching = MYANMAR_REGIONS.filter(r =>
    isWithinBounds(latitude, longitude, r.bounds),
  ).sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds));

  if (matching.length > 0) {
    return matching[0];
  }

  // Only match nearest region if within reasonable proximity (~2.5 deg)
  let nearest: RegionDefinition | null = null;
  let bestDistSq = 2.5 * 2.5;
  for (const region of MYANMAR_REGIONS) {
    const dLat = latitude - region.center[0];
    const dLng = longitude - region.center[1];
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      nearest = region;
    }
  }
  return nearest;
}

export function detectRegionFromText(
  rawText: string | null | undefined,
): RegionDefinition | null {
  const normalized = (rawText ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const region of MYANMAR_REGIONS) {
    if (region.keywords.some(keyword => normalized.includes(keyword))) {
      return region;
    }
  }
  return null;
}

export interface UserRegionResolution {
  region: RegionDefinition | null;
  source: 'gps' | 'profile' | 'none';
}

export function resolveUserRegion(params: {
  latitude?: number | null;
  longitude?: number | null;
  homeArea?: string | null;
}): UserRegionResolution {
  const gpsRegion = detectRegionFromCoords(params.latitude, params.longitude);
  if (gpsRegion) {
    return { region: gpsRegion, source: 'gps' };
  }

  const profileRegion = detectRegionFromText(params.homeArea);
  if (profileRegion) {
    return { region: profileRegion, source: 'profile' };
  }

  return { region: null, source: 'none' };
}

export function getEventRegion(event: Pick<EventSummary, 'latitude' | 'longitude' | 'locationName' | 'landmarkText' | 'title'>): RegionDefinition | null {
  const byCoords = detectRegionFromCoords(event.latitude, event.longitude);
  if (byCoords) {
    return byCoords;
  }
  return detectRegionFromText(
    [event.locationName, event.landmarkText, event.title].filter(Boolean).join(' '),
  );
}

/**
 * Filters a list of events down to the user's current region.
 * Events belonging explicitly to another region (by coordinates or venue/area text)
 * are excluded; if no user region is known, returns all events unchanged.
 */
export function filterEventsByUserRegion(
  events: readonly EventSummary[],
  userRegion: RegionDefinition | null | undefined,
): EventSummary[] {
  if (!userRegion) {
    return [...events];
  }

  return events.filter(evt => {
    const evtRegion = getEventRegion(evt);
    if (evtRegion) {
      return evtRegion.code === userRegion.code;
    }
    return false;
  });
}
