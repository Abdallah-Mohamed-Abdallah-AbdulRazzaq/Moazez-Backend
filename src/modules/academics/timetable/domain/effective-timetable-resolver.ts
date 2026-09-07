import {
  TimetableConfigStatus,
  TimetablePublicationStatus,
  TimetableScopeType,
} from '@prisma/client';
import { classroomMatchesTimetableConfigScope } from './timetable-policy';

export const TIMETABLE_SCOPE_PRECEDENCE: Readonly<
  Record<TimetableScopeType, number>
> = Object.freeze({
  [TimetableScopeType.TERM]: 1,
  [TimetableScopeType.STAGE]: 2,
  [TimetableScopeType.GRADE]: 3,
  [TimetableScopeType.SECTION]: 4,
  [TimetableScopeType.CLASSROOM]: 5,
});

export interface EffectiveTimetableClassroom {
  id: string;
  sectionId: string;
  section: {
    gradeId: string;
    grade: {
      stageId: string;
    };
  };
}

export interface EffectiveTimetablePublication {
  status: TimetablePublicationStatus;
  revision: number;
}

export interface EffectiveTimetableConfigCandidate {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  status: TimetableConfigStatus;
  scopeType: TimetableScopeType;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  publications: readonly EffectiveTimetablePublication[];
}

export interface EffectiveTimetableContext {
  schoolId: string;
  academicYearId: string;
  termId: string;
  classroom: EffectiveTimetableClassroom;
}

export class EffectiveTimetableResolver {
  resolve<T extends EffectiveTimetableConfigCandidate>(
    candidates: readonly T[],
    context: EffectiveTimetableContext,
  ): T | null {
    const applicable = candidates.filter(
      (candidate) =>
        candidate.schoolId === context.schoolId &&
        candidate.academicYearId === context.academicYearId &&
        candidate.termId === context.termId &&
        candidate.status === TimetableConfigStatus.ACTIVE &&
        latestPublication(candidate.publications)?.status ===
          TimetablePublicationStatus.PUBLISHED &&
        classroomMatchesTimetableConfigScope(candidate, context.classroom),
    );

    if (applicable.length === 0) return null;

    const highestPrecedence = Math.max(
      ...applicable.map(
        (candidate) => TIMETABLE_SCOPE_PRECEDENCE[candidate.scopeType],
      ),
    );
    const winners = applicable.filter(
      (candidate) =>
        TIMETABLE_SCOPE_PRECEDENCE[candidate.scopeType] === highestPrecedence,
    );

    if (winners.length !== 1) {
      throw new Error(
        `Effective timetable resolution is ambiguous for classroom ${context.classroom.id}, term ${context.termId}, and scope ${winners[0].scopeType}`,
      );
    }

    return winners[0];
  }
}

function latestPublication(
  publications: readonly EffectiveTimetablePublication[],
): EffectiveTimetablePublication | null {
  return publications.reduce<EffectiveTimetablePublication | null>(
    (latest, publication) =>
      !latest || publication.revision > latest.revision ? publication : latest,
    null,
  );
}

export const effectiveTimetableResolver = new EffectiveTimetableResolver();
