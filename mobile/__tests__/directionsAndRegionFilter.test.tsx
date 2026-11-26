/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  openDirectionsInSystemMap,
} from '../src/core/location/externalMaps';
import {
  detectRegionFromCoords,
  filterEventsByUserRegion,
  resolveUserRegion,
} from '../src/core/location/regionFilter';
import { RepositoryProvider } from '../src/app/RepositoryProvider';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import { MockEventRepository } from '../src/data/mock/MockEventRepository';
import { MockProfileRepository } from '../src/data/mock/MockProfileRepository';
import { ordinaryVolunteerUser } from '../src/data/mock/fixtures/demoUsers';
import type { EventSummary } from '../src/domain/models/event';
import { EventMapView } from '../src/features/events/components/EventMapView';
import { EventDiscoveryScreen } from '../src/features/events/screens/EventDiscoveryScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithProviders(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider initialMode="light">{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (key === '_owner') {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
    }
    return value;
  });
}

describe('System Map Directions & User Region Event Filtering', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    (Platform as any).OS = 'android';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    (Platform as any).OS = originalOs;
    jest.restoreAllMocks();
  });

  it('opens Android system/Google Maps app when supported on device', async () => {
    const canOpenSpy = jest
      .spyOn(Linking, 'canOpenURL')
      .mockImplementation(async url => url.startsWith('google.navigation:'));
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    const res = await openDirectionsInSystemMap({
      latitude: 16.7725,
      longitude: 96.1583,
      label: 'Pier 4',
    });

    expect(canOpenSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('google.navigation:q=16.7725,96.1583');
    expect(res.opened).toBe(true);
    expect(res.target).toBe('map_app');
  });

  it('falls back to Play Store when no map app is installed on Android', async () => {
    jest
      .spyOn(Linking, 'canOpenURL')
      .mockImplementation(async url => url.startsWith('market://'));
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    const res = await openDirectionsInSystemMap({
      latitude: 16.8053,
      longitude: 96.1561,
      label: 'Yangon Event',
    });

    expect(openSpy).toHaveBeenCalledWith(
      'market://details?id=com.google.android.apps.maps',
    );
    expect(res.opened).toBe(true);
    expect(res.target).toBe('app_store');
  });

  it('opens iOS Apple Maps / Google Maps and falls back to App Store when missing', async () => {
    (Platform as any).OS = 'ios';
    jest
      .spyOn(Linking, 'canOpenURL')
      .mockImplementation(async url => url.startsWith('maps://'));
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    const mapRes = await openDirectionsInSystemMap({
      latitude: 16.8,
      longitude: 96.15,
      label: 'Venue',
    });
    expect(mapRes.target).toBe('map_app');
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('maps://?daddr=16.8,96.15'));

    jest.restoreAllMocks();
    (Platform as any).OS = 'ios';
    jest
      .spyOn(Linking, 'canOpenURL')
      .mockImplementation(async url => url.startsWith('itms-apps://'));
    const storeSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    const storeRes = await openDirectionsInSystemMap({
      latitude: 16.8,
      longitude: 96.15,
    });
    expect(storeRes.target).toBe('app_store');
    expect(storeSpy).toHaveBeenCalledWith('itms-apps://itunes.apple.com/app/id585027354');
  });

  it('triggers system map direction handler from EventMapView Directions button', async () => {
    const canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        renderWithProviders(
          <EventMapView
            mode="detail"
            latitude={16.7725}
            longitude={96.1583}
            title="Pier Cleanup"
            locationName="Downtown Pier 4"
          />,
        ),
      );
    });

    const dirBtn = tree.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Directions');
    expect(dirBtn).toBeDefined();

    await act(async () => {
      await dirBtn!.props.onPress();
    });

    expect(canOpenSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('resolves Myanmar regions from GPS or homeArea and filters country-wide events down to user region', () => {
    expect(detectRegionFromCoords(16.8053, 96.1561)?.code).toBe('yangon');
    expect(detectRegionFromCoords(21.9588, 96.0891)?.code).toBe('mandalay');
    expect(detectRegionFromCoords(19.7633, 96.0785)?.code).toBe('naypyidaw');

    const resolvedFromHome = resolveUserRegion({
      homeArea: 'Chanayethazan, Mandalay',
    });
    expect(resolvedFromHome.source).toBe('profile');
    expect(resolvedFromHome.region?.code).toBe('mandalay');

    const countryEvents: EventSummary[] = [
      {
        id: 'ygn-1',
        title: 'Yangon Event',
        description: '',
        purposeType: 'charity_event',
        status: 'published',
        locationName: 'Kamayut, Yangon',
        latitude: 16.82,
        longitude: 96.13,
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T12:00:00Z',
        charityFields: ['environment'],
        coordinatorName: 'Coord',
        spotsRemaining: 5,
        mealsProvided: false,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
      },
      {
        id: 'mdy-1',
        title: 'Mandalay Relief',
        description: '',
        purposeType: 'charity_event',
        status: 'published',
        locationName: 'Chanayethazan, Mandalay',
        latitude: 21.96,
        longitude: 96.09,
        startAt: '2026-12-02T08:00:00Z',
        endAt: '2026-12-02T12:00:00Z',
        charityFields: ['food_distribution'],
        coordinatorName: 'Coord',
        spotsRemaining: 3,
        mealsProvided: false,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
      },
      {
        id: 'npt-1',
        title: 'Naypyidaw Aid',
        description: '',
        purposeType: 'charity_event',
        status: 'published',
        locationName: 'Zabuthiri, Naypyidaw',
        latitude: 19.76,
        longitude: 96.08,
        startAt: '2026-12-03T08:00:00Z',
        endAt: '2026-12-03T12:00:00Z',
        charityFields: ['logistics'],
        coordinatorName: 'Coord',
        spotsRemaining: 2,
        mealsProvided: false,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
      },
    ];

    const mdyOnly = filterEventsByUserRegion(countryEvents, resolvedFromHome.region);
    expect(mdyOnly.map(e => e.id)).toEqual(['mdy-1']);
  });

  it('filters EventDiscoveryScreen down to user region by default and allows widening to All Regions', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

    const eventRepo = new MockEventRepository();
    const baseEvents = await eventRepo.getEvents();
    jest.spyOn(eventRepo, 'getEvents').mockResolvedValue([
      ...baseEvents,
      {
        id: 'evt-mdy-999',
        title: 'Mandalay Community Clinic Drive',
        description: 'Support regional clinic setup',
        purposeType: 'charity_event',
        status: 'published',
        locationName: 'Chanayethazan Township, Mandalay',
        latitude: 21.9588,
        longitude: 96.0891,
        startAt: '2026-12-05T08:00:00Z',
        endAt: '2026-12-05T14:00:00Z',
        charityFields: ['other'],
        coordinatorName: 'Mandalay Lead',
        spotsRemaining: 6,
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
      },
    ]);

    const profileRepo = new MockProfileRepository();
    const mockCtx: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        renderWithProviders(
          <UserContext.Provider value={mockCtx}>
            <RepositoryProvider
              repositories={{
                eventRepository: eventRepo,
                profileRepository: profileRepo,
              }}
            >
              <EventDiscoveryScreen />
            </RepositoryProvider>
          </UserContext.Provider>,
        ),
      );
    });

    try {
      // User profile homeArea is Kamayut Township (Yangon Region) -> Mandalay event hidden by default
      let json = safeStringify(tree.toJSON());
      expect(json).toContain('Region: Yangon Region');
      expect(json).toContain('Riverbank Environmental Cleanup');
      expect(json).not.toContain('Mandalay Community Clinic Drive');

      // Toggling to All Regions displays country-wide events
      const allRegionsBtn = tree.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'All Regions');
      expect(allRegionsBtn).toBeDefined();

      await act(async () => {
        allRegionsBtn!.props.onPress();
      });

      json = safeStringify(tree.toJSON());
      expect(json).toContain('Mandalay Community Clinic Drive');
    } finally {
      await act(async () => {
        tree.unmount();
      });
    }
  });
});
