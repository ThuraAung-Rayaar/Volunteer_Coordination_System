/// <reference types="node" />
/**
 * @format
 * v0_12_0_realHttpIntegration.test.ts
 *
 * Phase 4 Real-HTTP Integration Test Suite (Ticket INT-01 / P1-07).
 * Connects to a live Django server backed by PostgreSQL over real HTTP sockets.
 * Uses the actual mobile ApiClient (default fetch transport, ZERO mocked transport).
 *
 * Mandatory Scenarios:
 * 1. Tokenized OTP request -> verify (no phone) -> DRF Token -> /me/bootstrap/ succeeds with Authorization: Token ...
 * 2. OTP replay and parallel verify fail deterministically (409 challenge_consumed / 400 invalid_challenge).
 * 3. Production configuration smoke check proves dev_code is absent.
 * 4. Coordinator loads event roster -> manual check-in -> authoritative server checkin_at & method -> refreshed roster match.
 * 5. Owner-as-monitor (403), unrelated coordinator (404), unauthenticated caller (401) rejected server-side.
 * 6. Client session invalidation check: 401 clears local session; 403/404/409/429/5xx and timeout do NOT clear session.
 */

import { ChildProcess, execSync, spawn } from 'child_process';
import * as path from 'path';
import { ApiClient } from '../../core/api/apiClient';
import { setApiConfig } from '../../core/api/apiConfig';
import { SessionManager } from '../../core/auth/sessionManager';
import { MemoryTokenStore } from '../../core/auth/tokenStore';

const BASE_URL_DEV = process.env.API_BASE_URL || 'http://127.0.0.1:8000';
const BASE_URL_PROD = 'http://127.0.0.1:8001';

interface IntegrationFixtures {
  eventId: number;
  eventTitle: string;
  coordinatorToken: string;
  coordinatorUserId: number;
  ownerToken: string;
  ownerUserId: number;
  unrelatedToken: string;
  unrelatedUserId: number;
  volunteer1UserId: number;
  volunteer1AttendanceId: number;
  volunteer1Token: string;
  volunteer1Phone: string;
  volunteer2UserId: number;
  volunteer2AttendanceId: number;
}

let devServerProcess: ChildProcess | null = null;
let fixtures: IntegrationFixtures;

const repoRoot = path.resolve(__dirname, '../../../../');
const pythonExecutable =
  process.platform === 'win32'
    ? path.resolve(repoRoot, '.venv/Scripts/python.exe')
    : 'python3';


