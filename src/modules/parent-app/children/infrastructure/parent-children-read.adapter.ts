import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type {
  ParentAppAccessibleChild,
  ParentAppContext,
} from '../../shared/parent-app.types';

const PARENT_CHILDREN_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
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
  });

export type ParentChildEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_CHILDREN_ENROLLMENT_ARGS
>;

@Injectable()
export class ParentChildrenReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listChildren(
    context: ParentAppContext,
  ): Promise<ParentChildEnrollmentRecord[]> {
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
      ...PARENT_CHILDREN_ENROLLMENT_ARGS,
    });
  }

  findChild(
    child: ParentAppAccessibleChild,
  ): Promise<ParentChildEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: child.enrollmentId,
        studentId: child.studentId,
        academicYearId: child.academicYearId,
        student: {
          is: {
            status: StudentStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      ...PARENT_CHILDREN_ENROLLMENT_ARGS,
    });
  }
}
