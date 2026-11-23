/**
 * @format
 */

export const MYANMAR_TIMEZONE_OFFSET = '+06:30';
export const MYANMAR_TIMEZONE_LABEL = 'Asia/Yangon · UTC+06:30';
export const MYANMAR_TIMEZONE_NAME = 'Asia/Yangon';

/**
 * Validates date string in strict YYYY-MM-DD format.
 */
export function isValidDateFormat(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  // Verify real calendar day (e.g. leap years, 30 vs 31 days)
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

/**
 * Validates 24-hour time string in HH:mm format (00:00 to 23:59).
 */
export function isValid24HourTimeFormat(timeStr: string): boolean {
  if (!timeStr || typeof timeStr !== 'string') {
    return false;
  }
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr.trim());
}

/**
 * Parses 24-hour time (HH:mm) into 12-hour time (hh:mm) and AM/PM period.
 */
export function parse24hTo12h(time24: string): { time12: string; period: 'AM' | 'PM' } {
  if (!time24 || !time24.includes(':')) {
    return { time12: time24 || '', period: 'AM' };
  }
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) {
    return { time12: time24, period: 'AM' };
  }
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const m = mStr !== undefined ? mStr.slice(0, 2) : '00';
  return {
    time12: `${String(h).padStart(2, '0')}:${m}`,
    period,
  };
}

/**
 * Converts 12-hour time (hh:mm) with AM/PM period into 24-hour format (HH:mm).
 */
