/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { OtpLoginScreen } from '../auth/screens/OtpLoginScreen';
import { CoordinatorAttendanceScreen } from '../coordinator/screens/CoordinatorAttendanceScreen';
import { AttendanceRow } from '../coordinator/components/AttendanceRow';
import { FriendsScreen } from '../friends/screens/FriendsScreen';
import { UserContext, FullUserContextValue } from '../../app/UserContext';
import {
  resetConsumerModeState,
  setConsumerModeState,
} from '../../app/configuration/consumerMode';
import { RepositoryProvider } from '../../app/RepositoryProvider';
import { ordinaryVolunteerUser, approvedCoordinatorUser } from '../../data/mock/fixtures/demoUsers';
import { AppButton, AppInput, AppText, StatusBadge } from '../../shared';
import type { CoordinatorAttendanceItem } from '../../domain/models/coordinator';
import type { CoordinatorRepository } from '../../data/contracts/coordinatorRepository';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithTheme(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider initialMode="light">{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (key === '_owner') return undefined;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  });
}

function createMockNavigation() {
  return {
    navigate: jest.fn(),
    openDrawer: jest.fn(),
    closeDrawer: jest.fn(),
    toggleDrawer: jest.fn(),
    dispatch: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => true),
    getParent: jest.fn(),
    getState: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    setParams: jest.fn(),
    setOptions: jest.fn(),
  } as any;
}

