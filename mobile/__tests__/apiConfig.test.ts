/**
 * @format
 */

import {
  API_HOST_PRESETS,
  addApiConfigListener,
  buildApiUrl,
  getApiConfig,
  resetApiConfig,
  setApiConfig,
  setApiHostPreset,
} from '../src/core/api/apiConfig';

describe('apiConfig and buildApiUrl', () => {
  beforeEach(() => {
    resetApiConfig();
  });

  afterAll(() => {
    resetApiConfig();
  });

  it('provides default config with /api/v1 prefix and 15000ms timeout', () => {
    const config = getApiConfig();
    expect(config.apiPrefix).toBe('/api/v1');
    expect(config.defaultTimeoutMs).toBe(15000);
    expect(config.baseUrl).toBe(API_HOST_PRESETS.USB_DEVICE);
    expect(config.baseUrl).toBe('http://localhost:8000');
  });

  it('switches host presets between USB device (localhost) and Android emulator (10.0.2.2)', () => {
    setApiHostPreset('emulator');
    expect(getApiConfig().baseUrl).toBe('http://10.0.2.2:8000');

    setApiHostPreset('usb');
    expect(getApiConfig().baseUrl).toBe('http://localhost:8000');
  });

  it('notifies listeners when configuration is updated or reset', () => {
    const listener = jest.fn();
    const unsubscribe = addApiConfigListener(listener);

    setApiConfig({ defaultTimeoutMs: 5000 });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ defaultTimeoutMs: 5000 }),
    );

    resetApiConfig();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ defaultTimeoutMs: 15000 }),
    );

    unsubscribe();
    listener.mockClear();
    setApiConfig({ defaultTimeoutMs: 3000 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('constructs absolute URL joining baseUrl and prefix cleanly without double slashes', () => {
    setApiConfig({ baseUrl: 'http://10.0.2.2:8000', apiPrefix: '/api/v1' });

    expect(buildApiUrl('events/')).toBe('http://10.0.2.2:8000/api/v1/events/');
    expect(buildApiUrl('/events/')).toBe('http://10.0.2.2:8000/api/v1/events/');
    expect(buildApiUrl('/auth/otp/request/')).toBe(
      'http://10.0.2.2:8000/api/v1/auth/otp/request/',
    );
  });

  it('handles baseUrl with trailing slashes and prefix without leading slashes cleanly', () => {
    setApiConfig({ baseUrl: 'http://192.168.1.100:8000///', apiPrefix: 'api/v1/' });

    expect(buildApiUrl('/me/')).toBe('http://192.168.1.100:8000/api/v1/me/');
  });

  it('does not duplicate prefix if endpoint path already includes it', () => {
    setApiConfig({ baseUrl: 'http://localhost:8000', apiPrefix: '/api/v1' });

    expect(buildApiUrl('/api/v1/events/1/')).toBe(
      'http://localhost:8000/api/v1/events/1/',
    );
  });

  it('allows overriding base host and timeout for testing or staging', () => {
    setApiConfig({
      baseUrl: 'https://staging-api.volunteermgmt.org',
      defaultTimeoutMs: 20000,
    });

    const config = getApiConfig();
    expect(config.baseUrl).toBe('https://staging-api.volunteermgmt.org');
    expect(config.defaultTimeoutMs).toBe(20000);
    expect(buildApiUrl('/charity-fields/')).toBe(
      'https://staging-api.volunteermgmt.org/api/v1/charity-fields/',
    );
  });
});
