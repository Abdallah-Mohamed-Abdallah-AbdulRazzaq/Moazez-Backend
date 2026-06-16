export type AppCalendarActorKind = 'teacher' | 'student' | 'parent';

export interface AppCalendarVisibilityContext {
  actorKind: AppCalendarActorKind;
  schoolId: string;
  academicYearId?: string;
  termId?: string | null;
  visibleStageIds: string[];
  visibleGradeIds: string[];
  visibleSectionIds: string[];
}

export interface AppCalendarClassroomScope {
  classroomId: string;
  schoolId: string;
  sectionId: string;
  gradeId: string;
  stageId: string;
}

export interface AppCalendarTeacherAllocationVisibilitySource {
  schoolId: string;
  classroomId: string;
  classroom: {
    id: string;
    schoolId: string;
    sectionId: string;
    section: {
      id: string;
      schoolId: string;
      gradeId: string;
      grade: {
        id: string;
        schoolId: string;
        stageId: string;
        stage: {
          id: string;
          schoolId: string;
        } | null;
      } | null;
    } | null;
  } | null;
}
