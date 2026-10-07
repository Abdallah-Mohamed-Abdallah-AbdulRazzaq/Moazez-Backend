import {
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus,
  AcademicContentType,
} from '@prisma/client';
import { isAcademicContentPublicationVisible } from './academic-content-publication.policy';

/** Only server-resolved Student/Parent App contexts may supply this input. */
export type AcademicContentCurrentRecipientContext = {
  schoolId: string;
  userId: string;
  studentId: string;
  enrollmentId: string;
  classroomId: string;
  academicYearId: string;
  termId: string;
} & (
  | { actorKind: 'STUDENT' }
  | { actorKind: 'PARENT'; guardianIds: readonly string[] }
);

export type AcademicContentCurrentAccessPublication = {
  id: string;
  schoolId: string;
  academicContentId: string;
  revisionId: string;
  status: AcademicContentPublicationStatus;
  publishedAt: Date | null;
  visibleFrom: Date;
  visibleUntil: Date | null;
  revision: {
    id: string;
    schoolId: string;
    academicContentId: string;
    snapshotContractVersion: number;
    academicYearId: string;
    termId: string;
    type: AcademicContentType;
    audience: Audience;
  };
};

/** Relationship and target matching are revalidated separately against live rows. */
export function academicContentCurrentAccessAllows(
  context: AcademicContentCurrentRecipientContext,
  publication: AcademicContentCurrentAccessPublication,
  now: Date,
): boolean {
  const revision = publication.revision;
  return (
    Number.isFinite(now.getTime()) &&
    isAcademicContentPublicationVisible(publication, now) &&
    publication.schoolId === context.schoolId &&
    revision.schoolId === context.schoolId &&
    publication.revisionId === revision.id &&
    publication.academicContentId === revision.academicContentId &&
    revision.snapshotContractVersion === 2 &&
    revision.academicYearId === context.academicYearId &&
    revision.termId === context.termId &&
    revision.type !== AcademicContentType.TEACHER_PREPARATION &&
    (context.actorKind === 'STUDENT'
      ? revision.audience === Audience.STUDENTS ||
        revision.audience === Audience.STUDENTS_AND_GUARDIANS
      : context.actorKind === 'PARENT' &&
        (revision.audience === Audience.GUARDIANS ||
          revision.audience === Audience.STUDENTS_AND_GUARDIANS))
  );
}
