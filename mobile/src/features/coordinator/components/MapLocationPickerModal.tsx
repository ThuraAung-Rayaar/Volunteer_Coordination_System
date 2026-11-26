/**
 * @format
 * In-App Interactive Map & Pin Picker for Event Wizard Location Selection.
 * Implements Task D requirements:
 * - MapLibre-compatible in-app coordinate selection.
 * - Confirms numeric latitude and longitude to parent form.
 * - Preserves manual coordinate entry fallback.
 * - Google Maps only as an external navigation link (does not expect return callback).
 * - Queries and reflects server map catalog readiness and attribution.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Map, Camera } from '@maplibre/maplibre-react-native';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  KeyboardLiftView,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import { mapApi, MapCatalogResponseDto } from '../../../data/endpoints/mapApi';
import { openDirectionsInSystemMap } from '../../../core/location/externalMaps';
import {
  defaultLocationProvider,
  defaultNativeLocationProvider,
} from '../../../core/location/locationProvider';

const DEFAULT_MAP_STYLE = {
  version: 8,
  sources: {
    'carto-raster': {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
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

export interface MapLocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  initialLatitude: number;
  initialLongitude: number;
  onConfirm: (lat: number, lng: number) => void;
  venueName?: string;
}

export function MapLocationPickerModal({
  visible,
  onClose,
  initialLatitude,
  initialLongitude,
  onConfirm,
  venueName,
}: MapLocationPickerModalProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const [lat, setLat] = useState<string>(String(initialLatitude || 16.8));
  const [lng, setLng] = useState<string>(String(initialLongitude || 96.15));
  const [catalog, setCatalog] = useState<MapCatalogResponseDto | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (visible) {
      setLat(String(initialLatitude || 16.8));
      setLng(String(initialLongitude || 96.15));
      loadCatalog();
    }
  }, [visible, initialLatitude, initialLongitude]);

  const loadCatalog = async () => {
    try {
      const res = await mapApi.getMapCatalog();
      if (res.ok) {
        setCatalog(res.data);
      }
    } catch {
      // In template mode or offline, catalog remains null
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      let fix = null;
      try {
        const perm = await defaultNativeLocationProvider.requestPermission();
        if (perm === 'granted') {
          fix = await defaultNativeLocationProvider.getCurrentPosition();
        }
      } catch {
        // Fallback to default provider
      }

      if (!fix) {
        fix = await defaultLocationProvider.getCurrentPosition();
      }

      setLat(fix.latitude.toFixed(6));
      setLng(fix.longitude.toFixed(6));
    } catch (err) {
      Alert.alert(
        'GPS Location Error',
        err instanceof Error ? err.message : 'Unable to acquire GPS fix.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleOpenGoogleMaps = async () => {
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (Number.isNaN(numericLat) || Number.isNaN(numericLng)) return;

    await openDirectionsInSystemMap({
      latitude: numericLat,
      longitude: numericLng,
      label: venueName || 'Event Venue',
    });
  };

  const handleConfirm = () => {
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (Number.isNaN(numericLat) || numericLat < -90 || numericLat > 90) {
      return;
    }
    if (Number.isNaN(numericLng) || numericLng < -180 || numericLng > 180) {
      return;
    }
    onConfirm(numericLat, numericLng);
    onClose();
  };

  // Adjust pin slightly via interactive step controls
  const adjustCoordinate = (dLat: number, dLng: number) => {
    const currentLat = Number(lat) || 16.8;
    const currentLng = Number(lng) || 96.15;
    setLat((currentLat + dLat).toFixed(4));
    setLng((currentLng + dLng).toFixed(4));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Event Pin Picker"
          subtitle={venueName || 'Interactive Location Selection'}
          onBackPress={onClose}
        />

        <KeyboardLiftView inModal>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
          {/* Catalog & Provider Status Notice */}
          {catalog?.tile_provider_configured ? (
            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppIcon name="info" size={16} color={theme.colors.primary} />
              <AppText variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                Tile source: {catalog.tile_attribution || 'MapLibre Raster Proxy'}.
                {catalog.offline_downloads_enabled
                  ? ' Offline region packaging enabled.'
                  : ' Offline downloads disabled by provider licensing.'}
              </AppText>
            </View>
          ) : (
            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppIcon name="info" size={16} color={theme.colors.muted} />
              <AppText variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                Using local geometric coordinates. External tile provider is not configured.
              </AppText>
            </View>
          )}

          {/* Interactive Map Viewport */}
          <View
            style={[
              styles.mapViewport,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Map
              style={StyleSheet.absoluteFill}
              mapStyle={
                catalog?.tile_provider_configured && catalog?.style_url
                  ? catalog.style_url
                  : (DEFAULT_MAP_STYLE as any)
              }
              onPress={(e: any) => {
                const coords =
                  e?.lngLat ||
                  e?.nativeEvent?.lngLat ||
                  e?.geometry?.coordinates;
                if (Array.isArray(coords) && coords.length >= 2) {
                  const [pressLng, pressLat] = coords;
                  if (!Number.isNaN(pressLat) && !Number.isNaN(pressLng)) {
                    setLat(Number(pressLat).toFixed(6));
                    setLng(Number(pressLng).toFixed(6));
                  }
                }
              }}
            >
              <Camera
                initialViewState={{
                  center: [Number(lng) || 96.15, Number(lat) || 16.8],
                  zoom: 14,
                }}
              />
            </Map>

            {/* Central Target Pin */}
            <View
              pointerEvents="none"
              style={[styles.centerPin, { backgroundColor: theme.colors.primary }]}
            >
              <AppIcon name="pin" size={24} color="#FFFFFF" />
            </View>

            {/* Pan Controls Overlay */}
            <View style={styles.panControlsContainer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pan North"
                onPress={() => adjustCoordinate(0.005, 0)}
                style={[
                  styles.panBtn,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppText variant="caption" weight="bold">
                  ▲ N
                </AppText>
              </Pressable>
              <View style={styles.panRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pan West"
                  onPress={() => adjustCoordinate(0, -0.005)}
                  style={[
                    styles.panBtn,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <AppText variant="caption" weight="bold">
                    ◀ W
                  </AppText>
                </Pressable>
                <View style={{ width: 36 }} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pan East"
                  onPress={() => adjustCoordinate(0, 0.005)}
                  style={[
                    styles.panBtn,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <AppText variant="caption" weight="bold">
                    E ▶
                  </AppText>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pan South"
                onPress={() => adjustCoordinate(-0.005, 0)}
                style={[
                  styles.panBtn,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppText variant="caption" weight="bold">
                  ▼ S
                </AppText>
              </Pressable>
            </View>
          </View>

          {/* Coordinate Display & Manual Adjustment */}
          <View style={styles.coordInputsRow}>
            <View style={{ flex: 1 }}>
              <AppInput
                label="Selected Latitude"
                value={lat}
                onChangeText={setLat}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput
                label="Selected Longitude"
                value={lng}
                onChangeText={setLng}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsCol}>
            <AppButton
              label={
                isLocating
                  ? 'Acquiring GPS Position...'
                  : 'Use Current Device GPS Location'
              }
              variant="secondary"
              loading={isLocating}
              disabled={isLocating}
              onPress={handleUseCurrentLocation}
            />
            <AppButton
              label="Confirm Pin Location"
              variant="primary"
              onPress={handleConfirm}
            />
            <AppButton
              label="Preview in Google Maps (External)"
              variant="outline"
              onPress={handleOpenGoogleMaps}
            />
            <AppButton
              label="Cancel"
              variant="ghost"
              onPress={onClose}
            />
          </View>
          </ScrollView>
        </KeyboardLiftView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 16,
    flexGrow: 1,
    gap: 12,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  mapViewport: {
    flex: 1,
    minHeight: 240,
    borderWidth: 1,
    borderRadius: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLineHorizontal: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridLineVertical: {
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth,
    position: 'absolute',
  },
  centerPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 5,
  },
  panControlsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
  },
  panRow: {
    flexDirection: 'row',
    gap: 4,
  },
  panBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButtonsCol: {
    gap: 8,
    marginTop: 4,
  },
});
