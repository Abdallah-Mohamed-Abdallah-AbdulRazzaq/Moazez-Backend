import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TEACHER_SCHEDULE_ENTRY_ARGS =
  Prisma.validator<Prisma.TimetableEntryDefaultArgs>()({
    select: {
      id: true,
      teacherUserId: true,
      teacherSubjectAllocationId: true,
      dayOfWeek: true,
      notes: true,
      status: true,
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

const TEACHER_SCHEDULE_SETTINGS_ARGS =
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

export type TeacherScheduleEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof TEACHER_SCHEDULE_ENTRY_ARGS
>;

export interface TeacherScheduleSettingsRecord {
  weekStartDay: number;
  activeDays: number[];
}

@Injectable()
export class TeacherScheduleReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listPublishedEntriesForTeacherOnDay(params: {
    teacherUserId: string;
    allocationIds: string[];
    dayOfWeek: number;
    date: Date;
  }): Promise<TeacherScheduleEntryRecord[]> {
    if (params.allocationIds.length === 0) return [];

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...publishedTeacherEntryWhere(params),
        dayOfWeek: params.dayOfWeek,
        timetableConfig: {
          is: {
            ...publishedConfigWhere(),
            activeDays: { has: params.dayOfWeek },
            term: { is: termContainsDateWhere(params.date) },
          },
        },
      },
      orderBy: [{ period: { periodIndex: 'asc' } }, { id: 'asc' }],
      ...TEACHER_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async listPublishedEntriesForTeacherWeek(params: {
    teacherUserId: string;
    allocationIds: string[];
    dayOfWeeks: number[];
    weekStartDate: Date;
    weekEndDate: Date;
  }): Promise<TeacherScheduleEntryRecord[]> {
    if (params.allocationIds.length === 0) return [];

    const uniqueDays = [...new Set(params.dayOfWeeks)].sort(
      (left, right) => left - right,
    );

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...publishedTeacherEntryWhere(params),
        dayOfWeek: { in: uniqueDays },
        timetableConfig: {
          is: {
            ...publishedConfigWhere(),
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
      ...TEACHER_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async findPublishedScheduleSettings(params: {
    teacherUserId: string;
    allocationIds: string[];
  }): Promise<TeacherScheduleSettingsRecord | null> {
    if (params.allocationIds.length === 0) return null;

    const entry = await this.scopedPrisma.timetableEntry.findFirst({
      where: publishedTeacherEntryWhere(params),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      ...TEACHER_SCHEDULE_SETTINGS_ARGS,
    });

    if (!entry) return null;

    return {
      weekStartDay: entry.timetableConfig.weekStartDay,
      activeDays: entry.timetableConfig.activeDays,
    };
  }
}

function publishedTeacherEntryWhere(params: {
  teacherUserId: string;
  allocationIds: string[];
}): Prisma.TimetableEntryWhereInput {
  return {
    teacherUserId: params.teacherUserId,
    teacherSubjectAllocationId: { in: params.allocationIds },
    status: TimetableEntryStatus.ACTIVE,
    teacherSubjectAllocation: {
      is: {
        teacherUserId: params.teacherUserId,
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
    OR: [{ roomId: null }, { room: { is: { deletedAt: null } } }],
    timetableConfig: {
      is: publishedConfigWhere(),
    },
  };
}

function publishedConfigWhere(): Prisma.TimetableConfigWhereInput {
  return {
    status: TimetableConfigStatus.ACTIVE,
    publications: {
      some: {
        status: TimetablePublicationStatus.PUBLISHED,
      },
    },
  };
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

function entryDayIsActive(entry: TeacherScheduleEntryRecord): boolean {
  return entry.timetableConfig.activeDays.includes(entry.dayOfWeek);
}
