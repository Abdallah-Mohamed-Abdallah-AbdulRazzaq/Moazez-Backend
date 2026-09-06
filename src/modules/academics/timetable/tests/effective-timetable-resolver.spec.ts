import {
  TimetableConfigStatus,
  TimetablePublicationStatus,
  TimetableScopeType,
} from '@prisma/client';
import {
  EffectiveTimetableConfigCandidate,
  EffectiveTimetableResolver,
  TIMETABLE_SCOPE_PRECEDENCE,
} from '../domain/effective-timetable-resolver';

describe('EffectiveTimetableResolver', () => {
  const resolver = new EffectiveTimetableResolver();
  const classroom = {
    id: 'classroom-1',
    sectionId: 'section-1',
    section: {
      gradeId: 'grade-1',
      grade: { stageId: 'stage-1' },
    },
  };
  const context = {
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroom,
  };

  it('defines the required explicit precedence without relying on enum order', () => {
    expect(TIMETABLE_SCOPE_PRECEDENCE).toEqual({
      TERM: 1,
      STAGE: 2,
      GRADE: 3,
      SECTION: 4,
      CLASSROOM: 5,
    });
  });

  it.each([
    [TimetableScopeType.TERM, 'term'],
    [TimetableScopeType.STAGE, 'stage'],
    [TimetableScopeType.GRADE, 'grade'],
    [TimetableScopeType.SECTION, 'section'],
    [TimetableScopeType.CLASSROOM, 'classroom'],
  ])('selects the most-specific published %s candidate', (scopeType, id) => {
    const candidates = [
      candidate(TimetableScopeType.CLASSROOM),
      candidate(TimetableScopeType.SECTION),
      candidate(TimetableScopeType.GRADE),
      candidate(TimetableScopeType.STAGE),
      candidate(TimetableScopeType.TERM),
    ].filter(
      (item) =>
        TIMETABLE_SCOPE_PRECEDENCE[item.scopeType] <=
        TIMETABLE_SCOPE_PRECEDENCE[scopeType],
    );

    expect(resolver.resolve(candidates, context)?.id).toBe(`config-${id}`);
  });

  it('lets an empty published child shadow a populated parent because entries do not participate in resolution', () => {
    expect(
      resolver.resolve(
        [
          candidate(TimetableScopeType.TERM),
          candidate(TimetableScopeType.CLASSROOM),
        ],
        context,
      )?.id,
    ).toBe('config-classroom');
  });

  it.each([
    ['draft config', { status: TimetableConfigStatus.DRAFT }],
    [
      'unpublished latest revision',
      {
        publications: [
          { status: TimetablePublicationStatus.PUBLISHED, revision: 1 },
          { status: TimetablePublicationStatus.SUPERSEDED, revision: 2 },
        ],
      },
    ],
    ['missing publication', { publications: [] }],
  ])(
    'does not let a %s child shadow a published parent',
    (_label, override) => {
      const child = {
        ...candidate(TimetableScopeType.CLASSROOM),
        ...override,
      };

      expect(
        resolver.resolve([candidate(TimetableScopeType.TERM), child], context)
          ?.id,
      ).toBe('config-term');
    },
  );

  it('ignores candidates outside the school, academic year, term, or classroom hierarchy', () => {
    const candidates = [
      candidate(TimetableScopeType.TERM, { schoolId: 'school-2' }),
      candidate(TimetableScopeType.STAGE, { stageId: 'stage-2' }),
      candidate(TimetableScopeType.GRADE, { gradeId: 'grade-2' }),
      candidate(TimetableScopeType.SECTION, { sectionId: 'section-2' }),
      candidate(TimetableScopeType.CLASSROOM, {
        classroomId: 'classroom-2',
      }),
    ];

    expect(resolver.resolve(candidates, context)).toBeNull();
  });

  it('returns null when no published applicable config exists', () => {
    expect(
      resolver.resolve(
        [
          candidate(TimetableScopeType.TERM, {
            status: TimetableConfigStatus.DRAFT,
          }),
          candidate(TimetableScopeType.CLASSROOM, {
            publications: [],
          }),
        ],
        context,
      ),
    ).toBeNull();
  });

  it('rejects equal-precedence ambiguity instead of selecting by result order', () => {
    expect(() =>
      resolver.resolve(
        [
          candidate(TimetableScopeType.CLASSROOM),
          candidate(TimetableScopeType.CLASSROOM, { id: 'duplicate' }),
        ],
        context,
      ),
    ).toThrow('Effective timetable resolution is ambiguous');
  });
});

function candidate(
  scopeType: TimetableScopeType,
  overrides: Partial<EffectiveTimetableConfigCandidate> = {},
): EffectiveTimetableConfigCandidate {
  const scopeName = scopeType.toLowerCase();
  return {
    id: `config-${scopeName}`,
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    status: TimetableConfigStatus.ACTIVE,
    scopeType,
    stageId: scopeType === TimetableScopeType.STAGE ? 'stage-1' : null,
    gradeId: scopeType === TimetableScopeType.GRADE ? 'grade-1' : null,
    sectionId: scopeType === TimetableScopeType.SECTION ? 'section-1' : null,
    classroomId:
      scopeType === TimetableScopeType.CLASSROOM ? 'classroom-1' : null,
    publications: [
      { status: TimetablePublicationStatus.PUBLISHED, revision: 1 },
    ],
    ...overrides,
  };
}
