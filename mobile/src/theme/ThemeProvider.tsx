/**
 * @format
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';
import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import { defaultThemeStorage, ThemeStorage } from './themeStorage';
import { AppTheme, ThemeMode } from './tokens';

export function resolveThemeMode(
  mode: ThemeMode,
  systemColorScheme?: ColorSchemeName | null,
): 'light' | 'dark' {
  if (mode === 'light') {
    return 'light';
  }
  if (mode === 'dark') {
    return 'dark';
  }
  return systemColorScheme === 'dark' ? 'dark' : 'light';
}

export interface ThemeContextValue {
  theme: AppTheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
  isLoaded: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
);

export interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  storage?: ThemeStorage;
}

export function ThemeProvider({
  children,
  initialMode,
  storage = defaultThemeStorage,
}: ThemeProviderProps): React.JSX.Element {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    initialMode ?? 'light',
  );
  const [isLoaded, setIsLoaded] = useState<boolean>(initialMode !== undefined);
  const systemColorScheme = useColorScheme();

  // Load preference on mount before rendering main UI to prevent theme flash
  useEffect(() => {
    let isMounted = true;
    if (initialMode !== undefined) {
      setIsLoaded(true);
      return;
    }

    storage
      .getThemeMode()
      .then(stored => {
        if (isMounted) {
          if (
            stored === 'light' ||
            stored === 'dark' ||
            stored === 'system'
          ) {
            setThemeModeState(stored);
          }
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [storage, initialMode]);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      storage.setThemeMode(mode).catch(() => {});
    },
    [storage],
  );

  const activeMode = resolveThemeMode(themeMode, systemColorScheme);
  const isDark = activeMode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeMode,
      setThemeMode,
      isDark,
      isLoaded,
    }),
    [theme, themeMode, setThemeMode, isDark, isLoaded],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {isLoaded ? children : null}
    </ThemeContext.Provider>
  );
}
