/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppText,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
  RatingSummary,
  SearchInput,
  SectionHeader,
  StatusBadge,
} from '../src/shared';
import { ThemeProvider } from '../src/theme/ThemeProvider';

async function renderWithTheme(ui: React.ReactElement): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return renderer;
}

describe('Shared UI Components', () => {
  describe('AppText', () => {
    it('renders text with variant styles', async () => {
      const tree = await renderWithTheme(<AppText variant="heading">Test Heading</AppText>);
      expect(tree.toJSON()).toBeTruthy();
    });
  });

  describe('AppButton', () => {
    it('renders label and handles normal state', async () => {
      const onPress = jest.fn();
      const tree = await renderWithTheme(
        <AppButton label="Save Changes" onPress={onPress} />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Save Changes');
    });

    it('renders loading state with ActivityIndicator', async () => {
      const tree = await renderWithTheme(
        <AppButton label="Loading Button" loading onPress={() => {}} />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('ActivityIndicator');
    });

    it('renders disabled state', async () => {
      const tree = await renderWithTheme(
        <AppButton label="Disabled Action" disabled onPress={() => {}} />,
      );
      const json = tree.toJSON() as { props?: { accessibilityState?: { disabled?: boolean } } };
      expect(json?.props?.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('StatusBadge', () => {
    it('renders label and status icon', async () => {
      const tree = await renderWithTheme(
        <StatusBadge status="success" label="Confirmed" />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Confirmed');
      expect(str).toContain('✓');
    });

    it('renders warning badge with alert glyph', async () => {
      const tree = await renderWithTheme(
        <StatusBadge status="warning" label="Pending Approval" />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Pending Approval');
      expect(str).toContain('⚠');
    });
  });

  describe('RatingSummary', () => {
    it('renders average and review count when feedback exists', async () => {
      const tree = await renderWithTheme(
        <RatingSummary average={4.82} count={24} />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('4.8');
      expect(str).toContain('24 reviews');
      expect(str).toContain('★');
    });

    it('renders "No ratings yet" when average is null or count is 0', async () => {
      const treeNull = await renderWithTheme(
        <RatingSummary average={null} count={0} />,
      );
      const strNull = JSON.stringify(treeNull.toJSON());
      expect(strNull).toContain('No ratings yet');
      expect(strNull).not.toContain('★');

      const treeZero = await renderWithTheme(
        <RatingSummary average={0} count={0} />,
      );
      const strZero = JSON.stringify(treeZero.toJSON());
      expect(strZero).toContain('No ratings yet');
    });
  });

  describe('AppInput', () => {
    it('renders label and text value', async () => {
      const tree = await renderWithTheme(
        <AppInput
          label="Volunteer Name"
          value="Jane Doe"
          onChangeText={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Volunteer Name');
      expect(str).toContain('Jane Doe');
    });

    it('renders validation error message when provided', async () => {
      const tree = await renderWithTheme(
        <AppInput
          label="Email"
          value="invalid-email"
          error="Must be a valid email"
          onChangeText={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Must be a valid email');
    });
  });

  describe('FilterChip', () => {
    it('renders chip label and count', async () => {
      const tree = await renderWithTheme(
        <FilterChip
          label="Environment"
          count={15}
          selected={false}
          onPress={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Environment');
      expect(str).toContain('15');
    });

    it('reflects selected state in accessibilityState', async () => {
      const tree = await renderWithTheme(
        <FilterChip
          label="Animals"
          selected={true}
          onPress={() => {}}
        />,
      );
      const json = tree.toJSON() as { props?: { accessibilityState?: { checked?: boolean } } };
      expect(json?.props?.accessibilityState?.checked).toBe(true);
    });
  });

  describe('SearchInput', () => {
    it('renders search placeholder and search glyph', async () => {
      const tree = await renderWithTheme(
        <SearchInput
          value=""
          placeholder="Search shifts..."
          onChangeText={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Search shifts...');
      expect(str).toContain('⌕');
    });

    it('shows clear button when text is present', async () => {
      const tree = await renderWithTheme(
        <SearchInput
          value="cleanup"
          onChangeText={() => {}}
          onClear={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('✕');
    });
  });

  describe('AppHeader', () => {
    it('renders title and menu action', async () => {
      const onMenu = jest.fn();
      const tree = await renderWithTheme(
        <AppHeader
          title="Volunteer Dashboard"
          subtitle="Welcome back"
          onMenuPress={onMenu}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Volunteer Dashboard');
      expect(str).toContain('Welcome back');
      expect(str).toContain('☰');
    });
  });

  describe('SectionHeader', () => {
    it('renders title and action label', async () => {
      const tree = await renderWithTheme(
        <SectionHeader
          title="Recent Activities"
          actionLabel="View All"
          onActionPress={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Recent Activities');
      expect(str).toContain('View All');
    });
  });

  describe('States: Empty, Error, Loading', () => {
    it('renders EmptyState with description and action', async () => {
      const tree = await renderWithTheme(
        <EmptyState
          title="No records"
          description="You have not participated in any shifts yet."
          actionLabel="Find Events"
          onActionPress={() => {}}
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('No records');
      expect(str).toContain('Find Events');
    });

    it('renders ErrorState with retry button', async () => {
      const tree = await renderWithTheme(
        <ErrorState
          description="Failed to load assignments"
          onRetry={() => {}}
          retryLabel="Retry"
        />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Something went wrong');
      expect(str).toContain('Failed to load assignments');
      expect(str).toContain('Retry');
    });

    it('renders LoadingState with label', async () => {
      const tree = await renderWithTheme(
        <LoadingState label="Loading data..." />,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Loading data...');
      expect(str).toContain('ActivityIndicator');
    });
  });

  describe('AppCard', () => {
    it('renders card content', async () => {
      const tree = await renderWithTheme(
        <AppCard>
          <AppText>Inside Card</AppText>
        </AppCard>,
      );
      const str = JSON.stringify(tree.toJSON());
      expect(str).toContain('Inside Card');
    });
  });
});
