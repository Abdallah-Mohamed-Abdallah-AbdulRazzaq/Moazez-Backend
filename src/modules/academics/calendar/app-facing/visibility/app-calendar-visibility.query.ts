import { AcademicCalendarEventScopeType, Prisma } from '@prisma/client';
import type { AppCalendarVisibilityContext } from './app-calendar-visibility.types';

export function buildAppCalendarVisibilityWhere(
  context: AppCalendarVisibilityContext,
): Prisma.AcademicCalendarEventWhereInput {
  const visibleScopeBranches: Prisma.AcademicCalendarEventWhereInput[] = [
    { scopeType: AcademicCalendarEventScopeType.SCHOOL },
  ];

  if (context.visibleStageIds.length > 0) {
    visibleScopeBranches.push({
      scopeType: AcademicCalendarEventScopeType.STAGE,
      stageId: { in: unique(context.visibleStageIds) },
    });
  }

  if (context.visibleGradeIds.length > 0) {
    visibleScopeBranches.push({
      scopeType: AcademicCalendarEventScopeType.GRADE,
      gradeId: { in: unique(context.visibleGradeIds) },
    });
  }

  if (context.visibleSectionIds.length > 0) {
    visibleScopeBranches.push({
      scopeType: AcademicCalendarEventScopeType.SECTION,
      sectionId: { in: unique(context.visibleSectionIds) },
    });
  }

  return {
    schoolId: context.schoolId,
    OR: visibleScopeBranches,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
