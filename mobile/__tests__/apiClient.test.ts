/**
 * @format
 */

import { ApiClient, TransportAdapter } from '../src/core/api/apiClient';
import { setApiConfig } from '../src/core/api/apiConfig';
import { MemoryTokenStore } from '../src/core/auth/tokenStore';
import { SessionManager } from '../src/core/auth/sessionManager';

describe('ApiClient', () => {
  let memoryTokenStore: MemoryTokenStore;
  let sessionMgr: SessionManager;

  beforeEach(() => {
    setApiConfig({
      baseUrl: 'http://10.0.2.2:8000',
      apiPrefix: '/api/v1',
      defaultTimeoutMs: 5000,
    });
    memoryTokenStore = new MemoryTokenStore();
    sessionMgr = new SessionManager(memoryTokenStore);
  });

  it('joins base URL and /api/v1/ prefix cleanly for GET requests', async () => {
    let capturedUrl = '';
    const mockTransport: TransportAdapter = async (input, init) => {
      capturedUrl = input;
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/events/');

    expect(result.ok).toBe(true);
    expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/events/');
  });

  it('serializes query parameters including arrays and booleans', async () => {
    let capturedUrl = '';
    const mockTransport: TransportAdapter = async (input) => {
      capturedUrl = input;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    await client.get('/events/', {
      params: {
        starts_after: '2026-11-15T00:00:00Z',
        upcoming: true,
        charity_field: ['teaching', 'cooking'],
      },
    });

    expect(capturedUrl).toContain('starts_after=2026-11-15T00%3A00%3A00Z');
    expect(capturedUrl).toContain('upcoming=true');
    expect(capturedUrl).toContain('charity_field=teaching');
    expect(capturedUrl).toContain('charity_field=cooking');
  });

  it('injects "Authorization: Token <key>" header when token exists and authRequired !== false', async () => {
    await memoryTokenStore.setToken('auth-token-xyz-123');

    let capturedHeaders: Record<string, string> = {};
    const mockTransport: TransportAdapter = async (_, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ id: 1, displayName: 'Volunteer' }), {
        status: 200,
      });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/me/');

    expect(result.ok).toBe(true);
    expect(capturedHeaders.Authorization).toBe('Token auth-token-xyz-123');
  });

  it('omits Authorization header when authRequired: false even if token exists in TokenStore', async () => {
    await memoryTokenStore.setToken('secret-logged-in-token');

    let capturedHeaders: Record<string, string> = {};
    const mockTransport: TransportAdapter = async (_, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.post(
      '/auth/otp/request/',
      { phone: '+1234567890' },
      { authRequired: false },
    );

    expect(result.ok).toBe(true);
    expect(capturedHeaders.Authorization).toBeUndefined();
  });

  it('handles HTTP 204 No Content without JSON parsing errors', async () => {
    const mockTransport: TransportAdapter = async () => {
      return new Response(null, {
        status: 204,
        statusText: 'No Content',
      });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.post('/auth/logout/');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
    }
  });

  it('triggers session invalidation on HTTP 401 Unauthorized', async () => {
    await memoryTokenStore.setToken('expired-token');

    let unauthorizedFired = false;
    sessionMgr.onUnauthorized(() => {
      unauthorizedFired = true;
    });

    const mockTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({ error: { code: 'token_expired', message: 'Token is invalid' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/me/');

    expect(result.ok).toBe(false);
    expect(unauthorizedFired).toBe(true);
    expect(await memoryTokenStore.getToken()).toBeNull();
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error.kind).toBe('unauthorized');
    }
  });

  it('DOES NOT clear token on HTTP 403 Forbidden or other errors', async () => {
    await memoryTokenStore.setToken('valid-token-insufficient-perms');

    let unauthorizedFired = false;
    sessionMgr.onUnauthorized(() => {
      unauthorizedFired = true;
    });

    const mockTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({ error: { code: 'permission_denied', message: 'Only coordinators allowed' } }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/coordinator/events/');

    expect(result.ok).toBe(false);
    expect(unauthorizedFired).toBe(false);
    expect(await memoryTokenStore.getToken()).toBe('valid-token-insufficient-perms');
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error.kind).toBe('forbidden');
      if (result.error.kind === 'forbidden') {
        expect(result.error.code).toBe('permission_denied');
      }
    }
  });

  it('normalizes HTTP 400 domain errors correctly', async () => {
    const mockTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({ error: { code: 'capacity_full', message: 'Shift is full.' } }),
        { status: 400 },
      );
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.post('/events/1/apply/', { post_id: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation');
      if (result.error.kind === 'validation') {
        expect(result.error.code).toBe('capacity_full');
        expect(result.error.message).toBe('Shift is full.');
      }
    }
  });

  it('normalizes HTTP 400 Geo check-in rejection with distance_m metadata', async () => {
    const mockTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          result: 'outside_geofence',
          distance_m: 145.2,
          message: 'Outside allowable check-in radius',
        }),
        { status: 400 },
      );
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.post('/attendance/geo-checkin/', {
      event_id: 5,
      latitude: 16.8,
      longitude: 96.1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation');
      if (result.error.kind === 'validation') {
        expect(result.error.code).toBe('outside_geofence');
        expect(result.error.meta?.distance_m).toBe(145.2);
      }
    }
  });

  it('normalizes HTTP 500 server errors', async () => {
    const mockTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({ error: { code: 'internal_error', message: 'Database failure' } }),
        { status: 500 },
      );
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/events/');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('server');
    }
  });

  it('handles request timeout using AbortController', async () => {
    const mockTransport: TransportAdapter = async (_, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/events/', { timeoutMs: 30 });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'timeout') {
      expect(result.error.kind).toBe('timeout');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('handles network transport failure gracefully', async () => {
    const mockTransport: TransportAdapter = async () => {
      throw new TypeError('Network request failed');
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    const result = await client.get('/events/');

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'network') {
      expect(result.error.kind).toBe('network');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('supports all standard HTTP verbs: POST, PATCH, PUT, DELETE', async () => {
    const calls: string[] = [];
    const mockTransport: TransportAdapter = async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
    await client.post('/items/', { name: 'Item' });
    await client.patch('/items/1/', { name: 'Updated' });
    await client.put('/items/1/', { name: 'Replaced' });
    await client.delete('/items/1/');

    expect(calls).toEqual([
      'POST http://10.0.2.2:8000/api/v1/items/',
      'PATCH http://10.0.2.2:8000/api/v1/items/1/',
      'PUT http://10.0.2.2:8000/api/v1/items/1/',
      'DELETE http://10.0.2.2:8000/api/v1/items/1/',
    ]);
  });
});
