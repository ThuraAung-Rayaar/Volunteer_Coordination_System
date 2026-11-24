/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AssistantScreen } from '../screens/AssistantScreen';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { RepositoryProvider } from '../../../app/RepositoryProvider';
import { MockAssistantRepository } from '../../../data/mock/MockAssistantRepository';
import { TextInput, Pressable } from 'react-native';

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

describe('Phase 4: AssistantScreen Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders greeting and handles sending messages', async () => {
    const mockRepo = new MockAssistantRepository();
    // Override with immediate resolution for testing
    jest.spyOn(mockRepo, 'sendMessage').mockResolvedValue({
      answer: 'Here are matching events.',
      sources: [],
      suggestedActions: [{ type: 'open_event', eventId: 10, label: 'Test Event' }],
      requestId: 'test-req-1',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <RepositoryProvider
              dataMode="mock"
              repositories={{ assistantRepository: mockRepo }}
            >
              <AssistantScreen />
            </RepositoryProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const root = renderer.root;
    expect(root.findByType(AssistantScreen)).toBeTruthy();

    const textInput = root.findByType(TextInput);
    expect(textInput).toBeTruthy();

    await act(async () => {
      textInput.props.onChangeText('Recommend events');
    });

    const sendButton = root.findByProps({ accessibilityLabel: 'Send message' });
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton.props.onPress();
    });

    expect(mockRepo.sendMessage).toHaveBeenCalledWith(
      'Recommend events',
      expect.any(Array),
    );
    const submittedHistory = mockRepo.sendMessage.mock.calls[0][1];
    expect(submittedHistory.some(item => item.role === 'user' && item.content === 'Recommend events')).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});
