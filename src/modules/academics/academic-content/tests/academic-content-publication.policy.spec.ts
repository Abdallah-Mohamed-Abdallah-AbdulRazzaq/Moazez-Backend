import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as Status,
  AcademicContentType as Type,
} from '@prisma/client';
import {
  academicContentPublicationRequestFingerprint,
  academicContentPublicationRevisionStrategy,
  academicContentRecipientIdentity,
  AcademicContentPublicationReadinessInput,
  AcademicContentPublicationTimingInput,
  evaluateAcademicContentPublicationReadiness,
  isAcademicContentExternallyPublishable,
  isAcademicContentPublicationVisible,
  normalizeAcademicContentPublicationTiming,
} from '../domain/academic-content-publication.policy';

const now = new Date('2026-10-02T12:00:00.000Z');
const date = (value: string) => new Date(value);

describe('ACC-7B logical publication request fingerprint', () => {
  const contentId = '12345678-1234-4234-8234-123456789abc';
  const fingerprint = (input = {}) =>
    academicContentPublicationRequestFingerprint(contentId, input);
  it('has no execution clock or effective timing dependency', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-02T12:00:00Z'));
      const first = fingerprint();
      jest.setSystemTime(new Date('2026-10-03T18:00:00Z'));
      expect(fingerprint()).toBe(first);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      jest.useRealTimers();
    }
  });
  it('canonicalizes UUID case and equivalent explicit timezone instants', () => {
    expect(fingerprint({ publishAt: date('2026-10-02T15:00:00+03:00') })).toBe(
      academicContentPublicationRequestFingerprint(contentId.toUpperCase(), {
        publishAt: date('2026-10-02T12:00:00Z'),
      }),
    );
  });
  it.each([
    { publishAt: now },
    { visibleFrom: now },
    { visibleUntil: now },
    { visibleUntil: null },
  ])('distinguishes explicit timing/presence from omitted: %j', (input) => {
    expect(fingerprint(input)).not.toBe(fingerprint());
  });
  it.each(['publishAt', 'visibleFrom', 'visibleUntil'])(
    'distinguishes changed %s values',
    (key) => {
      expect(fingerprint({ [key]: now })).not.toBe(
        fingerprint({ [key]: new Date(now.getTime() + 1) }),
      );
    },
  );
  it('includes content identity', () => {
    expect(fingerprint()).not.toBe(
      academicContentPublicationRequestFingerprint(
        '12345678-1234-4234-8234-123456789abd',
        {},
      ),
    );
  });
  it.each(['publishAt', 'visibleFrom', 'visibleUntil'])(
    'rejects invalid %s before hashing',
    (key) => {
      expect(() => fingerprint({ [key]: new Date(NaN) })).toThrow();
    },
  );
});
const term = {
  startDate: date('2026-10-01'),
  endDate: date('2026-10-31'),
  isActive: true,
};
const timing = (patch: Partial<AcademicContentPublicationTimingInput> = {}) =>
  normalizeAcademicContentPublicationTiming({
    now,
    type: Type.GENERAL_RESOURCE,
    term,
    ...patch,
  });
const readiness = (
  patch: Partial<AcademicContentPublicationReadinessInput> = {},
) =>
  evaluateAcademicContentPublicationReadiness({
    type: Type.SUBJECT_RESOURCE,
    audience: Audience.STUDENTS,
    sourceStatus: Status.DRAFT,
    revisionStrategyAvailable: true,
    authoringComplete: true,
    term,
    termValid: true,
    targetCount: 1,
    typeDetailComplete: true,
    activeAssetsValid: true,
    hasActivePublication: false,
    now,
    ...patch,
  });