export function convert12hTo24h(time12: string, period: 'AM' | 'PM'): string {
  if (!time12) return '';
  const trimmed = time12.trim();
  const parts = trimmed.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return trimmed;
  let m = parts[1] !== undefined ? parts[1].slice(0, 2) : '00';
  if (m.length === 1) m = `0${m}`;

  if (period === 'PM') {
    if (h < 12) h += 12;
  } else if (period === 'AM') {
    if (h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${m}`;
}

/**
 * Combines date (YYYY-MM-DD) and 24h time (HH:mm) into a strict Myanmar (UTC+06:30) offset ISO timestamp.
 *
 * CRITICAL TIMEZONE REQUIREMENT:
 * This method directly constructs the offset timestamp without creating a device-local Date
 * or calling Date.prototype.toISOString(), guaranteeing that device timezone settings
 * (e.g. UTC, US/Eastern, Asia/Tokyo) cannot mutate or skew the intended Myanmar local time.
 *
 * Example:
 * combineDateTimeToMyanmarISO('2026-12-01', '09:30') => '2026-12-01T09:30:00+06:30'
 */
export function combineDateTimeToMyanmarISO(
  dateStr: string,
  timeStr: string,
  seconds: string = '00',
): string {
  const cleanDate = (dateStr ?? '').trim();
  const cleanTime = (timeStr ?? '').trim();

  if (!isValidDateFormat(cleanDate)) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }

  if (!isValid24HourTimeFormat(cleanTime)) {
    throw new Error(
      `Invalid 24-hour time format "${timeStr}". Expected HH:mm in Myanmar Time (MMT).`,
    );
  }

  const paddedSeconds = (seconds ?? '00').padStart(2, '0').slice(0, 2);
  return `${cleanDate}T${cleanTime}:${paddedSeconds}${MYANMAR_TIMEZONE_OFFSET}`;
}

export interface MyanmarDateTimeParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  offset: string; // +06:30
}

/**
 * Parses an ISO timestamp into Myanmar local date and time parts.
 * Uses UTC arithmetic so the device local timezone does not influence the result.
 */
export function parseMyanmarISO(isoString: string): MyanmarDateTimeParts {
  if (!isoString || typeof isoString !== 'string') {
    throw new Error('ISO string is required');
  }

  const trimmed = isoString.trim();

  // If already tagged with +06:30 offset
  const myanmarMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?\+06:30$/,
  );
  if (myanmarMatch) {
    return {
      date: myanmarMatch[1],
      time: myanmarMatch[2],
      offset: MYANMAR_TIMEZONE_OFFSET,
    };
  }

  // For UTC (Z) or other offsets, parse epoch and shift by +06:30 (390 minutes)
  const epochMs = Date.parse(trimmed);
  if (isNaN(epochMs)) {
    throw new Error(`Invalid ISO timestamp: "${isoString}"`);
  }

  const myanmarOffsetMs = (6 * 60 + 30) * 60 * 1000;
  const myanmarUtcInstant = new Date(epochMs + myanmarOffsetMs);

  const y = myanmarUtcInstant.getUTCFullYear();
  const m = String(myanmarUtcInstant.getUTCMonth() + 1).padStart(2, '0');
  const d = String(myanmarUtcInstant.getUTCDate()).padStart(2, '0');
  const hh = String(myanmarUtcInstant.getUTCHours()).padStart(2, '0');
  const mm = String(myanmarUtcInstant.getUTCMinutes()).padStart(2, '0');

  return {
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
    offset: MYANMAR_TIMEZONE_OFFSET,
  };
}

/**
 * Compares two ISO timestamps in UTC milliseconds.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareMyanmarDateTimes(isoA: string, isoB: string): number {
  const msA = Date.parse(isoA);
  const msB = Date.parse(isoB);

  if (isNaN(msA) || isNaN(msB)) {
    throw new Error('Cannot compare invalid timestamps');
  }

  return msA - msB;
}

export interface ScheduleValidationInput {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  deadlineDate?: string;
  deadlineTime?: string;
}

export interface ScheduleValidationResult {
  isValid: boolean;
  errorMessage?: string;
  startAtIso?: string;
  endAtIso?: string;
  applicationDeadlineIso?: string;
}

/**
 * Validates event schedule:
 * 1. Start and end are required, formatted properly.
 * 2. End datetime must be strictly later than start datetime.
 * 3. Application deadline (if provided) must be on or before start datetime (deadline <= start).
 */
export function validateEventSchedule(
  input: ScheduleValidationInput,
): ScheduleValidationResult {
  const {
    startDate,
    startTime,
    endDate,
    endTime,
    deadlineDate,
    deadlineTime,
  } = input;

  if (!isValidDateFormat(startDate)) {
    return {
      isValid: false,
      errorMessage: 'Start date is required and must be in YYYY-MM-DD format.',
    };
  }

  if (!isValid24HourTimeFormat(startTime)) {
    return {
      isValid: false,
      errorMessage:
        'Start time is required and must be in 24-hour HH:mm format (Myanmar Time).',
    };
  }

  if (!isValidDateFormat(endDate)) {
    return {
      isValid: false,
      errorMessage: 'End date is required and must be in YYYY-MM-DD format.',
    };
  }

  if (!isValid24HourTimeFormat(endTime)) {
    return {
      isValid: false,
      errorMessage:
        'End time is required and must be in 24-hour HH:mm format (Myanmar Time).',
    };
  }

  const startAtIso = combineDateTimeToMyanmarISO(startDate, startTime);
  const endAtIso = combineDateTimeToMyanmarISO(endDate, endTime);

  if (compareMyanmarDateTimes(endAtIso, startAtIso) <= 0) {
    return {
      isValid: false,
      errorMessage: 'Event end time must be later than start time.',
    };
  }

  let applicationDeadlineIso: string | undefined;

  const hasDeadlineDate = Boolean(deadlineDate?.trim());
  const hasDeadlineTime = Boolean(deadlineTime?.trim());

  if (hasDeadlineDate !== hasDeadlineTime) {
    return {
      isValid: false,
      errorMessage:
        'Please provide both deadline date and time, or leave both empty.',
    };
  }

  if (hasDeadlineDate && hasDeadlineTime) {
    if (!isValidDateFormat(deadlineDate!)) {
      return {
        isValid: false,
        errorMessage:
          'Application deadline date must be in YYYY-MM-DD format.',
      };
    }

    if (!isValid24HourTimeFormat(deadlineTime!)) {
      return {
        isValid: false,
        errorMessage:
          'Application deadline time must be in 24-hour HH:mm format (Myanmar Time).',
      };
    }

    applicationDeadlineIso = combineDateTimeToMyanmarISO(
      deadlineDate!,
      deadlineTime!,
    );

    // Business rule: deadline must be on or before start time (deadline <= start)
    if (compareMyanmarDateTimes(applicationDeadlineIso, startAtIso) > 0) {
      return {
        isValid: false,
        errorMessage:
          'Application deadline must be on or before the event start time.',
      };
    }
  }

  return {
    isValid: true,
    startAtIso,
    endAtIso,
    applicationDeadlineIso,
  };
}
