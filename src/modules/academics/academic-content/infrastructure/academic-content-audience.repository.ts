import { Injectable } from '@nestjs/common';
import { Prisma, StudentEnrollmentStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ELIGIBLE_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      classroomId: true,
      student: { select: { userId: true } },
      classroom: {
        select: {
          sectionId: true,
          section: {
            select: {
              gradeId: true,
              grade: { select: { stageId: true } },
            },
          },
        },
      },
    },
  });

export type EligibleAcademicEnrollment = Prisma.EnrollmentGetPayload<
  typeof ELIGIBLE_ENROLLMENT_ARGS
>;

@Injectable()
export class AcademicContentAudienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  loadContent(id: string, schoolId: string) {
    return this.prisma.academicContent.findFirst({
      where: { id, schoolId, deletedAt: null },
      select: {
        id: true,
        schoolId: true,
        academicYearId: true,
        termId: true,
        type: true,
        audience: true,
      },
    });
  }

  loadTargets(academicContentId: string, schoolId: string) {
    return this.prisma.academicContentTarget.findMany({
      where: { academicContentId, schoolId },
      orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        scopeType: true,
        stageId: true,
        gradeId: true,
        sectionId: true,
        classroomId: true,
        subjectId: true,
      },
    });
  }

  eligibleEnrollments(
    schoolId: string,
    academicYearId: string,
    termId: string,
  ): Promise<EligibleAcademicEnrollment[]> {
    return this.prisma.enrollment.findMany({
      where: {
        schoolId,
        academicYearId,
        termId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { schoolId, status: StudentStatus.ACTIVE, deletedAt: null },
        classroom: {
          schoolId,
          deletedAt: null,
          section: {
            schoolId,
            deletedAt: null,
            grade: {
              schoolId,
              deletedAt: null,
              stage: { schoolId, deletedAt: null },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      ...ELIGIBLE_ENROLLMENT_ARGS,
    });
  }

  taughtGradeSubjects(
    schoolId: string,
    academicYearId: string,
    termId: string,
    gradeIds: string[],
    subjectIds: string[],
  ) {
    return this.prisma.subjectAllocation.findMany({
      where: {
        schoolId,
        academicYearId,
        termId,
        gradeId: { in: gradeIds },
        subjectId: { in: subjectIds },
        weeklyHours: { gt: 0 },
        deletedAt: null,
      },
      select: { gradeId: true, subjectId: true },
    });
  }

  guardianLinks(schoolId: string, studentIds: string[]) {
    return this.prisma.studentGuardian.findMany({
      where: {
        schoolId,
        studentId: { in: studentIds },
        student: { schoolId, deletedAt: null, status: StudentStatus.ACTIVE },
        guardian: { schoolId, deletedAt: null },
      },
      select: {
        studentId: true,
        guardianId: true,
        guardian: { select: { userId: true, canReceiveNotifications: true } },
      },
      orderBy: [{ guardianId: 'asc' }, { studentId: 'asc' }],
    });
  }
}
