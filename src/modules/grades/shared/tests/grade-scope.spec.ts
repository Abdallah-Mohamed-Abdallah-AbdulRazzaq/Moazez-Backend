import { GradeScopeType } from '@prisma/client';
import {
  GradeAssessmentInvalidScopeException,
  getScopeSpecificField,
  normalizeGradeScopeType,
  resolveGradeScopeInput,
} from '../domain/grade-scope';

describe('grade scope helpers', () => {
  it('normalizes lowercase and enum scope types', () => {
    expect(normalizeGradeScopeType('school')).toBe(GradeScopeType.SCHOOL);
    expect(normalizeGradeScopeType('stage')).toBe(GradeScopeType.STAGE);
    expect(normalizeGradeScopeType(GradeScopeType.GRADE)).toBe(
      GradeScopeType.GRADE,
    );
  });

  it('rejects unsupported and empty scope types', () => {
    expect(() => normalizeGradeScopeType('')).toThrow(
      GradeAssessmentInvalidScopeException,
    );
    expect(() => normalizeGradeScopeType('campus')).toThrow(
      GradeAssessmentInvalidScopeException,
    );
  });

  it('requires scope id for stage, grade, section, and classroom', () => {
    expect(() => resolveGradeScopeInput({ scopeType: 'stage' })).toThrow(
      GradeAssessmentInvalidScopeException,
    );
    expect(() => resolveGradeScopeInput({ scopeType: 'grade' })).toThrow(
      GradeAssessmentInvalidScopeException,
    );
    expect(() => resolveGradeScopeInput({ scopeType: 'section' })).toThrow(
      GradeAssessmentInvalidScopeException,
    );
    expect(() => resolveGradeScopeInput({ scopeType: 'classroom' })).toThrow(
      GradeAssessmentInvalidScopeException,
    );
  });

  it('maps normalized scopes to the correct specific field', () => {
    expect(
      getScopeSpecificField(
        resolveGradeScopeInput({ scopeType: 'stage', scopeId: 'stage-1' }),
      ),
    ).toEqual({ stageId: 'stage-1' });

    expect(
      getScopeSpecificField(
        resolveGradeScopeInput({ scopeType: 'grade', gradeId: 'grade-1' }),
      ),
    ).toEqual({ gradeId: 'grade-1' });

    expect(
      getScopeSpecificField(
        resolveGradeScopeInput({
          scopeType: 'section',
          sectionId: 'section-1',
        }),
      ),
    ).toEqual({ sectionId: 'section-1' });

    expect(
      getScopeSpecificField(
        resolveGradeScopeInput({
          scopeType: 'classroom',
          classroomId: 'classroom-1',
        }),
      ),
    ).toEqual({ classroomId: 'classroom-1' });
  });

  it('allows school scope to use the supplied school id as scope key', () => {
    expect(
      resolveGradeScopeInput({
        scopeType: 'school',
        schoolId: 'school-1',
      }),
    ).toEqual({
      scopeType: GradeScopeType.SCHOOL,
      scopeKey: 'school-1',
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    });
  });
});
