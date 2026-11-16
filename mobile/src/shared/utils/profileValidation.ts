/**
 * @format
 */

import { CHARITY_CATEGORIES, CharityCategoryCode } from '../../domain/models/event';

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates emergency contact name and phone pair.
 * Rule: Both must be provided or both must be empty.
 */
export function validateEmergencyContact(
  name: string,
  phone: string,
): ValidationResult {
  const trimmedName = (name ?? '').trim();
  const trimmedPhone = (phone ?? '').trim();

  const hasName = trimmedName.length > 0;
  const hasPhone = trimmedPhone.length > 0;

  if (hasName !== hasPhone) {
    return {
      isValid: false,
      errorMessage:
        'Emergency contact name and phone must both be provided or both empty.',
    };
  }

  return { isValid: true };
}

/**
 * Normalizes volunteer skills:
 * Trims whitespace, converts to lowercase, deduplicates, and sorts alphabetically.
 */
export function normalizeSkills(skills: string[]): string[] {
  if (!Array.isArray(skills)) {
    return [];
  }

  const cleaned = skills
    .map(skill => (skill ?? '').trim().toLowerCase())
    .filter(skill => skill.length > 0);

  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
}

/**
 * Validates charity interest codes against known active charity fields.
 */
export function validateCharityInterests(
  codes: string[],
): { validCodes: CharityCategoryCode[]; invalidCodes: string[] } {
  const activeCodes = new Set<string>(CHARITY_CATEGORIES.map(c => c.code));

  const validCodes: CharityCategoryCode[] = [];
  const invalidCodes: string[] = [];

  for (const raw of codes) {
    const code = raw.trim().toLowerCase();
    if (activeCodes.has(code)) {
      validCodes.push(code as CharityCategoryCode);
    } else {
      invalidCodes.push(raw);
    }
  }

  return {
    validCodes: Array.from(new Set(validCodes)),
    invalidCodes,
  };
}
