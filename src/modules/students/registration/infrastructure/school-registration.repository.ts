import { Injectable } from '@nestjs/common';
import { Prisma, StudentEnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const REGISTRATION_STUDENT_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()(
  {
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      applicationId: true,
      userId: true,
      firstName: true,
      fatherNameEn: true,
      grandfatherNameEn: true,
      lastName: true,
      firstNameAr: true,
      fatherNameAr: true,
      grandfatherNameAr: true,
      familyNameAr: true,
      birthDate: true,
      gender: true,
      nationality: true,
      addressLine: true,
      city: true,
      district: true,
      studentPhone: true,
      studentEmail: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  },
);

const REGISTRATION_STUDENT_SUMMARY_ARGS =
  Prisma.validator<Prisma.StudentDefaultArgs>()({
    select: {
      id: true,
      firstName: true,
      fatherNameEn: true,
      grandfatherNameEn: true,
      lastName: true,
      status: true,
    },
  });

const REGISTRATION_GUARDIAN_ARGS =
  Prisma.validator<Prisma.GuardianDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      userId: true,
      firstName: true,
      lastName: true,
      phone: true,
      phoneSecondary: true,
      email: true,
      nationalId: true,
      jobTitle: true,
      workplace: true,
      relation: true,
      isPrimary: true,
      canPickup: true,
      canReceiveNotifications: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

const REGISTRATION_LINK_ARGS =
  Prisma.validator<Prisma.StudentGuardianDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      guardianId: true,
      isPrimary: true,
      guardian: {
        select: REGISTRATION_GUARDIAN_ARGS.select,
      },
      student: {
        select: REGISTRATION_STUDENT_SUMMARY_ARGS.select,
      },
    },
  });

const REGISTRATION_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      enrolledAt: true,
      endedAt: true,
      exitReason: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      academicYear: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          isActive: true,
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
    },
  });

export type RegistrationStudentRecord = Prisma.StudentGetPayload<
  typeof REGISTRATION_STUDENT_ARGS
>;
export type RegistrationStudentGuardianLinkRecord =
  Prisma.StudentGuardianGetPayload<typeof REGISTRATION_LINK_ARGS>;
export type RegistrationEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof REGISTRATION_ENROLLMENT_ARGS
>;

export interface RegistrationCoreRecord {
  student: RegistrationStudentRecord;
  guardianLinks: RegistrationStudentGuardianLinkRecord[];
  enrollment: RegistrationEnrollmentRecord;
}

@Injectable()
export class SchoolRegistrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRegistrationCore(params: {
    schoolId: string;
    organizationId: string;
    student: Prisma.StudentUncheckedCreateInput;
    guardians: Array<{
      data: Prisma.GuardianUncheckedCreateInput;
      isPrimary: boolean;
    }>;
    enrollment: {
      academicYearId: string;
      termId?: string | null;
      classroomId: string;
      enrolledAt: Date;
    };
  }): Promise<RegistrationCoreRecord> {
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: params.student,
        ...REGISTRATION_STUDENT_ARGS,
      });

      const guardianLinks: RegistrationStudentGuardianLinkRecord[] = [];

      for (const guardianCommand of params.guardians) {
        const guardian = await tx.guardian.create({
          data: guardianCommand.data,
          ...REGISTRATION_GUARDIAN_ARGS,
        });

        const link = await tx.studentGuardian.create({
          data: {
            schoolId: params.schoolId,
            studentId: student.id,
            guardianId: guardian.id,
            isPrimary: guardianCommand.isPrimary,
          },
          ...REGISTRATION_LINK_ARGS,
        });

        guardianLinks.push(link);
      }

      const enrollment = await tx.enrollment.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          academicYearId: params.enrollment.academicYearId,
          termId: params.enrollment.termId ?? null,
          classroomId: params.enrollment.classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: params.enrollment.enrolledAt,
          endedAt: null,
          exitReason: null,
        },
        ...REGISTRATION_ENROLLMENT_ARGS,
      });

      return {
        student,
        guardianLinks,
        enrollment,
      };
    });
  }
}