describe('Phase 7: Mobile UI Screen Integration & Verification Suite', () => {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    jest.clearAllMocks();
  });

  describe('1. OtpLoginScreen Phase 6A Challenge Flow Integration', () => {
    it('enforces server-supplied code_length (6 digits) in copy and validation', async () => {
      const mockClearChallenge = jest.fn();
      setConsumerModeState({ devOptionsEnabled: true });
      const mockRequestTokenizedOtp = jest.fn().mockResolvedValue({
        success: true,
        authSessionToken: 'sess-token-123',
        expiresIn: 180,
        codeLength: 6,
        devCode: '998877',
        delivery: {
          channel: 'SMS',
          provider: 'console',
          delivered: false,
          configured: false,
        },
      });

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        challenge: {
          authSessionToken: 'sess-token-123',
          expiresIn: 180,
          expiresAt: Date.now() + 180000,
          codeLength: 6,
          delivery: {
            channel: 'SMS',
            delivered: false,
            configured: false,
          },
          devCode: '998877',
          phone: '+959111222333',
        },
        clearChallenge: mockClearChallenge,
        requestOtp: mockRequestTokenizedOtp,
        verifyOtp: jest.fn(),
        requestTokenizedOtp: mockRequestTokenizedOtp,
        verifyTokenizedOtp: jest.fn(),
        logout: jest.fn(),
        refreshSessionUser: jest.fn(),
      };

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider value={mockContext}>
              <OtpLoginScreen />
            </UserContext.Provider>,
          ),
        );
      });

      const rootInstance = root!.root;
      const phoneInput = rootInstance.findAllByType(AppInput)[0];

      await act(async () => {
        phoneInput.props.onChangeText('+959111222333');
      });

      const sendButton = rootInstance.findByType(AppButton);
      await act(async () => {
        await sendButton.props.onPress();
      });

      // Verify codeLength is reflected in copy
      const copyText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Enter 6-Digit Code'),
      );
      expect(copyText).toBeDefined();

      // Verify honest delivery info is displayed
      const deliveryText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('simulation mode / provider unconfigured'),
      );
      expect(deliveryText).toBeDefined();

      // Enter incomplete code (5 digits) -> should show validation error
      const codeInput = rootInstance.findByType(AppInput);
      expect(codeInput.props.maxLength).toBe(6);

      await act(async () => {
        codeInput.props.onChangeText('12345');
      });

      const verifyButton = rootInstance
        .findAllByType(AppButton)
        .find(b => b.props.label === 'Verify & Continue')!;

      await act(async () => {
        await verifyButton.props.onPress();
      });

      const fieldError = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Please enter the 6-digit verification code.'),
      );
      expect(fieldError).toBeDefined();
      await act(async () => {
        root!.unmount();
      });
      resetConsumerModeState();
    });

    it('submits verification with auth_session_token and code only (never resending phone)', async () => {
      const mockVerifyTokenizedOtp = jest.fn().mockResolvedValue({
        success: true,
      });
      const mockClearChallenge = jest.fn();
      const onLoginSuccess = jest.fn();

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        challenge: {
          authSessionToken: 'sess-token-xyz',
          expiresIn: 180,
          expiresAt: Date.now() + 180000,
          codeLength: 6,
          delivery: { channel: 'SMS', delivered: true, configured: true },
          phone: '+959111222333',
        },
        clearChallenge: mockClearChallenge,
        requestOtp: jest.fn().mockResolvedValue({ success: true }),
        verifyOtp: jest.fn(),
        requestTokenizedOtp: jest.fn(),
        verifyTokenizedOtp: mockVerifyTokenizedOtp,
        logout: jest.fn(),
        refreshSessionUser: jest.fn(),
      };

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider value={mockContext}>
              <OtpLoginScreen onLoginSuccess={onLoginSuccess} />
            </UserContext.Provider>,
          ),
        );
      });

      const rootInstance = root!.root;
      await act(async () => {
        rootInstance.findAllByType(AppInput)[0].props.onChangeText('+959111222333');
      });

      await act(async () => {
        await rootInstance.findByType(AppButton).props.onPress();
      });

      // Step 2: enter code
      const codeInput = rootInstance.findByType(AppInput);
      await act(async () => {
        codeInput.props.onChangeText('123456');
      });

      const verifyButton = rootInstance
        .findAllByType(AppButton)
        .find(b => b.props.label === 'Verify & Continue')!;

      await act(async () => {
        await verifyButton.props.onPress();
      });

      // Verify verifyTokenizedOtp was called without phone in payload
      expect(mockVerifyTokenizedOtp).toHaveBeenCalledWith({
        code: '123456',
      });
      expect(mockClearChallenge).toHaveBeenCalled();
      expect(onLoginSuccess).toHaveBeenCalled();
    });

    it('displays verification error without wiping user phone input', async () => {
      const mockVerifyTokenizedOtp = jest.fn().mockResolvedValue({
        success: false,
        error: 'Challenge expired. Please request a new code.',
      });

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        challenge: {
          authSessionToken: 'sess-token-expired',
          expiresIn: 180,
          expiresAt: Date.now() - 1000,
          codeLength: 6,
          delivery: { channel: 'SMS', delivered: true },
          phone: '+959111222333',
        },
        clearChallenge: jest.fn(),
        requestOtp: jest.fn().mockResolvedValue({ success: true }),
        verifyOtp: jest.fn(),
        requestTokenizedOtp: jest.fn(),
        verifyTokenizedOtp: mockVerifyTokenizedOtp,
        logout: jest.fn(),
        refreshSessionUser: jest.fn(),
      };

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider value={mockContext}>
              <OtpLoginScreen />
            </UserContext.Provider>,
          ),
        );
      });

      const rootInstance = root!.root;
      await act(async () => {
        rootInstance.findAllByType(AppInput)[0].props.onChangeText('+959111222333');
      });

      await act(async () => {
        await rootInstance.findByType(AppButton).props.onPress();
      });

      const codeInput = rootInstance.findByType(AppInput);
      await act(async () => {
        codeInput.props.onChangeText('123456');
      });

      const verifyButton = rootInstance
        .findAllByType(AppButton)
        .find(b => b.props.label === 'Verify & Continue')!;

      await act(async () => {
        await verifyButton.props.onPress();
      });

      // Error banner displays expired message
      const errorText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Challenge expired. Please request a new code.'),
      );
      expect(errorText).toBeDefined();

      // Return to phone step: phone input must still hold '+959111222333'
      const backButton = rootInstance
        .findAllByType(AppButton)
        .find(b => b.props.label === 'Change Phone Number')!;

      await act(async () => {
        await backButton.props.onPress();
      });

      const phoneInputAfter = rootInstance.findAllByType(AppInput)[0];
      expect(phoneInputAfter.props.value).toBe('+959111222333');
    });

    it('clears challenge on unmount (navigation exit)', async () => {
      const mockClearChallenge = jest.fn();
      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        clearChallenge: mockClearChallenge,
        requestOtp: jest.fn(),
        verifyOtp: jest.fn(),
        logout: jest.fn(),
        refreshSessionUser: jest.fn(),
      };

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider value={mockContext}>
              <OtpLoginScreen />
            </UserContext.Provider>,
          ),
        );
      });

      expect(mockClearChallenge).not.toHaveBeenCalled();

      await act(async () => {
        root!.unmount();
        root = null;
      });

      expect(mockClearChallenge).toHaveBeenCalled();
    });
  });

  describe('2. AttendanceRow & CoordinatorAttendanceScreen Phase 6B Wiring', () => {
    const mockScheduledAttendance: CoordinatorAttendanceItem = {
      id: 'att-101',
      eventId: '101',
      eventTitle: 'Community Clean-Up',
      assignmentId: 'asg-101',
      userId: '202',
      volunteerName: 'Ko Kyaw',
      postTitle: 'Zone Lead',
      groupCode: 'GRP-A',
      status: 'scheduled',
      isPendingGeoConfirmation: false,
    };

    const mockCheckedInAttendance: CoordinatorAttendanceItem = {
      id: 'att-102',
      eventId: '101',
      eventTitle: 'Community Clean-Up',
      assignmentId: 'asg-102',
      userId: '203',
      volunteerName: 'Ma Su',
      postTitle: 'Registration Desk',
      groupCode: 'GRP-A',
      status: 'checked_in',
      checkInMethod: 'coordinator_manual',
      checkedInAt: '2026-11-20T10:15:00Z',
      isPendingGeoConfirmation: false,
    };

    it('renders AttendanceRow with "Manual Check-In" label (Demo removed) and passes explicit eventId and userId', async () => {
      const onManualCheckIn = jest.fn();

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <AttendanceRow
              attendance={mockScheduledAttendance}
              isMonitorMode={false}
              onManualCheckIn={onManualCheckIn}
            />,
          ),
        );
      });

      const button = root!.root.findByType(AppButton);
      expect(button.props.label).toBe('Manual Check-In'); // Verifies "(Demo)" is removed
      expect(button.props.disabled).toBe(false);

      await act(async () => {
        button.props.onPress();
      });

      expect(onManualCheckIn).toHaveBeenCalledWith('att-101', '101', '202');
    });

    it('renders exact server method "Coordinator Manual" and checkin timestamp on checked in row', async () => {
      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <AttendanceRow
              attendance={mockCheckedInAttendance}
              isMonitorMode={false}
            />,
          ),
        );
      });

      const json = safeStringify(root!.toJSON());
      expect(json).toContain('Coordinator Manual');
      expect(json).toContain('Checked In');
      expect(json).not.toContain('Manual Check-In'); // No action button when already checked in
    });

    it('disables check-in button in monitor mode with explicit notice', async () => {
      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <AttendanceRow
              attendance={mockScheduledAttendance}
              isMonitorMode={true}
            />,
          ),
        );
      });

      const json = safeStringify(root!.toJSON());
      expect(json).toContain('Check-in disabled in monitor mode');
      const buttons = root!.root.findAllByType(AppButton);
      expect(buttons).toHaveLength(0);
    });

    it('executes manualCheckIn on CoordinatorAttendanceScreen passing explicit params and shows feedback', async () => {
      const mockManualCheckIn = jest.fn().mockResolvedValue({
        success: true,
        message: 'Volunteer checked in manually',
        data: {
          ...mockScheduledAttendance,
          status: 'checked_in',
          checkInMethod: 'coordinator_manual',
          checkedInAt: '2026-11-20T10:20:00Z',
        },
      });

      const mockRepo: Partial<CoordinatorRepository> = {
        getMyEvents: jest.fn().mockResolvedValue([
          {
            id: '101',
            title: 'Community Clean-Up',
            status: 'active',
            isOwnerAsMonitor: false,
          },
        ]),
        getAttendanceRoster: jest.fn().mockResolvedValue([mockScheduledAttendance]),
        getPendingGeoConfirmations: jest.fn().mockResolvedValue([]),
        manualCheckIn: mockManualCheckIn as any,
      };

      const nav = createMockNavigation();

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider
              value={{
                currentUser: approvedCoordinatorUser,
                isCoordinator: true,
                setCurrentUser: jest.fn(),
                switchUserPreset: jest.fn(),
                isAuthenticated: true,
                isBootstrapping: false,
                logout: jest.fn(),
                refreshSessionUser: jest.fn(),
              }}
            >
              <CoordinatorAttendanceScreen
                navigation={nav}
                repository={mockRepo as CoordinatorRepository}
                route={{ key: 'att', name: 'CoordinatorAttendance', params: { eventId: '101' } }}
              />
            </UserContext.Provider>,
          ),
        );
      });

      const noteInput = root!.root.findAllByType(AppInput).find(i => i.props.label?.includes('verification note'));
      if (noteInput) {
        await act(async () => {
          noteInput.props.onChangeText('Manual on-site check-in verified by coordinator');
        });
      }

      const checkInBtn = root!.root.findAllByType(AppButton).find(b => b.props.label === 'Manual Check-In');
      expect(checkInBtn).toBeDefined();

      await act(async () => {
        await checkInBtn!.props.onPress();
      });

      expect(mockManualCheckIn).toHaveBeenCalledWith({
        eventId: '101',
        volunteerUserId: '202',
        note: 'Manual on-site check-in verified by coordinator',
      });

      const json = safeStringify(root!.toJSON());
      expect(json).toContain('Volunteer checked in manually');
    });

    it('displays error banner and preserves previous row state on 409 / 403 / 404 failure', async () => {
      const mockManualCheckIn = jest.fn().mockResolvedValue({
        success: false,
        message: 'Attendance record transition is not permitted: row is cancelled',
      });

      const mockRepo: Partial<CoordinatorRepository> = {
        getMyEvents: jest.fn().mockResolvedValue([
          {
            id: '101',
            title: 'Community Clean-Up',
            status: 'active',
            isOwnerAsMonitor: false,
          },
        ]),
        getAttendanceRoster: jest.fn().mockResolvedValue([mockScheduledAttendance]),
        getPendingGeoConfirmations: jest.fn().mockResolvedValue([]),
        manualCheckIn: mockManualCheckIn as any,
      };

      const nav = createMockNavigation();

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider
              value={{
                currentUser: approvedCoordinatorUser,
                isCoordinator: true,
                setCurrentUser: jest.fn(),
                switchUserPreset: jest.fn(),
                isAuthenticated: true,
                isBootstrapping: false,
                logout: jest.fn(),
                refreshSessionUser: jest.fn(),
              }}
            >
              <CoordinatorAttendanceScreen
                navigation={nav}
                repository={mockRepo as CoordinatorRepository}
                route={{ key: 'att', name: 'CoordinatorAttendance', params: { eventId: '101' } }}
              />
            </UserContext.Provider>,
          ),
        );
      });

      const checkInBtn = root!.root.findAllByType(AppButton).find(b => b.props.label === 'Manual Check-In');
      await act(async () => {
        await checkInBtn!.props.onPress();
      });

      const json = safeStringify(root!.toJSON());
      expect(json).toContain('Attendance record transition is not permitted: row is cancelled');
      // Previous row status remains intact
      expect(json).toContain('Scheduled');
    });
  });

  describe('3. UI Exclusions & Invariants Verification', () => {
    it('verifies Friends screen is cleanly marked as placeholder / coming soon without active endpoints', async () => {
      const nav = createMockNavigation();

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(<FriendsScreen navigation={nav} route={{} as any} />),
        );
      });

      const json = safeStringify(root!.toJSON());
      expect(json).toContain('Friends');
      expect(json).toContain('Volunteer connections will be available when this feature is implemented.');
      expect(json).not.toContain('Active Friends');
      expect(json).not.toContain('Invite Friend');
    });

    it('verifies privacy disclosure and absence of native GPS telemetry / active coordinates in Attendance screen', async () => {
      const mockRepo: Partial<CoordinatorRepository> = {
        getMyEvents: jest.fn().mockResolvedValue([
          {
            id: '101',
            title: 'Community Clean-Up',
            status: 'active',
            isOwnerAsMonitor: false,
          },
        ]),
        getAttendanceRoster: jest.fn().mockResolvedValue([]),
        getPendingGeoConfirmations: jest.fn().mockResolvedValue([]),
      };

      const nav = createMockNavigation();

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserContext.Provider
              value={{
                currentUser: approvedCoordinatorUser,
                isCoordinator: true,
                setCurrentUser: jest.fn(),
                switchUserPreset: jest.fn(),
                isAuthenticated: true,
                isBootstrapping: false,
                logout: jest.fn(),
                refreshSessionUser: jest.fn(),
              }}
            >
              <CoordinatorAttendanceScreen
                navigation={nav}
                repository={mockRepo as CoordinatorRepository}
              />
            </UserContext.Provider>,
          ),
        );
      });

      const json = safeStringify(root!.toJSON());
      // Discloses BR-PRIV-T4 server-side calculation
      expect(json).toContain('Operational Notice: Authoritative distance calculated on server.');
      expect(json).toContain('Raw GPS coordinates and device telemetry are hidden per Privacy Rule BR-PRIV-T4.');
      expect(json).not.toContain('Real location permission and GPS capture are not active in this UI preview.');
    });
  });
});
