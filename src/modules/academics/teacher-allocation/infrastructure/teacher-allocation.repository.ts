import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TEACHER_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      teacherUserId: true,
      subjectId: true,
      classroomId: true,
      termId: true,
      createdAt: true,
      updatedAt: true,
      teacherUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
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
      classroom: {
        select: {
          id: true,
          sectionId: true,
          roomId: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              gradeId: true,
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
      term: {
        select: {
          id: true,
          schoolId: true,
          academicYearId: true,
          nameAr: true,
          nameEn: true,
          isActive: true,
        },
      },
    },
  });

const ACTIVE_MEMBERSHIP_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      userType: true,
      status: true,
      endedAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userType: true,
        },
      },
    },
  });

const SUBJECT_REFERENCE_ARGS = Prisma.validator<Prisma.SubjectDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    code: true,
    color: true,
    isActive: true,
  },
});

const CLASSROOM_REFERENCE_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      sectionId: true,
      roomId: true,
      nameAr: true,
      nameEn: true,
      section: {
        select: {
          id: true,
          gradeId: true,
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
  });

const GRADE_REFERENCE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
  },
});

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    nameAr: true,
    nameEn: true,
    isActive: true,
  },
});

const SUBJECT_ALLOCATION_MATRIX_ARGS =
  Prisma.validator<Prisma.SubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      gradeId: true,
      subjectId: true,
      weeklyHours: true,
      grade: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
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
    },
  });

export type TeacherAllocationRecord = Prisma.TeacherSubjectAllocationGetPayload<
  typeof TEACHER_ALLOCATION_ARGS
>;

export type ActiveMembershipRecord = Prisma.MembershipGetPayload<
  typeof ACTIVE_MEMBERSHIP_ARGS
>;

export type SubjectReferenceRecord = Prisma.SubjectGetPayload<
  typeof SUBJECT_REFERENCE_ARGS
>;

export type ClassroomReferenceRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;

export type GradeReferenceRecord = Prisma.GradeGetPayload<
  typeof GRADE_REFERENCE_ARGS
>;

export type TermReferenceRecord = Prisma.TermGetPayload<
  typeof TERM_REFERENCE_ARGS
>;

export type SubjectAllocationMatrixRecord =
  Prisma.SubjectAllocationGetPayload<typeof SUBJECT_ALLOCATION_MATRIX_ARGS>;

export interface TeacherAllocationDependencyCounts {
  timetableEntries: number;
  lessonPlans: number;
  homeworkAssignments: number;
}

export type DeleteTeacherAllocationResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

export interface BulkSaveTeacherAllocationInput {
  schoolId: string;
  termId: string;
  items: Array<{
    teacherUserId: string;
    subjectId: string;
    classroomId: string;
  }>;
}

export interface BulkSaveTeacherAllocationResult {
  allocations: TeacherAllocationRecord[];
  createdCount: number;
  existingCount: number;
}

export type ClearTeacherAllocationsResult =
  | { status: 'deleted'; deletedCount: number }
  | {
      status: 'conflict';
      dependencyCounts: TeacherAllocationDependencyCounts;
      allocationIds: string[];
    };

