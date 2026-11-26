/**
 * @format
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAssistantRepository } from '../../../app/RepositoryProvider';
import { useCurrentUser } from '../../../app/UserContext';
import type {
  AssistantPromptItem,
  ChatMessage,
  SourceItem,
  SuggestedAction,
} from '../../../data/contracts/assistantRepository';
import { AppHeader, AppIcon, AppText, KeyboardLiftView } from '../../../shared';
import { useAppTheme } from '../../../theme';
import { RouteNames } from '../../../navigation/routeNames';
import type { MainDrawerNavigationProp } from '../../../navigation/navigationTypes';

const ALLOWED_ACTION_TYPES = new Set([
  'open_event',
  'open_staffing',
  'open_applications',
  'open_assignments',
  'open_events',
  'open_coordinator_events',
  'open_coordinator_applications',
  'open_coordinator_assignments',
]);

const INITIAL_GREETING: ChatMessage = {
  id: 'greeting-initial',
  role: 'assistant',
  content:
    'Hello! I am your VCS Assistant. Select a role prompt below or ask a question about your applications, assignments, events, staffing, or policies.',
};

interface PendingRetryRequest {
  text: string;
  promptKey?: string;
}

function isActionValid(action: SuggestedAction): boolean {
  if (!ALLOWED_ACTION_TYPES.has(action.type)) {
    return false;
  }
  if (action.type === 'open_event' || action.type === 'open_staffing') {
    return typeof action.eventId === 'number' && action.eventId > 0;
  }
  return true;
}

export function AssistantScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();
  const navigation = useNavigation<MainDrawerNavigationProp>();
  const assistantRepo = useAssistantRepository();
  const { currentUser, isCoordinator, isAuthenticated } = useCurrentUser();

  const [language, setLanguage] = useState<'en' | 'my'>('en');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastActions, setLastActions] = useState<SuggestedAction[]>([]);
  const [lastSources, setLastSources] = useState<SourceItem[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] =
    useState<PendingRetryRequest | null>(null);

  const [prompts, setPrompts] = useState<AssistantPromptItem[]>([]);
  const [catalogRole, setCatalogRole] = useState<string>('');
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const activeEpochRef = useRef<number>(0);

  const loadPromptCatalog = useCallback(
    async (epoch: number, targetLanguage: 'en' | 'my') => {
      if (isAuthenticated === false) {
        setPrompts([]);
        setCatalogRole('');
        setCatalogError(null);
        return;
      }

      setIsCatalogLoading(true);
      setCatalogError(null);
      try {
        const roleHint = isCoordinator ? 'coordinator' : 'volunteer';
        const catalog = await assistantRepo.getPromptCatalog(
          targetLanguage,
          roleHint,
        );
        if (epoch !== activeEpochRef.current) {
          return;
        }
        setPrompts((catalog.prompts || []).filter(p => p.available));
        setCatalogRole(catalog.role || roleHint);
      } catch (err: unknown) {
        if (epoch !== activeEpochRef.current) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Unable to load prompt menu.';
        setCatalogError(message);
        setPrompts([]);
      } finally {
        if (epoch === activeEpochRef.current) {
          setIsCatalogLoading(false);
        }
      }
    },
    [assistantRepo, isAuthenticated, isCoordinator],
  );

  // Clear ephemeral transcript and invalidate in-flight requests whenever
  // the signed-in account, role, auth state, or repository changes.
  useEffect(() => {
    activeEpochRef.current += 1;
    const epoch = activeEpochRef.current;

    setMessages([
      {
        ...INITIAL_GREETING,
        id: `greeting-${epoch}`,
      },
    ]);
    setLastActions([]);
    setLastSources([]);
    setSendError(null);
    setRetryRequest(null);
    setIsLoading(false);
    setInputText('');

    loadPromptCatalog(epoch, language);
  }, [
    currentUser.id,
    currentUser.coordinatorStatus,
    isAuthenticated,
    assistantRepo,
    language,
    loadPromptCatalog,
  ]);

  const handleClearChat = useCallback(() => {
    activeEpochRef.current += 1;
    const epoch = activeEpochRef.current;
    setMessages([
      {
        id: `greeting-cleared-${epoch}`,
        role: 'assistant',
        content:
          'Chat history cleared. How can I assist you with your volunteer coordination today?',
      },
    ]);
    setLastActions([]);
    setLastSources([]);
    setSendError(null);
    setRetryRequest(null);
    setIsLoading(false);
  }, []);

  const handleActionPress = useCallback(
    (action: SuggestedAction) => {
      if (!isActionValid(action)) {
        return;
      }
      switch (action.type) {
        case 'open_staffing':
          if (action.eventId) {
            navigation.navigate(RouteNames.CoordinatorEventDetail, {
              eventId: String(action.eventId),
            });
          }
          break;
        case 'open_event':
          if (action.eventId) {
            navigation.navigate(RouteNames.EventDetail, {
              eventId: String(action.eventId),
            });
          }
          break;
        case 'open_applications':
          navigation.navigate(RouteNames.MyApplications);
          break;
        case 'open_assignments':
          navigation.navigate(RouteNames.MyAssignments);
          break;
        case 'open_events':
          navigation.navigate(RouteNames.Events);
          break;
        case 'open_coordinator_events':
          navigation.navigate(RouteNames.CoordinatorEvents);
          break;
        case 'open_coordinator_applications':
          navigation.navigate(RouteNames.CoordinatorApplications);
          break;
        case 'open_coordinator_assignments':
          navigation.navigate(RouteNames.CoordinatorAssignments);
          break;
        default:
          break;
      }
    },
    [navigation],
  );

  const handleSourcePress = useCallback(
    (source: SourceItem) => {
      if (source.type === 'staffing_insight' && source.id) {
        navigation.navigate(RouteNames.CoordinatorEventDetail, {
          eventId: String(source.id),
        });
      } else if (source.type === 'event' && source.id) {
        navigation.navigate(RouteNames.EventDetail, {
          eventId: String(source.id),
        });
      } else if (source.type === 'application') {
        navigation.navigate(RouteNames.MyApplications);
      } else if (source.type === 'assignment') {
        navigation.navigate(RouteNames.MyAssignments);
      }
    },
    [navigation],
  );

  const handleSend = useCallback(
    async (textToSend?: string, promptKey?: string) => {
      const text = (textToSend ?? inputText).trim();
      if ((!text && !promptKey) || isLoading) {
        return;
      }

      const requestEpoch = activeEpochRef.current;
      const completedHistory = messages.filter(
        m => !m.id.startsWith('greeting') && !m.id.startsWith('err-'),
      );

      const userMsg: ChatMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: text || promptKey || '',
      };

      setMessages(prev => [...prev, userMsg]);
      if (!textToSend) {
        setInputText('');
      }
      setSendError(null);
      setRetryRequest(null);
      setIsLoading(true);

      try {
        // Send only completed prior exchanges; never duplicate current prompt.
        const resp = await assistantRepo.sendMessage(text, completedHistory, {
          promptKey,
          language,
        });

        if (requestEpoch !== activeEpochRef.current) {
          return;
        }

        const assistantMsg: ChatMessage = {
          id: resp.requestId || 'asst-' + Date.now(),
          role: 'assistant',
          content: resp.answer,
          fallbackUsed: Boolean(resp.fallbackUsed),
        };
        setMessages(prev => [...prev, assistantMsg]);
        setLastSources(resp.sources || []);
        setLastActions((resp.suggestedActions || []).filter(isActionValid));
      } catch (err: unknown) {
        if (requestEpoch !== activeEpochRef.current) {
          return;
        }
        const errMessage =
          err instanceof Error ? err.message : 'Network error.';
        setSendError(errMessage);
        setRetryRequest({ text, promptKey });
        const errorMsg: ChatMessage = {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: 'Sorry, I could not complete your request: ' + errMessage,
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        if (requestEpoch === activeEpochRef.current) {
          setIsLoading(false);
        }
      }
    },
    [inputText, isLoading, messages, assistantRepo, language],
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => (prev === 'en' ? 'my' : 'en'));
  }, []);

  const roleHeaderLabel = (() => {
    if (catalogRole === 'coordinator') {
      return 'Coordinator Prompts';
    }
    if (catalogRole === 'super_admin') {
      return 'Super Admin Prompts';
    }
    if (catalogRole === 'admin') {
      return 'Admin Prompts';
    }
    return 'Volunteer Prompts';
  })();

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
          {item.fallbackUsed && !isUser && (
            <AppText
              variant="caption"
              style={[styles.fallbackNote, { color: theme.colors.textSecondary }]}
            >
              Deterministic backend summary
            </AppText>
          )}
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
          <View style={styles.headerActions}>
            <Pressable
              onPress={toggleLanguage}
              accessibilityLabel="Toggle assistant language"
              style={[
                styles.langBadge,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
              hitSlop={6}
            >
              <AppText
                variant="caption"
                style={[styles.langBadgeText, { color: theme.colors.textPrimary }]}
              >
                {language.toUpperCase()}
              </AppText>
            </Pressable>
            <Pressable
              onPress={handleClearChat}
              accessibilityLabel="Clear chat conversation"
              hitSlop={8}
            >
              <AppIcon
                name="trash"
                size={20}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          </View>
        }
      />

      <KeyboardLiftView
        style={styles.keyboardContainer}
        extraPaddingWhenOpen={6}
        onKeyboardShow={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessageItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListFooterComponent={
            <View>
              {isLoading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                  <AppText
                    variant="caption"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    Thinking...
                  </AppText>
                </View>
              )}

              {sendError && retryRequest && !isLoading && (
                <View style={styles.retryRow}>
                  <Pressable
                    onPress={() =>
                      handleSend(retryRequest.text, retryRequest.promptKey)
                    }
                    accessibilityLabel="Retry last assistant request"
                    style={[
                      styles.retryButton,
                      {
                        borderColor: theme.colors.primary,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.retryText,
                        { color: theme.colors.primary },
                      ]}
                    >
                      Retry
                    </AppText>
                  </Pressable>
                </View>
              )}

              {lastSources.length > 0 && (
                <View style={styles.actionsContainer}>
                  <AppText
                    variant="caption"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    Sources:
                  </AppText>
                  <View style={styles.actionsRow}>
                    {lastSources.map((src, idx) => {
                      const clickable = src.type !== 'policy';
                      return (
                        <Pressable
                          key={`${src.type}-${src.id ?? idx}`}
                          disabled={!clickable}
                          onPress={() => handleSourcePress(src)}
                          accessibilityLabel={`Source: ${src.label || src.type}`}
                          style={[
                            styles.sourceChip,
                            {
                              backgroundColor: theme.colors.surfaceRaised,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <AppText
                            variant="caption"
                            style={{ color: theme.colors.textPrimary }}
                          >
                            {src.label || `${src.type} #${src.id ?? ''}`}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {lastActions.length > 0 && (
                <View style={styles.actionsContainer}>
                  <AppText
                    variant="caption"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    Suggested Actions:
                  </AppText>
                  <View style={styles.actionsRow}>
                    {lastActions.map((act, idx) => (
                      <Pressable
                        key={`${act.type}-${act.eventId ?? idx}`}
                        onPress={() => handleActionPress(act)}
                        accessibilityLabel={
                          act.label || `Action ${act.type}`
                        }
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
                          style={[
                            styles.actionText,
                            { color: theme.colors.primary },
                          ]}
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
                    style={[
                      styles.quickPromptHeader,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {roleHeaderLabel}:
                  </AppText>
                  {isCatalogLoading && (
                    <View style={styles.catalogStatusRow}>
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                      />
                      <AppText
                        variant="caption"
                        style={{ color: theme.colors.textSecondary }}
                      >
                        Loading prompts...
                      </AppText>
                    </View>
                  )}
                  {catalogError && !isCatalogLoading && (
                    <View style={styles.catalogStatusRow}>
                      <AppText
                        variant="caption"
                        style={{ color: theme.colors.textSecondary }}
                      >
                        {catalogError}
                      </AppText>
                      <Pressable
                        onPress={() =>
                          loadPromptCatalog(activeEpochRef.current, language)
                        }
                        accessibilityLabel="Retry loading prompts"
                      >
                        <AppText
                          variant="caption"
                          style={[
                            styles.retryText,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Retry
                        </AppText>
                      </Pressable>
                    </View>
                  )}
                  {!isCatalogLoading && !catalogError && prompts.length === 0 && (
                    <AppText
                      variant="caption"
                      style={{ color: theme.colors.textSecondary }}
                    >
                      No predefined prompts available right now. You can still ask a question below.
                    </AppText>
                  )}
                  {prompts.map(prompt => (
                    <Pressable
                      key={prompt.key}
                      onPress={() => handleSend(prompt.label, prompt.key)}
                      accessibilityLabel={prompt.label}
                      style={[
                        styles.quickPromptChip,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.quickPromptTitle,
                          { color: theme.colors.textPrimary },
                        ]}
                      >
                        {prompt.label}
                      </AppText>
                      <AppText
                        variant="caption"
                        style={{ color: theme.colors.textSecondary }}
                      >
                        {prompt.description}
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
      </KeyboardLiftView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  langBadgeText: {
    fontWeight: '700',
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
  fallbackNote: {
    marginTop: 4,
    fontStyle: 'italic',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 36,
  },
  retryRow: {
    paddingLeft: 36,
    marginBottom: 8,
    flexDirection: 'row',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: {
    fontWeight: '600',
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
  sourceChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionText: {
    fontWeight: '600',
  },
  quickPromptsContainer: {
    marginTop: 16,
    paddingHorizontal: 8,
  },
  quickPromptHeader: {
    marginBottom: 8,
    fontWeight: '600',
  },
  catalogStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  quickPromptChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 2,
  },
  quickPromptTitle: {
    fontWeight: '600',
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
