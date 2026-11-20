/**
 * @format
 */

import {
  ApiClient,
  redactSensitiveData,
  RequestTelemetry,
  TransportAdapter,
} from '../src/core/api/apiClient';
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
    const mockTransport: TransportAdapter = async (input) => {
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

  // =========================================================================
  // Phase 5 Hardened Transport Tests (Ticket AUTH-05)
  // =========================================================================

  describe('Phase 5 Hardened Transport & Telemetry (Ticket AUTH-05)', () => {
    it('automatically generates an X-Request-ID correlation header when none is provided', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockTransport: TransportAdapter = async (_, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      await client.get('/health/');

      expect(capturedHeaders['X-Request-ID']).toBeDefined();
      expect(capturedHeaders['X-Request-ID'].length).toBeGreaterThan(5);
    });

    it('preserves caller-supplied X-Request-ID correlation header', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockTransport: TransportAdapter = async (_, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      await client.get('/health/', {
        headers: { 'X-Request-ID': 'custom-trace-id-xyz-987' },
      });

      expect(capturedHeaders['X-Request-ID']).toBe('custom-trace-id-xyz-987');
    });

    it('emits structured request timing telemetry on successful completion', async () => {
      const recorded: RequestTelemetry[] = [];
      const mockTransport: TransportAdapter = async () => {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      };

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      const unsubscribe = client.onTelemetry(t => recorded.push(t));

      await client.get('/events/', {
        headers: { 'X-Request-ID': 'telemetry-test-001' },
      });

      expect(recorded.length).toBe(1);
      expect(recorded[0].requestId).toBe('telemetry-test-001');
      expect(recorded[0].method).toBe('GET');
      expect(recorded[0].url).toBe('http://10.0.2.2:8000/api/v1/events/');
      expect(recorded[0].status).toBe(200);
      expect(recorded[0].ok).toBe(true);
      expect(recorded[0].durationMs).toBeGreaterThanOrEqual(0);

      unsubscribe();
      await client.get('/events/');
      expect(recorded.length).toBe(1); // Unsubscribed, no new telemetry recorded
    });

    it('emits structured request telemetry on error and timeout responses', async () => {
      const recorded: RequestTelemetry[] = [];
      const mockTransport: TransportAdapter = async () => {
        return new Response(
          JSON.stringify({ error: { code: 'not_found', message: 'Resource not found' } }),
          { status: 404 },
        );
      };

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      client.onTelemetry(t => recorded.push(t));

      await client.get('/unknown/');

      expect(recorded.length).toBe(1);
      expect(recorded[0].status).toBe(404);
      expect(recorded[0].ok).toBe(false);
      expect(recorded[0].errorCode).toBe('not_found');
    });

    it('redacts sensitive fields (Authorization, phone, otp, code, token, cit) recursively', () => {
      const payload = {
        authorization: 'Bearer secret-access-token',
        phone: '+959123456789',
        otp: '123456',
        code: '654321',
        token: 'drf-auth-token-111',
        auth_session_token: 'challenge-session-token-222',
        cit: 'client-identity-token-333',
        password: 'my-super-secret-password',
        display_name: 'Volunteer User',
        role: 'volunteer',
        meta: {
          phone: '+959987654321',
          safe_id: 42,
          nested: {
            auth_token: 'nested-token-value',
          },
        },
      };

      const redacted = redactSensitiveData(payload) as Record<string, unknown>;

      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted.phone).toBe('[REDACTED]');
      expect(redacted.otp).toBe('[REDACTED]');
      expect(redacted.code).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.auth_session_token).toBe('[REDACTED]');
      expect(redacted.cit).toBe('[REDACTED]');
      expect(redacted.password).toBe('[REDACTED]');

      // Non-sensitive fields preserved
      expect(redacted.display_name).toBe('Volunteer User');
      expect(redacted.role).toBe('volunteer');

      // Nested fields correctly redacted
      const meta = redacted.meta as Record<string, unknown>;
      expect(meta.phone).toBe('[REDACTED]');
      expect(meta.safe_id).toBe(42);
      const nested = meta.nested as Record<string, unknown>;
      expect(nested.auth_token).toBe('[REDACTED]');
    });

    it('cleans up caller AbortSignal event listener on success exit path', async () => {
      const controller = new AbortController();
      let listenerCount = 0;

      const mockTransport: TransportAdapter = async () => {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      const originalAdd = controller.signal.addEventListener.bind(controller.signal);
      const originalRemove = controller.signal.removeEventListener.bind(controller.signal);

      jest.spyOn(controller.signal, 'addEventListener').mockImplementation((type, listener, options) => {
        if (type === 'abort') {
          listenerCount++;
        }
        return originalAdd(type, listener, options);
      });

      jest.spyOn(controller.signal, 'removeEventListener').mockImplementation((type, listener, options) => {
        if (type === 'abort') {
          listenerCount--;
        }
        return originalRemove(type, listener, options);
      });

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      await client.get('/events/', { signal: controller.signal });

      expect(listenerCount).toBe(0);
    });

    it('cleans up caller AbortSignal event listener on error/exception exit path', async () => {
      const controller = new AbortController();
      let listenerCount = 0;

      const mockTransport: TransportAdapter = async () => {
        throw new Error('Socket abruptly disconnected');
      };

      const originalAdd = controller.signal.addEventListener.bind(controller.signal);
      const originalRemove = controller.signal.removeEventListener.bind(controller.signal);

      jest.spyOn(controller.signal, 'addEventListener').mockImplementation((type, listener, options) => {
        if (type === 'abort') {
          listenerCount++;
        }
        return originalAdd(type, listener, options);
      });

      jest.spyOn(controller.signal, 'removeEventListener').mockImplementation((type, listener, options) => {
        if (type === 'abort') {
          listenerCount--;
        }
        return originalRemove(type, listener, options);
      });

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      await client.get('/events/', { signal: controller.signal });

      expect(listenerCount).toBe(0);
    });

    it('aborts request when caller AbortSignal fires during execution', async () => {
      const callerController = new AbortController();

      const mockTransport: TransportAdapter = async (_, init) => {
        if (init?.signal?.aborted) {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          throw err;
        }
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      const promise = client.get('/slow/', { signal: callerController.signal });

      // Trigger caller abort
      callerController.abort();

      const result = await promise;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('network');
      }
    });

    it('forwards explicit Idempotency-Key headers without automatic POST retry', async () => {
      let callCount = 0;
      let capturedHeaders: Record<string, string> = {};

      const mockTransport: TransportAdapter = async (_, init) => {
        callCount++;
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(
          JSON.stringify({ error: { code: 'server_error', message: 'Temporary glitch' } }),
          { status: 500 },
        );
      };

      const client = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
      const result = await client.post(
        '/checkin/attendance/manual-checkin/',
        { event_id: 1, user_id: 2 },
        { headers: { 'Idempotency-Key': 'idempotent-key-uuid-1234' } },
      );

      expect(result.ok).toBe(false);
      expect(capturedHeaders['Idempotency-Key']).toBe('idempotent-key-uuid-1234');
      // STRICT INVARIANT: Non-idempotent/POST mutations are NEVER automatically retried
      expect(callCount).toBe(1);
    });
  });
});
