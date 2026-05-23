import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_SCHEDULE_ENTRY_ARGS =
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

const STUDENT_SCHEDULE_SETTINGS_ARGS =
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

export type StudentScheduleEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof STUDENT_SCHEDULE_ENTRY_ARGS
>;

export interface StudentScheduleSettingsRecord {
  weekStartDay: number;
  activeDays: number[];
}

interface StudentScheduleLookupParams {
  classroomId: string;
  academicYearId: string;
  termId?: string | null;
}

@Injectable()
export class StudentScheduleReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listPublishedEntriesForStudentOnDay(
    params: StudentScheduleLookupParams & {
      dayOfWeek: number;
      date: Date;
    },
  ): Promise<StudentScheduleEntryRecord[]> {
    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...publishedStudentEntryWhere(params),
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
      ...STUDENT_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async listPublishedEntriesForStudentWeek(
    params: StudentScheduleLookupParams & {
      dayOfWeeks: number[];
      weekStartDate: Date;
      weekEndDate: Date;
    },
  ): Promise<StudentScheduleEntryRecord[]> {
    const uniqueDays = [...new Set(params.dayOfWeeks)].sort(
      (left, right) => left - right,
    );

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...publishedStudentEntryWhere(params),
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
      ...STUDENT_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async findPublishedScheduleSettings(
    params: StudentScheduleLookupParams,
  ): Promise<StudentScheduleSettingsRecord | null> {
    const entry = await this.scopedPrisma.timetableEntry.findFirst({
      where: publishedStudentEntryWhere(params),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      ...STUDENT_SCHEDULE_SETTINGS_ARGS,
    });

    if (!entry) return null;

    return {
      weekStartDay: entry.timetableConfig.weekStartDay,
      activeDays: entry.timetableConfig.activeDays,
    };
  }
}

function publishedStudentEntryWhere(
  params: StudentScheduleLookupParams,
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
  params: StudentScheduleLookupParams,
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

function termIdWhere(
  termId: string | null | undefined,
): { termId?: string } {
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

function entryDayIsActive(entry: StudentScheduleEntryRecord): boolean {
  return entry.timetableConfig.activeDays.includes(entry.dayOfWeek);
}
