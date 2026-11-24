/**
 * @format
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  addDataModeListener,
  DataMode,
  getDataMode,
} from './configuration/dataMode';
import type {
  AssistantRepository,
  CoordinatorRepository,
  EventRepository,
  IDashboardRepository,
  ProfileRepository,
} from '../data/contracts';
import {
  defaultAssistantRepository,
  defaultCoordinatorRepository,
  defaultDashboardRepository,
  defaultEventRepository,
  defaultProfileRepository,
} from '../data/mock';
import {
  defaultHttpAssistantRepository,
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
  assistantRepository: AssistantRepository;
  dataMode: DataMode;
}

const fallbackContext: RepositoryContextType = {
  dashboardRepository: defaultDashboardRepository,
  eventRepository: defaultEventRepository,
  profileRepository: defaultProfileRepository,
  coordinatorRepository: defaultCoordinatorRepository,
  assistantRepository: defaultAssistantRepository,
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
  const [currentMode, setCurrentMode] = useState<DataMode>(
    () => explicitDataMode ?? getDataMode(),
  );

  useEffect(() => {
    if (explicitDataMode !== undefined) {
      setCurrentMode(explicitDataMode);
      return;
    }
    const unsubscribe = addDataModeListener(newMode => {
      setCurrentMode(newMode);
    });
    return unsubscribe;
  }, [explicitDataMode]);

  const activeMode = explicitDataMode ?? currentMode;

  const contextValue = useMemo<RepositoryContextType>(() => {
    const baseRepositories: Omit<RepositoryContextType, 'dataMode'> =
      activeMode === 'http'
        ? {
            dashboardRepository: defaultHttpDashboardRepository,
            eventRepository: defaultHttpEventRepository,
            profileRepository: defaultHttpProfileRepository,
            coordinatorRepository: defaultHttpCoordinatorRepository,
            assistantRepository: defaultHttpAssistantRepository,
          }
        : {
            dashboardRepository: defaultDashboardRepository,
            eventRepository: defaultEventRepository,
            profileRepository: defaultProfileRepository,
            coordinatorRepository: defaultCoordinatorRepository,
            assistantRepository: defaultAssistantRepository,
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
      assistantRepository:
        overrideRepositories?.assistantRepository ??
        baseRepositories.assistantRepository,
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

export function useAssistantRepository(): AssistantRepository {
  const { assistantRepository } = useRepositories();
  return assistantRepository;
}
