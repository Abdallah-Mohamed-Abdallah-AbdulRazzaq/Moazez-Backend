import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
} from '@prisma/client';
import {
  AcademicsOverviewCalendarEventTypeDto,
  AcademicsOverviewCalendarScopeTypeDto,
  AcademicsOverviewResponseDto,
} from '../dto/academics-overview-response.dto';
import type {
  AcademicsOverviewAcademicYearRecord,
  AcademicsOverviewCalendarCounts,
  AcademicsOverviewCurriculumCounts,
  AcademicsOverviewLessonPlanCounts,
  AcademicsOverviewRoomCounts,
  AcademicsOverviewStructureCounts,
  AcademicsOverviewSubjectCounts,
  AcademicsOverviewTeacherAllocationCounts,
  AcademicsOverviewTermRecord,
  AcademicsOverviewTimetableCounts,
  AcademicsOverviewUpcomingEventRecord,
} from '../infrastructure/academics-overview.repository';

const EVENT_TYPE_TO_DTO = {
  [AcademicCalendarEventType.HOLIDAY]:
    AcademicsOverviewCalendarEventTypeDto.HOLIDAY,
  [AcademicCalendarEventType.EXAM]: AcademicsOverviewCalendarEventTypeDto.EXAM,
  [AcademicCalendarEventType.ACTIVITY]:
    AcademicsOverviewCalendarEventTypeDto.ACTIVITY,
  [AcademicCalendarEventType.OTHER]:
    AcademicsOverviewCalendarEventTypeDto.OTHER,
} satisfies Record<
  AcademicCalendarEventType,
  AcademicsOverviewCalendarEventTypeDto
>;

const SCOPE_TYPE_TO_DTO = {
  [AcademicCalendarEventScopeType.SCHOOL]:
    AcademicsOverviewCalendarScopeTypeDto.SCHOOL,
  [AcademicCalendarEventScopeType.STAGE]:
    AcademicsOverviewCalendarScopeTypeDto.STAGE,
  [AcademicCalendarEventScopeType.GRADE]:
    AcademicsOverviewCalendarScopeTypeDto.GRADE,
  [AcademicCalendarEventScopeType.SECTION]:
    AcademicsOverviewCalendarScopeTypeDto.SECTION,
} satisfies Record<
  AcademicCalendarEventScopeType,
  AcademicsOverviewCalendarScopeTypeDto
>;

export interface AcademicsOverviewCounts {
  structure: AcademicsOverviewStructureCounts;
  subjects: AcademicsOverviewSubjectCounts;
  rooms: AcademicsOverviewRoomCounts;
  teacherAllocation: AcademicsOverviewTeacherAllocationCounts;
  curriculum: AcademicsOverviewCurriculumCounts;
  lessonPlans: AcademicsOverviewLessonPlanCounts;
  timetable: AcademicsOverviewTimetableCounts;
  calendar: AcademicsOverviewCalendarCounts;
}

export interface PresentAcademicsOverviewInput {
  generatedAt: Date;
  academicYear: AcademicsOverviewAcademicYearRecord | null;
  term: AcademicsOverviewTermRecord | null;
  counts: AcademicsOverviewCounts;
  upcomingEvents: AcademicsOverviewUpcomingEventRecord[];
}

export const EMPTY_ACADEMICS_OVERVIEW_COUNTS: AcademicsOverviewCounts = {
  structure: {
    stagesCount: 0,
    gradesCount: 0,
    sectionsCount: 0,
    classroomsCount: 0,
  },
  subjects: {
    subjectsCount: 0,
    activeSubjectsCount: 0,
  },
  rooms: {
    roomsCount: 0,
  },
  teacherAllocation: {
    allocationsCount: 0,
    allocatedTeachersCount: 0,
    allocatedSubjectsCount: 0,
  },
  curriculum: {
    curriculaCount: 0,
    activeCurriculaCount: 0,
    unitsCount: 0,
    lessonsCount: 0,
  },
  lessonPlans: {
    lessonPlansCount: 0,
    plannedItemsCount: 0,
  },
  timetable: {
    entriesCount: 0,
    activeEntriesCount: 0,
  },
  calendar: {
    eventsCount: 0,
    upcomingEventsCount: 0,
  },
};

