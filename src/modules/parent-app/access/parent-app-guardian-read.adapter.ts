import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../shared/parent-app.types';

const PARENT_APP_GUARDIAN_ARGS = Prisma.validator<Prisma.GuardianDefaultArgs>()(
  {
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      userId: true,
      deletedAt: true,
      user: {
        select: {
          id: true,
          userType: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
);

const PARENT_APP_STUDENT_GUARDIAN_ARGS =
  Prisma.validator<Prisma.StudentGuardianDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      guardianId: true,
      student: {
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

const PARENT_APP_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      deletedAt: true,
      student: {
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

/**
 * Read-only Parent App ownership adapter. It relies on prisma.scoped so the
 * active RequestContext school remains the boundary for every parent lookup.
 */
@Injectable()
export class ParentAppGuardianReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listCurrentSchoolGuardiansByUserId(
    parentUserId: string,
  ): Promise<ParentAppGuardianRecord[]> {
    return this.scopedPrisma.guardian.findMany({
      where: currentParentGuardianWhere(parentUserId),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...PARENT_APP_GUARDIAN_ARGS,
    });
  }

  listLinkedStudentsForGuardians(
    guardianIds: string[],
  ): Promise<ParentAppStudentGuardianLinkRecord[]> {
    if (guardianIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.studentGuardian.findMany({
      where: {
        guardianId: { in: guardianIds },
        guardian: {
          is: currentGuardianByIdsWhere(guardianIds),
        },
        student: {
          is: activeLinkedStudentWhere(),
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...PARENT_APP_STUDENT_GUARDIAN_ARGS,
    });
  }

  listActiveEnrollmentsForLinkedStudents(params: {
    guardianIds: string[];
    studentIds: string[];
  }): Promise<ParentAppEnrollmentRecord[]> {
    if (params.guardianIds.length === 0 || params.studentIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.scopedPrisma.enrollment.findMany({
      where: {
        studentId: { in: params.studentIds },
        ...activeOwnedEnrollmentWhere(params.guardianIds),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...PARENT_APP_ENROLLMENT_ARGS,
    });
  }

  findOwnedActiveEnrollmentForStudent(params: {
    studentId: string;
    guardianIds: string[];
  }): Promise<ParentAppEnrollmentRecord | null> {
    if (params.guardianIds.length === 0) return Promise.resolve(null);

    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        ...activeOwnedEnrollmentWhere(params.guardianIds),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...PARENT_APP_ENROLLMENT_ARGS,
    });
  }

  findOwnedEnrollmentById(params: {
    enrollmentId: string;
    guardianIds: string[];
  }): Promise<ParentAppEnrollmentRecord | null> {
    if (params.guardianIds.length === 0) return Promise.resolve(null);

    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: params.enrollmentId,
        ...activeOwnedEnrollmentWhere(params.guardianIds),
      },
      ...PARENT_APP_ENROLLMENT_ARGS,
    });
  }

  findOwnedClassroomEnrollment(params: {
    classroomId: string;
    guardianIds: string[];
  }): Promise<ParentAppEnrollmentRecord | null> {
    if (params.guardianIds.length === 0) return Promise.resolve(null);

    return this.scopedPrisma.enrollment.findFirst({
      where: {
        classroomId: params.classroomId,
        ...activeOwnedEnrollmentWhere(params.guardianIds),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...PARENT_APP_ENROLLMENT_ARGS,
    });
  }
}

function currentParentGuardianWhere(
  parentUserId: string,
): Prisma.GuardianWhereInput {
  return {
    userId: parentUserId,
    deletedAt: null,
    user: {
      is: {
        id: parentUserId,
        userType: UserType.PARENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
  };
}

function currentGuardianByIdsWhere(
  guardianIds: string[],
): Prisma.GuardianWhereInput {
  return {
    id: { in: guardianIds },
    deletedAt: null,
  };
}

function activeLinkedStudentWhere(): Prisma.StudentWhereInput {
  return {
    status: StudentStatus.ACTIVE,
    deletedAt: null,
  };
}

function activeOwnedEnrollmentWhere(
  guardianIds: string[],
): Prisma.EnrollmentWhereInput {
  return {
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: {
      is: {
        ...activeLinkedStudentWhere(),
        guardians: {
          some: {
            guardianId: { in: guardianIds },
            guardian: {
              is: currentGuardianByIdsWhere(guardianIds),
            },
          },
        },
      },
    },
  };
}
