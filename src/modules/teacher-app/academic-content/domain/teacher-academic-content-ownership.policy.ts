import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
} from '@prisma/client';
import {
  isAcademicContentMutable,
  isAcademicContentTermWritable,
  type AcademicContentTermDates,
} from '../../../academics/academic-content/domain/academic-content-lifecycle.policy';
import {
  isAcademicContentApprovalRequired,
  isAcademicContentSubmissionSource,
  type AcademicContentEffectiveWorkflowPolicy,
} from '../../../academics/academic-content/domain/academic-content-workflow.policy';
import {
  academicContentPublicationRevisionStrategy,
  isAcademicContentExternallyPublishable,
} from '../../../academics/academic-content/domain/academic-content-publication.policy';
import type { TeacherAcademicContentActionsDto } from '../dto/teacher-academic-content.dto';

export type TeacherAcademicContentOwnership = {
  schoolId: string;
  createdByUserId: string;
  targets: readonly {
    teacherSubjectAllocationId: string | null;
    teacherSubjectAllocation: {
      schoolId: string;
      teacherUserId: string;
    } | null;
  }[];
};

/** Creator possession never substitutes for ownership of every current allocation. */
export function hasTeacherAcademicContentMutableOwnership(
  content: TeacherAcademicContentOwnership,
  teacherUserId: string,
): boolean {
  const bound = content.targets.filter(
    (target) => target.teacherSubjectAllocationId !== null,
  );
  return (
    content.createdByUserId === teacherUserId &&
    bound.length > 0 &&
    bound.every(
      (target) =>
        target.teacherSubjectAllocation?.schoolId === content.schoolId &&
        target.teacherSubjectAllocation.teacherUserId === teacherUserId,
    )
  );
}

/**
 * Convenience only: future mutations must independently reauthorize.
 * Read details do not prove readiness, approval lineage or publication action
 * state. Those actions stay false until core business checks prove them.
 */
export function teacherAcademicContentCapabilities(input: {
  content: TeacherAcademicContentOwnership & {
    status: AcademicContentStatus;
    type: AcademicContentType;
    audience: AcademicContentAudienceType;
  };
  teacherUserId: string;
  permissions: readonly string[];
  term: AcademicContentTermDates | null;
  workflow: AcademicContentEffectiveWorkflowPolicy;
  now: Date;
  verifiedActions?: Partial<Omit<TeacherAcademicContentActionsDto, 'canEdit'>>;
}): TeacherAcademicContentActionsDto {
  const owned = hasTeacherAcademicContentMutableOwnership(
    input.content,
    input.teacherUserId,
  );
  const writable =
    input.term !== null && isAcademicContentTermWritable(input.term, input.now);
  const manage = input.permissions.includes(
    'academics.academic_content.manage',
  );
  const publish = input.permissions.includes(
    'academics.academic_content.publish',
  );
  const mutable = isAcademicContentMutable(input.content.status);
  const mutation = owned && writable;
  const verified = input.verifiedActions;
  return {
    canEdit: mutation && manage && mutable,
    canSubmit:
      mutation &&
      manage &&
      isAcademicContentSubmissionSource(input.content.status) &&
      isAcademicContentApprovalRequired(input.content.type, input.workflow) &&
      verified?.canSubmit === true,
    canPublish:
      mutation &&
      publish &&
      isAcademicContentExternallyPublishable(
        input.content.type,
        input.content.audience,
      ) &&
      academicContentPublicationRevisionStrategy(input.content.status) !==
        null &&
      verified?.canPublish === true,
    canUnschedule:
      mutation &&
      publish &&
      input.content.status === AcademicContentStatus.SCHEDULED &&
      verified?.canUnschedule === true,
    canCancelPublication:
      mutation &&
      publish &&
      input.content.status === AcademicContentStatus.PUBLISHED &&
      verified?.canCancelPublication === true,
    canStartRevision:
      mutation &&
      manage &&
      publish &&
      input.content.status === AcademicContentStatus.PUBLISHED &&
      verified?.canStartRevision === true,
  };
}
