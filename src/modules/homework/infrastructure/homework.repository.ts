import { Injectable } from '@nestjs/common';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
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
export type CreateHomeworkTargetData =
  Prisma.HomeworkTargetUncheckedCreateInput;
export type CreateHomeworkQuestionData =
  Prisma.HomeworkQuestionUncheckedCreateInput;
export type UpdateHomeworkQuestionData =
  Prisma.HomeworkQuestionUncheckedUpdateInput;
export type CreateHomeworkQuestionOptionData =
  Prisma.HomeworkQuestionOptionUncheckedCreateInput;
export type UpdateHomeworkQuestionOptionData =
  Prisma.HomeworkQuestionOptionUncheckedUpdateInput;
export type CreateHomeworkAttachmentData =
  Prisma.HomeworkAssignmentAttachmentUncheckedCreateInput;
export type UpdateHomeworkAttachmentData =
  Prisma.HomeworkAssignmentAttachmentUncheckedUpdateInput;
export type CreateHomeworkSubmissionAnswerData =
  Prisma.HomeworkSubmissionAnswerUncheckedCreateInput;
export type UpdateHomeworkSubmissionAnswerData =
  Prisma.HomeworkSubmissionAnswerUncheckedUpdateInput;
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
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
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
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.$transaction([
      this.scopedPrisma.homeworkAssignment.create({
        data,
      }),
      ...(targets.length > 0
        ? [
            this.scopedPrisma.homeworkTarget.createMany({
              data: targets,
            }),
          ]
        : []),
    ]);

    return this.findMutationResult(String(data.id));
  }

  async updateAssignmentWithTargets(
    homeworkId: string,
    data: UpdateHomeworkAssignmentData,
    targets: CreateHomeworkTargetData[],
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.$transaction([
      this.scopedPrisma.homeworkTarget.deleteMany({
        where: { homeworkAssignmentId: homeworkId },
      }),
      this.scopedPrisma.homeworkAssignment.updateMany({
        where: { id: homeworkId, deletedAt: null },
        data: data as Prisma.HomeworkAssignmentUncheckedUpdateManyInput,
      }),
      ...(targets.length > 0
        ? [
            this.scopedPrisma.homeworkTarget.createMany({
              data: targets,
            }),
          ]
        : []),
    ]);

    return this.findMutationResult(homeworkId);
  }

  async replaceTargets(
    homeworkId: string,
    targets: CreateHomeworkTargetData[],
  ): Promise<HomeworkAssignmentWithCounters> {
    await this.scopedPrisma.$transaction([
      this.scopedPrisma.homeworkTarget.deleteMany({
        where: { homeworkAssignmentId: homeworkId },
      }),
      ...(targets.length > 0
        ? [
            this.scopedPrisma.homeworkTarget.createMany({
              data: targets,
            }),
          ]
        : []),
    ]);

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
    await this.scopedPrisma.$transaction([
      this.scopedPrisma.homeworkTarget.deleteMany({
        where: { homeworkAssignmentId: homeworkId },
      }),
      ...(targets.length > 0
        ? [
            this.scopedPrisma.homeworkTarget.createMany({
              data: targets,
            }),
          ]
        : []),
      this.scopedPrisma.homeworkAssignment.updateMany({
        where: { id: homeworkId, deletedAt: null },
        data: data as Prisma.HomeworkAssignmentUncheckedUpdateManyInput,
      }),
    ]);

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
  }): Promise<HomeworkQuestionRecord> {
    await this.scopedPrisma.$transaction([
      this.scopedPrisma.homeworkQuestion.create({
        data: input.question,
      }),
      ...(input.options.length > 0
        ? [
            this.scopedPrisma.homeworkQuestionOption.createMany({
              data: input.options,
            }),
          ]
        : []),
    ]);

    return this.findQuestionMutationResult({
      homeworkId: String(input.question.homeworkAssignmentId),
      questionId: String(input.question.id),
    });
  }

  async updateQuestion(input: {
    homeworkId: string;
    questionId: string;
    data: UpdateHomeworkQuestionData;
  }): Promise<HomeworkQuestionRecord> {
    await this.scopedPrisma.homeworkQuestion.updateMany({
      where: {
        id: input.questionId,
        homeworkAssignmentId: input.homeworkId,
        deletedAt: null,
      },
      data: input.data as Prisma.HomeworkQuestionUncheckedUpdateManyInput,
    });

    return this.findQuestionMutationResult(input);
  }

  async softDeleteQuestion(input: {
    homeworkId: string;
    questionId: string;
  }): Promise<void> {
    const deletedAt = new Date();
    await this.scopedPrisma.$transaction([
      this.scopedPrisma.homeworkQuestion.updateMany({
        where: {
          id: input.questionId,
          homeworkAssignmentId: input.homeworkId,
          deletedAt: null,
        },
        data: { deletedAt },
      }),
      this.scopedPrisma.homeworkQuestionOption.updateMany({
        where: {
          homeworkQuestionId: input.questionId,
          deletedAt: null,
        },
        data: { deletedAt },
      }),
    ]);
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
  }): Promise<HomeworkQuestionRecord> {
    await this.scopedPrisma.homeworkQuestionOption.create({
      data: input.data,
    });

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
  }): Promise<HomeworkQuestionRecord> {
    await this.scopedPrisma.homeworkQuestionOption.updateMany({
      where: {
        id: input.optionId,
        homeworkQuestionId: input.questionId,
        deletedAt: null,
      },
      data: input.data as Prisma.HomeworkQuestionOptionUncheckedUpdateManyInput,
    });

    return this.findQuestionMutationResult(input);
  }

  async softDeleteQuestionOption(input: {
    homeworkId: string;
    questionId: string;
    optionId: string;
  }): Promise<HomeworkQuestionRecord> {
    await this.scopedPrisma.homeworkQuestionOption.updateMany({
      where: {
        id: input.optionId,
        homeworkQuestionId: input.questionId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

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

  async resolveDraftSubmission(input: {
    schoolId: string;
    homeworkAssignmentId: string;
    homeworkTargetId: string;
    studentId: string;
    enrollmentId: string;
    bodyText?: string | null;
  }): Promise<SaveHomeworkSubmissionDraftResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
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

  createSubmissionAttachment(
    data: CreateHomeworkSubmissionAttachmentData,
  ): Promise<HomeworkSubmissionAttachmentRecord> {
    return this.scopedPrisma.homeworkSubmissionAttachment.create({
      data,
      select: HOMEWORK_SUBMISSION_ATTACHMENT_SELECT,
    });
  }

  async updateSubmissionAttachment(input: {
    homeworkAssignmentId: string;
    submissionId: string;
    attachmentId: string;
    data: UpdateHomeworkSubmissionAttachmentData;
  }): Promise<HomeworkSubmissionAttachmentRecord> {
    await this.scopedPrisma.homeworkSubmissionAttachment.updateMany({
      where: {
        id: input.attachmentId,
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkSubmissionId: input.submissionId,
        deletedAt: null,
      },
      data: input.data as Prisma.HomeworkSubmissionAttachmentUncheckedUpdateManyInput,
    });

    const attachment = await this.findSubmissionAttachmentById(input);
    if (!attachment) {
      throw new Error('Updated homework submission attachment was not found');
    }

    return attachment;
  }

  async softDeleteSubmissionAttachment(input: {
    homeworkAssignmentId: string;
    submissionId: string;
    attachmentId: string;
  }): Promise<void> {
    await this.scopedPrisma.homeworkSubmissionAttachment.updateMany({
      where: {
        id: input.attachmentId,
        homeworkAssignmentId: input.homeworkAssignmentId,
        homeworkSubmissionId: input.submissionId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
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
    }[];
  }): Promise<ReviewHomeworkSubmissionAnswersResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
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
            teacherComment: review.teacherComment,
            awardedPoints: review.awardedPoints,
            reviewedAt: review.reviewedAt,
            reviewedByUserId: review.reviewedByUserId,
          },
        });
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
          awardedMarks: input.awardedMarks,
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
  }): Promise<SubmitHomeworkSubmissionResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
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
              status: input.submissionStatus,
              bodyText: input.bodyText,
              submittedAt: input.submittedAt,
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
              status: input.submissionStatus,
              bodyText: input.bodyText,
              submittedAt: input.submittedAt,
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
          status: input.targetStatus,
          submittedAt: input.submittedAt,
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
  }): Promise<ReviewHomeworkSubmissionResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await tx.homeworkSubmission.findFirst({
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
          awardedMarks: input.awardedMarks,
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
