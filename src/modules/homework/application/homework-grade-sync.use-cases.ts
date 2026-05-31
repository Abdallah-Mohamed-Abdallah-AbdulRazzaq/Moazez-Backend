import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  GradeAssessmentType,
  GradeItemStatus,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
} from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { GetGradeAssessmentUseCase } from '../../grades/assessments/application/get-grade-assessment.use-case';
import { ListGradeAssessmentItemsUseCase } from '../../grades/assessments/application/list-grade-assessment-items.use-case';
import { UpsertGradeAssessmentItemUseCase } from '../../grades/assessments/application/upsert-grade-assessment-item.use-case';
import { BulkUpsertGradeAssessmentItemsUseCase } from '../../grades/assessments/application/bulk-upsert-grade-assessment-items.use-case';
import { GradeAssessmentResponseDto } from '../../grades/assessments/dto/grade-assessment.dto';
import { GradeAssessmentItemResponseDto } from '../../grades/assessments/dto/grade-assessment-items.dto';
import { requireHomeworkScope, HomeworkScope } from '../homework-context';
import { HomeworkAssignmentNotFoundException } from '../domain/homework.exceptions';
import {
  HomeworkGradeSyncAssessmentLockedException,
  HomeworkGradeSyncDuplicateLinkException,
  HomeworkGradeSyncIncompatibleScopeException,
  HomeworkGradeSyncInvalidAssessmentException,
  HomeworkGradeSyncMissingScoreException,
  HomeworkGradeSyncNotLinkedException,
  HomeworkGradeSyncScoreExceedsAssessmentMarksException,
  HomeworkGradeSyncScoreExceedsHomeworkMarksException,
  HomeworkGradeSyncSubmissionNotReviewedException,
} from '../domain/homework-grade-sync.exceptions';
import { LinkHomeworkGradeAssessmentDto } from '../dto/homework-grade-sync.dto';
import {
  HomeworkAssignmentWithCounters,
  HomeworkRepository,
  HomeworkReviewSubmissionRecord,
} from '../infrastructure/homework.repository';
import {
  presentHomeworkGradeSyncResponse,
  presentHomeworkGradeSyncStatus,
  presentHomeworkGradeSyncSubmissionResult,
} from '../presenters/homework-grade-sync.presenter';

export interface HomeworkGradeSyncSubmissionCommand {
  homeworkId: string;
  submissionId: string;
}

@Injectable()
export class GetHomeworkGradeSyncStatusUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly getGradeAssessmentUseCase: GetGradeAssessmentUseCase,
    private readonly listGradeAssessmentItemsUseCase: ListGradeAssessmentItemsUseCase,
  ) {}

  async execute(homeworkId: string) {
    requireHomeworkScope();
    const assignment = await this.findAssignmentOrThrow(homeworkId);
    const gradeAssessment = await this.findLinkedAssessment(assignment);
    const reviewedSubmissions =
      await this.homeworkRepository.listReviewedSubmissionsForGradeSync(
        homeworkId,
      );
    const gradeItems = gradeAssessment
      ? await this.listGradeItems(gradeAssessment.id)
      : [];

    return presentHomeworkGradeSyncStatus({
      assignment,
      gradeAssessment,
      reviewedSubmissions,
      gradeItems,
    });
  }

  private async findAssignmentOrThrow(
    homeworkId: string,
  ): Promise<HomeworkAssignmentWithCounters> {
    const assignment =
      await this.homeworkRepository.findAssignmentById(homeworkId);
    if (!assignment) {
      throw new HomeworkAssignmentNotFoundException({ homeworkId });
    }

    return assignment;
  }

  private async findLinkedAssessment(
    assignment: HomeworkAssignmentWithCounters,
  ): Promise<GradeAssessmentResponseDto | null> {
    if (!assignment.gradeAssessmentId) return null;
    return this.getGradeAssessmentUseCase.execute(assignment.gradeAssessmentId);
  }

  private async listGradeItems(
    assessmentId: string,
  ): Promise<GradeAssessmentItemResponseDto[]> {
    const result = await this.listGradeAssessmentItemsUseCase.execute(
      assessmentId,
      { includeMissingStudents: false },
    );
    return result.items;
  }
}

