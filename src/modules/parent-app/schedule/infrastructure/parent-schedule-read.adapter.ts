import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';

const PARENT_SCHEDULE_CHILD_ARGS =
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
        },
      },
    },
  });

const PARENT_SCHEDULE_ENTRY_ARGS =
  Prisma.validator<Prisma.TimetableEntryDefaultArgs>()({
    select: {
      id: true,
      dayOfWeek: true,
      notes: true,
      status: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      timetableConfig: {
        select: {
          id: true,
          weekStartDay: true,
          activeDays: true,
          status: true,
          term: {
            select: {
              startDate: true,
              endDate: true,
              deletedAt: true,
            },
          },
        },
      },
      period: {
        select: {
          id: true,
          periodIndex: true,
          label: true,
          startTime: true,
          endTime: true,
          type: true,
          isInstructional: true,
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
        },
      },
      teacherUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      room: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
    },
  });

const PARENT_SCHEDULE_SETTINGS_ARGS =
  Prisma.validator<Prisma.TimetableEntryDefaultArgs>()({
    select: {
      timetableConfig: {
        select: {
          weekStartDay: true,
          activeDays: true,
        },
      },
    },
  });

export type ParentScheduleChildRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_SCHEDULE_CHILD_ARGS
>;

export type ParentScheduleEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof PARENT_SCHEDULE_ENTRY_ARGS
>;

export interface ParentScheduleSettingsRecord {
  weekStartDay: number;
  activeDays: number[];
}

interface ParentScheduleLookupParams {
  classroomId: string;
  academicYearId: string;
  termId?: string | null;
}

@Injectable()
export class ParentScheduleReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findChildSummary(
    child: ParentAppAccessibleChild,
  ): Promise<ParentScheduleChildRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: child.enrollmentId,
        studentId: child.studentId,
        academicYearId: child.academicYearId,
        ...termIdWhere(child.termId),
      },
      ...PARENT_SCHEDULE_CHILD_ARGS,
    });
  }

  async listPublishedEntriesForChildOnDay(
    params: ParentScheduleLookupParams & {
      dayOfWeek: number;
      date: Date;
    },
  ): Promise<ParentScheduleEntryRecord[]> {
    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...publishedChildEntryWhere(params),
        dayOfWeek: params.dayOfWeek,
        timetableConfig: {
          is: {
            ...publishedConfigWhere(params),
            activeDays: { has: params.dayOfWeek },
            term: { is: termContainsDateWhere(params.date) },
          },
        },
      },
      orderBy: [{ period: { periodIndex: 'asc' } }, { id: 'asc' }],
      ...PARENT_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async listPublishedEntriesForChildWeek(
    params: ParentScheduleLookupParams & {
      dayOfWeeks: number[];
      weekStartDate: Date;
      weekEndDate: Date;
    },
  ): Promise<ParentScheduleEntryRecord[]> {
    const uniqueDays = [...new Set(params.dayOfWeeks)].sort(
      (left, right) => left - right,
    );

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...publishedChildEntryWhere(params),
        dayOfWeek: { in: uniqueDays },
        timetableConfig: {
          is: {
            ...publishedConfigWhere(params),
            activeDays: { hasSome: uniqueDays },
            term: {
              is: termOverlapsDateRangeWhere({
                startDate: params.weekStartDate,
                endDate: params.weekEndDate,
              }),
            },
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { period: { periodIndex: 'asc' } },
        { id: 'asc' },
      ],
      ...PARENT_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async findPublishedScheduleSettings(
    params: ParentScheduleLookupParams,
  ): Promise<ParentScheduleSettingsRecord | null> {
    const entry = await this.scopedPrisma.timetableEntry.findFirst({
      where: publishedChildEntryWhere(params),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      ...PARENT_SCHEDULE_SETTINGS_ARGS,
    });

    if (!entry) return null;

    return {
      weekStartDay: entry.timetableConfig.weekStartDay,
      activeDays: entry.timetableConfig.activeDays,
    };
  }
}

function publishedChildEntryWhere(
  params: ParentScheduleLookupParams,
): Prisma.TimetableEntryWhereInput {
  return {
    classroomId: params.classroomId,
    academicYearId: params.academicYearId,
    ...termIdWhere(params.termId),
    status: TimetableEntryStatus.ACTIVE,
    teacherSubjectAllocation: {
      is: {
        classroomId: params.classroomId,
        ...termIdWhere(params.termId),
      },
    },
    subject: {
      is: {
        isActive: true,
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
    OR: [
      { roomId: null },
      {
        room: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
    ],
    timetableConfig: {
      is: publishedConfigWhere(params),
    },
  };
}

function publishedConfigWhere(
  params: ParentScheduleLookupParams,
): Prisma.TimetableConfigWhereInput {
  return {
    academicYearId: params.academicYearId,
    ...termIdWhere(params.termId),
    status: TimetableConfigStatus.ACTIVE,
    publications: {
      some: {
        status: TimetablePublicationStatus.PUBLISHED,
      },
    },
  };
}

function termIdWhere(termId: string | null | undefined): { termId?: string } {
  return termId ? { termId } : {};
}

function termContainsDateWhere(date: Date): Prisma.TermWhereInput {
  return {
    startDate: { lte: date },
    endDate: { gte: date },
    deletedAt: null,
  };
}

function termOverlapsDateRangeWhere(params: {
  startDate: Date;
  endDate: Date;
}): Prisma.TermWhereInput {
  return {
    startDate: { lte: params.endDate },
    endDate: { gte: params.startDate },
    deletedAt: null,
  };
}

function entryDayIsActive(entry: ParentScheduleEntryRecord): boolean {
  return entry.timetableConfig.activeDays.includes(entry.dayOfWeek);
}
