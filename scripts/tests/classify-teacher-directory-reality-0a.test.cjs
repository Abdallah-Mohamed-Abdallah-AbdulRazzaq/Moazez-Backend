'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const {
  buildClassification,
  classifyAllocationTermState,
  classifyCredentialReadiness,
  classifyMemberships,
  classifyProfileSnapshot,
  classifyRoleAndUserTypeMismatch,
  formatSafeReport,
  isExactOperationalTeacherMembership,
  iterateCursorPages,
  strictModeExitCode,
} = require('../classify-teacher-directory-reality-0a.cjs');

const AS_OF = new Date('2026-07-17T12:00:00.000Z');

test('classifies operational Teacher membership states', () => {
  const teacherUsers = [teacherUser('user-1'), teacherUser('user-2')];
  const memberships = [
    membership('membership-1', 'user-1'),
    membership('membership-2', 'user-1', { schoolId: 'school-2' }),
    membership('membership-3', 'non-teacher', {
      user: { userType: 'SCHOOL_USER', deletedAt: null },
    }),
    membership('membership-4', 'user-2', { status: 'SUSPENDED' }),
  ];

  const result = classifyMemberships(teacherUsers, memberships);

  assert.deepEqual(result.withActiveTeacherMembership, ['user-1']);
  assert.deepEqual(result.withoutActiveTeacherMembership, ['user-2']);
  assert.deepEqual(result.withMultipleActiveTeacherMemberships, ['user-1']);
  assert.deepEqual(result.nonTeacherUserMembershipIds, ['membership-3']);
});

test('classifies role-key and userType mismatches without reading PII', () => {
  const teacherUsers = [teacherUser('user-1')];
  const memberships = [
    membership('membership-1', 'user-1', { roleKey: 'school_admin' }),
    membership('membership-2', 'user-2', {
      userType: 'SCHOOL_USER',
      roleKey: 'teacher',
      user: { userType: 'SCHOOL_USER', deletedAt: null },
    }),
  ];

  const result = classifyRoleAndUserTypeMismatch(teacherUsers, memberships);

  assert.deepEqual(result.mismatchUserIds, ['user-1']);
  assert.deepEqual(result.mismatchedTeacherFootprintMembershipIds, [
    'membership-1',
    'membership-2',
  ]);
  assert.deepEqual(result.mismatchedRoleKeyCounts, {
    school_admin: 1,
    teacher: 1,
  });
});

test('requires an exact live and school-compatible Teacher role', () => {
  assert.equal(
    isExactOperationalTeacherMembership(membership('global', 'user-1')),
    true,
  );
  assert.equal(
    isExactOperationalTeacherMembership(
      membership('same-school', 'user-1', { roleSchoolId: 'school-1' }),
    ),
    true,
  );
  assert.equal(
    isExactOperationalTeacherMembership(
      membership('deleted-role', 'user-1', { roleDeletedAt: AS_OF }),
    ),
    false,
  );
  assert.equal(
    isExactOperationalTeacherMembership(
      membership('cross-school-role', 'user-1', {
        roleSchoolId: 'school-2',
      }),
    ),
    false,
  );
  assert.equal(
    isExactOperationalTeacherMembership(
      membership('missing-role', 'user-1', { roleKey: null }),
    ),
    false,
  );
});

test('classifies credential readiness from booleans only', () => {
  assert.deepEqual(
    classifyCredentialReadiness({
      hasUsername: false,
      hasContactEmail: true,
      hasPasswordHash: false,
      mustChangePassword: true,
    }),
    {
      missingUsername: true,
      missingContactEmail: false,
      missingPasswordHash: true,
      mustChangePassword: true,
    },
  );
});

