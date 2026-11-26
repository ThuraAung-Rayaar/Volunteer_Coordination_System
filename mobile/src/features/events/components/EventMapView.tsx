/**
 * @format
 * Connected MapLibre Interactive Map component for Volunteer Event Exploration
 * (single-event detail preview + expandable full map, and multi-event discovery map).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as MapLibreRN from '@maplibre/maplibre-react-native';
import { Camera, CameraRef, Map, Marker } from '@maplibre/maplibre-react-native';
import { isConsumerOnlyMode } from '../../../app/configuration/consumerMode';
import { isMockMode } from '../../../app/configuration/dataMode';
import { openDirectionsInSystemMap } from '../../../core/location/externalMaps';
import { defaultLocationProvider } from '../../../core/location/locationProvider';
import { mapApi, MapCatalogResponseDto } from '../../../data/endpoints/mapApi';
import type { EventSummary } from '../../../domain/models/event';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppText,
  StatusBadge,
} from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';

const DEFAULT_YANGON_LAT = 16.8053;
const DEFAULT_YANGON_LNG = 96.1561;

export const DEFAULT_EVENT_MAP_STYLE = {
  version: 8,
  sources: {
    'carto-raster': {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    {
      id: 'carto-raster-layer',
      type: 'raster',
      source: 'carto-raster',
    },
  ],
};

export interface EventMapPin {
  id: string;
  title: string;
  locationName: string;
  latitude: number;
  longitude: number;
  spotsRemaining?: number;
  status?: string;
}

export interface EventMapViewProps {
  mode: 'detail' | 'explore';
  /** Single event coordinates & label for detail mode */
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
  locationName?: string;
  /** Event list for explore mode */
  events?: EventSummary[];
  /** Optional user region center [latitude, longitude] & label for explore camera */
  regionCenter?: [number, number] | null;
  regionLabel?: string | null;
  onSelectEvent?: (eventId: string) => void;
  height?: number;
}

function getCoordinate(
  val: number | null | undefined,
  fallback: number,
): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

