/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { DashboardSummary } from '../../domain/models/dashboard';
import type { IDashboardRepository } from '../contracts/dashboardRepository';
import { eventApi } from '../endpoints/eventApi';
import { profileApi } from '../endpoints/profileApi';
import { mapDashboardSummary } from '../mappers/dashboardMapper';
import type { VolunteerAssignmentDto } from '../dto/eventDto';
import type { AttendanceHistoryItemDto } from '../dto/profileDto';

export class HttpDashboardRepository implements IDashboardRepository {
  private client: ApiClient;

  constructor(client: ApiClient = defaultApiClient) {
    this.client = client;
  }

  public async getDashboardSummary(_userId?: string): Promise<DashboardSummary> {
    const [assignmentsRes, attendanceRes, feedbackRes] = await Promise.all([
      eventApi.getMyAssignments(undefined, this.client),
      profileApi.getAttendanceHistory(this.client),
      profileApi.getFeedbackSummary(this.client),
    ]);

    if (!assignmentsRes.ok) {
      throw new Error(
        `Failed to load user assignments: ${assignmentsRes.error.message}`,
      );
    }

    if (!attendanceRes.ok) {
      throw new Error(
        `Failed to load attendance history: ${attendanceRes.error.message}`,
      );
    }

    const assignments: VolunteerAssignmentDto[] = Array.isArray(assignmentsRes.data)
      ? assignmentsRes.data
      : 'results' in assignmentsRes.data
      ? assignmentsRes.data.results
      : [];

    const attendance: AttendanceHistoryItemDto[] = Array.isArray(attendanceRes.data)
      ? attendanceRes.data
      : 'results' in attendanceRes.data
      ? attendanceRes.data.results
      : [];

    const feedback = feedbackRes.ok ? feedbackRes.data : null;

    return mapDashboardSummary(assignments, attendance, feedback);
  }

  public async cancelUpcomingParticipation(
    commitmentId: string,
  ): Promise<{ success: boolean; message: string; data?: DashboardSummary }> {
    const cancelRes = await eventApi.cancelAssignment(
      commitmentId,
      'Cancelled by volunteer',
      this.client,
    );

    if (!cancelRes.ok) {
      return {
        success: false,
        message: cancelRes.error.message,
      };
    }

    const updatedSummary = await this.getDashboardSummary();
    return {
      success: true,
      message: 'Participation cancelled successfully',
      data: updatedSummary,
    };
  }
}

export const defaultHttpDashboardRepository = new HttpDashboardRepository();
