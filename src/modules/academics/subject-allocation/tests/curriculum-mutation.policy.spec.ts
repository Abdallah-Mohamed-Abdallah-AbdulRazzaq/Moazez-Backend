import { isActiveCurriculumRequirement } from '../domain/active-curriculum.policy';
import {
  classifySubjectAllocationMutation,
  hasCurriculumDependencyConflict,
  SubjectAllocationDependencyCounts,
} from '../domain/subject-allocation-mutation.policy';
import { assertCurriculumMutationAllowed } from '../application/assert-curriculum-mutation-allowed';

const emptyCounts: SubjectAllocationDependencyCounts = {
  teacherAllocationCount: 0,
  draftTimetableEntryCount: 0,
  publishedTimetableEntryCount: 0,
  publishedTimetableConfigCount: 0,
};

describe('Curriculum authority and submitted mutation policy', () => {
  it.each([
    [null, false],
    [undefined, false],
    [{ weeklyHours: -1 }, false],
    [{ weeklyHours: 0 }, false],
    [{ weeklyHours: 1 }, true],
  ])('classifies curriculum %j as active=%s', (row, expected) => {
    expect(isActiveCurriculumRequirement(row)).toBe(expected);
  });

  it.each([
    [null, 5, 'ADD'],
    [null, 0, 'ADD'],
    [5, 5, 'UNCHANGED'],
    [0, 0, 'UNCHANGED'],
    [0, 5, 'ACTIVATE'],
    [-1, 5, 'ACTIVATE'],
    [5, 0, 'DEACTIVATE'],
    [5, 4, 'POSITIVE_REQUIREMENT_CHANGE'],
    [5, 7, 'POSITIVE_REQUIREMENT_CHANGE'],
  ] as const)('classifies %s to %s as %s', (before, after, type) => {
    expect(
      classifySubjectAllocationMutation(
        before === null ? null : { weeklyHours: before },
        { gradeId: 'grade', subjectId: 'subject', weeklyHours: after },
      ),
    ).toEqual({
      gradeId: 'grade',
      subjectId: 'subject',
      previousWeeklyHours: before,
      proposedWeeklyHours: after,
      type,
    });
  });

  it.each([
    [5, 0, 'teacherAllocationCount', true],
    [5, 0, 'draftTimetableEntryCount', true],
    [5, 0, 'publishedTimetableEntryCount', true],
    [5, 0, 'publishedTimetableConfigCount', true],
    [5, 4, 'teacherAllocationCount', false],
    [5, 7, 'draftTimetableEntryCount', false],
    [5, 4, 'publishedTimetableEntryCount', true],
    [5, 7, 'publishedTimetableConfigCount', true],
    [5, 5, 'publishedTimetableEntryCount', false],
    [0, 5, 'teacherAllocationCount', false],
    [null, 5, 'publishedTimetableEntryCount', false],
  ] as const)(
    'evaluates %s to %s with %s',
    (before, after, category, blocked) => {
      const mutation = classifySubjectAllocationMutation(
        before === null ? null : { weeklyHours: before },
        { gradeId: 'grade', subjectId: 'subject', weeklyHours: after },
      );
      expect(
        hasCurriculumDependencyConflict({
          ...mutation,
          dependencies: { ...emptyCounts, [category]: 2 },
        }),
      ).toBe(blocked);
    },
  );

  it('allows dependency-free deactivation and returns bounded stable conflict details otherwise', () => {
    const mutation = classifySubjectAllocationMutation(
      { weeklyHours: 5 },
      { gradeId: 'grade', subjectId: 'subject', weeklyHours: 0 },
    );
    expect(() =>
      assertCurriculumMutationAllowed('term', [
        { ...mutation, dependencies: emptyCounts },
      ]),
    ).not.toThrow();
    try {
      assertCurriculumMutationAllowed('term', [
        {
          ...mutation,
          dependencies: { ...emptyCounts, teacherAllocationCount: 3 },
        },
      ]);
      throw new Error('Expected a dependency conflict');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'academics.subject_allocation.dependency_conflict',
        httpStatus: 409,
        details: {
          termId: 'term',
          gradeId: 'grade',
          subjectId: 'subject',
          mutation: 'DEACTIVATE',
          previousWeeklyHours: 5,
          proposedWeeklyHours: 0,
          ...emptyCounts,
          teacherAllocationCount: 3,
        },
      });
    }
  });
});
