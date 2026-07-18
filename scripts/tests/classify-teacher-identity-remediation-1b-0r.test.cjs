'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const {
  MAX_PAGE_SIZE,
  classifyAllocationExposure,
  classifyDatabase,
  classifyMembershipHistory,
  classifyMultipleMemberships,
  classifyOneMembership,
  classifyProfileHistory,
  finalizeState,
  isActiveSession,
  isExactOperationalTeacherMembership,
  isTargetUser,
  iterateCursorPages,
  parseArguments,
  runCli,
  sanitizeUser,
  createState,
} = require('../classify-teacher-identity-remediation-1b-0r.cjs');

const AS_OF = new Date('2026-07-18T12:00:00.000Z');

function user(overrides = {}) {
  return {
    id: 'user-1',
    userType: 'TEACHER',
    status: 'ACTIVE',
    deletedAt: null,
    hasUsername: true,
    hasContactEmail: true,
    hasPassword: true,
    mustChangePassword: false,
    passwordProvisioned: true,
    credentialVersion: 1,
    ...overrides,
  };
}

function membership(overrides = {}) {
  const schoolId = Object.hasOwn(overrides, 'schoolId')
    ? overrides.schoolId
    : 'school-a';
  const organizationId = overrides.organizationId ?? 'organization-a';
  return {
    id: overrides.id ?? 'membership-1',
    userId: overrides.userId ?? 'user-1',
    organizationId,
    schoolId,
    userType: 'TEACHER',
    status: 'INACTIVE',
    startedAt: new Date('2025-01-01T00:00:00.000Z'),
    endedAt: new Date('2025-06-01T00:00:00.000Z'),
    deletedAt: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-06-01T00:00:00.000Z'),
    role: { key: 'teacher', schoolId: null, deletedAt: null },
    school:
      schoolId == null
        ? null
        : { organizationId, status: 'ACTIVE', deletedAt: null },
    organization: { status: 'ACTIVE', deletedAt: null },
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    id: 'profile-1',
    userId: 'user-1',
    schoolId: 'school-a',
    employmentStatus: 'INACTIVE',
    deletedAt: new Date('2025-07-01T00:00:00.000Z'),
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

function term(overrides = {}) {
  return {
    schoolId: 'school-a',
    isActive: true,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-31T00:00:00.000Z'),
    deletedAt: null,
    academicYear: {
      schoolId: 'school-a',
      isActive: true,
      deletedAt: null,
    },
    ...overrides,
  };
}

function allocation(overrides = {}) {
  return {
    id: overrides.id ?? 'allocation-1',
    teacherUserId: overrides.teacherUserId ?? 'user-1',
    schoolId: 'school-a',
    term: term(),
    subject: { schoolId: 'school-a', deletedAt: null },
    classroom: {
      schoolId: 'school-a',
      deletedAt: null,
      section: {
        schoolId: 'school-a',
        deletedAt: null,
        grade: {
          schoolId: 'school-a',
          deletedAt: null,
          stage: { schoolId: 'school-a', deletedAt: null },
        },
      },
    },
    ...overrides,
  };
}

function rawUser(overrides = {}) {
  return {
    id: overrides.id ?? 'user-1',
    userType: 'TEACHER',
    status: 'ACTIVE',
    deletedAt: null,
    username: 'private-user',
    contactEmail: 'private@example.test',
    passwordHash: 'private-hash',
    mustChangePassword: false,
    passwordProvisionedAt: new Date('2026-01-01T00:00:00.000Z'),
    credentialVersion: 1,
    ...overrides,
  };
}

function matchesWhere(row, where = {}) {
  if (where.userType && row.userType !== where.userType) return false;
  if (Object.hasOwn(where, 'deletedAt') && row.deletedAt !== where.deletedAt) {
    return false;
  }
  for (const key of ['userId', 'teacherUserId']) {
    if (where[key]?.in && !where[key].in.includes(row[key])) return false;
  }
  if (Object.hasOwn(where, 'revokedAt') && row.revokedAt !== where.revokedAt) {
    return false;
  }
  if (where.expiresAt?.gt && !(row.expiresAt > where.expiresAt.gt))
    return false;
  return true;
}

function delegate(rows, calls, name, options = {}) {
  return {
    async findMany(args) {
      calls.push({ name, args });
      if (options.fail) throw new Error('private infrastructure detail');
      const filtered = rows
        .filter((row) => matchesWhere(row, args.where))
        .sort((left, right) => left.id.localeCompare(right.id));
      let start = 0;
      if (args.cursor) {
        start = filtered.findIndex((row) => row.id === args.cursor.id) + 1;
      }
      return filtered.slice(start, start + args.take);
    },
    async create() {
      throw new Error('mutation delegate called');
    },
    async update() {
      throw new Error('mutation delegate called');
    },
    async delete() {
      throw new Error('mutation delegate called');
    },
  };
}

function fakePrisma(data = {}, options = {}) {
  const calls = [];
  let disconnects = 0;
  const prisma = {
    user: delegate(data.users ?? [], calls, 'user', {
      fail: options.failUserRead,
    }),
    membership: delegate(data.memberships ?? [], calls, 'membership'),
    teacherProfile: delegate(data.profiles ?? [], calls, 'teacherProfile'),
    teacherSubjectAllocation: delegate(
      data.allocations ?? [],
      calls,
      'teacherSubjectAllocation',
    ),
    session: delegate(data.sessions ?? [], calls, 'session'),
    async $disconnect() {
      disconnects += 1;
      if (options.failDisconnect) throw new Error('private disconnect detail');
    },
  };
  return {
    prisma,
    calls,
    get disconnects() {
      return disconnects;
    },
  };
}

test('target universe includes only live Teacher Users with no exact operational Membership or live Profile', () => {
  assert.equal(isTargetUser(user(), [], []), true);
  assert.equal(isTargetUser(user({ userType: 'SCHOOL_USER' }), [], []), false);
  assert.equal(isTargetUser(user({ deletedAt: AS_OF }), [], []), false);
  assert.equal(isTargetUser(user(), [], [profile({ deletedAt: null })]), false);
});

test('exact operational Teacher Membership excludes a User from target', () => {
  const operational = membership({ status: 'ACTIVE', endedAt: null });
  assert.equal(isExactOperationalTeacherMembership(operational), true);
  assert.equal(isTargetUser(user(), [operational], []), false);
});

test('no Membership history has its own exclusive cohort', () => {
  assert.deepEqual(classifyMembershipHistory(user(), []), {
    cohort: 'NO_MEMBERSHIP_HISTORY',
    subtype: null,
  });
});

test('one-Membership tenant-link mismatch has highest precedence', () => {
  const value = membership({
    school: {
      organizationId: 'organization-b',
      status: 'ACTIVE',
      deletedAt: null,
    },
    role: { key: 'school_admin', schoolId: 'school-b', deletedAt: AS_OF },
  });
  assert.equal(
    classifyOneMembership(user(), value),
    'ONE_TENANT_LINK_MISMATCH',
  );
});

test('one schoolless Membership is classified separately', () => {
  assert.equal(
    classifyOneMembership(
      user(),
      membership({
        schoolId: null,
        school: null,
        role: { key: 'teacher', schoolId: null, deletedAt: null },
      }),
    ),
    'ONE_SCHOOLLESS_MEMBERSHIP',
  );
});

test('one Teacher-footprint mismatch covers Role key, type, and deletion defects', () => {
  for (const value of [
    membership({
      role: { key: 'school_admin', schoolId: null, deletedAt: null },
    }),
    membership({ userType: 'SCHOOL_USER' }),
    membership({ role: { key: 'teacher', schoolId: null, deletedAt: AS_OF } }),
    membership({
      school: {
        organizationId: 'organization-a',
        status: 'ACTIVE',
        deletedAt: AS_OF,
      },
    }),
  ]) {
    assert.equal(
      classifyOneMembership(user(), value),
      'ONE_TEACHER_FOOTPRINT_MISMATCH',
    );
  }
});

test('one exact historical Teacher Membership is classified with actual status values', () => {
  for (const overrides of [
    { status: 'INACTIVE' },
    { status: 'SUSPENDED' },
    { status: 'TRANSFERRED' },
    { status: 'ACTIVE', endedAt: AS_OF },
    { status: 'ACTIVE', endedAt: null, deletedAt: AS_OF },
  ]) {
    assert.equal(
      classifyOneMembership(user(), membership(overrides)),
      'ONE_EXACT_HISTORICAL_TEACHER_MEMBERSHIP',
    );
  }
});

test('one non-Teacher Membership subtype is deterministic for a non-target pure input', () => {
  assert.equal(
    classifyOneMembership(
      user({ userType: 'SCHOOL_USER' }),
      membership({
        userType: 'SCHOOL_USER',
        role: { key: 'school_admin', schoolId: null, deletedAt: null },
      }),
    ),
    'ONE_NON_TEACHER_MEMBERSHIP',
  );
});

test('multiple cross-organization history takes precedence', () => {
  const rows = [
    membership({ id: 'membership-1' }),
    membership({
      id: 'membership-2',
      organizationId: 'organization-b',
      schoolId: 'school-b',
      school: {
        organizationId: 'organization-b',
        status: 'ACTIVE',
        deletedAt: null,
      },
    }),
  ];
  assert.equal(
    classifyMultipleMemberships(rows),
    'MULTIPLE_CROSS_ORGANIZATION_HISTORY',
  );
});

test('multiple cross-school history is detected inside one Organization', () => {
  const rows = [
    membership({ id: 'membership-1' }),
    membership({ id: 'membership-2', schoolId: 'school-b' }),
  ];
  assert.equal(
    classifyMultipleMemberships(rows),
    'MULTIPLE_CROSS_SCHOOL_HISTORY',
  );
});

test('multiple mixed history detects exact and mismatched Teacher footprints', () => {
  const rows = [
    membership({ id: 'membership-1' }),
    membership({
      id: 'membership-2',
      role: { key: 'school_admin', schoolId: null, deletedAt: null },
    }),
  ];
  assert.equal(
    classifyMultipleMemberships(rows),
    'MULTIPLE_MIXED_OR_MISMATCHED_HISTORY',
  );
});

test('multiple same-school exact historical rows form one deterministic subtype', () => {
  const rows = [
    membership({ id: 'membership-1', status: 'INACTIVE' }),
    membership({ id: 'membership-2', status: 'TRANSFERRED' }),
  ];
  assert.equal(
    classifyMultipleMemberships(rows),
    'MULTIPLE_SAME_SCHOOL_EXACT_HISTORICAL_HISTORY',
  );
});

test('profile history has no-profile classification', () => {
  assert.deepEqual(classifyProfileHistory([], [membership()]), {
    noProfileRows: true,
    hasArchivedHistory: false,
    archivedSameSchoolProfile: false,
    archivedOtherSchoolProfile: false,
    multipleArchivedProfiles: false,
    crossSchoolArchivedProfileHistory: false,
  });
});

test('archived same-school Profile requires an unambiguous exact historical School', () => {
  assert.equal(
    classifyProfileHistory([profile()], [membership()])
      .archivedSameSchoolProfile,
    true,
  );
  assert.equal(
    classifyProfileHistory(
      [profile()],
      [
        membership({
          role: { key: 'school_admin', schoolId: null, deletedAt: null },
        }),
      ],
    ).archivedSameSchoolProfile,
    false,
  );
});

test('archived other-school and cross-school Profile history remain distinct', () => {
  const result = classifyProfileHistory(
    [profile(), profile({ id: 'profile-2', schoolId: 'school-b' })],
    [membership()],
  );
  assert.equal(result.archivedSameSchoolProfile, true);
  assert.equal(result.archivedOtherSchoolProfile, true);
  assert.equal(result.multipleArchivedProfiles, true);
  assert.equal(result.crossSchoolArchivedProfileHistory, true);
});

test('allocation classifier covers every date-first term state', () => {
  const values = {
    current_active: allocation(),
    current_inactive: allocation({ term: term({ isActive: false }) }),
    future: allocation({
      term: term({
        isActive: false,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-31T00:00:00.000Z'),
      }),
    }),
    historical: allocation({
      term: term({
        isActive: false,
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        endDate: new Date('2026-05-31T00:00:00.000Z'),
      }),
    }),
    inconsistent: allocation({
      term: term({
        isActive: true,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-31T00:00:00.000Z'),
      }),
    }),
    invalid: allocation({ term: null }),
  };
  for (const [expected, value] of Object.entries(values)) {
    const result = classifyAllocationExposure([value], AS_OF);
    assert.equal(result[expected], true);
  }
});

test('allocation highest-risk precedence is stable', () => {
  const crossSchool = allocation({
    subject: { schoolId: 'school-b', deletedAt: null },
    term: term({ isActive: false }),
  });
  assert.equal(
    classifyAllocationExposure([crossSchool], AS_OF).highestRisk,
    'cross_school',
  );
  assert.equal(
    classifyAllocationExposure([crossSchool, allocation({ term: null })], AS_OF)
      .highestRisk,
    'invalid',
  );
});

test('allocation as-of equality is current rather than future or historical', () => {
  const startsNow = allocation({
    term: term({ startDate: AS_OF, isActive: false }),
  });
  const endsNow = allocation({
    term: term({ endDate: AS_OF, isActive: false }),
  });
  assert.equal(
    classifyAllocationExposure([startsNow], AS_OF).current_inactive,
    true,
  );
  assert.equal(
    classifyAllocationExposure([endsNow], AS_OF).current_inactive,
    true,
  );
});

test('unrevoked Session requires expiry strictly after as-of', () => {
  assert.equal(
    isActiveSession(
      { revokedAt: null, expiresAt: new Date(AS_OF.getTime() + 1) },
      AS_OF,
    ),
    true,
  );
  assert.equal(
    isActiveSession({ revokedAt: null, expiresAt: AS_OF }, AS_OF),
    false,
  );
  assert.equal(
    isActiveSession(
      { revokedAt: AS_OF, expiresAt: new Date(AS_OF.getTime() + 1) },
      AS_OF,
    ),
    false,
  );
});

test('credential values are reduced immediately to booleans', () => {
  const input = rawUser();
  assert.deepEqual(sanitizeUser(rawUser()), {
    id: 'user-1',
    userType: 'TEACHER',
    status: 'ACTIVE',
    deletedAt: null,
    hasUsername: true,
    hasContactEmail: true,
    hasPassword: true,
    mustChangePassword: false,
    passwordProvisioned: true,
    credentialVersion: 1,
  });
  sanitizeUser(input);
  assert.equal(input.username, undefined);
  assert.equal(input.contactEmail, undefined);
  assert.equal(input.passwordHash, undefined);
});

test('cursor pagination is stable across multiple pages and an explicit empty page', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({
    id: String(index).padStart(4, '0'),
  }));
  const calls = [];
  const pages = [];
  await iterateCursorPages(
    async (args) => {
      calls.push(args);
      const start = args.cursor
        ? rows.findIndex((row) => row.id === args.cursor.id) + 1
        : 0;
      return rows.slice(start, start + args.take);
    },
    { select: { id: true } },
    (page, metadata) => pages.push({ length: page.length, ...metadata }),
  );
  assert.deepEqual(
    pages.map((page) => page.length),
    [500, 1, 0],
  );
  assert.equal(pages.at(-1).terminal, true);
  assert.equal(
    calls.every((call) => call.take <= 500),
    true,
  );
  assert.deepEqual(calls[1].cursor, { id: '0499' });
  assert.equal(calls[1].skip, 1);
});

