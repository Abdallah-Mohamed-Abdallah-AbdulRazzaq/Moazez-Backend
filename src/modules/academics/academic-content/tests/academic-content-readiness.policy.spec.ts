import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentType as Type,
} from '@prisma/client';
import {
  AcademicContentReadinessInput,
  evaluateAcademicContentReadiness,
} from '../domain/academic-content-readiness.policy';

const now = new Date('2028-09-15T12:00:00.000Z');
const yearId = '9cf0fdf2-c8aa-4ff5-bbed-8525926af063';
const complete = (): AcademicContentReadinessInput => ({
  status: Status.DRAFT,
  type: Type.TEACHER_PREPARATION,
  audience: Audience.INTERNAL_STAFF,
  title: 'Preparation',
  academicYearId: yearId,
  targets: [{ subjectId: '19f0d31e-2c8b-4bb0-88f8-9586a1dab9b5' }],
  hasTypeDetail: true,
  academicYearExists: true,
  term: {
    academicYearId: yearId,
    startDate: new Date('2028-09-01T00:00:00.000Z'),
    endDate: new Date('2028-12-31T00:00:00.000Z'),
    isActive: true,
  },
  now,
});
const codes = (input: AcademicContentReadinessInput) =>
  evaluateAcademicContentReadiness(input).blockingReasons.map(
    (reason) => reason.code,
  );

describe('Academic Content readiness policy', () => {
  it('accepts a complete typed authoring aggregate', () => {
    expect(evaluateAcademicContentReadiness(complete())).toEqual({
      canAdvance: true,
      blockingReasons: [],
    });
  });

  it.each([
    [Type.TEACHER_PREPARATION, Audience.INTERNAL_STAFF],
    [Type.WEEKLY_PLAN, Audience.STUDENTS],
    [Type.GUARDIAN_WEEKLY_NOTE, Audience.GUARDIANS],
    [Type.SUBJECT_RESOURCE, Audience.STUDENTS],
    [Type.ONLINE_SESSION, Audience.STUDENTS],
  ])('requires current detail for %s', (type, audience) => {
    expect(
      codes({ ...complete(), type, audience, hasTypeDetail: false }),
    ).toContain('academic_content.readiness.type_detail_missing');
  });

  it('exempts GENERAL_RESOURCE from typed detail', () => {
    expect(
      evaluateAcademicContentReadiness({
        ...complete(),
        type: Type.GENERAL_RESOURCE,
        audience: Audience.STUDENTS,
        hasTypeDetail: false,
      }),
    ).toEqual({ canAdvance: true, blockingReasons: [] });
  });

  it.each([
    [{ status: Status.ARCHIVED }, 'academic_content.readiness.read_only'],
    [{ title: '  ' }, 'academic_content.readiness.title_invalid'],
    [
      { academicYearExists: false },
      'academic_content.readiness.academic_year_missing',
    ],
    [{ term: null }, 'academic_content.readiness.term_missing'],
    [
      { audience: Audience.STUDENTS },
      'academic_content.readiness.audience_invalid',
    ],
    [{ targets: [] }, 'academic_content.readiness.targets_missing'],
    [
      { targets: [{ subjectId: null }] },
      'academic_content.readiness.subject_target_missing',
    ],
  ] as const)('emits the stable reason %s', (override, expected) => {
    expect(codes({ ...complete(), ...override })).toContain(expected);
  });

  it('blocks a term from another year and a non-writable term', () => {
    const input = complete();
    expect(
      codes({
        ...input,
        term: { ...input.term!, academicYearId: 'another-year' },
      }),
    ).toContain('academic_content.readiness.term_year_mismatch');
    expect(
      codes({ ...input, term: { ...input.term!, isActive: false } }),
    ).toContain('academic_content.readiness.term_closed');
    expect(
      codes({ ...input, now: new Date('2029-01-01T00:00:00Z') }),
    ).toContain('academic_content.readiness.term_closed');
  });

  it('returns multiple blockers in deterministic order without duplicates or secret values', () => {
    const input: AcademicContentReadinessInput = {
      ...complete(),
      status: Status.ARCHIVED,
      title: '',
      academicYearExists: false,
      term: null,
      audience: Audience.STUDENTS,
      targets: [],
      hasTypeDetail: false,
    };
    const first = evaluateAcademicContentReadiness(input);
    expect(first.canAdvance).toBe(false);
    expect(first.blockingReasons.map((reason) => reason.code)).toEqual([
      'academic_content.readiness.read_only',
      'academic_content.readiness.title_invalid',
      'academic_content.readiness.academic_year_missing',
      'academic_content.readiness.term_missing',
      'academic_content.readiness.audience_invalid',
      'academic_content.readiness.targets_missing',
      'academic_content.readiness.type_detail_missing',
    ]);
    expect(evaluateAcademicContentReadiness(input)).toEqual(first);
    expect(
      new Set(first.blockingReasons.map((reason) => reason.code)).size,
    ).toBe(first.blockingReasons.length);
  });
});
