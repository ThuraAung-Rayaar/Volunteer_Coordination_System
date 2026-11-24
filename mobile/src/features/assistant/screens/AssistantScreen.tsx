/**
 * @format
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAssistantRepository } from '../../../app/RepositoryProvider';
import type { ChatMessage, SuggestedAction } from '../../../data/contracts/assistantRepository';
import { AppHeader, AppIcon, AppText } from '../../../shared';
import { useAppTheme } from '../../../theme';
import { RouteNames } from '../../../navigation/routeNames';
import type { MainDrawerNavigationProp } from '../../../navigation/navigationTypes';

const QUICK_PROMPTS = [
  'Recommend events matching my profile',
  'What is the status of my applications?',
  'Explain the cancellation policy',
  'How does location check-in work?',
];

export function AssistantScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();
  const navigation = useNavigation<MainDrawerNavigationProp>();
  const assistantRepo = useAssistantRepository();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'greeting',
      role: 'assistant',
      content:
        'Hello! I am your VCS Assistant. Ask me to find matching events, summarize your applications or assignments, inspect staffing gaps, or explain system policies.',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastActions, setLastActions] = useState<SuggestedAction[]>([]);

  const flatListRef = useRef<FlatList>(null);

  const handleClearChat = useCallback(() => {
    setMessages([
      {
        id: 'greeting-' + Date.now(),
        role: 'assistant',
        content:
          'Chat history cleared. How can I assist you with your volunteer coordination today?',
      },
    ]);
    setLastActions([]);
  }, []);

  const handleActionPress = useCallback(
    (action: SuggestedAction) => {
      if (action.eventId) {
        if (action.type === 'open_staffing') {
          navigation.navigate(RouteNames.CoordinatorEventDetail, {
            eventId: String(action.eventId),
          });
        } else {
          navigation.navigate(RouteNames.EventDetail, {
            eventId: String(action.eventId),
          });
        }
      }
    },
    [navigation],
  );

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend || inputText).trim();
      if (!text || isLoading) return;

      const userMsg: ChatMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: text,
      };

      const updatedHistory = [...messages, userMsg];
      setMessages(updatedHistory);
      setInputText('');
      setIsLoading(true);

      try {
        // Send only completed turns as context; the backend appends the current prompt.
        const resp = await assistantRepo.sendMessage(text, messages);
        const assistantMsg: ChatMessage = {
          id: resp.requestId || 'asst-' + Date.now(),
          role: 'assistant',
          content: resp.answer,
        };
        setMessages(prev => [...prev, assistantMsg]);
        setLastActions(resp.suggestedActions || []);
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content:
            'Sorry, I could not complete your request: ' +
            (err.message || 'Network error.'),
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [inputText, isLoading, messages, assistantRepo],
  );

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowUser : styles.messageRowAssistant,
        ]}
      >
        {!isUser && (
          <View
            style={[
              styles.avatarBubble,
              { backgroundColor: theme.colors.surfaceRaised },
            ]}
          >
            <AppIcon name="spark" size={14} color={theme.colors.primary} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.bubbleUser, { backgroundColor: theme.colors.primary }]
              : [
                  styles.bubbleAssistant,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ],
          ]}
        >
          <AppText
            variant="body"
            style={[
              styles.messageText,
              { color: isUser ? '#FFFFFF' : theme.colors.textPrimary },
            ]}
          >
            {item.content}
          </AppText>
        </View>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <AppHeader
        title="AI Assistant"
        subtitle="Read-Only Guidance & Insights"
        onMenuPress={() => navigation.openDrawer()}
        showNotificationBell={false}
        rightAction={
          <Pressable
            onPress={handleClearChat}
            accessibilityLabel="Clear chat conversation"
            hitSlop={8}
          >
            <AppIcon name="trash" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListFooterComponent={
            <View>
              {isLoading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <AppText variant="caption" style={{ color: theme.colors.textSecondary }}>
                    Thinking...
                  </AppText>
                </View>
              )}
              {lastActions.length > 0 && (
                <View style={styles.actionsContainer}>
                  <AppText variant="caption" style={{ color: theme.colors.textSecondary }}>
                    Suggested Actions:
                  </AppText>
                  <View style={styles.actionsRow}>
                    {lastActions.map((act, idx) => (
                      <Pressable
                        key={idx}
                        onPress={() => handleActionPress(act)}
                        style={[
                          styles.actionChip,
                          {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.primary,
                          },
                        ]}
                      >
                        <AppText
                          variant="caption"
                          style={{ color: theme.colors.primary, fontWeight: '600' }}
                        >
                          {act.label || `Open Event #${act.eventId}`} &rarr;
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {messages.length === 1 && (
                <View style={styles.quickPromptsContainer}>
                  <AppText
                    variant="caption"
                    style={[styles.quickPromptHeader, { color: theme.colors.textSecondary }]}
                  >
                    Quick Suggestions:
                  </AppText>
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => handleSend(prompt)}
                      style={[
                        styles.quickPromptChip,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <AppText variant="caption" style={{ color: theme.colors.textPrimary }}>
                        {prompt}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
        />

        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#1F293D' : '#F4EFE6',
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Ask about events, recommendations, staffing..."
            placeholderTextColor={theme.colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!isLoading}
          />
          <Pressable
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  inputText.trim() && !isLoading
                    ? theme.colors.primary
                    : theme.colors.border,
              },
            ]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || isLoading}
            accessibilityLabel="Send message"
          >
            <AppIcon name="spark" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatarBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 36,
  },
  actionsContainer: {
    marginTop: 8,
    paddingLeft: 36,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickPromptsContainer: {
    marginTop: 16,
    paddingHorizontal: 8,
  },
  quickPromptHeader: {
    marginBottom: 8,
  },
  quickPromptChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
