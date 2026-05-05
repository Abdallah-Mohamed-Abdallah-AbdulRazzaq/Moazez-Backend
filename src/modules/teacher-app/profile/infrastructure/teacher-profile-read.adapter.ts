import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';

const TEACHER_PROFILE_IDENTITY_ARGS =
  Prisma.validator<Prisma.UserDefaultArgs>()({
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      userType: true,
      status: true,
    },
  });

const TEACHER_PROFILE_ROLE_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    select: {
      roleId: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

export type TeacherProfileIdentityRecord = Prisma.UserGetPayload<
  typeof TEACHER_PROFILE_IDENTITY_ARGS
>;

export type TeacherProfileRoleRecord = Prisma.MembershipGetPayload<
  typeof TEACHER_PROFILE_ROLE_ARGS
>;

export interface TeacherProfileSchoolDisplayRecord {
  name: string | null;
  logoUrl: null;
}

@Injectable()
export class TeacherProfileReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findTeacherIdentity(
    teacherUserId: string,
  ): Promise<TeacherProfileIdentityRecord | null> {
    return this.scopedPrisma.user.findFirst({
      where: {
        id: teacherUserId,
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      ...TEACHER_PROFILE_IDENTITY_ARGS,
    });
  }

  findTeacherRole(
    context: TeacherAppContext,
  ): Promise<TeacherProfileRoleRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        id: context.membershipId,
        userId: context.teacherUserId,
        userType: UserType.TEACHER,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      ...TEACHER_PROFILE_ROLE_ARGS,
    });
  }

  async findSchoolDisplay(
    context: TeacherAppContext,
  ): Promise<TeacherProfileSchoolDisplayRecord> {
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

  async countDistinctStudentsForAllocations(
    allocations: TeacherAppAllocationRecord[],
  ): Promise<number> {
    const where = buildOwnedEnrollmentWhere(allocations);
    if (!where) return 0;

    const students = await this.scopedPrisma.enrollment.findMany({
      where,
      distinct: ['studentId'],
      select: { studentId: true },
    });

    return students.length;
  }
}

function buildOwnedEnrollmentWhere(
  allocations: TeacherAppAllocationRecord[],
): Prisma.EnrollmentWhereInput | null {
  const scopes = uniqueAllocationScopes(allocations).map((scope) => ({
    classroomId: scope.classroomId,
    academicYearId: scope.academicYearId,
    termId: scope.termId,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: {
      is: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
    },
  }));

  if (scopes.length === 0) return null;

  return { OR: scopes };
}

function uniqueAllocationScopes(
  allocations: TeacherAppAllocationRecord[],
): Array<{
  classroomId: string;
  academicYearId: string;
  termId: string;
}> {
  const seen = new Set<string>();
  const scopes: Array<{
    classroomId: string;
    academicYearId: string;
    termId: string;
  }> = [];

  for (const allocation of allocations) {
    const academicYearId = allocation.term?.academicYearId;
    if (!academicYearId) continue;

    const key = [
      allocation.classroomId,
      academicYearId,
      allocation.termId,
    ].join(':');
    if (seen.has(key)) continue;

    seen.add(key);
    scopes.push({
      classroomId: allocation.classroomId,
      academicYearId,
      termId: allocation.termId,
    });
  }

  return scopes;
}
