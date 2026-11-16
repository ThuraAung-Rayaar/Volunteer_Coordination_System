/**
 * @format
 */

import React, { createContext, useContext, useMemo } from 'react';
import { DataMode, getDataMode } from './configuration/dataMode';
import type {
  CoordinatorRepository,
  EventRepository,
  IDashboardRepository,
  ProfileRepository,
} from '../data/contracts';
import {
  defaultCoordinatorRepository,
  defaultDashboardRepository,
  defaultEventRepository,
  defaultProfileRepository,
} from '../data/mock';
import {
  defaultHttpCoordinatorRepository,
  defaultHttpDashboardRepository,
  defaultHttpEventRepository,
  defaultHttpProfileRepository,
} from '../data/http';

export interface RepositoryContextType {
  dashboardRepository: IDashboardRepository;
  eventRepository: EventRepository;
  profileRepository: ProfileRepository;
  coordinatorRepository: CoordinatorRepository;
  dataMode: DataMode;
}

const fallbackContext: RepositoryContextType = {
  dashboardRepository: defaultDashboardRepository,
  eventRepository: defaultEventRepository,
  profileRepository: defaultProfileRepository,
  coordinatorRepository: defaultCoordinatorRepository,
  dataMode: 'mock',
};

const RepositoryContext = createContext<RepositoryContextType | null>(null);

export interface RepositoryProviderProps {
  children: React.ReactNode;
  dataMode?: DataMode;
  repositories?: Partial<RepositoryContextType>;
}

export function RepositoryProvider({
  children,
  dataMode: explicitDataMode,
  repositories: overrideRepositories,
}: RepositoryProviderProps): React.JSX.Element {
  const activeMode = explicitDataMode ?? getDataMode();

  const contextValue = useMemo<RepositoryContextType>(() => {
    const baseRepositories: Omit<RepositoryContextType, 'dataMode'> =
      activeMode === 'http'
        ? {
            dashboardRepository: defaultHttpDashboardRepository,
            eventRepository: defaultHttpEventRepository,
            profileRepository: defaultHttpProfileRepository,
            coordinatorRepository: defaultHttpCoordinatorRepository,
          }
        : {
            dashboardRepository: defaultDashboardRepository,
            eventRepository: defaultEventRepository,
            profileRepository: defaultProfileRepository,
            coordinatorRepository: defaultCoordinatorRepository,
          };

    return {
      dashboardRepository:
        overrideRepositories?.dashboardRepository ??
        baseRepositories.dashboardRepository,
      eventRepository:
        overrideRepositories?.eventRepository ??
        baseRepositories.eventRepository,
      profileRepository:
        overrideRepositories?.profileRepository ??
        baseRepositories.profileRepository,
      coordinatorRepository:
        overrideRepositories?.coordinatorRepository ??
        baseRepositories.coordinatorRepository,
      dataMode: overrideRepositories?.dataMode ?? activeMode,
    };
  }, [activeMode, overrideRepositories]);

  return (
    <RepositoryContext.Provider value={contextValue}>
      {children}
    </RepositoryContext.Provider>
  );
}

/**
 * Hook to access repositories and current data mode from the DI bridge.
 * If used outside a RepositoryProvider, falls back gracefully to the mock repositories
 * ensuring full backward compatibility with legacy screen unit tests.
 */
export function useRepositories(): RepositoryContextType {
  const context = useContext(RepositoryContext);
  return context ?? fallbackContext;
}
