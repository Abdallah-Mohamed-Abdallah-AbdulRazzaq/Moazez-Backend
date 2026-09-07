import { Prisma, TimetableConfigStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  effectiveTimetableResolver,
  EffectiveTimetableClassroom,
} from '../domain/effective-timetable-resolver';

export const EFFECTIVE_TIMETABLE_CONFIG_ARGS =
  Prisma.validator<Prisma.TimetableConfigDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      name: true,
      weekStartDay: true,
      activeDays: true,
      status: true,
      scopeType: true,
      scopeKey: true,
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
      publications: {
        orderBy: { revision: 'desc' },
        take: 1,
        select: {
          status: true,
          revision: true,
        },
      },
    },
  });

export type EffectiveTimetableConfigRecord = Prisma.TimetableConfigGetPayload<
  typeof EFFECTIVE_TIMETABLE_CONFIG_ARGS
>;

export interface EffectiveTimetableTermBinding {
  timetableConfigId: string;
  termId: string;
  termStartDate: Date;
  termEndDate: Date;
  weekStartDay: number;
  activeDays: number[];
}

export interface EffectiveTimetableWeekSettings {
  weekStartDay: number;
  activeDays: number[];
  effectiveTimetables: EffectiveTimetableTermBinding[];
}

const EFFECTIVE_TIMETABLE_CLASSROOM_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
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
  });

type EffectiveTimetableClassroomRecord = Prisma.ClassroomGetPayload<
  typeof EFFECTIVE_TIMETABLE_CLASSROOM_ARGS
>;

export async function findEffectiveTimetableConfigs(
  prisma: PrismaService,
  params: {
    classroomId: string;
    academicYearId: string;
    termId?: string | null;
  },
): Promise<EffectiveTimetableConfigRecord[]> {
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: params.classroomId,
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
    ...EFFECTIVE_TIMETABLE_CLASSROOM_ARGS,
  });

  if (!classroom) return [];

  const candidates = await prisma.timetableConfig.findMany({
    where: {
      academicYearId: params.academicYearId,
      ...(params.termId ? { termId: params.termId } : {}),
      status: TimetableConfigStatus.ACTIVE,
    },
    ...EFFECTIVE_TIMETABLE_CONFIG_ARGS,
  });

  return resolveEffectiveConfigsByTerm(candidates, classroom);
}

export async function findEffectiveTimetableWeekSettings(
  prisma: PrismaService,
  params: {
    classroomId: string;
    academicYearId: string;
    termId?: string | null;
    requestedDate?: Date;
  },
): Promise<EffectiveTimetableWeekSettings | null> {
  const configs = await findEffectiveTimetableConfigs(prisma, params);
  const effectiveTimetables = configs
    .filter((config) => config.term.deletedAt === null)
    .map(toEffectiveTimetableTermBinding);

  const requestedDateTimetables = params.termId
    ? effectiveTimetables.filter((binding) => binding.termId === params.termId)
    : params.requestedDate
      ? effectiveTimetables.filter((binding) =>
          timetableTermContainsDate(binding, params.requestedDate!),
        )
      : [];

  // An explicit term is unique by query contract. For a nullable term, avoid
  // choosing arbitrary settings if invalid overlapping terms contain the date.
  if (requestedDateTimetables.length !== 1) return null;

  const requestedDateTimetable = requestedDateTimetables[0];
  return {
    weekStartDay: requestedDateTimetable.weekStartDay,
    activeDays: requestedDateTimetable.activeDays,
    effectiveTimetables,
  };
}

export function effectiveTimetableConfigIdsForDateRange(
  settings: EffectiveTimetableWeekSettings,
  params: { startDate: Date; endDate: Date },
): string[] {
  return settings.effectiveTimetables
    .filter(
      (binding) =>
        binding.termStartDate <= params.endDate &&
        binding.termEndDate >= params.startDate,
    )
    .map((binding) => binding.timetableConfigId);
}

export function resolveEffectiveConfigsByTerm(
  candidates: readonly EffectiveTimetableConfigRecord[],
  classroom: EffectiveTimetableClassroomRecord,
): EffectiveTimetableConfigRecord[] {
  const terms = new Map<string, EffectiveTimetableConfigRecord[]>();
  for (const candidate of candidates) {
    const current = terms.get(candidate.termId) ?? [];
    current.push(candidate);
    terms.set(candidate.termId, current);
  }

  return [...terms.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([termId, termCandidates]) =>
      effectiveTimetableResolver.resolve(termCandidates, {
        schoolId: classroom.schoolId,
        academicYearId: termCandidates[0].academicYearId,
        termId,
        classroom: classroom as EffectiveTimetableClassroom,
      }),
    )
    .filter(
      (config): config is EffectiveTimetableConfigRecord => config !== null,
    );
}

function toEffectiveTimetableTermBinding(
  config: EffectiveTimetableConfigRecord,
): EffectiveTimetableTermBinding {
  return {
    timetableConfigId: config.id,
    termId: config.termId,
    termStartDate: config.term.startDate,
    termEndDate: config.term.endDate,
    weekStartDay: config.weekStartDay,
    activeDays: config.activeDays,
  };
}

function timetableTermContainsDate(
  binding: EffectiveTimetableTermBinding,
  date: Date,
): boolean {
  return binding.termStartDate <= date && binding.termEndDate >= date;
}
