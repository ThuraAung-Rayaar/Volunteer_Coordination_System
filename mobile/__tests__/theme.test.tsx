/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AppIcon, IconName } from '../src/shared/components/AppIcon';
import { darkColors, darkTheme } from '../src/theme/darkTheme';
import { lightColors, lightTheme } from '../src/theme/lightTheme';
import {
  resolveThemeMode,
  ThemeContext,
  ThemeContextValue,
  ThemeProvider,
} from '../src/theme/ThemeProvider';
import {
  MemoryThemeStorage,
  PluggableThemeStorage,
  THEME_STORAGE_KEY,
  ThemeStorage,
} from '../src/theme/themeStorage';
import { radius, spacing, ThemeMode, typography } from '../src/theme/tokens';

describe('Theme Mode Resolution', () => {
  it('resolves explicit light mode regardless of system appearance', () => {
    expect(resolveThemeMode('light', 'dark')).toBe('light');
    expect(resolveThemeMode('light', 'light')).toBe('light');
    expect(resolveThemeMode('light', null)).toBe('light');
  });

  it('resolves explicit dark mode regardless of system appearance', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
    expect(resolveThemeMode('dark', 'dark')).toBe('dark');
    expect(resolveThemeMode('dark', null)).toBe('dark');
  });

  it('resolves system mode based on system appearance', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
  });

  it('defaults system mode to light when system appearance is undefined or null', () => {
    expect(resolveThemeMode('system', undefined)).toBe('light');
    expect(resolveThemeMode('system', null)).toBe('light');
  });
});

describe('Theme Definitions & Tokens', () => {
  const requiredColorKeys = [
    'background',
    'surface',
    'surfaceRaised',
    'textPrimary',
    'textSecondary',
    'border',
    'primary',
    'onPrimary',
    'accent',
    'success',
    'warning',
    'danger',
    'muted',
  ] as const;

  it('lightTheme contains all required color keys and correct mode', () => {
    expect(lightTheme.mode).toBe('light');
    for (const key of requiredColorKeys) {
      expect(lightColors[key]).toBeDefined();
      expect(typeof lightColors[key]).toBe('string');
    }
  });

  it('darkTheme contains all required color keys and correct mode', () => {
    expect(darkTheme.mode).toBe('dark');
    for (const key of requiredColorKeys) {
      expect(darkColors[key]).toBeDefined();
      expect(typeof darkColors[key]).toBe('string');
    }
  });

  it('centralizes tokens across themes', () => {
    expect(lightTheme.spacing).toBe(spacing);
    expect(darkTheme.spacing).toBe(spacing);
    expect(lightTheme.radius).toBe(radius);
    expect(darkTheme.radius).toBe(radius);
    expect(lightTheme.typography).toBe(typography);
    expect(darkTheme.typography).toBe(typography);
  });
});

describe('Theme Storage & Preference Persistence', () => {
  it('strictly isolates storage key to display appearance preference', () => {
    expect(THEME_STORAGE_KEY).toBe('@volunteer_mgmt:theme_preference');
  });

  it('MemoryThemeStorage gets, sets, and clears theme preference', async () => {
    const storage = new MemoryThemeStorage();
    expect(await storage.getThemeMode()).toBeNull();

    await storage.setThemeMode('dark');
    expect(await storage.getThemeMode()).toBe('dark');

    await storage.setThemeMode('light');
    expect(await storage.getThemeMode()).toBe('light');

    await storage.setThemeMode('system');
    expect(await storage.getThemeMode()).toBe('system');

    await storage.clearThemeMode();
    expect(await storage.getThemeMode()).toBeNull();
  });

  it('MemoryThemeStorage accepts valid initial preference and ignores invalid values', async () => {
    const storage = new MemoryThemeStorage('dark');
    expect(await storage.getThemeMode()).toBe('dark');

    // cast invalid mode to verify runtime defensive guard
    await storage.setThemeMode('invalid_mode' as unknown as ThemeMode);
    expect(await storage.getThemeMode()).toBe('dark');
  });

  it('PluggableThemeStorage delegates to fallback memory storage when native package is absent', async () => {
    const pluggable = new PluggableThemeStorage();
    expect(await pluggable.getThemeMode()).toBeNull();

    await pluggable.setThemeMode('dark');
    expect(await pluggable.getThemeMode()).toBe('dark');

    await pluggable.clearThemeMode();
    expect(await pluggable.getThemeMode()).toBeNull();
  });

  it('PluggableThemeStorage routes to custom injected storage', async () => {
    const customMemory: ThemeStorage = {
      getThemeMode: jest.fn(async () => 'light' as ThemeMode),
      setThemeMode: jest.fn(async () => {}),
      clearThemeMode: jest.fn(async () => {}),
    };

    const pluggable = new PluggableThemeStorage();
    pluggable.setCustomStorage(customMemory);

    const mode = await pluggable.getThemeMode();
    expect(mode).toBe('light');
    expect(customMemory.getThemeMode).toHaveBeenCalled();

    await pluggable.setThemeMode('dark');
    expect(customMemory.setThemeMode).toHaveBeenCalledWith('dark');

    await pluggable.clearThemeMode();
    expect(customMemory.clearThemeMode).toHaveBeenCalled();
  });
});