test('classifies allocation terms date-first across every locked state', () => {
  assert.equal(
    classifyAllocationTermState(term({ isActive: true }), AS_OF),
    'current_active',
  );
  assert.equal(
    classifyAllocationTermState(
      term({
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
      AS_OF,
    ),
    'future',
  );
  assert.equal(
    classifyAllocationTermState(
      term({
        startDate: new Date('2025-09-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
      }),
      AS_OF,
    ),
    'historical',
  );
  assert.equal(
    classifyAllocationTermState(term({ isActive: false }), AS_OF),
    'current_inactive',
  );
  assert.equal(
    classifyAllocationTermState(
      term({
        isActive: true,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
      AS_OF,
    ),
    'inconsistent',
  );
  assert.equal(
    classifyAllocationTermState(
      term({
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-07-01T00:00:00.000Z'),
      }),
      AS_OF,
    ),
    'inconsistent',
  );
  assert.equal(
    classifyAllocationTermState(
      term({
        isActive: true,
        academicYear: {
          schoolId: 'school-1',
          isActive: false,
          deletedAt: AS_OF,
        },
      }),
      AS_OF,
    ),
    'inconsistent',
  );
  assert.equal(
    classifyAllocationTermState(term({ startDate: 'not-a-date' }), AS_OF),
    'invalid',
  );
  assert.equal(classifyAllocationTermState(null, AS_OF), 'invalid');
});

test('treats allocation window boundary equality as current', () => {
  assert.equal(
    classifyAllocationTermState(
      term({
        isActive: true,
        startDate: AS_OF,
        endDate: new Date('2026-08-01T00:00:00.000Z'),
      }),
      AS_OF,
    ),
    'current_active',
  );
  assert.equal(
    classifyAllocationTermState(
      term({
        isActive: true,
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: AS_OF,
      }),
      AS_OF,
    ),
    'current_active',
  );
});

test('builds aggregate counts for allocations and future profile backfill', () => {
  const snapshot = {
    teacherUsers: [teacherUser('user-1'), teacherUser('user-2')],
    memberships: [membership('membership-1', 'user-1')],
    allocations: [allocation('allocation-1', 'user-1')],
  };

  const report = buildClassification(snapshot, {
    asOf: AS_OF,
    sampleLimit: 10,
  });

  assert.equal(report.counts.totalTeacherUsers, 2);
  assert.equal(report.counts.teacherUsersWithAllocations, 1);
  assert.equal(report.counts.teacherUsersWithoutAllocations, 1);
  assert.equal(
    report.counts.teacherUsersRequiringFutureTeacherProfileBackfill,
    2,
  );
  assert.equal(report.allocationsByTermState.current_active, 1);
});

test('classifies post-schema profile integrity and separates remediation', () => {
  const teacherUsers = [
    teacherUser('user-1'),
    teacherUser('user-2'),
    teacherUser('user-3'),
    teacherUser('user-4'),
  ];
  const memberships = [
    membership('membership-1', 'user-1', { schoolId: 'school-1' }),
    membership('membership-2', 'user-2', { schoolId: 'school-2' }),
    membership('membership-3', 'user-3', { schoolId: 'school-3' }),
    membership('membership-4', 'user-4', { schoolId: 'school-5' }),
    membership('membership-5', 'user-5', {
      schoolId: 'school-7',
      status: 'TRANSFERRED',
      endedAt: AS_OF,
    }),
  ];
  const profiles = [
    teacherProfile('profile-1', 'user-1', 'school-1'),
    teacherProfile('profile-2', 'user-3', 'school-3'),
    teacherProfile('profile-3', 'user-3', 'school-4'),
    teacherProfile('profile-4', 'user-4', 'school-6', {
      firstNameAr: null,
      user: { userType: 'SCHOOL_USER', deletedAt: null },
    }),
    teacherProfile('profile-5', 'user-5', 'school-7'),
    teacherProfile('profile-6', 'user-5', 'school-7', { deletedAt: AS_OF }),
  ];

  const profileState = classifyProfileSnapshot(
    teacherUsers,
    memberships,
    profiles,
  );
  assert.equal(profileState.totalTeacherProfiles, 6);
  assert.equal(profileState.liveTeacherProfiles, 5);
  assert.equal(profileState.archivedTeacherProfiles, 1);
  assert.deepEqual(profileState.teacherUsersMissingLiveMatchingProfile, [
    'user-2',
    'user-4',
  ]);
  assert.deepEqual(profileState.usersWithMoreThanOneLiveProfile, ['user-3']);
  assert.deepEqual(profileState.duplicateSchoolIdUserIdProfileFootprints, [
    'profile-5',
  ]);
  assert.deepEqual(profileState.liveProfileLinkedToNonTeacherOrDeletedUser, [
    'profile-4',
  ]);
  assert.equal(
    profileState.liveProfileWithoutMatchingOperationalTeacherMembership.length,
    3,
  );
  assert.equal(
    profileState.liveProfileSchoolDifferentFromActiveTeacherMembershipSchool
      .length,
    2,
  );
  assert.deepEqual(
    profileState.transferredMembershipWhoseSourceProfileRemainsLive,
    ['membership-5'],
  );
  assert.deepEqual(
    profileState.activeTeacherMembershipWithoutMatchingLiveDestinationProfile,
    ['membership-2', 'membership-4'],
  );
  assert.deepEqual(profileState.incompleteLiveProfile, ['profile-4']);
  assert.deepEqual(profileState.backfillEligible, ['user-2']);
  assert.deepEqual(profileState.backfillAmbiguous, ['user-4']);

  const report = buildClassification(
    { teacherUsers, memberships, allocations: [], teacherProfiles: profiles },
    { asOf: AS_OF, sampleLimit: 1 },
  );
  assert.equal(report.counts.totalTeacherProfiles, 6);
  assert.equal(report.counts.backfillEligible, 1);
  assert.equal(report.counts.backfillAmbiguous, 1);
  assert.equal(report.anomalies.incompleteLiveProfile.sampleIds.length, 1);
});

test('joins allocation membership by both Teacher User and school', () => {
  const wrongSchoolMembershipReport = buildClassification(
    {
      teacherUsers: [teacherUser('user-1')],
      memberships: [
        membership('membership-1', 'user-1', { schoolId: 'school-2' }),
      ],
      allocations: [allocation('allocation-1', 'user-1')],
    },
    { asOf: AS_OF, sampleLimit: 10 },
  );

  assert.equal(
    wrongSchoolMembershipReport.counts
      .teacherAllocationsWithInvalidTeacherMembershipState,
    1,
  );
  assert.equal(
    wrongSchoolMembershipReport.counts
      .teacherAllocationsWithInvalidSchoolRelationships,
    0,
  );

  const invalidAcademicSchoolReport = buildClassification(
    {
      teacherUsers: [teacherUser('user-1')],
      memberships: [membership('membership-1', 'user-1')],
      allocations: [
        allocation('allocation-1', 'user-1', {
          term: term({
            isActive: true,
            academicYear: {
              schoolId: 'school-2',
              isActive: true,
              deletedAt: null,
            },
          }),
        }),
      ],
    },
    { asOf: AS_OF, sampleLimit: 10 },
  );

  assert.equal(
    invalidAcademicSchoolReport.counts
      .teacherAllocationsWithInvalidTeacherMembershipState,
    0,
  );
  assert.equal(
    invalidAcademicSchoolReport.counts
      .teacherAllocationsWithInvalidSchoolRelationships,
    1,
  );
});

test('uses exact Role validity for profiles, allocations, mismatches, and backfill', () => {
  const teacherUsers = [
    teacherUser('user-deleted-profile'),
    teacherUser('user-cross-profile'),
    teacherUser('user-deleted-backfill'),
    teacherUser('user-cross-backfill'),
  ];
  const memberships = [
    membership('membership-deleted-profile', 'user-deleted-profile', {
      roleDeletedAt: AS_OF,
    }),
    membership('membership-cross-profile', 'user-cross-profile', {
      roleSchoolId: 'school-2',
    }),
    membership('membership-deleted-backfill', 'user-deleted-backfill', {
      roleDeletedAt: AS_OF,
    }),
    membership('membership-cross-backfill', 'user-cross-backfill', {
      roleSchoolId: 'school-2',
    }),
  ];
  const report = buildClassification(
    {
      teacherUsers,
      memberships,
      teacherProfiles: [
        teacherProfile(
          'profile-deleted-role',
          'user-deleted-profile',
          'school-1',
        ),
        teacherProfile('profile-cross-role', 'user-cross-profile', 'school-1'),
      ],
      allocations: [
        allocation('allocation-deleted-role', 'user-deleted-profile'),
        allocation('allocation-cross-role', 'user-cross-profile'),
      ],
    },
    { asOf: AS_OF, sampleLimit: 10 },
  );

  assert.equal(
    report.counts.liveProfileWithoutMatchingOperationalTeacherMembership,
    2,
  );
  assert.equal(
    report.counts.teacherAllocationsWithInvalidTeacherMembershipState,
    2,
  );
  assert.equal(report.counts.backfillEligible, 0);
  assert.equal(report.counts.backfillAmbiguous, 4);
  assert.equal(report.counts.teacherUsersWithRoleKeyOrUserTypeMismatch, 4);
  assert.equal(
    report.anomalies.activeTeacherFootprintsWithRoleOrUserTypeMismatch.count,
    4,
  );
  assert.deepEqual(report.mismatchedRoleKeyCounts, { teacher: 4 });
});

test('paginates deterministically through multiple pages and an empty final page', async () => {
  const rows = [{ id: 'id-001' }, { id: 'id-002' }, { id: 'id-003' }];
  const calls = [];
  const countedIds = [];
  const delegate = {
    async findMany(query) {
      calls.push(query);
      const cursorIndex = query.cursor
        ? rows.findIndex((row) => row.id === query.cursor.id)
        : -1;
      const start = cursorIndex < 0 ? 0 : cursorIndex + query.skip;
      return rows.slice(start, start + query.take);
    },
  };

  const result = await iterateCursorPages(
    delegate,
    { where: { safe: true }, select: { id: true } },
    (page) => countedIds.push(...page.map((row) => row.id)),
    { pageSize: 2 },
  );

  assert.deepEqual(countedIds, ['id-001', 'id-002', 'id-003']);
  assert.equal(new Set(countedIds).size, countedIds.length);
  assert.deepEqual(result, {
    pageCount: 2,
    rowCount: 3,
    lastCursorId: 'id-003',
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].orderBy, { id: 'asc' });
  assert.equal(calls[0].take, 2);
  assert.equal('cursor' in calls[0], false);
  assert.deepEqual(calls[1].cursor, { id: 'id-002' });
  assert.equal(calls[1].skip, 1);
  assert.deepEqual(calls[2].cursor, { id: 'id-003' });
  assert.equal(calls[2].skip, 1);
});

test('rejects a repeated cursor row before duplicate counting', async () => {
  let call = 0;
  let count = 0;
  const delegate = {
    async findMany() {
      call += 1;
      return call <= 2 ? [{ id: 'id-001' }] : [];
    },
  };

  await assert.rejects(
    iterateCursorPages(
      delegate,
      { select: { id: true } },
      (page) => {
        count += page.length;
      },
      { pageSize: 1 },
    ),
    /non_monotonic_page/,
  );
  assert.equal(count, 1);
});

test('classifier source uses only bounded Prisma findMany reads', async () => {
  const source = readFileSync(
    require.resolve('../classify-teacher-directory-reality-0a.cjs'),
    'utf8',
  );
  const forbiddenMethods = [
    'findFirst',
    'findUnique',
    'count',
    'aggregate',
    'groupBy',
  ];

  for (const method of forbiddenMethods) {
    const prismaMethodPattern = new RegExp(`\\.${method}\\s*\\(`, 'g');
    assert.equal(source.match(prismaMethodPattern)?.length ?? 0, 0, method);
  }
  assert.equal(source.match(/\.\$queryRaw\b/g)?.length ?? 0, 0);
  assert.equal(source.match(/\.\$executeRaw\b/g)?.length ?? 0, 0);

  const directCalls = [
    ...source.matchAll(/prisma\.\w+\.findMany\(\{([\s\S]*?)\n\s{2,}\}\);/g),
  ];
  assert.equal(directCalls.length, 5);
  for (const [, queryBody] of directCalls) {
    assert.match(queryBody, /\borderBy:\s*\{\s*id:\s*'asc'\s*\}/);
    assert.match(queryBody, /\bselect:\s*/);
    const take = queryBody.match(/\btake:\s*(\d+)/);
    assert.notEqual(take, null);
    assert.ok(Number(take[1]) <= 500);
  }

  assert.equal(
    source.match(/\.findMany\s*\(/g)?.length ?? 0,
    directCalls.length + 1,
  );
  assert.match(source, /const rows = await delegate\.findMany\(query\)/);

  await assert.rejects(
    iterateCursorPages(
      { async findMany() {} },
      { where: { safe: true } },
      () => {},
    ),
    /explicit_select_required/,
  );
});

test('formats an allowlisted JSON-safe report without PII or storage data', () => {
  const report = formatSafeReport(
    {
      asOf: AS_OF.toISOString(),
      counts: { totalTeacherUsers: 1 },
      allocationsByTermState: { current_active: 1 },
      mismatchedRoleKeyCounts: { teacher: 1 },
      anomalyIds: {
        example: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000003',
        ],
      },
      firstName: 'NAME_MARKER_SHOULD_NOT_LEAK',
      email: 'EMAIL_MARKER_SHOULD_NOT_LEAK',
      phone: 'PHONE_MARKER_SHOULD_NOT_LEAK',
      passwordHash: 'PASSWORD_HASH_MARKER_SHOULD_NOT_LEAK',
      token: 'TOKEN_MARKER_SHOULD_NOT_LEAK',
      signedUrl: 'SIGNED_URL_MARKER_SHOULD_NOT_LEAK',
      bucket: 'BUCKET_MARKER_SHOULD_NOT_LEAK',
      objectKey: 'OBJECT_KEY_MARKER_SHOULD_NOT_LEAK',
    },
    { sampleLimit: 1 },
  );
  const serialized = JSON.stringify(report);

  for (const forbiddenValue of [
    'NAME_MARKER_SHOULD_NOT_LEAK',
    'EMAIL_MARKER_SHOULD_NOT_LEAK',
    'PHONE_MARKER_SHOULD_NOT_LEAK',
    'PASSWORD_HASH_MARKER_SHOULD_NOT_LEAK',
    'TOKEN_MARKER_SHOULD_NOT_LEAK',
    'SIGNED_URL_MARKER_SHOULD_NOT_LEAK',
    'BUCKET_MARKER_SHOULD_NOT_LEAK',
    'OBJECT_KEY_MARKER_SHOULD_NOT_LEAK',
  ]) {
    assert.equal(serialized.includes(forbiddenValue), false);
  }
  assert.deepEqual(report.anomalies.example.sampleIds, [
    '00000000-0000-4000-8000-000000000001',
  ]);
  assert.equal(report.anomalies.example.count, 3);
});

test('strict mode exits non-zero only when anomalies are present', () => {
  assert.equal(strictModeExitCode({ anomalies: {} }, false), 0);
  assert.equal(
    strictModeExitCode({ anomalies: { example: { count: 3 } } }, false),
    0,
  );
  assert.equal(strictModeExitCode({ anomalies: {} }, true), 0);
  assert.equal(
    strictModeExitCode({ anomalies: { example: { count: 3 } } }, true),
    2,
  );
});

function teacherUser(id, overrides = {}) {
  return {
    id,
    status: 'ACTIVE',
    hasUsername: true,
    hasContactEmail: true,
    hasPasswordHash: true,
    mustChangePassword: false,
    ...overrides,
  };
}

function membership(id, userId, overrides = {}) {
  return {
    id,
    userId,
    schoolId: 'school-1',
    userType: 'TEACHER',
    status: 'ACTIVE',
    endedAt: null,
    deletedAt: null,
    roleKey: 'teacher',
    roleSchoolId: null,
    roleDeletedAt: null,
    user: { userType: 'TEACHER', deletedAt: null },
    ...overrides,
  };
}

function term(overrides = {}) {
  return {
    schoolId: 'school-1',
    isActive: false,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-31T23:59:59.999Z'),
    deletedAt: null,
    academicYear: { schoolId: 'school-1', isActive: true, deletedAt: null },
    ...overrides,
  };
}

function allocation(id, teacherUserId, overrides = {}) {
  return {
    id,
    schoolId: 'school-1',
    teacherUserId,
    teacherUser: { userType: 'TEACHER', status: 'ACTIVE', deletedAt: null },
    term: term({ isActive: true }),
    subject: { schoolId: 'school-1', deletedAt: null },
    classroom: {
      schoolId: 'school-1',
      deletedAt: null,
      section: {
        schoolId: 'school-1',
        deletedAt: null,
        grade: {
          schoolId: 'school-1',
          deletedAt: null,
          stage: { schoolId: 'school-1', deletedAt: null },
        },
      },
    },
    ...overrides,
  };
}

function teacherProfile(id, userId, schoolId, overrides = {}) {
  return {
    id,
    userId,
    schoolId,
    teacherCode: 'T01',
    firstNameAr: 'أ',
    lastNameAr: 'ب',
    firstNameEn: 'A',
    lastNameEn: 'B',
    gender: 'MALE',
    deletedAt: null,
    user: { userType: 'TEACHER', deletedAt: null },
    ...overrides,
  };
}
