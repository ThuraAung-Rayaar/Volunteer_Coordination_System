/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AssistantScreen } from '../screens/AssistantScreen';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { RepositoryProvider } from '../../../app/RepositoryProvider';
import { UserContext, UserContextValue } from '../../../app/UserContext';
import { MockAssistantRepository } from '../../../data/mock/MockAssistantRepository';
import {
  approvedCoordinatorUser,
  ordinaryVolunteerUser,
  pendingCoordinatorUser,
} from '../../../data/mock/fixtures/demoUsers';
import { RouteNames } from '../../../navigation/routeNames';
import { Text, TextInput } from 'react-native';

function collectRenderedText(root: ReactTestRenderer.ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .filter((val): val is string | number => typeof val === 'string' || typeof val === 'number')
    .join(' ');
}

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mockNavigate = jest.fn();
const mockOpenDrawer = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    openDrawer: mockOpenDrawer,
  }),
}));

function makeUserContextValue(
  user = ordinaryVolunteerUser,
  isCoordinator = false,
): UserContextValue {
  return {
    currentUser: user,
    setCurrentUser: jest.fn(),
    isCoordinator,
    switchUserPreset: jest.fn(),
    isAuthenticated: true,
    isBootstrapping: false,
  };
}

describe('Phase 4: AssistantScreen Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads role prompt catalogue, sends prompt_key/language, renders sources and routes actions', async () => {
    const mockRepo = new MockAssistantRepository();
    const catalogSpy = jest.spyOn(mockRepo, 'getPromptCatalog').mockResolvedValue({
      role: 'volunteer',
      language: 'en',
      catalogVersion: 'vcs.prompts.v1',
      prompts: [
        {
          key: 'volunteer.next_steps',
          label: 'What should I do next?',
          description: 'Review your current applications and assignments.',
          available: true,
        },
        {
          key: 'volunteer.prepare_for_event',
          label: 'Hidden unavailable prompt',
          description: 'Should not render',
          available: false,
        },
      ],
    });
    const sendSpy = jest.spyOn(mockRepo, 'sendMessage').mockResolvedValue({
      answer: 'Here are matching events.',
      sources: [{ type: 'event', id: 10, label: 'Community Learning Day' }],
      suggestedActions: [
        { type: 'open_event', eventId: 10, label: 'Community Learning Day' },
        { type: 'invalid_dangerous_action', eventId: 99, label: 'Should Ignore' },
      ],
      requestId: 'test-req-1',
      fallbackUsed: false,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={makeUserContextValue(ordinaryVolunteerUser, false)}>
              <RepositoryProvider
                dataMode="mock"
                repositories={{ assistantRepository: mockRepo }}
              >
                <AssistantScreen />
              </RepositoryProvider>
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const root = renderer.root;
    expect(catalogSpy).toHaveBeenCalledWith('en', 'volunteer');
    expect(root.findByProps({ accessibilityLabel: 'What should I do next?' })).toBeTruthy();
    expect(
      root.findAllByProps({ accessibilityLabel: 'Hidden unavailable prompt' }),
    ).toHaveLength(0);

    // Toggle language to MY and send free text
    const langButton = root.findByProps({
      accessibilityLabel: 'Toggle assistant language',
    });
    await act(async () => {
      langButton.props.onPress();
    });
    expect(catalogSpy).toHaveBeenLastCalledWith('my', 'volunteer');

    const textInput = root.findByType(TextInput);
    await act(async () => {
      textInput.props.onChangeText('Recommend events');
    });

    const sendButton = root.findByProps({ accessibilityLabel: 'Send message' });
    await act(async () => {
      sendButton.props.onPress();
    });

    expect(sendSpy).toHaveBeenCalledWith(
      'Recommend events',
      expect.any(Array),
      expect.objectContaining({ language: 'my' }),
    );
    const submittedHistory = sendSpy.mock.calls[0][1];
    expect(
      submittedHistory.some(
        (item: { role: string; content: string }) =>
          item.role === 'user' && item.content === 'Recommend events',
      ),
    ).toBe(false);

    // Source renders & navigates
    const sourceBtn = root.findByProps({
      accessibilityLabel: 'Source: Community Learning Day',
    });
    await act(async () => {
      sourceBtn.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith(RouteNames.EventDetail, {
      eventId: '10',
    });

    // Valid suggested action renders, invalid one is filtered out
    const actionBtn = root.findByProps({
      accessibilityLabel: 'Community Learning Day',
    });
    expect(
      root.findAllByProps({ accessibilityLabel: 'Should Ignore' }),
    ).toHaveLength(0);
    await act(async () => {
      actionBtn.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith(RouteNames.EventDetail, {
      eventId: '10',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('clears transcript on account switch and ignores stale in-flight responses', async () => {
    const mockRepo = new MockAssistantRepository();
    let resolveDelayed!: (value: any) => void;
    const delayedPromise = new Promise(resolve => {
      resolveDelayed = resolve;
    });

    jest.spyOn(mockRepo, 'getPromptCatalog').mockImplementation(async (_lang, roleHint) => ({
      role: roleHint || 'volunteer',
      language: 'en',
      catalogVersion: 'vcs.prompts.v1',
      prompts: [
        {
          key: roleHint === 'coordinator' ? 'coordinator.next_steps' : 'volunteer.next_steps',
          label: roleHint === 'coordinator' ? 'What needs my attention?' : 'What should I do next?',
          description: 'Role prompt',
          available: true,
        },
      ],
    }));
    jest.spyOn(mockRepo, 'sendMessage').mockReturnValue(delayedPromise as any);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={makeUserContextValue(pendingCoordinatorUser, false)}>
              <RepositoryProvider
                dataMode="mock"
                repositories={{ assistantRepository: mockRepo }}
              >
                <AssistantScreen />
              </RepositoryProvider>
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    // Pending coordinator must receive volunteer prompt, not coordinator prompt
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'What should I do next?' }),
    ).toBeTruthy();

    // Start an in-flight request
    const textInput = renderer.root.findByType(TextInput);
    await act(async () => {
      textInput.props.onChangeText('Pending request');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress();
    });

    // Switch account to approved coordinator while request is in flight
    await act(async () => {
      renderer.update(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={makeUserContextValue(approvedCoordinatorUser, true)}>
              <RepositoryProvider
                dataMode="mock"
                repositories={{ assistantRepository: mockRepo }}
              >
                <AssistantScreen />
              </RepositoryProvider>
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    // Resolve old delayed response: must be ignored
    await act(async () => {
      resolveDelayed({
        answer: 'STALE_OLD_USER_ANSWER',
        sources: [],
        suggestedActions: [],
        requestId: 'stale-1',
      });
    });

    const allText = collectRenderedText(renderer.root);
    expect(allText).not.toContain('STALE_OLD_USER_ANSWER');
    expect(allText).toContain('What needs my attention?');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('clear chat ignores in-flight response and supports error retry', async () => {
    const mockRepo = new MockAssistantRepository();
    let resolveSlow!: (value: any) => void;
    jest.spyOn(mockRepo, 'getPromptCatalog').mockResolvedValue({
      role: 'volunteer',
      language: 'en',
      catalogVersion: 'vcs.prompts.v1',
      prompts: [],
    });
    const sendSpy = jest
      .spyOn(mockRepo, 'sendMessage')
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSlow = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('Offline failure'))
      .mockResolvedValueOnce({
        answer: 'Recovered deterministic response.',
        sources: [],
        suggestedActions: [],
        requestId: 'retry-ok',
        fallbackUsed: true,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={makeUserContextValue(ordinaryVolunteerUser, false)}>
              <RepositoryProvider
                dataMode="mock"
                repositories={{ assistantRepository: mockRepo }}
              >
                <AssistantScreen />
              </RepositoryProvider>
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    // Trigger first slow request then Clear Chat
    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('First question');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Clear chat conversation' }).props.onPress();
    });
    await act(async () => {
      resolveSlow({
        answer: 'SHOULD_NOT_APPEAR_AFTER_CLEAR',
        sources: [],
        suggestedActions: [],
        requestId: 'cleared-1',
      });
    });
    expect(collectRenderedText(renderer.root)).not.toContain('SHOULD_NOT_APPEAR_AFTER_CLEAR');

    // Trigger failing request then click Retry
    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('Retry test');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress();
    });
    const retryBtn = renderer.root.findByProps({
      accessibilityLabel: 'Retry last assistant request',
    });
    await act(async () => {
      retryBtn.props.onPress();
    });
    expect(sendSpy).toHaveBeenCalledTimes(3);
    expect(collectRenderedText(renderer.root)).toContain('Recovered deterministic response.');

    await act(async () => {
      renderer.unmount();
    });
  });
});
