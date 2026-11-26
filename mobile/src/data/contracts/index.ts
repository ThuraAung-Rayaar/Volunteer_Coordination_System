/**
 * @format
 */

import { UserProfileSnapshot } from '../../domain/models';

export * from './dashboardRepository';
export * from './eventRepository';
export * from './profileRepository';
export * from './coordinatorRepository';
export * from './assistantRepository';

export interface IProfileRepository {
  getCurrentUser(): Promise<UserProfileSnapshot>;
}
