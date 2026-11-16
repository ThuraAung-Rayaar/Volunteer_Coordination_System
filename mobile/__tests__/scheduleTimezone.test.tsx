/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import { approvedCoordinatorUser } from '../src/data/mock/fixtures/demoUsers';
import { MockCoordinatorRepository } from '../src/data/mock/MockCoordinatorRepository';
import { CreateEventWizardScreen } from '../src/features/coordinator';
import { DatePickerModal } from '../src/shared';
import {
  combineDateTimeToMyanmarISO,
  compareMyanmarDateTimes,
  isValid24HourTimeFormat,
  isValidDateFormat,
  MYANMAR_TIMEZONE_LABEL,
  MYANMAR_TIMEZONE_OFFSET,
  parseMyanmarISO,
  validateEventSchedule,
} from '../src/shared/utils/dateTimeUtils';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function createMockNavigation() {
  return {
    navigate: jest.fn(),
    openDrawer: jest.fn(),
    closeDrawer: jest.fn(),
    toggleDrawer: jest.fn(),
    dispatch: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => true),
    getParent: jest.fn(),
    getState: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    setParams: jest.fn(),
    setOptions: jest.fn(),
  } as any;
}

function renderWithProviders(
  ui: React.ReactElement,
  userContext: Partial<UserContextValue> = {},
) {
  const defaultContext: UserContextValue = {
    currentUser: approvedCoordinatorUser,
    setCurrentUser: jest.fn(),
    isCoordinator: true,
    switchUserPreset: jest.fn(),
    ...userContext,
  };

  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <UserContext.Provider value={defaultContext}>
          {ui}
        </UserContext.Provider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (key === '_owner') {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
    }
    return value;
  });
}

