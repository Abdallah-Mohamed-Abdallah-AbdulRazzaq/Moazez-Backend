import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';

const PUBLICATION_SELECT = {
  id: true,
  schoolId: true,
  academicContentId: true,
  revisionId: true,
  status: true,
  publishedAt: true,
  visibleFrom: true,
  visibleUntil: true,
  revision: {
    select: {
      id: true,
      schoolId: true,
      academicContentId: true,
      snapshotContractVersion: true,
      academicYearId: true,
      termId: true,
      type: true,
      audience: true,
      targets: {
        select: {
          id: true,
          schoolId: true,
          revisionId: true,
          scopeType: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
          subjectId: true,
        },
      },
    },
  },
} satisfies Prisma.AcademicContentPublicationSelect;

@Injectable()
export class AcademicContentRecipientReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublication(schoolId: string, publicationId: string) {
    return this.prisma.academicContentPublication.findFirst({
      where: {
        id: publicationId,
        schoolId,
        academicContent: { schoolId, deletedAt: null },
        school: {
          status: SchoolStatus.ACTIVE,
          deletedAt: null,
          organization: { status: OrganizationStatus.ACTIVE, deletedAt: null },
        },
      },
      select: PUBLICATION_SELECT,
    });
  }

  findCurrentEnrollment(context: AcademicContentCurrentRecipientContext) {
    const activeUser = {
      id: context.userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    };
    return this.prisma.enrollment.findFirst({
      where: {
        id: context.enrollmentId,
        schoolId: context.schoolId,
        studentId: context.studentId,
        classroomId: context.classroomId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          schoolId: context.schoolId,
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          ...(context.actorKind === 'STUDENT'
            ? {
                userId: context.userId,
                user: { ...activeUser, userType: UserType.STUDENT },
              }
            : {
                guardians: {
                  some: {
                    schoolId: context.schoolId,
                    guardianId: { in: [...context.guardianIds] },
                    guardian: {
                      schoolId: context.schoolId,
                      deletedAt: null,
                      userId: context.userId,
                      user: { ...activeUser, userType: UserType.PARENT },
                    },
                  },
                },
              }),
        },
        classroom: {
          schoolId: context.schoolId,
          deletedAt: null,
          section: {
            schoolId: context.schoolId,
            deletedAt: null,
            grade: {
              schoolId: context.schoolId,
              deletedAt: null,
              stage: { schoolId: context.schoolId, deletedAt: null },
            },
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        classroomId: true,
        student: { select: { userId: true } },
        classroom: {
          select: {
            sectionId: true,
            section: {
              select: { gradeId: true, grade: { select: { stageId: true } } },
            },
          },
        },
      },
    });
  }
}
