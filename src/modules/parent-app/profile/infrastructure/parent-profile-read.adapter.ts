import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';

const PARENT_PROFILE_IDENTITY_ARGS = Prisma.validator<Prisma.UserDefaultArgs>()(
  {
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
  },
);

const PARENT_PROFILE_GUARDIAN_ARGS =
  Prisma.validator<Prisma.GuardianDefaultArgs>()({
    select: {
      id: true,
      relation: true,
      isPrimary: true,
    },
  });

const PARENT_PROFILE_CHILD_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  });

export type ParentProfileIdentityRecord = Prisma.UserGetPayload<
  typeof PARENT_PROFILE_IDENTITY_ARGS
>;

export type ParentProfileGuardianRecord = Prisma.GuardianGetPayload<
  typeof PARENT_PROFILE_GUARDIAN_ARGS
>;

export type ParentProfileChildRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_PROFILE_CHILD_ARGS
>;

export interface ParentProfileSchoolDisplayRecord {
  name: string | null;
  logoUrl: null;
}

@Injectable()
export class ParentProfileReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findParentIdentity(
    context: ParentAppContext,
  ): Promise<ParentProfileIdentityRecord | null> {
    return this.scopedPrisma.user.findFirst({
      where: {
        id: context.parentUserId,
        userType: UserType.PARENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      ...PARENT_PROFILE_IDENTITY_ARGS,
    });
  }

  listGuardians(
    context: ParentAppContext,
  ): Promise<ParentProfileGuardianRecord[]> {
    if (context.guardianIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.guardian.findMany({
      where: {
        id: { in: context.guardianIds },
        userId: context.parentUserId,
        deletedAt: null,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...PARENT_PROFILE_GUARDIAN_ARGS,
    });
  }

  listChildren(context: ParentAppContext): Promise<ParentProfileChildRecord[]> {
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
      ...PARENT_PROFILE_CHILD_ARGS,
    });
  }

  async findSchoolDisplay(
    context: ParentAppContext,
  ): Promise<ParentProfileSchoolDisplayRecord> {
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
}
