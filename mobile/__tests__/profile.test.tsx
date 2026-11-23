/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MockProfileRepository } from '../src/data/mock/MockProfileRepository';
import { mockVolunteerProfile } from '../src/data/mock/fixtures/profileFixture';
import {
  AvailabilityScreen,
  ProfileEditScreen,
  ProfileScreen,
  VerificationCoordinatorStatusScreen,
} from '../src/features/profile';
import {
  normalizeSkills,
  validateCharityInterests,
  validateEmergencyContact,
} from '../src/shared/utils/profileValidation';
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

function renderWithTheme(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>{ui}</ThemeProvider>
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

describe('Profile Validation & Normalization Rules', () => {
  it('validates emergency contact pairing: both provided or both empty', () => {
    // Both empty -> valid
    expect(validateEmergencyContact('', '').isValid).toBe(true);
    expect(validateEmergencyContact('   ', '   ').isValid).toBe(true);

    // Both provided -> valid
    expect(
      validateEmergencyContact('Taylor Morgan', '+959123456789').isValid,
    ).toBe(true);

    // Only name provided -> invalid
    const onlyName = validateEmergencyContact('Taylor Morgan', '');
    expect(onlyName.isValid).toBe(false);
    expect(onlyName.errorMessage).toContain(
      'Emergency contact name and phone must both be provided or both empty.',
    );

    // Only phone provided -> invalid
    const onlyPhone = validateEmergencyContact('', '+959123456789');
    expect(onlyPhone.isValid).toBe(false);
    expect(onlyPhone.errorMessage).toContain(
      'Emergency contact name and phone must both be provided or both empty.',
    );
  });

  it('normalizes skills: trims, lowercases, deduplicates, and sorts alphabetically', () => {
    const rawSkills = [
      '  Teaching  ',
      'FIRST_AID',
      'teaching',
      '',
      '   ',
      'Logistics',
      'first_aid',
      'Cooking',
    ];

    const normalized = normalizeSkills(rawSkills);
    expect(normalized).toEqual([
      'cooking',
      'first_aid',
      'logistics',
      'teaching',
    ]);
  });

  it('validates charity interests codes against allowed vocabulary', () => {
    const validCodes = ['teaching', 'environment', 'cleaning'];
    const invalidCodes = ['teaching', 'space_travel', 'invalid_sector'];

    const validResult = validateCharityInterests(validCodes);
    expect(validResult.invalidCodes).toHaveLength(0);
    expect(validResult.validCodes).toHaveLength(3);

    const invalidResult = validateCharityInterests(invalidCodes);
    expect(invalidResult.invalidCodes).toContain('space_travel');
    expect(invalidResult.invalidCodes).toContain('invalid_sector');
  });
});

describe('MockProfileRepository Contract & Verification Operations', () => {
  let repo: MockProfileRepository;

  beforeEach(() => {
    repo = new MockProfileRepository();
  });

  it('returns clean deep-cloned profile with allow-listed fields', async () => {
    const profile = await repo.getProfile();
    expect(profile.displayName).toBe('Alex Morgan');
    expect(profile.email).toBe('alex.morgan@volunteer.local');
    expect(profile.accountStatus).toBe('active');
    expect(profile.verificationStatus).toBe('verified');
  });

  it('updates allowed profile fields in mock state', async () => {
    const updateResult = await repo.updateProfile({
      displayName: 'Alex M. Updated',
      homeArea: 'Bahan Township',
      emergencyContactName: 'Jordan Morgan',
      emergencyContactPhone: '+959987654321',
      skills: ['FIRST_AID', '  Teaching  '],
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.message).toContain(
      'Demo only — not submitted to server',
    );
    expect(updateResult.data?.displayName).toBe('Alex M. Updated');
    expect(updateResult.data?.homeArea).toBe('Bahan Township');
    expect(updateResult.data?.skills).toEqual(['first_aid', 'teaching']);
  });

  it('rejects profile update with mismatched emergency contact pair', async () => {
    const updateResult = await repo.updateProfile({
      emergencyContactName: 'New Contact Without Phone',
      emergencyContactPhone: '',
    });

    expect(updateResult.success).toBe(false);
    expect(updateResult.message).toContain('both be provided or both empty');
  });

  it('evaluates coordinator eligibility correctly based on checks', async () => {
    const eligibility = await repo.getCoordinatorEligibility();
    expect(eligibility.isVerified).toBe(true);
    expect(eligibility.completedAttendanceEventsCount).toBe(9);
    expect(eligibility.meetsCompletedEventsRequirement).toBe(true);
    expect(eligibility.meetsGoodRatingRequirement).toBeNull();
  });

  it('saves and deletes weekly availability rules in mock state', async () => {
    const addResult = await repo.saveWeeklyRule({
      weekday: 1,
      weekdayName: 'Monday',
      startTime: '10:00',
      endTime: '15:00',
    });

    expect(addResult.success).toBe(true);
    expect(addResult.message).toContain('Demo only — not submitted to server');
    expect(addResult.data?.id).toBeDefined();

    const currentAvailability = await repo.getAvailability();
    expect(
      currentAvailability.weeklyRules.some(r => r.weekdayName === 'Monday'),
    ).toBe(true);

    const deleteResult = await repo.deleteWeeklyRule(addResult.data!.id);
    expect(deleteResult.success).toBe(true);

    const afterDelete = await repo.getAvailability();
    expect(
      afterDelete.weeklyRules.some(r => r.id === addResult.data!.id),
    ).toBe(false);
  });

  it('saves and deletes date exceptions in mock state', async () => {
    const addResult = await repo.saveException({
      date: '2026-12-25',
      isAvailable: false,
      note: 'Holiday blackout',
    });

    expect(addResult.success).toBe(true);
    expect(addResult.data?.id).toBeDefined();

    const deleteResult = await repo.deleteException(addResult.data!.id);
    expect(deleteResult.success).toBe(true);
  });

  it('submits coordinator application only when verified', async () => {
    const submitResult = await repo.submitCoordinatorApplication(
      'Experienced volunteer coordinator',
    );
    expect(submitResult.success).toBe(true);
    expect(submitResult.message).toContain(
      'Demo only — not submitted to server',
    );

    const statusData = await repo.getVerificationStatus();
    expect(statusData.coordinatorStatus).toBe('pending');
  });
});

describe('ProfileScreen (Summary-First)', () => {
  it('renders concise Profile Summary Card with avatar initials, display name, public fields, and aggregate rating', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
      );
    });

    const json = safeStringify(renderer.toJSON());

    // Avatar initials
    expect(json).toContain('AM');
    // Display name & public badges
    expect(json).toContain('Alex Morgan');
    expect(json).toContain('Active Volunteer');
    expect(json).toContain('Verified');

    // Aggregate rating
    expect(json).toContain('4.9');
    expect(json).toContain('26 reviews');

    // Selected summary fields
    expect(json).toContain('+959111111111');
    expect(json).toContain('Kamayut Township');
    expect(json).toContain('English');
    expect(json).toContain('Taylor Morgan (+959123456789)');

    // Chips
    expect(json).toContain('first_aid');
    expect(json).toContain('Environment');

    // Strict security check: do NOT render sensitive internal or auth attributes
    expect(json).not.toContain('phone_hash');
    expect(json).not.toContain('password_hash');
    expect(json).not.toContain('otp');
    expect(json).not.toContain('isAdmin');
    expect(json).not.toContain('isStaff');
  });

  it('navigates to ProfileEdit when edit icon button is pressed', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
      );
    });

    const editButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Edit Profile');

    expect(editButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      editButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('ProfileEdit');
  });

  it('renders "No ratings yet" when volunteer has no reviews', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();
    repo.setRatingSummary(null, 0);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('No ratings yet');
  });

  describe('Coordinator Eligibility Checks', () => {
    it('disables Apply and alerts when account is not verified', async () => {
      const nav = createMockNavigation();
      const repo = new MockProfileRepository();
      repo.setVerificationStatus('pending');
      repo.setMockMeetsGoodRating(true);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
        );
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('Identity verification required (Status: pending)');

      const applyButton = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Apply for Coordinator');

      expect(applyButton).toBeDefined();
      expect(applyButton!.props.accessibilityState?.disabled).toBe(true);
    });

    it('disables Apply when completed attendance events count is less than 5', async () => {
      const nav = createMockNavigation();
      const repo = new MockProfileRepository();
      repo.setMockCompletedEventsCount(3);
      repo.setMockMeetsGoodRating(true);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
        );
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('3/5 attendance-backed events completed');

      const applyButton = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Apply for Coordinator');

      expect(applyButton!.props.accessibilityState?.disabled).toBe(true);
    });

    it('disables Apply when rating requirement is not met (false)', async () => {
      const nav = createMockNavigation();
      const repo = new MockProfileRepository();
      repo.setMockMeetsGoodRating(false);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
        );
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('Volunteer rating requirement not met');

      const applyButton = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Apply for Coordinator');

      expect(applyButton!.props.accessibilityState?.disabled).toBe(true);
    });

    it('disables Apply and displays pending server confirmation when rating requirement is null', async () => {
      const nav = createMockNavigation();
      const repo = new MockProfileRepository();
      repo.setMockMeetsGoodRating(null); // Explicit missing specification gap

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
        );
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain(
        'Requirement pending server confirmation (no threshold configured)',
      );

      const applyButton = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Apply for Coordinator');

      expect(applyButton!.props.accessibilityState?.disabled).toBe(true);
    });

    it('enables Apply when all 3 checks are met and updates status to pending on submit', async () => {
      const nav = createMockNavigation();
      const repo = new MockProfileRepository();
      repo.setVerificationStatus('verified');
      repo.setMockCompletedEventsCount(9);
      repo.setMockMeetsGoodRating(true);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
        );
      });

      let json = safeStringify(renderer.toJSON());
      expect(json).toContain('Account verified (Tier 1 identity confirmed)');
      expect(json).toContain('9/5 attendance-backed events completed');
      expect(json).toContain('Good rating requirement met');

      const applyButton = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Apply for Coordinator');

      expect(applyButton!.props.accessibilityState?.disabled).toBe(false);

      await ReactTestRenderer.act(async () => {
        await applyButton!.props.onPress();
      });

      json = safeStringify(renderer.toJSON());
      expect(json).toContain('Coordinator application submitted');
      expect(json).toContain('Application Pending');
      expect(json).toContain(
        'Your coordinator application is under review. Our team will verify your qualifications.',
      );
    });

    it('renders status badge and description without Apply action when coordinator status is already non-none', async () => {
      const nav = createMockNavigation();
      const statuses: Array<'pending' | 'approved' | 'suspended' | 'revoked'> = [
        'pending',
        'approved',
        'suspended',
        'revoked',
      ];

      for (const status of statuses) {
        const repo = new MockProfileRepository();
        repo.setCoordinatorStatus(status);

        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
          renderer = ReactTestRenderer.create(
            renderWithTheme(<ProfileScreen navigation={nav} repository={repo} />),
          );
        });

        const json = safeStringify(renderer.toJSON());
        if (status === 'pending') {
          expect(json).toContain('Application Pending');
        } else if (status === 'approved') {
          expect(json).toContain('Active Coordinator');
        } else if (status === 'suspended') {
          expect(json).toContain('Coordinator Suspended');
        } else if (status === 'revoked') {
          expect(json).toContain('Coordinator Revoked');
        }

        // Apply button must NOT be present
        const applyButton = renderer.root
          .findAllByProps({ accessibilityRole: 'button' })
          .find(b => b.props.accessibilityLabel === 'Apply for Coordinator');

        expect(applyButton).toBeUndefined();
      }
    });
  });
});

