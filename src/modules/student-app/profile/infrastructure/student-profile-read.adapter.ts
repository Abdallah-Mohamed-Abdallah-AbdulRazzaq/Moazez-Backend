import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_PROFILE_IDENTITY_ARGS =
  Prisma.validator<Prisma.StudentDefaultArgs>()({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      status: true,
      user: {
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
    },
  });

const STUDENT_PROFILE_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
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
  });

export type StudentProfileIdentityRecord = Prisma.StudentGetPayload<
  typeof STUDENT_PROFILE_IDENTITY_ARGS
>;

export type StudentProfileEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof STUDENT_PROFILE_ENROLLMENT_ARGS
>;

export interface StudentProfileSchoolDisplayRecord {
  name: string | null;
  logoUrl: null;
}

@Injectable()
export class StudentProfileReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findStudentProfile(
    context: StudentAppContext,
  ): Promise<StudentProfileIdentityRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: {
        id: context.studentId,
        userId: context.studentUserId,
        status: StudentStatus.ACTIVE,
        user: {
          is: {
            id: context.studentUserId,
            userType: UserType.STUDENT,
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      ...STUDENT_PROFILE_IDENTITY_ARGS,
    });
  }

  findCurrentEnrollment(
    context: StudentAppContext,
  ): Promise<StudentProfileEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_PROFILE_ENROLLMENT_ARGS,
    });
  }

  async findSchoolDisplay(
    context: StudentAppContext,
  ): Promise<StudentProfileSchoolDisplayRecord> {
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

  async sumTotalXpForCurrentStudent(
    context: StudentAppContext,
  ): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        studentId: context.studentId,
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ?? 0;
  }
}