@Injectable()
export class TeacherAllocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'TeacherAllocationRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  listAllocations(filters: {
    termId?: string;
    classroomId?: string;
  }): Promise<TeacherAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
        teacherUser: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
        classroom: {
          is: {
            deletedAt: null,
            section: { is: { deletedAt: null, grade: { is: { deletedAt: null } } } },
          },
        },
        term: { is: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'desc' }],
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findAllocationById(allocationId: string): Promise<TeacherAllocationRecord | null> {
    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: { id: allocationId },
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findActiveMembershipByUserId(
    userId: string,
  ): Promise<ActiveMembershipRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        user: { is: { deletedAt: null } },
      },
      ...ACTIVE_MEMBERSHIP_ARGS,
    });
  }

  findActiveMembershipsByUserIds(
    userIds: string[],
  ): Promise<ActiveMembershipRecord[]> {
    if (userIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.membership.findMany({
      where: {
        userId: { in: userIds },
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        user: { is: { deletedAt: null } },
      },
      ...ACTIVE_MEMBERSHIP_ARGS,
    });
  }

  findSubjectById(subjectId: string): Promise<SubjectReferenceRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      ...SUBJECT_REFERENCE_ARGS,
    });
  }

  findSubjectsByIds(subjectIds: string[]): Promise<SubjectReferenceRecord[]> {
    if (subjectIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.subject.findMany({
      where: { id: { in: subjectIds } },
      ...SUBJECT_REFERENCE_ARGS,
    });
  }

  findClassroomById(
    classroomId: string,
  ): Promise<ClassroomReferenceRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: {
        id: classroomId,
        section: { is: { deletedAt: null, grade: { is: { deletedAt: null } } } },
      },
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  findClassroomsByIds(
    classroomIds: string[],
  ): Promise<ClassroomReferenceRecord[]> {
    if (classroomIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.classroom.findMany({
      where: {
        id: { in: classroomIds },
        section: { is: { deletedAt: null, grade: { is: { deletedAt: null } } } },
      },
      orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  findClassroomsByGradeId(
    gradeId: string,
  ): Promise<ClassroomReferenceRecord[]> {
    return this.scopedPrisma.classroom.findMany({
      where: {
        section: {
          is: {
            gradeId,
            deletedAt: null,
            grade: { is: { deletedAt: null } },
          },
        },
      },
      orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  findClassroomsByGradeIds(
    gradeIds: string[],
  ): Promise<ClassroomReferenceRecord[]> {
    if (gradeIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.classroom.findMany({
      where: {
        section: {
          is: {
            gradeId: { in: gradeIds },
            deletedAt: null,
            grade: { is: { deletedAt: null } },
          },
        },
      },
      orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  findGradeById(gradeId: string): Promise<GradeReferenceRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findGradesByIds(gradeIds: string[]): Promise<GradeReferenceRecord[]> {
    if (gradeIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.grade.findMany({
      where: { id: { in: gradeIds } },
      ...GRADE_REFERENCE_ARGS,
    });
  }

  findTermById(termId: string): Promise<TermReferenceRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  findSubjectAllocationByKey(input: {
    termId: string;
    gradeId: string;
    subjectId: string;
  }): Promise<SubjectAllocationMatrixRecord | null> {
    return this.scopedPrisma.subjectAllocation.findFirst({
      where: {
        termId: input.termId,
        gradeId: input.gradeId,
        subjectId: input.subjectId,
        grade: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
      },
      ...SUBJECT_ALLOCATION_MATRIX_ARGS,
    });
  }

  findSubjectAllocationsByKeys(
    termId: string,
    keys: Array<{ gradeId: string; subjectId: string }>,
  ): Promise<SubjectAllocationMatrixRecord[]> {
    if (keys.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.subjectAllocation.findMany({
      where: {
        termId,
        OR: keys.map((key) => ({
          gradeId: key.gradeId,
          subjectId: key.subjectId,
        })),
        grade: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
      },
      ...SUBJECT_ALLOCATION_MATRIX_ARGS,
    });
  }

  listSubjectAllocationsForValidation(filters: {
    termId: string;
    gradeId?: string;
    subjectId?: string;
  }): Promise<SubjectAllocationMatrixRecord[]> {
    return this.scopedPrisma.subjectAllocation.findMany({
      where: {
        termId: filters.termId,
        ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        grade: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...SUBJECT_ALLOCATION_MATRIX_ARGS,
    });
  }

  createAllocation(
    data: Prisma.TeacherSubjectAllocationUncheckedCreateInput,
  ): Promise<TeacherAllocationRecord> {
    return this.scopedPrisma.teacherSubjectAllocation.create({
      data,
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  async bulkSaveAllocations(
    input: BulkSaveTeacherAllocationInput,
  ): Promise<BulkSaveTeacherAllocationResult> {
    const schoolId = this.getCurrentSchoolId();
    const affectedIds: string[] = [];
    let createdCount = 0;
    let existingCount = 0;

    return this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        const existing = await tx.teacherSubjectAllocation.findFirst({
          where: {
            schoolId,
            termId: input.termId,
            teacherUserId: item.teacherUserId,
            subjectId: item.subjectId,
            classroomId: item.classroomId,
          },
          select: { id: true },
        });

        if (existing) {
          existingCount += 1;
          affectedIds.push(existing.id);
          continue;
        }

        const created = await tx.teacherSubjectAllocation.create({
          data: {
            schoolId,
            termId: input.termId,
            teacherUserId: item.teacherUserId,
            subjectId: item.subjectId,
            classroomId: item.classroomId,
          },
          select: { id: true },
        });
        createdCount += 1;
        affectedIds.push(created.id);
      }

      const records = await tx.teacherSubjectAllocation.findMany({
        where: {
          schoolId,
          id: { in: affectedIds },
          teacherUser: { is: { deletedAt: null } },
          subject: { is: { deletedAt: null } },
          classroom: {
            is: {
              deletedAt: null,
              section: {
                is: { deletedAt: null, grade: { is: { deletedAt: null } } },
              },
            },
          },
          term: { is: { deletedAt: null } },
        },
        ...TEACHER_ALLOCATION_ARGS,
      });
      const byId = new Map(records.map((record) => [record.id, record]));

      return {
        allocations: affectedIds
          .map((id) => byId.get(id))
          .filter(
            (record): record is TeacherAllocationRecord => Boolean(record),
          ),
        createdCount,
        existingCount,
      };
    });
  }

  listAllocationsForValidation(filters: {
    termId: string;
    gradeId?: string;
    subjectId?: string;
  }): Promise<TeacherAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        termId: filters.termId,
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        teacherUser: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
        classroom: {
          is: {
            deletedAt: null,
            section: {
              is: {
                ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
                deletedAt: null,
                grade: { is: { deletedAt: null } },
              },
            },
          },
        },
        term: { is: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  listAllocationsForTeacherLoads(filters: {
    termId: string;
    teacherUserId?: string;
  }): Promise<TeacherAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        termId: filters.termId,
        ...(filters.teacherUserId ? { teacherUserId: filters.teacherUserId } : {}),
        teacherUser: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
        classroom: {
          is: {
            deletedAt: null,
            section: { is: { deletedAt: null, grade: { is: { deletedAt: null } } } },
          },
        },
        term: { is: { deletedAt: null } },
      },
      orderBy: [{ teacherUserId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  async countAllocationDependencies(
    allocationIds: string[],
  ): Promise<TeacherAllocationDependencyCounts> {
    if (allocationIds.length === 0) {
      return {
        timetableEntries: 0,
        lessonPlans: 0,
        homeworkAssignments: 0,
      };
    }

    const [timetableEntries, lessonPlans, homeworkAssignments] =
      await Promise.all([
        this.scopedPrisma.timetableEntry.count({
          where: { teacherSubjectAllocationId: { in: allocationIds } },
        }),
        this.scopedPrisma.lessonPlan.count({
          where: { teacherSubjectAllocationId: { in: allocationIds } },
        }),
        this.scopedPrisma.homeworkAssignment.count({
          where: { teacherSubjectAllocationId: { in: allocationIds } },
        }),
      ]);

    return { timetableEntries, lessonPlans, homeworkAssignments };
  }

  async deleteAllocation(
    allocationId: string,
  ): Promise<DeleteTeacherAllocationResult> {
    const result = await this.scopedPrisma.teacherSubjectAllocation.deleteMany({
      where: { id: allocationId },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }

  async clearSubjectAllocations(input: {
    termId: string;
    subjectId: string;
    classroomIds?: string[];
  }): Promise<ClearTeacherAllocationsResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const allocations = await tx.teacherSubjectAllocation.findMany({
        where: {
          schoolId,
          termId: input.termId,
          subjectId: input.subjectId,
          ...(input.classroomIds
            ? { classroomId: { in: input.classroomIds } }
            : {}),
        },
        select: { id: true },
      });
      const allocationIds = allocations.map((allocation) => allocation.id);
      if (allocationIds.length === 0) {
        return { status: 'deleted', deletedCount: 0 };
      }

      const dependencyCounts = await this.countAllocationDependenciesInTx(
        tx,
        schoolId,
        allocationIds,
      );
      if (hasDependencyCounts(dependencyCounts)) {
        return { status: 'conflict', dependencyCounts, allocationIds };
      }

      const result = await tx.teacherSubjectAllocation.deleteMany({
        where: { schoolId, id: { in: allocationIds } },
      });

      return { status: 'deleted', deletedCount: result.count };
    });
  }

  private async countAllocationDependenciesInTx(
    tx: Prisma.TransactionClient,
    schoolId: string,
    allocationIds: string[],
  ): Promise<TeacherAllocationDependencyCounts> {
    const [timetableEntries, lessonPlans, homeworkAssignments] =
      await Promise.all([
        tx.timetableEntry.count({
          where: {
            schoolId,
            teacherSubjectAllocationId: { in: allocationIds },
          },
        }),
        tx.lessonPlan.count({
          where: {
            schoolId,
            teacherSubjectAllocationId: { in: allocationIds },
            deletedAt: null,
          },
        }),
        tx.homeworkAssignment.count({
          where: {
            schoolId,
            teacherSubjectAllocationId: { in: allocationIds },
            deletedAt: null,
          },
        }),
      ]);

    return { timetableEntries, lessonPlans, homeworkAssignments };
  }
}

function hasDependencyCounts(counts: TeacherAllocationDependencyCounts): boolean {
  return (
    counts.timetableEntries > 0 ||
    counts.lessonPlans > 0 ||
    counts.homeworkAssignments > 0
  );
}