describe('Myanmar Timezone & Schedule Utilities (Asia/Yangon UTC+06:30)', () => {
  it('combines date and time into Myanmar ISO string with explicit +06:30 offset', () => {
    const serialized = combineDateTimeToMyanmarISO('2026-12-01', '09:30');
    expect(serialized).toBe('2026-12-01T09:30:00+06:30');
  });

  it('rejects invalid 24-hour time format', () => {
    expect(isValid24HourTimeFormat('09:30')).toBe(true);
    expect(isValid24HourTimeFormat('00:00')).toBe(true);
    expect(isValid24HourTimeFormat('23:59')).toBe(true);

    // Invalid times
    expect(isValid24HourTimeFormat('24:00')).toBe(false);
    expect(isValid24HourTimeFormat('12:60')).toBe(false);
    expect(isValid24HourTimeFormat('9:30')).toBe(false);
    expect(isValid24HourTimeFormat('ab:cd')).toBe(false);
    expect(isValid24HourTimeFormat('')).toBe(false);

    expect(() => combineDateTimeToMyanmarISO('2026-12-01', '25:00')).toThrow(
      /Invalid 24-hour time format/,
    );
  });

  it('rejects invalid date format or impossible calendar dates', () => {
    expect(isValidDateFormat('2026-12-01')).toBe(true);
    expect(isValidDateFormat('2024-02-29')).toBe(true); // leap year

    // Invalid dates
    expect(isValidDateFormat('2026-02-29')).toBe(false); // non-leap year
    expect(isValidDateFormat('2026-04-31')).toBe(false); // April has 30 days
    expect(isValidDateFormat('2026-13-01')).toBe(false);
    expect(isValidDateFormat('invalid')).toBe(false);

    expect(() => combineDateTimeToMyanmarISO('2026-02-29', '09:30')).toThrow(
      /Invalid date format/,
    );
  });

  it('parses Myanmar ISO string into date and time without device timezone bias', () => {
    // Offset string
    const parsedOffset = parseMyanmarISO('2026-12-01T09:30:00+06:30');
    expect(parsedOffset.date).toBe('2026-12-01');
    expect(parsedOffset.time).toBe('09:30');
    expect(parsedOffset.offset).toBe(MYANMAR_TIMEZONE_OFFSET);

    // UTC string representation (03:00 UTC = 09:30 MMT)
    const parsedUtc = parseMyanmarISO('2026-12-01T03:00:00Z');
    expect(parsedUtc.date).toBe('2026-12-01');
    expect(parsedUtc.time).toBe('09:30');
  });

  it('guarantees device timezone independence when formatting Myanmar timestamps', () => {
    // Test that constructing the string is pure string formatting and never queries device-local hours
    const result1 = combineDateTimeToMyanmarISO('2026-12-15', '14:45');
    expect(result1).toBe('2026-12-15T14:45:00+06:30');

    // Compare with UTC instant
    const parsedEpoch = Date.parse(result1);
    // 14:45 MMT minus 6h30m = 08:15 UTC
    const expectedUtcEpoch = Date.parse('2026-12-15T08:15:00Z');
    expect(parsedEpoch).toBe(expectedUtcEpoch);
  });

  it('correctly compares two Myanmar dates and times', () => {
    const iso1 = combineDateTimeToMyanmarISO('2026-12-01', '08:00');
    const iso2 = combineDateTimeToMyanmarISO('2026-12-01', '09:00');
    const iso3 = combineDateTimeToMyanmarISO('2026-12-02', '08:00');

    // iso1 < iso2 -> negative
    expect(compareMyanmarDateTimes(iso1, iso2)).toBeLessThan(0);
    // iso3 > iso2 -> positive
    expect(compareMyanmarDateTimes(iso3, iso2)).toBeGreaterThan(0);
    // iso1 == iso1 -> 0
    expect(compareMyanmarDateTimes(iso1, iso1)).toBe(0);
  });

  describe('validateEventSchedule', () => {
    it('validates valid schedule and returns offset-aware ISO timestamps', () => {
      const res = validateEventSchedule({
        startDate: '2026-12-10',
        startTime: '08:00',
        endDate: '2026-12-10',
        endTime: '14:00',
        deadlineDate: '2026-12-08',
        deadlineTime: '18:00',
      });

      expect(res.isValid).toBe(true);
      expect(res.startAtIso).toBe('2026-12-10T08:00:00+06:30');
      expect(res.endAtIso).toBe('2026-12-10T14:00:00+06:30');
      expect(res.applicationDeadlineIso).toBe('2026-12-08T18:00:00+06:30');
    });

    it('rejects end time earlier than or equal to start time', () => {
      const earlierEnd = validateEventSchedule({
        startDate: '2026-12-10',
        startTime: '14:00',
        endDate: '2026-12-10',
        endTime: '08:00',
      });

      expect(earlierEnd.isValid).toBe(false);
      expect(earlierEnd.errorMessage).toContain(
        'Event end time must be later than start time.',
      );

      const equalEnd = validateEventSchedule({
        startDate: '2026-12-10',
        startTime: '08:00',
        endDate: '2026-12-10',
        endTime: '08:00',
      });

      expect(equalEnd.isValid).toBe(false);
      expect(equalEnd.errorMessage).toContain(
        'Event end time must be later than start time.',
      );
    });

    it('rejects application deadline later than event start time', () => {
      const deadlineAfterStart = validateEventSchedule({
        startDate: '2026-12-10',
        startTime: '08:00',
        endDate: '2026-12-10',
        endTime: '14:00',
        deadlineDate: '2026-12-10',
        deadlineTime: '08:05', // 5 minutes after start!
      });

      expect(deadlineAfterStart.isValid).toBe(false);
      expect(deadlineAfterStart.errorMessage).toContain(
        'Application deadline must be on or before the event start time.',
      );
    });

    it('accepts application deadline exactly equal to event start time', () => {
      const deadlineAtStart = validateEventSchedule({
        startDate: '2026-12-10',
        startTime: '08:00',
        endDate: '2026-12-10',
        endTime: '14:00',
        deadlineDate: '2026-12-10',
        deadlineTime: '08:00',
      });

      expect(deadlineAtStart.isValid).toBe(true);
    });
  });
});

