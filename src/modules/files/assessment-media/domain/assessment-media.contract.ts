import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  UserType,
} from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { getRequestContext } from '../../../../common/context/request-context';
import { requireFilesScope } from '../../uploads/files-scope';

export const ASSESSMENT_MEDIA_PURPOSES = [
  FileUploadPurpose.HOMEWORK_ASSIGNMENT_MEDIA,
  FileUploadPurpose.GRADE_ASSESSMENT_MEDIA,
  FileUploadPurpose.HOMEWORK_SUBMISSION_MEDIA,
  FileUploadPurpose.GRADE_SUBMISSION_MEDIA,
] as const;
export type AssessmentMediaPurpose = (typeof ASSESSMENT_MEDIA_PURPOSES)[number];

export const ASSESSMENT_MEDIA_VERSION = 'assessment-media-attested-v1';
export const ASSESSMENT_UPLOAD_TTL_MS = 30 * 60 * 1000;
export const ASSESSMENT_SIGNED_CAPABILITY_TTL_SECONDS = 15 * 60;
export const ASSESSMENT_VERIFICATION_DEADLINE_MS = 90_000;

export type AssessmentMediaReason =
  | 'disabled'
  | 'invalid_request'
  | 'policy_denied'
  | 'quota_exceeded'
  | 'rate_exceeded'
  | 'idempotency_conflict'
  | 'upload_not_found'
  | 'state_conflict'
  | 'verification_in_progress'
  | 'expired'
  | 'capability_failed'
  | 'verification_failed'
  | 'verifier_unavailable'
  | 'security_verification_unavailable'
  | 'object_changed'
  | 'verification_timeout'
  | 'ready_relationship_invalid';

export class AssessmentMediaException extends DomainException {
  constructor(readonly reason: AssessmentMediaReason) {
    super({
      code: `assessment_media.${reason}`,
      message: 'Assessment media operation is unavailable or invalid',
      httpStatus:
        reason === 'upload_not_found'
          ? HttpStatus.NOT_FOUND
          : reason === 'rate_exceeded'
            ? HttpStatus.TOO_MANY_REQUESTS
            : reason === 'invalid_request'
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.CONFLICT,
    });
  }
}

export function assertAssessmentUuid(value: string): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    throw new AssessmentMediaException('invalid_request');
}

export function assessmentMediaOwner(
  purpose: AssessmentMediaPurpose,
  contextId: string,
  questionId?: string,
  teacherAuthoringClassId?: string,
) {
  if (!(ASSESSMENT_MEDIA_PURPOSES as readonly string[]).includes(purpose))
    throw new AssessmentMediaException('invalid_request');
  assertAssessmentUuid(contextId);
  const scope = requireFilesScope();
  if (teacherAuthoringClassId !== undefined) {
    assertAssessmentUuid(teacherAuthoringClassId);
    if (
      purpose !== FileUploadPurpose.GRADE_ASSESSMENT_MEDIA ||
      scope.userType !== UserType.TEACHER ||
      questionId !== undefined
    )
      throw new AssessmentMediaException('upload_not_found');
  }
  const membershipId = getRequestContext()?.activeMembership?.membershipId;
  if (!membershipId) throw new AssessmentMediaException('upload_not_found');
  const studentPurpose =
    purpose === FileUploadPurpose.HOMEWORK_SUBMISSION_MEDIA ||
    purpose === FileUploadPurpose.GRADE_SUBMISSION_MEDIA;
  if (questionId !== undefined) {
    assertAssessmentUuid(questionId);
    if (!studentPurpose) throw new AssessmentMediaException('invalid_request');
  }
  const managementActors: readonly UserType[] = [
    UserType.SCHOOL_USER,
    UserType.ORGANIZATION_USER,
    UserType.TEACHER,
  ];
  if (
    studentPurpose
      ? scope.userType !== UserType.STUDENT
      : !managementActors.includes(scope.userType)
  )
    throw new AssessmentMediaException('upload_not_found');
  const permission = teacherAuthoringClassId
    ? 'grades.teacher_authoring.manage'
    : {
        HOMEWORK_ASSIGNMENT_MEDIA: 'homework.attachments.manage',
        GRADE_ASSESSMENT_MEDIA: 'grades.questions.manage',
        HOMEWORK_SUBMISSION_MEDIA: 'homework.submission_attachments.manage',
        GRADE_SUBMISSION_MEDIA: 'grades.submissions.submit',
      }[purpose];
  if (!getRequestContext()?.activeMembership?.permissions.includes(permission))
    throw new AssessmentMediaException('upload_not_found');
  return {
    ...scope,
    actorId: scope.actorId.toLowerCase(),
    schoolId: scope.schoolId.toLowerCase(),
    organizationId: scope.organizationId.toLowerCase(),
    roleId: scope.roleId.toLowerCase(),
    membershipId: membershipId.toLowerCase(),
    purpose,
    contextId: contextId.toLowerCase(),
    permission,
    studentPurpose,
    ...(teacherAuthoringClassId
      ? { teacherAuthoringClassId: teacherAuthoringClassId.toLowerCase() }
      : {}),
    ...(questionId === undefined
      ? {}
      : { questionId: questionId.toLowerCase() }),
  };
}
export type AssessmentMediaOwner = ReturnType<typeof assessmentMediaOwner>;

export type AssessmentAnswerUploadBinding = {
  studentId: string;
  questionId: string;
  responseConfig: import('../../../../common/assessment-answer/response-config').ResponseConfigV1;
} & (
  | {
      homeworkTargetId: string;
      homeworkQuestionId: string;
      homeworkAssignmentId: string;
      gradeSubmissionId?: never;
      gradeQuestionId?: never;
      gradeAssessmentId?: never;
    }
  | {
      gradeSubmissionId: string;
      gradeQuestionId: string;
      gradeAssessmentId: string;
      homeworkTargetId?: never;
      homeworkQuestionId?: never;
      homeworkAssignmentId?: never;
    }
);

const TRANSITIONS: Partial<
  Record<FileUploadSessionStatus, readonly FileUploadSessionStatus[]>
> = {
  CREATED: ['UPLOADING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  UPLOADING: ['VERIFYING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  VERIFYING: ['READY', 'FAILED', 'CANCELLED', 'EXPIRED'],
};
export function assertAssessmentTransition(
  from: FileUploadSessionStatus,
  to: FileUploadSessionStatus,
): void {
  if (!TRANSITIONS[from]?.includes(to))
    throw new AssessmentMediaException('state_conflict');
}

export interface CreateAssessmentMediaCommand {
  clientRequestId: string;
  originalName: string;
  expectedMimeType: string;
  expectedSizeBytes: string;
  trustedOrigin?: string;
}

/** Internal status contract. The optional upload capability is uploader-only secret material. */
export interface AssessmentMediaUploadDto {
  uploadId: string;
  status: FileUploadSessionStatus;
  fileId: string | null;
  expiresAt: string;
  uploadCapability?: {
    mode: 'resumable' | 'signed-post';
    url: string;
    formFields?: Record<string, string>;
    expiresAt: string;
  };
}
