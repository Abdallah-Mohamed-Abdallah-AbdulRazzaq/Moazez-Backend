import { Injectable } from '@nestjs/common';
import { AppCalendarEventsRepository } from '../infrastructure/app-calendar-events.repository';
import type {
  AppCalendarClassroomScope,
  AppCalendarTeacherAllocationVisibilitySource,
  AppCalendarVisibilityContext,
} from './app-calendar-visibility.types';
export { buildAppCalendarVisibilityWhere } from './app-calendar-visibility.query';

@Injectable()
export class AppCalendarVisibilityService {
  constructor(
    private readonly appCalendarEventsRepository: AppCalendarEventsRepository,
  ) {}

  findClassroomScope(
    classroomId: string,
  ): Promise<AppCalendarClassroomScope | null> {
    return this.appCalendarEventsRepository.findClassroomScope(classroomId);
  }

  buildTeacherVisibilityContext(params: {
    schoolId: string;
    allocations: AppCalendarTeacherAllocationVisibilitySource[];
  }): AppCalendarVisibilityContext {
    const visibleStageIds = new Set<string>();
    const visibleGradeIds = new Set<string>();
    const visibleSectionIds = new Set<string>();

    for (const allocation of params.allocations) {
      if (allocation.schoolId !== params.schoolId) continue;

      const classroom = allocation.classroom;
      const section = classroom?.section;
      const grade = section?.grade;
      const stage = grade?.stage;

      if (
        classroom?.schoolId !== params.schoolId ||
        section?.schoolId !== params.schoolId ||
        grade?.schoolId !== params.schoolId ||
        stage?.schoolId !== params.schoolId
      ) {
        continue;
      }

      visibleSectionIds.add(section.id);
      visibleGradeIds.add(grade.id);
      visibleStageIds.add(stage.id);
    }

    return {
      actorKind: 'teacher',
      schoolId: params.schoolId,
      visibleStageIds: [...visibleStageIds],
      visibleGradeIds: [...visibleGradeIds],
      visibleSectionIds: [...visibleSectionIds],
    };
  }

  buildStudentVisibilityContext(params: {
    schoolId: string;
    academicYearId: string;
    termId?: string | null;
    classroomScope: AppCalendarClassroomScope;
  }): AppCalendarVisibilityContext {
    return this.buildEnrollmentVisibilityContext({
      actorKind: 'student',
      ...params,
    });
  }

  buildParentVisibilityContext(params: {
    schoolId: string;
    academicYearId: string;
    termId?: string | null;
    classroomScope: AppCalendarClassroomScope;
  }): AppCalendarVisibilityContext {
    return this.buildEnrollmentVisibilityContext({
      actorKind: 'parent',
      ...params,
    });
  }

  private buildEnrollmentVisibilityContext(params: {
    actorKind: 'student' | 'parent';
    schoolId: string;
    academicYearId: string;
    termId?: string | null;
    classroomScope: AppCalendarClassroomScope;
  }): AppCalendarVisibilityContext {
    if (params.classroomScope.schoolId !== params.schoolId) {
      return {
        actorKind: params.actorKind,
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId ?? null,
        visibleStageIds: [],
        visibleGradeIds: [],
        visibleSectionIds: [],
      };
    }

    return {
      actorKind: params.actorKind,
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      termId: params.termId ?? null,
      visibleStageIds: [params.classroomScope.stageId],
      visibleGradeIds: [params.classroomScope.gradeId],
      visibleSectionIds: [params.classroomScope.sectionId],
    };
  }
}