export function EventMapView({
  mode,
  latitude,
  longitude,
  title,
  locationName,
  events = [],
  regionCenter,
  regionLabel,
  onSelectEvent,
  height = 220,
}: EventMapViewProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const cameraRef = useRef<CameraRef | null>(null);
  const fullCameraRef = useRef<CameraRef | null>(null);

  const [catalog, setCatalog] = useState<MapCatalogResponseDto | null>(null);
  const [zoom, setZoom] = useState<number>(mode === 'detail' ? 14 : 11);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  useEffect(() => {
    const logManager = (MapLibreRN as { LogManager?: { onLog?: (cb: (log: { level?: string; message?: string; tag?: string }) => boolean) => void } }).LogManager;
    logManager?.onLog?.(log => {
      if (isConsumerOnlyMode()) {
        return true;
      }
      const msg = String(log?.message ?? '');
      if (msg.includes('Failed to load tile') || msg.includes('Canceled')) {
        return true;
      }
      return false;
    });
  }, []);

  const fallbackLat = regionCenter?.[0] ?? DEFAULT_YANGON_LAT;
  const fallbackLng = regionCenter?.[1] ?? DEFAULT_YANGON_LNG;

  const detailLat = getCoordinate(latitude, fallbackLat);
  const detailLng = getCoordinate(longitude, fallbackLng);
  const hasExplicitDetailCoords =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude);

  const explorePins = useMemo<EventMapPin[]>(() => {
    return events.map((evt, index) => {
      const hasCoords =
        typeof evt.latitude === 'number' &&
        Number.isFinite(evt.latitude) &&
        typeof evt.longitude === 'number' &&
        Number.isFinite(evt.longitude);
      // Slight deterministic offset only when an event has no saved coordinates so pins don't overlap identically
      const offset = hasCoords ? 0 : ((index % 5) - 2) * 0.008;
      return {
        id: evt.id,
        title: evt.title,
        locationName: evt.locationName,
        latitude: hasCoords ? (evt.latitude as number) : fallbackLat + offset,
        longitude: hasCoords ? (evt.longitude as number) : fallbackLng + offset,
        spotsRemaining: evt.spotsRemaining,
        status: evt.status,
      };
    });
  }, [events, fallbackLat, fallbackLng]);

  const [selectedPinId, setSelectedPinId] = useState<string | null>(
    () => explorePins[0]?.id ?? null,
  );

  useEffect(() => {
    if (mode !== 'explore') return;
    if (explorePins.length === 0) {
      setSelectedPinId(null);
      return;
    }
    if (!selectedPinId || !explorePins.some(p => p.id === selectedPinId)) {
      setSelectedPinId(explorePins[0].id);
    }
  }, [explorePins, mode, selectedPinId]);

  useEffect(() => {
    if (isMockMode()) {
      return;
    }
    let active = true;
    mapApi
      .getMapCatalog()
      .then(res => {
        if (active && res.ok) {
          setCatalog(res.data);
        }
      })
      .catch(() => {
        // Fallback smoothly to DEFAULT_EVENT_MAP_STYLE
      });
    return () => {
      active = false;
    };
  }, []);

  const activeMapStyle = useMemo(() => {
    if (catalog?.tile_provider_configured && catalog?.style_url) {
      return catalog.style_url;
    }
    return DEFAULT_EVENT_MAP_STYLE as any;
  }, [catalog]);

  const selectedPin = useMemo(
    () => explorePins.find(p => p.id === selectedPinId) ?? explorePins[0] ?? null,
    [explorePins, selectedPinId],
  );

  const initialCenter = useMemo<[number, number]>(() => {
    if (mode === 'detail') {
      return [detailLng, detailLat];
    }
    if (selectedPin) {
      return [selectedPin.longitude, selectedPin.latitude];
    }
    return [fallbackLng, fallbackLat];
  }, [detailLat, detailLng, fallbackLat, fallbackLng, mode, selectedPin]);

  const focusCamera = useCallback(
    (lng: number, lat: number, targetZoom: number) => {
      try {
        cameraRef.current?.easeTo?.({
          center: [lng, lat],
          zoom: targetZoom,
          duration: 320,
        });
        fullCameraRef.current?.easeTo?.({
          center: [lng, lat],
          zoom: targetZoom,
          duration: 320,
        });
      } catch {
        // Native camera ref may not be attached in Jest
      }
    },
    [],
  );

  const handleZoom = (delta: number) => {
    const nextZoom = Math.max(3, Math.min(18, zoom + delta));
    setZoom(nextZoom);
    try {
      cameraRef.current?.zoomTo?.(nextZoom, { duration: 220 });
      fullCameraRef.current?.zoomTo?.(nextZoom, { duration: 220 });
    } catch {
      // Ignore in non-native tests
    }
  };

  const handleRecenter = () => {
    const targetZoom = mode === 'detail' ? 14 : 12;
    setZoom(targetZoom);
    focusCamera(initialCenter[0], initialCenter[1], targetZoom);
  };

  const handleLocateMe = async () => {
    setIsLocating(true);
    setLocationNotice(null);
    try {
      const perm = await defaultLocationProvider.requestPermission();
      if (perm !== 'granted') {
        setLocationNotice('Location permission is required to center on your position.');
        return;
      }
      const fix = await defaultLocationProvider.getCurrentPosition();
      setUserCoords([fix.longitude, fix.latitude]);
      setZoom(14);
      focusCamera(fix.longitude, fix.latitude, 14);
    } catch (err) {
      setLocationNotice(
        err instanceof Error ? err.message : 'Unable to determine your location.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleOpenExternalMaps = async () => {
    const targetLat = mode === 'detail' ? detailLat : selectedPin?.latitude ?? detailLat;
    const targetLng = mode === 'detail' ? detailLng : selectedPin?.longitude ?? detailLng;
    const targetLabel =
      mode === 'detail'
        ? locationName || title || 'Volunteer Event'
        : selectedPin?.locationName || selectedPin?.title || 'Volunteer Event';
    const result = await openDirectionsInSystemMap({
      latitude: targetLat,
      longitude: targetLng,
      label: targetLabel,
    });
    if (result.target === 'app_store') {
      setLocationNotice('No map app found. Opened app store to install a maps app.');
    } else if (result.target === 'unavailable') {
      setLocationNotice('Unable to open directions on this device.');
    }
  };

  const handleSelectPin = (pin: EventMapPin) => {
    setSelectedPinId(pin.id);
    setZoom(13);
    focusCamera(pin.longitude, pin.latitude, 13);
  };

  const renderMapSurface = (
    refToUse: React.RefObject<CameraRef | null>,
    surfaceStyle?: object,
  ) => (
    <View
      style={[
        styles.mapViewport,
        {
          height,
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
        surfaceStyle,
      ]}
    >
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={activeMapStyle}
      >
        <Camera
          ref={refToUse}
          initialViewState={{
            center: initialCenter,
            zoom,
          }}
        />

        {mode === 'detail' ? (
          <Marker id="event-detail-pin" lngLat={[detailLng, detailLat]}>
            <View style={styles.markerWrapper}>
              <View
                style={[
                  styles.pinBubble,
                  styles.pinBorderWhite,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <AppIcon name="pin" size={16} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        ) : (
          explorePins.map(pin => {
            const isSelected = selectedPin?.id === pin.id;
            return (
              <Marker
                key={pin.id}
                id={`event-pin-${pin.id}`}
                lngLat={[pin.longitude, pin.latitude]}
                onPress={() => handleSelectPin(pin)}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Map pin: ${pin.title}`}
                  onPress={() => handleSelectPin(pin)}
                  style={styles.markerWrapper}
                >
                  <View
                    style={[
                      styles.pinBubble,
                      isSelected
                        ? styles.pinBorderWhite
                        : { borderColor: theme.colors.primary },
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.surface,
                        transform: [{ scale: isSelected ? 1.12 : 1 }],
                      },
                    ]}
                  >
                    <AppIcon
                      name="pin"
                      size={14}
                      color={isSelected ? '#FFFFFF' : theme.colors.primary}
                    />
                  </View>
                </Pressable>
              </Marker>
            );
          })
        )}

        {userCoords ? (
          <Marker id="volunteer-user-location" lngLat={userCoords}>
            <View
              style={[
                styles.userLocationDot,
                { backgroundColor: theme.colors.emerald ?? theme.colors.success },
              ]}
            />
          </Marker>
        ) : null}
      </Map>

      {/* Top Attribution / Connection Pill */}
      <View
        style={[
          styles.topBadge,
          {
            backgroundColor: hexToRgba(theme.colors.surface, 0.92),
            borderColor: theme.colors.border,
          },
        ]}
      >
        <AppIcon name="map" size={12} color={theme.colors.primary} />
        <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
          {catalog?.tile_provider_configured ? 'VCS MapLibre' : 'OpenStreetMap'}
        </AppText>
      </View>

      {/* Right-hand Zoom & Recenter Controls */}
      <View style={styles.controlsColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in map"
          onPress={() => handleZoom(1)}
          style={[
            styles.controlBtn,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
            +
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out map"
          onPress={() => handleZoom(-1)}
          style={[
            styles.controlBtn,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
            −
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map"
          onPress={handleRecenter}
          style={[
            styles.controlBtn,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppIcon name="location" size={14} color={theme.colors.primary} />
        </Pressable>
        {mode === 'explore' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my current location on map"
            onPress={handleLocateMe}
            disabled={isLocating}
            style={[
              styles.controlBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppIcon name="compass" size={14} color={theme.colors.accent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (mode === 'detail') {
    return (
      <View style={styles.detailContainer}>
        {renderMapSurface(cameraRef)}

        <View style={styles.detailFooterRow}>
          <View style={styles.coordsColumn}>
            <AppText variant="caption" weight="semibold" color={theme.colors.textPrimary}>
              {locationName || title || 'Event Venue'}
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              {hasExplicitDetailCoords
                ? `Coordinates: ${detailLat.toFixed(4)}°, ${detailLng.toFixed(4)}°`
                : `Area preview: ${detailLat.toFixed(4)}°, ${detailLng.toFixed(4)}°`}
            </AppText>
          </View>

          <View style={styles.detailActionsRow}>
            <AppButton
              label="Expand Map"
              variant="secondary"
              onPress={() => setIsExpanded(true)}
              style={styles.compactBtn}
            />
            <AppButton
              label="Directions"
              variant="outline"
              onPress={handleOpenExternalMaps}
              style={styles.compactBtn}
            />
          </View>
        </View>

        {/* Fullscreen Interactive Map Modal */}
        <Modal
          visible={isExpanded}
          animationType="slide"
          onRequestClose={() => setIsExpanded(false)}
        >
          <View style={[styles.fullscreenRoot, { backgroundColor: theme.colors.background }]}>
            <AppHeader
              title={title || 'Event Map'}
              subtitle={locationName || 'Interactive Venue Map'}
              onBackPress={() => setIsExpanded(false)}
              showNotificationBell={false}
            />
            <View style={styles.fullscreenMapWrap}>
              {renderMapSurface(fullCameraRef, styles.fullscreenViewport)}
            </View>
            <View style={styles.fullscreenBottomBar}>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {`Venue Coordinates: ${detailLat.toFixed(6)}°, ${detailLng.toFixed(6)}°`}
              </AppText>
              <AppButton
                label="Open in Google Maps"
                variant="primary"
                onPress={handleOpenExternalMaps}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Explore Mode (Volunteer Event Discovery Map)
  return (
    <View style={styles.exploreRoot}>
      {renderMapSurface(cameraRef, styles.exploreViewport)}

      {locationNotice ? (
        <View
          style={[
            styles.noticeBanner,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppText variant="caption" color={theme.colors.textSecondary}>
            {locationNotice}
          </AppText>
        </View>
      ) : null}

      {/* Horizontal quick-jump event chips + selected event detail card */}
      {explorePins.length > 0 ? (
        <View style={styles.exploreOverlayBottom}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pinChipsRow}
          >
            {explorePins.map(pin => {
              const active = selectedPin?.id === pin.id;
              return (
                <Pressable
                  key={pin.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Focus map on ${pin.title}`}
                  onPress={() => handleSelectPin(pin)}
                  style={[
                    styles.pinChip,
                    {
                      backgroundColor: active
                        ? theme.colors.primary
                        : theme.colors.surface,
                      borderColor: active
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    color={active ? '#FFFFFF' : theme.colors.textPrimary}
                    numberOfLines={1}
                  >
                    {pin.title}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedPin ? (
            <AppCard variant="raised" style={styles.selectedEventCard}>
              <View style={styles.selectedCardHeader}>
                <StatusBadge
                  status={selectedPin.status === 'active' ? 'sky' : 'emerald'}
                  label={selectedPin.status === 'active' ? 'Live / Active' : 'Published'}
                />
                {typeof selectedPin.spotsRemaining === 'number' ? (
                  <AppText variant="caption" weight="bold" color={theme.colors.success}>
                    {`${selectedPin.spotsRemaining} spots left`}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary} numberOfLines={1}>
                {selectedPin.title}
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
                {selectedPin.locationName}
              </AppText>
              <View style={styles.selectedCardActions}>
                <AppButton
                  label="View Event Details"
                  variant="primary"
                  onPress={() => onSelectEvent?.(selectedPin.id)}
                  style={styles.flexOne}
                />
                <AppButton
                  label="Directions"
                  variant="outline"
                  onPress={handleOpenExternalMaps}
                />
              </View>
            </AppCard>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyMapBanner}>
          <AppCard>
            <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
              {regionLabel ? `No events in ${regionLabel}` : 'No events on map'}
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              Adjust your search, filters, or region scope to see volunteer events.
            </AppText>
          </AppCard>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  detailContainer: {
    marginTop: 12,
    gap: 10,
  },
  mapViewport: {
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  markerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  pinBorderWhite: {
    borderColor: '#FFFFFF',
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  topBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
  },
  controlsColumn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    gap: 6,
  },
  controlBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  detailFooterRow: {
    gap: 8,
  },
  coordsColumn: {
    gap: 2,
  },
  detailActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  compactBtn: {
    flex: 1,
  },
  fullscreenRoot: {
    flex: 1,
  },
  fullscreenMapWrap: {
    flex: 1,
    padding: 12,
  },
  fullscreenViewport: {
    flex: 1,
    height: undefined,
  },
  fullscreenBottomBar: {
    padding: 16,
    gap: 10,
  },
  exploreRoot: {
    flex: 1,
    position: 'relative',
  },
  exploreViewport: {
    flex: 1,
    height: undefined,
    borderRadius: 0,
    borderWidth: 0,
  },
  noticeBanner: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 54,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  exploreOverlayBottom: {
    padding: 12,
    gap: 8,
  },
  pinChipsRow: {
    gap: 8,
    paddingHorizontal: 2,
  },
  pinChip: {
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
  },
  selectedEventCard: {
    padding: 14,
    gap: 6,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  emptyMapBanner: {
    padding: 16,
  },
  flexOne: {
    flex: 1,
  },
});
