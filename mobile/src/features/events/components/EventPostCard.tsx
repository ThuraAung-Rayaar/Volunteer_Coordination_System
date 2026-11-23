/**
 * @format
 */

import React from 'react';
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { EventPost } from '../../../domain/models/event';
import {
  AppButton,
  AppCard,
  AppText,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface EventPostCardProps {
  post: EventPost;
  isApplied: boolean;
  onApplyPress: (post: EventPost) => void;
  isEventEnded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EventPostCard({
  post,
  isApplied,
  onApplyPress,
  isEventEnded = false,
  style,
}: EventPostCardProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const getStatusBadge = () => {
    switch (post.status) {
      case 'open':
        return <StatusBadge status="emerald" label="Open" />;
      case 'full':
        return <StatusBadge status="amber" label="Full" />;
      case 'closed':
        return <StatusBadge status="rose" label="Closed" />;
    }
  };

  const getPhysicalLevelColor = () => {
    switch (post.physicalLevel) {
      case 'heavy':
        return theme.colors.danger;
      case 'medium':
        return theme.colors.warning;
      case 'light':
      case 'none':
      default:
        return theme.colors.primary;
    }
  };

  const isActionDisabled =
    isApplied || isEventEnded || post.status === 'full' || post.status === 'closed';

  const getButtonLabel = () => {
    if (isApplied) {
      return 'Already Applied';
    }
    if (isEventEnded) {
      return 'Event Ended';
    }
    if (post.status === 'closed') {
      return 'Post Closed';
    }
    if (post.status === 'full') {
      return 'Post Full';
    }
    return 'Apply for Role';
  };

  return (
    <AppCard style={[styles.card, style]}>
      {/* Header: Title + Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
            {post.title}
          </AppText>
        </View>
        {getStatusBadge()}
      </View>

      {/* Description */}
      {post.description ? (
        <AppText
          variant="body"
          color={theme.colors.textSecondary}
          style={styles.description}
        >
          {post.description}
        </AppText>
      ) : null}

      {/* Attributes & Requirements */}
      <View style={styles.attributesSection}>
        {/* Physical Level */}
        <View style={styles.attributeRow}>
          <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary}>
            Physical Level:
          </AppText>
          <View
            style={[
              styles.attributePill,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={getPhysicalLevelColor()}
            >
              {post.physicalLevel.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* Capacity / Headcount */}
        <View style={styles.attributeRow}>
          <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary}>
            Headcount:
          </AppText>
          <AppText variant="caption" color={theme.colors.textPrimary}>
            {post.filledHeadcount}/{post.requiredHeadcount} filled ({post.remainingCapacity} spots remaining)
          </AppText>
        </View>

        {/* Required Skills */}
        {post.requiredSkills && post.requiredSkills.length > 0 ? (
          <View style={styles.skillsContainer}>
            <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary}>
              Required Skills:
            </AppText>
            <View style={styles.skillsWrap}>
              {post.requiredSkills.map(skill => (
                <View
                  key={skill}
                  style={[
                    styles.skillChip,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.sm,
                    },
                  ]}
                >
                  <AppText variant="caption" color={theme.colors.textPrimary}>
                    {skill}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Special Flags */}
        <View style={styles.flagsRow}>
          {post.leaderNeeded ? (
            <View
              style={[
                styles.flagBadge,
                { backgroundColor: theme.colors.surfaceRaised },
              ]}
            >
              <AppText variant="caption" weight="semibold" color={theme.colors.accent}>
                ★ Team Leader Needed
              </AppText>
            </View>
          ) : null}
          {post.newVolunteersAllowed ? (
            <View
              style={[
                styles.flagBadge,
                { backgroundColor: theme.colors.surfaceRaised },
              ]}
            >
              <AppText variant="caption" color={theme.colors.textSecondary}>
                ✓ New Volunteers Welcome
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      {/* Apply Button */}
      <View style={styles.actionContainer}>
        <AppButton
          label={getButtonLabel()}
          variant={isApplied ? 'secondary' : 'primary'}
          disabled={isActionDisabled}
          onPress={() => onApplyPress(post)}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  description: {
    marginBottom: 12,
    lineHeight: 18,
  },
  attributesSection: {
    gap: 8,
    marginBottom: 14,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attributePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 4,
  },
  skillsContainer: {
    marginTop: 2,
  },
  skillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  skillChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  flagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  actionContainer: {
    marginTop: 4,
  },
});
