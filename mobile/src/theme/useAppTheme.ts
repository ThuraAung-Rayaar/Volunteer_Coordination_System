/**
 * @format
 */

import { useContext } from 'react';
import { ThemeContext, ThemeContextValue } from './ThemeProvider';

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
}
