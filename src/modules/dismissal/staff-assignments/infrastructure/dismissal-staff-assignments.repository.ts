import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_STAGE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
  },
});

const ACADEMIC_GRADE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    stageId: true,
    nameAr: true,
    nameEn: true,
    stage: ACADEMIC_STAGE_ARGS,
  },
});

const ACADEMIC_SECTION_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    gradeId: true,
    nameAr: true,
    nameEn: true,
    grade: ACADEMIC_GRADE_ARGS,
  },
});

const ACADEMIC_CLASSROOM_ARGS = Prisma.validator<Prisma.ClassroomDefaultArgs>()({
  select: {
    id: true,
    sectionId: true,
    nameAr: true,
    nameEn: true,
    section: ACADEMIC_SECTION_ARGS,
  },
});

const DISMISSAL_STAFF_ASSIGNMENT_ARGS =
  Prisma.validator<Prisma.DismissalStaffAssignmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      staffUserId: true,
      gateId: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      isLead: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      notes: true,
      createdById: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      staffUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true,
        },
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          deletedAt: true,
        },
      },
      stage: ACADEMIC_STAGE_ARGS,
      grade: ACADEMIC_GRADE_ARGS,
      section: ACADEMIC_SECTION_ARGS,
      classroom: ACADEMIC_CLASSROOM_ARGS,
    },
  });

const DISMISSAL_PROFILE_USER_ARGS = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    userType: true,
    status: true,
  },
});

const DISMISSAL_PROFILE_SCHOOL_ARGS =
  Prisma.validator<Prisma.SchoolDefaultArgs>()({
    select: {
      id: true,
      name: true,
      dismissalSettings: {
        select: { timezone: true },
      },
      schoolProfile: {
        select: { timezone: true },
      },
    },
  });

export type DismissalStaffAssignmentRecord =
  Prisma.DismissalStaffAssignmentGetPayload<
    typeof DISMISSAL_STAFF_ASSIGNMENT_ARGS
  >;

export type DismissalProfileUserRecord = Prisma.UserGetPayload<
  typeof DISMISSAL_PROFILE_USER_ARGS
>;

export type DismissalProfileSchoolRecord = Prisma.SchoolGetPayload<
  typeof DISMISSAL_PROFILE_SCHOOL_ARGS
>;

export type DismissalStageScopeRecord = Prisma.StageGetPayload<
  typeof ACADEMIC_STAGE_ARGS
>;
export type DismissalGradeScopeRecord = Prisma.GradeGetPayload<
  typeof ACADEMIC_GRADE_ARGS
>;
export type DismissalSectionScopeRecord = Prisma.SectionGetPayload<
  typeof ACADEMIC_SECTION_ARGS
>;
export type DismissalClassroomScopeRecord = Prisma.ClassroomGetPayload<
  typeof ACADEMIC_CLASSROOM_ARGS
>;

export interface DismissalStaffAssignmentListFilters {
  staffUserId?: string;
  gateId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  isActive?: boolean;
  isLead?: boolean;
  q?: string;
}

export interface DismissalStaffAssignmentPagination {
  page?: number;
  limit?: number;
}

export interface DismissalStaffAssignmentSummaryCounts {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  leadCount: number;
}

