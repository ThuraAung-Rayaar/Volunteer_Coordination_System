/**
 * @format
 */

import { UserProfileSnapshot } from '../../domain/models';
import { IProfileRepository } from '../contracts';
import { ordinaryVolunteerUser } from './fixtures/demoUsers';

export * from './fixtures/demoUsers';
export * from './fixtures/dashboardFixture';
export * from './fixtures/eventFixtures';
export * from './fixtures/profileFixture';
export * from './fixtures/coordinatorFixtures';
export * from './MockDashboardRepository';
export * from './MockEventRepository';
export * from './MockProfileRepository';
export * from './MockCoordinatorRepository';
export * from './mockUtils';

export const mockDefaultUser: UserProfileSnapshot = ordinaryVolunteerUser;

export class LegacyMockProfileRepository implements IProfileRepository {
  async getCurrentUser(): Promise<UserProfileSnapshot> {
    return mockDefaultUser;
  }
}
