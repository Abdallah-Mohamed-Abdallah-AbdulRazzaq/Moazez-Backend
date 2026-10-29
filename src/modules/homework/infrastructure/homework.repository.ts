import { Injectable, Optional } from '@nestjs/common';
import {
  assertHomeworkRuntimeQuestionType,
  assertHomeworkRuntimeQuestions,
} from '../domain/homework-runtime-types';
import type { RichContent } from '../../../common/rich-content/rich-content.types';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  HomeworkRichContentService,
  type HomeworkRichAudience,
} from '../application/homework-rich-content.service';
import { homeworkRichChange } from '../domain/homework-rich-content';
import type { HomeworkAssetActor } from '../domain/homework-question-asset';
import type { HomeworkRichQuestion } from './homework-rich-content.projection';
import {
  HomeworkQuestionInvalidTypePayloadException,
  HomeworkQuestionOptionNotFoundException,
  HomeworkQuestionNotFoundException,
} from '../domain/homework-question.exceptions';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { requireHomeworkScope } from '../homework-context';
import {
  HomeworkSubmissionAlreadySubmittedException,
  HomeworkSubmissionNotSubmittableException,
  HomeworkSubmissionTargetNotFoundException,
  HomeworkAssignmentNotFoundException,
  HomeworkAssignmentNotMutableException,
} from '../domain/homework.exceptions';
import {
  HomeworkSubmissionAttachmentFileNotFoundException,
  HomeworkSubmissionAttachmentReadOnlyException,
} from '../domain/homework-submission-attachment.exceptions';
import { HomeworkAnswerReadOnlyException } from '../domain/homework-answer.exceptions';
import {
  isHomeworkTypedType,
  normalizeHomeworkTypedQuestionMutation,
  normalizeHomeworkTypedWrite,
  attachHomeworkAuthorKey,
  homeworkTypedQuestionValidation,
} from '../application/homework-typed-runtime';
import { normalizeHomeworkDefinition } from '../domain/homework-typed-foundation';
import { classifyStoredHomeworkPrivateAnswerKey } from '../domain/homework-typed-foundation';
import {
  assertHomeworkPublicationState,
  validateHomeworkPublicationStructures,
} from '../domain/homework-publication';
import { HomeworkAssignmentInvalidQuestionStructureException } from '../domain/homework-question.exceptions';
import { HomeworkAssignmentTargetConflictException } from '../domain/homework.exceptions';
import { HomeworkQuestionReadOnlyException } from '../domain/homework-question.exceptions';
import type { HomeworkAnswerInput } from '../domain/homework-answer-inputs';
import { normalizeAnswerForQuestion } from '../domain/homework-answer-normalization';
import {
  HomeworkAnswerInvalidPayloadException,
  HomeworkAnswerInvalidSubmissionScopeException,
} from '../domain/homework-answer.exceptions';
import {
  projectHomeworkTypedAnswers,
  readHomeworkTypedAnswers,
} from './homework-typed-answer.projection';
import { homeworkAnswerJsonPersistence } from './homework-typed-persistence';
import {
  HomeworkAnswerReviewReadOnlyException,
  HomeworkAnswerReviewInvalidScopeException,
  HomeworkAnswerReviewExceedsQuestionPointsException,
  HomeworkAnswerReviewExceedsAssignmentMarksException,
  HomeworkAnswerReviewIncompleteRequiredAnswersException,
} from '../domain/homework-answer-review.exceptions';
import { HomeworkSubmissionReviewInvalidException } from '../domain/homework.exceptions';

class HomeworkRichAuthorizationRequired extends Error {}

function richStorage(
  plan: ReturnType<typeof homeworkRichChange>,
): Record<string, unknown> {
  return plan.action === 'write'
    ? {
        ...plan.legacy,
        richContent:
          plan.richContent === null ? Prisma.DbNull : plan.richContent,
      }
    : {};
}

const REVIEWABLE_SUBMISSION_STATUSES: HomeworkSubmissionStatus[] = [
  HomeworkSubmissionStatus.SUBMITTED,
  HomeworkSubmissionStatus.LATE,
];

const REVIEW_VISIBLE_SUBMISSION_STATUSES: HomeworkSubmissionStatus[] = [
  ...REVIEWABLE_SUBMISSION_STATUSES,
  HomeworkSubmissionStatus.REVIEWED,
];

const REVIEW_VISIBLE_ASSIGNMENT_STATUSES: HomeworkAssignmentStatus[] = [
  HomeworkAssignmentStatus.PUBLISHED,
  HomeworkAssignmentStatus.CLOSED,
];

const NAMED_REFERENCE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.AcademicYearSelect;

const HOMEWORK_QUESTION_OPTION_SELECT = {
  richContent: true,
  id: true,
  schoolId: true,
  homeworkQuestionId: true,
  text: true,
  isCorrect: true,
  sortOrder: true,
  metadata: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HomeworkQuestionOptionSelect;

const HOMEWORK_QUESTION_SELECT = {
  richContent: true,
  id: true,
  schoolId: true,
  homeworkAssignmentId: true,
  type: true,
  prompt: true,
  instructions: true,
  points: true,
  sortOrder: true,
  isRequired: true,
  expectedAnswer: true,
  metadata: true,
  createdByUserId: true,
  updatedByUserId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  options: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: HOMEWORK_QUESTION_OPTION_SELECT,
  },
} satisfies Prisma.HomeworkQuestionSelect;

const HOMEWORK_ATTACHMENT_SELECT = {
  id: true,
  schoolId: true,
  homeworkAssignmentId: true,
  fileId: true,
  title: true,
  description: true,
  sortOrder: true,
  createdByUserId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  file: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.HomeworkAssignmentAttachmentSelect;

const HOMEWORK_SUBMISSION_ANSWER_SELECT = {
  id: true,
  schoolId: true,
  homeworkSubmissionId: true,
  homeworkAssignmentId: true,
  homeworkTargetId: true,
  homeworkQuestionId: true,
  textAnswer: true,
  selectedOptionIds: true,
  isDraft: true,
  teacherComment: true,
  awardedPoints: true,
  reviewedAt: true,
  reviewedByUserId: true,
  reviewedByUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  homeworkQuestion: {
    select: HOMEWORK_QUESTION_SELECT,
  },
} satisfies Prisma.HomeworkSubmissionAnswerSelect;

const HOMEWORK_SUBMISSION_ATTACHMENT_SELECT = {
  id: true,
  schoolId: true,
  homeworkSubmissionId: true,
  homeworkAssignmentId: true,
  homeworkTargetId: true,
  fileId: true,
  title: true,
  description: true,
  sortOrder: true,
  createdByUserId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  file: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.HomeworkSubmissionAttachmentSelect;

const HOMEWORK_ASSIGNMENT_ARGS =
  Prisma.validator<Prisma.HomeworkAssignmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      subjectId: true,
      teacherUserId: true,
      teacherSubjectAllocationId: true,
      timetableEntryId: true,
      scheduleDate: true,
      title: true,
      description: true,
      mode: true,
      status: true,
      targetMode: true,
      publishAt: true,
      publishedAt: true,
      dueAt: true,
      closedAt: true,
      estimatedMinutes: true,
      totalMarks: true,
      isGraded: true,
      gradeAssessmentId: true,
      createdByUserId: true,
      publishedByUserId: true,
      cancelledAt: true,
      archivedAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      academicYear: {
        select: NAMED_REFERENCE_SELECT,
      },
      term: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          academicYearId: true,
          startDate: true,
          endDate: true,
        },
      },
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  stageId: true,
                  nameAr: true,
                  nameEn: true,
                },
              },
            },
          },
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
          color: true,
        },
      },
      teacherUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      questions: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HOMEWORK_QUESTION_SELECT,
      },
      attachments: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HOMEWORK_ATTACHMENT_SELECT,
      },
    },
  });

const TEACHER_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      teacherUserId: true,
      subjectId: true,
      classroomId: true,
      termId: true,
      term: {
        select: {
          id: true,
          academicYearId: true,
          startDate: true,
          endDate: true,
        },
      },
      classroom: {
        select: {
          id: true,
          sectionId: true,
          section: {
            select: {
              id: true,
              gradeId: true,
              grade: {
                select: {
                  id: true,
                  stageId: true,
                },
              },
            },
          },
        },
      },
      subject: {
        select: {
          id: true,
        },
      },
      teacherUser: {
        select: {
          id: true,
        },
      },
    },
  });

const TIMETABLE_ENTRY_ARGS =
  Prisma.validator<Prisma.TimetableEntryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      timetableConfigId: true,
      classroomId: true,
      subjectId: true,
      teacherUserId: true,
      teacherSubjectAllocationId: true,
      status: true,
      timetableConfig: {
        select: {
          id: true,
          status: true,
          publications: {
            where: { status: TimetablePublicationStatus.PUBLISHED },
            orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

const ENROLLMENT_TARGET_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()(
  {
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  },
);

const HOMEWORK_TARGET_ARGS =
  Prisma.validator<Prisma.HomeworkTargetDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      homeworkAssignmentId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      assignedAt: true,
      viewedAt: true,
      submittedAt: true,
      reviewedAt: true,
      excusedAt: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

const HOMEWORK_SUBMISSION_ARGS =
  Prisma.validator<Prisma.HomeworkSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      homeworkAssignmentId: true,
      homeworkTargetId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      bodyText: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedByUserId: true,
      reviewNote: true,
      awardedMarks: true,
      createdAt: true,
      updatedAt: true,
      answers: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: HOMEWORK_SUBMISSION_ANSWER_SELECT,
      },
      attachments: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
      },
    },
  });

const HOMEWORK_REVIEW_SUBMISSION_ARGS =
  Prisma.validator<Prisma.HomeworkSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      homeworkAssignmentId: true,
      homeworkTargetId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      bodyText: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedByUserId: true,
      reviewNote: true,
      awardedMarks: true,
      createdAt: true,
      updatedAt: true,
      answers: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: HOMEWORK_SUBMISSION_ANSWER_SELECT,
      },
      attachments: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      homeworkAssignment: {
        select: {
          id: true,
          status: true,
          dueAt: true,
          totalMarks: true,
          isGraded: true,
          deletedAt: true,
          questions: {
            where: { deletedAt: null },
            orderBy: [
              { sortOrder: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            select: HOMEWORK_QUESTION_SELECT,
          },
        },
      },
      homeworkTarget: {
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
        },
      },
    },
  });

const HOMEWORK_TARGET_FOR_SUBMISSION_ARGS =
  Prisma.validator<Prisma.HomeworkTargetDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      homeworkAssignmentId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      submittedAt: true,
      homeworkAssignment: {
        select: {
          id: true,
          status: true,
          dueAt: true,
          deletedAt: true,
          questions: {
            where: { deletedAt: null },
            orderBy: [
              { sortOrder: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            select: HOMEWORK_QUESTION_SELECT,
          },
        },
      },
      submissions: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        ...HOMEWORK_SUBMISSION_ARGS,
      },
    },
  });

export type HomeworkAssignmentRecord = Prisma.HomeworkAssignmentGetPayload<
  typeof HOMEWORK_ASSIGNMENT_ARGS
>;
export type HomeworkTeacherAllocationRecord =
  Prisma.TeacherSubjectAllocationGetPayload<typeof TEACHER_ALLOCATION_ARGS>;
export type HomeworkTimetableEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof TIMETABLE_ENTRY_ARGS
>;
export type HomeworkEnrollmentTargetRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_TARGET_ARGS
>;
export type HomeworkTargetRecord = Prisma.HomeworkTargetGetPayload<
  typeof HOMEWORK_TARGET_ARGS
>;
export type HomeworkSubmissionRecord = Prisma.HomeworkSubmissionGetPayload<
  typeof HOMEWORK_SUBMISSION_ARGS
>;
export type HomeworkQuestionRecord = Prisma.HomeworkQuestionGetPayload<{
  select: typeof HOMEWORK_QUESTION_SELECT;
}>;
export type HomeworkQuestionOptionRecord =
  Prisma.HomeworkQuestionOptionGetPayload<{
    select: typeof HOMEWORK_QUESTION_OPTION_SELECT;
  }>;
export type HomeworkAttachmentRecord =
  Prisma.HomeworkAssignmentAttachmentGetPayload<{
    select: typeof HOMEWORK_ATTACHMENT_SELECT;
  }>;
