import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementTaskStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';

const PARENT_HOME_IDENTITY_ARGS = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    email: true,
    phone: true,
    firstName: true,
    lastName: true,
    userType: true,
    status: true,
    deletedAt: true,
  },
});

const PARENT_HOME_CHILD_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()(
  {
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
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
  },
);

export type ParentHomeIdentityRecord = Prisma.UserGetPayload<
  typeof PARENT_HOME_IDENTITY_ARGS
>;

export type ParentHomeChildRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_HOME_CHILD_ARGS
>;

export interface ParentHomeSchoolDisplayRecord {
  name: string | null;
  logoUrl: null;
}

export interface ParentHomePendingTaskCountRecord {
  studentId: string;
  count: number;
}

const PENDING_ASSIGNMENT_STATUSES = [
  ReinforcementTaskStatus.NOT_COMPLETED,
  ReinforcementTaskStatus.IN_PROGRESS,
  ReinforcementTaskStatus.UNDER_REVIEW,
];

@Injectable()
export class ParentHomeReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findParentIdentity(
    context: ParentAppContext,
  ): Promise<ParentHomeIdentityRecord | null> {
    return this.scopedPrisma.user.findFirst({
      where: {
        id: context.parentUserId,
        userType: UserType.PARENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      ...PARENT_HOME_IDENTITY_ARGS,
    });
  }

  async findSchoolDisplay(
    context: ParentAppContext,
  ): Promise<ParentHomeSchoolDisplayRecord> {
    const profile = await this.scopedPrisma.schoolProfile.findFirst({
      select: {
        schoolName: true,
        shortName: true,
      },
    });

    if (profile) {
      return {
        name: profile.schoolName ?? profile.shortName,
        logoUrl: null,
      };
    }

    const school = await this.scopedPrisma.school.findFirst({
      where: {
        id: context.schoolId,
        organizationId: context.organizationId,
        deletedAt: null,
      },
      select: { name: true },
    });

    return {
      name: school?.name ?? null,
      logoUrl: null,
    };
  }

  listChildren(context: ParentAppContext): Promise<ParentHomeChildRecord[]> {
    if (context.children.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.enrollment.findMany({
      where: {
        id: { in: context.children.map((child) => child.enrollmentId) },
        studentId: { in: context.children.map((child) => child.studentId) },
        student: {
          is: {
            status: StudentStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...PARENT_HOME_CHILD_ARGS,
    });
  }

  async countPendingTasksForChildren(
    context: ParentAppContext,
  ): Promise<ParentHomePendingTaskCountRecord[]> {
    if (context.children.length === 0) return [];

    const assignments =
      await this.scopedPrisma.reinforcementAssignment.findMany({
        where: {
          OR: context.children.map((child) => ({
            studentId: child.studentId,
            enrollmentId: child.enrollmentId,
            academicYearId: child.academicYearId,
            ...(child.termId ? { termId: child.termId } : {}),
          })),
          status: { in: PENDING_ASSIGNMENT_STATUSES },
          task: {
            is: {
              deletedAt: null,
              status: { not: ReinforcementTaskStatus.CANCELLED },
            },
          },
        },
        select: {
          studentId: true,
        },
      });

    const countsByStudentId = new Map<string, number>();
    for (const assignment of assignments) {
      countsByStudentId.set(
        assignment.studentId,
        (countsByStudentId.get(assignment.studentId) ?? 0) + 1,
      );
    }

    return [...countsByStudentId.entries()].map(([studentId, count]) => ({
      studentId,
      count,
    }));
  }
}
