import { Injectable } from '@nestjs/common';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type {
  ParentHomeworkMode,
  ParentHomeworksQueryDto,
  ParentHomeworkStatus,
} from '../dto/parent-homeworks.dto';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const PARENT_HOMEWORK_TARGET_ARGS =
  Prisma.validator<Prisma.HomeworkTargetDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      assignedAt: true,
      viewedAt: true,
      submittedAt: true,
      reviewedAt: true,
      excusedAt: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      homeworkAssignment: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          classroomId: true,
          subjectId: true,
          teacherUserId: true,
          timetableEntryId: true,
          scheduleDate: true,
          title: true,
          description: true,
          mode: true,
          status: true,
          publishAt: true,
          publishedAt: true,
          dueAt: true,
          closedAt: true,
          estimatedMinutes: true,
          totalMarks: true,
          isGraded: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          academicYear: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
            },
          },
          term: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
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
          subject: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              code: true,
              color: true,
            },
          },
          teacherUser: {
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

export type ParentHomeworkTargetReadModel = Prisma.HomeworkTargetGetPayload<
  typeof PARENT_HOMEWORK_TARGET_ARGS
>;

export interface ParentHomeworksListReadModel {
  items: ParentHomeworkTargetReadModel[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ParentHomeworksReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listHomeworks(params: {
    child: ParentAppAccessibleChild;
    query?: ParentHomeworksQueryDto;
  }): Promise<ParentHomeworksListReadModel> {
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit);
    const where = buildTargetWhere({
      child: params.child,
      query: params.query,
      now: new Date(),
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.homeworkTarget.findMany({
        where,
        orderBy: [
          { homeworkAssignment: { dueAt: 'asc' } },
          { assignedAt: 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        ...PARENT_HOMEWORK_TARGET_ARGS,
      }),
      this.scopedPrisma.homeworkTarget.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  findHomework(params: {
    child: ParentAppAccessibleChild;
    homeworkId: string;
  }): Promise<ParentHomeworkTargetReadModel | null> {
    return this.scopedPrisma.homeworkTarget.findFirst({
      where: {
        ...buildTargetWhere({
          child: params.child,
          now: new Date(),
        }),
        homeworkAssignmentId: params.homeworkId,
      },
      ...PARENT_HOMEWORK_TARGET_ARGS,
    });
  }
}

function buildTargetWhere(params: {
  child: ParentAppAccessibleChild;
  query?: Pick<
    ParentHomeworksQueryDto,
    'status' | 'mode' | 'dueFrom' | 'dueTo' | 'search'
  >;
  now: Date;
}): Prisma.HomeworkTargetWhereInput {
  const assignmentAnd: Prisma.HomeworkAssignmentWhereInput[] = [
    visibleAssignmentWhere(params.child),
  ];
  const search = params.query?.search?.trim();

  if (params.query?.mode) {
    assignmentAnd.push({ mode: toCoreMode(params.query.mode) });
  }

  if (params.query?.dueFrom) {
    assignmentAnd.push({
      dueAt: { gte: parseDateBoundary(params.query.dueFrom, 'start') },
    });
  }

  if (params.query?.dueTo) {
    assignmentAnd.push({
      dueAt: { lte: parseDateBoundary(params.query.dueTo, 'end') },
    });
  }

  if (search) {
    assignmentAnd.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        {
          subject: {
            is: {
              OR: [
                { nameEn: { contains: search, mode: 'insensitive' } },
                { nameAr: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          teacherUser: {
            is: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ],
    });
  }

  return applyStatusWhere({
    baseWhere: {
      studentId: params.child.studentId,
      enrollmentId: params.child.enrollmentId,
    },
    assignmentAnd,
    status: params.query?.status,
    now: params.now,
  });
}

function visibleAssignmentWhere(
  child: ParentAppAccessibleChild,
): Prisma.HomeworkAssignmentWhereInput {
  return {
    deletedAt: null,
    academicYearId: child.academicYearId,
    classroomId: child.classroomId,
    ...(child.termId ? { termId: child.termId } : {}),
    status: {
      in: [HomeworkAssignmentStatus.PUBLISHED, HomeworkAssignmentStatus.CLOSED],
    },
  };
}

function withAssignmentAnd(
  assignmentAnd: Prisma.HomeworkAssignmentWhereInput[],
): { homeworkAssignment: { is: Prisma.HomeworkAssignmentWhereInput } } {
  return {
    homeworkAssignment: {
      is: {
        AND: assignmentAnd,
      },
    },
  };
}

function applyStatusWhere(input: {
  baseWhere: Prisma.HomeworkTargetWhereInput;
  assignmentAnd: Prisma.HomeworkAssignmentWhereInput[];
  status: ParentHomeworkStatus | undefined;
  now: Date;
}): Prisma.HomeworkTargetWhereInput {
  if (!input.status) {
    return {
      ...input.baseWhere,
      ...withAssignmentAnd(input.assignmentAnd),
    };
  }

  switch (input.status) {
    case 'completed':
      return {
        ...input.baseWhere,
        status: {
          in: [HomeworkTargetStatus.SUBMITTED, HomeworkTargetStatus.REVIEWED],
        },
        ...withAssignmentAnd(input.assignmentAnd),
      };
    case 'waiting':
      return {
        ...input.baseWhere,
        status: {
          in: [HomeworkTargetStatus.ASSIGNED, HomeworkTargetStatus.VIEWED],
        },
        ...withAssignmentAnd([
          ...input.assignmentAnd,
          {
            status: HomeworkAssignmentStatus.PUBLISHED,
            dueAt: { gte: input.now },
          },
        ]),
      };
    case 'not_completed':
      return {
        ...input.baseWhere,
        OR: [
          {
            status: {
              in: [
                HomeworkTargetStatus.ASSIGNED,
                HomeworkTargetStatus.VIEWED,
                HomeworkTargetStatus.MISSING,
                HomeworkTargetStatus.LATE,
              ],
            },
            ...withAssignmentAnd([
              ...input.assignmentAnd,
              {
                status: HomeworkAssignmentStatus.PUBLISHED,
                dueAt: { lt: input.now },
              },
            ]),
          },
          {
            status: {
              notIn: [
                HomeworkTargetStatus.SUBMITTED,
                HomeworkTargetStatus.REVIEWED,
              ],
            },
            ...withAssignmentAnd([
              ...input.assignmentAnd,
              { status: HomeworkAssignmentStatus.CLOSED },
            ]),
          },
        ],
      };
  }
}

function toCoreMode(mode: ParentHomeworkMode): HomeworkAssignmentMode {
  switch (mode) {
    case 'homework':
      return HomeworkAssignmentMode.HOMEWORK;
    case 'worksheet':
      return HomeworkAssignmentMode.WORKSHEET;
    case 'writing_task':
      return HomeworkAssignmentMode.WRITING_TASK;
    case 'quiz':
      return HomeworkAssignmentMode.QUIZ;
    case 'reading':
      return HomeworkAssignmentMode.READING;
    case 'project':
      return HomeworkAssignmentMode.PROJECT;
  }
}

function parseDateBoundary(value: string, boundary: 'start' | 'end'): Date {
  const date = new Date(value);
  if (!value.includes('T')) {
    date.setUTCHours(
      boundary === 'start' ? 0 : 23,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 999,
    );
  }

  return date;
}

function resolveLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