describe('ProfileEditScreen', () => {
  it('renders editable form with allow-listed fields', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <ProfileEditScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Edit Profile');
    expect(json).toContain('Alex Morgan');
    expect(json).toContain('Kamayut Township');
    expect(json).toContain('Emergency Contact');
    expect(json).toContain('Taylor Morgan');
    expect(json).toContain('Skills & Competencies');
    expect(json).toContain('Charity Interests');
    expect(json).toContain('Community Contribution');
  });

  it('shows validation error when only emergency contact name is entered without phone', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <ProfileEditScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Clear the phone number while keeping name
    const phoneInput = renderer.root.findByProps({
      placeholder: 'e.g. +959123456789',
    });

    await ReactTestRenderer.act(async () => {
      phoneInput.props.onChangeText('');
    });

    // Tap Save Changes
    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Save Profile Changes');

    expect(saveButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await saveButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain(
      'Emergency contact name and phone must both be provided or both empty.',
    );
  });

  it('saves valid profile changes in local mock state and displays demo confirmation', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <ProfileEditScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const nameInput = renderer.root.findByProps({
      placeholder: 'Your public volunteer name',
    });

    await ReactTestRenderer.act(async () => {
      nameInput.props.onChangeText('Alex Morgan Updated');
    });

    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Save Profile Changes');

    await ReactTestRenderer.act(async () => {
      await saveButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Profile saved in local mock state');
    expect(nav.navigate).toHaveBeenCalledWith('Profile');
  });

  it('prevents contradictory choices from being selected simultaneously in suitability preferences', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <ProfileEditScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Find Good Eyesight and Needs Glasses chips
    const checkboxes = renderer.root.findAllByProps({
      accessibilityRole: 'checkbox',
    });
    const goodEyesightChip = checkboxes.find(
      b => b.props.accessibilityLabel === 'Good Eyesight',
    );
    const needsGlassesChip = checkboxes.find(
      b => b.props.accessibilityLabel === 'Needs Glasses',
    );
    const leaderChip = checkboxes.find(
      b => b.props.accessibilityLabel === 'Team Leader Experience',
    );
    const newVolunteerChip = checkboxes.find(
      b => b.props.accessibilityLabel === 'New to Volunteering',
    );

    expect(goodEyesightChip).toBeDefined();
    expect(needsGlassesChip).toBeDefined();
    expect(leaderChip).toBeDefined();
    expect(newVolunteerChip).toBeDefined();

    // Selecting Needs Glasses turns off Good Eyesight
    await ReactTestRenderer.act(async () => {
      needsGlassesChip!.props.onPress();
    });

    expect(needsGlassesChip!.props.accessibilityState.checked).toBe(true);
    expect(goodEyesightChip!.props.accessibilityState.checked).toBe(false);

    // Selecting Good Eyesight turns off Needs Glasses
    await ReactTestRenderer.act(async () => {
      goodEyesightChip!.props.onPress();
    });

    expect(goodEyesightChip!.props.accessibilityState.checked).toBe(true);
    expect(needsGlassesChip!.props.accessibilityState.checked).toBe(false);

    // Selecting Leader Experience turns off New to Volunteering
    await ReactTestRenderer.act(async () => {
      leaderChip!.props.onPress();
    });

    expect(leaderChip!.props.accessibilityState.checked).toBe(true);
    expect(newVolunteerChip!.props.accessibilityState.checked).toBe(false);

    // Selecting New to Volunteering turns off Leader Experience
    await ReactTestRenderer.act(async () => {
      newVolunteerChip!.props.onPress();
    });

    expect(newVolunteerChip!.props.accessibilityState.checked).toBe(true);
    expect(leaderChip!.props.accessibilityState.checked).toBe(false);
  });
});

