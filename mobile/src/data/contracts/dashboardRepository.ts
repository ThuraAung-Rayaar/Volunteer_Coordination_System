/**
 * @format
 */

import { DashboardSummary } from '../../domain/models';

export interface IDashboardRepository {
  getDashboardSummary(userId?: string): Promise<DashboardSummary>;
  cancelUpcomingParticipation?(
    commitmentId: string,
  ): Promise<{ success: boolean; message: string; data?: DashboardSummary }>;
  removeCommitmentsForEvent?(eventId: string): void;
}
