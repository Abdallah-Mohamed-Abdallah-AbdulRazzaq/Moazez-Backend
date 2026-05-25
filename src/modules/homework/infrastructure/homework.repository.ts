import { Injectable } from '@nestjs/common';
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

const NAMED_REFERENCE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.AcademicYearSelect;

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
      createdAt: true,
      updatedAt: true,
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
export type HomeworkTargetForSubmissionRecord =
  Prisma.HomeworkTargetGetPayload<typeof HOMEWORK_TARGET_FOR_SUBMISSION_ARGS>;

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

export type CreateHomeworkAssignmentData =
  Prisma.HomeworkAssignmentUncheckedCreateInput;
export type UpdateHomeworkAssignmentData =
  Prisma.HomeworkAssignmentUncheckedUpdateInput;
export type CreateHomeworkTargetData =
  Prisma.HomeworkTargetUncheckedCreateInput;
export type SaveHomeworkSubmissionDraftResult =
  | { outcome: 'saved'; submission: HomeworkSubmissionRecord }
  | { outcome: 'already_submitted'; submission: HomeworkSubmissionRecord };
export type SubmitHomeworkSubmissionResult =
  | { outcome: 'submitted'; submission: HomeworkSubmissionRecord }
  | { outcome: 'already_submitted'; submission: HomeworkSubmissionRecord };

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
    bodyText: string;
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
    bodyText: string;
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

      return { outcome: 'submitted', submission };
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