export function toOverviewCalendarEventTypeDto(
  type: AcademicCalendarEventType,
): AcademicsOverviewCalendarEventTypeDto {
  return EVENT_TYPE_TO_DTO[type];
}

export function toOverviewCalendarScopeTypeDto(
  scopeType: AcademicCalendarEventScopeType,
): AcademicsOverviewCalendarScopeTypeDto {
  return SCOPE_TYPE_TO_DTO[scopeType];
}

function resolveScopeId(event: AcademicsOverviewUpcomingEventRecord): string | null {
  switch (event.scopeType) {
    case AcademicCalendarEventScopeType.SCHOOL:
      return null;
    case AcademicCalendarEventScopeType.STAGE:
      return event.stageId ?? event.scopeKey ?? null;
    case AcademicCalendarEventScopeType.GRADE:
      return event.gradeId ?? event.scopeKey ?? null;
    case AcademicCalendarEventScopeType.SECTION:
      return event.sectionId ?? event.scopeKey ?? null;
  }
}

export function presentAcademicsOverview(
  input: PresentAcademicsOverviewInput,
): AcademicsOverviewResponseDto {
  const { academicYear, term, counts } = input;
  const hasAcademicYear = academicYear !== null;
  const hasTerm = term !== null;
  const hasStructure =
    counts.structure.stagesCount > 0 &&
    counts.structure.gradesCount > 0 &&
    counts.structure.sectionsCount > 0 &&
    counts.structure.classroomsCount > 0;
  const hasSubjects = counts.subjects.subjectsCount > 0;
  const hasRooms = counts.rooms.roomsCount > 0;
  const hasTeacherAllocations =
    counts.teacherAllocation.allocationsCount > 0;
  const hasCurriculum = counts.curriculum.curriculaCount > 0;
  const hasLessonPlans = counts.lessonPlans.lessonPlansCount > 0;
  const hasTimetable = counts.timetable.entriesCount > 0;
  const hasCalendarEvents = counts.calendar.eventsCount > 0;
  const readyForScheduling =
    hasAcademicYear &&
    hasTerm &&
    hasStructure &&
    hasSubjects &&
    hasRooms &&
    hasTeacherAllocations;
  const readyForLearningFlow =
    readyForScheduling && hasCurriculum && hasLessonPlans && hasTimetable;

  return {
    generatedAt: input.generatedAt.toISOString(),
    academicContext: {
      academicYear: academicYear
        ? {
            id: academicYear.id,
            nameAr: academicYear.nameAr ?? null,
            nameEn: academicYear.nameEn ?? null,
            startDate: academicYear.startDate.toISOString(),
            endDate: academicYear.endDate.toISOString(),
            isActive: academicYear.isActive,
          }
        : null,
      term: term
        ? {
            id: term.id,
            academicYearId: term.academicYearId,
            nameAr: term.nameAr ?? null,
            nameEn: term.nameEn ?? null,
            startDate: term.startDate.toISOString(),
            endDate: term.endDate.toISOString(),
            isActive: term.isActive,
          }
        : null,
    },
    structure: counts.structure,
    subjects: counts.subjects,
    rooms: counts.rooms,
    teacherAllocation: counts.teacherAllocation,
    curriculum: counts.curriculum,
    lessonPlans: counts.lessonPlans,
    timetable: counts.timetable,
    calendar: counts.calendar,
    upcomingEvents: input.upcomingEvents.map((event) => ({
      id: event.id,
      academicYearId: event.academicYearId,
      termId: event.termId,
      title: event.title,
      type: toOverviewCalendarEventTypeDto(event.type),
      scope: {
        type: toOverviewCalendarScopeTypeDto(event.scopeType),
        id: resolveScopeId(event),
      },
      allDay: event.allDay,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
    })),
    setupIndicators: {
      hasAcademicYear,
      hasTerm,
      hasStructure,
      hasSubjects,
      hasRooms,
      hasTeacherAllocations,
      hasCurriculum,
      hasLessonPlans,
      hasTimetable,
      hasCalendarEvents,
      readyForScheduling,
      readyForLearningFlow,
    },
    deferred: {
      advancedAnalytics: true,
      alertsLifecycle: true,
      appFacingOverview: true,
    },
  };
}
