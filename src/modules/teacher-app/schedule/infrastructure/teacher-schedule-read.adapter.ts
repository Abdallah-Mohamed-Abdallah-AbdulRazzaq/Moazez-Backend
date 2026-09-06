import { Injectable } from '@nestjs/common';
import { Prisma, TimetableEntryStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  EFFECTIVE_TIMETABLE_CONFIG_ARGS,
  EffectiveTimetableConfigRecord,
  resolveEffectiveConfigsByTerm,
} from '../../../academics/timetable/infrastructure/effective-timetable-read';

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

const TEACHER_SCHEDULE_CONTEXT_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      termId: true,
      classroomId: true,
      term: {
        select: {
          academicYearId: true,
        },
      },
      classroom: {
        select: {
          id: true,
          schoolId: true,
          sectionId: true,
          section: {
            select: {
              gradeId: true,
              grade: {
                select: {
                  stageId: true,
                },
              },
            },
          },
        },
      },
    },
  });

type TeacherScheduleContextRecord = Prisma.TeacherSubjectAllocationGetPayload<
  typeof TEACHER_SCHEDULE_CONTEXT_ARGS
>;

export type TeacherScheduleEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof TEACHER_SCHEDULE_ENTRY_ARGS
>;

export interface TeacherEffectiveTimetableBinding {
  timetableConfigId: string;
  classroomId: string;
  academicYearId: string;
  termId: string;
}

export interface TeacherScheduleSettingsRecord {
  effectiveTimetables: TeacherEffectiveTimetableBinding[];
  weekStartDay: number;
  activeDays: number[];
}

interface TeacherScheduleLookupParams {
  teacherUserId: string;
  allocationIds: string[];
  effectiveTimetables?: TeacherEffectiveTimetableBinding[];
}

interface ResolvedTeacherTimetable extends TeacherEffectiveTimetableBinding {
  config: EffectiveTimetableConfigRecord;
}

@Injectable()
export class TeacherScheduleReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listPublishedEntriesForTeacherOnDay(
    params: TeacherScheduleLookupParams & {
      dayOfWeek: number;
      date: Date;
    },
  ): Promise<TeacherScheduleEntryRecord[]> {
    if (params.allocationIds.length === 0) return [];

    const effectiveTimetables = await this.resolveEffectiveTimetables(params);
    if (effectiveTimetables.length === 0) return [];

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...effectiveTeacherEntryWhere(params, effectiveTimetables),
        dayOfWeek: params.dayOfWeek,
        timetableConfig: {
          is: {
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

  async listPublishedEntriesForTeacherWeek(
    params: TeacherScheduleLookupParams & {
      dayOfWeeks: number[];
      weekStartDate: Date;
      weekEndDate: Date;
    },
  ): Promise<TeacherScheduleEntryRecord[]> {
    if (params.allocationIds.length === 0) return [];

    const effectiveTimetables = await this.resolveEffectiveTimetables(params);
    if (effectiveTimetables.length === 0) return [];

    const uniqueDays = [...new Set(params.dayOfWeeks)].sort(
      (left, right) => left - right,
    );

    const entries = await this.scopedPrisma.timetableEntry.findMany({
      where: {
        ...effectiveTeacherEntryWhere(params, effectiveTimetables),
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
      ...TEACHER_SCHEDULE_ENTRY_ARGS,
    });

    return entries.filter(entryDayIsActive);
  }

  async findPublishedScheduleSettings(
    params: TeacherScheduleLookupParams,
  ): Promise<TeacherScheduleSettingsRecord | null> {
    if (params.allocationIds.length === 0) return null;

    const resolved = await this.loadEffectiveTimetables(params);
    const first = resolved[0];
    if (!first) return null;

    return {
      effectiveTimetables: resolved.map(toEffectiveTimetableBinding),
      weekStartDay: first.config.weekStartDay,
      activeDays: first.config.activeDays,
    };
  }

  private async resolveEffectiveTimetables(
    params: TeacherScheduleLookupParams,
  ): Promise<TeacherEffectiveTimetableBinding[]> {
    if (params.effectiveTimetables !== undefined) {
      return params.effectiveTimetables;
    }

    return (await this.loadEffectiveTimetables(params)).map(
      toEffectiveTimetableBinding,
    );
  }

  private async loadEffectiveTimetables(
    params: TeacherScheduleLookupParams,
  ): Promise<ResolvedTeacherTimetable[]> {
    const allocations =
      await this.scopedPrisma.teacherSubjectAllocation.findMany({
        where: {
          id: { in: params.allocationIds },
          teacherUserId: params.teacherUserId,
          term: { is: { deletedAt: null } },
          classroom: {
            is: {
              deletedAt: null,
              section: {
                is: {
                  deletedAt: null,
                  grade: {
                    is: {
                      deletedAt: null,
                      stage: { is: { deletedAt: null } },
                    },
                  },
                },
              },
            },
          },
        },
        ...TEACHER_SCHEDULE_CONTEXT_ARGS,
      });

    const contexts = uniqueTeacherContexts(allocations);
    if (contexts.length === 0) return [];

    const candidates = await this.scopedPrisma.timetableConfig.findMany({
      where: {
        OR: contexts.map((context) => ({
          academicYearId: context.term.academicYearId,
          termId: context.termId,
        })),
      },
      ...EFFECTIVE_TIMETABLE_CONFIG_ARGS,
    });

    return contexts.flatMap((context) => {
      const config = resolveEffectiveConfigsByTerm(
        candidates.filter(
          (candidate) =>
            candidate.academicYearId === context.term.academicYearId &&
            candidate.termId === context.termId,
        ),
        context.classroom,
      )[0];

      return config
        ? [
            {
              timetableConfigId: config.id,
              classroomId: context.classroomId,
              academicYearId: context.term.academicYearId,
              termId: context.termId,
              config,
            },
          ]
        : [];
    });
  }
}

function toEffectiveTimetableBinding(
  resolved: ResolvedTeacherTimetable,
): TeacherEffectiveTimetableBinding {
  return {
    timetableConfigId: resolved.timetableConfigId,
    classroomId: resolved.classroomId,
    academicYearId: resolved.academicYearId,
    termId: resolved.termId,
  };
}

function uniqueTeacherContexts(
  allocations: TeacherScheduleContextRecord[],
): TeacherScheduleContextRecord[] {
  const contexts = new Map<string, TeacherScheduleContextRecord>();
  for (const allocation of allocations) {
    contexts.set(`${allocation.termId}:${allocation.classroomId}`, allocation);
  }

  return [...contexts.values()].sort(
    (left, right) =>
      left.termId.localeCompare(right.termId) ||
      left.classroomId.localeCompare(right.classroomId),
  );
}

function effectiveTeacherEntryWhere(
  params: TeacherScheduleLookupParams,
  effectiveTimetables: TeacherEffectiveTimetableBinding[],
): Prisma.TimetableEntryWhereInput {
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
    AND: [
      { OR: [{ roomId: null }, { room: { is: { deletedAt: null } } }] },
      {
        OR: effectiveTimetables.map((effective) => ({
          timetableConfigId: effective.timetableConfigId,
          classroomId: effective.classroomId,
          academicYearId: effective.academicYearId,
          termId: effective.termId,
        })),
      },
    ],
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
