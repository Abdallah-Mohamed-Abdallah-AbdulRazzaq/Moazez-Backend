import {
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as Status,
  AcademicContentType as Type,
} from '@prisma/client';
import {
  academicContentCurrentAccessAllows,
  AcademicContentCurrentAccessPublication,
  AcademicContentCurrentRecipientContext,
} from '../domain/academic-content-current-access.policy';

const now = new Date('2026-10-07T12:00:00Z');
const context: AcademicContentCurrentRecipientContext = {
  actorKind: 'STUDENT',
  schoolId: 'school',
  userId: 'user',
  studentId: 'student',
  enrollmentId: 'enrollment',
  classroomId: 'classroom',
  academicYearId: 'year',
  termId: 'term',
};
const source = (): AcademicContentCurrentAccessPublication => ({
  id: 'publication',
  schoolId: 'school',
  academicContentId: 'content',
  revisionId: 'revision',
  status: Status.PUBLISHED,
  publishedAt: now,
  visibleFrom: now,
  visibleUntil: null,
  revision: {
    id: 'revision',
    schoolId: 'school',
    academicContentId: 'content',
    snapshotContractVersion: 2,
    academicYearId: 'year',
    termId: 'term',
    type: Type.GENERAL_RESOURCE,
    audience: Audience.STUDENTS_AND_GUARDIANS,
  },
});

describe('ACC-10A current recipient access policy', () => {
  it.each([
    ['STUDENT', Audience.STUDENTS, true],
    ['STUDENT', Audience.STUDENTS_AND_GUARDIANS, true],
    ['STUDENT', Audience.GUARDIANS, false],
    ['STUDENT', Audience.INTERNAL_STAFF, false],
    ['PARENT', Audience.STUDENTS, false],
    ['PARENT', Audience.STUDENTS_AND_GUARDIANS, true],
    ['PARENT', Audience.GUARDIANS, true],
    ['PARENT', Audience.INTERNAL_STAFF, false],
  ] as const)('%s audience %s allows=%s', (actorKind, audience, expected) => {
    const publication = source();
    publication.revision.audience = audience;
    expect(
      academicContentCurrentAccessAllows(
        { ...context, actorKind, guardianIds: [] },
        publication,
        now,
      ),
    ).toBe(expected);
  });
  it.each(['STUDENT', 'PARENT'] as const)(
    'explicitly denies Preparation for %s even with a Publication',
    (actorKind) => {
      const publication = source();
      publication.revision.type = Type.TEACHER_PREPARATION;
      expect(
        academicContentCurrentAccessAllows(
          { ...context, actorKind, guardianIds: [] },
          publication,
          now,
        ),
      ).toBe(false);
    },
  );
  it.each([Status.SCHEDULED, Status.EXPIRED, Status.CANCELLED])(
    'denies %s regardless of worker lag',
    (status) => {
      expect(
        academicContentCurrentAccessAllows(
          context,
          { ...source(), status },
          now,
        ),
      ).toBe(false);
    },
  );
  it.each([
    { publishedAt: null },
    { visibleFrom: new Date(now.getTime() + 1) },
    { visibleUntil: now },
    { visibleUntil: new Date(now.getTime() - 1) },
  ])('denies unavailable visibility %#', (patch) => {
    expect(
      academicContentCurrentAccessAllows(
        context,
        { ...source(), ...patch },
        now,
      ),
    ).toBe(false);
  });
  it('uses the inclusive start and exclusive end', () => {
    expect(
      academicContentCurrentAccessAllows(
        context,
        { ...source(), visibleUntil: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe(true);
    expect(
      academicContentCurrentAccessAllows(context, source(), new Date(NaN)),
    ).toBe(false);
  });
  it.each([
    { academicYearId: 'other' },
    { termId: 'other' },
    { schoolId: 'other' },
    { id: 'other' },
    { academicContentId: 'other' },
    { snapshotContractVersion: 1 },
  ])('denies incompatible exact Revision %#', (patch) => {
    const publication = source();
    publication.revision = { ...publication.revision, ...patch };
    expect(academicContentCurrentAccessAllows(context, publication, now)).toBe(
      false,
    );
  });
  it('denies a foreign Publication school', () => {
    expect(
      academicContentCurrentAccessAllows(
        context,
        { ...source(), schoolId: 'other' },
        now,
      ),
    ).toBe(false);
  });
});