export interface DismissalAssignmentScopeIds {
  gateId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

@Injectable()
export class DismissalStaffAssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'DismissalStaffAssignmentsRepository requires a school scope.',
      );
    }

    return schoolId;
  }

  async listAssignments(
    filters: DismissalStaffAssignmentListFilters,
    pagination: DismissalStaffAssignmentPagination,
  ): Promise<{
    assignments: DismissalStaffAssignmentRecord[];
    summary: DismissalStaffAssignmentSummaryCounts;
  }> {
    const where = this.buildWhere(filters);
    const take = pagination.limit;
    const skip =
      pagination.page && pagination.limit
        ? (pagination.page - 1) * pagination.limit
        : undefined;

    const [assignments, totalCount, activeCount, inactiveCount, leadCount] =
      await Promise.all([
        this.scopedPrisma.dismissalStaffAssignment.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
          ...DISMISSAL_STAFF_ASSIGNMENT_ARGS,
        }),
        this.scopedPrisma.dismissalStaffAssignment.count({ where }),
        filters.isActive === false
          ? Promise.resolve(0)
          : this.scopedPrisma.dismissalStaffAssignment.count({
              where: { ...where, isActive: true },
            }),
        filters.isActive === true
          ? Promise.resolve(0)
          : this.scopedPrisma.dismissalStaffAssignment.count({
              where: { ...where, isActive: false },
            }),
        filters.isLead === false
          ? Promise.resolve(0)
          : this.scopedPrisma.dismissalStaffAssignment.count({
              where: { ...where, isLead: true },
            }),
      ]);

    return {
      assignments,
      summary: {
        totalCount,
        activeCount,
        inactiveCount,
        leadCount,
      },
    };
  }

  findAssignmentById(
    assignmentId: string,
  ): Promise<DismissalStaffAssignmentRecord | null> {
    return this.scopedPrisma.dismissalStaffAssignment.findFirst({
      where: { id: assignmentId },
      ...DISMISSAL_STAFF_ASSIGNMENT_ARGS,
    });
  }

  listActiveAssignmentsForStaff(
    staffUserId: string,
  ): Promise<DismissalStaffAssignmentRecord[]> {
    return this.scopedPrisma.dismissalStaffAssignment.findMany({
      where: {
        staffUserId,
        isActive: true,
      },
      orderBy: [{ isLead: 'desc' }, { createdAt: 'desc' }],
      ...DISMISSAL_STAFF_ASSIGNMENT_ARGS,
    });
  }

  findProfileUser(userId: string): Promise<DismissalProfileUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      ...DISMISSAL_PROFILE_USER_ARGS,
    });
  }

  findProfileSchool(
    schoolId: string,
  ): Promise<DismissalProfileSchoolRecord | null> {
    return this.prisma.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      ...DISMISSAL_PROFILE_SCHOOL_ARGS,
    });
  }

  findStaffUser(userId: string): Promise<DismissalProfileUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      ...DISMISSAL_PROFILE_USER_ARGS,
    });
  }

  async hasActiveStaffMembership(userId: string): Promise<boolean> {
    const membership = await this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        userType: UserType.DISMISSAL_STAFF,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        user: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      },
      select: { id: true },
    });

    return Boolean(membership);
  }

  findGateById(gateId: string) {
    return this.scopedPrisma.dismissalGate.findFirst({
      where: { id: gateId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });
  }

  findStageById(
    stageId: string,
  ): Promise<DismissalStageScopeRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...ACADEMIC_STAGE_ARGS,
    });
  }

  findGradeById(
    gradeId: string,
  ): Promise<DismissalGradeScopeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...ACADEMIC_GRADE_ARGS,
    });
  }

  findSectionById(
    sectionId: string,
  ): Promise<DismissalSectionScopeRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...ACADEMIC_SECTION_ARGS,
    });
  }

  findClassroomById(
    classroomId: string,
  ): Promise<DismissalClassroomScopeRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...ACADEMIC_CLASSROOM_ARGS,
    });
  }

  findDuplicateActiveAssignment(params: {
    staffUserId: string;
    scope: DismissalAssignmentScopeIds;
    excludeAssignmentId?: string;
  }): Promise<DismissalStaffAssignmentRecord | null> {
    return this.scopedPrisma.dismissalStaffAssignment.findFirst({
      where: {
        staffUserId: params.staffUserId,
        gateId: params.scope.gateId,
        stageId: params.scope.stageId,
        gradeId: params.scope.gradeId,
        sectionId: params.scope.sectionId,
        classroomId: params.scope.classroomId,
        isActive: true,
        ...(params.excludeAssignmentId
          ? { id: { not: params.excludeAssignmentId } }
          : {}),
      },
      ...DISMISSAL_STAFF_ASSIGNMENT_ARGS,
    });
  }

  createAssignment(
    data: Prisma.DismissalStaffAssignmentUncheckedCreateInput,
  ): Promise<DismissalStaffAssignmentRecord> {
    return this.prisma.dismissalStaffAssignment.create({
      data,
      ...DISMISSAL_STAFF_ASSIGNMENT_ARGS,
    });
  }

  updateAssignment(
    assignmentId: string,
    data: Prisma.DismissalStaffAssignmentUncheckedUpdateInput,
  ): Promise<DismissalStaffAssignmentRecord> {
    return this.prisma.dismissalStaffAssignment.update({
      where: {
        id_schoolId: {
          id: assignmentId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...DISMISSAL_STAFF_ASSIGNMENT_ARGS,
    });
  }

  private buildWhere(
    filters: DismissalStaffAssignmentListFilters,
  ): Prisma.DismissalStaffAssignmentWhereInput {
    const q = filters.q?.trim();

    return {
      ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
      ...(filters.gateId ? { gateId: filters.gateId } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
      ...(filters.isActive === undefined
        ? {}
        : { isActive: filters.isActive }),
      ...(filters.isLead === undefined ? {} : { isLead: filters.isLead }),
      ...(q
        ? {
            OR: [
              { staffUser: { email: { contains: q, mode: 'insensitive' } } },
              {
                staffUser: {
                  firstName: { contains: q, mode: 'insensitive' },
                },
              },
              {
                staffUser: {
                  lastName: { contains: q, mode: 'insensitive' },
                },
              },
              { gate: { code: { contains: q, mode: 'insensitive' } } },
              { gate: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }
}
