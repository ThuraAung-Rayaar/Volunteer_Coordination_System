/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useCurrentUser } from '../../../app/UserContext';
import {
  verificationPhotoStorage,
  VerificationSlotType,
  LocalEncryptedPhotoRecord,
} from '../../../core/storage/verificationPhotoStorage';
import type { ProfileRepository } from '../../../data/contracts/profileRepository';
import { defaultProfileRepository } from '../../../data/mock/MockProfileRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  VerificationCoordinatorData,
  VerificationImageSlot,
} from '../../../domain/models/verification';
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
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface VerificationCoordinatorStatusScreenProps
  extends Partial<MainDrawerScreenProps<'VerificationCoordinatorStatus'>> {
  repository?: ProfileRepository;
}

export function VerificationCoordinatorStatusScreen({
  navigation,
  repository: propRepository,
}: VerificationCoordinatorStatusScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.profileRepository ?? defaultProfileRepository;

  const [data, setData] = useState<VerificationCoordinatorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { currentUser } = useCurrentUser();
  const [localPhotos, setLocalPhotos] = useState<Record<string, LocalEncryptedPhotoRecord>>({});
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({});

  // Application Draft State
  const [applicationNote, setApplicationNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const loadVerificationData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await repository.getVerificationStatus();
      setData(res);
      if (res.coordinatorApplicationNote) {
        setApplicationNote(res.coordinatorApplicationNote);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load verification status',
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadVerificationData();
  }, [loadVerificationData]);

  useEffect(() => {
    if (data?.imageSlots && currentUser?.id) {
      const records: Record<string, LocalEncryptedPhotoRecord> = {};
      data.imageSlots.forEach(slot => {
        const found = verificationPhotoStorage.getAccountPhoto(
          currentUser.id,
          slot.imageType as VerificationSlotType,
        );
        if (found) {
          records[slot.imageType] = found;
        }
      });
      setLocalPhotos(records);
    }
  }, [data, currentUser]);

  const handlePickPhoto = async (slotType: VerificationSlotType, source: 'camera' | 'library') => {
    try {
      if (slotType === 'mock_selfie' && source === 'library') {
        setFeedbackBanner('Selfies must be captured live using the front camera and cannot be selected from the gallery.');
        return;
      }

      if (source === 'camera' && Platform.OS === 'android') {
        const hasCamera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (!hasCamera) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Permission',
              message: 'Volunteer app requires camera access to capture verification photos.',
              buttonPositive: 'Grant',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setFeedbackBanner('Camera permission was denied. Cannot take photo.');
            return;
          }
        }
      }

      const options = {
        mediaType: 'photo' as const,
        cameraType: (slotType === 'mock_selfie' ? 'front' : 'back') as 'front' | 'back',
        quality: 0.8 as const,
        maxWidth: 1920,
        maxHeight: 1080,
        saveToPhotos: false,
      };
      const response =
        source === 'camera'
          ? await launchCamera(options)
          : await launchImageLibrary(options);

      if (response.didCancel) {
        return;
      }

      if (response.errorCode) {
        setFeedbackBanner(`Camera error: ${response.errorMessage || response.errorCode}`);
        return;
      }

      if (!response.assets || response.assets.length === 0) {
        setFeedbackBanner('No photo was captured.');
        return;
      }

      const asset = response.assets[0];
      if (!asset.uri) {
        setFeedbackBanner('Failed to obtain image from camera or library.');
        return;
      }

      const fileSize = asset.fileSize || 1024 * 50;
      const mime = asset.type || 'image/jpeg';
      const record = await verificationPhotoStorage.saveAccountPhoto(
        currentUser.id,
        slotType,
        asset.uri,
        fileSize,
        mime,
        asset.fileName,
      );
      setLocalPhotos(prev => ({ ...prev, [slotType]: record }));
      setFeedbackBanner(`Captured photo for ${slotType}. Tap Upload to submit.`);
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Photo selection failed.');
    }
  };

  const handleUploadPhoto = async (slotType: VerificationSlotType) => {
    const record = localPhotos[slotType];
    if (!record || !repository.uploadVerificationImage) return;

    setUploadingSlots(prev => ({ ...prev, [slotType]: true }));
    try {
      verificationPhotoStorage.updateUploadStatus(currentUser.id, slotType, 'uploading');
      const res = await repository.uploadVerificationImage(
        slotType,
        record.fileUri,
        record.mimeType,
        record.fileName,
      );
      verificationPhotoStorage.updateUploadStatus(currentUser.id, slotType, 'uploaded');
      setFeedbackBanner(`Verification image uploaded (ID: ${res.id}, Status: ${res.status}). Encrypted on server.`);
      await loadVerificationData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed due to network error.';
      verificationPhotoStorage.updateUploadStatus(currentUser.id, slotType, 'failed', msg);
      setFeedbackBanner(`Upload failed: ${msg}`);
    } finally {
      setUploadingSlots(prev => ({ ...prev, [slotType]: false }));
    }
  };

  const handleRemovePhoto = (slotType: VerificationSlotType) => {
    verificationPhotoStorage.removeAccountPhoto(currentUser.id, slotType);
    setLocalPhotos(prev => {
      const next = { ...prev };
      delete next[slotType];
      return next;
    });
    setFeedbackBanner('Local photo removed.');
  };

  const handleSubmitCoordinatorApplication = async () => {
    if (!data?.canApplyForCoordinator) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await repository.submitCoordinatorApplication(
        applicationNote.trim(),
      );
      if (result.success) {
        setFeedbackBanner(
          `Coordinator application submitted (${result.message})`,
        );
        await loadVerificationData();
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error
          ? err.message
          : 'Failed to submit coordinator application',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Verification & Status"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
        <LoadingState label="Loading identity & coordinator credentials..." />
      </View>
    );
  }

  if (errorMessage || !data) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Verification & Status"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
        <ErrorState
          title="Credentials Unavailable"
          description={errorMessage ?? 'Could not retrieve verification credentials.'}
          onRetry={loadVerificationData}
        />
      </View>
    );
  }

  const isVerified = data.verificationStatus === 'verified';
  const isApprovedCoordinator = data.coordinatorStatus === 'approved';
  const isPendingCoordinator = data.coordinatorStatus === 'pending';

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Verification & Status"
        subtitle="Identity & coordinator credentials"
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      <ScreenContainer scroll style={styles.scroll}>
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

        {/* Section 1: Identity Verification Overview */}
        <SectionHeader title="Tier 1 Identity Verification" />
        <AppCard style={styles.cardSpacing}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Account Verification Level
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Tier 1 Verified status confirms identity via photo matching.
              </AppText>
            </View>
            <StatusBadge
              status={isVerified ? 'success' : 'warning'}
              label={data.verificationStatus.toUpperCase()}
            />
          </View>

          {/* Visual Upload Placeholders (No device camera/gallery access) */}
          <View
            style={[
              styles.uploadNoticeBox,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppIcon name="info" size={16} color={theme.colors.primary} />
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.uploadNoticeText}
            >
              Hardware camera and file uploads are disabled in this UI preview. Document images
              are encrypted on the server in production (AES-256-GCM). Local copies are retained encrypted on this device.
            </AppText>
          </View>

          <View style={styles.slotsContainer}>
            {data.imageSlots.map((slot: VerificationImageSlot) => {
              const isSelfie = slot.imageType === 'mock_selfie';
              return (
              <View
                key={slot.imageType}
                style={[
                  styles.slotCard,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.slotHeaderRow}>
                  <View style={styles.slotTitleGroup}>
                    <AppText
                      variant="body"
                      weight="bold"
                      color={theme.colors.textPrimary}
                    >
                      {slot.label}
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textSecondary}>
                      Format: JPEG • {isSelfie ? 'Front Camera Only • ' : ''}{slot.description}
                    </AppText>
                  </View>
                  <StatusBadge
                    status={
                      slot.status === 'verified'
                        ? 'success'
                        : slot.status === 'pending'
                        ? 'warning'
                        : 'muted'
                    }
                    label={slot.status.toUpperCase()}
                  />
                </View>

                {/* Interactive Slot UI */}
                {localPhotos[slot.imageType] ? (
                  <View
                    style={[
                      styles.localPhotoBox,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                        Local file: {localPhotos[slot.imageType].fileName}
                      </AppText>
                      <StatusBadge
                        status={
                          localPhotos[slot.imageType].uploadStatus === 'uploaded'
                            ? 'success'
                            : localPhotos[slot.imageType].uploadStatus === 'failed'
                            ? 'danger'
                            : 'warning'
                        }
                        label={localPhotos[slot.imageType].uploadStatus.toUpperCase()}
                      />
                    </View>
                    <AppText variant="caption" color={theme.colors.textSecondary}>
                      Size: {(localPhotos[slot.imageType].fileSizeBytes / 1024).toFixed(0)} KB • Encrypted on device
                    </AppText>
                    {localPhotos[slot.imageType].lastError ? (
                      <AppText variant="caption" color={theme.colors.danger}>
                        Error: {localPhotos[slot.imageType].lastError}
                      </AppText>
                    ) : null}

                    <View style={styles.photoActionRow}>
                      {localPhotos[slot.imageType].uploadStatus !== 'uploaded' ? (
                        <AppButton
                          label="Upload"
                          variant="primary"
                          loading={uploadingSlots[slot.imageType]}
                          onPress={() => handleUploadPhoto(slot.imageType as VerificationSlotType)}
                          style={{ flex: 1 }}
                        />
                      ) : null}
                      <AppButton
                        label={isSelfie ? 'Retake Selfie' : 'Replace'}
                        variant="secondary"
                        onPress={() => handlePickPhoto(slot.imageType as VerificationSlotType, 'camera')}
                        style={{ flex: 1 }}
                        accessibilityLabel={isSelfie ? 'Retake Selfie with Front Camera' : 'Replace'}
                      />
                      <AppButton
                        label="Remove"
                        variant="outline"
                        onPress={() => handleRemovePhoto(slot.imageType as VerificationSlotType)}
                      />
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.visualPlaceholderBox,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <AppIcon
                      name={slot.status === 'verified' ? 'check' : 'user'}
                      size={22}
                      color={
                        slot.status === 'verified'
                          ? theme.colors.success
                          : theme.colors.muted
                      }
                    />
                    <AppText
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={styles.placeholderLabel}
                    >
                      {slot.status === 'verified'
                        ? 'Encrypted Document Stored On Server'
                        : isSelfie
                        ? 'No selfie captured yet (Front Camera Only)'
                        : 'No local document selected'}
                    </AppText>
                    {slot.status !== 'verified' ? (
                      <View style={styles.photoActionRow}>
                        <AppButton
                          label={isSelfie ? 'Take Selfie (Front Camera)' : 'Take Photo'}
                          variant="primary"
                          onPress={() => handlePickPhoto(slot.imageType as VerificationSlotType, 'camera')}
                          style={{ flex: 1 }}
                          accessibilityLabel={isSelfie ? 'Take Selfie with Front Camera' : 'Take Photo'}
                        />
                        {!isSelfie ? (
                          <AppButton
                            label="Gallery"
                            variant="outline"
                            onPress={() => handlePickPhoto(slot.imageType as VerificationSlotType, 'library')}
                            style={{ flex: 1 }}
                            accessibilityLabel="Gallery"
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            );})}
          </View>
        </AppCard>

        {/* Section 2: Coordinator Profile Status & Application */}
        <SectionHeader title="Coordinator Authority & Application" />
        <AppCard style={styles.cardSpacing}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Coordinator Status
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Governs permission to create and manage volunteer events.
              </AppText>
            </View>
            <StatusBadge
              status={
                isApprovedCoordinator
                  ? 'success'
                  : isPendingCoordinator
                  ? 'warning'
                  : 'info'
              }
              label={data.coordinatorStatus.toUpperCase()}
            />
          </View>

          {/* Explanation Requirement Notice */}
          <View
            style={[
              styles.requirementBox,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText variant="caption" color={theme.colors.textPrimary}>
              ℹ️ Applying for Coordinator authority requires{' '}
              <AppText variant="caption" weight="bold">
                Tier 1 Verified
              </AppText>{' '}
              account status. Only active approved coordinators may publish
              events and manage rosters.
            </AppText>
          </View>

          {/* State 1: Approved Coordinator */}
          {isApprovedCoordinator ? (
            <View
              style={[
                styles.approvedBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.success,
                },
              ]}
            >
              <AppIcon name="check" size={20} color={theme.colors.success} />
              <View style={styles.approvedTextCol}>
                <AppText
                  variant="body"
                  weight="bold"
                  color={theme.colors.textPrimary}
                >
                  Approved Coordinator
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Your coordinator profile is active. You have full access to the
                  Coordinator Workspace in the navigation menu to publish events
                  and assign volunteers.
                </AppText>
              </View>
            </View>
          ) : null}

          {/* State 2: Pending Coordinator Application */}
          {isPendingCoordinator ? (
            <View
              style={[
                styles.approvedBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.warning,
                },
              ]}
            >
              <AppIcon name="alert" size={20} color={theme.colors.warning} />
              <View style={styles.approvedTextCol}>
                <AppText
                  variant="body"
                  weight="bold"
                  color={theme.colors.textPrimary}
                >
                  Application Under Review
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Your coordinator application has been received and is pending
                  administrator review. You will be notified once reviewed.
                </AppText>
                {applicationNote ? (
                  <AppText
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={styles.pendingNote}
                  >
                    Submitted note: "{applicationNote}"
                  </AppText>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* State 3: Not applied yet — Show application form if eligible */}
          {!isApprovedCoordinator && !isPendingCoordinator ? (
            <View style={styles.applicationForm}>
              {!isVerified ? (
                <View
                  style={[
                    styles.ineligibleBox,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.danger,
                    },
                  ]}
                >
                  <AppText variant="caption" color={theme.colors.danger}>
                    Verification Incomplete: Please complete Tier 1 identity
                    verification before submitting a coordinator application.
                  </AppText>
                </View>
              ) : (
                <>
                  <AppText
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={styles.formPrompt}
                  >
                    You are eligible to apply for Coordinator authority. Provide a
                    brief note describing your leadership or community coordination
                    experience:
                  </AppText>

                  <AppInput
                    label="Coordinator Application Note"
                    value={applicationNote}
                    onChangeText={setApplicationNote}
                    placeholder="e.g. Experienced community organizer with river cleanup background..."
                    multiline
                    numberOfLines={3}
                    style={styles.noteInput}
                  />

                  <AppButton
                    label="Submit Coordinator Application"
                    variant="primary"
                    loading={isSubmitting}
                    onPress={handleSubmitCoordinatorApplication}
                  />
                </>
              )}
            </View>
          ) : null}
        </AppCard>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingVertical: 16,
    paddingBottom: 40,
  },
  feedbackBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 8,
    gap: 4,
  },
  uploadNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    gap: 8,
    marginBottom: 14,
  },
  uploadNoticeText: {
    flex: 1,
    lineHeight: 16,
  },
  slotsContainer: {
    gap: 12,
  },
  slotCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  slotHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  slotTitleGroup: {
    flex: 1,
    marginRight: 8,
    gap: 2,
  },
  visualPlaceholderBox: {
    padding: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  localPhotoBox: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 6,
    gap: 8,
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  placeholderLabel: {
    fontSize: 11,
  },
  requirementBox: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 14,
  },
  approvedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    gap: 10,
  },
  approvedTextCol: {
    flex: 1,
    gap: 4,
  },
  pendingNote: {
    fontStyle: 'italic',
    marginTop: 4,
  },
  applicationForm: {
    marginTop: 4,
  },
  ineligibleBox: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 6,
  },
  formPrompt: {
    marginBottom: 10,
    lineHeight: 18,
  },
  noteInput: {
    marginBottom: 14,
  },
});