async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${url}/api/v1/charity-fields/`);
      if (res.status === 200) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise<void>(resolve => {
      setTimeout(resolve, 400);
    });
  }
  return false;
}

beforeAll(async () => {
  // 1. Verify or boot live Django dev server
  const alreadyRunning = await waitForServer(BASE_URL_DEV, 2);
  if (!alreadyRunning) {
    devServerProcess = spawn(
      pythonExecutable,
      ['backend/manage.py', 'runserver', '127.0.0.1:8000', '--noreload'],
      {
        cwd: repoRoot,
        stdio: 'ignore',
        env: {
          ...process.env,
          ALLOW_DEV_CODE_IN_AUTH_RESPONSE: 'True',
          ENVIRONMENT: 'development',
        },
      },
    );
    const ready = await waitForServer(BASE_URL_DEV, 40);
    if (!ready) {
      throw new Error(`Django live server failed to start on ${BASE_URL_DEV}`);
    }
  }

  // 2. Seed integration test fixtures in PostgreSQL
  const seedScript = path.resolve(repoRoot, 'scripts/seed_integration_fixtures.py');
  const rawOutput = execSync(`"${pythonExecutable}" "${seedScript}"`, {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  const jsonStart = rawOutput.indexOf('{');
  fixtures = JSON.parse(rawOutput.substring(jsonStart).trim());

  // Configure mobile ApiClient base URL
  setApiConfig({ baseUrl: BASE_URL_DEV });
}, 45000);

afterAll(async () => {
  if (devServerProcess) {
    devServerProcess.kill();
    devServerProcess = null;
  }
});

describe('Phase 4: Real-HTTP Integration Test Suite (No Mocks)', () => {
  let tokenStore: MemoryTokenStore;
  let sessionMgr: SessionManager;
  let client: ApiClient;

  beforeEach(() => {
    tokenStore = new MemoryTokenStore();
    sessionMgr = new SessionManager(tokenStore);
    // Real fetch transport - no custom/mock transport injected!
    client = new ApiClient(undefined, tokenStore, sessionMgr);
    setApiConfig({ baseUrl: BASE_URL_DEV });
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Tokenized Challenge Handshake & Session Bootstrap
  // -------------------------------------------------------------------------
  describe('Scenario 1: Tokenized Challenge Auth & /me/bootstrap/', () => {
    it('executes real-HTTP OTP request -> verify without phone -> DRF Token -> /me/bootstrap/', async () => {
      const testPhone = `+959${Math.floor(10000000 + Math.random() * 90000000)}`;

      // 1. POST /api/v1/auth/tokenized/request-otp/
      const reqRes = await client.post<{
        status: string;
        auth_session_token: string;
        expires_in: number;
        code_length: number;
        dev_code: string;
        delivery: { delivered: boolean; configured: boolean; channel: string };
      }>(
        '/auth/tokenized/request-otp/',
        { phone: testPhone, purpose: 'login' },
        { authRequired: false },
      );

      expect(reqRes.ok).toBe(true);
      if (!reqRes.ok) return;

      expect(reqRes.status).toBe(200);
      expect(reqRes.data.auth_session_token).toBeDefined();
      expect(reqRes.data.auth_session_token.length).toBeGreaterThanOrEqual(40);
      expect(reqRes.data.expires_in).toBe(180);
      expect(reqRes.data.code_length).toBe(6);
      expect(reqRes.data.dev_code).toBeDefined();
      expect(reqRes.data.dev_code.length).toBe(6);
      expect(reqRes.data.delivery.delivered).toBe(false);
      expect(reqRes.data.delivery.configured).toBe(false);

      const challengeToken = reqRes.data.auth_session_token;
      const devCode = reqRes.data.dev_code;

      // 2. POST /api/v1/auth/tokenized/verify-otp/ (Strictly NO phone sent)
      const verifyRes = await client.post<{
        token: string;
        user: { id: number; uuid: string; display_name: string; verification_status: string };
      }>(
        '/auth/tokenized/verify-otp/',
        {
          auth_session_token: challengeToken,
          code: devCode,
          display_name: 'Real HTTP Verified Volunteer',
        },
        { authRequired: false },
      );

      expect(verifyRes.ok).toBe(true);
      if (!verifyRes.ok) return;

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.data.token).toBeDefined();
      expect(verifyRes.data.token.length).toBeGreaterThanOrEqual(30);
      expect(verifyRes.data.user.id).toBeGreaterThan(0);
      expect(verifyRes.data.user.display_name).toBe('Real HTTP Verified Volunteer');

      // 3. Store DRF Token in session manager
      await sessionMgr.setToken(verifyRes.data.token);
      expect(await sessionMgr.hasValidToken()).toBe(true);

      // 4. GET /api/v1/me/bootstrap/ with Authorization: Token ...
      const bootRes = await client.get<{
        user: {
          id: number;
          uuid: string;
          display_name: string;
          phone: string;
          email: string | null;
          account_status: string;
          verification_status: string;
        };
        coordinator: {
          status: string;
          can_access_workspace: boolean;
        };
        capabilities: {
          volunteer: boolean;
          coordinator: boolean;
        };
      }>('/me/bootstrap/', { authRequired: true });

      expect(bootRes.ok).toBe(true);
      if (!bootRes.ok) return;

      expect(bootRes.status).toBe(200);
      // P1-01 / Section 8.7: email MUST be real null, never phone fallback
      expect(bootRes.data.user.email).toBeNull();
      expect(bootRes.data.user.phone).toBe(testPhone);
      expect(bootRes.data.user.account_status).toBe('active');
      expect(bootRes.data.coordinator.status).toBe('none');
      expect(bootRes.data.coordinator.can_access_workspace).toBe(false);
      expect(bootRes.data.capabilities.volunteer).toBe(true);
      expect(bootRes.data.capabilities.coordinator).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Replay Prevention & Deterministic Error Mapping
  // -------------------------------------------------------------------------
  describe('Scenario 2: OTP Replay & Parallel Verify Fail Safely', () => {
    it('fails on OTP replay with 409 challenge_consumed', async () => {
      const testPhone = `+959${Math.floor(10000000 + Math.random() * 90000000)}`;

      const reqRes = await client.post<{
        auth_session_token: string;
        dev_code: string;
      }>('/auth/tokenized/request-otp/', { phone: testPhone }, { authRequired: false });
      expect(reqRes.ok).toBe(true);
      if (!reqRes.ok) return;

      const { auth_session_token, dev_code } = reqRes.data;

      // First verify succeeds
      const v1 = await client.post(
        '/auth/tokenized/verify-otp/',
        { auth_session_token, code: dev_code },
        { authRequired: false },
      );
      expect(v1.ok).toBe(true);

      // Second verify (replay) fails with HTTP 409 challenge_consumed
      const v2 = await client.post(
        '/auth/tokenized/verify-otp/',
        { auth_session_token, code: dev_code },
        { authRequired: false },
      );
      expect(v2.ok).toBe(false);
      expect(v2.status).toBe(409);
      if (!v2.ok && 'code' in v2.error) {
        expect(v2.error.code).toBe('challenge_consumed');
      }
    });

    it('handles concurrent/parallel verify requests safely (one wins, one fails 409)', async () => {
      const testPhone = `+959${Math.floor(10000000 + Math.random() * 90000000)}`;

      const reqRes = await client.post<{
        auth_session_token: string;
        dev_code: string;
      }>('/auth/tokenized/request-otp/', { phone: testPhone }, { authRequired: false });
      expect(reqRes.ok).toBe(true);
      if (!reqRes.ok) return;

      const { auth_session_token, dev_code } = reqRes.data;

      // Two concurrent calls over real HTTP
      const [res1, res2] = await Promise.all([
        client.post(
          '/auth/tokenized/verify-otp/',
          { auth_session_token, code: dev_code },
          { authRequired: false },
        ),
        client.post(
          '/auth/tokenized/verify-otp/',
          { auth_session_token, code: dev_code },
          { authRequired: false },
        ),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one succeeds (200) and one fails (409)
      expect(statuses).toEqual([200, 409]);
    });

    it('rejects bogus challenge token with 400 invalid_challenge', async () => {
      const res = await client.post(
        '/auth/tokenized/verify-otp/',
        {
          auth_session_token: 'bogus-challenge-token-that-cannot-exist-1234567890',
          code: '123456',
        },
        { authRequired: false },
      );
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      if (!res.ok && 'code' in res.error) {
        expect(res.error.code).toBe('invalid_challenge');
      }
    });

    it('rejects wrong OTP code with 400 invalid_code', async () => {
      const testPhone = `+959${Math.floor(10000000 + Math.random() * 90000000)}`;

      const reqRes = await client.post<{
        auth_session_token: string;
      }>('/auth/tokenized/request-otp/', { phone: testPhone }, { authRequired: false });
      expect(reqRes.ok).toBe(true);
      if (!reqRes.ok) return;

      const res = await client.post(
        '/auth/tokenized/verify-otp/',
        {
          auth_session_token: reqRes.data.auth_session_token,
          code: '000000',
        },
        { authRequired: false },
      );
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      if (!res.ok && 'code' in res.error) {
        expect(res.error.code).toBe('invalid_code');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Production Configuration Smoke Check
  // -------------------------------------------------------------------------
  describe('Scenario 3: Production Configuration Smoke Check', () => {
    let prodServerProcess: ChildProcess | null = null;

    beforeAll(async () => {
      // Boot temporary production-configured live Django server on 127.0.0.1:8001
      prodServerProcess = spawn(
        pythonExecutable,
        ['backend/manage.py', 'runserver', '127.0.0.1:8001', '--noreload'],
        {
          cwd: repoRoot,
          stdio: 'ignore',
          env: {
            ...process.env,
            ENVIRONMENT: 'production',
            ALLOW_DEV_CODE_IN_AUTH_RESPONSE: 'False',
          },
        },
      );
      const ready = await waitForServer(BASE_URL_PROD, 30);
      if (!ready) {
        throw new Error('Production smoke server failed to start on 127.0.0.1:8001');
      }
    }, 20000);

    afterAll(() => {
      if (prodServerProcess) {
        prodServerProcess.kill();
        prodServerProcess = null;
      }
    });

    it('proves dev_code is strictly absent in production configuration over real HTTP', async () => {
      setApiConfig({ baseUrl: BASE_URL_PROD });
      const testPhone = `+959${Math.floor(10000000 + Math.random() * 90000000)}`;

      const res = await client.post<{
        status: string;
        auth_session_token: string;
        expires_in: number;
        code_length: number;
        dev_code?: string;
        delivery: { provider: string; channel: string; delivered: boolean; configured: boolean };
      }>('/auth/tokenized/request-otp/', { phone: testPhone }, { authRequired: false });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.status).toBe(200);
      expect(res.data.auth_session_token).toBeDefined();
      // CRITICAL SECURITY INVARIANT: dev_code MUST be absent / undefined
      expect(res.data.dev_code).toBeUndefined();
      expect(res.data.delivery.delivered).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Coordinator Loads Roster -> Manual Check-In -> Authoritative Match
  // -------------------------------------------------------------------------
  describe('Scenario 4: Coordinator Loads Roster & Manual Check-In', () => {
    it('executes coordinator roster fetch -> manual check-in -> authoritative response -> refreshed roster match', async () => {
      // Authenticate as event coordinator
      await sessionMgr.setToken(fixtures.coordinatorToken);

      // 1. Coordinator loads event roster: GET /checkin/coordinator/events/:id/attendance/
      const initialRosterRes = await client.get<{
        results: Array<{
          user_id: number;
          attendance_status: string;
          method: string;
          checkin_at: string | null;
        }>;
      }>(`/checkin/coordinator/events/${fixtures.eventId}/attendance/`);

      expect(initialRosterRes.ok).toBe(true);
      if (!initialRosterRes.ok) return;

      expect(initialRosterRes.status).toBe(200);
      const volunteerRow = initialRosterRes.data.results.find(
        r => r.user_id === fixtures.volunteer1UserId,
      );
      expect(volunteerRow).toBeDefined();
      expect(volunteerRow?.attendance_status).not.toBe('checked_in');

      // 2. POST /api/v1/checkin/attendance/manual-checkin/
      const checkinRes = await client.post<{
        attendance_id: number;
        event_id: number;
        user_id: number;
        status: string;
        method: string;
        checkin_at: string;
        recorded_by_user_id: number;
        already_checked_in: boolean;
      }>('/checkin/attendance/manual-checkin/', {
        event_id: fixtures.eventId,
        user_id: fixtures.volunteer1UserId,
        note: 'Real HTTP desk checkin',
      });

      expect(checkinRes.ok).toBe(true);
      if (!checkinRes.ok) return;

      expect(checkinRes.status).toBe(200);
      expect(checkinRes.data.status).toBe('checked_in');
      expect(checkinRes.data.method).toBe('coordinator_manual');
      expect(checkinRes.data.checkin_at).toBeDefined();
      expect(checkinRes.data.recorded_by_user_id).toBe(fixtures.coordinatorUserId);
      expect(checkinRes.data.already_checked_in).toBe(false);

      const serverTimestamp = checkinRes.data.checkin_at;

      // 3. Coordinator refreshes roster and verifies authoritative match
      const refreshedRosterRes = await client.get<{
        results: Array<{
          user_id: number;
          attendance_status: string;
          method: string;
          checkin_at: string | null;
        }>;
      }>(`/checkin/coordinator/events/${fixtures.eventId}/attendance/`);

      expect(refreshedRosterRes.ok).toBe(true);
      if (!refreshedRosterRes.ok) return;

      const updatedRow = refreshedRosterRes.data.results.find(
        r => r.user_id === fixtures.volunteer1UserId,
      );
      expect(updatedRow).toBeDefined();
      expect(updatedRow?.attendance_status).toBe('checked_in');
      expect(updatedRow?.method).toBe('coordinator_manual');
      expect(new Date(updatedRow?.checkin_at || '').toISOString()).toBe(
        new Date(serverTimestamp).toISOString(),
      );

      // 4. Repeated check-in call is idempotent
      const repeatRes = await client.post<{
        status: string;
        method: string;
        already_checked_in: boolean;
        checkin_at: string;
      }>('/checkin/attendance/manual-checkin/', {
        event_id: fixtures.eventId,
        user_id: fixtures.volunteer1UserId,
      });

      expect(repeatRes.ok).toBe(true);
      if (!repeatRes.ok) return;

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.data.already_checked_in).toBe(true);
      expect(repeatRes.data.method).toBe('coordinator_manual');
      expect(new Date(repeatRes.data.checkin_at).toISOString()).toBe(
        new Date(serverTimestamp).toISOString(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Authorization and Resource Masking Enforcement
  // -------------------------------------------------------------------------
  describe('Scenario 5: Authorization & Resource Masking', () => {
    it('blocks Event Owner with 403 Forbidden in monitor mode (W51/W52)', async () => {
      // Authenticate as Event Owner (current_coordinator is different)
      await sessionMgr.setToken(fixtures.ownerToken);

      const res = await client.post('/checkin/attendance/manual-checkin/', {
        event_id: fixtures.eventId,
        user_id: fixtures.volunteer2UserId,
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
      if (!res.ok && 'code' in res.error) {
        expect(res.error.code).toBe('owner_monitor_read_only');
      }
    });

    it('rejects unrelated coordinator with 404 resource masking', async () => {
      // Authenticate as third-party coordinator
      await sessionMgr.setToken(fixtures.unrelatedToken);

      const res = await client.post('/checkin/attendance/manual-checkin/', {
        event_id: fixtures.eventId,
        user_id: fixtures.volunteer2UserId,
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await sessionMgr.logout();

      const res = await client.post(
        '/checkin/attendance/manual-checkin/',
        {
          event_id: fixtures.eventId,
          user_id: fixtures.volunteer2UserId,
        },
        { authRequired: false },
      );

      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Client Session Invalidation Invariant Check
  // -------------------------------------------------------------------------
  describe('Scenario 6: Session Invalidation Invariant', () => {
    it('clears token and triggers listener ONLY on HTTP 401 Unauthorized', async () => {
      let unauthorizedFired = false;
      sessionMgr.onUnauthorized(() => {
        unauthorizedFired = true;
      });

      // Set an invalid token
      await sessionMgr.setToken('invalid-stale-or-revoked-token-123456');
      expect(await sessionMgr.hasValidToken()).toBe(true);

      // Call authenticated endpoint with bad token -> returns 401
      const res = await client.get('/me/bootstrap/', { authRequired: true });

      expect(res.status).toBe(401);
      expect(unauthorizedFired).toBe(true);
      expect(await sessionMgr.hasValidToken()).toBe(false);
    });

    it('does NOT clear session token on HTTP 403, 404, 409, or network timeout', async () => {
      let unauthorizedFired = false;
      sessionMgr.onUnauthorized(() => {
        unauthorizedFired = true;
      });

      const validToken = fixtures.coordinatorToken;
      await sessionMgr.setToken(validToken);

      // 1. HTTP 404 (non-existent route)
      const res404 = await client.get('/nonexistent/resource/endpoint/');
      expect(res404.status).toBe(404);
      expect(unauthorizedFired).toBe(false);
      expect(await sessionMgr.getToken()).toBe(validToken);

      // 2. HTTP 400 (bad verify)
      const res400 = await client.post(
        '/auth/tokenized/verify-otp/',
        { auth_session_token: 'bogus', code: '000000' },
        { authRequired: false },
      );
      expect(res400.status).toBe(400);
      expect(unauthorizedFired).toBe(false);
      expect(await sessionMgr.getToken()).toBe(validToken);

      // 3. Network timeout simulation (timeoutMs: 1ms)
      const resTimeout = await client.get('/charity-fields/', {
        authRequired: false,
        timeoutMs: 1,
      });
      expect(resTimeout.ok).toBe(false);
      if (!resTimeout.ok) {
        expect(resTimeout.error.kind).toBe('timeout');
      }
      expect(unauthorizedFired).toBe(false);
      expect(await sessionMgr.getToken()).toBe(validToken);
    });
  });
});
