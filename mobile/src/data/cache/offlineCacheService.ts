/**
 * @format
 */

import type { UserProfileSnapshot } from '../../domain/models';
import type { RepositoryContextType } from '../../app/RepositoryProvider';
import { queryCache } from './QueryCache';
import {
  defaultOfflineCacheStorage,
  type OfflineCacheSnapshotPayload,
} from './offlineCacheStorage';

let lastCachedUser: UserProfileSnapshot | null = null;
let persistenceUnsubscribe: (() => void) | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function getLastCachedUser(): UserProfileSnapshot | null {
  return lastCachedUser;
}

export async function setLastCachedUser(
  user: UserProfileSnapshot | null,
): Promise<void> {
  lastCachedUser = user;
  await persistOfflineSnapshotNow();
}

export async function persistOfflineSnapshotNow(): Promise<void> {
  const payload: OfflineCacheSnapshotPayload = {
    version: 1,
    savedAt: Date.now(),
    lastUser: lastCachedUser,
    entries: queryCache.exportSnapshot(),
  };
  await defaultOfflineCacheStorage.saveSnapshot(payload);
}

export function startOfflineCachePersistence(): () => void {
  if (persistenceUnsubscribe) {
    return persistenceUnsubscribe;
  }

  persistenceUnsubscribe = queryCache.subscribe(() => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }
    saveDebounceTimer = setTimeout(() => {
      persistOfflineSnapshotNow().catch(() => {
        // Non-fatal persistence error
      });
    }, 150);
  });

  return () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    persistenceUnsubscribe?.();
    persistenceUnsubscribe = null;
  };
}

export async function hydrateOfflineCacheFromStorage(): Promise<{
  restoredEntries: number;
  lastUser: UserProfileSnapshot | null;
  savedAt: number | null;
}> {
  const snapshot = await defaultOfflineCacheStorage.loadSnapshot();
  if (!snapshot) {
    return { restoredEntries: 0, lastUser: null, savedAt: null };
  }
  queryCache.hydrateSnapshot(snapshot.entries);
  lastCachedUser = snapshot.lastUser ?? null;
  return {
    restoredEntries: snapshot.entries.length,
    lastUser: lastCachedUser,
    savedAt: snapshot.savedAt ?? null,
  };
}

export async function clearOfflineCacheAll(): Promise<void> {
  lastCachedUser = null;
  queryCache.clear();
  await defaultOfflineCacheStorage.clearSnapshot();
}

/**
 * Warms core read caches in the background right after a live sign-in
 * so Offline Mode immediately has real BFF data ready.
 */
export async function warmOfflineCache(
  repositories: Pick<
    RepositoryContextType,
    'dashboardRepository' | 'eventRepository' | 'profileRepository'
  >,
): Promise<void> {
  await Promise.allSettled([
    repositories.dashboardRepository.getDashboardSummary(),
    repositories.eventRepository.getEvents(),
    repositories.eventRepository.getCharityFields(),
    repositories.eventRepository.getUserApplications(),
    repositories.eventRepository.getUserAssignments(),
    repositories.profileRepository.getProfile(),
    repositories.profileRepository.getAvailability(),
  ]);
  await persistOfflineSnapshotNow();
}
