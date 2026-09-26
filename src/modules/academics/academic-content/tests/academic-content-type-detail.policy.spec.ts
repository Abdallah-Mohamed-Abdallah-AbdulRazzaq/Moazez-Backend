import {
  AcademicContentTargetScopeType as Scope,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
} from '@prisma/client';
import {
  normalizeGuardianNote,
  normalizeOnlineSession,
  normalizePreparation,
  normalizeSubjectResource,
  normalizeWeeklyPlan,
} from '../domain/academic-content-type-detail.policy';
import {
  academicReferenceMatchesTargets,
  academicScopesIntersect,
} from '../domain/academic-content-reference-scope.policy';

const id = '11111111-1111-4111-8111-111111111111';
const preparation = () => ({
  objectives: [],
  learningOutcomes: [],
  teachingStrategies: [],
  activities: [],
});
const weekly = () => ({
  weekStartDate: '2028-09-10',
  weekEndDate: '2028-09-16',
  objectives: [],
  topics: [],
  homeworkAssignmentIds: [],
  gradeAssessmentIds: [],
});
const session = () => ({
  platform: AcademicOnlineSessionPlatform.ZOOM,
  joinUrl: 'https://example.org/meet',
  startAt: '2028-09-10T10:00:00Z',
  endAt: '2028-09-10T11:00:00Z',
  timezone: 'Africa/Cairo',
});

describe('ACC-5B canonical detail normalizers', () => {
  it('normalizes optional text, ordered arrays, and reference IDs without truncating', () => {
    const state = normalizePreparation({
      ...preparation(),
      topic: '  Topic\nline  ',
      objectives: ['  first   item  ', 'first item'],
      curriculumId: id.toUpperCase(),
    }).state;
    expect(state.topic).toBe('Topic\nline');
    expect(state.objectives).toEqual(['first item', 'first item']);
    expect(state.curriculumId).toBe(id);
    expect(state.teacherNotes).toBeNull();
  });

  it('enforces preparation array and text boundaries', () => {
    expect(
      normalizePreparation({
        ...preparation(),
        objectives: Array.from({ length: 50 }, () => 'x'.repeat(500)),
        topic: 'x'.repeat(500),
        teacherNotes: 'x'.repeat(4000),
      }).state.objectives,
    ).toHaveLength(50);
    for (const objectives of [
      Array.from({ length: 51 }, () => 'a'),
      [''],
      [null],
      [3],
      [{}],
      [[]],
      ['x'.repeat(501)],
      new Array<string>(1),
    ]) {
      expect(() =>
        normalizePreparation({
          ...preparation(),
          objectives: objectives as string[],
        }),
      ).toThrow();
    }
    expect(() =>
      normalizePreparation({ ...preparation(), topic: 'x'.repeat(501) }),
    ).toThrow();
    expect(() =>
      normalizePreparation({
        ...preparation(),
        teacherNotes: 'x'.repeat(4001),
      }),
    ).toThrow();
  });

  it('enforces date-only weekly windows and canonical reference sets', () => {
    expect(
      normalizeWeeklyPlan({
        ...weekly(),
        weekEndDate: '2028-09-10',
        homeworkAssignmentIds: [id, id],
      }).state.homeworkAssignmentIds,
    ).toEqual([id]);
    for (const dates of [
      { weekStartDate: '2028-09-17', weekEndDate: '2028-09-16' },
      { weekStartDate: '2028-02-30', weekEndDate: '2028-03-01' },
      { weekStartDate: '2028-9-10', weekEndDate: '2028-09-16' },
    ])
      expect(() => normalizeWeeklyPlan({ ...weekly(), ...dates })).toThrow();
    expect(() =>
      normalizeWeeklyPlan({ ...weekly(), gradeAssessmentIds: ['not-a-uuid'] }),
    ).toThrow();
    expect(() =>
      normalizeWeeklyPlan({
        ...weekly(),
        homeworkAssignmentIds: Array.from({ length: 101 }, () => id),
      }),
    ).toThrow();
  });

  it('enforces guardian and subject resource enums and body bounds', () => {
    for (const priority of Object.values(AcademicGuardianNotePriority)) {
      expect(
        normalizeGuardianNote({
          body: 'x'.repeat(10000),
          priority,
          requiresAcknowledgement: true,
        }).state.priority,
      ).toBe(priority);
    }
    expect(() =>
      normalizeGuardianNote({
        body: ' ',
        priority: AcademicGuardianNotePriority.NORMAL,
        requiresAcknowledgement: false,
      }),
    ).toThrow();
    expect(() =>
      normalizeGuardianNote({
        body: 'x'.repeat(10001),
        priority: AcademicGuardianNotePriority.NORMAL,
        requiresAcknowledgement: false,
      }),
    ).toThrow();
    expect(() =>
      normalizeGuardianNote({
        body: 'hi',
        priority: 'INVALID' as AcademicGuardianNotePriority,
        requiresAcknowledgement: false,
      }),
    ).toThrow();
    for (const resourceCategory of Object.values(
      AcademicSubjectResourceCategory,
    )) {
      expect(
        normalizeSubjectResource({ resourceCategory }).state.resourceCategory,
      ).toBe(resourceCategory);
    }
  });

  it('enforces platform, URL, timezone, and instant rules', () => {
    for (const platform of Object.values(AcademicOnlineSessionPlatform)) {
      const command = {
        ...session(),
        platform,
        providerName:
          platform === AcademicOnlineSessionPlatform.OTHER
            ? 'Provider'
            : undefined,
      };
      expect(normalizeOnlineSession(command).state.platform).toBe(platform);
    }
    expect(() =>
      normalizeOnlineSession({
        ...session(),
        platform: AcademicOnlineSessionPlatform.OTHER,
      }),
    ).toThrow();
    for (const joinUrl of [
      'http://example.org',
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///a',
      'https://u:p@example.org',
    ]) {
      expect(() => normalizeOnlineSession({ ...session(), joinUrl })).toThrow();
    }
    expect(() =>
      normalizeOnlineSession({ ...session(), timezone: 'Invalid/Zone' }),
    ).toThrow();
    expect(() =>
      normalizeOnlineSession({ ...session(), endAt: session().startAt }),
    ).toThrow();
    expect(() =>
      normalizeOnlineSession({ ...session(), startAt: 'bad' }),
    ).toThrow();
    expect(() =>
      normalizeOnlineSession({ ...session(), startAt: '2028-09-10' }),
    ).toThrow();
  });
});

describe('ACC-5B subject and hierarchy intersection', () => {
  const target = {
    scopeType: Scope.CLASSROOM,
    subjectId: id,
    stageId: 's',
    gradeId: 'g1',
    sectionId: 'e1',
    classroomId: 'c1',
  };
  it('accepts ancestor and descendant scope intersection for the same subject', () => {
    expect(
      academicScopesIntersect(target, {
        ...target,
        scopeType: Scope.GRADE,
        sectionId: null,
        classroomId: null,
      }),
    ).toBe(true);
    expect(
      academicReferenceMatchesTargets([target], {
        scopeType: Scope.STAGE,
        subjectId: id,
        stageId: 's',
        gradeId: null,
        sectionId: null,
        classroomId: null,
      }),
    ).toBe(true);
  });
  it('rejects unrelated branches, mismatched subject, and absent targets', () => {
    expect(
      academicReferenceMatchesTargets([target], { ...target, gradeId: 'g2' }),
    ).toBe(false);
    expect(
      academicReferenceMatchesTargets([target], {
        ...target,
        subjectId: 'other',
      }),
    ).toBe(false);
    expect(academicReferenceMatchesTargets([], target)).toBe(false);
  });
});
