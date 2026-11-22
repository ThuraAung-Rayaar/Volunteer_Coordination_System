/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  CoordinatorEventDetail,
  CoordinatorEventStatus,
} from '../../../domain/models/coordinator';
import type { EventPost, PhysicalLevel, PostStatus } from '../../../domain/models/event';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  ErrorState,
  FilterChip,
  LoadingState,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import { CoordinatorGuard } from '../components';

export interface CoordinatorEventDetailScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorEventDetail'>> {
  eventId?: string;
  repository?: CoordinatorRepository;
}

export function CoordinatorEventDetailScreen({
  route,
  navigation,
  eventId: propEventId,
  repository: propRepository,
}: CoordinatorEventDetailScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;
  const eventId = propEventId ?? route?.params?.eventId;

  const [event, setEvent] = useState<CoordinatorEventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Transition Confirmation Dialog State
  const [pendingTargetStatus, setPendingTargetStatus] =
    useState<CoordinatorEventStatus | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Event-post template/editor state. In template mode these changes update the
  // local mock repository; in HTTP mode the BFF response is reloaded as authority.
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [postHeadcount, setPostHeadcount] = useState('1');
  const [postPhysicalLevel, setPostPhysicalLevel] = useState<PhysicalLevel>('light');
  const [postSkillsText, setPostSkillsText] = useState('');
  const [postLeaderNeeded, setPostLeaderNeeded] = useState(false);
  const [postNewVolunteersAllowed, setPostNewVolunteersAllowed] = useState(true);
  const [postPriority, setPostPriority] = useState('100');
  const [postStatus, setPostStatus] = useState<PostStatus>('open');
  const [isSavingPost, setIsSavingPost] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!eventId) {
      setErrorMessage('No event ID provided');
      setIsLoading(false);
      return;
    }

    try {
      setErrorMessage(null);
      const data = await repository.getEventDetail(eventId);
      if (!data) {
        setErrorMessage('Coordinator event not found');
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
    loadDetail();
  }, [loadDetail]);

  const handleConfirmTransition = async () => {
    if (!event || !pendingTargetStatus) {
      return;
    }

    setIsTransitioning(true);
    try {
      const result = await repository.transitionEventStatus(
        event.id,
        pendingTargetStatus,
      );

      if (result.success && result.data) {
        setFeedbackBanner(
          `Event status updated to ${pendingTargetStatus.toUpperCase()} (${result.message})`,
        );
        setEvent(result.data);
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Transition failed',
      );
    } finally {
      setIsTransitioning(false);
      setPendingTargetStatus(null);
    }
  };

  const resetPostForm = () => {
    setEditingPostId(null);
    setPostTitle('');
    setPostDescription('');
    setPostHeadcount('1');
    setPostPhysicalLevel('light');
    setPostSkillsText('');
    setPostLeaderNeeded(false);
    setPostNewVolunteersAllowed(true);
    setPostPriority('100');
    setPostStatus('open');
  };

  const handleEditPost = (post: EventPost) => {
    setEditingPostId(post.id);
    setPostTitle(post.title);
    setPostDescription(post.description ?? '');
    setPostHeadcount(String(post.requiredHeadcount));
    setPostPhysicalLevel(post.physicalLevel);
    setPostSkillsText(post.requiredSkills.join(', '));
    setPostLeaderNeeded(post.leaderNeeded);
    setPostNewVolunteersAllowed(post.newVolunteersAllowed);
    setPostPriority(String(post.priority ?? 100));
    setPostStatus(post.status);
  };

  const handleSavePost = async () => {
    if (!event || isMonitorMode || isFinalState) return;
    const requiredHeadcount = Number(postHeadcount.trim());
    const priority = Number(postPriority.trim());
    if (!postTitle.trim()) {
      setFeedbackBanner('Post title is required.');
      return;
    }
    if (!Number.isInteger(requiredHeadcount) || requiredHeadcount < 1) {
      setFeedbackBanner('Required headcount must be a positive whole number.');
      return;
    }
    if (!Number.isInteger(priority)) {
      setFeedbackBanner('Priority must be a whole number.');
      return;
    }

    const postDraft = {
      title: postTitle.trim(),
      description: postDescription.trim(),
      requiredHeadcount,
      physicalLevel: postPhysicalLevel,
      requiredSkills: postSkillsText.split(',').map(value => value.trim()).filter(Boolean),
      leaderNeeded: postLeaderNeeded,
      newVolunteersAllowed: postNewVolunteersAllowed,
      priority,
    };

    setIsSavingPost(true);
    try {
      const result = editingPostId
        ? await repository.updateEventPost(editingPostId, {
            ...postDraft,
            status: postStatus,
          })
        : await repository.createEventPost(event.id, postDraft);

      if (!result.success) {
        setFeedbackBanner(result.message);
        return;
      }

      setFeedbackBanner(result.message);
      resetPostForm();
      await loadDetail();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Failed to save event post.');
    } finally {
      setIsSavingPost(false);
    }
  };

  const confirmClosePost = async (postId: string) => {
    try {
      const result = await repository.closeEventPost(postId);
      setFeedbackBanner(result.message);
      if (result.success) await loadDetail();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Failed to close event post.');
    }
  };

  const handleClosePost = (post: EventPost) => {
    Alert.alert(
      'Close event post?',
      `New applications will no longer be accepted for "${post.title}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close Post', style: 'destructive', onPress: () => { void confirmClosePost(post.id); } },
      ],
    );
  };

  const handleBack = () => {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation) {
      navigation.navigate('CoordinatorEvents');
    }
  };

  if (isLoading) {
    return (
      <CoordinatorGuard navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
          <AppHeader title="Event Management" onBackPress={handleBack} />
          <LoadingState label="Loading event management details..." />
        </View>
      </CoordinatorGuard>
    );
  }

  if (errorMessage || !event) {
    return (
      <CoordinatorGuard navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
          <AppHeader title="Event Management" onBackPress={handleBack} />
          <ErrorState
            title="Event Not Found"
            description={errorMessage ?? 'Could not find coordinator event.'}
            onRetry={loadDetail}
          />
        </View>
      </CoordinatorGuard>
    );
  }

  const isMonitorMode = event.isOwnerAsMonitor;
  const isFinalState =
    event.status === 'completed' || event.status === 'cancelled';

  return (
    <CoordinatorGuard navigation={navigation}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Event Management"
          subtitle={event.title}
          onBackPress={handleBack}
        />

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { padding: theme.spacing.md },
          ]}
        >
          {/* Feedback Banner */}
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

          {/* OWNER-AS-MONITOR READ-ONLY BANNER */}
          {isMonitorMode ? (
            <View
              style={[
                styles.monitorBanner,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.accent,
                },
              ]}
            >
              <AppIcon name="alert" size={20} color={theme.colors.accent} />
              <View style={styles.monitorTextCol}>
                <AppText
                  variant="body"
                  weight="bold"
                  color={theme.colors.accent}
                >
                  Read-Only Monitor Mode
                </AppText>
                <AppText
                  variant="caption"
                  color={theme.colors.textSecondary}
                  style={styles.monitorSubtext}
                >
                  Coordination of this event has been handed over to{' '}
                  <AppText variant="caption" weight="bold">
                    {event.coordinatorName}
                  </AppText>
                  . As event owner, you can monitor rosters and attendance, but
                  all edit and lifecycle transitions are disabled.
                </AppText>
              </View>
            </View>
          ) : null}

          {/* Event Header Card */}
          <AppCard style={styles.cardSpacing}>
            <View style={styles.headerRow}>
              <View style={styles.statusGroup}>
                <StatusBadge
                  status={
                    event.status === 'active'
                      ? 'info'
                      : event.status === 'published'
                      ? 'success'
                      : event.status === 'draft'
                      ? 'warning'
                      : event.status === 'completed'
                      ? 'success'
                      : 'danger'
                  }
                  label={event.status.toUpperCase()}
                />
                {isMonitorMode ? (
                  <StatusBadge status="warning" label="MONITOR ONLY" />
                ) : null}
              </View>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Coordinator: {event.coordinatorName}
              </AppText>
            </View>

            <AppText
              variant="heading"
              weight="bold"
              color={theme.colors.textPrimary}
              style={styles.title}
            >
              {event.title}
            </AppText>

            <AppText
              variant="body"
              color={theme.colors.textSecondary}
              style={styles.description}
            >
              {event.description}
            </AppText>

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
                    {code}
                  </AppText>
                </View>
              ))}
            </View>
          </AppCard>

          {/* Lifecycle Transitions Control Bar */}
          <SectionHeader title="Event Lifecycle Actions" />
          <AppCard style={styles.cardSpacing}>
            {isFinalState ? (
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Event is in final {event.status.toUpperCase()} state. No further
                lifecycle transitions are permitted.
              </AppText>
            ) : isMonitorMode ? (
              <AppText variant="caption" color={theme.colors.accent}>
                Write and status transition actions are disabled for owner in
                monitor mode.
              </AppText>
            ) : (
              <View style={styles.actionsBar}>
                {/* Draft Actions */}
                {event.status === 'draft' && (
                  <>
                    <AppButton
                      label="Publish Event"
                      variant="primary"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('published')}
                    />
                    <AppButton
                      label="Cancel Event"
                      variant="danger"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('cancelled')}
                    />
                  </>
                )}

                {/* Published Actions */}
                {event.status === 'published' && (
                  <>
                    <AppButton
                      label="Activate Event (Shift Live)"
                      variant="primary"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('active')}
                    />
                    <AppButton
                      label="Cancel Event"
                      variant="danger"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('cancelled')}
                    />
                  </>
                )}

                {/* Active Actions */}
                {event.status === 'active' && (
                  <>
                    <AppButton
                      label="Mark Completed"
                      variant="primary"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('completed')}
                    />
                    <AppButton
                      label="Cancel Event"
                      variant="danger"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('cancelled')}
                    />
                  </>
                )}
              </View>
            )}
          </AppCard>

          {/* Operational Metrics Panel */}
          <SectionHeader title="Operational Roster Summary" />
          <AppCard style={styles.cardSpacing}>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Pending Apps
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={
                    event.pendingApplicationCount > 0
                      ? theme.colors.warning
                      : theme.colors.textPrimary
                  }
                >
                  {event.pendingApplicationCount}
                </AppText>
              </View>

              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Accepted Roster
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={theme.colors.primary}
                >
                  {event.acceptedApplicantCount}
                </AppText>
              </View>

              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Assigned Shifts
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={theme.colors.textPrimary}
                >
                  {event.assignedCount}
                </AppText>
              </View>

              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Checked In
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={theme.colors.success}
                >
                  {event.checkedInCount}
                </AppText>
              </View>
            </View>

            {/* Operational Management Quick Links */}
            <View style={styles.rosterActionButtons}>
              <View style={styles.rosterBtnCol}>
                <AppButton
                  label="Applications"
                  variant="secondary"
                  onPress={() =>
                    navigation?.navigate?.('CoordinatorApplications', {
                      eventId: event.id,
                    })
                  }
                />
              </View>
              <View style={styles.rosterBtnCol}>
                <AppButton
                  label="Assignments"
                  variant="secondary"
                  onPress={() =>
                    navigation?.navigate?.('CoordinatorAssignments', {
                      eventId: event.id,
                    })
                  }
                />
              </View>
              <View style={styles.rosterBtnCol}>
                <AppButton
                  label="Attendance"
                  variant="secondary"
                  onPress={() =>
                    navigation?.navigate?.('CoordinatorAttendance', {
                      eventId: event.id,
                    })
                  }
                />
              </View>
            </View>
          </AppCard>


          {/* Event Posts & Role Requirements */}
          <SectionHeader title={`Event Posts & Role Requirements (${event.posts.length})`} />
          <AppCard style={styles.cardSpacing}>
            {event.posts.length === 0 ? (
              <AppText variant="caption" color={theme.colors.textSecondary}>
                No role posts have been created for this event yet.
              </AppText>
            ) : (
              event.posts.map(post => (
                <View
                  key={post.id}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={styles.postTitleRow}>
                    <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
                      {post.title}
                    </AppText>
                    <StatusBadge status={post.status === 'open' ? 'success' : post.status === 'full' ? 'warning' : 'danger'} />
                  </View>
                  {post.description ? (
                    <AppText variant="caption" color={theme.colors.textSecondary}>
                      {post.description}
                    </AppText>
                  ) : null}
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    Headcount: {post.filledHeadcount}/{post.requiredHeadcount} • Remaining: {post.remainingCapacity}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    Physical level: {post.physicalLevel} • Priority: {post.priority ?? 100}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    Skills: {post.requiredSkills.length ? post.requiredSkills.join(', ') : 'No specific skills'}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    Group leader needed: {post.leaderNeeded ? 'Yes' : 'No'} • New volunteers: {post.newVolunteersAllowed ? 'Allowed' : 'Not allowed'}
                  </AppText>
                  {!isMonitorMode && !isFinalState ? (
                    <View style={[styles.rosterActionButtons, { marginTop: 8 }]}>
                      <View style={styles.rosterBtnCol}>
                        <AppButton label="Edit" variant="outline" onPress={() => handleEditPost(post)} />
                      </View>
                      <View style={styles.rosterBtnCol}>
                        <AppButton
                          label="Close Post"
                          variant="danger"
                          disabled={post.status === 'closed'}
                          onPress={() => handleClosePost(post)}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ))
            )}

            {isMonitorMode ? (
              <AppText variant="caption" color={theme.colors.accent} style={{ marginTop: 12 }}>
                Post management is read-only while another coordinator owns event operations.
              </AppText>
            ) : isFinalState ? (
              <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 12 }}>
                Event posts are read-only after the event reaches a final state.
              </AppText>
            ) : (
              <View style={{ marginTop: 14 }}>
                <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
                  {editingPostId ? 'Edit Event Post' : 'Create Event Post'}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 10 }}>
                  These fields match the current event-post BFF contract.
                </AppText>
                <AppInput label="Post Title *" value={postTitle} onChangeText={setPostTitle} placeholder="e.g. First Aid Support" style={{ marginBottom: 10 }} />
                <AppInput label="Description" value={postDescription} onChangeText={setPostDescription} placeholder="Describe the shift duties" multiline numberOfLines={3} style={{ marginBottom: 10 }} />
                <View style={styles.postFormRow}>
                  <View style={styles.postFormHalf}>
                    <AppInput label="Required Headcount *" value={postHeadcount} onChangeText={setPostHeadcount} placeholder="5" />
                  </View>
                  <View style={styles.postFormHalf}>
                    <AppInput label="Priority" value={postPriority} onChangeText={setPostPriority} placeholder="100" />
                  </View>
                </View>
                <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={{ marginTop: 8, marginBottom: 6 }}>
                  Physical Level
                </AppText>
                <View style={styles.chipsRow}>
                  {(['none', 'light', 'medium', 'heavy'] as PhysicalLevel[]).map(level => (
                    <FilterChip key={level} label={level} selected={postPhysicalLevel === level} onPress={() => setPostPhysicalLevel(level)} />
                  ))}
                </View>
                <AppInput label="Required Skills (comma-separated)" value={postSkillsText} onChangeText={setPostSkillsText} placeholder="first_aid, logistics" style={{ marginTop: 10 }} />
                <View style={[styles.chipsRow, { marginTop: 10 }]}>
                  <FilterChip label="Leader Needed" selected={postLeaderNeeded} onPress={() => setPostLeaderNeeded(!postLeaderNeeded)} />
                  <FilterChip label="New Volunteers Allowed" selected={postNewVolunteersAllowed} onPress={() => setPostNewVolunteersAllowed(!postNewVolunteersAllowed)} />
                </View>
                {editingPostId ? (
                  <>
                    <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={{ marginTop: 10, marginBottom: 6 }}>
                      Post Status
                    </AppText>
                    <View style={styles.chipsRow}>
                      {(['open', 'full', 'closed'] as PostStatus[]).map(status => (
                        <FilterChip key={status} label={status} selected={postStatus === status} onPress={() => setPostStatus(status)} />
                      ))}
                    </View>
                  </>
                ) : null}
                <View style={[styles.rosterActionButtons, { marginTop: 14 }]}>
                  <View style={styles.rosterBtnCol}>
                    <AppButton label={isSavingPost ? 'Saving...' : editingPostId ? 'Save Post Changes' : 'Create Post'} variant="primary" loading={isSavingPost} onPress={handleSavePost} />
                  </View>
                  {editingPostId ? (
                    <View style={styles.rosterBtnCol}>
                      <AppButton label="Cancel Edit" variant="outline" onPress={resetPostForm} />
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          </AppCard>

          {/* Location & Rules Summary */}
          <SectionHeader title="Location & Access Configuration" />
          <AppCard style={styles.cardSpacing}>
            <View style={styles.detailRow}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Location:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.locationName}
              </AppText>
            </View>

            {event.landmarkText ? (
              <View style={styles.detailRow}>
                <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                  Landmark:
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {event.landmarkText}
                </AppText>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Geo Check-In:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.geoCheckinEnabled
                  ? `Enabled (${event.geoRadiusM}m radius, ${event.geoCheckinOpensBeforeMin} min buffer)`
                  : 'Disabled'}
              </AppText>
            </View>

            <View style={styles.detailRow}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Schedule:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.startAt} to {event.endAt}
              </AppText>
            </View>
          </AppCard>
        </ScrollView>

        {/* Consequential Transition Confirmation Modal */}
        <Modal
          visible={Boolean(pendingTargetStatus)}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingTargetStatus(null)}
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
                  Confirm Status Transition
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close confirmation"
                  onPress={() => setPendingTargetStatus(null)}
                  hitSlop={8}
                >
                  <AppIcon name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              <View
                style={[
                  styles.demoWarningBox,
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
                >
                  ⚠️ Demo Preview — not submitted to server
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  This transition will update local mock state for this preview
                  session.
                </AppText>
              </View>

              <AppText variant="body" color={theme.colors.textPrimary} style={styles.confirmPrompt}>
                Are you sure you want to transition this event from{' '}
                <AppText variant="body" weight="bold">
                  {event.status.toUpperCase()}
                </AppText>{' '}
                to{' '}
                <AppText variant="body" weight="bold">
                  {pendingTargetStatus?.toUpperCase()}
                </AppText>
                ?
              </AppText>

              <View style={styles.modalActionsRow}>
                <View style={styles.modalButtonWrap}>
                  <AppButton
                    label="Cancel"
                    variant="outline"
                    onPress={() => setPendingTargetStatus(null)}
                  />
                </View>
                <View style={styles.modalButtonWrap}>
                  <AppButton
                    label="Confirm (Demo)"
                    variant={
                      pendingTargetStatus === 'cancelled'
                        ? 'danger'
                        : 'primary'
                    }
                    loading={isTransitioning}
                    onPress={handleConfirmTransition}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </CoordinatorGuard>
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
    marginBottom: 16,
  },
  monitorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    gap: 10,
    marginBottom: 16,
  },
  monitorTextCol: {
    flex: 1,
    gap: 4,
  },
  monitorSubtext: {
    lineHeight: 18,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    marginBottom: 8,
  },
  description: {
    lineHeight: 20,
    marginBottom: 12,
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
  actionsBar: {
    gap: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  metricItem: {
    alignItems: 'center',
    gap: 4,
  },
  rosterActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  rosterBtnCol: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  postTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  postFormRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  postFormHalf: {
    flex: 1,
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
    maxWidth: 400,
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  demoWarningBox: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 14,
    gap: 2,
  },
  confirmPrompt: {
    marginBottom: 16,
    lineHeight: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButtonWrap: {
    flex: 1,
  },
});
