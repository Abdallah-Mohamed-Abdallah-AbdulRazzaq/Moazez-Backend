import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
} from '@prisma/client';
import {
  isAcademicContentAudienceAllowed,
  requiresAcademicContentSubject,
} from './academic-content-audience.policy';
import {
  AcademicContentTermDates,
  isAcademicContentMutable,
  isAcademicContentTermWritable,
  isAcademicContentTitleValid,
} from './academic-content-lifecycle.policy';

export type AcademicContentReadinessReason = {
  code: string;
  message: string;
};

export type AcademicContentReadiness = {
  canAdvance: boolean;
  blockingReasons: AcademicContentReadinessReason[];
};

export type AcademicContentReadinessInput = {
  status: AcademicContentStatus;
  type: AcademicContentType;
  audience: AcademicContentAudienceType;
  title: string;
  academicYearId: string;
  targets: readonly { subjectId: string | null }[];
  hasTypeDetail: boolean;
  academicYearExists: boolean;
  term: (AcademicContentTermDates & { academicYearId: string }) | null;
  now: Date;
};

/** Stable, safe reasons are emitted in contract order and never include persisted secrets. */
export function evaluateAcademicContentReadiness(
  input: AcademicContentReadinessInput,
): AcademicContentReadiness {
  const blockingReasons: AcademicContentReadinessReason[] = [];
  const codes = new Set<string>();
  const block = (code: string, message: string) => {
    if (!codes.has(code)) {
      codes.add(code);
      blockingReasons.push({ code, message });
    }
  };

  if (!isAcademicContentMutable(input.status))
    block(
      'academic_content.readiness.read_only',
      'Academic content is read-only',
    );
  if (!isAcademicContentTitleValid(input.title))
    block('academic_content.readiness.title_invalid', 'A title is required');
  if (!input.academicYearExists)
    block(
      'academic_content.readiness.academic_year_missing',
      'Academic year is unavailable',
    );
  if (!input.term)
    block('academic_content.readiness.term_missing', 'Term is unavailable');
  else {
    if (input.term.academicYearId !== input.academicYearId)
      block(
        'academic_content.readiness.term_year_mismatch',
        'Term does not belong to the academic year',
      );
    if (!isAcademicContentTermWritable(input.term, input.now))
      block('academic_content.readiness.term_closed', 'Term is not writable');
  }
  if (!isAcademicContentAudienceAllowed(input.type, input.audience))
    block(
      'academic_content.readiness.audience_invalid',
      'Audience is unavailable for this content type',
    );
  if (input.targets.length === 0)
    block(
      'academic_content.readiness.targets_missing',
      'At least one target is required',
    );
  else if (
    requiresAcademicContentSubject(input.type) &&
    input.targets.some((target) => !target.subjectId)
  )
    block(
      'academic_content.readiness.subject_target_missing',
      'Every target requires a subject',
    );
  if (
    input.type !== AcademicContentType.GENERAL_RESOURCE &&
    !input.hasTypeDetail
  )
    block(
      'academic_content.readiness.type_detail_missing',
      'Type detail is required',
    );

  return { canAdvance: blockingReasons.length === 0, blockingReasons };
}