export type HomeworkSubmissionAnswerRecord =
  Prisma.HomeworkSubmissionAnswerGetPayload<{
    select: typeof HOMEWORK_SUBMISSION_ANSWER_SELECT;
  }>;
export type HomeworkSubmissionAttachmentRecord =
  Prisma.HomeworkSubmissionAttachmentGetPayload<{
    select: typeof HOMEWORK_SUBMISSION_ATTACHMENT_SELECT;
  }>;
export type HomeworkReviewSubmissionRecord =
  Prisma.HomeworkSubmissionGetPayload<typeof HOMEWORK_REVIEW_SUBMISSION_ARGS>;
export type HomeworkTargetForSubmissionRecord = Prisma.HomeworkTargetGetPayload<
  typeof HOMEWORK_TARGET_FOR_SUBMISSION_ARGS
>;

export type HomeworkStatusCounters = Record<HomeworkTargetStatus, number> & {
  totalTargets: number;
};

export type HomeworkAssignmentWithCounters = HomeworkAssignmentRecord & {
  counters: HomeworkStatusCounters;
};

export interface ListHomeworkAssignmentsFilters {
  academicYearId?: string;
  termId?: string;
  classroomId?: string;
  teacherUserId?: string;
  teacherSubjectAllocationId?: string;
  status?: HomeworkAssignmentStatus;
  mode?: HomeworkAssignmentMode;
  dueFrom?: Date;
  dueTo?: Date;
  search?: string;
  page: number;
  limit: number;
}

export interface ListHomeworkAssignmentsResult {
  items: HomeworkAssignmentWithCounters[];
  total: number;
  page: number;
  limit: number;
}

export interface ListHomeworkReviewSubmissionsFilters {
  homeworkAssignmentId: string;
  statuses?: HomeworkSubmissionStatus[];
  search?: string;
  page: number;
  limit: number;
}

export interface ListHomeworkReviewSubmissionsResult {
  items: HomeworkReviewSubmissionRecord[];
  total: number;
  page: number;
  limit: number;
}

export type CreateHomeworkAssignmentData =
  Prisma.HomeworkAssignmentUncheckedCreateInput;
export type UpdateHomeworkAssignmentData =
  Prisma.HomeworkAssignmentUncheckedUpdateInput;
export interface HomeworkAllocationWriteContext {
  schoolId: string;
  allocationId: string;
  expectedTeacherUserId?: string;
}
export type CreateHomeworkTargetData =
  Prisma.HomeworkTargetUncheckedCreateInput;
export type CreateHomeworkQuestionData = Omit<
  Prisma.HomeworkQuestionUncheckedCreateInput,
  'richContent' | 'answerKey'
> & { richContent?: RichContent | null };
export type UpdateHomeworkQuestionData = Omit<
  Prisma.HomeworkQuestionUncheckedUpdateInput,
  'richContent' | 'answerKey'
> & { richContent?: RichContent | null };
export type CreateHomeworkQuestionOptionData = Omit<
  Prisma.HomeworkQuestionOptionUncheckedCreateInput,
  'richContent'
> & { richContent?: RichContent | null };
export type UpdateHomeworkQuestionOptionData = Omit<
  Prisma.HomeworkQuestionOptionUncheckedUpdateInput,
  'richContent'
> & { richContent?: RichContent | null };
export type CreateHomeworkAttachmentData =
  Prisma.HomeworkAssignmentAttachmentUncheckedCreateInput;
export type UpdateHomeworkAttachmentData =
  Prisma.HomeworkAssignmentAttachmentUncheckedUpdateInput;
export type CreateHomeworkSubmissionAnswerData = Omit<
  Prisma.HomeworkSubmissionAnswerUncheckedCreateInput,
  'answerJson'
>;
export type UpdateHomeworkSubmissionAnswerData = Omit<
  Prisma.HomeworkSubmissionAnswerUncheckedUpdateInput,
  'answerJson'
>;
export type CreateHomeworkSubmissionAttachmentData =
  Prisma.HomeworkSubmissionAttachmentUncheckedCreateInput;
export type UpdateHomeworkSubmissionAttachmentData =
  Prisma.HomeworkSubmissionAttachmentUncheckedUpdateInput;
export type SaveHomeworkSubmissionDraftResult =
  | { outcome: 'saved'; submission: HomeworkSubmissionRecord }
  | { outcome: 'already_submitted'; submission: HomeworkSubmissionRecord };
export type SubmitHomeworkSubmissionResult =
  | { outcome: 'submitted'; submission: HomeworkSubmissionRecord }
  | { outcome: 'already_submitted'; submission: HomeworkSubmissionRecord };
export type ReviewHomeworkSubmissionResult =
  | { outcome: 'reviewed'; submission: HomeworkReviewSubmissionRecord }
  | { outcome: 'not_found' }
  | { outcome: 'already_reviewed'; submission: HomeworkReviewSubmissionRecord }
  | { outcome: 'not_reviewable'; submission: HomeworkReviewSubmissionRecord };
export type ReviewHomeworkSubmissionAnswersResult =
  | { outcome: 'reviewed'; submission: HomeworkReviewSubmissionRecord }
  | { outcome: 'not_found' };

