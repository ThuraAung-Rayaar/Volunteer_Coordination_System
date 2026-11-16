/**
 * @format
 */

export interface WeeklyAvailabilityRule {
  id: string;
  weekday: number; // 1 = Monday ... 7 = Sunday
  weekdayName: string;
  startTime: string; // HH:mm format, e.g. '08:00'
  endTime: string; // HH:mm format, e.g. '13:00'
  validFrom?: string; // YYYY-MM-DD
  validTo?: string; // YYYY-MM-DD
}

export interface AvailabilityException {
  id: string;
  date: string; // YYYY-MM-DD
  isAvailable: boolean; // false = blackout / full-day unavailable; true = partial slot
  startTime?: string;
  endTime?: string;
  note?: string;
}

export interface VolunteerAvailability {
  weeklyRules: WeeklyAvailabilityRule[];
  exceptions: AvailabilityException[];
}