@Injectable()
export class LinkHomeworkGradeAssessmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly getGradeAssessmentUseCase: GetGradeAssessmentUseCase,
    private readonly listGradeAssessmentItemsUseCase: ListGradeAssessmentItemsUseCase,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string, dto: LinkHomeworkGradeAssessmentDto) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );

    assertAssignmentCanBeLinked(assignment);
    if (assignment.gradeAssessmentId) {
      throw new HomeworkGradeSyncDuplicateLinkException({
        homeworkId,
        gradeAssessmentId: assignment.gradeAssessmentId,
      });
    }

    const gradeAssessment = await this.getGradeAssessmentUseCase.execute(
      dto.gradeAssessmentId,
    );
    assertGradeAssessmentCompatibleWithHomework({
      assignment,
      gradeAssessment,
    });
    const existingAssignment =
      await this.homeworkRepository.findAssignmentByGradeAssessmentId(
        gradeAssessment.id,
      );
    if (existingAssignment && existingAssignment.id !== homeworkId) {
      throw new HomeworkGradeSyncDuplicateLinkException({
        homeworkId,
        gradeAssessmentId: gradeAssessment.id,
        linkedHomeworkId: existingAssignment.id,
      });
    }

    const linked =
      await this.homeworkRepository.updateAssignmentGradeAssessmentLink(
        homeworkId,
        gradeAssessment.id,
      );
    await this.authRepository.createAuditLog(
      buildGradeSyncAuditEntry({
        scope,
        action: 'homework.grade_sync.link',
        resourceType: 'homework_assignment',
        resourceId: homeworkId,
        after: {
          homeworkId,
          gradeAssessmentId: gradeAssessment.id,
        },
      }),
    );

    const reviewedSubmissions =
      await this.homeworkRepository.listReviewedSubmissionsForGradeSync(
        homeworkId,
      );
    const gradeItems = await listGradeItems(
      this.listGradeAssessmentItemsUseCase,
      gradeAssessment.id,
    );

    return presentHomeworkGradeSyncStatus({
      assignment: linked,
      gradeAssessment,
      reviewedSubmissions,
      gradeItems,
    });
  }
}

@Injectable()
export class SyncHomeworkSubmissionToGradesUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly getGradeAssessmentUseCase: GetGradeAssessmentUseCase,
    private readonly listGradeAssessmentItemsUseCase: ListGradeAssessmentItemsUseCase,
    private readonly upsertGradeAssessmentItemUseCase: UpsertGradeAssessmentItemUseCase,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: HomeworkGradeSyncSubmissionCommand) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      command.homeworkId,
    );
    const gradeAssessment = await resolveLinkedAssessment({
      assignment,
      getGradeAssessmentUseCase: this.getGradeAssessmentUseCase,
    });
    assertGradeAssessmentCompatibleWithHomework({
      assignment,
      gradeAssessment,
    });

    const submission = await this.homeworkRepository.findReviewableSubmission({
      homeworkAssignmentId: command.homeworkId,
      submissionId: command.submissionId,
    });
    if (!submission) {
      throw new HomeworkGradeSyncSubmissionNotReviewedException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
      });
    }
    assertSubmissionSyncable({ submission, assignment, gradeAssessment });

    const gradeItemsBefore = await listGradeItems(
      this.listGradeAssessmentItemsUseCase,
      gradeAssessment.id,
    );
    const existingGradeItem =
      gradeItemsBefore.find(
        (item) => item.studentId === submission.studentId,
      ) ?? null;
    const score = requireSubmissionScore(submission);
    const gradeItem = await this.upsertGradeAssessmentItemUseCase.execute(
      gradeAssessment.id,
      submission.studentId,
      {
        status: GradeItemStatus.ENTERED,
        score,
        comment: submission.reviewNote,
      },
    );

    await this.authRepository.createAuditLog(
      buildGradeSyncAuditEntry({
        scope,
        action: 'homework.grade_sync.submission_sync',
        resourceType: 'homework_submission',
        resourceId: submission.id,
        after: {
          homeworkId: assignment.id,
          gradeAssessmentId: gradeAssessment.id,
          submissionId: submission.id,
          studentId: submission.studentId,
          score,
        },
      }),
    );

    const status = await buildStatus({
      assignment,
      gradeAssessment,
      homeworkRepository: this.homeworkRepository,
      listGradeAssessmentItemsUseCase: this.listGradeAssessmentItemsUseCase,
    });

    return presentHomeworkGradeSyncResponse({
      status,
      submissionSync: presentHomeworkGradeSyncSubmissionResult({
        submission,
        gradeItem,
        existingGradeItem,
      }),
    });
  }
}

