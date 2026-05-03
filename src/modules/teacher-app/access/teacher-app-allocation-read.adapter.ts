import { Injectable } from '@nestjs/common';
import { Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  TeacherAppAllocationRecord,
  TeacherAppClassId,
} from '../shared/teacher-app.types';

const TEACHER_APP_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      teacherUserId: true,
      subjectId: true,
      classroomId: true,
      termId: true,
      subject: {
        select: {
          id: true,
          schoolId: true,
          nameAr: true,
          nameEn: true,
          code: true,
        },
      },
      classroom: {
        select: {
          id: true,
          schoolId: true,
          sectionId: true,
          roomId: true,
          nameAr: true,
          nameEn: true,
          room: {
            select: {
              id: true,
              schoolId: true,
              nameAr: true,
              nameEn: true,
            },
          },
          section: {
            select: {
              id: true,
              schoolId: true,
              gradeId: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  schoolId: true,
                  stageId: true,
                  nameAr: true,
                  nameEn: true,
                  stage: {
                    select: {
                      id: true,
                      schoolId: true,
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
      term: {
        select: {
          id: true,
          schoolId: true,
          academicYearId: true,
          nameAr: true,
          nameEn: true,
          isActive: true,
        },
      },
    },
  });

/**
 * Read-only composition adapter for Teacher App allocation ownership. It uses
 * the school-scoped Prisma client and does not define or mutate Academics truth.
 */
@Injectable()
export class TeacherAppAllocationReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findOwnedAllocationById(params: {
    allocationId: TeacherAppClassId;
    teacherUserId: string;
  }): Promise<TeacherAppAllocationRecord | null> {
    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: {
        id: params.allocationId,
        ...ownedAllocationWhere(params.teacherUserId),
      },
      ...TEACHER_APP_ALLOCATION_ARGS,
    });
  }

  async listOwnedAllocationIds(
    teacherUserId: string,
  ): Promise<TeacherAppClassId[]> {
    const rows = await this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: ownedAllocationWhere(teacherUserId),
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    return rows.map((row) => row.id);
  }
}

function ownedAllocationWhere(
  teacherUserId: string,
): Prisma.TeacherSubjectAllocationWhereInput {
  return {
    teacherUserId,
    teacherUser: {
      is: {
        userType: UserType.TEACHER,
        deletedAt: null,
      },
    },
    subject: {
      is: {
        deletedAt: null,
      },
    },
    classroom: {
      is: {
        deletedAt: null,
        section: {
          is: {
            deletedAt: null,
            grade: {
              is: {
                deletedAt: null,
                stage: {
                  is: {
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
      },
    },
    term: {
      is: {
        deletedAt: null,
      },
    },
  };
}
