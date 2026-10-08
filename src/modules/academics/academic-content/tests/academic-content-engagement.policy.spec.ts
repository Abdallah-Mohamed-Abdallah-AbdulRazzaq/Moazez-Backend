import { AcademicContentEngagementEventType as EventType } from '@prisma/client';
import {
  academicContentAcknowledgementEligible,
  academicContentEngagementEligible,
  academicContentEngagementRequestFingerprint,
  academicContentEngagementRetryResult,
  academicContentEngagementShapeAllows,
  AcademicContentEngagementAttribution,
  AcademicContentEngagementCommand,
  AcademicContentEngagementFacts,
} from '../domain/academic-content-engagement.policy';

const id = (n: number) =>
  `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const command = (eventType: EventType): AcademicContentEngagementCommand => ({
  eventType,
  clientRequestId: id(10),
  ...(eventType === 'FILE_PREVIEWED' || eventType === 'FILE_DOWNLOADED'
    ? { fileId: id(11) }
    : eventType === 'LINK_CLICKED'
      ? { revisionLinkId: id(12) }
      : {}),
});
function facts(parent = false): AcademicContentEngagementFacts {
  return {
    context: {
      actorKind: parent ? 'PARENT' : 'STUDENT',
      schoolId: id(1),
      userId: id(2),
      studentId: id(3),
      enrollmentId: id(4),
      classroomId: id(5),
      academicYearId: id(6),
      termId: id(7),
      ...(parent ? { guardianIds: [id(8)] } : {}),
    } as AcademicContentEngagementFacts['context'],
    publication: {
      id: id(9),
      schoolId: id(1),
      academicContentId: id(13),
      revisionId: id(14),
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-01T10:00:00Z'),
      visibleFrom: new Date('2026-10-01T10:00:00Z'),
      visibleUntil: null,
      revision: {
        id: id(14),
        schoolId: id(1),
        academicContentId: id(13),
        snapshotContractVersion: 2,
        academicYearId: id(6),
        termId: id(7),
        type: 'GENERAL_RESOURCE',
        audience: 'STUDENTS_AND_GUARDIANS',
      },
    },
    canonicalPublicationId: id(9),
    currentRelationship: {
      schoolId: id(1),
      actorUserId: id(2),
      studentId: id(3),
      enrollmentId: id(4),
      guardianId: parent ? id(8) : null,
    },
    typeSpecificSnapshot: null,
    now: new Date('2026-10-08T10:00:00Z'),
  };
}
function attribution(): AcademicContentEngagementAttribution {
  return {
    schoolId: id(1),
    academicContentId: id(13),
    publicationId: id(9),
    revisionId: id(14),
    actorUserId: id(2),
    actorKind: 'STUDENT',
    studentId: id(3),
    enrollmentId: id(4),
    guardianId: null,
  };
}
function note(): AcademicContentEngagementFacts {
  const f = facts(true);
  f.publication.revision.type = 'GUARDIAN_WEEKLY_NOTE';
  f.publication.revision.audience = 'GUARDIANS';
  f.typeSpecificSnapshot = {
    type: 'GUARDIAN_WEEKLY_NOTE',
    state: {
      body: 'Published note',
      priority: 'NORMAL',
      requiresAcknowledgement: true,
    },
  };
  return f;
}

describe('ACC-11A engagement shape and immutable eligibility', () => {
  it.each(Object.values(EventType))(
    'accepts only the complete %s shape',
    (event) => {
      expect(academicContentEngagementShapeAllows(command(event))).toBe(true);
      expect(
        academicContentEngagementShapeAllows({
          ...command(event),
          clientRequestId: 'bad',
        }),
      ).toBe(false);
    },
  );
  it.each([
    { eventType: 'CONTENT_VIEWED', fileId: id(11) },
    { eventType: 'CONTENT_VIEWED', revisionLinkId: id(12) },
    { eventType: 'FILE_PREVIEWED' },
    { eventType: 'FILE_DOWNLOADED', fileId: id(11), revisionLinkId: id(12) },
    { eventType: 'LINK_CLICKED' },
    { eventType: 'LINK_CLICKED', revisionLinkId: id(12), fileId: id(11) },
    { eventType: 'JOIN_LINK_CLICKED', revisionLinkId: id(12) },
    { eventType: 'ACKNOWLEDGED' },
    { eventType: 'CONTENT_VIEWED', actorUserId: id(2) },
    { eventType: 'LINK_CLICKED', revisionLinkId: 'https://example.test/link' },
  ])('rejects incompatible or client authority fields: %j', (input) => {
    expect(
      academicContentEngagementShapeAllows({
        clientRequestId: id(10),
        ...input,
      } as AcademicContentEngagementCommand),
    ).toBe(false);
  });
  it.each([false, true])(
    'accepts current actor context (Parent=%s)',
    (parent) => {
      expect(
        academicContentEngagementEligible(
          facts(parent),
          command('CONTENT_VIEWED'),
        ),
      ).toBe(true);
    },
  );
  it.each(['schoolId', 'actorUserId', 'studentId', 'enrollmentId'] as const)(
    'rejects mismatched current relationship %s',
    (key) => {
      const f = facts();
      f.currentRelationship[key] = id(99);
      expect(
        academicContentEngagementEligible(f, command('CONTENT_VIEWED')),
      ).toBe(false);
    },
  );
  it('rejects missing Parent ownership, Student Guardian context and Guardian Notes for Students', () => {
    const f = facts(true);
    f.currentRelationship.guardianId = id(99);
    expect(
      academicContentEngagementEligible(f, command('CONTENT_VIEWED')),
    ).toBe(false);
    const student = facts();
    student.currentRelationship.guardianId = id(8);
    expect(
      academicContentEngagementEligible(student, command('CONTENT_VIEWED')),
    ).toBe(false);
    student.currentRelationship.guardianId = null;
    student.publication.revision.type = 'GUARDIAN_WEEKLY_NOTE';
    expect(
      academicContentEngagementEligible(student, command('CONTENT_VIEWED')),
    ).toBe(false);
  });
  it.each([
    'canonical',
    'school',
    'content',
    'revision',
    'expired',
    'cancelled',
    'snapshot',
  ])('fails closed on %s publication facts', (change) => {
    const f = facts();
    if (change === 'canonical') f.canonicalPublicationId = id(99);
    if (change === 'school') f.publication.schoolId = id(99);
    if (change === 'content') f.publication.revision.academicContentId = id(99);
    if (change === 'revision') f.publication.revision.id = id(99);
    if (change === 'expired') f.publication.visibleUntil = f.now;
    if (change === 'cancelled') f.publication.status = 'CANCELLED';
    if (change === 'snapshot')
      f.publication.revision.snapshotContractVersion = 1;
    expect(
      academicContentEngagementEligible(f, command('CONTENT_VIEWED')),
    ).toBe(false);
  });
  it.each(['FILE_PREVIEWED', 'FILE_DOWNLOADED'] as const)(
    'requires the exact RevisionAsset for %s',
    (event) => {
      const c = command(event),
        asset = { schoolId: id(1), revisionId: id(14), fileId: id(11) };
      expect(
        academicContentEngagementEligible(facts(), c, { revisionAsset: asset }),
      ).toBe(true);
      expect(academicContentEngagementEligible(facts(), c)).toBe(false);
      for (const key of ['schoolId', 'revisionId', 'fileId'] as const)
        expect(
          academicContentEngagementEligible(facts(), c, {
            revisionAsset: { ...asset, [key]: id(99) },
          }),
        ).toBe(false);
    },
  );
  it('requires the exact immutable RevisionLink, independently of URL/authoring identity', () => {
    const link = { schoolId: id(1), revisionId: id(14), id: id(12) };
    expect(
      academicContentEngagementEligible(facts(), command('LINK_CLICKED'), {
        revisionLink: link,
      }),
    ).toBe(true);
    expect(
      academicContentEngagementEligible(facts(), command('LINK_CLICKED')),
    ).toBe(false);
    for (const key of ['schoolId', 'revisionId', 'id'] as const)
      expect(
        academicContentEngagementEligible(facts(), command('LINK_CLICKED'), {
          revisionLink: { ...link, [key]: id(99) },
        }),
      ).toBe(false);
  });
  it('allows join clicks only for a valid still eligible immutable Online Session', () => {
    const f = facts(),
      c = command('JOIN_LINK_CLICKED');
    expect(academicContentEngagementEligible(f, c)).toBe(false);
    f.publication.revision.type = 'ONLINE_SESSION';
    expect(academicContentEngagementEligible(f, c)).toBe(false);
    f.typeSpecificSnapshot = {
      type: 'ONLINE_SESSION',
      state: {
        platform: 'ZOOM',
        providerName: null,
        joinUrl: 'https://session.example.test/join',
        accessCode: null,
        instructions: null,
        startAt: '2026-10-08T09:00:00.000Z',
        endAt: '2026-10-08T11:00:00.000Z',
        timezone: 'Africa/Cairo',
        timetableEntryId: null,
      },
    };
    expect(academicContentEngagementEligible(f, c)).toBe(true);
    f.now = new Date('2026-10-08T11:00:00Z');
    expect(academicContentEngagementEligible(f, c)).toBe(false);
  });
});

describe('ACC-11A acknowledgement is Parent business truth', () => {
  it('accepts the immutable opted-in Guardian Note for an owned child', () => {
    expect(academicContentAcknowledgementEligible(note())).toBe(true);
  });
  it.each([
    'student',
    'unowned',
    'otherChild',
    'superseded',
    'cancelled',
    'ended',
    'wrongType',
    'notRequired',
    'malformed',
  ])('rejects %s acknowledgement facts', (change) => {
    const f = note();
    if (change === 'student') f.context = { ...facts().context };
    if (change === 'unowned') f.currentRelationship.guardianId = id(99);
    if (change === 'otherChild') f.currentRelationship.studentId = id(99);
    if (change === 'superseded') f.canonicalPublicationId = id(99);
    if (change === 'cancelled') f.publication.status = 'CANCELLED';
    if (change === 'ended') f.publication.visibleUntil = f.now;
    if (change === 'wrongType')
      f.publication.revision.type = 'GENERAL_RESOURCE';
    if (change === 'notRequired')
      f.typeSpecificSnapshot = {
        type: 'GUARDIAN_WEEKLY_NOTE',
        state: {
          body: 'Note',
          priority: 'NORMAL',
          requiresAcknowledgement: false,
        },
      };
    if (change === 'malformed')
      f.typeSpecificSnapshot = {
        type: 'GUARDIAN_WEEKLY_NOTE',
        state: { requiresAcknowledgement: 'true' },
      };
    expect(academicContentAcknowledgementEligible(f)).toBe(false);
  });
});

describe('ACC-11A actor-scoped logical retry identity', () => {
  it('normalizes IDs and optional null refs, excluding request ID and execution time', () => {
    const a = attribution(),
      c = command('CONTENT_VIEWED');
    const first = academicContentEngagementRequestFingerprint(a, c);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(
      academicContentEngagementRequestFingerprint(a, {
        ...c,
        clientRequestId: id(99),
        fileId: null,
        revisionLinkId: null,
      }),
    ).toBe(first);
    const hexadecimal = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
    expect(
      academicContentEngagementRequestFingerprint(
        { ...a, academicContentId: hexadecimal },
        c,
      ),
    ).toBe(
      academicContentEngagementRequestFingerprint(
        { ...a, academicContentId: hexadecimal.toUpperCase() },
        c,
      ),
    );
  });
  it.each([
    'schoolId',
    'academicContentId',
    'publicationId',
    'revisionId',
    'actorUserId',
    'studentId',
    'enrollmentId',
  ] as const)('detects changed authoritative %s in a reused request', (key) => {
    const a = attribution(),
      c = command('CONTENT_VIEWED');
    expect(
      academicContentEngagementRequestFingerprint({ ...a, [key]: id(99) }, c),
    ).not.toBe(academicContentEngagementRequestFingerprint(a, c));
  });
  it('distinguishes event, exact refs and Parent context, rejecting invalid attribution', () => {
    const a = attribution();
    const fingerprint = academicContentEngagementRequestFingerprint(
      a,
      command('FILE_PREVIEWED'),
    );
    expect(
      academicContentEngagementRequestFingerprint(
        a,
        command('FILE_DOWNLOADED'),
      ),
    ).not.toBe(fingerprint);
    expect(
      academicContentEngagementRequestFingerprint(a, {
        ...command('FILE_PREVIEWED'),
        fileId: id(99),
      }),
    ).not.toBe(fingerprint);
    const parent = { ...a, actorKind: 'PARENT' as const, guardianId: id(8) };
    expect(
      academicContentEngagementRequestFingerprint(
        parent,
        command('FILE_PREVIEWED'),
      ),
    ).not.toBe(fingerprint);
    expect(
      academicContentEngagementRequestFingerprint(
        { ...parent, guardianId: id(99) },
        command('FILE_PREVIEWED'),
      ),
    ).not.toBe(
      academicContentEngagementRequestFingerprint(
        parent,
        command('FILE_PREVIEWED'),
      ),
    );
    expect(() =>
      academicContentEngagementRequestFingerprint(
        { ...a, guardianId: id(8) },
        command('CONTENT_VIEWED'),
      ),
    ).toThrow();
  });
  it('only accepts equivalent scoped identity and well formed fingerprints', () => {
    const identity = {
      schoolId: id(1),
      actorUserId: id(2),
      clientRequestId: id(10),
      requestFingerprint: academicContentEngagementRequestFingerprint(
        attribution(),
        command('CONTENT_VIEWED'),
      ),
    };
    expect(
      academicContentEngagementRetryResult(identity, { ...identity }),
    ).toBe('IDENTICAL');
    for (const key of ['schoolId', 'actorUserId', 'clientRequestId'] as const)
      expect(
        academicContentEngagementRetryResult(identity, {
          ...identity,
          [key]: id(99),
        }),
      ).toBe('CONFLICT');
    expect(
      academicContentEngagementRetryResult(identity, {
        ...identity,
        requestFingerprint: 'b'.repeat(64),
      }),
    ).toBe('CONFLICT');
    expect(
      academicContentEngagementRetryResult(
        { ...identity, requestFingerprint: 'bad' },
        { ...identity, requestFingerprint: 'bad' },
      ),
    ).toBe('CONFLICT');
    expect(
      academicContentEngagementRetryResult(identity, {
        ...identity,
        schoolId: 'bad',
      }),
    ).toBe('CONFLICT');
  });
});
