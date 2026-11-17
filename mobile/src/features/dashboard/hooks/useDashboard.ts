/**
 * @format
 */

import { useCallback, useEffect, useState } from 'react';
import { IDashboardRepository } from '../../../data/contracts';
import { defaultDashboardRepository } from '../../../data/mock/MockDashboardRepository';
import { DashboardSummary } from '../../../domain/models';
import { useRepositories } from '../../../app/RepositoryProvider';

export interface UseDashboardResult {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  cancelParticipation: (
    commitmentId: string,
  ) => Promise<{ success: boolean; message: string }>;
}

export function useDashboard(
  repository?: IDashboardRepository,
  userId?: string,
): UseDashboardResult {
  const repositories = useRepositories();
  const repo = repository ?? repositories.dashboardRepository ?? defaultDashboardRepository;

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await repo.getDashboardSummary(userId);
      setSummary(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to load dashboard data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo, userId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const cancelParticipation = useCallback(
    async (commitmentId: string) => {
      if (repo.cancelUpcomingParticipation) {
        const result = await repo.cancelUpcomingParticipation(
          commitmentId,
        );
        if (result.success && result.data) {
          setSummary(result.data);
        }
        return { success: result.success, message: result.message };
      }
      return {
        success: true,
        message: 'Participation cancelled in local mock state (Demo only)',
      };
    },
    [repo],
  );

  return {
    summary,
    loading,
    error,
    refresh: fetchDashboard,
    cancelParticipation,
  };
}
