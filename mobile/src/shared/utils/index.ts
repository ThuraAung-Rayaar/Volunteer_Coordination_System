/**
 * @format
 */

export * from './profileValidation';
export * from './dateTimeUtils';

/**
 * Basic formatting utility placeholder for shared presentation logic.
 */
export function formatDisplayDate(dateIsoString: string): string {
  try {
    const date = new Date(dateIsoString);
    if (isNaN(date.getTime())) {
      return dateIsoString;
    }
    return date.toLocaleDateString();
  } catch {
    return dateIsoString;
  }
}
