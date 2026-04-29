import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  StudentEnrollmentStatus,
  XpSourceType,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  XpResolvedScope,
  XpScopeCandidate,
} from '../domain/reinforcement-xp-domain';

const POLICY_ARGS = Prisma.validator<Prisma.XpPolicyDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    termId: true,
    scopeType: true,
    scopeKey: true,
    dailyCap: true,
    weeklyCap: true,
    cooldownMinutes: true,
    allowedReasons: true,
    startsAt: true,
    endsAt: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.StudentSelect;

const ENROLLMENT_PLACEMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      deletedAt: true,
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          sectionId: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              gradeId: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  stageId: true,
                  stage: {
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
        },
      },
    },
  });

const LEDGER_ARGS = Prisma.validator<Prisma.XpLedgerDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    termId: true,
    studentId: true,
    enrollmentId: true,
    assignmentId: true,
    policyId: true,
    sourceType: true,
    sourceId: true,
    amount: true,
    reason: true,
    reasonAr: true,
    actorUserId: true,
    occurredAt: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    student: {
      select: STUDENT_SUMMARY_SELECT,
    },
    enrollment: ENROLLMENT_PLACEMENT_ARGS,
  },
});

const SUBMISSION_FOR_XP_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assignmentId: true,
      taskId: true,
      stageId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      currentReviewId: true,
      reviewedAt: true,
      task: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          rewardType: true,
          rewardValue: true,
          deletedAt: true,
        },
      },
      assignment: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          studentId: true,
          enrollmentId: true,
          status: true,
          progress: true,
          completedAt: true,
        },
      },
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      enrollment: ENROLLMENT_PLACEMENT_ARGS,
    },
  });

const ACADEMIC_YEAR_REFERENCE_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      isActive: true,
    },
  });

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    isActive: true,
  },
});

const STAGE_REFERENCE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
  },
});

const GRADE_REFERENCE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    stageId: true,
  },
});

const SECTION_REFERENCE_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    gradeId: true,
    grade: {
      select: {
        stageId: true,
      },
    },
  },
});

const CLASSROOM_REFERENCE_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
    select: {
      id: true,
      sectionId: true,
      section: {
        select: {
          gradeId: true,
          grade: {
            select: {
              stageId: true,
            },
          },
        },
      },
    },
  });

export type XpPolicyRecord = Prisma.XpPolicyGetPayload<typeof POLICY_ARGS>;
export type XpLedgerRecord = Prisma.XpLedgerGetPayload<typeof LEDGER_ARGS>;
export type XpSubmissionForGrantRecord =
  Prisma.ReinforcementSubmissionGetPayload<typeof SUBMISSION_FOR_XP_ARGS>;
export type XpAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_REFERENCE_ARGS
>;
export type XpTermRecord = Prisma.TermGetPayload<typeof TERM_REFERENCE_ARGS>;
export type XpEnrollmentPlacementRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_PLACEMENT_ARGS
>;
export type XpStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SUMMARY_SELECT;
}>;

export interface XpPolicyFilters {
  academicYearId?: string;
  termId?: string;
  scopeType?: ReinforcementTargetScope;
  scopeKey?: string;
  isActive?: boolean;
  includeDeleted?: boolean;
}

export interface XpLedgerFilters {
  academicYearId?: string;
  termId?: string;
  studentId?: string;
  classroomId?: string;
  sectionId?: string;
  gradeId?: string;
  stageId?: string;
  sourceType?: XpSourceType;
  sourceId?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
  offset?: number;
}

export interface ActivePolicyConflictLookup {
  academicYearId: string;
  termId: string;
  scopeType: ReinforcementTargetScope;
  scopeKey: string;
  excludeId?: string;
}

