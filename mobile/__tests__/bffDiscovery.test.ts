/**
 * @format
 */

import { ApiClient, TransportAdapter } from '../src/core/api/apiClient';
import {
  buildCandidateBaseUrls,
  DEFAULT_BFF_PORT,
  normalizeBaseUrlInput,
  resetApiConfig,
  getApiConfig,
} from '../src/core/api/apiConfig';
import {
  discoverAndConnectBff,
  resetBffConnectionState,
  testCurrentBffConnection,
} from '../src/core/api/bffDiscovery';
import { resetDataMode, setDataMode } from '../src/app/configuration/dataMode';
import { MemoryTokenStore } from '../src/core/auth/tokenStore';
import { SessionManager } from '../src/core/auth/sessionManager';

describe('BFF Auto-Discovery & Connection Probe', () => {
  beforeEach(() => {
    resetDataMode();
    resetApiConfig();
    resetBffConnectionState();
  });

  afterEach(() => {
    resetDataMode();
    resetApiConfig();
    resetBffConnectionState();
  });

  it('normalizes host, port, and URL inputs cleanly', () => {
    expect(normalizeBaseUrlInput('8001')).toBe('http://localhost:8001');
    expect(normalizeBaseUrlInput('192.168.1.20')).toBe('http://192.168.1.20:8000');
    expect(normalizeBaseUrlInput('http://localhost:8000/')).toBe('http://localhost:8000');
  });

  it('builds deduplicated candidate URLs for localhost, emulator, and loopback', () => {
    const candidates = buildCandidateBaseUrls(DEFAULT_BFF_PORT, 'http://localhost:8000');
    expect(candidates).toEqual([
      'http://localhost:8000',
      'http://10.0.2.2:8000',
      'http://127.0.0.1:8000',
    ]);
  });

  it('auto-connects to emulator 10.0.2.2 when localhost is unreachable', async () => {
    const probed: string[] = [];
    const transport: TransportAdapter = async url => {
      probed.push(url);
      if (url.startsWith('http://10.0.2.2:8000')) {
        return new Response(JSON.stringify([{ code: 'education' }]), { status: 200 });
      }
      throw new Error('Connection refused');
    };

    const client = new ApiClient(
      transport,
      new MemoryTokenStore(),
      new SessionManager(new MemoryTokenStore()),
    );

    setDataMode('offline');
    const state = await discoverAndConnectBff({ client });

    expect(state.status).toBe('online');
    expect(state.activeBaseUrl).toBe('http://10.0.2.2:8000');
    expect(getApiConfig().baseUrl).toBe('http://10.0.2.2:8000');
    expect(probed[0]).toContain('http://localhost:8000/api/v1/charity-fields/');
    expect(probed[1]).toContain('http://10.0.2.2:8000/api/v1/charity-fields/');
  });

  it('transitions to offline status when all BFF probes fail', async () => {
    const transport: TransportAdapter = async () => {
      throw new Error('Network unreachable');
    };
    const client = new ApiClient(
      transport,
      new MemoryTokenStore(),
      new SessionManager(new MemoryTokenStore()),
    );

    const state = await discoverAndConnectBff({ client, port: 8005 });

    expect(state.status).toBe('offline');
    expect(state.port).toBe(8005);
    expect(state.errorMessage).toBeTruthy();
  });

  it('tests the current BFF URL directly via testCurrentBffConnection', async () => {
    const transport: TransportAdapter = async () =>
      new Response(JSON.stringify([]), { status: 200 });
    const client = new ApiClient(
      transport,
      new MemoryTokenStore(),
      new SessionManager(new MemoryTokenStore()),
    );

    const state = await testCurrentBffConnection(1500, client);
    expect(state.status).toBe('online');
    expect(state.latencyMs).not.toBeNull();
  });
});
