import { UserType } from '@prisma/client';

export function userTypeFromRoleKey(roleKey: string): UserType {
  switch (roleKey) {
    case 'teacher':
      return UserType.TEACHER;
    case 'parent':
      return UserType.PARENT;
    case 'student':
      return UserType.STUDENT;
    case 'dismissal_staff':
      return UserType.DISMISSAL_STAFF;
    default:
      return UserType.SCHOOL_USER;
  }
}
