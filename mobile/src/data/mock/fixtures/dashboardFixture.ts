/**
 * @format
 */

import { DashboardSummary } from '../../../domain/models';

/**
 * Realistic preview summary for an active volunteer.
 * Completed activities explicitly reflect attendance-backed participation records.
 */
export const volunteerDashboardSummary: DashboardSummary = {
  completedShiftCount: 14,
  completedEventCount: 9,
  upcomingCommitmentCount: 2,
  ratingAverage: 4.88,
  ratingCount: 26,
  upcomingCommitments: [
    {
      id: 'comm-preview-001',
      eventId: 'evt-preview-101',
      eventTitle: 'Community Garden Revitalization',
      roleName: 'Garden Tool Lead',
      startAt: '2026-11-15T09:00:00Z',
      endAt: '2026-11-15T13:00:00Z',
      location: 'Central Park East Kiosk',
      status: 'confirmed',
    },
    {
      id: 'comm-preview-002',
      eventId: 'evt-preview-102',
      eventTitle: 'Food Pantry Distribution & Packaging',
      roleName: 'Box Assembly Assistant',
      startAt: '2026-11-21T10:00:00Z',
      endAt: '2026-11-21T14:00:00Z',
      location: 'Downtown Community Warehouse',
      status: 'confirmed',
    },
  ],
  recentCompletedActivities: [
    {
      id: 'act-attendance-001',
      eventId: 'evt-past-201',
      eventTitle: 'Neighborhood Library Book Fair',
      roleName: 'Cashier & Staging Volunteer',
      completedAt: '2026-11-02T16:00:00Z',
      attendanceStatus: 'completed',
      verifiedHours: 4.0,
      location: 'Public Library Annex',
      attendanceVerifiedAt: '2026-11-02T16:15:00Z',
    },
    {
      id: 'act-attendance-002',
      eventId: 'evt-past-202',
      eventTitle: 'Riverside Trail Environmental Cleanup',
      roleName: 'Trail Cleanup Crew',
      completedAt: '2026-10-25T13:00:00Z',
      attendanceStatus: 'completed',
      verifiedHours: 3.5,
      location: 'North Riverside Trailhead',
      attendanceVerifiedAt: '2026-10-25T13:30:00Z',
    },
    {
      id: 'act-attendance-003',
      eventId: 'evt-past-203',
      eventTitle: 'Senior Center Digital Literacy Class',
      roleName: 'Smartphone Workshop Tutor',
      completedAt: '2026-10-14T15:00:00Z',
      attendanceStatus: 'completed',
      verifiedHours: 2.0,
      location: 'Oakridge Community Center',
      attendanceVerifiedAt: '2026-10-14T15:10:00Z',
    },
  ],
};

/**
 * Empty dashboard summary state for new volunteers with no ratings and no past shifts.
 */
export const emptyDashboardSummary: DashboardSummary = {
  completedShiftCount: 0,
  completedEventCount: 0,
  upcomingCommitmentCount: 0,
  ratingAverage: null,
  ratingCount: 0,
  upcomingCommitments: [],
  recentCompletedActivities: [],
};
