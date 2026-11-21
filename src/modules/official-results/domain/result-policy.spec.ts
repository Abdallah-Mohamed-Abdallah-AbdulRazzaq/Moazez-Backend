import {
  effectiveResultPolicy,
  managedResultPolicy,
  parseResultPolicy,
} from './result-policy';
import type { ConcreteResultsScope, ResultScopeFacts } from './result-scope';

const stage = '10000000-0000-4000-8000-000000000001';
const grade = '10000000-0000-4000-8000-000000000002';
const section = '10000000-0000-4000-8000-000000000003';
const classroom = '10000000-0000-4000-8000-000000000004';
const subject = '10000000-0000-4000-8000-000000000005';
const period = '10000000-0000-4000-8000-000000000006';
const year = '10000000-0000-4000-8000-000000000007';
const group = '10000000-0000-4000-8000-000000000008';
const target: ConcreteResultsScope = {
  academic: {
    STAGE: stage,
    GRADE: grade,
    SECTION: section,
    CLASSROOM: classroom,
  },
  subjectId: subject,
  groupId: group,
  period: { id: period, academicYearId: year, kind: 'TERM' },
};
const facts: ResultScopeFacts = {
  paths: {
    STAGE: new Map([[stage, { STAGE: stage }]]),
    GRADE: new Map([[grade, { STAGE: stage, GRADE: grade }]]),
    SECTION: new Map([
      [section, { STAGE: stage, GRADE: grade, SECTION: section }],
    ]),
    CLASSROOM: new Map([[classroom, target.academic]]),
  },
  periods: new Map([[period, target.period]]),
};

describe('Official Results policy validation and applicability', () => {
  it('preserves MANAGED draft authoring and separates correction policy', () => {
    expect(managedResultPolicy()).toMatchObject({
      teacherMode: 'MANAGED',
      firstPublication: 'SCHOOL_REVIEW',
      personalDesignEnabled: true,
    });
    expect(parseResultPolicy({ teacherMode: 'AUTONOMOUS' })).toMatchObject({
      officialDesignAcceptance: 'DIRECT_IF_AUTHORIZED',
      firstPublication: 'DIRECT_IF_AUTHORIZED',
      correctionPublication: 'SCHOOL_REVIEW',
      personalDesignEnabled: true,
    });
    expect(() => parseResultPolicy({ personalDesignEnabled: false })).toThrow();
    expect(() =>
      parseResultPolicy({
        teacherMode: 'AUTONOMOUS',
        requireDistinctApprover: true,
      }),
    ).toThrow();
  });

  it('requires an intersection policy when grade and subject rules disagree', () => {
    const periodSelector = { kind: 'ALL_PERIODS', periodKinds: ['TERM'] };
    const math = {
      academicScope: { level: 'SCHOOL', ids: [] },
      groupScope: { kind: 'SUBJECTS', subjectIds: [subject] },
      periodSelector,
      overrides: { defaultInputScale: 3 },
    };
    const gradeRule = {
      academicScope: { level: 'GRADE', ids: [grade] },
      groupScope: { kind: 'ALL_SUBJECTS' },
      periodSelector,
      overrides: { defaultInputScale: 1 },
    };
    const intersection = {
      ...math,
      academicScope: gradeRule.academicScope,
      overrides: { defaultInputScale: 4 },
    };
    expect(() =>
      effectiveResultPolicy(
        parseResultPolicy({ scopedOverrides: [math, gradeRule] }),
        target,
        facts,
      ),
    ).toThrow(
      expect.objectContaining({ code: 'official_results.scope.conflict' }),
    );
    for (const rules of [
      [intersection, math, gradeRule],
      [gradeRule, math, intersection],
    ]) {
      expect(
        effectiveResultPolicy(
          parseResultPolicy({ scopedOverrides: rules }),
          target,
          facts,
        ).settings.defaultInputScale,
      ).toBe(4);
    }
  });

  it('preserves the global publication suspension ceiling', () => {
    expect(() =>
      parseResultPolicy({
        scopedOverrides: [
          {
            academicScope: { level: 'CLASSROOM', ids: [classroom] },
            groupScope: { kind: 'ALL_SUBJECTS' },
            periodSelector: { kind: 'EXACT_PERIODS', periodIds: [period] },
            overrides: { publicationSuspended: false },
          },
        ],
      }),
    ).toThrow();
    expect(
      effectiveResultPolicy(
        parseResultPolicy({ publicationSuspended: true }),
        target,
        facts,
      ).settings.publicationSuspended,
    ).toBe(true);
  });
});
