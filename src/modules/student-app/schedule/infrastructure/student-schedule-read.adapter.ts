import { Injectable } from '@nestjs/common';
import { Prisma, TimetableEntryStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { findEffectiveTimetableConfigs } from '../../../academics/timetable/infrastructure/effective-timetable-read';

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
          scopeType: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
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
          sectionId: true,
          section: {
            select: {
              gradeId: true,
              grade: { select: { stageId: true } },
            },
          },
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

export type StudentScheduleEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof STUDENT_SCHEDULE_ENTRY_ARGS
>;

export interface StudentScheduleSettingsRecord {
  timetableConfigId: string;
  weekStartDay: number;
  activeDays: number[];
}

interface StudentScheduleLookupParams {
  classroomId: string;
  academicYearId: string;
  termId?: string | null;
  effectiveTimetableConfigIds?: string[];
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
    const configIds = await this.resolveEffectiveConfigIds(params);
    if (configIds.length === 0) return [];

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...effectiveStudentEntryWhere(params, configIds),
        dayOfWeek: params.dayOfWeek,
        timetableConfig: {
          is: {
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
    const configIds = await this.resolveEffectiveConfigIds(params);
    if (configIds.length === 0) return [];

    const uniqueDays = [...new Set(params.dayOfWeeks)].sort(
      (left, right) => left - right,
    );

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...effectiveStudentEntryWhere(params, configIds),
        dayOfWeek: { in: uniqueDays },
        timetableConfig: {
          is: {
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
    const config = (
      await findEffectiveTimetableConfigs(this.scopedPrisma, params)
    )[0];
    if (!config) return null;

    return {
      timetableConfigId: config.id,
      weekStartDay: config.weekStartDay,
      activeDays: config.activeDays,
    };
  }

  private async resolveEffectiveConfigIds(
    params: StudentScheduleLookupParams,
  ): Promise<string[]> {
    if (params.effectiveTimetableConfigIds !== undefined) {
      return params.effectiveTimetableConfigIds;
    }

    return (await findEffectiveTimetableConfigs(this.scopedPrisma, params)).map(
      (config) => config.id,
    );
  }
}

function effectiveStudentEntryWhere(
  params: StudentScheduleLookupParams,
  timetableConfigIds: string[],
): Prisma.TimetableEntryWhereInput {
  return {
    classroomId: params.classroomId,
    academicYearId: params.academicYearId,
    ...termIdWhere(params.termId),
    timetableConfigId: { in: timetableConfigIds },
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

function entryDayIsActive(entry: StudentScheduleEntryRecord): boolean {
  return entry.timetableConfig.activeDays.includes(entry.dayOfWeek);
}
