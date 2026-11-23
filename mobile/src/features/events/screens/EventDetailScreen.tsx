/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { EventRepository } from '../../../data/contracts/eventRepository';
import {
  defaultEventRepository,
  MockEventRepository,
} from '../../../data/mock/MockEventRepository';
import { isHttpMode, isMockMode } from '../../../app/configuration/dataMode';
import { useRepositories } from '../../../app/RepositoryProvider';
import {
  CHARITY_CATEGORIES,
  CharityCategoryCode,
  EventDetail,
  EventPost,
} from '../../../domain/models/event';
import { appEventBus, AppEvents } from '../../../core/events/eventBus';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  ErrorState,
  LoadingState,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import { EventPostCard } from '../components/EventPostCard';

export interface EventDetailScreenProps
  extends Partial<MainDrawerScreenProps<'EventDetail'>> {
  eventId?: string;
  repository?: EventRepository;
}

function formatDateRange(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const dateStr = start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const startTime = start.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = end.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateStr} • ${startTime} - ${endTime}`;
  } catch {
    return `${startIso} - ${endIso}`;
  }
}

function getCategoryLabel(code: CharityCategoryCode): string {
  const match = CHARITY_CATEGORIES.find(c => c.code === code);
  return match ? match.label : code;
}

export function EventDetailScreen({
  route,
  navigation,
  eventId: propEventId,
  repository: propRepository,
}: EventDetailScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.eventRepository ?? defaultEventRepository;
  const eventId = propEventId ?? route?.params?.eventId;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Apply Modal state
  const [selectedPostForApply, setSelectedPostForApply] =
    useState<EventPost | null>(null);
  const [volunteerNote, setVolunteerNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!eventId) {
      setErrorMessage('No event ID provided');
      setIsLoading(false);
      return;
    }

    try {
      setErrorMessage(null);
      const data = await repository.getEventById(eventId);
      if (!data) {
        setErrorMessage('Event not found or no longer available.');
      } else {
        setEvent(data);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load event details',
      );
    } finally {
      setIsLoading(false);
    }
  }, [eventId, repository]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Re-fetch event detail on focus or when event status changes
  useEffect(() => {
    const unsubFocus = navigation?.addListener?.('focus', () => {
      fetchDetail();
    });
    const unsubBus = appEventBus.on(AppEvents.EVENT_STATUS_CHANGED, (data) => {
      if (!data || !data.eventId || String(data.eventId) === String(eventId)) {
        fetchDetail();
      }
    });
    return () => {
      unsubFocus?.();
      unsubBus();
    };
  }, [navigation, fetchDetail, eventId]);

  const handleApplyPress = (post: EventPost) => {
    setSelectedPostForApply(post);
    setVolunteerNote('');
    setModalError(null);
  };

  const handleConfirmApply = async () => {
    if (!event || !selectedPostForApply) {
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      const result = await repository.applyToPost(
        event.id,
        selectedPostForApply.id,
        volunteerNote,
      );

      if (result.success) {
        setFeedbackBanner(
          isMockMode()
            ? `Application recorded locally (${result.message})`
            : result.message,
        );
        setSelectedPostForApply(null);
        setModalError(null);
        // Refresh detail to get updated application and capacity
        await fetchDetail();
      } else {
        setModalError(result.message);
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Application submission failed';
      setModalError(msg);
      setFeedbackBanner(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    const returnTo = route?.params?.returnTo;
    if (returnTo && navigation) {
      navigation.navigate(returnTo);
    } else if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation) {
      navigation.navigate('Events');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader title="Event Details" onBackPress={handleBack} />
        <LoadingState label="Loading event information..." />
      </View>
    );
  }

  if (errorMessage || !event) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader title="Event Details" onBackPress={handleBack} />
        <ErrorState
          title="Event Not Found"
          description={errorMessage ?? 'Could not find the requested event.'}
          onRetry={fetchDetail}
        />
      </View>
    );
  }

  const statusStr = String(event.status);
  const isEnded = Boolean(
    statusStr === 'completed' ||
      statusStr === 'ended' ||
      statusStr === 'cancelled' ||
      (isHttpMode() &&
        Boolean(event.endAt && new Date(event.endAt).getTime() < Date.now())),
  );
  const isLive = !isEnded && event.status === 'active';
  const statusLabel = isEnded
    ? 'Ended'
    : isLive
    ? 'Live / Active Shift'
    : 'Published';
  const userApplication = event.userApplication;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Event Details"
        subtitle={event.title}
        onBackPress={handleBack}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { padding: theme.spacing.md },
        ]}
      >
        {/* Feedback / Demo confirmation banner */}
        {feedbackBanner ? (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.primary,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.primary}
            >
              {feedbackBanner}
            </AppText>
          </View>
        ) : null}

        {/* Title and Header Card */}
        <AppCard style={styles.sectionCard}>
          <View style={styles.titleHeaderRow}>
            <StatusBadge
              status={isEnded ? 'muted' : isLive ? 'info' : 'success'}
              label={statusLabel}
            />
            <AppText variant="caption" color={theme.colors.textSecondary}>
              Organized by {event.coordinatorName}
            </AppText>
          </View>

          <AppText
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
            style={styles.eventTitle}
          >
            {event.title}
          </AppText>

          {/* Charity Categories */}
          <View style={styles.categoriesRow}>
            {event.charityFields.map(code => (
              <View
                key={code}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="semibold"
                  color={theme.colors.primary}
                >
                  {getCategoryLabel(code)}
                </AppText>
              </View>
            ))}
          </View>
        </AppCard>

        {/* User Application Status Panel */}
        <AppCard
          style={[
            styles.sectionCard,
            {
              backgroundColor: userApplication
                ? theme.colors.surfaceRaised
                : theme.colors.surface,
              borderColor: userApplication
                ? theme.colors.primary
                : theme.colors.border,
            },
          ]}
        >
          <View style={styles.appStatusHeader}>
            <AppText
              variant="title"
              weight="bold"
              color={theme.colors.textPrimary}
            >
              Your Application Status
            </AppText>
            {userApplication ? (
              <StatusBadge
                status={
                  userApplication.status === 'accepted'
                    ? 'success'
                    : userApplication.status === 'pending'
                    ? 'warning'
                    : 'info'
                }
                label={userApplication.status.toUpperCase()}
              />
            ) : null}
          </View>

          {userApplication ? (
            <View style={styles.appStatusBody}>
              <AppText variant="body" color={theme.colors.textPrimary}>
                Applied for role:{' '}
                <AppText variant="body" weight="bold">
                  {userApplication.postTitle}
                </AppText>
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Submitted on{' '}
                {new Date(userApplication.appliedAt).toLocaleDateString()} • Demo
                mode
              </AppText>
              {userApplication.volunteerNote ? (
                <AppText
                  variant="caption"
                  color={theme.colors.textSecondary}
                  style={styles.noteText}
                >
                  Your note: "{userApplication.volunteerNote}"
                </AppText>
              ) : null}
            </View>
          ) : (
            <AppText variant="body" color={theme.colors.textSecondary}>
              You have not applied to any roles in this event yet. Browse the
              positions below to apply.
            </AppText>
          )}
        </AppCard>

        {/* Schedule & Timing */}
        <AppCard style={styles.sectionCard}>
          <SectionHeader title="Schedule & Timing" />
          <View style={styles.infoRow}>
            <AppIcon
              name="calendar"
              size={18}
              color={theme.colors.primary}
              style={styles.infoIcon}
            />
            <View style={styles.infoTextColumn}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Event Window
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {formatDateRange(event.startAt, event.endAt)}
              </AppText>
            </View>
          </View>

          {event.applicationDeadline ? (
            <View style={[styles.infoRow, styles.deadlineRow]}>
              <AppIcon
                name="alert"
                size={18}
                color={theme.colors.warning}
                style={styles.infoIcon}
              />
              <View style={styles.infoTextColumn}>
                <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                  Application Deadline
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {new Date(event.applicationDeadline).toLocaleDateString()} at{' '}
                  {new Date(event.applicationDeadline).toLocaleTimeString()}
                </AppText>
              </View>
            </View>
          ) : null}
        </AppCard>

        {/* Location & Landmark Card */}
        <AppCard style={styles.sectionCard}>
          <SectionHeader title="Location & Access" />
          <View style={styles.infoRow}>
            <AppIcon
              name="location"
              size={18}
              color={theme.colors.primary}
              style={styles.infoIcon}
            />
            <View style={styles.infoTextColumn}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                {event.locationName}
              </AppText>
              {event.landmarkText ? (
                <AppText
                  variant="caption"
                  color={theme.colors.textSecondary}
                  style={styles.landmarkText}
                >
                  Landmark: {event.landmarkText}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* Map Preview Placeholder Box */}
          <View
            style={[
              styles.mapPreviewBox,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <AppIcon name="map" size={28} color={theme.colors.primary} />
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.textPrimary}
              style={styles.mapTitle}
            >
              OpenStreetMap Geographic Preview
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              Coordinates: {event.latitude ?? 16.8000}°,{' '}
              {event.longitude ?? 96.1500}°
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.muted}
              style={styles.mapDisclaimer}
            >
              Interactive map SDK not connected in UI preview
            </AppText>
          </View>
        </AppCard>

        {/* Description & Purpose */}
        <AppCard style={styles.sectionCard}>
          <SectionHeader title="About this Event" />
          <AppText
            variant="body"
            color={theme.colors.textPrimary}
            style={styles.bodyDescription}
          >
            {event.description}
          </AppText>
        </AppCard>

        {/* Volunteer Support & Compensation */}
        <AppCard style={styles.sectionCard}>
          <SectionHeader title="Volunteer Support & Amenities" />
          <View style={styles.perksGrid}>
            <View style={styles.perkItem}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Meals:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.mealsProvided ? 'Provided on-site' : 'Not provided'}
              </AppText>
            </View>

            <View style={styles.perkItem}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Lodging:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.lodgingProvided ? 'Accommodations covered' : 'None'}
              </AppText>
            </View>

            <View style={styles.perkItem}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Travel Support:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.travelSupportProvided ? 'Shuttle/stipend provided' : 'Self travel'}
              </AppText>
            </View>

            <View style={styles.perkItem}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Compensation:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.compensationKind.toUpperCase()}
              </AppText>
            </View>
          </View>

          {event.compensationNote ? (
            <View
              style={[
                styles.compensationNoteBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Note: {event.compensationNote}
              </AppText>
            </View>
          ) : null}
        </AppCard>

        {/* Event Roles / Posts */}
        <SectionHeader
          title={`Available Roles & Posts (${event.posts.length})`}
        />

        {event.posts.map(post => {
          const isAppliedThisPost =
            userApplication?.postId === post.id;
          const isEventEnded = isEnded;
          return (
            <EventPostCard
              key={post.id}
              post={post}
              isApplied={Boolean(isAppliedThisPost)}
              onApplyPress={handleApplyPress}
              isEventEnded={isEventEnded}
            />
          );
        })}
      </ScrollView>

      {/* Demo Apply Confirmation Modal */}
      <Modal
        visible={Boolean(selectedPostForApply)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPostForApply(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.lg,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Apply for Volunteer Role
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel application"
                onPress={() => setSelectedPostForApply(null)}
                hitSlop={8}
              >
                <AppIcon name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            {/* Prominent Demo Warning */}
            {isMockMode() ? (
              <View
                style={[
                  styles.demoAlertBox,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.warning,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color={theme.colors.warning}
                  style={styles.demoWarningTitle}
                >
                  ⚠️ Demo only — not submitted to server
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  This is a UI preview. Your application will be stored in local
                  mock state for this session.
                </AppText>
              </View>
            ) : null}

            {/* Selected Post Summary */}
            <View style={styles.modalPostSummary}>
              <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
                {selectedPostForApply?.title}
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Physical Level: {selectedPostForApply?.physicalLevel.toUpperCase()}
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Remaining spots: {selectedPostForApply?.remainingCapacity}
              </AppText>
            </View>

            {/* Optional Volunteer Note */}
            <AppInput
              label="Volunteer Note (Optional)"
              placeholder="e.g. Relevant experience or availability details..."
              value={volunteerNote}
              onChangeText={setVolunteerNote}
              numberOfLines={3}
              multiline
              style={styles.modalInput}
            />

            {/* In-Modal Error Feedback */}
            {modalError ? (
              <View
                style={[
                  styles.modalErrorBox,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.danger,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="medium"
                  color={theme.colors.danger}
                >
                  {modalError}
                </AppText>
              </View>
            ) : null}

            {/* Modal Actions */}
            <View style={styles.modalActionsRow}>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setSelectedPostForApply(null)}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Confirm Application"
                  variant="primary"
                  loading={isSubmitting}
                  onPress={handleConfirmApply}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  feedbackBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  sectionCard: {
    marginBottom: 12,
  },
  titleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventTitle: {
    marginBottom: 10,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  appStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appStatusBody: {
    gap: 4,
  },
  noteText: {
    fontStyle: 'italic',
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  deadlineRow: {
    marginTop: 8,
  },
  infoIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  infoTextColumn: {
    flex: 1,
  },
  landmarkText: {
    marginTop: 4,
  },
  mapPreviewBox: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  mapTitle: {
    marginTop: 6,
    marginBottom: 2,
  },
  mapDisclaimer: {
    marginTop: 4,
    fontSize: 10,
  },
  bodyDescription: {
    lineHeight: 20,
  },
  perksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  perkItem: {
    width: '45%',
    gap: 2,
  },
  compensationNoteBox: {
    marginTop: 12,
    padding: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  demoAlertBox: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 14,
  },
  demoWarningTitle: {
    marginBottom: 4,
  },
  modalPostSummary: {
    marginBottom: 12,
    gap: 2,
  },
  modalInput: {
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButtonWrap: {
    flex: 1,
  },
  modalErrorBox: {
    marginVertical: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
});