test('page size greater than 500 is rejected', async () => {
  await assert.rejects(
    iterateCursorPages(
      async () => [],
      {},
      async () => {},
      MAX_PAGE_SIZE + 1,
    ),
    /invalid_page_size/,
  );
});

test('classification invariants fail closed without identifiers', () => {
  const state = createState(AS_OF);
  state.counts.targetPopulation = 1;
  const report = finalizeState(state);
  assert.deepEqual(report, {
    classifier: 'SCHOOL-TEACHER-DIRECTORY-1B-0R',
    mode: 'read_only',
    asOf: AS_OF.toISOString(),
    ok: false,
    error: 'classification_invariant_failed',
  });
});

test('CLI requires one valid ISO as-of argument and rejects every other shape', () => {
  assert.equal(
    parseArguments([`--as-of=${AS_OF.toISOString()}`]).asOf.getTime(),
    AS_OF.getTime(),
  );
  assert.throws(() => parseArguments([]), /missing_as_of/);
  assert.throws(() => parseArguments(['--as-of=invalid']), /invalid_as_of/);
  assert.throws(() => parseArguments(['--strict']), /unknown_argument/);
  assert.throws(
    () =>
      parseArguments([
        `--as-of=${AS_OF.toISOString()}`,
        `--as-of=${AS_OF.toISOString()}`,
      ]),
    /duplicate_as_of/,
  );
});

