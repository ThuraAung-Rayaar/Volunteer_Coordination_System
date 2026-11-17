/**
 * @format
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme';
import { UserProvider } from './UserContext';
import { RepositoryProvider } from './RepositoryProvider';

export interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({
  children,
}: AppProvidersProps): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <UserProvider>
          <RepositoryProvider>{children}</RepositoryProvider>
        </UserProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
