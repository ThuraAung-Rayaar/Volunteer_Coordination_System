/**
 * @format
 */

import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { MainDrawerNavigator } from '../navigation/MainDrawerNavigator';
import { useAppTheme } from '../theme';
import { AppProviders } from './AppProviders';
import { useCurrentUser } from './UserContext';
import { isHttpMode } from './configuration/dataMode';
import { OtpLoginScreen } from '../features/auth';
import { LoadingState } from '../shared';

export function AppNavigationRoot(): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const { isAuthenticated, isBootstrapping } = useCurrentUser();
  const httpMode = isHttpMode();

  if (httpMode && isBootstrapping) {
    return (
      <View
        style={[
          styles.centeredContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <LoadingState label="Connecting and restoring session..." />
      </View>
    );
  }

  if (httpMode && !isAuthenticated) {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <OtpLoginScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <MainDrawerNavigator />
      </NavigationContainer>
    </>
  );
}

export function AppRoot(): React.JSX.Element {
  return (
    <AppProviders>
      <AppNavigationRoot />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
