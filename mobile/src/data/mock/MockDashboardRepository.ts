/**
 * @format
 */

import { DashboardSummary } from '../../domain/models';
import { IDashboardRepository } from '../contracts';
import {
  emptyDashboardSummary,
} from './fixtures/dashboardFixture';
import { createDashboardSummaryFixture, deepClone } from './mockUtils';

export class MockDashboardRepository implements IDashboardRepository {
  private summary: DashboardSummary;
  private shouldFail: boolean;

  constructor(
    initialSummary: DashboardSummary = createDashboardSummaryFixture(),
    shouldFail: boolean = false,
  ) {
    this.summary = deepClone(initialSummary);
    this.shouldFail = shouldFail;
  }

  reset(
    summary: DashboardSummary = createDashboardSummaryFixture(),
    shouldFail: boolean = false,
  ): void {
    this.summary = deepClone(summary);
    this.shouldFail = shouldFail;
  }

  seed(data: { summary?: DashboardSummary; shouldFail?: boolean }): void {
    this.reset(data.summary, data.shouldFail);
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setSummary(summary: DashboardSummary): void {
    this.summary = deepClone(summary);
  }

  async getDashboardSummary(userId?: string): Promise<DashboardSummary> {
    if (this.shouldFail) {
      throw new Error('Failed to load dashboard summary from mock repository');
    }

    if (userId === 'usr-empty') {
      return deepClone(emptyDashboardSummary);
    }

    // Strictly filter completed participation to attendanceStatus === 'completed'
    const verifiedActivities = this.summary.recentCompletedActivities.filter(
      act => act.attendanceStatus === 'completed',
    );

    return deepClone({
      ...this.summary,
      recentCompletedActivities: verifiedActivities,
    });
  }

  async cancelUpcomingParticipation(
    commitmentId: string,
  ): Promise<{ success: boolean; message: string; data?: DashboardSummary }> {
    if (this.shouldFail) {
      throw new Error('Failed to cancel participation in mock repository');
    }

    // Per business rules: completed participation cannot be cancelled
    const isCompleted = this.summary.recentCompletedActivities.some(
      act => act.id === commitmentId,
    );
    if (isCompleted) {
      return {
        success: false,
        message: 'Completed participation cannot be cancelled.',
      };
    }

    const commitment = this.summary.upcomingCommitments.find(
      c => c.id === commitmentId,
    );
    if (!commitment) {
      return {
        success: false,
        message: 'Upcoming commitment not found',
      };
    }

    const updatedCommitments = this.summary.upcomingCommitments.filter(
      c => c.id !== commitmentId,
    );

    this.summary = {
      ...this.summary,
      upcomingCommitments: updatedCommitments,
      upcomingCommitmentCount: updatedCommitments.length,
    };

    return {
      success: true,
      message:
        'Participation cancelled in local mock state (Demo only — not submitted to server)',
      data: deepClone(this.summary),
    };
  }
}

export const defaultDashboardRepository = new MockDashboardRepository();
