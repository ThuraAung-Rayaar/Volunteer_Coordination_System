/**
 * @format
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  EmptyState,
  ScreenContainer,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface CoordinatorGuardNavigationProp {
  openDrawer?: () => void;
  navigate?: (route: string) => void;
  canGoBack?: () => boolean;
  goBack?: () => void;
}

export interface CoordinatorGuardProps {
  children: React.ReactNode;
  navigation?: CoordinatorGuardNavigationProp;
}

export function CoordinatorGuard({
  children,
  navigation,
}: CoordinatorGuardProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const { isCoordinator, currentUser } = useCurrentUser();

  if (isCoordinator) {
    return <>{children}</>;
  }

  // Access Denied Screen for non-approved states
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Coordinator Workspace"
        subtitle="Restricted Management Area"
        onMenuPress={navigation?.openDrawer ? () => navigation.openDrawer?.() : undefined}
      />

      <ScreenContainer style={styles.container}>
        <AppCard style={styles.card}>
          <EmptyState
            icon="alert"
            title="Coordinator Authority Required"
            description="The management workspace is restricted to active accounts with approved Coordinator authority. Your coordinator status is currently:"
          />

          <View style={styles.statusRow}>
            <StatusBadge
              status={
                currentUser.coordinatorStatus === 'pending'
                  ? 'warning'
                  : 'danger'
              }
              label={`Status: ${currentUser.coordinatorStatus.toUpperCase()}`}
            />
          </View>

          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.explanationText}
          >
            To publish events and manage shifts, apply for Coordinator status on
            the Verification page. Applications require Tier 1 Verified account
            status.
          </AppText>

          <View style={styles.actionsStack}>
            <AppButton
              label="View Verification & Status"
              variant="primary"
              onPress={() =>
                navigation?.navigate?.('VerificationCoordinatorStatus')
              }
            />
            <AppButton
              label="Return to Volunteer Dashboard"
              variant="outline"
              onPress={() => navigation?.navigate?.('Dashboard')}
            />
          </View>
        </AppCard>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    justifyContent: 'center',
    paddingVertical: 20,
  },
  card: {
    paddingVertical: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 12,
  },
  explanationText: {
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  actionsStack: {
    gap: 10,
  },
});
