/**
 * @format
 * Feature-facing Use Cases & View-Model Capability Contracts.
 */

import { useMemo } from 'react';
import { useRepositories } from '../../app/RepositoryProvider';
import { defaultLocationProvider } from '../../core/location/locationProvider';
import {
  createVolunteerUseCases,
  VolunteerUseCases,
  VolunteerUseCasesDeps,
} from './volunteerUseCases';
import {
  createCoordinatorUseCases,
  CoordinatorUseCases,
  CoordinatorUseCasesDeps,
} from './coordinatorUseCases';

export * from './volunteerUseCases';
export * from './coordinatorUseCases';

/**
 * React hook providing all 43 Volunteer capabilities (V-01 .. V-43)
 * bound to the currently active data mode (Mock vs HTTP) and repository context.
 */
export function useVolunteerCapabilities(): VolunteerUseCases {
  const { profileRepository, eventRepository, dashboardRepository } =
    useRepositories();

  return useMemo(() => {
    return createVolunteerUseCases({
      profileRepository,
      eventRepository,
      dashboardRepository,
      locationProvider: defaultLocationProvider,
    });
  }, [profileRepository, eventRepository, dashboardRepository]);
}

/**
 * React hook providing all 39 Coordinator capabilities (C-01 .. C-39)
 * bound to the currently active data mode (Mock vs HTTP) and repository context.
 */
export function useCoordinatorCapabilities(): CoordinatorUseCases {
  const { coordinatorRepository, profileRepository } = useRepositories();

  return useMemo(() => {
    return createCoordinatorUseCases({
      coordinatorRepository,
      profileRepository,
    });
  }, [coordinatorRepository, profileRepository]);
}