@Injectable()
export class ReinforcementXpRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<XpAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_REFERENCE_ARGS,
    });
  }

  findTerm(termId: string): Promise<XpTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  async findScopeResource(params: {
    schoolId: string;
    scopeType: ReinforcementTargetScope;
    scopeKey: string;
  }): Promise<XpResolvedScope | null> {
    switch (params.scopeType) {
      case ReinforcementTargetScope.SCHOOL:
        return params.scopeKey === params.schoolId
          ? {
              scopeType: ReinforcementTargetScope.SCHOOL,
              scopeKey: params.schoolId,
              stageId: null,
              gradeId: null,
              sectionId: null,
              classroomId: null,
              studentId: null,
            }
          : null;

      case ReinforcementTargetScope.STAGE: {
        const stage = await this.scopedPrisma.stage.findFirst({
          where: { id: params.scopeKey },
          ...STAGE_REFERENCE_ARGS,
        });
        return stage
          ? {
              scopeType: ReinforcementTargetScope.STAGE,
              scopeKey: stage.id,
              stageId: stage.id,
              gradeId: null,
              sectionId: null,
              classroomId: null,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.GRADE: {
        const grade = await this.scopedPrisma.grade.findFirst({
          where: { id: params.scopeKey },
          ...GRADE_REFERENCE_ARGS,
        });
        return grade
          ? {
              scopeType: ReinforcementTargetScope.GRADE,
              scopeKey: grade.id,
              stageId: grade.stageId,
              gradeId: grade.id,
              sectionId: null,
              classroomId: null,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.SECTION: {
        const section = await this.scopedPrisma.section.findFirst({
          where: { id: params.scopeKey },
          ...SECTION_REFERENCE_ARGS,
        });
        return section
          ? {
              scopeType: ReinforcementTargetScope.SECTION,
              scopeKey: section.id,
              stageId: section.grade.stageId,
              gradeId: section.gradeId,
              sectionId: section.id,
              classroomId: null,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.CLASSROOM: {
        const classroom = await this.scopedPrisma.classroom.findFirst({
          where: { id: params.scopeKey },
          ...CLASSROOM_REFERENCE_ARGS,
        });
        return classroom
          ? {
              scopeType: ReinforcementTargetScope.CLASSROOM,
              scopeKey: classroom.id,
              stageId: classroom.section.grade.stageId,
              gradeId: classroom.section.gradeId,
              sectionId: classroom.sectionId,
              classroomId: classroom.id,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.STUDENT: {
        const student = await this.findStudent(params.scopeKey);
        return student
          ? {
              scopeType: ReinforcementTargetScope.STUDENT,
              scopeKey: student.id,
              stageId: null,
              gradeId: null,
              sectionId: null,
              classroomId: null,
              studentId: student.id,
            }
          : null;
      }
    }
  }

  listPolicies(filters: XpPolicyFilters): Promise<XpPolicyRecord[]> {
    const query = () =>
      this.scopedPrisma.xpPolicy.findMany({
        where: {
          ...(filters.academicYearId
            ? { academicYearId: filters.academicYearId }
            : {}),
          ...(filters.termId ? { termId: filters.termId } : {}),
          ...(filters.scopeType ? { scopeType: filters.scopeType } : {}),
          ...(filters.scopeKey ? { scopeKey: filters.scopeKey } : {}),
          ...(filters.isActive !== undefined
            ? { isActive: filters.isActive }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...POLICY_ARGS,
      });

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  findPolicyById(policyId: string): Promise<XpPolicyRecord | null> {
    return this.scopedPrisma.xpPolicy.findFirst({
      where: { id: policyId },
      ...POLICY_ARGS,
    });
  }

  findEffectivePolicyCandidates(params: {
    academicYearId: string;
    termId: string;
    candidates: XpScopeCandidate[];
    now: Date;
  }): Promise<XpPolicyRecord[]> {
    return this.scopedPrisma.xpPolicy.findMany({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        isActive: true,
        OR: params.candidates.map((candidate) => ({
          scopeType: candidate.scopeType,
          scopeKey: candidate.scopeKey,
        })),
        AND: [
          {
            OR: [{ startsAt: null }, { startsAt: { lte: params.now } }],
          },
          {
            OR: [{ endsAt: null }, { endsAt: { gte: params.now } }],
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      ...POLICY_ARGS,
    });
  }

  createPolicy(
    data: Prisma.XpPolicyUncheckedCreateInput,
  ): Promise<XpPolicyRecord> {
    return this.scopedPrisma.xpPolicy.create({
      data,
      ...POLICY_ARGS,
    });
  }

  async updatePolicy(
    policyId: string,
    data: Prisma.XpPolicyUncheckedUpdateInput,
  ): Promise<XpPolicyRecord> {
    await this.scopedPrisma.xpPolicy.updateMany({
      where: { id: policyId },
      data: data as Prisma.XpPolicyUncheckedUpdateManyInput,
    });

    const updated = await this.findPolicyById(policyId);
    if (!updated) {
      throw new Error('XP policy update failed');
    }

    return updated;
  }

  checkActivePolicyConflict(
    lookup: ActivePolicyConflictLookup,
  ): Promise<XpPolicyRecord | null> {
    return this.scopedPrisma.xpPolicy.findFirst({
      where: {
        academicYearId: lookup.academicYearId,
        termId: lookup.termId,
        scopeType: lookup.scopeType,
        scopeKey: lookup.scopeKey,
        isActive: true,
        ...(lookup.excludeId ? { id: { not: lookup.excludeId } } : {}),
      },
      ...POLICY_ARGS,
    });
  }

  async listLedger(filters: XpLedgerFilters): Promise<{
    items: XpLedgerRecord[];
    total: number;
  }> {
    const where = this.buildLedgerWhere(filters);
    const [items, total] = await Promise.all([
      this.scopedPrisma.xpLedger.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        ...(filters.limit ? { take: filters.limit } : {}),
        ...(filters.offset ? { skip: filters.offset } : {}),
        ...LEDGER_ARGS,
      }),
      this.scopedPrisma.xpLedger.count({ where }),
    ]);

    return { items, total };
  }

  findLedgerForSummary(filters: XpLedgerFilters): Promise<XpLedgerRecord[]> {
    return this.scopedPrisma.xpLedger.findMany({
      where: this.buildLedgerWhere(filters),
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      ...LEDGER_ARGS,
    });
  }

  findSubmissionForXpGrant(
    submissionId: string,
  ): Promise<XpSubmissionForGrantRecord | null> {
    return this.scopedPrisma.reinforcementSubmission.findFirst({
      where: {
        id: submissionId,
        task: { deletedAt: null },
      },
      ...SUBMISSION_FOR_XP_ARGS,
    });
  }

  findStudent(studentId: string): Promise<XpStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  findEnrollment(
    enrollmentId: string,
  ): Promise<XpEnrollmentPlacementRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: { id: enrollmentId },
      ...ENROLLMENT_PLACEMENT_ARGS,
    });
  }

  resolveEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId: string;
  }): Promise<XpEnrollmentPlacementRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        status: StudentEnrollmentStatus.ACTIVE,
      },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
      ...ENROLLMENT_PLACEMENT_ARGS,
    });
  }

  async sumXpForPeriod(params: {
    academicYearId: string;
    termId: string;
    studentId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        occurredAt: {
          gte: params.from,
          lt: params.to,
        },
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0;
  }

  async findLatestXpForCooldown(params: {
    academicYearId: string;
    termId: string;
    studentId: string;
    beforeOrAt: Date;
  }): Promise<{ occurredAt: Date } | null> {
    return this.scopedPrisma.xpLedger.findFirst({
      where: {
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        occurredAt: { lte: params.beforeOrAt },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      select: { occurredAt: true },
    });
  }

  findExistingLedgerBySource(params: {
    sourceType: XpSourceType;
    sourceId: string;
    studentId: string;
  }): Promise<XpLedgerRecord | null> {
    return this.scopedPrisma.xpLedger.findFirst({
      where: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        studentId: params.studentId,
      },
      ...LEDGER_ARGS,
    });
  }

  createXpLedger(
    data: Prisma.XpLedgerUncheckedCreateInput,
  ): Promise<XpLedgerRecord> {
    return this.scopedPrisma.xpLedger.create({
      data,
      ...LEDGER_ARGS,
    });
  }

  private buildLedgerWhere(
    filters: XpLedgerFilters,
  ): Prisma.XpLedgerWhereInput {
    const and: Prisma.XpLedgerWhereInput[] = [];

    if (filters.classroomId) {
      and.push({ enrollment: { classroomId: filters.classroomId } });
    }
    if (filters.sectionId) {
      and.push({
        enrollment: { classroom: { sectionId: filters.sectionId } },
      });
    }
    if (filters.gradeId) {
      and.push({
        enrollment: {
          classroom: { section: { gradeId: filters.gradeId } },
        },
      });
    }
    if (filters.stageId) {
      and.push({
        enrollment: {
          classroom: {
            section: { grade: { stageId: filters.stageId } },
          },
        },
      });
    }
    if (filters.occurredFrom) {
      and.push({ occurredAt: { gte: filters.occurredFrom } });
    }
    if (filters.occurredTo) {
      and.push({ occurredAt: { lte: filters.occurredTo } });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }
}
