/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  RepositoryProvider,
  useRepositories,
} from '../src/app/RepositoryProvider';
import {
  resetDataMode,
  setDataMode,
} from '../src/app/configuration/dataMode';
import { ApiClient, TransportAdapter } from '../src/core/api/apiClient';
import { MemoryTokenStore } from '../src/core/auth/tokenStore';
import { SessionManager } from '../src/core/auth/sessionManager';
import {
  defaultCoordinatorRepository,
  defaultDashboardRepository,
  defaultEventRepository,
  defaultProfileRepository,
  MockCoordinatorRepository,
  MockDashboardRepository,
  MockEventRepository,
  MockProfileRepository,
} from '../src/data/mock';
import {
  HttpCoordinatorRepository,
  HttpDashboardRepository,
  HttpEventRepository,
  HttpProfileRepository,
} from '../src/data/http';

describe('RepositoryProvider & Dependency-Injection Bridge', () => {
  beforeEach(() => {
    act(() => {
      resetDataMode();
    });
  });

  afterEach(() => {
    act(() => {
      resetDataMode();
    });
  });

  function ConsumerComponent({
    onRender,
  }: {
    onRender: (context: ReturnType<typeof useRepositories>) => void;
  }) {
    const repos = useRepositories();
    onRender(repos);
    return <Text testID="mode">{repos.dataMode}</Text>;
  }

  it('provides Mock repositories by default when dataMode is unset', () => {
    let capturedContext: ReturnType<typeof useRepositories> | null = null;

    act(() => {
      ReactTestRenderer.create(
        <RepositoryProvider>
          <ConsumerComponent
            onRender={ctx => {
              capturedContext = ctx;
            }}
          />
        </RepositoryProvider>,
      );
    });

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.dataMode).toBe('mock');
    expect(capturedContext!.dashboardRepository).toBe(
      defaultDashboardRepository,
    );
    expect(capturedContext!.eventRepository).toBe(defaultEventRepository);
    expect(capturedContext!.profileRepository).toBe(defaultProfileRepository);
    expect(capturedContext!.coordinatorRepository).toBe(
      defaultCoordinatorRepository,
    );
  });

  it('provides Http repositories when dataMode="http" is passed', () => {
    let capturedContext: ReturnType<typeof useRepositories> | null = null;

    act(() => {
      ReactTestRenderer.create(
        <RepositoryProvider dataMode="http">
          <ConsumerComponent
            onRender={ctx => {
              capturedContext = ctx;
            }}
          />
        </RepositoryProvider>,
      );
    });

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.dataMode).toBe('http');
    expect(capturedContext!.dashboardRepository).toBeInstanceOf(
      HttpDashboardRepository,
    );
    expect(capturedContext!.eventRepository).toBeInstanceOf(
      HttpEventRepository,
    );
    expect(capturedContext!.profileRepository).toBeInstanceOf(
      HttpProfileRepository,
    );
    expect(capturedContext!.coordinatorRepository).toBeInstanceOf(
      HttpCoordinatorRepository,
    );
  });

  it('switches to Http repositories when setDataMode("http") is set globally', () => {
    act(() => {
      setDataMode('http');
    });
    let capturedContext: ReturnType<typeof useRepositories> | null = null;

    act(() => {
      ReactTestRenderer.create(
        <RepositoryProvider>
          <ConsumerComponent
            onRender={ctx => {
              capturedContext = ctx;
            }}
          />
        </RepositoryProvider>,
      );
    });

    expect(capturedContext!.dataMode).toBe('http');
    expect(capturedContext!.dashboardRepository).toBeInstanceOf(
      HttpDashboardRepository,
    );
  });

  it('reactively updates provided repositories when global dataMode changes after mount', () => {
    let capturedContext: ReturnType<typeof useRepositories> | null = null;

    act(() => {
      ReactTestRenderer.create(
        <RepositoryProvider>
          <ConsumerComponent
            onRender={ctx => {
              capturedContext = ctx;
            }}
          />
        </RepositoryProvider>,
      );
    });

    expect(capturedContext!.dataMode).toBe('mock');
    expect(capturedContext!.eventRepository).toBe(defaultEventRepository);

    act(() => {
      setDataMode('http');
    });

    expect(capturedContext!.dataMode).toBe('http');
    expect(capturedContext!.eventRepository).toBeInstanceOf(HttpEventRepository);

    act(() => {
      setDataMode('mock');
    });

    expect(capturedContext!.dataMode).toBe('mock');
    expect(capturedContext!.eventRepository).toBe(defaultEventRepository);
  });

  it('allows overriding specific repositories via repositories prop', () => {
    const customMockDashboard = new MockDashboardRepository();
    let capturedContext: ReturnType<typeof useRepositories> | null = null;

    act(() => {
      ReactTestRenderer.create(
        <RepositoryProvider
          repositories={{
            dashboardRepository: customMockDashboard,
          }}
        >
          <ConsumerComponent
            onRender={ctx => {
              capturedContext = ctx;
            }}
          />
        </RepositoryProvider>,
      );
    });

    expect(capturedContext!.dashboardRepository).toBe(customMockDashboard);
    expect(capturedContext!.eventRepository).toBe(defaultEventRepository);
  });

  it('useRepositories hook falls back safely to mock repositories outside of Provider', () => {
    let capturedContext: ReturnType<typeof useRepositories> | null = null;

    act(() => {
      ReactTestRenderer.create(
        <ConsumerComponent
          onRender={ctx => {
            capturedContext = ctx;
          }}
        />,
      );
    });

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.dataMode).toBe('mock');
    expect(capturedContext!.dashboardRepository).toBe(
      defaultDashboardRepository,
    );
  });
});