test('calendar-valid ISO timestamps preserve their exact instant', () => {
  const valid = new Map([
    ['2026-02-28T23:59:59Z', '2026-02-28T23:59:59.000Z'],
    ['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.000Z'],
    ['2026-07-18T16:36:19.198Z', '2026-07-18T16:36:19.198Z'],
    ['2026-07-18T19:36:19.198+03:00', '2026-07-18T16:36:19.198Z'],
    ['2026-07-18T13:36:19.198-03:00', '2026-07-18T16:36:19.198Z'],
  ]);
  for (const [input, expected] of valid) {
    assert.equal(
      parseArguments([`--as-of=${input}`]).asOf.toISOString(),
      expected,
      input,
    );
  }
});

test('calendar-invalid ISO timestamps are rejected without normalization', () => {
  for (const input of [
    '2026-02-31T00:00:00Z',
    '2025-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00+01:60',
  ]) {
    assert.throws(
      () => parseArguments([`--as-of=${input}`]),
      /invalid_as_of/,
      input,
    );
  }
});

test('coherent moved target fails closed while preserving sanitized aggregates', async () => {
  const fake = fakePrisma({ users: [rawUser()] });
  const report = await classifyDatabase(fake.prisma, AS_OF);
  assert.equal(report.ok, false);
  assert.equal(report.error, 'data_baseline_moved');
  assert.equal(report.invariants.targetMatchesLockedEvidence, false);
  assert.equal(report.invariants.topLevelCohortsSumToTarget, true);
  assert.equal(report.invariants.oneMembershipSubtypesSumCorrectly, true);
  assert.equal(report.invariants.multipleMembershipSubtypesSumCorrectly, true);
  assert.equal(report.invariants.allTargetsClassifiedExactlyOnce, true);
  assert.equal(report.counts.targetPopulation, 1);
  assert.equal(report.exclusiveMembershipCohorts.NO_MEMBERSHIP_HISTORY, 1);
  assert.equal(
    report.remediationDecisionFamilyCounts
      .OWNER_DECISION_IDENTITY_RETIRE_OR_REPROVISION,
    1,
  );
  for (const section of [
    'counts',
    'exclusiveMembershipCohorts',
    'oneMembershipSubtypes',
    'multipleMembershipSubtypes',
    'accountStatusCounts',
    'credentialStateCounts',
    'membershipFootprintCounts',
    'profileHistoryCounts',
    'allocationExposureCounts',
    'allocationHighestRiskCounts',
    'sessionExposureCounts',
    'remediationDecisionFamilyCounts',
    'invariants',
  ]) {
    assert.equal(typeof report[section], 'object', section);
  }
  assert.equal(JSON.stringify(report).includes('user-1'), false);
  assert.equal(
    fake.calls.every((call) => call.args.take <= 500),
    true,
  );
  assert.equal(
    fake.calls.every((call) => call.args.orderBy.id === 'asc'),
    true,
  );
  assert.equal(
    fake.calls.every((call) => call.args.select != null),
    true,
  );
});

