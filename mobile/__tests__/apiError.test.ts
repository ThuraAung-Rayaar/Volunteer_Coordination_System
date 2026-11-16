/**
 * @format
 */

import {
  createNetworkError,
  createTimeoutError,
  normalizeApiError,
} from '../src/core/api/apiError';

describe('normalizeApiError', () => {
  describe('Shape 1: Standard Domain Error Envelope', () => {
    it('normalizes standard domain error {"error": {"code": "...", "message": "..."}}', () => {
      const body = {
        error: {
          code: 'capacity_full',
          message: 'No places remaining for this role or event.',
        },
      };

      const error = normalizeApiError(400, body);
      expect(error.kind).toBe('validation');
      if (error.kind === 'validation') {
        expect(error.code).toBe('capacity_full');
        expect(error.message).toBe('No places remaining for this role or event.');
      }
    });

    it('extracts detail when message is missing in domain envelope', () => {
      const body = {
        error: {
          code: 'already_applied',
          detail: 'You have already applied for this event.',
        },
      };

      const error = normalizeApiError(409, body);
      expect(error.kind).toBe('conflict');
      if (error.kind === 'conflict') {
        expect(error.code).toBe('already_applied');
        expect(error.message).toBe('You have already applied for this event.');
      }
    });
  });

  describe('Shape 2: Geo Check-In Rejection Envelope', () => {
    it('normalizes geo check-in rejection with distance_m in meta', () => {
      const body = {
        success: false,
        result: 'outside_geofence',
        distance_m: 142.8,
        message: 'Outside allowable check-in radius',
      };

      const error = normalizeApiError(400, body);
      expect(error.kind).toBe('validation');
      if (error.kind === 'validation') {
        expect(error.code).toBe('outside_geofence');
        expect(error.message).toBe('Outside allowable check-in radius');
        expect(error.meta).toEqual({
          distance_m: 142.8,
          success: false,
        });
      }
    });

    it('generates descriptive fallback message when geo rejection has no explicit message', () => {
      const body = {
        success: false,
        result: 'outside_geofence',
        distance_m: 250,
      };

      const error = normalizeApiError(400, body);
      expect(error.kind).toBe('validation');
      if (error.kind === 'validation') {
        expect(error.code).toBe('outside_geofence');
        expect(error.message).toContain('250m away');
        expect(error.meta?.distance_m).toBe(250);
      }
    });
  });

  describe('Shape 3: DRF Serializer Field Validation Errors', () => {
    it('maps field array errors into fields map and extracts top message', () => {
      const body = {
        display_name: ['This field may not be blank.'],
        phone: ['Enter a valid phone number.'],
      };

      const error = normalizeApiError(400, body);
      expect(error.kind).toBe('validation');
      if (error.kind === 'validation') {
        expect(error.code).toBe('validation_error');
        expect(error.fields).toEqual({
          display_name: ['This field may not be blank.'],
          phone: ['Enter a valid phone number.'],
        });
        expect(error.message).toContain('display_name: This field may not be blank.');
      }
    });

    it('handles single string field values', () => {
      const body = {
        email: 'Invalid email address',
      };

      const error = normalizeApiError(400, body);
      expect(error.kind).toBe('validation');
      if (error.kind === 'validation') {
        expect(error.fields).toEqual({
          email: ['Invalid email address'],
        });
      }
    });
  });

  describe('HTTP Status Code Mapping', () => {
    it('maps 401 to unauthorized AppError', () => {
      const error = normalizeApiError(401, { detail: 'Invalid token' });
      expect(error.kind).toBe('unauthorized');
      if (error.kind === 'unauthorized') {
        expect(error.message).toBe('Invalid token');
      }
    });

    it('maps 403 to forbidden AppError', () => {
      const error = normalizeApiError(403, { detail: 'Only approved coordinators may access.' });
      expect(error.kind).toBe('forbidden');
      if (error.kind === 'forbidden') {
        expect(error.message).toBe('Only approved coordinators may access.');
      }
    });

    it('maps 404 to notFound AppError', () => {
      const error = normalizeApiError(404, { detail: 'Event does not exist.' });
      expect(error.kind).toBe('notFound');
      if (error.kind === 'notFound') {
        expect(error.message).toBe('Event does not exist.');
      }
    });

    it('maps 409 to conflict AppError', () => {
      const error = normalizeApiError(409, { detail: 'Application already reviewed.' });
      expect(error.kind).toBe('conflict');
      if (error.kind === 'conflict') {
        expect(error.message).toBe('Application already reviewed.');
      }
    });

    it('maps 429 to rateLimited AppError', () => {
      const error = normalizeApiError(429, { detail: 'Request was throttled. Expected available in 45 seconds.' });
      expect(error.kind).toBe('rateLimited');
      if (error.kind === 'rateLimited') {
        expect(error.message).toContain('throttled');
      }
    });

    it('maps 500, 502, 503 to server AppError', () => {
      const err500 = normalizeApiError(500, { detail: 'Internal server error' });
      expect(err500.kind).toBe('server');

      const err503 = normalizeApiError(503, 'Service unavailable');
      expect(err503.kind).toBe('server');
    });

    it('handles string or plain text error bodies', () => {
      const error = normalizeApiError(502, 'Bad Gateway');
      expect(error.kind).toBe('server');
      if (error.kind === 'server') {
        expect(error.message).toBe('Bad Gateway');
      }
    });

    it('handles empty or null error bodies with safe fallbacks', () => {
      const error = normalizeApiError(401, null);
      expect(error.kind).toBe('unauthorized');
      expect(error.message).toBe('Authentication required or session expired.');
    });
  });

  describe('Client Network and Timeout Error Helpers', () => {
    it('creates network error with retryable=true', () => {
      const err = createNetworkError('Connection dropped');
      expect(err.kind).toBe('network');
      expect(err.retryable).toBe(true);
      expect(err.message).toBe('Connection dropped');
    });

    it('creates timeout error with retryable=true', () => {
      const err = createTimeoutError('Request took longer than 15000ms');
      expect(err.kind).toBe('timeout');
      expect(err.retryable).toBe(true);
      expect(err.message).toBe('Request took longer than 15000ms');
    });
  });
});
