import { UserType } from '@prisma/client';

export const ACADEMIC_CONTENT_MANAGE_PERMISSION =
  'academics.academic_content.manage';

export function canManageAcademicContent(
  userType: UserType,
  permissions: readonly string[],
): boolean {
  return (
    (userType === UserType.ORGANIZATION_USER ||
      userType === UserType.SCHOOL_USER) &&
    permissions.includes(ACADEMIC_CONTENT_MANAGE_PERMISSION)
  );
}

export function canReplaceAcademicContentTargets(
  userType: UserType,
  permissions: readonly string[],
): boolean {
  return (
    userType === UserType.TEACHER ||
    canManageAcademicContent(userType, permissions)
  );
}