describe('Http Repositories Non-Invasive & Error Handling Guarantees', () => {
  let tokenStore: MemoryTokenStore;
  let sessionMgr: SessionManager;

  beforeEach(() => {
    tokenStore = new MemoryTokenStore();
    sessionMgr = new SessionManager(tokenStore);
  });

  it('HttpDashboardRepository throws on network failure and NEVER silently falls back to mock', async () => {
    const failingTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'internal_server_error',
            message: 'Database query failed',
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ApiClient(failingTransport, tokenStore, sessionMgr);
    const repo = new HttpDashboardRepository(client);

    await expect(repo.getDashboardSummary()).rejects.toThrow(
      'Failed to load user assignments',
    );
  });

  it('HttpDashboardRepository correctly aggregates assignments, attendance, and feedback into DashboardSummary', async () => {
    const mockTransport: TransportAdapter = async input => {
      if (input.includes('/me/assignments/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 101,
                event_id: 12,
                event_title: 'River Cleanup',
                event_status: 'active',
                post_id: 5,
                post_title: 'Team Lead',
                group_code: 'GRP-1',
                is_group_leader: true,
                status: 'assigned',
                schedule_start: '2026-11-20T08:00:00Z',
                schedule_end: '2026-11-20T12:00:00Z',
                confirmed_at: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/me/attendance/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 201,
                event_id: 8,
                event_title: 'Park Planting',
                post_title: 'Gardener',
                location_name: 'Central Park',
                status: 'completed',
                method: 'geo',
                checkin_at: '2026-11-10T09:00:00Z',
                checkout_at: '2026-11-10T12:00:00Z',
                confirmation_status: 'confirmed',
                verified_hours: 3.0,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/me/feedback/')) {
        return new Response(
          JSON.stringify({
            results: [],
            summary: {
              volunteer_avg_rating: 4.8,
              volunteer_rating_count: 5,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpDashboardRepository(client);

    const summary = await repo.getDashboardSummary();
    expect(summary.upcomingCommitments).toHaveLength(1);
    expect(summary.upcomingCommitments[0].eventTitle).toBe('River Cleanup');
    expect(summary.recentCompletedActivities).toHaveLength(1);
    expect(summary.recentCompletedActivities[0].attendanceStatus).toBe(
      'completed',
    );
    expect(summary.ratingAverage).toBe(4.8);
    expect(summary.ratingCount).toBe(5);
  });

  it('HttpEventRepository throws on HTTP failure and never returns mock events', async () => {
    const failingTransport: TransportAdapter = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'service_unavailable',
            message: 'BFF upstream unreachable',
          },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ApiClient(failingTransport, tokenStore, sessionMgr);
    const repo = new HttpEventRepository(client);

    await expect(repo.getEvents()).rejects.toThrow('Failed to load events');
  });

  it('HttpEventRepository returns null on 404 for getEventById', async () => {
    const notFoundTransport: TransportAdapter = async input => {
      if (input.includes('/events/999/')) {
        return new Response(
          JSON.stringify({ detail: 'Not found.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const client = new ApiClient(notFoundTransport, tokenStore, sessionMgr);
    const repo = new HttpEventRepository(client);

    const event = await repo.getEventById('999');
    expect(event).toBeNull();
  });

  it('HttpEventRepository applyToPost submits application and returns domain apply result', async () => {
    const mockTransport: TransportAdapter = async (input, init) => {
      if (input.includes('/events/12/apply/')) {
        const body = JSON.parse(init?.body as string);
        expect(body.post_id).toBe(3);
        expect(body.note).toBe('Ready to help');
        return new Response(
          JSON.stringify({
            id: 88,
            event_id: 12,
            event_title: 'Beach Cleanup',
            event_status: 'published',
            post_id: 3,
            post_title: 'Lifeguard',
            source: 'browse',
            status: 'applied',
            applied_at: '2026-11-15T10:00:00Z',
            decided_at: null,
            note: 'Ready to help',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpEventRepository(client);

    const result = await repo.applyToPost('12', '3', 'Ready to help');
    expect(result.success).toBe(true);
    expect(result.application?.status).toBe('applied');
    expect(result.application?.postTitle).toBe('Lifeguard');
  });

  it('HttpProfileRepository getCoordinatorEligibility accurately evaluates checks', async () => {
    const mockTransport: TransportAdapter = async input => {
      if (input.includes('/me/verification-images/')) {
        return new Response(
          JSON.stringify({
            verification_status: 'approved',
            images: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/me/coordinator/')) {
        return new Response(
          JSON.stringify({
            coordinator: {
              user_id: 42,
              status: 'pending',
              approved_by_id: null,
              approved_at: null,
              notes: 'Coordinator applicant note',
              created_at: '2026-11-01T00:00:00Z',
              updated_at: '2026-11-01T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/me/attendance/')) {
        const records = Array.from({ length: 6 }, (_, i) => ({
          id: i + 1,
          event_id: i + 10,
          status: 'completed',
          checkin_at: '2026-11-01T08:00:00Z',
          checkout_at: '2026-11-01T12:00:00Z',
        }));
        return new Response(
          JSON.stringify({ results: records }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/me/feedback/')) {
        return new Response(
          JSON.stringify({
            results: [],
            summary: {
              volunteer_avg_rating: 4.7,
              volunteer_rating_count: 6,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpProfileRepository(client);

    const eligibility = await repo.getCoordinatorEligibility();
    expect(eligibility.isVerified).toBe(true);
    expect(eligibility.completedAttendanceEventsCount).toBe(6);
    expect(eligibility.meetsCompletedEventsRequirement).toBe(true);
    expect(eligibility.meetsGoodRatingRequirement).toBe(true);
    expect(eligibility.coordinatorStatus).toBe('pending');
  });

  it('HttpCoordinatorRepository transitionEventStatus routes to exact transition endpoints', async () => {
    const calledUrls: string[] = [];
    const mockTransport: TransportAdapter = async (input, init) => {
      calledUrls.push(input);
      if (input.includes('/events/5/publish/')) {
        return new Response(
          JSON.stringify({
            id: 5,
            status: 'published',
            published_at: '2026-11-15T12:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/coordinator/events/5/summary/')) {
        return new Response(
          JSON.stringify({
            id: 5,
            title: 'Sample Event',
            status: 'published',
            start_at: '2026-11-20T08:00:00Z',
            end_at: '2026-11-20T12:00:00Z',
            acceptance_mode: 'manual',
            auto_assign_enabled: false,
            max_participants: 20,
            geo_checkin_enabled: true,
            map_provider: 'openstreetmap',
            pending_count: 0,
            accepted_count: 0,
            waitlisted_count: 0,
            assignment_count: 0,
            checked_in_count: 0,
            pending_confirmations: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpCoordinatorRepository(client);

    const result = await repo.transitionEventStatus('5', 'published');
    expect(result.success).toBe(true);
    expect(calledUrls.some(u => u.includes('/events/5/publish/'))).toBe(true);
  });
});

describe('Phase 5 Repository Contract Completeness & HTTP/Mock Parity', () => {
  let client: ApiClient;

  beforeEach(() => {
    const tokenStore = new MemoryTokenStore();
    const sessionMgr = new SessionManager(tokenStore);
    const dummyTransport: TransportAdapter = async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 });
    client = new ApiClient(dummyTransport, tokenStore, sessionMgr);
  });

  it('ProfileRepository: every required method is implemented on both Mock and Http repositories', () => {
    const mockRepo = new MockProfileRepository();
    const httpRepo = new HttpProfileRepository(client);

    const requiredProfileMethods = [
      'getProfile',
      'updateProfile',
      'getAvailability',
      'saveWeeklyRule',
      'deleteWeeklyRule',
      'saveException',
      'deleteException',
      'checkAvailabilityForEvent',
      'checkAvailabilityForWindow',
      'uploadVerificationImage',
      'updateCoordinatorApplicationNotes',
      'lookupUserByUuid',
      'getAttendanceHistory',
      'getOwnFeedback',
      'getVerificationStatus',
      'getCoordinatorEligibility',
      'submitCoordinatorApplication',
    ] as const;

    for (const method of requiredProfileMethods) {
      expect(typeof (mockRepo as any)[method]).toBe('function');
      expect(typeof (httpRepo as any)[method]).toBe('function');
    }
  });

  it('EventRepository: every required method is implemented on both Mock and Http repositories', () => {
    const mockRepo = new MockEventRepository();
    const httpRepo = new HttpEventRepository(client);

    const requiredEventMethods = [
      'getEvents',
      'getEventsPage',
      'getEventById',
      'getCharityFields',
      'applyToPost',
      'getUserApplications',
      'withdrawApplication',
      'getUserAssignments',
      'confirmAssignment',
      'cancelAssignment',
      'getEventOnboarding',
      'acknowledgeOnboarding',
      'resolveQrToken',
      'redeemQrToken',
      'qrCheckIn',
      'submitGeoCheckIn',
      'checkOutAttendance',
      'submitEventFeedback',
      'getEventFeedbackList',
    ] as const;

    for (const method of requiredEventMethods) {
      expect(typeof (mockRepo as any)[method]).toBe('function');
      expect(typeof (httpRepo as any)[method]).toBe('function');
    }
  });

  it('CoordinatorRepository: every required method is implemented on both Mock and Http repositories', () => {
    const mockRepo = new MockCoordinatorRepository();
    const httpRepo = new HttpCoordinatorRepository(client);

    const requiredCoordinatorMethods = [
      'getOverviewMetrics',
      'getMyEvents',
      'getEventDetail',
      'createDraftEvent',
      'updateEvent',
      'transitionEventStatus',
      'createEventPost',
      'updateEventPost',
      'closeEventPost',
      'handoverEvent',
      'retakeEvent',
      'getCoordinatorHistory',
      'getApplications',
      'updateApplicationStatus',
      'inviteVolunteer',
      'getAssignments',
      'getUnassignedApplications',
      'runAutoAssignment',
      'assignVolunteerManually',
      'cancelAssignment',
      'getPostCapacity',
      'lookupVolunteerByUuid',
      'createQrToken',
      'revokeQrToken',
      'getAttendanceRoster',
      'getPendingGeoConfirmations',
      'getGeoAttempts',
      'confirmGeoAttendance',
      'rejectGeoAttendance',
      'manualCheckIn',
      'submitCoordinatorFeedback',
    ] as const;

    for (const method of requiredCoordinatorMethods) {
      expect(typeof (mockRepo as any)[method]).toBe('function');
      expect(typeof (httpRepo as any)[method]).toBe('function');
    }
  });
});

describe('Phase 5 Live-BFF Bug Fix Verifications', () => {
  let tokenStore: MemoryTokenStore;
  let sessionMgr: SessionManager;

  beforeEach(() => {
    tokenStore = new MemoryTokenStore();
    sessionMgr = new SessionManager(tokenStore);
  });

  it('P1-13: MockEventRepository slices page window and preserves pagination metadata', async () => {
    const mockRepo = new MockEventRepository();
    const page1 = await mockRepo.getEventsPage(undefined, 1, 2);

    expect(page1.results).toHaveLength(2);
    expect(page1.count).toBeGreaterThan(2);
    expect(page1.next).not.toBeNull();
    expect(page1.previous).toBeNull();

    const page2 = await mockRepo.getEventsPage(undefined, 2, 2);
    expect(page2.results).toHaveLength(2);
    expect(page2.previous).not.toBeNull();
    expect(page2.results[0].id).not.toBe(page1.results[0].id);
  });

  it('P1-13: HttpEventRepository maps page results and exposes pagination metadata', async () => {
    const mockTransport: TransportAdapter = async input => {
      expect(input).toContain('/events/?page=2&page_size=3');
      return new Response(
        JSON.stringify({
          count: 5,
          next: null,
          previous: 'http://localhost/api/v1/events/?page=1',
          results: [
            {
              id: 104,
              title: 'Paged Event 4',
              status: 'published',
              purpose_type: 'charity_event',
              start_at: '2026-12-01T08:00:00Z',
              end_at: '2026-12-01T12:00:00Z',
              location_name: 'Downtown',
              total_headcount_needed: 10,
              total_headcount_filled: 2,
              charity_fields: ['health_wellness'],
              posts: [],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpEventRepository(client);

    const pageResult = await repo.getEventsPage(undefined, 2, 3);
    expect(pageResult.count).toBe(5);
    expect(pageResult.next).toBeNull();
    expect(pageResult.previous).toBe('http://localhost/api/v1/events/?page=1');
    expect(pageResult.results).toHaveLength(1);
    expect(pageResult.results[0].title).toBe('Paged Event 4');
  });

  it('P0-02: HttpCoordinatorRepository.updateApplicationStatus returns updated data item', async () => {
    const mockTransport: TransportAdapter = async (input, init) => {
      if (input.includes('/coordinator/events/10/applications/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 55,
                event_id: 10,
                user_id: 101,
                display_name: 'Volunteer A',
                status: 'pending',
                source: 'browse',
                applied_at: '2026-11-10T00:00:00Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/coordinator/applications/55/decide/')) {
        const body = JSON.parse(init?.body as string);
        expect(body.decision).toBe('accepted');
        return new Response(
          JSON.stringify({
            id: 55,
            event_id: 10,
            status: 'accepted',
            decided_at: '2026-11-12T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpCoordinatorRepository(client);

    // Warm up cache
    await repo.getApplications('10');

    const result = await repo.updateApplicationStatus('55', 'accepted');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.id).toBe('55');
    expect(result.data?.status).toBe('accepted');
  });

  it('P0-03: HttpCoordinatorRepository.assignVolunteerManually returns created item with valid ID', async () => {
    const mockTransport: TransportAdapter = async input => {
      if (input.includes('/coordinator/events/10/applications/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 55,
                event_id: 10,
                user_id: 101,
                display_name: 'Volunteer A',
                status: 'accepted',
                source: 'browse',
                applied_at: '2026-11-10T00:00:00Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/manual-assign/')) {
        return new Response(
          JSON.stringify({
            assignment_id: 777,
            application_id: 55,
            status: 'assigned',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (input.includes('/coordinator/events/10/assignments/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 777,
                event_id: 10,
                user_id: 101,
                display_name: 'Volunteer A',
                post_id: 2,
                post_title: 'First Aider',
                status: 'assigned',
                is_group_leader: false,
                schedule_start: '2026-11-20T08:00:00Z',
                schedule_end: '2026-11-20T12:00:00Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpCoordinatorRepository(client);

    // Warm up applications to map applicationId 55 -> eventId 10
    await repo.getApplications('10');

    const result = await repo.assignVolunteerManually('55', '2');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.id).toBe('777');
    expect(result.data?.postTitle).toBe('First Aider');
  });

  it('deduplicates concurrent in-flight requests in HttpCoordinatorRepository', async () => {
    let callCount = 0;
    const mockTransport: TransportAdapter = async () => {
      callCount += 1;
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      return new Response(
        JSON.stringify({
          results: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ApiClient(mockTransport, tokenStore, sessionMgr);
    const repo = new HttpCoordinatorRepository(client);

    // Call getMyEvents concurrently 3 times
    const [res1, res2, res3] = await Promise.all([
      repo.getMyEvents(),
      repo.getMyEvents(),
      repo.getMyEvents(),
    ]);

    expect(callCount).toBe(1);
    expect(res1).toEqual([]);
    expect(res2).toEqual([]);
    expect(res3).toEqual([]);
  });
});