test('database adapter excludes an exact operational Teacher Membership', async () => {
  const fake = fakePrisma({
    users: [rawUser()],
    memberships: [membership({ status: 'ACTIVE', endedAt: null })],
  });
  const report = await classifyDatabase(fake.prisma, AS_OF);
  assert.equal(report.counts.targetPopulation, 0);
});

test('successful CLI run disconnects once and emits deterministic aggregate-only JSON', async () => {
  const fake = fakePrisma({
    users: Array.from({ length: 18 }, (_, index) =>
      rawUser({ id: `user-${String(index).padStart(2, '0')}` }),
    ),
  });
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`], {
    createPrisma: () => fake.prisma,
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(fake.disconnects, 1);
  const report = JSON.parse(output);
  assert.equal(report.ok, true);
  assert.equal(report.counts.targetPopulation, 18);
  assert.equal(output.includes('private-user'), false);
  assert.equal(output.includes('private@example.test'), false);
  assert.equal(output.includes('private-hash'), false);
  assert.equal(output.includes('user-1'), false);
});

test('moved-target CLI exits one and emits aggregate evidence without identifiers', async () => {
  const fake = fakePrisma({ users: [rawUser()] });
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`], {
    createPrisma: () => fake.prisma,
    write: (value) => {
      output += value;
    },
  });
  const report = JSON.parse(output);
  assert.equal(exitCode, 1);
  assert.equal(fake.disconnects, 1);
  assert.equal(report.ok, false);
  assert.equal(report.error, 'data_baseline_moved');
  assert.equal(report.counts.targetPopulation, 1);
  assert.equal(report.invariants.targetMatchesLockedEvidence, false);
  assert.equal(output.includes('user-1'), false);
  assert.equal(output.includes('private@example.test'), false);
});