@Injectable()
export class HomeworkRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherAllocationWriteGate: TeacherAllocationOperationalWriteGate,
    @Optional() private readonly richContent?: HomeworkRichContentService,
  ) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async projectRichQuestions(
    homeworkId: string,
    questions: HomeworkRichQuestion[],
    audience: HomeworkRichAudience = 'question',
    actor?: HomeworkAssetActor,
  ): Promise<void> {
    await this.richContent?.project(homeworkId, questions, audience, actor);
  }

  private requireRichIntegration(): HomeworkRichContentService {
    if (!this.richContent) throw new NotFoundDomainException();
    return this.richContent;
  }

  async projectAuthorTypedQuestions(
    homeworkId: string,
    questions: HomeworkQuestionRecord[],
    actor?: HomeworkAssetActor,
  ): Promise<void> {
    const typed = questions.filter((question) =>
      isHomeworkTypedType(question.type),
    );
    if (!typed.length) return;
    await this.requireRichIntegration().projectTypedMediaRead(
      homeworkId,
      typed,
      actor,
    );
    if (typed.length > 200) {
      for (let offset = 0; offset < typed.length; offset += 200)
        await this.projectAuthorTypedQuestions(
          homeworkId,
          typed.slice(offset, offset + 200),
          actor,
        );
      return;
    }
    await this.scopedPrisma.$transaction(
      async (tx) => {
        if (
          !(await this.requireRichIntegration().assertAuthorRead(
            tx,
            homeworkId,
            actor,
          ))
        )
          return;
        const scope = requireHomeworkScope();
        const rows = await tx.$queryRaw<
          Array<{ id: string; value: unknown; sqlNull: boolean }>
        >`
        SELECT id, answer_key AS value, answer_key IS NULL AS "sqlNull" FROM homework_questions
        WHERE school_id = ${scope.schoolId}::uuid AND homework_assignment_id = ${homeworkId}::uuid
          AND deleted_at IS NULL AND id IN (${Prisma.join(typed.map((question) => Prisma.sql`${question.id}::uuid`))})`;
        for (const question of typed) {
          if (!isHomeworkTypedType(question.type)) continue;
          const row = rows.find((item) => item.id === question.id);
          if (row)
            attachHomeworkAuthorKey(
              question,
              normalizeHomeworkDefinition(
                question.type,
                question.metadata,
                'draft',
              ),
              row.value,
              row.sqlNull,
            );
        }
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /** Discovery holds only assignment/question locks. Escalation rolls back
   * before a fresh ST06-ordered transaction revalidates the original command. */
  private async questionMutation<T>(
    resource: { homeworkId: string; questionId?: string },
    explicitRich: boolean,
    actor: HomeworkAssetActor | undefined,
    operation: (
      tx: Prisma.TransactionClient,
      protectedWrite: boolean,
    ) => Promise<T>,
  ): Promise<T> {
    let protectedWrite = explicitRich;
    const mutate = () =>
      this.scopedPrisma.$transaction(
        async (tx) => {
          if (protectedWrite)
            await this.requireRichIntegration().assertWrite(
              tx,
              resource,
              actor,
            );
          const scope = requireHomeworkScope();
          const assignment = await tx.$queryRaw<
            Array<{ id: string; status: HomeworkAssignmentStatus }>
          >`SELECT id, status FROM homework_assignments
        WHERE id = ${resource.homeworkId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
          if (!assignment.length)
            throw new HomeworkQuestionNotFoundException(resource);
          if (assignment[0].status !== 'DRAFT')
            throw new HomeworkQuestionReadOnlyException();
          if (resource.questionId) {
            const question = await tx.$queryRaw<
              Array<{ id: string; type: string }>
            >`SELECT id, type FROM homework_questions
          WHERE id = ${resource.questionId}::uuid AND homework_assignment_id = ${resource.homeworkId}::uuid
            AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
            if (!question.length)
              throw new HomeworkQuestionNotFoundException(resource);
            if (!protectedWrite && isHomeworkTypedType(question[0].type))
              throw new HomeworkRichAuthorizationRequired();
          }
          return operation(tx, protectedWrite);
        },
        { maxWait: 5000, timeout: 15000 },
      );
    try {
      return await mutate();
    } catch (error) {
      if (!(error instanceof HomeworkRichAuthorizationRequired)) throw error;
      protectedWrite = true;
      return mutate();
    }
  }

  private async lockEditableStudentTarget(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      homeworkAssignmentId: string;
      homeworkTargetId: string;
      studentId?: string;
      enrollmentId?: string;
    },
    readOnlyError?: () => Error,
    allowExistingSubmitted = false,
  ): Promise<HomeworkTargetForSubmissionRecord> {
    const scope = requireHomeworkScope();
    if (scope.schoolId !== input.schoolId) {
      throw new HomeworkSubmissionTargetNotFoundException();
    }
    // Every student writer locks the assignment before the target. The target
    // serializes even the first submission, when no submission row exists yet.
    await tx.$queryRaw`
      SELECT id FROM homework_assignments
      WHERE id = ${input.homeworkAssignmentId}::uuid
        AND school_id = ${scope.schoolId}::uuid FOR SHARE
    `;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM homework_targets t
      JOIN homework_assignments a ON a.id = t.homework_assignment_id AND a.school_id = t.school_id
      JOIN students s ON s.id = t.student_id AND s.school_id = t.school_id
      JOIN student_enrollments e ON e.id = t.enrollment_id AND e.school_id = t.school_id AND e.student_id = s.id
      WHERE t.id = ${input.homeworkTargetId}::uuid AND t.school_id = ${scope.schoolId}::uuid
        AND a.id = ${input.homeworkAssignmentId}::uuid AND a.deleted_at IS NULL
        AND s.deleted_at IS NULL AND s.status = 'ACTIVE'
        AND e.deleted_at IS NULL AND e.ended_at IS NULL AND e.status = 'ACTIVE'
        AND e.classroom_id = a.classroom_id AND e.academic_year_id = a.academic_year_id
        AND (e.term_id IS NULL OR e.term_id = a.term_id)
        ${scope.userType === 'STUDENT' ? Prisma.sql`AND s.user_id = ${scope.actorId}::uuid` : Prisma.empty}
      FOR UPDATE OF t FOR SHARE OF s, e
    `;
    if (rows.length)
      await tx.$queryRaw`SELECT id FROM homework_submissions
      WHERE homework_target_id = ${input.homeworkTargetId}::uuid
        AND school_id = ${scope.schoolId}::uuid AND status = 'DRAFT' FOR UPDATE`;
    const target = rows.length
      ? await tx.homeworkTarget.findFirst({
          where: {
            id: input.homeworkTargetId,
            schoolId: scope.schoolId,
            homeworkAssignmentId: input.homeworkAssignmentId,
            studentId: input.studentId,
            enrollmentId: input.enrollmentId,
          },
          ...HOMEWORK_TARGET_FOR_SUBMISSION_ARGS,
        })
      : null;
    if (!target) throw new HomeworkSubmissionTargetNotFoundException();
    const current = target.submissions[0];
    if (
      current &&
      (current.homeworkAssignmentId !== target.homeworkAssignmentId ||
        current.studentId !== target.studentId ||
        current.enrollmentId !== target.enrollmentId)
    )
      throw new HomeworkSubmissionTargetNotFoundException();
    if (
      ['SUBMITTED', 'LATE', 'REVIEWED'].includes(target.status) ||
      (current && current.status !== 'DRAFT')
    ) {
      if (allowExistingSubmitted && current && current.status !== 'DRAFT')
        return target;
      throw (
        readOnlyError?.() ?? new HomeworkSubmissionAlreadySubmittedException()
      );
    }
    if (
      target.homeworkAssignment.status !== 'PUBLISHED' ||
      ['MISSING', 'EXCUSED'].includes(target.status)
    ) {
      throw (
        readOnlyError?.() ?? new HomeworkSubmissionNotSubmittableException()
      );
    }
    return target;
  }

  private async lockEditableSubmission(
    tx: Prisma.TransactionClient,
    submissionId: string,
    homeworkAssignmentId: string,
    readOnlyError: () => Error,
  ): Promise<HomeworkTargetForSubmissionRecord> {
    const scope = requireHomeworkScope();
    const submission = await tx.homeworkSubmission.findFirst({
      where: {
        id: submissionId,
        homeworkAssignmentId,
        schoolId: scope.schoolId,
      },
      select: { homeworkTargetId: true },
    });
    if (!submission) throw new HomeworkSubmissionTargetNotFoundException();
    const target = await this.lockEditableStudentTarget(
      tx,
      {
        schoolId: scope.schoolId,
        homeworkAssignmentId,
        homeworkTargetId: submission.homeworkTargetId,
      },
      readOnlyError,
    );
    if (target.submissions[0]?.id !== submissionId)
      throw new HomeworkSubmissionTargetNotFoundException();
    return target;
  }

  private async eligibleSubmissionAttachments(
    tx: Prisma.TransactionClient,
    target: HomeworkTargetForSubmissionRecord,
  ): Promise<boolean> {
    const submission = target.submissions[0];
    if (!submission) return false;
    // Hold both records stable through commit, including against File soft deletion.
    await tx.$queryRaw`
      SELECT sa.id FROM homework_submission_attachments sa
      JOIN files f ON f.id = sa.file_id
      WHERE sa.school_id = ${target.schoolId}::uuid
        AND sa.homework_submission_id = ${submission.id}::uuid
      ORDER BY sa.id FOR SHARE OF sa, f
    `;
    const student = await tx.student.findFirst({
      where: { id: target.studentId, schoolId: target.schoolId },
      select: { userId: true },
    });
    if (!student?.userId) return false;
    const attachment = await tx.homeworkSubmissionAttachment.findFirst({
      where: {
        schoolId: target.schoolId,
        homeworkSubmissionId: submission.id,
        homeworkAssignmentId: target.homeworkAssignmentId,
        homeworkTargetId: target.id,
        createdByUserId: student.userId,
        deletedAt: null,
        file: {
          is: {
            schoolId: target.schoolId,
            uploaderId: student.userId,
            visibility: 'PRIVATE',
            deletedAt: null,
            sizeBytes: { gt: 0 },
            bucket: { not: '' },
            objectKey: { not: '' },
            studentCredentialSecretArtifacts: { none: {} },
          },
        },
      },
      select: { id: true },
    });
    return !!attachment;
  }

  async listAssignments(
    filters: ListHomeworkAssignmentsFilters,
  ): Promise<ListHomeworkAssignmentsResult> {
    const where = this.buildListWhere(filters);
    const [items, total] = await Promise.all([
      this.scopedPrisma.homeworkAssignment.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        ...HOMEWORK_ASSIGNMENT_ARGS,
      }),
      this.scopedPrisma.homeworkAssignment.count({ where }),
    ]);

    return {
      items: await this.attachCounters(items),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async findAssignmentById(
    homeworkId: string,
  ): Promise<HomeworkAssignmentWithCounters | null> {
    const assignment = await this.scopedPrisma.homeworkAssignment.findFirst({
      where: { id: homeworkId, deletedAt: null },
      ...HOMEWORK_ASSIGNMENT_ARGS,
    });

    if (!assignment) return null;
    const [withCounters] = await this.attachCounters([assignment]);
    return withCounters;
  }

  async createAssignmentWithTargets(
    data: CreateHomeworkAssignmentData,
    targets: CreateHomeworkTargetData[],
    writeContext: HomeworkAllocationWriteContext,
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.prisma.$transaction(async (tx) => {
      const [allocation] = await this.teacherAllocationWriteGate.lock(tx, {
        schoolId: writeContext.schoolId,
        allocationIds: [writeContext.allocationId],
        expectedTeacherUserId: writeContext.expectedTeacherUserId,
      });

      await tx.homeworkAssignment.create({
        data: {
          ...data,
          termId: allocation.termId,
          teacherSubjectAllocationId: allocation.id,
          teacherUserId: allocation.teacherUserId,
          classroomId: allocation.classroomId,
          subjectId: allocation.subjectId,
        },
      });
      if (targets.length > 0) {
        await tx.homeworkTarget.createMany({ data: targets });
      }
    });

    return this.findMutationResult(String(data.id));
  }

  async updateAssignmentWithTargets(
    homeworkId: string,
    data: UpdateHomeworkAssignmentData,
    targets: CreateHomeworkTargetData[],
    writeContext: HomeworkAllocationWriteContext,
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.homeworkAssignment.findFirst({
        where: {
          id: homeworkId,
          schoolId: writeContext.schoolId,
          deletedAt: null,
        },
        select: { teacherSubjectAllocationId: true },
      });
      const allocations = await this.teacherAllocationWriteGate.lock(tx, {
        schoolId: writeContext.schoolId,
        allocationIds: [
          ...(existing ? [existing.teacherSubjectAllocationId] : []),
          writeContext.allocationId,
        ],
        expectedTeacherUserId: writeContext.expectedTeacherUserId,
      });
      const allocation = allocations.find(
        (candidate) => candidate.id === writeContext.allocationId,
      );
      if (!allocation) {
        throw new Error('Homework target allocation was not locked');
      }

      await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id = ${homeworkId}::uuid AND school_id = ${writeContext.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
      const current = await tx.homeworkAssignment.findFirst({
        where: {
          id: homeworkId,
          schoolId: writeContext.schoolId,
          deletedAt: null,
        },
        select: { status: true },
      });
      if (!current) throw new HomeworkAssignmentNotFoundException();
      if (current.status !== 'DRAFT')
        throw new HomeworkAssignmentNotMutableException();

      await tx.homeworkTarget.deleteMany({
        where: {
          schoolId: writeContext.schoolId,
          homeworkAssignmentId: homeworkId,
        },
      });
      await tx.homeworkAssignment.updateMany({
        where: {
          id: homeworkId,
          schoolId: writeContext.schoolId,
          deletedAt: null,
        },
        data: {
          ...(data as Prisma.HomeworkAssignmentUncheckedUpdateManyInput),
          termId: allocation.termId,
          teacherSubjectAllocationId: allocation.id,
          teacherUserId: allocation.teacherUserId,
          classroomId: allocation.classroomId,
          subjectId: allocation.subjectId,
        },
      });
      if (targets.length > 0) {
        await tx.homeworkTarget.createMany({ data: targets });
      }
    });

    return this.findMutationResult(homeworkId);
  }

  async updateAssignmentGradeAssessmentLink(
    homeworkId: string,
    gradeAssessmentId: string,
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.homeworkAssignment.updateMany({
      where: { id: homeworkId, deletedAt: null },
      data: { gradeAssessmentId },
    });

    return this.findMutationResult(homeworkId);
  }

  async findAssignmentByGradeAssessmentId(
    gradeAssessmentId: string,
  ): Promise<HomeworkAssignmentWithCounters | null> {
    const assignment = await this.scopedPrisma.homeworkAssignment.findFirst({
      where: { gradeAssessmentId, deletedAt: null },
      ...HOMEWORK_ASSIGNMENT_ARGS,
    });

    if (!assignment) return null;
    const [withCounters] = await this.attachCounters([assignment]);
    return withCounters;
  }

  async replaceTargets(
    homeworkId: string,
    targets: CreateHomeworkTargetData[],
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.$transaction(
      async (tx) => {
        await this.requireRichIntegration().assertWrite(
          tx,
          { homeworkId },
          undefined,
          'homework.targets.manage',
        );
        const current = await tx.homeworkAssignment.findFirst({
          where: { id: homeworkId, deletedAt: null },
          select: { status: true },
        });
        if (!current) throw new HomeworkAssignmentNotFoundException();
        if (current.status !== 'DRAFT')
          throw new HomeworkAssignmentNotMutableException();
        const scope = requireHomeworkScope();
        if (
          targets.some(
            (target) =>
              target.schoolId !== scope.schoolId ||
              target.homeworkAssignmentId !== homeworkId,
          )
        )
          throw new HomeworkAssignmentTargetConflictException();
        await tx.homeworkTarget.deleteMany({
          where: { homeworkAssignmentId: homeworkId },
        });
        if (targets.length > 0)
          await tx.homeworkTarget.createMany({ data: targets });
      },
      { maxWait: 5000, timeout: 15000 },
    );

    return this.findMutationResult(homeworkId);
  }

  async publishAssignmentWithTargets(
    homeworkId: string,
    data: Pick<
      Prisma.HomeworkAssignmentUncheckedUpdateInput,
      'status' | 'publishedAt' | 'publishedByUserId'
    >,
    targets: CreateHomeworkTargetData[],
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.$transaction(
      async (tx) => {
        const scope = requireHomeworkScope();
        await this.requireRichIntegration().assertWrite(
          tx,
          { homeworkId },
          undefined,
          'homework.assignments.manage',
        );
        // The protected author boundary already acquired allocation before assignment.
        // All question/option writers use this same parent serialization.
        const assignment = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM homework_assignments
        WHERE id = ${homeworkId}::uuid AND school_id = ${scope.schoolId}::uuid
          AND deleted_at IS NULL FOR UPDATE
      `;
        if (!assignment.length) throw new HomeworkAssignmentNotFoundException();
        const current = await tx.homeworkAssignment.findFirstOrThrow({
          where: { id: homeworkId, deletedAt: null },
          select: {
            status: true,
            dueAt: true,
            publishAt: true,
            classroomId: true,
            academicYearId: true,
            termId: true,
            targetMode: true,
          },
        });
        assertHomeworkPublicationState(current);
        await tx.$queryRaw`SELECT id FROM homework_questions WHERE homework_assignment_id = ${homeworkId}::uuid AND school_id = ${scope.schoolId}::uuid ORDER BY id FOR SHARE`;
        await tx.$queryRaw`SELECT o.id FROM homework_question_options o JOIN homework_questions q ON q.id=o.homework_question_id AND q.school_id=o.school_id WHERE q.homework_assignment_id = ${homeworkId}::uuid AND q.school_id = ${scope.schoolId}::uuid ORDER BY o.id FOR SHARE OF o`;
        const questions = await tx.homeworkQuestion.findMany({
          where: { homeworkAssignmentId: homeworkId, deletedAt: null },
          select: HOMEWORK_QUESTION_SELECT,
          orderBy: { id: 'asc' },
        });
        assertHomeworkRuntimeQuestions(questions);
        validateHomeworkPublicationStructures(questions);
        const keys = await tx.$queryRaw<
          Array<{ id: string; value: unknown; sqlNull: boolean }>
        >`
          SELECT id, answer_key AS value, answer_key IS NULL AS "sqlNull" FROM homework_questions
          WHERE school_id = ${scope.schoolId}::uuid AND homework_assignment_id = ${homeworkId}::uuid AND deleted_at IS NULL`;
        for (const question of questions) {
          if (!isHomeworkTypedType(question.type)) continue;
          const typedType = question.type;
          const definition = homeworkTypedQuestionValidation(() =>
            normalizeHomeworkDefinition(
              typedType,
              question.metadata,
              'complete',
            ),
          );
          const key = keys.find((row) => row.id === question.id);
          if (
            !key ||
            question.expectedAnswer !== null ||
            classifyStoredHomeworkPrivateAnswerKey(
              definition,
              key.value,
              key.sqlNull,
            ).state === 'invalid'
          )
            throw new HomeworkAssignmentInvalidQuestionStructureException({
              reason: 'invalid_typed_definition_or_key',
            });
          if (definition.kind === 'media' && definition.source)
            await this.requireRichIntegration().assertMediaSource(
              tx,
              {
                homeworkId,
                questionId: question.id,
                assetId: definition.source.assetId,
              },
              undefined,
              true,
            );
        }
        await this.requireRichIntegration().assertPublicationDisplay(
          tx,
          homeworkId,
          questions,
        );
        const eligible = await tx.$queryRaw<
          Array<{ enrollmentId: string; studentId: string }>
        >`
          SELECT e.id AS "enrollmentId", s.id AS "studentId" FROM student_enrollments e JOIN students s ON s.id=e.student_id AND s.school_id=e.school_id
          WHERE e.school_id = ${scope.schoolId}::uuid AND e.classroom_id = ${current.classroomId}::uuid AND e.academic_year_id = ${current.academicYearId}::uuid
            AND e.term_id = ${current.termId}::uuid AND e.status='ACTIVE' AND e.deleted_at IS NULL AND e.ended_at IS NULL
            AND s.status='ACTIVE' AND s.deleted_at IS NULL ORDER BY e.id FOR SHARE OF e,s`;
        if (
          !targets.length ||
          targets.some(
            (target) =>
              target.schoolId !== scope.schoolId ||
              target.homeworkAssignmentId !== homeworkId ||
              !eligible.some(
                (row) =>
                  row.enrollmentId === target.enrollmentId &&
                  row.studentId === target.studentId,
              ),
          )
        )
          throw new HomeworkAssignmentTargetConflictException();
        if (
          current.targetMode === 'CLASSROOM' &&
          targets.length !== eligible.length
        )
          throw new HomeworkAssignmentTargetConflictException();
        if (current.targetMode === 'SELECTED_STUDENTS') {
          const selected = await tx.homeworkTarget.findMany({
            where: { homeworkAssignmentId: homeworkId },
            select: { studentId: true },
          });
          if (
            selected.length !== targets.length ||
            selected.some(
              (row) =>
                !targets.some((target) => target.studentId === row.studentId),
            )
          )
            throw new HomeworkAssignmentTargetConflictException();
        }
        await tx.homeworkTarget.deleteMany({
          where: { homeworkAssignmentId: homeworkId },
        });
        if (targets.length > 0)
          await tx.homeworkTarget.createMany({ data: targets });
        await tx.homeworkAssignment.updateMany({
          where: { id: homeworkId, deletedAt: null },
          data: data as Prisma.HomeworkAssignmentUncheckedUpdateManyInput,
        });
      },
      { maxWait: 5000, timeout: 15000 },
    );

    return this.findMutationResult(homeworkId);
  }

  async updateAssignmentStatus(
    homeworkId: string,
    data: Pick<
      Prisma.HomeworkAssignmentUncheckedUpdateInput,
      'status' | 'closedAt' | 'cancelledAt'
    >,
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.homeworkAssignment.updateMany({
      where: { id: homeworkId, deletedAt: null },
      data: data as Prisma.HomeworkAssignmentUncheckedUpdateManyInput,
    });

    return this.findMutationResult(homeworkId);
  }

  listTargets(homeworkId: string): Promise<HomeworkTargetRecord[]> {
    return this.scopedPrisma.homeworkTarget.findMany({
      where: { homeworkAssignmentId: homeworkId },
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      ...HOMEWORK_TARGET_ARGS,
    });
  }

  listQuestions(homeworkId: string): Promise<HomeworkQuestionRecord[]> {
    return this.scopedPrisma.homeworkQuestion.findMany({
      where: { homeworkAssignmentId: homeworkId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: HOMEWORK_QUESTION_SELECT,
    });
  }

  findQuestionById(input: {
    homeworkId: string;
    questionId: string;
  }): Promise<HomeworkQuestionRecord | null> {
    return this.scopedPrisma.homeworkQuestion.findFirst({
      where: {
        id: input.questionId,
        homeworkAssignmentId: input.homeworkId,
        deletedAt: null,
      },
      select: HOMEWORK_QUESTION_SELECT,
    });
  }

  async getNextQuestionSortOrder(homeworkId: string): Promise<number> {
    const result = await this.scopedPrisma.homeworkQuestion.aggregate({
      where: { homeworkAssignmentId: homeworkId, deletedAt: null },
      _max: { sortOrder: true },
    });

    return (result._max.sortOrder ?? -1) + 1;
  }

  async createQuestionWithOptions(input: {
    question: CreateHomeworkQuestionData;
    options: CreateHomeworkQuestionOptionData[];
    actor?: HomeworkAssetActor;
    keyWrite?: unknown;
  }): Promise<HomeworkQuestionRecord> {
    assertHomeworkRuntimeQuestionType(input.question.type);
    const homeworkId = String(input.question.homeworkAssignmentId);
    const questionId = String(input.question.id);
    {
      await this.questionMutation(
        { homeworkId },
        true,
        input.actor,
        async (tx) => {
          const typed = isHomeworkTypedType(input.question.type)
            ? normalizeHomeworkTypedQuestionMutation({
                type: input.question.type,
                metadata: input.question.metadata,
                expectedAnswer: input.question.expectedAnswer,
                optionCount: input.options.length,
                keyWrite: input.keyWrite,
              })
            : null;
          if (!typed && input.keyWrite !== undefined)
            throw new HomeworkQuestionInvalidTypePayloadException({
              reason: 'key_requires_typed_question',
            });
          const questionPlan = homeworkRichChange(
            'homeworkQuestion',
            input.question,
          );
          const options = input.options.map((option) => ({
            option,
            plan: homeworkRichChange('homeworkOption', option),
          }));
          await tx.homeworkQuestion.create({
            data: {
              ...input.question,
              ...(typed
                ? { metadata: typed.metadata, answerKey: typed.answerKey }
                : {}),
              ...richStorage(questionPlan),
            } as Prisma.HomeworkQuestionUncheckedCreateInput,
          });
          if (typed?.definition.kind === 'media' && typed.definition.source)
            await this.requireRichIntegration().assertMediaSource(
              tx,
              {
                homeworkId,
                questionId,
                assetId: typed.definition.source.assetId,
              },
              input.actor,
            );
          if (options.length)
            await tx.homeworkQuestionOption.createMany({
              data: options.map(
                ({ option, plan }) =>
                  ({
                    ...option,
                    ...richStorage(plan),
                  }) as Prisma.HomeworkQuestionOptionUncheckedCreateInput,
              ),
            });
          if (questionPlan.action === 'write' && questionPlan.richContent)
            await this.requireRichIntegration().assertReferences(
              tx,
              homeworkId,
              questionId,
              questionPlan.richContent,
            );
          for (const { option, plan } of options)
            if (plan.action === 'write' && plan.richContent)
              await this.requireRichIntegration().assertReferences(
                tx,
                homeworkId,
                questionId,
                plan.richContent,
                String(option.id),
              );
        },
      );
      return this.findQuestionMutationResult({ homeworkId, questionId });
    }
  }

  async updateQuestion(input: {
    homeworkId: string;
    questionId: string;
    data: UpdateHomeworkQuestionData;
    actor?: HomeworkAssetActor;
    keyWrite?: unknown;
    typedMutation?: boolean;
  }): Promise<HomeworkQuestionRecord> {
    await this.questionMutation(
      input,
      input.data.richContent !== undefined ||
        input.typedMutation === true ||
        isHomeworkTypedType(input.data.type) ||
        input.keyWrite !== undefined,
      input.actor,
      async (tx, protectedWrite) => {
        const current = await tx.homeworkQuestion.findFirst({
          where: {
            id: input.questionId,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
          },
          select: HOMEWORK_QUESTION_SELECT,
        });
        if (!current) throw new HomeworkQuestionNotFoundException(input);
        assertHomeworkRuntimeQuestionType(current.type);
        assertHomeworkRuntimeQuestionType(
          typeof input.data.type === 'string'
            ? input.data.type
            : (input.data.type?.set ?? current.type),
        );
        const nextTypedType =
          typeof input.data.type === 'string'
            ? input.data.type
            : (input.data.type?.set ?? current.type);
        const typedMutation =
          isHomeworkTypedType(current.type) ||
          isHomeworkTypedType(nextTypedType);
        if (typedMutation && !protectedWrite)
          throw new HomeworkRichAuthorizationRequired();
        const typedData: Pick<
          Prisma.HomeworkQuestionUncheckedUpdateManyInput,
          'metadata' | 'answerKey'
        > = {};
        if (current.type !== nextTypedType && typedMutation) {
          const [relationships] = await tx.$queryRaw<
            Array<{ present: boolean }>
          >`
            SELECT (EXISTS (SELECT 1 FROM homework_question_options WHERE homework_question_id = ${current.id}::uuid AND school_id = ${current.schoolId}::uuid)
              OR EXISTS (SELECT 1 FROM homework_submission_answers WHERE homework_question_id = ${current.id}::uuid AND school_id = ${current.schoolId}::uuid)
              OR EXISTS (SELECT 1 FROM homework_question_assets WHERE homework_question_id = ${current.id}::uuid AND school_id = ${current.schoolId}::uuid)) AS present`;
          if (relationships.present)
            throw new HomeworkQuestionInvalidTypePayloadException({
              reason: 'type_transition_has_relationships',
            });
        }
        if (typedMutation) {
          const [key] = await tx.$queryRaw<
            Array<{ value: unknown; sqlNull: boolean }>
          >`
            SELECT answer_key AS value, answer_key IS NULL AS "sqlNull" FROM homework_questions
            WHERE id = ${current.id}::uuid AND school_id = ${current.schoolId}::uuid AND homework_assignment_id = ${input.homeworkId}::uuid AND deleted_at IS NULL`;
          if (!key) throw new HomeworkQuestionNotFoundException();
          if (isHomeworkTypedType(nextTypedType)) {
            const typed = normalizeHomeworkTypedQuestionMutation({
              type: nextTypedType,
              metadata:
                input.data.metadata === undefined
                  ? current.metadata
                  : input.data.metadata,
              expectedAnswer:
                input.data.expectedAnswer === undefined
                  ? current.expectedAnswer
                  : input.data.expectedAnswer,
              optionCount: current.options.length,
              keyWrite: input.keyWrite,
              currentKey: key,
            });
            typedData.metadata = typed.metadata;
            typedData.answerKey = typed.answerKey;
            if (typed.definition.kind === 'media' && typed.definition.source)
              await this.requireRichIntegration().assertMediaSource(
                tx,
                {
                  homeworkId: input.homeworkId,
                  questionId: current.id,
                  assetId: typed.definition.source.assetId,
                },
                input.actor,
              );
          } else {
            if (
              input.data.metadata === undefined ||
              (!key.sqlNull && input.keyWrite === undefined)
            )
              throw new HomeworkQuestionInvalidTypePayloadException({
                reason: 'type_transition_requires_explicit_clear',
              });
            if (
              input.keyWrite !== undefined &&
              homeworkTypedQuestionValidation(() =>
                normalizeHomeworkTypedWrite(input.keyWrite),
              ).state !== 'clear'
            )
              throw new HomeworkQuestionInvalidTypePayloadException({
                reason: 'legacy_question_key_forbidden',
              });
            typedData.answerKey = Prisma.DbNull;
          }
        } else if (input.keyWrite !== undefined)
          throw new HomeworkQuestionInvalidTypePayloadException({
            reason: 'key_requires_typed_question',
          });
        const plan = homeworkRichChange(
          'homeworkQuestion',
          input.data,
          current,
        );
        if (
          !protectedWrite &&
          plan.action === 'write' &&
          plan.richContent === null &&
          (await tx.homeworkQuestion.count({
            where: { id: current.id, richContent: { not: Prisma.DbNull } },
          }))
        )
          throw new HomeworkRichAuthorizationRequired();
        const nextType =
          typeof input.data.type === 'string'
            ? input.data.type
            : (input.data.type?.set ?? current.type);
        if (
          protectedWrite &&
          !['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(
            nextType,
          ) &&
          current.options.length
        )
          throw new HomeworkQuestionInvalidTypePayloadException({
            reason: 'text_question_cannot_keep_options',
          });
        const changed = await tx.homeworkQuestion.updateMany({
          where: {
            id: current.id,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
          },
          data: {
            ...input.data,
            ...typedData,
            ...richStorage(plan),
          } as Prisma.HomeworkQuestionUncheckedUpdateManyInput,
        });
        if (changed.count !== 1)
          throw new HomeworkQuestionNotFoundException(input);
        if (plan.action === 'write' && plan.richContent)
          await this.requireRichIntegration().assertReferences(
            tx,
            input.homeworkId,
            input.questionId,
            plan.richContent,
          );
      },
    );

    return this.findQuestionMutationResult(input);
  }

  async softDeleteQuestion(input: {
    homeworkId: string;
    questionId: string;
    actor?: HomeworkAssetActor;
  }): Promise<void> {
    const deletedAt = new Date();
    await this.questionMutation(
      input,
      false,
      input.actor,
      async (tx, protectedWrite) => {
        if (
          !protectedWrite &&
          ((await tx.homeworkQuestion.count({
            where: {
              id: input.questionId,
              richContent: { not: Prisma.DbNull },
            },
          })) ||
            (await tx.homeworkQuestionOption.count({
              where: {
                homeworkQuestionId: input.questionId,
                deletedAt: null,
                richContent: { not: Prisma.DbNull },
              },
            })))
        )
          throw new HomeworkRichAuthorizationRequired();
        await tx.homeworkQuestion.updateMany({
          where: {
            id: input.questionId,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
          },
          data: { deletedAt },
        });
        await tx.homeworkQuestionOption.updateMany({
          where: {
            homeworkQuestionId: input.questionId,
            deletedAt: null,
          },
          data: { deletedAt },
        });
      },
    );
  }

  async getNextOptionSortOrder(questionId: string): Promise<number> {
    const result = await this.scopedPrisma.homeworkQuestionOption.aggregate({
      where: { homeworkQuestionId: questionId, deletedAt: null },
      _max: { sortOrder: true },
    });

    return (result._max.sortOrder ?? -1) + 1;
  }

  findQuestionOptionById(input: {
    homeworkId: string;
    questionId: string;
    optionId: string;
  }): Promise<HomeworkQuestionOptionRecord | null> {
    return this.scopedPrisma.homeworkQuestionOption.findFirst({
      where: {
        id: input.optionId,
        homeworkQuestionId: input.questionId,
        deletedAt: null,
        homeworkQuestion: {
          is: {
            id: input.questionId,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
          },
        },
      },
      select: HOMEWORK_QUESTION_OPTION_SELECT,
    });
  }

  async createQuestionOption(input: {
    homeworkId: string;
    data: CreateHomeworkQuestionOptionData;
    actor?: HomeworkAssetActor;
  }): Promise<HomeworkQuestionRecord> {
    const questionId = String(input.data.homeworkQuestionId);
    {
      await this.questionMutation(
        { homeworkId: input.homeworkId, questionId },
        true,
        input.actor,
        async (tx) => {
          const question = await tx.homeworkQuestion.findFirst({
            where: {
              id: questionId,
              homeworkAssignmentId: input.homeworkId,
              deletedAt: null,
            },
            select: { type: true },
          });
          if (
            !question ||
            !['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(
              question.type,
            )
          )
            throw new HomeworkQuestionInvalidTypePayloadException({
              reason: 'options_forbidden_for_text_question',
            });
          const plan = homeworkRichChange('homeworkOption', input.data);
          await tx.homeworkQuestionOption.create({
            data: {
              ...input.data,
              ...richStorage(plan),
            } as Prisma.HomeworkQuestionOptionUncheckedCreateInput,
          });
          if (plan.action === 'write' && plan.richContent)
            await this.requireRichIntegration().assertReferences(
              tx,
              input.homeworkId,
              questionId,
              plan.richContent,
              String(input.data.id),
            );
        },
      );
    }

    return this.findQuestionMutationResult({
      homeworkId: input.homeworkId,
      questionId: String(input.data.homeworkQuestionId),
    });
  }

  async updateQuestionOption(input: {
    homeworkId: string;
    questionId: string;
    optionId: string;
    data: UpdateHomeworkQuestionOptionData;
    actor?: HomeworkAssetActor;
  }): Promise<HomeworkQuestionRecord> {
    await this.questionMutation(
      input,
      input.data.richContent !== undefined,
      input.actor,
      async (tx, protectedWrite) => {
        const scope = requireHomeworkScope();
        await tx.$queryRaw`SELECT id FROM homework_question_options WHERE id = ${input.optionId}::uuid
        AND homework_question_id = ${input.questionId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
        const current = await tx.homeworkQuestionOption.findFirst({
          where: {
            id: input.optionId,
            homeworkQuestionId: input.questionId,
            deletedAt: null,
          },
          select: HOMEWORK_QUESTION_OPTION_SELECT,
        });
        if (!current) throw new HomeworkQuestionOptionNotFoundException(input);
        const plan = homeworkRichChange('homeworkOption', input.data, current);
        if (
          !protectedWrite &&
          plan.action === 'write' &&
          plan.richContent === null &&
          (await tx.homeworkQuestionOption.count({
            where: { id: current.id, richContent: { not: Prisma.DbNull } },
          }))
        )
          throw new HomeworkRichAuthorizationRequired();
        {
          const question = await tx.homeworkQuestion.findFirst({
            where: { id: input.questionId },
            select: { type: true },
          });
          if (
            !question ||
            !['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(
              question.type,
            )
          )
            throw new HomeworkQuestionInvalidTypePayloadException({
              reason: 'options_forbidden_for_text_question',
            });
        }
        const changed = await tx.homeworkQuestionOption.updateMany({
          where: {
            id: current.id,
            homeworkQuestionId: input.questionId,
            deletedAt: null,
          },
          data: {
            ...input.data,
            ...richStorage(plan),
          } as Prisma.HomeworkQuestionOptionUncheckedUpdateManyInput,
        });
        if (changed.count !== 1)
          throw new HomeworkQuestionOptionNotFoundException(input);
        if (plan.action === 'write' && plan.richContent)
          await this.requireRichIntegration().assertReferences(
            tx,
            input.homeworkId,
            input.questionId,
            plan.richContent,
            input.optionId,
          );
      },
    );

    return this.findQuestionMutationResult(input);
  }

  async softDeleteQuestionOption(input: {
    homeworkId: string;
    questionId: string;
    optionId: string;
    actor?: HomeworkAssetActor;
  }): Promise<HomeworkQuestionRecord> {
    await this.questionMutation(
      input,
      false,
      input.actor,
      async (tx, protectedWrite) => {
        const question = await tx.homeworkQuestion.findFirst({
          where: {
            id: input.questionId,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
          },
          select: { type: true },
        });
        if (
          !question ||
          !['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(
            question.type,
          )
        )
          throw new HomeworkQuestionInvalidTypePayloadException({
            reason: 'options_forbidden_for_text_question',
          });
        const scope = requireHomeworkScope();
        const locked = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM homework_question_options WHERE id = ${input.optionId}::uuid
        AND homework_question_id = ${input.questionId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (!locked.length)
          throw new HomeworkQuestionOptionNotFoundException(input);
        if (
          !protectedWrite &&
          (await tx.homeworkQuestionOption.count({
            where: { id: input.optionId, richContent: { not: Prisma.DbNull } },
          }))
        )
          throw new HomeworkRichAuthorizationRequired();
        await tx.homeworkQuestionOption.updateMany({
          where: {
            id: input.optionId,
            homeworkQuestionId: input.questionId,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
      },
    );

    return this.findQuestionMutationResult(input);
  }

  listAttachments(homeworkId: string): Promise<HomeworkAttachmentRecord[]> {
    return this.scopedPrisma.homeworkAssignmentAttachment.findMany({
      where: { homeworkAssignmentId: homeworkId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: HOMEWORK_ATTACHMENT_SELECT,
    });
  }

  findAttachmentById(input: {
    homeworkId: string;
    attachmentId: string;
  }): Promise<HomeworkAttachmentRecord | null> {
    return this.scopedPrisma.homeworkAssignmentAttachment.findFirst({
      where: {
        id: input.attachmentId,
        homeworkAssignmentId: input.homeworkId,
        deletedAt: null,
      },
      select: HOMEWORK_ATTACHMENT_SELECT,
    });
  }

  async getNextAttachmentSortOrder(homeworkId: string): Promise<number> {
    const result =
      await this.scopedPrisma.homeworkAssignmentAttachment.aggregate({
        where: { homeworkAssignmentId: homeworkId, deletedAt: null },
        _max: { sortOrder: true },
      });

    return (result._max.sortOrder ?? -1) + 1;
  }

  async findAttachmentFile(fileId: string): Promise<{
    id: string;
    schoolId: string | null;
    uploaderId: string | null;
    deletedAt: Date | null;
  } | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, schoolId: true, uploaderId: true, deletedAt: true },
    });
  }

  async createAttachment(
    data: CreateHomeworkAttachmentData,
  ): Promise<HomeworkAttachmentRecord> {
    const attachment =
      await this.scopedPrisma.homeworkAssignmentAttachment.create({
        data,
        select: HOMEWORK_ATTACHMENT_SELECT,
      });

    return attachment;
  }

  async updateAttachment(input: {
    homeworkId: string;
    attachmentId: string;
    data: UpdateHomeworkAttachmentData;
  }): Promise<HomeworkAttachmentRecord> {
    await this.scopedPrisma.homeworkAssignmentAttachment.updateMany({
      where: {
        id: input.attachmentId,
        homeworkAssignmentId: input.homeworkId,
        deletedAt: null,
      },
      data: input.data as Prisma.HomeworkAssignmentAttachmentUncheckedUpdateManyInput,
    });

    return this.findAttachmentMutationResult(input);
  }

  async softDeleteAttachment(input: {
    homeworkId: string;
    attachmentId: string;
  }): Promise<void> {
    await this.scopedPrisma.homeworkAssignmentAttachment.updateMany({
      where: {
        id: input.attachmentId,
        homeworkAssignmentId: input.homeworkId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
  }

  findSubmissionById(input: {
    homeworkAssignmentId: string;
    submissionId: string;
  }): Promise<HomeworkSubmissionRecord | null> {
    return this.scopedPrisma.homeworkSubmission.findFirst({
      where: {
        id: input.submissionId,
        homeworkAssignmentId: input.homeworkAssignmentId,
      },
      ...HOMEWORK_SUBMISSION_ARGS,
    });
  }

  listSubmissionAnswers(input: {
    homeworkAssignmentId: string;
    submissionId: string;
  }): Promise<HomeworkSubmissionAnswerRecord[]> {
    return this.scopedPrisma.homeworkSubmissionAnswer.findMany({
      where: {
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkSubmissionId: input.submissionId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: HOMEWORK_SUBMISSION_ANSWER_SELECT,
    });
  }

  findSubmissionAnswerById(input: {
    homeworkAssignmentId: string;
    submissionId: string;
    answerId: string;
  }): Promise<HomeworkSubmissionAnswerRecord | null> {
    return this.scopedPrisma.homeworkSubmissionAnswer.findFirst({
      where: {
        id: input.answerId,
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkSubmissionId: input.submissionId,
        deletedAt: null,
      },
      select: HOMEWORK_SUBMISSION_ANSWER_SELECT,
    });
  }

  private async assertFinalTypedAnswers(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    submissionId: string,
    questions: HomeworkQuestionRecord[],
  ): Promise<void> {
    const stored = await readHomeworkTypedAnswers(
      tx,
      homeworkId,
      submissionId,
      questions.map((question) => question.id),
    );
    if (new Set(stored.map((row) => row.questionId)).size !== stored.length)
      throw new HomeworkAnswerInvalidPayloadException({
        reason: 'duplicate_stored_answers',
      });
    for (const question of questions) {
      const answer = stored.find((row) => row.questionId === question.id);
      normalizeAnswerForQuestion({
        question,
        final: true,
        existing: answer,
        input: {
          questionId: question.id,
          textAnswer: answer?.textAnswer,
          selectedOptionIds: Array.isArray(answer?.selectedOptionIds)
            ? answer.selectedOptionIds.filter(
                (id): id is string => typeof id === 'string',
              )
            : null,
          ...(isHomeworkTypedType(question.type) &&
          question.type !== 'MEDIA' &&
          answer &&
          !answer.answerJsonSqlNull
            ? { answerJson: answer.answerJson }
            : {}),
        },
      });
    }
  }

  private async lockTypedReview(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    targetId: string,
    submissionId: string,
    allowReviewed = false,
  ): Promise<HomeworkReviewSubmissionRecord> {
    const scope = requireHomeworkScope();
    await this.requireRichIntegration().assertReviewWrite(
      tx,
      homeworkId,
      allowReviewed && scope.userType !== 'TEACHER'
        ? 'homework.assignments.manage'
        : 'homework.submissions.review',
    );
    await tx.$queryRaw`SELECT id FROM homework_targets WHERE id=${targetId}::uuid AND school_id=${scope.schoolId}::uuid AND homework_assignment_id=${homeworkId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM homework_submissions WHERE id=${submissionId}::uuid AND school_id=${scope.schoolId}::uuid AND homework_assignment_id=${homeworkId}::uuid AND homework_target_id=${targetId}::uuid FOR UPDATE`;
    const current = await tx.homeworkSubmission.findFirst({
      where: {
        id: submissionId,
        schoolId: scope.schoolId,
        homeworkAssignmentId: homeworkId,
        homeworkTargetId: targetId,
      },
      ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
    });
    if (!current) throw new HomeworkAnswerReviewInvalidScopeException();
    if (allowReviewed && current.status === 'REVIEWED') return current;
    if (
      !['PUBLISHED', 'CLOSED'].includes(current.homeworkAssignment.status) ||
      !['SUBMITTED', 'LATE'].includes(current.status)
    )
      throw new HomeworkAnswerReviewReadOnlyException();
    await this.assertFinalTypedAnswers(
      tx,
      homeworkId,
      submissionId,
      current.homeworkAssignment.questions,
    );
    return current;
  }

  async projectTypedAnswers(
    homeworkId: string,
    answers: HomeworkSubmissionAnswerRecord[],
  ): Promise<void> {
    await projectHomeworkTypedAnswers(this.scopedPrisma, homeworkId, answers);
  }

  /** One target lock serializes the first draft, all answer writes and final submit. */
  async mutateTypedStudentSubmission(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    answers: HomeworkAnswerInput[];
    finalAnswers: boolean;
    bodyText?: string | null;
    permission:
      | 'homework.answers.manage'
      | 'homework.submissions.save'
      | 'homework.submissions.submit';
    finalize?: (
      target: HomeworkTargetForSubmissionRecord,
      hasEligibleAttachment: boolean,
    ) => {
      bodyText: string | null;
      submittedAt: Date;
      submissionStatus: HomeworkSubmissionStatus;
      targetStatus: HomeworkTargetStatus;
    };
  }): Promise<HomeworkSubmissionRecord> {
    return this.scopedPrisma.$transaction(
      async (tx) => {
        const scope = requireHomeworkScope();
        if (scope.schoolId !== input.schoolId)
          throw new HomeworkAnswerInvalidSubmissionScopeException();
        if (
          !Array.isArray(input.answers) ||
          input.answers.length > 100 ||
          new Set(input.answers.map((answer) => answer.questionId)).size !==
            input.answers.length
        )
          throw new HomeworkAnswerInvalidPayloadException({
            reason: 'invalid_bulk_identity',
          });
        const actor = await this.requireRichIntegration().assertStudentWrite(
          tx,
          input.homeworkAssignmentId,
          input,
          input.permission,
        );
        const target = await this.lockEditableStudentTarget(
          tx,
          input,
          input.finalize
            ? undefined
            : () => new HomeworkAnswerReadOnlyException(),
        );
        await tx.$queryRaw`SELECT id FROM homework_questions WHERE homework_assignment_id=${input.homeworkAssignmentId}::uuid
        AND school_id=${scope.schoolId}::uuid ORDER BY id FOR SHARE`;
        const questions = await tx.homeworkQuestion.findMany({
          where: {
            homeworkAssignmentId: input.homeworkAssignmentId,
            deletedAt: null,
          },
          orderBy: { id: 'asc' },
          select: HOMEWORK_QUESTION_SELECT,
        });
        assertHomeworkRuntimeQuestions(questions);
        for (const question of questions) {
          if (!isHomeworkTypedType(question.type)) continue;
          const typedType = question.type;
          const definition = homeworkTypedQuestionValidation(() =>
            normalizeHomeworkDefinition(
              typedType,
              question.metadata,
              'complete',
            ),
          );
          if (definition.kind === 'media' && definition.source)
            await this.requireRichIntegration().assertStudentMediaSource(
              tx,
              actor,
              {
                homeworkId: input.homeworkAssignmentId,
                questionId: question.id,
                assetId: definition.source.assetId,
              },
              input.permission,
            );
        }
        const existing = target.submissions[0];
        const submission = existing
          ? await tx.homeworkSubmission.update({
              where: { id: existing.id },
              data:
                input.bodyText === undefined
                  ? {}
                  : { bodyText: input.bodyText },
              ...HOMEWORK_SUBMISSION_ARGS,
            })
          : await tx.homeworkSubmission.create({
              data: {
                schoolId: scope.schoolId,
                homeworkAssignmentId: input.homeworkAssignmentId,
                homeworkTargetId: target.id,
                studentId: target.studentId,
                enrollmentId: target.enrollmentId,
                status: 'DRAFT',
                bodyText: input.bodyText ?? null,
              },
              ...HOMEWORK_SUBMISSION_ARGS,
            });
        const stored = await readHomeworkTypedAnswers(
          tx,
          input.homeworkAssignmentId,
          submission.id,
          questions.map((question) => question.id),
        );
        if (new Set(stored.map((row) => row.questionId)).size !== stored.length)
          throw new HomeworkAnswerInvalidPayloadException({
            reason: 'duplicate_stored_answers',
          });
        for (const command of input.answers) {
          const question = questions.find(
            (item) => item.id === command.questionId,
          );
          if (!question)
            throw new HomeworkAnswerInvalidSubmissionScopeException();
          const current = stored.find((row) => row.questionId === question.id);
          const normalized = normalizeAnswerForQuestion({
            question,
            input: command,
            final: input.finalAnswers,
            existing: current,
          });
          const data: Prisma.HomeworkSubmissionAnswerUncheckedUpdateManyInput =
            {
              textAnswer: normalized.textAnswer,
              selectedOptionIds:
                normalized.selectedOptionIds ?? Prisma.JsonNull,
              isDraft: !input.finalAnswers,
            };
          if (isHomeworkTypedType(question.type)) {
            const definition = normalizeHomeworkDefinition(
              question.type,
              question.metadata,
              'complete',
            );
            data.answerJson = homeworkAnswerJsonPersistence(
              definition,
              normalized.answerJson === null
                ? { state: 'clear' }
                : { state: 'value', value: normalized.answerJson },
              input.finalAnswers ? 'final' : 'draft',
              question.isRequired,
            );
          }
          if (current)
            await tx.homeworkSubmissionAnswer.update({
              where: { id: current.id },
              data,
            });
          else
            await tx.homeworkSubmissionAnswer.create({
              data: {
                schoolId: scope.schoolId,
                homeworkSubmissionId: submission.id,
                homeworkAssignmentId: input.homeworkAssignmentId,
                homeworkTargetId: target.id,
                homeworkQuestionId: question.id,
                textAnswer: normalized.textAnswer,
                selectedOptionIds:
                  normalized.selectedOptionIds ?? Prisma.JsonNull,
                isDraft: !input.finalAnswers,
                ...(isHomeworkTypedType(question.type)
                  ? {
                      answerJson: data.answerJson as
                        | Prisma.InputJsonValue
                        | Prisma.NullTypes.DbNull,
                    }
                  : {}),
              },
            });
        }
        if (input.finalize) {
          await this.assertFinalTypedAnswers(
            tx,
            input.homeworkAssignmentId,
            submission.id,
            questions,
          );
          const refreshed = await tx.homeworkTarget.findFirstOrThrow({
            where: { id: target.id, schoolId: scope.schoolId },
            ...HOMEWORK_TARGET_FOR_SUBMISSION_ARGS,
          });
          const final = input.finalize(
            refreshed,
            await this.eligibleSubmissionAttachments(tx, refreshed),
          );
          await tx.homeworkSubmission.update({
            where: { id: submission.id },
            data: {
              status: final.submissionStatus,
              submittedAt: final.submittedAt,
              bodyText: final.bodyText,
            },
          });
          await tx.homeworkTarget.update({
            where: { id: target.id },
            data: {
              status: final.targetStatus,
              submittedAt: final.submittedAt,
            },
          });
          await tx.homeworkSubmissionAnswer.updateMany({
            where: { homeworkSubmissionId: submission.id, deletedAt: null },
            data: { isDraft: false },
          });
        }
        const result = await tx.homeworkSubmission.findFirstOrThrow({
          where: { id: submission.id, schoolId: scope.schoolId },
          ...HOMEWORK_SUBMISSION_ARGS,
        });
        await projectHomeworkTypedAnswers(
          tx,
          input.homeworkAssignmentId,
          result.answers,
        );
        return result;
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  async resolveDraftSubmission(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    bodyText?: string | null;
  }): Promise<SaveHomeworkSubmissionDraftResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await this.lockEditableStudentTarget(tx, input, undefined, true);
      const existing = await tx.homeworkSubmission.findUnique({
        where: {
          schoolId_homeworkTargetId: {
            schoolId: input.schoolId,
            homeworkTargetId: input.homeworkTargetId,
          },
        },
        ...HOMEWORK_SUBMISSION_ARGS,
      });

      if (existing && existing.status !== HomeworkSubmissionStatus.DRAFT) {
        return { outcome: 'already_submitted', submission: existing };
      }

      if (existing) {
        if (input.bodyText === undefined) {
          return { outcome: 'saved', submission: existing };
        }

        const submission = await tx.homeworkSubmission.update({
          where: { id: existing.id },
          data: { bodyText: input.bodyText },
          ...HOMEWORK_SUBMISSION_ARGS,
        });

        return { outcome: 'saved', submission };
      }

      const submission = await tx.homeworkSubmission.create({
        data: {
          schoolId: input.schoolId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
          status: HomeworkSubmissionStatus.DRAFT,
          bodyText: input.bodyText ?? null,
        },
        ...HOMEWORK_SUBMISSION_ARGS,
      });

      return { outcome: 'saved', submission };
    });
  }

  async upsertSubmissionAnswer(input: {
    data: CreateHomeworkSubmissionAnswerData;
    update: UpdateHomeworkSubmissionAnswerData;
  }): Promise<HomeworkSubmissionAnswerRecord> {
    const answer = await this.scopedPrisma.$transaction(async (tx) => {
      await this.lockEditableSubmission(
        tx,
        String(input.data.homeworkSubmissionId),
        String(input.data.homeworkAssignmentId),
        () => new HomeworkAnswerReadOnlyException(),
      );
      const question = await tx.homeworkQuestion.findFirst({
        where: {
          id: String(input.data.homeworkQuestionId),
          homeworkAssignmentId: String(input.data.homeworkAssignmentId),
          deletedAt: null,
        },
        select: { type: true },
      });
      if (!question) throw new HomeworkQuestionNotFoundException();
      assertHomeworkRuntimeQuestionType(question.type);
      if (isHomeworkTypedType(question.type))
        throw new HomeworkAnswerInvalidPayloadException({
          reason: 'typed_answer_requires_atomic_path',
        });
      const existing = await tx.homeworkSubmissionAnswer.findFirst({
        where: {
          homeworkSubmissionId: String(input.data.homeworkSubmissionId),
          homeworkQuestionId: String(input.data.homeworkQuestionId),
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        return tx.homeworkSubmissionAnswer.update({
          where: { id: existing.id },
          data: input.update,
          select: HOMEWORK_SUBMISSION_ANSWER_SELECT,
        });
      }

      return tx.homeworkSubmissionAnswer.create({
        data: input.data,
        select: HOMEWORK_SUBMISSION_ANSWER_SELECT,
      });
    });

    return answer;
  }

  listSubmissionAttachments(input: {
    homeworkAssignmentId: string;
    submissionId: string;
  }): Promise<HomeworkSubmissionAttachmentRecord[]> {
    return this.scopedPrisma.homeworkSubmissionAttachment.findMany({
      where: {
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkSubmissionId: input.submissionId,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
    });
  }

  findSubmissionAttachmentById(input: {
    homeworkAssignmentId: string;
    submissionId: string;
    attachmentId: string;
  }): Promise<HomeworkSubmissionAttachmentRecord | null> {
    return this.scopedPrisma.homeworkSubmissionAttachment.findFirst({
      where: {
        id: input.attachmentId,
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkSubmissionId: input.submissionId,
        deletedAt: null,
      },
      select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
    });
  }

  async getNextSubmissionAttachmentSortOrder(
    submissionId: string,
  ): Promise<number> {
    const result =
      await this.scopedPrisma.homeworkSubmissionAttachment.aggregate({
        where: { homeworkSubmissionId: submissionId, deletedAt: null },
        _max: { sortOrder: true },
      });

    return (result._max.sortOrder ?? -1) + 1;
  }

  async createSubmissionAttachment(
    data: CreateHomeworkSubmissionAttachmentData,
  ): Promise<HomeworkSubmissionAttachmentRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const target = await this.lockEditableSubmission(
        tx,
        String(data.homeworkSubmissionId),
        String(data.homeworkAssignmentId),
        () => new HomeworkSubmissionAttachmentReadOnlyException(),
      );
      const scope = requireHomeworkScope();
      const lockedFiles = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM files
        WHERE id = ${String(data.fileId)}::uuid AND school_id = ${scope.schoolId}::uuid FOR SHARE`;
      if (!lockedFiles.length)
        throw new HomeworkSubmissionAttachmentFileNotFoundException();
      const file = await tx.file.findFirst({
        where: {
          id: String(data.fileId),
          schoolId: scope.schoolId,
          uploaderId: scope.actorId,
          visibility: 'PRIVATE',
          deletedAt: null,
          sizeBytes: { gt: 0 },
          bucket: { not: '' },
          objectKey: { not: '' },
          studentCredentialSecretArtifacts: { none: {} },
        },
        select: { id: true },
      });
      if (
        !file ||
        data.homeworkTargetId !== target.id ||
        data.schoolId !== target.schoolId ||
        data.createdByUserId !== scope.actorId
      ) {
        throw new HomeworkSubmissionAttachmentFileNotFoundException();
      }
      return tx.homeworkSubmissionAttachment.create({
        data,
        select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
      });
    });
  }

  async updateSubmissionAttachment(input: {
    homeworkAssignmentId: string;
    submissionId: string;
    attachmentId: string;
    data: UpdateHomeworkSubmissionAttachmentData;
  }): Promise<HomeworkSubmissionAttachmentRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await this.lockEditableSubmission(
        tx,
        input.submissionId,
        input.homeworkAssignmentId,
        () => new HomeworkSubmissionAttachmentReadOnlyException(),
      );
      await tx.homeworkSubmissionAttachment.updateMany({
        where: {
          id: input.attachmentId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkSubmissionId: input.submissionId,
          deletedAt: null,
        },
        data: input.data as Prisma.HomeworkSubmissionAttachmentUncheckedUpdateManyInput,
      });

      const attachment = await tx.homeworkSubmissionAttachment.findFirst({
        where: {
          id: input.attachmentId,
          homeworkSubmissionId: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          deletedAt: null,
        },
        select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
      });
      if (!attachment) {
        throw new Error('Updated homework submission attachment was not found');
      }

      return attachment;
    });
  }

  async softDeleteSubmissionAttachment(input: {
    homeworkAssignmentId: string;
    submissionId: string;
    attachmentId: string;
  }): Promise<void> {
    await this.scopedPrisma.$transaction(async (tx) => {
      await this.lockEditableSubmission(
        tx,
        input.submissionId,
        input.homeworkAssignmentId,
        () => new HomeworkSubmissionAttachmentReadOnlyException(),
      );
      await tx.homeworkSubmissionAttachment.updateMany({
        where: {
          id: input.attachmentId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkSubmissionId: input.submissionId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
    });
  }

  async listReviewableSubmissions(
    filters: ListHomeworkReviewSubmissionsFilters,
  ): Promise<ListHomeworkReviewSubmissionsResult> {
    const where = buildReviewSubmissionWhere(filters);
    const [items, total] = await Promise.all([
      this.scopedPrisma.homeworkSubmission.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
      }),
      this.scopedPrisma.homeworkSubmission.count({ where }),
    ]);

    return { items, total, page: filters.page, limit: filters.limit };
  }

  findReviewableSubmission(input: {
    homeworkAssignmentId: string;
    submissionId: string;
  }): Promise<HomeworkReviewSubmissionRecord | null> {
    return this.scopedPrisma.homeworkSubmission.findFirst({
      where: {
        id: input.submissionId,
        homeworkAssignmentId: input.homeworkAssignmentId,
        status: { in: REVIEW_VISIBLE_SUBMISSION_STATUSES },
        homeworkAssignment: { is: reviewVisibleAssignmentWhere() },
      },
      ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
    });
  }

  listReviewedSubmissionsForGradeSync(
    homeworkAssignmentId: string,
  ): Promise<HomeworkReviewSubmissionRecord[]> {
    return this.scopedPrisma.homeworkSubmission.findMany({
      where: {
        homeworkAssignmentId,
        status: HomeworkSubmissionStatus.REVIEWED,
        homeworkTarget: {
          is: {
            homeworkAssignmentId,
            status: HomeworkTargetStatus.REVIEWED,
          },
        },
        homeworkAssignment: { is: reviewVisibleAssignmentWhere() },
      },
      orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
    });
  }

  findSubmissionForAnswerReview(input: {
    homeworkAssignmentId: string;
    submissionId: string;
  }): Promise<HomeworkReviewSubmissionRecord | null> {
    return this.scopedPrisma.homeworkSubmission.findFirst({
      where: {
        id: input.submissionId,
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkAssignment: {
          is: {
            deletedAt: null,
          },
        },
      },
      ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
    });
  }

  private async assertReviewQuestionTypes(
    tx: Prisma.TransactionClient,
    homeworkId: string,
  ): Promise<void> {
    const { schoolId } = requireHomeworkScope();
    await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${homeworkId}::uuid AND school_id=${schoolId}::uuid FOR UPDATE`;
    const questions = await tx.homeworkQuestion.findMany({
      where: { homeworkAssignmentId: homeworkId, schoolId, deletedAt: null },
      select: { type: true },
    });
    assertHomeworkRuntimeQuestions(questions);
  }

  async reviewSubmissionAnswers(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    submissionId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    awardedMarks: number;
    reviews: {
      answerId: string;
      homeworkQuestionId: string;
      awardedPoints: number | null;
      teacherComment: string | null;
      reviewedAt: Date;
      reviewedByUserId: string;
      awardedPointsChanged?: boolean;
      teacherCommentChanged?: boolean;
    }[];
  }): Promise<ReviewHomeworkSubmissionAnswersResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const snapshot = await tx.homeworkSubmission.findFirst({
        where: {
          id: input.submissionId,
          schoolId: input.schoolId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
      });
      const typed =
        snapshot?.homeworkAssignment.questions.some((question) =>
          isHomeworkTypedType(question.type),
        ) === true;
      const current = typed
        ? await this.lockTypedReview(
            tx,
            input.homeworkAssignmentId,
            input.homeworkTargetId,
            input.submissionId,
          )
        : null;
      await this.assertReviewQuestionTypes(tx, input.homeworkAssignmentId);
      if (current) {
        if (
          input.reviews.some(
            (review) =>
              review.reviewedByUserId !== requireHomeworkScope().actorId,
          )
        )
          throw new HomeworkAnswerReviewInvalidScopeException();
        for (const review of input.reviews) {
          const answer = current.answers.find(
            (item) =>
              item.id === review.answerId &&
              item.homeworkQuestionId === review.homeworkQuestionId,
          );
          if (!answer) throw new HomeworkAnswerReviewInvalidScopeException();
          const points =
            review.awardedPointsChanged === false
              ? answer.awardedPoints === null
                ? null
                : Number(answer.awardedPoints)
              : review.awardedPoints;
          if (
            points !== null &&
            (!Number.isFinite(points) ||
              points < 0 ||
              points > Number(answer.homeworkQuestion.points))
          )
            throw new HomeworkAnswerReviewExceedsQuestionPointsException();
        }
      }
      const matchingAnswers = await tx.homeworkSubmissionAnswer.count({
        where: {
          schoolId: input.schoolId,
          id: { in: input.reviews.map((review) => review.answerId) },
          homeworkSubmissionId: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          homeworkQuestionId: {
            in: input.reviews.map((review) => review.homeworkQuestionId),
          },
          deletedAt: null,
        },
      });

      if (matchingAnswers !== input.reviews.length) {
        return { outcome: 'not_found' };
      }

      for (const review of input.reviews) {
        await tx.homeworkSubmissionAnswer.updateMany({
          where: {
            schoolId: input.schoolId,
            id: review.answerId,
            homeworkSubmissionId: input.submissionId,
            homeworkAssignmentId: input.homeworkAssignmentId,
            homeworkTargetId: input.homeworkTargetId,
            homeworkQuestionId: review.homeworkQuestionId,
            deletedAt: null,
          },
          data: {
            ...(current && review.teacherCommentChanged === false
              ? {}
              : { teacherComment: review.teacherComment }),
            ...(current && review.awardedPointsChanged === false
              ? {}
              : { awardedPoints: review.awardedPoints }),
            reviewedAt: review.reviewedAt,
            reviewedByUserId: review.reviewedByUserId,
          },
        });
      }

      let awardedMarks = input.awardedMarks;
      if (current) {
        const totals = await tx.homeworkSubmissionAnswer.aggregate({
          where: {
            schoolId: input.schoolId,
            homeworkSubmissionId: input.submissionId,
            homeworkAssignmentId: input.homeworkAssignmentId,
            deletedAt: null,
          },
          _sum: { awardedPoints: true },
        });
        awardedMarks = Number(totals._sum.awardedPoints ?? 0);
        if (
          current.homeworkAssignment.totalMarks !== null &&
          awardedMarks > Number(current.homeworkAssignment.totalMarks)
        )
          throw new HomeworkAnswerReviewExceedsAssignmentMarksException();
      }

      await tx.homeworkSubmission.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        data: {
          awardedMarks,
        },
      });

      const submission = await tx.homeworkSubmission.findFirst({
        where: {
          schoolId: input.schoolId,
          id: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
      });

      return submission
        ? { outcome: 'reviewed', submission }
        : { outcome: 'not_found' };
    });
  }

  findStudentTargetForSubmission(input: {
    homeworkId: string;
    studentId: string;
    enrollmentId: string;
  }): Promise<HomeworkTargetForSubmissionRecord | null> {
    return this.scopedPrisma.homeworkTarget.findFirst({
      where: {
        homeworkAssignmentId: input.homeworkId,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        homeworkAssignment: {
          is: {
            deletedAt: null,
            status: {
              in: [
                HomeworkAssignmentStatus.PUBLISHED,
                HomeworkAssignmentStatus.CLOSED,
              ],
            },
          },
        },
      },
      ...HOMEWORK_TARGET_FOR_SUBMISSION_ARGS,
    });
  }

  async saveDraftSubmission(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    bodyText: string | null;
  }): Promise<SaveHomeworkSubmissionDraftResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await this.lockEditableStudentTarget(tx, input);
      const existing = await tx.homeworkSubmission.findUnique({
        where: {
          schoolId_homeworkTargetId: {
            schoolId: input.schoolId,
            homeworkTargetId: input.homeworkTargetId,
          },
        },
        ...HOMEWORK_SUBMISSION_ARGS,
      });

      if (existing && existing.status !== HomeworkSubmissionStatus.DRAFT) {
        return { outcome: 'already_submitted', submission: existing };
      }

      const submission = existing
        ? await tx.homeworkSubmission.update({
            where: { id: existing.id },
            data: { bodyText: input.bodyText },
            ...HOMEWORK_SUBMISSION_ARGS,
          })
        : await tx.homeworkSubmission.create({
            data: {
              schoolId: input.schoolId,
              homeworkAssignmentId: input.homeworkAssignmentId,
              homeworkTargetId: input.homeworkTargetId,
              studentId: input.studentId,
              enrollmentId: input.enrollmentId,
              status: HomeworkSubmissionStatus.DRAFT,
              bodyText: input.bodyText,
            },
            ...HOMEWORK_SUBMISSION_ARGS,
          });

      return { outcome: 'saved', submission };
    });
  }

  async submitSubmission(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    bodyText: string | null;
    submissionStatus: HomeworkSubmissionStatus;
    targetStatus: HomeworkTargetStatus;
    submittedAt: Date;
    validateCurrent: (
      target: HomeworkTargetForSubmissionRecord,
      hasEligibleAttachment: boolean,
    ) => {
      bodyText: string | null;
      submittedAt: Date;
      submissionStatus: HomeworkSubmissionStatus;
      targetStatus: HomeworkTargetStatus;
    };
  }): Promise<SubmitHomeworkSubmissionResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      let target = await this.lockEditableStudentTarget(tx, input);
      await tx.$queryRaw`SELECT id FROM homework_questions
        WHERE homework_assignment_id = ${input.homeworkAssignmentId}::uuid
          AND school_id = ${input.schoolId}::uuid ORDER BY id FOR SHARE`;
      target = await tx.homeworkTarget.findFirstOrThrow({
        where: { id: target.id, schoolId: target.schoolId },
        ...HOMEWORK_TARGET_FOR_SUBMISSION_ARGS,
      });
      assertHomeworkRuntimeQuestions(target.homeworkAssignment.questions);
      if (
        target.homeworkAssignment.questions.some((question) =>
          isHomeworkTypedType(question.type),
        )
      )
        throw new HomeworkAnswerInvalidPayloadException({
          reason: 'typed_submit_requires_atomic_path',
        });
      const hasEligibleAttachment = await this.eligibleSubmissionAttachments(
        tx,
        target,
      );
      const { bodyText, submittedAt, submissionStatus, targetStatus } =
        input.validateCurrent(target, hasEligibleAttachment);
      const existing = await tx.homeworkSubmission.findUnique({
        where: {
          schoolId_homeworkTargetId: {
            schoolId: input.schoolId,
            homeworkTargetId: input.homeworkTargetId,
          },
        },
        ...HOMEWORK_SUBMISSION_ARGS,
      });

      if (existing && existing.status !== HomeworkSubmissionStatus.DRAFT) {
        return { outcome: 'already_submitted', submission: existing };
      }

      const submission = existing
        ? await tx.homeworkSubmission.update({
            where: { id: existing.id },
            data: {
              status: submissionStatus,
              bodyText,
              submittedAt,
            },
            ...HOMEWORK_SUBMISSION_ARGS,
          })
        : await tx.homeworkSubmission.create({
            data: {
              schoolId: input.schoolId,
              homeworkAssignmentId: input.homeworkAssignmentId,
              homeworkTargetId: input.homeworkTargetId,
              studentId: input.studentId,
              enrollmentId: input.enrollmentId,
              status: submissionStatus,
              bodyText,
              submittedAt,
            },
            ...HOMEWORK_SUBMISSION_ARGS,
          });

      await tx.homeworkTarget.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.homeworkTargetId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        data: {
          status: targetStatus,
          submittedAt,
        },
      });

      await tx.homeworkSubmissionAnswer.updateMany({
        where: {
          schoolId: input.schoolId,
          homeworkSubmissionId: submission.id,
          deletedAt: null,
        },
        data: { isDraft: false },
      });

      const finalized = await tx.homeworkSubmission.findFirst({
        where: {
          schoolId: input.schoolId,
          id: submission.id,
        },
        ...HOMEWORK_SUBMISSION_ARGS,
      });

      return { outcome: 'submitted', submission: finalized ?? submission };
    });
  }

  async reviewSubmission(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    submissionId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    reviewedByUserId: string;
    reviewedAt: Date;
    reviewNote: string | null;
    awardedMarks: number | null;
    awardedMarksExplicit?: boolean;
  }): Promise<ReviewHomeworkSubmissionResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      let existing = await tx.homeworkSubmission.findFirst({
        where: {
          schoolId: input.schoolId,
          id: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
      });

      if (!existing) {
        return { outcome: 'not_found' };
      }

      let awardedMarks = input.awardedMarks;
      if (
        existing.homeworkAssignment.questions.some((question) =>
          isHomeworkTypedType(question.type),
        )
      ) {
        existing = await this.lockTypedReview(
          tx,
          input.homeworkAssignmentId,
          input.homeworkTargetId,
          input.submissionId,
          true,
        );
        if (input.reviewedByUserId !== requireHomeworkScope().actorId)
          throw new HomeworkAnswerReviewInvalidScopeException();
        if (existing.status !== 'REVIEWED') {
          for (const question of existing.homeworkAssignment.questions)
            if (
              question.isRequired &&
              !existing.answers.find(
                (answer) => answer.homeworkQuestionId === question.id,
              )?.reviewedAt
            )
              throw new HomeworkAnswerReviewIncompleteRequiredAnswersException();
          const total = existing.answers.reduce(
            (sum, answer) => sum + Number(answer.awardedPoints ?? 0),
            0,
          );
          awardedMarks = Math.round(total * 100) / 100;
          if (input.awardedMarksExplicit && input.awardedMarks !== awardedMarks)
            throw new HomeworkSubmissionReviewInvalidException({
              reason: 'review_rollup_changed',
            });
          if (
            existing.homeworkAssignment.totalMarks !== null &&
            awardedMarks > Number(existing.homeworkAssignment.totalMarks)
          )
            throw new HomeworkAnswerReviewExceedsAssignmentMarksException();
        }
      }

      await this.assertReviewQuestionTypes(tx, input.homeworkAssignmentId);
      if (existing.status === HomeworkSubmissionStatus.REVIEWED) {
        return { outcome: 'already_reviewed', submission: existing };
      }

      if (!REVIEWABLE_SUBMISSION_STATUSES.includes(existing.status)) {
        return { outcome: 'not_reviewable', submission: existing };
      }

      await tx.homeworkSubmission.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        data: {
          status: HomeworkSubmissionStatus.REVIEWED,
          reviewedAt: input.reviewedAt,
          reviewedByUserId: input.reviewedByUserId,
          reviewNote: input.reviewNote,
          awardedMarks,
        },
      });

      await tx.homeworkTarget.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.homeworkTargetId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        data: {
          status: HomeworkTargetStatus.REVIEWED,
          reviewedAt: input.reviewedAt,
        },
      });

      const submission = await tx.homeworkSubmission.findFirst({
        where: {
          schoolId: input.schoolId,
          id: input.submissionId,
          homeworkAssignmentId: input.homeworkAssignmentId,
          homeworkTargetId: input.homeworkTargetId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
        },
        ...HOMEWORK_REVIEW_SUBMISSION_ARGS,
      });

      return submission
        ? { outcome: 'reviewed', submission }
        : { outcome: 'not_found' };
    });
  }

  listCurrentTargetStudentIds(
    homeworkId: string,
  ): Promise<{ studentId: string }[]> {
    return this.scopedPrisma.homeworkTarget.findMany({
      where: { homeworkAssignmentId: homeworkId },
      select: { studentId: true },
      orderBy: { studentId: 'asc' },
    });
  }

  findTeacherAllocationById(
    allocationId: string,
  ): Promise<HomeworkTeacherAllocationRecord | null> {
    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: { id: allocationId },
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findTimetableEntryById(
    timetableEntryId: string,
  ): Promise<HomeworkTimetableEntryRecord | null> {
    return this.scopedPrisma.timetableEntry.findFirst({
      where: { id: timetableEntryId },
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  findEligibleEnrollments(input: {
    academicYearId: string;
    termId: string;
    classroomId: string;
    studentIds?: string[];
  }): Promise<HomeworkEnrollmentTargetRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        academicYearId: input.academicYearId,
        termId: input.termId,
        classroomId: input.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        ...(input.studentIds ? { studentId: { in: input.studentIds } } : {}),
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
      ...ENROLLMENT_TARGET_ARGS,
    });
  }

  isPublishedTimetableEntry(entry: HomeworkTimetableEntryRecord): boolean {
    return (
      entry.status === TimetableEntryStatus.ACTIVE &&
      entry.timetableConfig.status === TimetableConfigStatus.ACTIVE &&
      entry.timetableConfig.publications.some(
        (publication) =>
          publication.status === TimetablePublicationStatus.PUBLISHED,
      )
    );
  }

  private async findMutationResult(
    homeworkId: string,
  ): Promise<HomeworkAssignmentWithCounters> {
    const assignment = await this.findAssignmentById(homeworkId);
    if (!assignment) {
      throw new Error('Updated homework assignment was not found');
    }

    return assignment;
  }

  private async findQuestionMutationResult(input: {
    homeworkId: string;
    questionId: string;
  }): Promise<HomeworkQuestionRecord> {
    const question = await this.findQuestionById(input);
    if (!question) {
      throw new Error('Updated homework question was not found');
    }

    return question;
  }

  private async findAttachmentMutationResult(input: {
    homeworkId: string;
    attachmentId: string;
  }): Promise<HomeworkAttachmentRecord> {
    const attachment = await this.findAttachmentById(input);
    if (!attachment) {
      throw new Error('Updated homework attachment was not found');
    }

    return attachment;
  }

  private buildListWhere(
    filters: ListHomeworkAssignmentsFilters,
  ): Prisma.HomeworkAssignmentWhereInput {
    const and: Prisma.HomeworkAssignmentWhereInput[] = [];

    if (filters.dueFrom) {
      and.push({ dueAt: { gte: filters.dueFrom } });
    }

    if (filters.dueTo) {
      and.push({ dueAt: { lte: filters.dueTo } });
    }

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      deletedAt: null,
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
      ...(filters.teacherUserId
        ? { teacherUserId: filters.teacherUserId }
        : {}),
      ...(filters.teacherSubjectAllocationId
        ? { teacherSubjectAllocationId: filters.teacherSubjectAllocationId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.mode ? { mode: filters.mode } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async attachCounters(
    assignments: HomeworkAssignmentRecord[],
  ): Promise<HomeworkAssignmentWithCounters[]> {
    if (assignments.length === 0) return [];

    const rows = await this.scopedPrisma.homeworkTarget.findMany({
      where: {
        homeworkAssignmentId: {
          in: assignments.map((assignment) => assignment.id),
        },
      },
      select: {
        homeworkAssignmentId: true,
        status: true,
      },
    });

    const countersByAssignment = new Map<string, HomeworkStatusCounters>();
    for (const assignment of assignments) {
      countersByAssignment.set(assignment.id, createEmptyCounters());
    }

    for (const row of rows) {
      const counters = countersByAssignment.get(row.homeworkAssignmentId);
      if (!counters) continue;
      counters.totalTargets += 1;
      counters[row.status] += 1;
    }

    return assignments.map((assignment) => ({
      ...assignment,
      counters:
        countersByAssignment.get(assignment.id) ?? createEmptyCounters(),
    }));
  }
}

function createEmptyCounters(): HomeworkStatusCounters {
  return {
    totalTargets: 0,
    [HomeworkTargetStatus.ASSIGNED]: 0,
    [HomeworkTargetStatus.VIEWED]: 0,
    [HomeworkTargetStatus.SUBMITTED]: 0,
    [HomeworkTargetStatus.LATE]: 0,
    [HomeworkTargetStatus.MISSING]: 0,
    [HomeworkTargetStatus.REVIEWED]: 0,
    [HomeworkTargetStatus.EXCUSED]: 0,
  };
}

function buildReviewSubmissionWhere(
  filters: ListHomeworkReviewSubmissionsFilters,
): Prisma.HomeworkSubmissionWhereInput {
  const and: Prisma.HomeworkSubmissionWhereInput[] = [
    {
      homeworkAssignmentId: filters.homeworkAssignmentId,
      status: {
        in: reviewVisibleSubmissionStatuses(filters.statuses),
      },
      homeworkAssignment: {
        is: reviewVisibleAssignmentWhere(),
      },
    },
  ];

  const search = filters.search?.trim();
  if (search) {
    const stringFilter = {
      contains: search,
      mode: Prisma.QueryMode.insensitive,
    };
    and.push({
      student: {
        is: {
          OR: [{ firstName: stringFilter }, { lastName: stringFilter }],
          deletedAt: null,
        },
      },
    });
  }

  return and.length === 1 ? and[0] : { AND: and };
}

function reviewVisibleAssignmentWhere(): Prisma.HomeworkAssignmentWhereInput {
  return {
    deletedAt: null,
    status: { in: REVIEW_VISIBLE_ASSIGNMENT_STATUSES },
  };
}

function reviewVisibleSubmissionStatuses(
  statuses?: HomeworkSubmissionStatus[],
): HomeworkSubmissionStatus[] {
  if (!statuses || statuses.length === 0) {
    return REVIEW_VISIBLE_SUBMISSION_STATUSES;
  }

  return statuses.filter((status) =>
    REVIEW_VISIBLE_SUBMISSION_STATUSES.includes(status),
  );
}