@Injectable()
export class SyncHomeworkAssignmentToGradesUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly getGradeAssessmentUseCase: GetGradeAssessmentUseCase,
    private readonly listGradeAssessmentItemsUseCase: ListGradeAssessmentItemsUseCase,
    private readonly bulkUpsertGradeAssessmentItemsUseCase: BulkUpsertGradeAssessmentItemsUseCase,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    const gradeAssessment = await resolveLinkedAssessment({
      assignment,
      getGradeAssessmentUseCase: this.getGradeAssessmentUseCase,
    });
    assertGradeAssessmentCompatibleWithHomework({
      assignment,
      gradeAssessment,
    });

    const reviewedSubmissions =
      await this.homeworkRepository.listReviewedSubmissionsForGradeSync(
        homeworkId,
      );
    for (const submission of reviewedSubmissions) {
      assertSubmissionSyncable({ submission, assignment, gradeAssessment });
    }

    if (reviewedSubmissions.length > 0) {
      await this.bulkUpsertGradeAssessmentItemsUseCase.execute(
        gradeAssessment.id,
        {
          items: reviewedSubmissions.map((submission) => ({
            studentId: submission.studentId,
            status: GradeItemStatus.ENTERED,
            score: requireSubmissionScore(submission),
            comment: submission.reviewNote,
          })),
        },
      );
    }

    await this.authRepository.createAuditLog(
      buildGradeSyncAuditEntry({
        scope,
        action: 'homework.grade_sync.bulk_sync',
        resourceType: 'homework_assignment',
        resourceId: assignment.id,
        after: {
          homeworkId: assignment.id,
          gradeAssessmentId: gradeAssessment.id,
          submissionCount: reviewedSubmissions.length,
        },
      }),
    );

    const status = await buildStatus({
      assignment,
      gradeAssessment,
      homeworkRepository: this.homeworkRepository,
      listGradeAssessmentItemsUseCase: this.listGradeAssessmentItemsUseCase,
    });

    return presentHomeworkGradeSyncResponse({ status });
  }
}

async function findAssignmentOrThrow(
  repository: HomeworkRepository,
  homeworkId: string,
): Promise<HomeworkAssignmentWithCounters> {
  const assignment = await repository.findAssignmentById(homeworkId);
  if (!assignment) {
    throw new HomeworkAssignmentNotFoundException({ homeworkId });
  }

  return assignment;
}

async function resolveLinkedAssessment(input: {
  assignment: HomeworkAssignmentWithCounters;
  getGradeAssessmentUseCase: GetGradeAssessmentUseCase;
}): Promise<GradeAssessmentResponseDto> {
  if (!input.assignment.gradeAssessmentId) {
    throw new HomeworkGradeSyncNotLinkedException({
      homeworkId: input.assignment.id,
    });
  }

  return input.getGradeAssessmentUseCase.execute(
    input.assignment.gradeAssessmentId,
  );
}

async function buildStatus(input: {
  assignment: HomeworkAssignmentWithCounters;
  gradeAssessment: GradeAssessmentResponseDto;
  homeworkRepository: HomeworkRepository;
  listGradeAssessmentItemsUseCase: ListGradeAssessmentItemsUseCase;
}) {
  const [reviewedSubmissions, gradeItems] = await Promise.all([
    input.homeworkRepository.listReviewedSubmissionsForGradeSync(
      input.assignment.id,
    ),
    listGradeItems(
      input.listGradeAssessmentItemsUseCase,
      input.gradeAssessment.id,
    ),
  ]);

  return presentHomeworkGradeSyncStatus({
    assignment: input.assignment,
    gradeAssessment: input.gradeAssessment,
    reviewedSubmissions,
    gradeItems,
  });
}

async function listGradeItems(
  useCase: ListGradeAssessmentItemsUseCase,
  assessmentId: string,
): Promise<GradeAssessmentItemResponseDto[]> {
  const result = await useCase.execute(assessmentId, {
    includeMissingStudents: false,
  });
  return result.items;
}

function assertAssignmentCanBeLinked(
  assignment: HomeworkAssignmentWithCounters,
): void {
  if (
    assignment.status === HomeworkAssignmentStatus.CANCELLED ||
    assignment.status === HomeworkAssignmentStatus.ARCHIVED ||
    assignment.deletedAt
  ) {
    throw new HomeworkGradeSyncInvalidAssessmentException({
      homeworkId: assignment.id,
      assignmentStatus: assignment.status,
    });
  }
}

