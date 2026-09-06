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
