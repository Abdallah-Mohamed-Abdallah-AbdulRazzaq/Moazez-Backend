import { Injectable } from '@nestjs/common';
import { Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  TeacherAppAllocationRecord,
  TeacherAppClassId,
} from '../shared/teacher-app.types';

export interface TeacherAppAllocationListFilters {
  search?: string;
  termId?: string;
  subjectId?: string;
  classroomId?: string;
  limit?: number;
  page?: number;
}

export interface TeacherAppAllocationListResult {
  items: TeacherAppAllocationRecord[];
  total: number;
  limit: number;
  page: number;
}

const DEFAULT_TEACHER_APP_CLASSES_LIMIT = 50;

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

  async listOwnedAllocations(params: {
    teacherUserId: string;
    filters?: TeacherAppAllocationListFilters;
  }): Promise<TeacherAppAllocationListResult> {
    const limit = resolveLimit(params.filters?.limit);
    const page = resolvePage(params.filters?.page);
    const where = buildOwnedAllocationListWhere({
      teacherUserId: params.teacherUserId,
      filters: params.filters,
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.teacherSubjectAllocation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...TEACHER_APP_ALLOCATION_ARGS,
      }),
      this.scopedPrisma.teacherSubjectAllocation.count({ where }),
    ]);

    return { items, total, limit, page };
  }

  listAllOwnedAllocations(
    teacherUserId: string,
  ): Promise<TeacherAppAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: ownedAllocationWhere(teacherUserId),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...TEACHER_APP_ALLOCATION_ARGS,
    });
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

function buildOwnedAllocationListWhere(params: {
  teacherUserId: string;
  filters?: TeacherAppAllocationListFilters;
}): Prisma.TeacherSubjectAllocationWhereInput {
  return andWhere(
    ownedAllocationWhere(params.teacherUserId),
    {
      ...(params.filters?.termId ? { termId: params.filters.termId } : {}),
      ...(params.filters?.subjectId
        ? { subjectId: params.filters.subjectId }
        : {}),
      ...(params.filters?.classroomId
        ? { classroomId: params.filters.classroomId }
        : {}),
    },
    buildAllocationSearchWhere(params.filters?.search),
  );
}

function buildAllocationSearchWhere(
  search?: string,
): Prisma.TeacherSubjectAllocationWhereInput {
  const normalized = search?.trim();
  if (!normalized) return {};

  const stringFilter = {
    contains: normalized,
    mode: Prisma.QueryMode.insensitive,
  };

  return {
    OR: [
      {
        subject: {
          is: {
            OR: [{ nameAr: stringFilter }, { nameEn: stringFilter }],
          },
        },
      },
      {
        classroom: {
          is: {
            OR: [{ nameAr: stringFilter }, { nameEn: stringFilter }],
          },
        },
      },
      {
        classroom: {
          is: {
            section: {
              is: {
                OR: [{ nameAr: stringFilter }, { nameEn: stringFilter }],
              },
            },
          },
        },
      },
      {
        classroom: {
          is: {
            section: {
              is: {
                grade: {
                  is: {
                    OR: [{ nameAr: stringFilter }, { nameEn: stringFilter }],
                  },
                },
              },
            },
          },
        },
      },
      {
        classroom: {
          is: {
            section: {
              is: {
                grade: {
                  is: {
                    stage: {
                      is: {
                        OR: [
                          { nameAr: stringFilter },
                          { nameEn: stringFilter },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        term: {
          is: {
            OR: [{ nameAr: stringFilter }, { nameEn: stringFilter }],
          },
        },
      },
    ],
  };
}

function andWhere(
  ...conditions: Prisma.TeacherSubjectAllocationWhereInput[]
): Prisma.TeacherSubjectAllocationWhereInput {
  const present = conditions.filter(
    (condition) => Object.keys(condition).length > 0,
  );

  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  return { AND: present };
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_TEACHER_APP_CLASSES_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
