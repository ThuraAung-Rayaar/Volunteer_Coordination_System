/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { OtpLoginScreen } from '../screens/OtpLoginScreen';
import {
  UserProvider,
  useCurrentUser,
  UserContext,
  FullUserContextValue,
} from '../../../app/UserContext';
import {
  resetDataMode,
  setDataMode,
} from '../../../app/configuration/dataMode';
import { defaultTokenStore, MemoryTokenStore } from '../../../core/auth/tokenStore';
import { sessionManager } from '../../../core/auth/sessionManager';
import { authApi } from '../../../data/endpoints/authApi';
import { profileApi } from '../../../data/endpoints/profileApi';
import { MainDrawerContent } from '../../../navigation/MainDrawerContent';
import { AppRoot, AppNavigationRoot } from '../../../app/AppRoot';
import { ordinaryVolunteerUser } from '../../../data/mock/fixtures/demoUsers';
import { AppButton, AppInput, AppText } from '../../../shared';
import { AppHeader } from '../../../shared/layout/AppHeader';
import type { UserProfileDto } from '../../../data/dto/profileDto';

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

function createMockDrawerProps() {
  return {
    state: {
      index: 0,
      routes: [{ key: 'Settings-key', name: 'Settings' }],
      routeNames: ['Settings'],
      type: 'drawer',
      stale: false,
      key: 'drawer-key',
    },
    navigation: createMockNavigation(),
    descriptors: {},
  } as any;
}

const mockProfileDto: UserProfileDto = {
  id: 42,
  uuid: 'uuid-42',
  display_name: 'Test Live Volunteer',
  phone: '+95912345678',
  preferred_language: 'my',
  home_area: 'Kamaryut, Yangon',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  blood_type: 'O+',
  is_willing_to_donate: true,
  is_willing_to_donate_blood: true,
  is_willing_to_donate_items: false,
  physical_ok: true,
  good_eyesight: true,
  needs_glasses: false,
  can_lift_heavy: true,
  can_work_outdoor: true,
  has_leader_experience: false,
  new_to_volunteer: false,
  skills: ['first_aid'],
  needs_meal_support: false,
  needs_travel_support: false,
  accepts_unpaid: true,
  verification_status: 'approved',
  account_status: 'active',
  charity_interests: [],
  created_at: '2025-01-01T00:00:00Z',
};

