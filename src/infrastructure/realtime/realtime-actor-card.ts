import { UserType } from '@prisma/client';

export type RealtimeActorUserType =
  | 'teacher'
  | 'student'
  | 'parent'
  | 'admin'
  | 'user';

export interface RealtimeActorCard {
  displayName: string;
  userType: RealtimeActorUserType;
  avatarUrl: string | null;
}

export function buildRealtimeActorCard(input: {
  firstName?: string | null;
  lastName?: string | null;
  userType?: UserType | string | null;
  avatarUrl?: string | null;
}): RealtimeActorCard {
  return {
    displayName: buildDisplayName(input.firstName, input.lastName),
    userType: presentRealtimeUserType(input.userType),
    avatarUrl: input.avatarUrl ?? null,
  };
}

export function normalizeRealtimeActorCard(
  actor?: RealtimeActorCard | null,
): RealtimeActorCard {
  if (!actor) {
    return {
      displayName: 'User',
      userType: 'user',
      avatarUrl: null,
    };
  }

  return {
    displayName: actor.displayName.trim() || 'User',
    userType: actor.userType,
    avatarUrl: actor.avatarUrl ?? null,
  };
}

function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const displayName = [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return displayName || 'User';
}

function presentRealtimeUserType(
  userType?: UserType | string | null,
): RealtimeActorUserType {
  switch (userType) {
    case UserType.TEACHER:
      return 'teacher';
    case UserType.STUDENT:
      return 'student';
    case UserType.PARENT:
      return 'parent';
    case UserType.PLATFORM_USER:
    case UserType.ORGANIZATION_USER:
    case UserType.SCHOOL_USER:
      return 'admin';
    default:
      return 'user';
  }
}
