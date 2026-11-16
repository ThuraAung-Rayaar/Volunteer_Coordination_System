/**
 * @format
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemeMode, useAppTheme } from '../../theme';
import { AppHeader } from '../layout/AppHeader';
import { ScreenContainer } from '../layout/ScreenContainer';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { AppInput } from './AppInput';
import { AppText } from './AppText';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { FilterChip } from './FilterChip';
import { LoadingState } from './LoadingState';
import { RatingSummary } from './RatingSummary';
import { SearchInput } from './SearchInput';
import { SectionHeader } from './SectionHeader';
import { SegmentedControl } from './SegmentedControl';
import { StatusBadge } from './StatusBadge';

export function ComponentGalleryScreen(): React.JSX.Element {
  const { theme, themeMode, setThemeMode, isDark } = useAppTheme();

  // Component state for interactive testing
  const [inputText, setInputText] = useState('Volunteer Coordination');
  const [errorInputText, setErrorInputText] = useState('Invalid value');
  const [searchText, setSearchText] = useState('Community cleanup');
  const [activeSegment, setActiveSegment] = useState<'apps' | 'assign' | 'attend'>('apps');
  const [selectedChips, setSelectedChips] = useState<Record<string, boolean>>({
    environment: true,
    animals: false,
    disaster: false,
  });
  const [buttonLoading, setButtonLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string>('Ready');

  const toggleChip = (key: string) => {
    setSelectedChips(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const modeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: 'System' },
    { mode: 'light', label: '☀ Day · Blue + Cream' },
    { mode: 'dark', label: '☾ Night · Figma Slate' },
  ];

  return (
    <View style={styles.root}>
      <AppHeader
        title="CommonGround UI"
        subtitle="Shared Component & Style Specification"
        onMenuPress={() => setLastAction('Menu drawer button pressed')}
      />

      <ScreenContainer scroll style={styles.scrollContainer}>
        {/* Theme mode switcher card */}
        <AppCard variant="raised" style={styles.sectionCard}>
          <AppText variant="eyebrow" color={theme.colors.primary}>
            THEME SPECIFICATION (MOBILE-UI-STYLE.HTML)
          </AppText>
          <AppText variant="title" weight="extrabold" style={{ marginTop: 2 }}>
            Active: {themeMode.toUpperCase()} ({isDark ? 'Night · Figma Slate' : 'Day · Blue + Cream'})
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2, marginBottom: 12 }}>
            Last Action: {lastAction}
          </AppText>

          <View style={styles.themeSelectorRow}>
            {modeOptions.map(option => (
              <AppButton
                key={option.mode}
                label={option.label}
                variant={themeMode === option.mode ? 'primary' : 'secondary'}
                onPress={() => {
                  setThemeMode(option.mode);
                  setLastAction(`Switched theme to ${option.label}`);
                }}
                style={styles.flexOne}
              />
            ))}
          </View>
        </AppCard>

        {/* Hero Card Preview */}
        <SectionHeader title="Hero Container (.hero)" />
        <AppCard variant="hero" style={styles.sectionCard}>
          <StatusBadge status="sky" label="Volunteer workspace" />
          <AppText
            variant="label"
            weight="bold"
            color={theme.colors.primary}
            style={{ marginTop: 10 }}
          >
            Good morning, Alex
          </AppText>
          <AppText
            variant="hero"
            weight="extrabold"
            color={theme.colors.textPrimary}
            style={{ marginTop: 4 }}
          >
            Your time is making a difference.
          </AppText>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={{ marginTop: 6, lineHeight: 18 }}
          >
            2 confirmed shifts this week · 46 hours given
          </AppText>
        </AppCard>

        {/* Metric Cards Preview */}
        <SectionHeader title="Metric Cards (.metric with ambient glow)" />
        <View style={styles.metricsRow}>
          <AppCard
            variant="metric"
            glowColor={theme.colors.emerald ?? theme.colors.success}
            style={styles.metricItem}
          >
            <AppText variant="eyebrow" color={theme.colors.muted}>
              Shifts
            </AppText>
            <AppText
              variant="metric"
              weight="extrabold"
              color={theme.colors.emerald ?? theme.colors.success}
            >
              14
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              +3 this month
            </AppText>
          </AppCard>

          <AppCard
            variant="metric"
            glowColor={theme.colors.indigo ?? theme.colors.primary}
            style={styles.metricItem}
          >
            <AppText variant="eyebrow" color={theme.colors.muted}>
              Events
            </AppText>
            <AppText
              variant="metric"
              weight="extrabold"
              color={theme.colors.indigo ?? theme.colors.primary}
            >
              9
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              4 causes
            </AppText>
          </AppCard>

          <AppCard
            variant="metric"
            glowColor={theme.colors.sky ?? theme.colors.accent}
            style={styles.metricItem}
          >
            <AppText variant="eyebrow" color={theme.colors.muted}>
              Upcoming
            </AppText>
            <AppText
              variant="metric"
              weight="extrabold"
              color={theme.colors.sky ?? theme.colors.accent}
            >
              2
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              Next Sunday
            </AppText>
          </AppCard>
        </View>

        {/* Segmented Control Preview */}
        <SectionHeader title="Segmented Control (.seg)" />
        <SegmentedControl
          options={[
            { key: 'apps', label: 'Applications', count: 7 },
            { key: 'assign', label: 'Assignments', count: 14 },
            { key: 'attend', label: 'Attendance', count: 6 },
          ]}
          selectedKey={activeSegment}
          onSelect={key => {
            setActiveSegment(key as 'apps' | 'assign' | 'attend');
            setLastAction(`Selected segment: ${key}`);
          }}
          style={{ marginBottom: 12 }}
        />

        {/* Typography */}
        <SectionHeader title="Typography (AppText)" />
        <AppCard style={styles.sectionCard}>
          <AppText variant="hero">Hero (24dp, Extrabold -0.04em)</AppText>
          <AppText variant="heading">Heading (20dp, Extrabold -0.02em)</AppText>
          <AppText variant="title">Title (16dp, Bold)</AppText>
          <AppText variant="body">Body (14dp, Regular) — Default text style for readable content.</AppText>
          <AppText variant="caption">Caption (12dp, Regular, Muted secondary text)</AppText>
          <AppText variant="label">Label (11dp, Bold, Uppercase context)</AppText>
          <AppText variant="eyebrow">Eyebrow (9dp, Extrabold, Uppercase 0.09em)</AppText>
        </AppCard>

        {/* Buttons */}
        <SectionHeader title="Buttons (AppButton)" />
        <AppCard style={styles.sectionCard}>
          <View style={styles.buttonStack}>
            <AppButton
              label="Primary Action (Vibrant Blue)"
              variant="primary"
              leftIcon="check"
              onPress={() => setLastAction('Primary button clicked')}
            />
            <AppButton
              label="Secondary Action (Raised Surface)"
              variant="secondary"
              onPress={() => setLastAction('Secondary button clicked')}
            />
            <AppButton
              label="Warning Action (Amber Review)"
              variant="warning"
              leftIcon="alert"
              onPress={() => setLastAction('Warning button clicked')}
            />
            <AppButton
              label="Outline Action"
              variant="outline"
              leftIcon="refresh"
              onPress={() => setLastAction('Outline button clicked')}
            />
            <AppButton
              label="Danger Action"
              variant="danger"
              leftIcon="alert"
              onPress={() => setLastAction('Danger button clicked')}
            />
            <AppButton
              label="Ghost Action"
              variant="ghost"
              onPress={() => setLastAction('Ghost button clicked')}
            />
            <AppButton
              label={buttonLoading ? 'Loading...' : 'Toggle Loading State'}
              variant="primary"
              loading={buttonLoading}
              onPress={() => {
                setButtonLoading(true);
                setTimeout(() => setButtonLoading(false), 2000);
              }}
            />
            <AppButton
              label="Disabled Button"
              variant="primary"
              disabled
              onPress={() => {}}
            />
          </View>
        </AppCard>

        {/* Inputs */}
        <SectionHeader title="Inputs (AppInput & SearchInput)" />
        <AppCard style={styles.sectionCard}>
          <AppInput
            label="Volunteer Display Name"
            value={inputText}
            onChangeText={setInputText}
            placeholder="Enter your name"
            helperText="Visible to coordinators on event rosters"
            rightIcon="user"
            style={styles.fieldSpacing}
          />

          <AppInput
            label="Postal Code (Validation Error Preview)"
            value={errorInputText}
            onChangeText={setErrorInputText}
            placeholder="e.g. 94103"
            error="Invalid postal code format"
            style={styles.fieldSpacing}
          />

          <SearchInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search events, skills, or locations..."
            onClear={() => setSearchText('')}
          />
        </AppCard>

        {/* Filter Chips */}
        <SectionHeader title="Filter Chips (FilterChip)" />
        <AppCard style={styles.sectionCard}>
          <View style={styles.chipRow}>
            <FilterChip
              label="Environment"
              selected={selectedChips.environment}
              count={12}
              onPress={() => toggleChip('environment')}
            />
            <FilterChip
              label="Animal Care"
              selected={selectedChips.animals}
              count={8}
              onPress={() => toggleChip('animals')}
            />
            <FilterChip
              label="Disaster Aid"
              selected={selectedChips.disaster}
              count={3}
              onPress={() => toggleChip('disaster')}
            />
          </View>
        </AppCard>

        {/* Status Badges */}
        <SectionHeader title="Status Pills (.pill)" />
        <AppCard style={styles.sectionCard}>
          <View style={styles.badgeRow}>
            <StatusBadge status="emerald" label="Confirmed" />
            <StatusBadge status="sky" label="Active Shift" />
            <StatusBadge status="amber" label="Pending" />
            <StatusBadge status="rose" label="Blackout" />
            <StatusBadge status="indigo" label="Saturday" />
            <StatusBadge status="blue" label="Myanmar Time" />
            <StatusBadge status="muted" label="Draft" />
          </View>
        </AppCard>

        {/* Rating Summary */}
        <SectionHeader title="Rating Summary (RatingSummary)" />
        <AppCard style={styles.sectionCard}>
          <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
            With feedback aggregate:
          </AppText>
          <RatingSummary average={4.85} count={34} style={{ marginBottom: theme.spacing.md }} />

          <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
            Empty / no feedback state (no fabricated stars):
          </AppText>
          <RatingSummary average={null} count={0} />
        </AppCard>

        {/* States: Loading, Empty, Error */}
        <SectionHeader title="States (Loading, Empty, Error)" />
        <View style={styles.statesStack}>
          <LoadingState label="Fetching volunteer opportunities..." />

          <EmptyState
            title="No events found"
            description="Adjust filters or check back later for new opportunities."
            actionLabel="Reset Search"
            onActionPress={() => {
              setSearchText('');
              setLastAction('Reset search filter');
            }}
          />

          <ErrorState
            title="Connection Interrupted"
            description="Could not synchronize with the volunteer network. Check your connection."
            onRetry={() => setLastAction('Retried network request')}
          />
        </View>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 40,
  },
  sectionCard: {
    marginBottom: 12,
  },
  themeSelectorRow: {
    flexDirection: 'column',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    minHeight: 96,
  },
  buttonStack: {
    gap: 10,
  },
  fieldSpacing: {
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statesStack: {
    gap: 12,
  },
});