describe('ThemeProvider & Flash Prevention', () => {
  it('renders children immediately when initialMode is provided', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider initialMode="dark">
          <Text testID="child-content">Main Screen Content</Text>
        </ThemeProvider>,
      );
    });

    const root = renderer.root;
    const textNode = root.findByProps({ testID: 'child-content' });
    expect(textNode.props.children).toBe('Main Screen Content');
  });

  it('prevents theme flash by delaying child rendering until storage resolves', async () => {
    let resolveStorage!: (value: ThemeMode | null) => void;
    const pendingStorage: ThemeStorage = {
      getThemeMode: () =>
        new Promise<ThemeMode | null>(resolve => {
          resolveStorage = resolve;
        }),
      setThemeMode: jest.fn(async () => {}),
      clearThemeMode: jest.fn(async () => {}),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider storage={pendingStorage}>
          <Text testID="child-content">Main Screen Content</Text>
        </ThemeProvider>,
      );
    });

    // Before storage resolution, children must not be rendered (null)
    expect(renderer.toJSON()).toBeNull();

    // Now resolve storage with dark theme preference
    await ReactTestRenderer.act(async () => {
      resolveStorage('dark');
    });

    // Children are rendered now with dark theme
    const textNode = renderer.root.findByProps({ testID: 'child-content' });
    expect(textNode.props.children).toBe('Main Screen Content');
  });

  it('updates active theme and persists preference to storage when setThemeMode is invoked', async () => {
    const memoryStorage = new MemoryThemeStorage();
    let capturedContext!: ThemeContextValue;

    function TestConsumer(): React.JSX.Element {
      return (
        <ThemeContext.Consumer>
          {val => {
            if (val) {
              capturedContext = val;
            }
            return <Text testID="consumer">{capturedContext?.themeMode}</Text>;
          }}
        </ThemeContext.Consumer>
      );
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider storage={memoryStorage} initialMode="light">
          <TestConsumer />
        </ThemeProvider>,
      );
    });

    expect(capturedContext.themeMode).toBe('light');
    expect(capturedContext.theme.mode).toBe('light');

    // Switch to dark mode
    await ReactTestRenderer.act(async () => {
      capturedContext.setThemeMode('dark');
    });

    expect(capturedContext.themeMode).toBe('dark');
    expect(capturedContext.theme.mode).toBe('dark');
    expect(await memoryStorage.getThemeMode()).toBe('dark');
    expect(renderer.root.findByProps({ testID: 'consumer' }).props.children).toBe('dark');
  });

  it('falls back gracefully without crashing when storage.getThemeMode rejects', async () => {
    const failingStorage: ThemeStorage = {
      getThemeMode: jest.fn().mockRejectedValue(new Error('Storage failure')),
      setThemeMode: jest.fn().mockResolvedValue(undefined),
      clearThemeMode: jest.fn().mockResolvedValue(undefined),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider storage={failingStorage}>
          <Text testID="fallback-content">Content Loaded</Text>
        </ThemeProvider>,
      );
    });

    const textNode = renderer.root.findByProps({ testID: 'fallback-content' });
    expect(textNode.props.children).toBe('Content Loaded');
  });
});

describe('AppIcon Adapter & Accessibility', () => {
  it('maps known icon names to cross-platform typographic symbols without colored emojis', async () => {
    const expectedMappings: Partial<Record<IconName, string>> = {
      menu: '☰',
      search: '⌕',
      close: '✕',
      star: '★',
      check: '✓',
      alert: '⚠',
      info: 'ℹ',
      calendar: '◫',
      user: '●',
      'chevron-right': '›',
      'chevron-left': '‹',
      'arrow-left': '←',
      location: '⌖',
      map: '⛶',
      refresh: '↻',
      filter: '▼',
      edit: '✎',
    };

    for (const [name, expectedGlyph] of Object.entries(expectedMappings)) {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ThemeProvider initialMode="light">
            <AppIcon name={name as IconName} />
          </ThemeProvider>,
        );
      });

      const textNode = renderer.root.findByType(Text);
      expect(textNode.props.children).toBe(expectedGlyph);
    }
  });

  it('hides decorative icon from accessibility tree when no label is provided', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider initialMode="light">
          <AppIcon name="search" />
        </ThemeProvider>,
      );
    });

    const textNode = renderer.root.findByType(Text);
    expect(textNode.props.accessible).toBe(false);
    expect(textNode.props['aria-hidden']).toBe(true);
    expect(textNode.props.importantForAccessibility).toBe('no');
    expect(textNode.props.accessibilityRole).toBeUndefined();
    expect(textNode.props.accessibilityLabel).toBeUndefined();
  });

  it('exposes meaningful accessibility properties when accessibilityLabel is provided', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider initialMode="light">
          <AppIcon name="search" accessibilityLabel="Search shifts and events" />
        </ThemeProvider>,
      );
    });

    const textNode = renderer.root.findByType(Text);
    expect(textNode.props.accessible).toBe(true);
    expect(textNode.props['aria-hidden']).toBe(false);
    expect(textNode.props.importantForAccessibility).toBe('yes');
    expect(textNode.props.accessibilityRole).toBe('image');
    expect(textNode.props.accessibilityLabel).toBe('Search shifts and events');
  });

  it('applies custom size, color, and style overrides', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider initialMode="light">
          <AppIcon
            name="star"
            size={24}
            color="#FFD700"
            style={{ marginHorizontal: 4 }}
          />
        </ThemeProvider>,
      );
    });

    const textNode = renderer.root.findByType(Text);
    const flattenedStyle = Object.assign({}, ...[].concat(textNode.props.style));
    expect(flattenedStyle.fontSize).toBe(24);
    expect(flattenedStyle.lineHeight).toBe(26);
    expect(flattenedStyle.color).toBe('#FFD700');
    expect(flattenedStyle.marginHorizontal).toBe(4);
  });

  it('falls back to default glyph for unrecognized icon name', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider initialMode="light">
          <AppIcon name={'unknown-icon' as unknown as IconName} />
        </ThemeProvider>,
      );
    });

    const textNode = renderer.root.findByType(Text);
    expect(textNode.props.children).toBe('•');
  });
});
