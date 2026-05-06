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
  StudentAppEnrollmentRecord,
  StudentAppStudentRecord,
} from '../shared/student-app.types';

const STUDENT_APP_STUDENT_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    organizationId: true,
    userId: true,
    status: true,
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
});

const STUDENT_APP_ENROLLMENT_ARGS =
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
    },
  });

/**
 * Narrow read-only adapter for resolving Student App ownership. It relies on
 * the school-scoped Prisma client and never mutates core Students data.
 */
@Injectable()
export class StudentAppStudentReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findLinkedStudentByUserId(
    studentUserId: string,
  ): Promise<StudentAppStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: activeLinkedStudentWhere(studentUserId),
      ...STUDENT_APP_STUDENT_ARGS,
    });
  }

  findActiveEnrollmentForStudent(params: {
    studentId: string;
    studentUserId: string;
    academicYearId?: string;
    termId?: string;
  }): Promise<StudentAppEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: activeOwnedEnrollmentWhere(params),
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...STUDENT_APP_ENROLLMENT_ARGS,
    });
  }

  findOwnedStudentById(params: {
    studentId: string;
    studentUserId: string;
  }): Promise<StudentAppStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: {
        id: params.studentId,
        ...activeLinkedStudentWhere(params.studentUserId),
      },
      ...STUDENT_APP_STUDENT_ARGS,
    });
  }

  findOwnedEnrollmentById(params: {
    enrollmentId: string;
    studentId: string;
    studentUserId: string;
  }): Promise<StudentAppEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: params.enrollmentId,
        ...activeOwnedEnrollmentWhere(params),
      },
      ...STUDENT_APP_ENROLLMENT_ARGS,
    });
  }

  findOwnedClassroomEnrollment(params: {
    classroomId: string;
    studentId: string;
    studentUserId: string;
  }): Promise<StudentAppEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        classroomId: params.classroomId,
        ...activeOwnedEnrollmentWhere(params),
      },
      ...STUDENT_APP_ENROLLMENT_ARGS,
    });
  }
}

function activeLinkedStudentWhere(
  studentUserId: string,
): Prisma.StudentWhereInput {
  return {
    userId: studentUserId,
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    user: {
      is: {
        id: studentUserId,
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
  };
}

function activeOwnedEnrollmentWhere(params: {
  studentId: string;
  studentUserId: string;
  academicYearId?: string;
  termId?: string;
}): Prisma.EnrollmentWhereInput {
  return {
    studentId: params.studentId,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    ...(params.academicYearId ? { academicYearId: params.academicYearId } : {}),
    ...(params.termId ? { termId: params.termId } : {}),
    student: {
      is: activeLinkedStudentWhere(params.studentUserId),
    },
  };
}
