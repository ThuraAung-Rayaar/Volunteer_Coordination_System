/**
 * @format
 */

/**
 * Standard Django REST Framework paginated envelope.
 * Used by endpoints like `GET /api/v1/events/`.
 */
export interface PaginatedResponseDto<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Flat list envelope used across composite screen and sub-resource endpoints.
 */
export interface ResultsListDto<T> {
  results: T[];
}
