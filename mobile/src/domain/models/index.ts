/**
 * @format
 */

export * from './dashboard';
export * from './event';
export * from './profile';
export * from './availability';
export * from './verification';
export * from './coordinator';

export type CoordinatorStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'suspended'
  | 'revoked';

export type UserAccountStatus = 'active' | 'blocked' | 'closed';

export interface UserProfileSnapshot {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly coordinatorStatus: CoordinatorStatus;
  readonly accountStatus: UserAccountStatus;
}

/**
 * Derives coordinator capability:
 * Requires an active account status AND an approved coordinator profile.
 */
export function hasCoordinatorAccess(user: UserProfileSnapshot): boolean {
  return (
    user.accountStatus === 'active' && user.coordinatorStatus === 'approved'
  );
}