describe('ACC-7A pure publication domain contract', () => {
  it.each([
    [Type.WEEKLY_PLAN, Audience.STUDENTS],
    [Type.GUARDIAN_WEEKLY_NOTE, Audience.GUARDIANS],
    [Type.SUBJECT_RESOURCE, Audience.STUDENTS_AND_GUARDIANS],
    [Type.ONLINE_SESSION, Audience.STUDENTS],
    [Type.GENERAL_RESOURCE, Audience.GUARDIANS],
  ])('permits external publication of %s to %s', (type, audience) => {
    expect(isAcademicContentExternallyPublishable(type, audience)).toBe(true);
  });

  it.each([
    [Type.TEACHER_PREPARATION, Audience.INTERNAL_STAFF],
    [Type.TEACHER_PREPARATION, Audience.STUDENTS],
    [Type.GENERAL_RESOURCE, Audience.INTERNAL_STAFF],
    [Type.GUARDIAN_WEEKLY_NOTE, Audience.STUDENTS],
    [Type.ONLINE_SESSION, Audience.GUARDIANS],
  ])('denies unavailable external audience %s/%s', (type, audience) => {
    expect(isAcademicContentExternallyPublishable(type, audience)).toBe(false);
    expect(readiness({ type, audience })).toMatchObject({
      canPublish: false,
      canSchedule: false,
    });
  });

  it.each(Object.values(Status))(
    'selects only the DRAFT or APPROVED strategy for %s',
    (status) => {
      expect(academicContentPublicationRevisionStrategy(status)).toBe(
        status === Status.DRAFT
          ? 'CAPTURE_CURRENT_REVISION_V2'
          : status === Status.APPROVED
            ? 'USE_EXACT_APPROVED_REVISION'
            : null,
      );
    },
  );

  const enrollmentId = '11111111-1111-4111-8111-111111111111';
  const guardianId = '22222222-2222-4222-8222-222222222222';
  const studentId = '33333333-3333-4333-8333-333333333333';
  it('uses canonical business identities and known deterministic SHA-256 fingerprints', () => {
    expect(
      academicContentRecipientIdentity({
        recipientKind: Kind.STUDENT,
        enrollmentId,
      }),
    ).toEqual({
      identity: `student:${enrollmentId}`,
      identityFingerprint:
        'd143b5caae4c84fbe533e80c42c64cd6198ce279b2f0e5abbe2507d401235b8a',
    });
    expect(
      academicContentRecipientIdentity({
        recipientKind: Kind.GUARDIAN,
        enrollmentId,
        guardianId,
        studentId,
      }),
    ).toEqual({
      identity: `guardian:${guardianId}:${studentId}:${enrollmentId}`,
      identityFingerprint:
        '0a41bad1d29e8e9848f322dcf3067844415d179de7e3e04049b6accc9474ca3a',
    });
  });
  it('distinguishes every business context and normalizes UUID case', () => {
    const context = {
      recipientKind: Kind.GUARDIAN,
      enrollmentId,
      guardianId,
      studentId,
    } as const;
    const original =
      academicContentRecipientIdentity(context).identityFingerprint;
    for (const field of ['enrollmentId', 'guardianId', 'studentId'] as const) {
      expect(
        academicContentRecipientIdentity({
          ...context,
          [field]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }).identityFingerprint,
      ).not.toBe(original);
    }
    expect(
      academicContentRecipientIdentity({
        recipientKind: Kind.STUDENT,
        enrollmentId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      }),
    ).toEqual(
      academicContentRecipientIdentity({
        recipientKind: Kind.STUDENT,
        enrollmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    );
    expect(() =>
      academicContentRecipientIdentity({
        recipientKind: Kind.STUDENT,
        enrollmentId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('defaults to immediate visibility with no expiry and returns independent dates', () => {
    const result = timing();
    expect(result).toEqual({
      publishAt: now,
      visibleFrom: now,
      visibleUntil: null,
    });
    expect(result.publishAt).not.toBe(now);
  });
  it('allows future publication, equal/later visibility, and a nonexpired past publishAt', () => {
    expect(
      timing({
        publishAt: date('2026-10-05'),
        visibleFrom: date('2026-10-06'),
        visibleUntil: date('2026-10-07'),
      }).visibleFrom,
    ).toEqual(date('2026-10-06'));
    expect(
      timing({
        publishAt: date('2026-10-01'),
        visibleUntil: date('2026-10-03'),
      }).publishAt,
    ).toEqual(date('2026-10-01'));
    expect(timing({ publishAt: date('2026-10-01') }).visibleUntil).toBeNull();
  });
  it.each([
    { visibleFrom: date('2026-10-02T11:59:59Z') },
    { visibleUntil: now },
    { visibleUntil: date('2026-10-02T11:59:59Z') },
    {
      publishAt: date('2026-10-01'),
      visibleUntil: date('2026-10-02T11:00:00Z'),
    },
    { publishAt: date('2026-10-03'), visibleUntil: date('2026-10-03') },
    { now: new Date(NaN) },
    { visibleUntil: new Date(NaN) },
    { term: { ...term, startDate: new Date(NaN) } },
    { term: { ...term, startDate: date('2026-11-01') } },
  ])('rejects invalid timing/window %j', (patch) =>
    expect(() => timing(patch)).toThrow(),
  );

  it.each(['2026-10-01T00:00:00Z', '2026-10-31T23:59:59.999Z'])(
    'includes term boundary UTC date %s',
    (publishAt) => {
      expect(
        timing({ now: date('2026-10-01'), publishAt: date(publishAt) })
          .publishAt,
      ).toEqual(date(publishAt));
    },
  );
  it.each(['2026-09-30T23:59:59.999Z', '2026-11-01T00:00:00Z'])(
    'rejects outside term date %s',
    (publishAt) => {
      expect(() => timing({ publishAt: date(publishAt) })).toThrow();
    },
  );
  it('rejects a historically ended term even with a past in-term publishAt', () => {
    expect(() => timing({ now: date('2026-11-01'), publishAt: now })).toThrow();
  });
  it('permits an inactive future term and applies UTC calendar dates', () => {
    const future = {
      startDate: date('2026-11-01'),
      endDate: date('2026-11-30'),
      isActive: false,
    };
    expect(
      timing({ term: future, publishAt: date('2026-11-01T00:00:00Z') })
        .publishAt,
    ).toEqual(future.startDate);
    expect(
      timing({ publishAt: date('2026-09-30T23:30:00-02:00') }).publishAt,
    ).toEqual(date('2026-10-01T01:30:00Z'));
  });

  const onlineSessionEndAt = date('2026-10-02T14:00:00Z');
  it('bounds Online Session visibility and allows an explicit earlier end', () => {
    expect(
      timing({ type: Type.ONLINE_SESSION, onlineSessionEndAt }).visibleUntil,
    ).toEqual(onlineSessionEndAt);
    expect(
      timing({
        type: Type.ONLINE_SESSION,
        onlineSessionEndAt,
        visibleUntil: date('2026-10-02T13:00:00Z'),
      }).visibleUntil,
    ).toEqual(date('2026-10-02T13:00:00Z'));
    expect(
      timing({
        type: Type.ONLINE_SESSION,
        onlineSessionEndAt,
        visibleUntil: onlineSessionEndAt,
      }).visibleUntil,
    ).toEqual(onlineSessionEndAt);
  });
  it.each([
    { publishAt: onlineSessionEndAt },
    { publishAt: date('2026-10-02T15:00:00Z') },
    { visibleUntil: date('2026-10-02T14:00:00.001Z') },
    { visibleUntil: null },
    { now: onlineSessionEndAt },
    { onlineSessionEndAt: now },
    { onlineSessionEndAt: undefined },
    { onlineSessionEndAt: new Date(NaN) },
  ])('rejects invalid/finished Online Session timing %j', (patch) => {
    expect(() =>
      timing({ type: Type.ONLINE_SESSION, onlineSessionEndAt, ...patch }),
    ).toThrow();
  });

  const publication = {
    status: PublicationStatus.PUBLISHED,
    publishedAt: now,
    visibleFrom: now,
    visibleUntil: onlineSessionEndAt,
  };
  it('uses inclusive visibility start and exclusive end', () => {
    expect(isAcademicContentPublicationVisible(publication, now)).toBe(true);
    expect(
      isAcademicContentPublicationVisible(
        publication,
        date('2026-10-02T11:59:59.999Z'),
      ),
    ).toBe(false);
    expect(
      isAcademicContentPublicationVisible(
        publication,
        date('2026-10-02T13:59:59.999Z'),
      ),
    ).toBe(true);
    expect(
      isAcademicContentPublicationVisible(publication, onlineSessionEndAt),
    ).toBe(false);
    expect(
      isAcademicContentPublicationVisible(
        { ...publication, visibleUntil: null },
        date('2030-01-01'),
      ),
    ).toBe(true);
    expect(
      isAcademicContentPublicationVisible(
        { ...publication, publishedAt: null },
        now,
      ),
    ).toBe(false);
  });
  it.each([
    PublicationStatus.SCHEDULED,
    PublicationStatus.EXPIRED,
    PublicationStatus.CANCELLED,
  ])('never exposes status %s', (status) => {
    expect(
      isAcademicContentPublicationVisible({ ...publication, status }, now),
    ).toBe(false);
  });

  it('accepts complete DRAFT/APPROVED link-only Subject Resources without an attachment count', () => {
    for (const sourceStatus of [Status.DRAFT, Status.APPROVED]) {
      expect(readiness({ sourceStatus })).toEqual({
        canPublish: true,
        canSchedule: true,
        blockingReasons: [],
      });
    }
  });
  it.each([
    [
      { type: Type.TEACHER_PREPARATION },
      'publication.type_or_audience_unavailable',
    ],
    [
      { audience: Audience.INTERNAL_STAFF },
      'publication.type_or_audience_unavailable',
    ],
    [
      { sourceStatus: Status.SUBMITTED },
      'publication.source_status_unavailable',
    ],
    [
      { revisionStrategyAvailable: false },
      'publication.revision_strategy_unavailable',
    ],
    [{ authoringComplete: false }, 'publication.authoring_incomplete'],
    [{ termValid: false }, 'publication.term_invalid'],
    [{ term: null }, 'publication.term_invalid'],
    [{ targetCount: 0 }, 'publication.targets_missing'],
    [{ typeDetailComplete: false }, 'publication.type_detail_incomplete'],
    [{ activeAssetsValid: false }, 'publication.assets_invalid'],
    [{ hasActivePublication: true }, 'publication.active_publication_exists'],
  ] as const)(
    'blocks each readiness dimension independently %j',
    (patch, code) => {
      expect(readiness(patch)).toEqual({
        canPublish: false,
        canSchedule: false,
        blockingReasons: [code],
      });
    },
  );
  it('distinguishes a future term from an ended term without requiring active state', () => {
    expect(
      readiness({
        term: { ...term, startDate: date('2026-10-03'), isActive: false },
      }),
    ).toEqual({ canPublish: false, canSchedule: true, blockingReasons: [] });
    expect(readiness({ now: date('2026-11-01') })).toEqual({
      canPublish: false,
      canSchedule: false,
      blockingReasons: ['publication.term_ended'],
    });
  });
  it('requires a possible future instant within both term and session for scheduling', () => {
    expect(
      readiness({ type: Type.ONLINE_SESSION, onlineSessionEndAt: now }),
    ).toMatchObject({ canPublish: false, canSchedule: false });
    expect(readiness({ type: Type.ONLINE_SESSION })).toMatchObject({
      canPublish: false,
      canSchedule: false,
    });
    expect(
      readiness({
        type: Type.ONLINE_SESSION,
        onlineSessionEndAt,
        term: { ...term, startDate: date('2026-10-03') },
      }),
    ).toMatchObject({ canPublish: false, canSchedule: false });
    expect(readiness({ now: date('2026-10-31T23:59:59.999Z') })).toMatchObject({
      canPublish: true,
      canSchedule: false,
    });
  });
});
