import { UserType } from '@prisma/client';

export function userTypeFromRoleKey(roleKey: string): UserType {
  switch (roleKey) {
    case 'teacher':
      return UserType.TEACHER;
    case 'parent':
      return UserType.PARENT;
    case 'student':
      return UserType.STUDENT;
    default:
      return UserType.SCHOOL_USER;
  }
}