function assertGradeAssessmentCompatibleWithHomework(input: {
  assignment: HomeworkAssignmentWithCounters;
  gradeAssessment: GradeAssessmentResponseDto;
}): void {
  const { assignment, gradeAssessment } = input;

  if (gradeAssessment.isLocked) {
    throw new HomeworkGradeSyncAssessmentLockedException({
      homeworkId: assignment.id,
      gradeAssessmentId: gradeAssessment.id,
    });
  }

  if (gradeAssessment.type !== GradeAssessmentType.ASSIGNMENT) {
    throw new HomeworkGradeSyncInvalidAssessmentException({
      homeworkId: assignment.id,
      gradeAssessmentId: gradeAssessment.id,
      assessmentType: gradeAssessment.type,
    });
  }

  if (
    gradeAssessment.academicYearId !== assignment.academicYearId ||
    gradeAssessment.termId !== assignment.termId ||
    gradeAssessment.subjectId !== assignment.subjectId
  ) {
    throw new HomeworkGradeSyncIncompatibleScopeException({
      homeworkId: assignment.id,
      gradeAssessmentId: gradeAssessment.id,
      reason: 'academic_context',
    });
  }

  if (
    !isAssessmentScopeCompatibleWithHomework({ assignment, gradeAssessment })
  ) {
    throw new HomeworkGradeSyncIncompatibleScopeException({
      homeworkId: assignment.id,
      gradeAssessmentId: gradeAssessment.id,
      reason: 'placement_scope',
      scopeType: gradeAssessment.scopeType,
      scopeKey: gradeAssessment.scopeKey,
    });
  }
}

function isAssessmentScopeCompatibleWithHomework(input: {
  assignment: HomeworkAssignmentWithCounters;
  gradeAssessment: GradeAssessmentResponseDto;
}): boolean {
  const { assignment, gradeAssessment } = input;
  const section = assignment.classroom.section;
  const grade = section.grade;
  const stageId = grade.stageId;

  switch (gradeAssessment.scopeType) {
    case 'school':
      return true;
    case 'stage':
      return (
        gradeAssessment.stageId === stageId ||
        gradeAssessment.scopeKey === stageId
      );
    case 'grade':
      return (
        gradeAssessment.gradeId === grade.id ||
        gradeAssessment.scopeKey === grade.id
      );
    case 'section':
      return (
        gradeAssessment.sectionId === section.id ||
        gradeAssessment.scopeKey === section.id
      );
    case 'classroom':
      return (
        gradeAssessment.classroomId === assignment.classroomId ||
        gradeAssessment.scopeKey === assignment.classroomId
      );
    default:
      return false;
  }
}

function assertSubmissionSyncable(input: {
  submission: HomeworkReviewSubmissionRecord;
  assignment: HomeworkAssignmentWithCounters;
  gradeAssessment: GradeAssessmentResponseDto;
}): void {
  const { submission, assignment, gradeAssessment } = input;

  if (
    submission.status !== HomeworkSubmissionStatus.REVIEWED ||
    submission.homeworkTarget.status !== HomeworkTargetStatus.REVIEWED
  ) {
    throw new HomeworkGradeSyncSubmissionNotReviewedException({
      homeworkId: assignment.id,
      submissionId: submission.id,
      submissionStatus: submission.status,
      targetStatus: submission.homeworkTarget.status,
    });
  }

  const score = requireSubmissionScore(submission);
  const totalMarks = toNumber(assignment.totalMarks);
  if (totalMarks !== null && score > totalMarks) {
    throw new HomeworkGradeSyncScoreExceedsHomeworkMarksException({
      homeworkId: assignment.id,
      submissionId: submission.id,
      score,
      totalMarks,
    });
  }

  if (score > gradeAssessment.maxScore) {
    throw new HomeworkGradeSyncScoreExceedsAssessmentMarksException({
      homeworkId: assignment.id,
      submissionId: submission.id,
      gradeAssessmentId: gradeAssessment.id,
      score,
      maxScore: gradeAssessment.maxScore,
    });
  }
}

function requireSubmissionScore(
  submission: HomeworkReviewSubmissionRecord,
): number {
  const score = toNumber(submission.awardedMarks);
  if (score === null || score < 0) {
    throw new HomeworkGradeSyncMissingScoreException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      awardedMarks: score,
    });
  }

  return score;
}

function toNumber(
  value: { toNumber(): number } | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value.toNumber();

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildGradeSyncAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  resourceType: string;
  resourceId: string;
  after: Record<string, unknown>;
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: AuditOutcome.SUCCESS,
    after: input.after,
  };
}