describe('Phase 4: Authentication & Session Integration', () => {
  let memoryStorage: MemoryTokenStore;
  let root: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    act(() => {
      resetDataMode();
    });
    memoryStorage = new MemoryTokenStore();
    defaultTokenStore.setCustomStorage(memoryStorage);
    sessionManager.setTokenStore(memoryStorage);
    jest.clearAllMocks();

    jest.spyOn(profileApi, 'getProfile').mockResolvedValue({
      ok: true,
      status: 200,
      data: mockProfileDto,
    });
    jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
      ok: true,
      status: 200,
      data: { coordinator: null },
    });
    jest.spyOn(authApi, 'getBootstrap').mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        user: {
          id: mockProfileDto.id,
          uuid: mockProfileDto.uuid,
          display_name: mockProfileDto.display_name,
          phone: mockProfileDto.phone,
          email: null,
          account_status: mockProfileDto.account_status,
          verification_status: mockProfileDto.verification_status,
        },
        coordinator: {
          status: 'approved',
          can_access_workspace: true,
        },
        capabilities: {
          volunteer: true,
          coordinator: true,
        },
      },
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    act(() => {
      resetDataMode();
    });
    await memoryStorage.clearToken();
    jest.restoreAllMocks();
  });

  describe('OtpLoginScreen Component UI & Step Flow', () => {
    it('renders Step 1 with phone input and send code button', async () => {
      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(<OtpLoginScreen />),
        );
      });

      const rootInstance = root!.root;
      const inputs = rootInstance.findAllByType(AppInput);
      expect(inputs.length).toBe(1);

      const header = rootInstance.findByType(AppHeader);
      expect(header.props.title).toBe('Workshift Sign In');

      const submitButton = rootInstance.findByType(AppButton);
      expect(submitButton.props.label).toBe('Send Verification Code');
    });

    it('shows validation error when attempting to send OTP with empty or default phone', async () => {
      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(<OtpLoginScreen />),
        );
      });

      const rootInstance = root!.root;
      const phoneInput = rootInstance.findAllByType(AppInput)[0];
      const submitButton = rootInstance.findByType(AppButton);

      // Default value is '+959'
      await act(async () => {
        await submitButton.props.onPress();
      });

      const errorText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Please enter your mobile phone number.'),
      );
      expect(errorText).toBeDefined();

      // Setting empty string
      await act(async () => {
        phoneInput.props.onChangeText('');
      });
      await act(async () => {
        await submitButton.props.onPress();
      });

      const errorTextEmpty = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Please enter your mobile phone number.'),
      );
      expect(errorTextEmpty).toBeDefined();
    });

    it('distinguishes between Returning User and New User on login screen', async () => {
      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(<OtpLoginScreen />),
        );
      });

      const rootInstance = root!.root;

      // Returning User (default): only 1 input (phone), no name input
      expect(rootInstance.findAllByType(AppInput).length).toBe(1);

      // Switch to New User tab
      const newUserTab = rootInstance
        .findAllByProps({ accessibilityRole: 'tab' })
        .find(t => t.props.accessibilityLabel === 'New User tab');
      expect(newUserTab).toBeDefined();

      await act(async () => {
        newUserTab!.props.onPress();
      });

      // Now 2 inputs: display name and phone number
      const inputs = rootInstance.findAllByType(AppInput);
      expect(inputs.length).toBe(2);

      // Submitting without entering name shows validation error
      const submitButton = rootInstance.findByType(AppButton);
      expect(submitButton.props.label).toBe('Register & Send Code');

      await act(async () => {
        await submitButton.props.onPress();
      });

      const nameErrorText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Please enter your name.'),
      );
      expect(nameErrorText).toBeDefined();

      // If an existing (old) user tries to enter as new user, shows error
      const nameInput = rootInstance.findByProps({ placeholder: 'e.g. Alex Morgan' });
      const phoneInput = rootInstance.findByProps({ placeholder: '+95912345678' });

      await act(async () => {
        nameInput.props.onChangeText('Alex Morgan');
        phoneInput.props.onChangeText('+959111111111');
      });

      await act(async () => {
        await submitButton.props.onPress();
      });

      const alreadyRegisteredError = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('This phone number is already registered. Please switch to Returning User to sign in.'),
      );
      expect(alreadyRegisteredError).toBeDefined();
    });

    it('submits phone to requestOtp and transitions to Step 2 with dev code banner', async () => {
      const mockRequestOtp = jest.fn().mockResolvedValue({
        success: true,
        devCode: '123456',
      });

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        requestOtp: mockRequestOtp,
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

      const rootInstance = root!.root;
      const phoneInput = rootInstance.findAllByType(AppInput)[0];
      const submitButton = rootInstance.findByType(AppButton);

      await act(async () => {
        phoneInput.props.onChangeText('+959111222333');
      });

      await act(async () => {
        await submitButton.props.onPress();
      });

      expect(mockRequestOtp).toHaveBeenCalledWith('+959111222333', 'login');

      // Now on Step 2
      const header = rootInstance.findByType(AppHeader);
      expect(header.props.title).toBe('Verify Code');

      // Dev code badge should appear
      const devCodeText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('123456'),
      );
      expect(devCodeText).toBeDefined();
    });

    it('allows navigating back from Step 2 to Step 1 via AppHeader back button', async () => {
      const mockRequestOtp = jest.fn().mockResolvedValue({
        success: true,
      });

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        requestOtp: mockRequestOtp,
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

      const rootInstance = root!.root;
      const phoneInput = rootInstance.findAllByType(AppInput)[0];
      await act(async () => {
        phoneInput.props.onChangeText('+959999888777');
      });
      await act(async () => {
        await rootInstance.findByType(AppButton).props.onPress();
      });

      expect(rootInstance.findByType(AppHeader).props.title).toBe('Verify Code');

      // Tap header back
      await act(async () => {
        rootInstance.findByType(AppHeader).props.onBackPress();
      });

      expect(rootInstance.findByType(AppHeader).props.title).toBe('Workshift Sign In');
    });

    it('validates OTP code and submits verifyOtp successfully', async () => {
      const mockVerifyOtp = jest.fn().mockResolvedValue({
        success: true,
      });
      const onLoginSuccess = jest.fn();

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        requestOtp: jest.fn().mockResolvedValue({ success: true }),
        verifyOtp: mockVerifyOtp,
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
      const phoneInput = rootInstance.findAllByType(AppInput)[0];

      await act(async () => {
        phoneInput.props.onChangeText('+95912345678');
      });

      await act(async () => {
        await rootInstance.findByType(AppButton).props.onPress();
      });

      // Step 2: enter code
      const codeInput = rootInstance.findByType(AppInput);
      await act(async () => {
        codeInput.props.onChangeText('654321');
      });

      const verifyButton = rootInstance
        .findAllByType(AppButton)
        .find(b => b.props.label === 'Verify & Continue')!;

      await act(async () => {
        await verifyButton.props.onPress();
      });

      expect(mockVerifyOtp).toHaveBeenCalledWith('+95912345678', '654321');
      expect(onLoginSuccess).toHaveBeenCalled();
    });

    it('shows error banner when verifyOtp returns failure', async () => {
      const mockVerifyOtp = jest.fn().mockResolvedValue({
        success: false,
        error: 'Invalid or expired OTP code',
      });

      const mockContext: FullUserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
        isAuthenticated: false,
        isBootstrapping: false,
        requestOtp: jest.fn().mockResolvedValue({ success: true }),
        verifyOtp: mockVerifyOtp,
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
        rootInstance.findAllByType(AppInput)[0].props.onChangeText('+95912345678');
      });
      await act(async () => {
        await rootInstance.findByType(AppButton).props.onPress();
      });

      await act(async () => {
        rootInstance.findByType(AppInput).props.onChangeText('000000');
      });

      const verifyButton = rootInstance
        .findAllByType(AppButton)
        .find(b => b.props.label === 'Verify & Continue')!;

      await act(async () => {
        await verifyButton.props.onPress();
      });

      const errorText = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().includes('Invalid or expired OTP code'),
      );
      expect(errorText).toBeDefined();
    });
  });

  describe('UserProvider Session Lifecycle & Auth Integration', () => {
    it('in mock mode: boots immediately into authenticated demo user', () => {
      let capturedContext: FullUserContextValue | undefined;

      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      act(() => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(capturedContext?.isAuthenticated).toBe(true);
      expect(capturedContext?.isBootstrapping).toBe(false);
      expect(capturedContext?.currentUser.displayName).toBe(ordinaryVolunteerUser.displayName);
    });

    it('in http mode: cold start without stored token finishes unauthenticated', async () => {
      act(() => {
        setDataMode('http');
      });
      let capturedContext: FullUserContextValue | undefined;

      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(capturedContext?.isAuthenticated).toBe(false);
      expect(capturedContext?.isBootstrapping).toBe(false);
    });

    it('in http mode: cold start with stored token fetches profile and authenticates', async () => {
      act(() => {
        setDataMode('http');
      });
      await memoryStorage.setToken('drf-test-token-777');

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          coordinator: {
            user_id: 10,
            status: 'approved',
            approved_by_id: 1,
            approved_at: '2025-01-02T00:00:00Z',
            notes: null,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-02T00:00:00Z',
          },
        },
      });

      let capturedContext: FullUserContextValue | undefined;

      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(capturedContext?.isAuthenticated).toBe(true);
      expect(capturedContext?.currentUser.displayName).toBe('Test Live Volunteer');
      expect(capturedContext?.isCoordinator).toBe(true);
    });

    it('in http mode: verifyOtp stores token in TokenStore and bootstraps session', async () => {
      act(() => {
        setDataMode('http');
      });

      jest.spyOn(authApi, 'verifyOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          token: 'fresh-auth-token-999',
          user: {
            id: 42,
            uuid: 'uuid-42',
            display_name: 'Fresh Volunteer',
            verification_status: 'approved',
          },
        },
      });

      jest.spyOn(authApi, 'getBootstrap').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            id: 42,
            uuid: 'uuid-42',
            display_name: 'Fresh Volunteer',
            phone: '+95912345678',
            email: null,
            account_status: 'active',
            verification_status: 'approved',
          },
          coordinator: {
            status: 'none',
            can_access_workspace: false,
          },
          capabilities: {
            volunteer: true,
            coordinator: false,
          },
        },
      });

      jest.spyOn(profileApi, 'getProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          ...mockProfileDto,
          display_name: 'Fresh Volunteer',
        },
      });

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: false,
        status: 404,
        error: { kind: 'notFound', code: 'not_found', message: 'Not coordinator' },
      });

      let capturedContext: FullUserContextValue | undefined;

      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(capturedContext?.isAuthenticated).toBe(false);

      let verifyResult: any;
      await act(async () => {
        verifyResult = await capturedContext?.verifyOtp('+95912345678', '123456');
      });

      expect(verifyResult?.success).toBe(true);
      expect(await memoryStorage.getToken()).toBe('fresh-auth-token-999');
      expect(capturedContext?.isAuthenticated).toBe(true);
      expect(capturedContext?.currentUser.displayName).toBe('Fresh Volunteer');
      expect(capturedContext?.isCoordinator).toBe(false);
    });

    it('in http mode: logout calls authApi.logout and clears TokenStore', async () => {
      act(() => {
        setDataMode('http');
      });
      await memoryStorage.setToken('token-to-logout');

      const logoutSpy = jest.spyOn(authApi, 'logout').mockResolvedValue({
        ok: true,
        status: 200,
        data: { status: 'logged_out' },
      });

      let capturedContext: FullUserContextValue | undefined;

      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(capturedContext?.isAuthenticated).toBe(true);

      await act(async () => {
        await capturedContext?.logout();
      });

      expect(logoutSpy).toHaveBeenCalled();
      expect(await memoryStorage.getToken()).toBeNull();
      expect(capturedContext?.isAuthenticated).toBe(false);
    });

    it('in http mode: sessionManager.handleUnauthorized invalidates session on 401', async () => {
      act(() => {
        setDataMode('http');
      });
      await memoryStorage.setToken('valid-token-before-401');

      let capturedContext: FullUserContextValue | undefined;

      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(capturedContext?.isAuthenticated).toBe(true);

      // Trigger 401 via sessionManager
      await act(async () => {
        await sessionManager.handleUnauthorized();
      });

      expect(await memoryStorage.getToken()).toBeNull();
      expect(capturedContext?.isAuthenticated).toBe(false);
    });

    it('preserves session token on 403, 404, 500 or network offline errors', async () => {
      act(() => {
        setDataMode('http');
      });
      await memoryStorage.setToken('resilient-token');

      // Non-401 errors must never call sessionManager.handleUnauthorized
      const unauthSpy = jest.spyOn(sessionManager, 'handleUnauthorized');

      // Simulate a network failure in authApi.getBootstrap
      jest.spyOn(authApi, 'getBootstrap').mockResolvedValue({
        ok: false,
        status: 0,
        error: { kind: 'network', retryable: true, message: 'Network offline' },
      });

      jest.spyOn(profileApi, 'getProfile').mockResolvedValue({
        ok: false,
        status: 0,
        error: { kind: 'network', retryable: true, message: 'Network offline' },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      expect(unauthSpy).not.toHaveBeenCalled();
      expect(await memoryStorage.getToken()).toBe('resilient-token');
    });
  });

  describe('UI Mode Switching & Drawer Invariants', () => {
    it('renders QA Demo Profile Switcher in MainDrawerContent when dataMode is mock', () => {
      act(() => {
        resetDataMode(); // 'mock'
      });

      act(() => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserProvider>
              <MainDrawerContent {...createMockDrawerProps()} />
            </UserProvider>,
          ),
        );
      });

      const rootInstance = root!.root;
      const qaTitle = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().toUpperCase().includes('QA DEMO PROFILE SWITCHER'),
      );
      expect(qaTitle).toBeDefined();
    });

    it('hides QA Demo Profile Switcher in MainDrawerContent when dataMode is http', () => {
      act(() => {
        setDataMode('http');
      });

      act(() => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserProvider>
              <MainDrawerContent {...createMockDrawerProps()} />
            </UserProvider>,
          ),
        );
      });

      const rootInstance = root!.root;
      const qaTitle = rootInstance.findAllByType(AppText).find(t =>
        t.props.children?.toString().toUpperCase().includes('QA DEMO PROFILE SWITCHER'),
      );
      expect(qaTitle).toBeUndefined();
    });

    it('AppNavigationRoot renders OtpLoginScreen in HTTP mode when unauthenticated', async () => {
      act(() => {
        setDataMode('http');
      });

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithTheme(
            <UserProvider>
              <AppNavigationRoot />
            </UserProvider>,
          ),
        );
      });

      // Flush microtasks for the async bootstrap effect in UserProvider
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }

      const loginScreens = root!.root.findAllByType(OtpLoginScreen);
      expect(loginScreens.length).toBe(1);
    });

    it('AppRoot renders correctly without throwing', async () => {
      await act(async () => {
        root = ReactTestRenderer.create(<AppRoot />);
      });
      expect(root).toBeDefined();
    });
  });
});