describe('AvailabilityScreen', () => {
  it('renders weekly recurring rules and date exceptions without verbose conflict notices', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Weekly Recurring Rules');
    expect(json).toContain('Saturday');
    expect(json).toContain('08:00');
    expect(json).toContain('13:00');
    expect(json).toContain('Date Exceptions & Blackouts');
    expect(json).toContain('2026-11-21');

    // Long unnecessary explanation blocks must be removed
    expect(json).not.toContain('Schedule Conflict Evaluation');
    expect(json).not.toContain(
      'Authoritative schedule conflict verification is computed exclusively by SQL database constraints',
    );
  });

  it('validates time inputs close to controls in weekly rule modal', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const addRuleButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === '+ Add Rule');

    await ReactTestRenderer.act(async () => {
      addRuleButton!.props.onPress();
    });

    // Enter end time before start time
    const startInput = renderer.root.findByProps({
      placeholder: '08:00',
    });
    const endInput = renderer.root.findByProps({
      placeholder: '13:00',
    });

    await ReactTestRenderer.act(async () => {
      startInput.props.onChangeText('14:00');
      endInput.props.onChangeText('10:00');
    });

    const confirmAddButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Add Rule (Demo)');

    await ReactTestRenderer.act(async () => {
      await confirmAddButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('End time must be after start time (HH:mm).');
  });

  it('opens weekly rule modal and saves valid rule in mock state', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const addRuleButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === '+ Add Rule');

    expect(addRuleButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      addRuleButton!.props.onPress();
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Add Weekly Availability Rule');

    const confirmAddButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Add Rule (Demo)');

    expect(confirmAddButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await confirmAddButton!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Weekly schedule rule saved');
  });

  it('allows multi-weekday selection and AM/PM selection in weekly rule modal', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const addRuleButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === '+ Add Rule');

    await ReactTestRenderer.act(async () => {
      addRuleButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('DAYS OF WEEK (SELECT ONE OR MORE)');
    expect(json).toContain('AM');
    expect(json).toContain('PM');
  });

  it('validates date input close to control in date exception modal', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const addExceptionButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === '+ Add Exception');

    await ReactTestRenderer.act(async () => {
      addExceptionButton!.props.onPress();
    });

    const confirmExceptionButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Save Exception (Demo)');

    await ReactTestRenderer.act(async () => {
      await confirmExceptionButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Date is required (YYYY-MM-DD).');
  });

  it('opens date exception modal and saves valid exception in mock state', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const addExceptionButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === '+ Add Exception');

    await ReactTestRenderer.act(async () => {
      addExceptionButton!.props.onPress();
    });

    const dateInput = renderer.root.findByProps({
      placeholder: 'e.g. 2026-11-25',
    });

    await ReactTestRenderer.act(async () => {
      dateInput.props.onChangeText('2026-12-05');
    });

    const confirmExceptionButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Save Exception (Demo)');

    await ReactTestRenderer.act(async () => {
      await confirmExceptionButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Date exception saved');
  });

  it('renders empty states when weekly rules and exceptions are empty', async () => {
    const nav = createMockNavigation();
    const emptyRepo = new MockProfileRepository(mockVolunteerProfile, {
      weeklyRules: [],
      exceptions: [],
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <AvailabilityScreen navigation={nav} repository={emptyRepo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('No Weekly Rules');
    expect(json).toContain('No Date Exceptions');
  });
});

describe('VerificationCoordinatorStatusScreen', () => {
  it('renders verification status, visual upload placeholders, and coordinator status', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <VerificationCoordinatorStatusScreen
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Tier 1 Identity Verification');
    expect(json).toContain('VERIFIED');
    expect(json).toContain('Photo Verification (Selfie)');
    expect(json).toContain('National Identity Document');
    expect(json).toContain(
      'Hardware camera and file uploads are disabled in this UI preview',
    );
    expect(json).toContain('Coordinator Authority & Application');
    expect(json).toContain('Applying for Coordinator authority requires');
    expect(json).toContain('Tier 1 Verified');
  });

  it('submits coordinator application in mock state and updates status', async () => {
    const nav = createMockNavigation();
    const repo = new MockProfileRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <VerificationCoordinatorStatusScreen
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    const noteInput = renderer.root.findByProps({
      placeholder:
        'e.g. Experienced community organizer with river cleanup background...',
    });

    await ReactTestRenderer.act(async () => {
      noteInput.props.onChangeText('Dedicated community lead for 3 years');
    });

    const submitButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(
        b =>
          b.props.accessibilityLabel === 'Submit Coordinator Application',
      );

    expect(submitButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await submitButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator application submitted');
  });
});
