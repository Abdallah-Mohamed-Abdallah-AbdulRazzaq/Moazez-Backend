import { AcademicCalendarEventScopeType } from '@prisma/client';
import {
  AppCalendarVisibilityService,
  buildAppCalendarVisibilityWhere,
} from '../visibility/app-calendar-visibility.service';

describe('AppCalendarVisibilityService', () => {
  const service = new AppCalendarVisibilityService({} as never);

  it('derives teacher visibility from owned allocation classroom structure', () => {
    const visibility = service.buildTeacherVisibilityContext({
      schoolId: 'school-1',
      allocations: [
        {
          schoolId: 'school-1',
          classroomId: 'classroom-1',
          classroom: {
            id: 'classroom-1',
            schoolId: 'school-1',
            sectionId: 'section-1',
            section: {
              id: 'section-1',
              schoolId: 'school-1',
              gradeId: 'grade-1',
              grade: {
                id: 'grade-1',
                schoolId: 'school-1',
                stageId: 'stage-1',
                stage: {
                  id: 'stage-1',
                  schoolId: 'school-1',
                },
              },
            },
          },
        },
        {
          schoolId: 'school-2',
          classroomId: 'classroom-2',
          classroom: null,
        },
      ],
    });

    expect(visibility).toEqual({
      actorKind: 'teacher',
      schoolId: 'school-1',
      visibleStageIds: ['stage-1'],
      visibleGradeIds: ['grade-1'],
      visibleSectionIds: ['section-1'],
    });
  });

  it('derives student visibility from current enrollment classroom scope', () => {
    const visibility = service.buildStudentVisibilityContext({
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomScope: {
        classroomId: 'classroom-1',
        schoolId: 'school-1',
        sectionId: 'section-1',
        gradeId: 'grade-1',
        stageId: 'stage-1',
      },
    });

    expect(visibility).toEqual({
      actorKind: 'student',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      visibleStageIds: ['stage-1'],
      visibleGradeIds: ['grade-1'],
      visibleSectionIds: ['section-1'],
    });
  });

  it('derives parent visibility from owned child current enrollment scope', () => {
    const visibility = service.buildParentVisibilityContext({
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomScope: {
        classroomId: 'classroom-1',
        schoolId: 'school-1',
        sectionId: 'section-1',
        gradeId: 'grade-1',
        stageId: 'stage-1',
      },
    });

    expect(visibility.actorKind).toBe('parent');
    expect(visibility.visibleStageIds).toEqual(['stage-1']);
    expect(visibility.visibleGradeIds).toEqual(['grade-1']);
    expect(visibility.visibleSectionIds).toEqual(['section-1']);
  });

  it('builds a visibility query for school, stage, grade, and section scopes only', () => {
    const where = buildAppCalendarVisibilityWhere({
      actorKind: 'student',
      schoolId: 'school-1',
      visibleStageIds: ['stage-1', 'stage-1'],
      visibleGradeIds: ['grade-1'],
      visibleSectionIds: ['section-1'],
    });

    expect(where).toEqual({
      schoolId: 'school-1',
      OR: [
        { scopeType: AcademicCalendarEventScopeType.SCHOOL },
        {
          scopeType: AcademicCalendarEventScopeType.STAGE,
          stageId: { in: ['stage-1'] },
        },
        {
          scopeType: AcademicCalendarEventScopeType.GRADE,
          gradeId: { in: ['grade-1'] },
        },
        {
          scopeType: AcademicCalendarEventScopeType.SECTION,
          sectionId: { in: ['section-1'] },
        },
      ],
    });
    expect(JSON.stringify(where)).not.toContain('stage-2');
    expect(JSON.stringify(where)).not.toContain('grade-2');
    expect(JSON.stringify(where)).not.toContain('section-2');
  });
});