describe('DatePickerModal Component', () => {
  it('renders calendar month and allows date selection', async () => {
    const handleSelect = jest.fn();
    const handleClose = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <DatePickerModal
              visible={true}
              initialDate="2026-12-10"
              title="Select Start Date"
              onSelectDate={handleSelect}
              onClose={handleClose}
            />
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Select Start Date');
    expect(json).toContain('December 2026');

    // Find day button for 2026-12-15
    const dayButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Select date 2026-12-15');

    expect(dayButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      dayButton!.props.onPress();
    });

    expect(handleSelect).toHaveBeenCalledWith('2026-12-15');
    expect(handleClose).toHaveBeenCalled();
  });

  it('navigates next and previous months in calendar view', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <DatePickerModal
              visible={true}
              initialDate="2026-12-10"
              onSelectDate={jest.fn()}
              onClose={jest.fn()}
            />
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const nextMonthButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next month');

    await ReactTestRenderer.act(async () => {
      nextMonthButton!.props.onPress();
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('January 2027');

    const prevMonthButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Previous month');

    await ReactTestRenderer.act(async () => {
      prevMonthButton!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('December 2026');
  });
});

describe('CreateEventWizardScreen Schedule & Location Step Integrations', () => {
  it('validates geofence radius contract (20 to 5000 meters) without silent defaults', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CreateEventWizardScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Advance Step 1 -> Step 2
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Riverbank Cleanup Project');
    });

    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next')!;

    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Now on Step 2: Location
    const locInput = renderer.root.findByProps({
      placeholder: 'e.g. Downtown Riverwalk Plaza, Pier 4',
    });
    await ReactTestRenderer.act(async () => {
      locInput.props.onChangeText('Central Pier');
    });

    // Enter invalid geofence radius: 10 meters (< 20)
    const radiusInput = renderer.root.findByProps({
      placeholder: '200',
    });
    await ReactTestRenderer.act(async () => {
      radiusInput.props.onChangeText('10');
    });

    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Geofence radius must be between 20 and 5000 meters.');

    // Enter invalid geofence radius: 6000 meters (> 5000)
    await ReactTestRenderer.act(async () => {
      radiusInput.props.onChangeText('6000');
    });

    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Geofence radius must be between 20 and 5000 meters.');

    // Enter valid geofence radius: 300 meters
    await ReactTestRenderer.act(async () => {
      radiusInput.props.onChangeText('300');
    });

    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Should successfully advance to Step 3
    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Step 3 of 7: Schedule');
  });

  it('renders Step 3 with separated date and 24h MMT time controls and timezone helper', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CreateEventWizardScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Advance to Step 3
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Riverbank Cleanup Project');
    });
    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next')!;

    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    const locInput = renderer.root.findByProps({
      placeholder: 'e.g. Downtown Riverwalk Plaza, Pier 4',
    });
    await ReactTestRenderer.act(async () => {
      locInput.props.onChangeText('Central Pier');
    });
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Step 3 of 7: Schedule');
    expect(json).toContain(MYANMAR_TIMEZONE_LABEL);
    expect(json).toContain('EVENT START *');
    expect(json).toContain('Start Time (24h MMT) *');
    expect(json).toContain('EVENT END *');
    expect(json).toContain('End Time (24h MMT) *');
    expect(json).toContain('APPLICATION DEADLINE (OPTIONAL)');
  });

  it('opens date picker from calendar icon button and sets selected date', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CreateEventWizardScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Advance to Step 3
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Riverbank Cleanup Project');
    });
    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next')!;
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });
    const locInput = renderer.root.findByProps({
      placeholder: 'e.g. Downtown Riverwalk Plaza, Pier 4',
    });
    await ReactTestRenderer.act(async () => {
      locInput.props.onChangeText('Central Pier');
    });
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Press start date picker button
    const calendarButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Open start date picker');

    expect(calendarButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      calendarButton!.props.onPress();
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Select Start Date');

    // Select date 2026-12-18
    const dayBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Select date 2026-12-18');

    expect(dayBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      dayBtn!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('2026-12-18');
  });

  it('displays separated dates and times and explicit offset ISO on Review screen (Step 7)', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CreateEventWizardScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Advance to Step 1 -> 7
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Riverbank Cleanup Project');
    });

    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next')!;

    // Step 1 -> 2
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Step 2
    const locInput = renderer.root.findByProps({
      placeholder: 'e.g. Downtown Riverwalk Plaza, Pier 4',
    });
    await ReactTestRenderer.act(async () => {
      locInput.props.onChangeText('Central Pier');
    });

    // Step 2 -> 3
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Step 3 -> 4
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Step 4 -> 5
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Step 5 -> 6
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Step 6 -> 7
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Step 7 of 7: Review');
    expect(json).toContain('Review Event Configuration');

    // Review schedule display checks
    expect(json).toContain('Start: Date 2026-12-10 • Time 08:00 (MMT)');
    expect(json).toContain('Start ISO: 2026-12-10T08:00:00+06:30');
    expect(json).toContain('End: Date 2026-12-10 • Time 14:00 (MMT)');
    expect(json).toContain('End ISO: 2026-12-10T14:00:00+06:30');
    expect(json).toContain(
      'Deadline: Date 2026-12-08 • Time 18:00 (MMT)',
    );
    expect(json).toContain('Deadline ISO: 2026-12-08T18:00:00+06:30');

    // Immutable service attributes check
    expect(json).toContain('IMMUTABLE SYSTEM ATTRIBUTES (ENFORCED BY SERVICE)');
    expect(json).toContain('Status: Draft • Onboarding Version: 1 • Coordinator: Jordan Lee');
  });
});