test('database read failure emits only a generic stable error and still disconnects', async () => {
  const fake = fakePrisma({}, { failUserRead: true });
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`], {
    createPrisma: () => fake.prisma,
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 1);
  assert.equal(fake.disconnects, 1);
  assert.deepEqual(JSON.parse(output), {
    classifier: 'SCHOOL-TEACHER-DIRECTORY-1B-0R',
    mode: 'read_only',
    asOf: AS_OF.toISOString(),
    ok: false,
    error: 'database_read_failed',
  });
  assert.equal(output.includes('private infrastructure detail'), false);
});

test('disconnect failure replaces a successful report with the same generic safe failure', async () => {
  const fake = fakePrisma({}, { failDisconnect: true });
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`], {
    createPrisma: () => fake.prisma,
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 1);
  assert.equal(JSON.parse(output).error, 'database_read_failed');
  assert.equal(output.includes('private disconnect detail'), false);
});

test('invalid CLI input never constructs a database client', async () => {
  let constructed = false;
  let output = '';
  const exitCode = await runCli([], {
    createPrisma: () => {
      constructed = true;
    },
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 2);
  assert.equal(constructed, false);
  assert.equal(JSON.parse(output).error, 'missing_as_of');
});

test('calendar-invalid CLI input returns invalid_as_of and exit two', async () => {
  let constructed = false;
  let output = '';
  const exitCode = await runCli(['--as-of=2026-02-31T00:00:00Z'], {
    createPrisma: () => {
      constructed = true;
    },
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 2);
  assert.equal(constructed, false);
  assert.equal(JSON.parse(output).error, 'invalid_as_of');
});

test('source contract contains no Prisma mutation or unsafe raw-query call', () => {
  const source = readFileSync(
    require.resolve('../classify-teacher-identity-remediation-1b-0r.cjs'),
    'utf8',
  );
  for (const method of [
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
    '$executeRaw',
    '$queryRaw',
    '$transaction',
  ]) {
    assert.equal(
      new RegExp(`\\.${method.replace('$', '\\$')}\\s*\\(`).test(source),
      false,
      method,
    );
  }
  assert.equal(source.includes('migrate '), false);
});

test('output schema contains aggregate values only and no identifier collections', async () => {
  const fake = fakePrisma({
    users: [rawUser()],
    memberships: [membership()],
    profiles: [profile()],
    allocations: [allocation()],
    sessions: [
      {
        id: 'session-private',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(AS_OF.getTime() + 1000),
      },
    ],
  });
  const serialized = JSON.stringify(await classifyDatabase(fake.prisma, AS_OF));
  for (const privateValue of [
    'user-1',
    'membership-1',
    'school-a',
    'organization-a',
    'profile-1',
    'allocation-1',
    'session-private',
    'private-user',
    'private@example.test',
    'private-hash',
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
  assert.equal(
    /"(?:ids|sampleIds|userId|membershipId|profileId|sessionId)"/.test(
      serialized,
    ),
    false,
  );
});

test('report property ordering is deterministic', async () => {
  const left = await classifyDatabase(
    fakePrisma({ users: [rawUser()] }).prisma,
    AS_OF,
  );
  const right = await classifyDatabase(
    fakePrisma({ users: [rawUser()] }).prisma,
    AS_OF,
  );
  assert.equal(JSON.stringify(left), JSON.stringify(right));
});
