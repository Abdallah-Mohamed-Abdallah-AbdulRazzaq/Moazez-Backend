import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_TIMELINE_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: {
    id: true,
    firstName: true,
    lastName: true,
    createdAt: true,
    application: {
      select: {
        id: true,
        studentName: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        decision: {
          select: {
            id: true,
            decision: true,
            reason: true,
            decidedAt: true,
          },
        },
      },
    },
    guardians: {
      select: {
        id: true,
        isPrimary: true,
        createdAt: true,
        guardian: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            relation: true,
          },
        },
      },
    },
    enrollments: {
      select: {
        id: true,
        createdAt: true,
        enrolledAt: true,
        academicYear: {
          select: {
            id: true,
            nameEn: true,
          },
        },
        classroom: {
          select: {
            id: true,
            nameEn: true,
            section: {
              select: {
                id: true,
                nameEn: true,
                grade: {
                  select: {
                    id: true,
                    nameEn: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    documents: {
      select: {
        id: true,
        documentType: true,
        status: true,
        createdAt: true,
        file: {
          select: {
            id: true,
            originalName: true,
          },
        },
      },
    },
    medicalProfile: {
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    notes: {
      select: {
        id: true,
        note: true,
        category: true,
        createdAt: true,
        authorUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
  },
});

export type StudentTimelineSource = Prisma.StudentGetPayload<
  typeof STUDENT_TIMELINE_ARGS
>;

@Injectable()
export class StudentTimelineRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  findStudentTimelineSource(
    studentId: string,
  ): Promise<StudentTimelineSource | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_TIMELINE_ARGS,
    });
  }
}
