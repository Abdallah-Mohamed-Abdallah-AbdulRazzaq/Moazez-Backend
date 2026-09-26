import {
  AcademicContentAudienceType as Audience,
  AcademicContentType as ContentType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

const ALLOWED_AUDIENCES: Readonly<Record<ContentType, readonly Audience[]>> = {
  [ContentType.TEACHER_PREPARATION]: [Audience.INTERNAL_STAFF],
  [ContentType.WEEKLY_PLAN]: [
    Audience.STUDENTS,
    Audience.GUARDIANS,
    Audience.STUDENTS_AND_GUARDIANS,
  ],
  [ContentType.GUARDIAN_WEEKLY_NOTE]: [Audience.GUARDIANS],
  [ContentType.SUBJECT_RESOURCE]: [
    Audience.STUDENTS,
    Audience.GUARDIANS,
    Audience.STUDENTS_AND_GUARDIANS,
  ],
  [ContentType.ONLINE_SESSION]: [
    Audience.STUDENTS,
    Audience.STUDENTS_AND_GUARDIANS,
  ],
  [ContentType.GENERAL_RESOURCE]: Object.values(Audience),
};

export function assertAcademicContentAudience(
  type: ContentType,
  audience: Audience,
): void {
  if (!isAcademicContentAudienceAllowed(type, audience)) {
    throw new ValidationDomainException(
      'Academic content audience is invalid for its type',
    );
  }
}

export function isAcademicContentAudienceAllowed(
  type: ContentType,
  audience: Audience,
): boolean {
  return ALLOWED_AUDIENCES[type]?.includes(audience) ?? false;
}

export function requiresAcademicContentSubject(type: ContentType): boolean {
  return (
    type === ContentType.TEACHER_PREPARATION ||
    type === ContentType.WEEKLY_PLAN ||
    type === ContentType.SUBJECT_RESOURCE ||
    type === ContentType.ONLINE_SESSION
  );
}
