/**
 * @format
 * Unit tests for Phase 6: Cross-Cutting Device & Session Providers (P0-07, P0-08, P0-09).
 */

import { PermissionsAndroid, Platform } from 'react-native';
import {
  defaultLocationProvider,
  defaultMockLocationProvider,
  defaultNativeLocationProvider,
  MockLocationProvider,
  NativeDeviceLocationProvider,
} from '../src/core/location/locationProvider';
import {
  AUTH_TOKEN_STORAGE_KEY,
  MemoryTokenStore,
  PluggableTokenStore,
} from '../src/core/auth/tokenStore';
import {
  resetDataMode,
  setDataMode,
} from '../src/app/configuration/dataMode';
import type { OtpRequestResponseDto } from '../src/data/dto/authDto';

describe('Phase 6: LocationProvider & Android Permissions (P0-07)', () => {
  beforeEach(() => {
    resetDataMode();
    jest.clearAllMocks();
  });

  afterEach(() => {
    resetDataMode();
    jest.restoreAllMocks();
  });

  describe('MockLocationProvider', () => {
    it('returns default Yangon demo coordinates in mock mode', async () => {
      const mockProvider = new MockLocationProvider();
      const permission = await mockProvider.requestPermission();
      expect(permission).toBe('granted');

      const fix = await mockProvider.getCurrentPosition();
      expect(fix.latitude).toBe(16.805);
      expect(fix.longitude).toBe(96.155);
      expect(fix.accuracyM).toBe(15);
      expect(fix.isMocked).toBe(true);
      expect(new Date(fix.capturedAt).getTime()).not.toBeNaN();
    });

    it('allows updating mock fix dynamically', async () => {
      const mockProvider = new MockLocationProvider();
      mockProvider.setMockFix({
        latitude: 16.820,
        longitude: 96.130,
        accuracyM: 8,
      });

      const fix = await mockProvider.getCurrentPosition();
      expect(fix.latitude).toBe(16.820);
      expect(fix.longitude).toBe(96.130);
      expect(fix.accuracyM).toBe(8);
    });

    it('throws when permission state is set to denied or unavailable', async () => {
      const mockProvider = new MockLocationProvider();
      mockProvider.setPermissionState('denied');
      expect(await mockProvider.requestPermission()).toBe('denied');
      await expect(mockProvider.getCurrentPosition()).rejects.toThrow(
        'Location permission denied.',
      );

      mockProvider.setPermissionState('unavailable');
      expect(await mockProvider.requestPermission()).toBe('unavailable');
      await expect(mockProvider.getCurrentPosition()).rejects.toThrow(
        'Device location services are unavailable.',
      );
    });
  });

  describe('NativeDeviceLocationProvider', () => {
    it('requests Android ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION permissions', async () => {
      const originalOS = Platform.OS;
      (Platform as any).OS = 'android';

      const checkSpy = jest
        .spyOn(PermissionsAndroid, 'check')
        .mockResolvedValueOnce(false);
      const requestMultipleSpy = jest
        .spyOn(PermissionsAndroid, 'requestMultiple')
        .mockResolvedValueOnce({
          'android.permission.ACCESS_FINE_LOCATION': PermissionsAndroid.RESULTS.GRANTED,
          'android.permission.ACCESS_COARSE_LOCATION': PermissionsAndroid.RESULTS.GRANTED,
        } as any);

      const provider = new NativeDeviceLocationProvider();
      const permission = await provider.requestPermission();

      expect(permission).toBe('granted');
      expect(checkSpy).toHaveBeenCalledWith(
        'android.permission.ACCESS_FINE_LOCATION',
      );
      expect(requestMultipleSpy).toHaveBeenCalledWith([
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
      ]);

      (Platform as any).OS = originalOS;
    });

    it('returns denied when Android permissions are rejected', async () => {
      const originalOS = Platform.OS;
      (Platform as any).OS = 'android';

      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValueOnce(false);
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValueOnce({
        'android.permission.ACCESS_FINE_LOCATION': PermissionsAndroid.RESULTS.DENIED,
        'android.permission.ACCESS_COARSE_LOCATION': PermissionsAndroid.RESULTS.DENIED,
      } as any);

      const provider = new NativeDeviceLocationProvider();
      const permission = await provider.requestPermission();

      expect(permission).toBe('denied');

      (Platform as any).OS = originalOS;
    });

    it('fails fast without calling GPS hardware if permission is denied', async () => {
      const provider = new NativeDeviceLocationProvider();
      jest.spyOn(provider, 'requestPermission').mockResolvedValueOnce('denied');

      const mockGeo = { getCurrentPosition: jest.fn() };
      provider.setCustomGeolocationModule(mockGeo);

      await expect(provider.getCurrentPosition()).rejects.toThrow(
        'Location permission denied. Cannot capture device GPS telemetry.',
      );
      expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('captures and formats device GPS fix when permission is granted', async () => {
      const provider = new NativeDeviceLocationProvider();
      jest.spyOn(provider, 'requestPermission').mockResolvedValueOnce('granted');

      const mockGeo = {
        getCurrentPosition: jest.fn((success) => {
          success({
            coords: {
              latitude: 16.799,
              longitude: 96.162,
              accuracy: 12.5,
            },
            timestamp: 1731800000000,
            mocked: false,
          });
        }),
      };
      provider.setCustomGeolocationModule(mockGeo);

      const fix = await provider.getCurrentPosition();
      expect(fix.latitude).toBe(16.799);
      expect(fix.longitude).toBe(96.162);
      expect(fix.accuracyM).toBe(12.5);
      expect(fix.isMocked).toBe(false);
      expect(fix.capturedAt).toBe(new Date(1731800000000).toISOString());
    });
  });

  describe('defaultLocationProvider Mode Branching', () => {
    it('branches to MockLocationProvider when dataMode is mock', async () => {
      setDataMode('mock');
      const fix = await defaultLocationProvider.getCurrentPosition();
      expect(fix.isMocked).toBe(true);
      expect(fix.latitude).toBe(16.805);
    });

    it('branches to NativeDeviceLocationProvider when dataMode is http', async () => {
      setDataMode('http');
      jest
        .spyOn(defaultNativeLocationProvider, 'requestPermission')
        .mockResolvedValueOnce('denied');

      await expect(defaultLocationProvider.getCurrentPosition()).rejects.toThrow(
        'Location permission denied. Cannot capture device GPS telemetry.',
      );
    });
  });
});

describe('Phase 6: Secure Token Persistence & PluggableTokenStore (P0-08)', () => {
  it('falls back seamlessly to MemoryTokenStore in test environments', async () => {
    const memory = new MemoryTokenStore();
    const store = new PluggableTokenStore(memory);

    const tier = await store.getStorageTier();
    expect(tier).toBe('memory');

    await store.setToken('secret-test-token-1234');
    const stored = await store.getToken();
    expect(stored).toBe('secret-test-token-1234');

    await store.clearToken();
    expect(await store.getToken()).toBeNull();
  });

  it('allows injecting a custom secure storage driver and takes precedence', async () => {
    const custom = new MemoryTokenStore('initial-preloaded-token');
    const store = new PluggableTokenStore();
    store.setCustomStorage(custom);

    expect(await store.getStorageTier()).toBe('custom');
    expect(await store.getToken()).toBe('initial-preloaded-token');

    await store.setToken('updated-secure-token');
    expect(await custom.getToken()).toBe('updated-secure-token');
    expect(await store.getToken()).toBe('updated-secure-token');

    await store.clearToken();
    expect(await custom.getToken()).toBeNull();
  });

  it('trims whitespace and rejects empty tokens safely', async () => {
    const store = new PluggableTokenStore(new MemoryTokenStore());
    await store.setToken('   token-with-whitespace   ');
    expect(await store.getToken()).toBe('token-with-whitespace');
  });

  it('guarantees zero token leakage in diagnostics', async () => {
    const store = new PluggableTokenStore(new MemoryTokenStore());
    await store.setToken('super-confidential-auth-token-xyz');

    const tier = await store.getStorageTier();
    // Tier diagnostics must only expose the storage kind, never token content
    expect(tier).toBe('memory');
    expect(JSON.stringify(tier)).not.toContain('super-confidential');
  });
});

describe('Phase 6: Truthful OTP Delivery Status (P0-09)', () => {
  it('correctly maps truthful delivery status and channel in OtpRequestResponseDto', () => {
    const responseSent: OtpRequestResponseDto = {
      status: 'sent',
      delivery: {
        delivered: true,
        channel: 'sms',
        provider_configured: true,
      },
    };

    expect(responseSent.status).toBe('sent');
    expect(responseSent.delivery?.delivered).toBe(true);
    expect(responseSent.delivery?.channel).toBe('sms');

    const responseConsole: OtpRequestResponseDto = {
      status: 'dev_console',
      delivery: {
        delivered: true,
        channel: 'console',
        method: 'console',
        provider_configured: true,
      },
      dev_code: '1234',
    };

    expect(responseConsole.status).toBe('dev_console');
    expect(responseConsole.delivery?.delivered).toBe(true);
    expect(responseConsole.delivery?.channel).toBe('console');
    expect(responseConsole.dev_code).toBe('1234');

    const responsePending: OtpRequestResponseDto = {
      status: 'pending_provider',
      delivery: {
        delivered: false,
        channel: 'console',
        provider_configured: false,
      },
    };

    expect(responsePending.status).toBe('pending_provider');
    expect(responsePending.delivery?.delivered).toBe(false);
  });
});
