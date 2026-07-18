'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BACKFILL_STATUS,
  addBoundedSample,
  classifyBackfillCandidate,
  iterateCursorPages,
  resolveApplyGate,
  runBackfill,
  safeFailure,
} = require('../backfill-teacher-profiles-1a.cjs');

function operationalMembership(overrides = {}) {
  return {
    id: 'membership-1',
    schoolId: 'school-a',
    userType: 'TEACHER',
    status: 'ACTIVE',
    endedAt: null,
    deletedAt: null,
    role: { key: 'teacher', schoolId: 'school-a', deletedAt: null },
    ...overrides,
  };
}

function teacherUser(id = 'user-1', overrides = {}) {
  return { id, userType: 'TEACHER', deletedAt: null, ...overrides };
}

function createFakePrisma({
  users = [],
  memberships = [],
  profiles = [],
  conflictUserId,
} = {}) {
  const mutableProfiles = profiles.map((profile) => ({ ...profile }));
  let createCalls = 0;
  return {
    user: {
      async findMany(args) {
        let start = 0;
        if (args.cursor) {
          const cursorIndex = users.findIndex(
            (user) => user.id === args.cursor.id,
          );
          start = cursorIndex + (args.skip ?? 0);
        }
        return users
          .slice(start, start + args.take)
          .map((user) => ({ ...user }));
      },
    },
    membership: {
      async findMany(args) {
        return memberships
          .filter(
            (membership) =>
              membership.userId === args.where.userId &&
              membership.status === 'ACTIVE' &&
              membership.endedAt === null &&
              membership.deletedAt === null,
          )
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, args.take)
          .map(({ userId: _userId, ...membership }) => membership);
      },
    },
    teacherProfile: {
      async findMany(args) {
        return mutableProfiles
          .filter((profile) => {
            if (profile.userId !== args.where.userId) return false;
            if (!args.where.OR) return true;
            return args.where.OR.some((condition) => {
              if ('deletedAt' in condition) {
                return profile.deletedAt === condition.deletedAt;
              }
              if (typeof condition.schoolId === 'string') {
                return profile.schoolId === condition.schoolId;
              }
              return (
                condition.schoolId?.in?.includes(profile.schoolId) === true
              );
            });
          })
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, args.take)
          .map(({ userId: _userId, ...profile }) => profile);
      },
      async create(args) {
        createCalls += 1;
        if (args.data.userId === conflictUserId) {
          const error = new Error('sensitive database detail');
          error.code = 'P2002';
          throw error;
        }
        const profile = {
          id: `profile-${mutableProfiles.length + 1}`,
          schoolId: args.data.schoolId,
          userId: args.data.userId,
          deletedAt: null,
        };
        mutableProfiles.push(profile);
        return { id: profile.id };
      },
    },
    get createCalls() {
      return createCalls;
    },
    get profiles() {
      return mutableProfiles;
    },
  };
}

function context(overrides = {}) {
  return {
    user: teacherUser(),
    memberships: [operationalMembership()],
    profiles: [],
    ...overrides,
  };
}

test('candidate selection accepts only the exact operational Teacher membership', () => {
  assert.deepEqual(classifyBackfillCandidate(context()), {
    status: BACKFILL_STATUS.ELIGIBLE,
    schoolId: 'school-a',
  });
  assert.equal(
    classifyBackfillCandidate(
      context({
        memberships: [
          operationalMembership({
            role: { key: 'teacher', schoolId: null, deletedAt: null },
          }),
        ],
      }),
    ).status,
    BACKFILL_STATUS.ELIGIBLE,
  );
  assert.equal(
    classifyBackfillCandidate(context({ memberships: [] })).status,
    BACKFILL_STATUS.NO_OPERATIONAL_MEMBERSHIP,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({ memberships: [operationalMembership({ schoolId: null })] }),
    ).status,
    BACKFILL_STATUS.MEMBERSHIP_WITHOUT_SCHOOL,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        memberships: [operationalMembership({ userType: 'SCHOOL_USER' })],
      }),
    ).status,
    BACKFILL_STATUS.ROLE_OR_TYPE_MISMATCH,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        memberships: [
          operationalMembership({
            role: { key: 'admin', schoolId: 'school-a', deletedAt: null },
          }),
        ],
      }),
    ).status,
    BACKFILL_STATUS.ROLE_OR_TYPE_MISMATCH,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        memberships: [
          operationalMembership({
            role: { key: 'teacher', schoolId: 'school-b', deletedAt: null },
          }),
        ],
      }),
    ).status,
    BACKFILL_STATUS.ROLE_SCHOOL_MISMATCH,
  );
});

test('candidate selection rejects ambiguous and conflicting profile states', () => {
  assert.equal(
    classifyBackfillCandidate(
      context({ user: teacherUser('user-1', { userType: 'SCHOOL_USER' }) }),
    ).status,
    BACKFILL_STATUS.USER_TYPE_MISMATCH,
  );
  assert.equal(
    classifyBackfillCandidate(context({ user: null })).status,
    BACKFILL_STATUS.DELETED_OR_MISSING_USER,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        memberships: [
          operationalMembership(),
          operationalMembership({ id: 'membership-2', schoolId: 'school-b' }),
        ],
      }),
    ).status,
    BACKFILL_STATUS.CROSS_SCHOOL_AMBIGUITY,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        profiles: [{ id: 'profile-1', schoolId: 'school-a', deletedAt: null }],
      }),
    ).status,
    BACKFILL_STATUS.EXISTING_SAME_SCHOOL_LIVE,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        profiles: [
          { id: 'profile-1', schoolId: 'school-a', deletedAt: new Date() },
        ],
      }),
    ).status,
    BACKFILL_STATUS.ARCHIVED_SAME_SCHOOL,
  );
  assert.equal(
    classifyBackfillCandidate(
      context({
        profiles: [{ id: 'profile-1', schoolId: 'school-b', deletedAt: null }],
      }),
    ).status,
    BACKFILL_STATUS.EXISTING_LIVE_OTHER_SCHOOL,
  );
});

test('apply gate requires two confirmations and forbids production', () => {
  assert.deepEqual(resolveApplyGate({ applyRequested: false, env: {} }), {
    apply: false,
    allowed: true,
    reason: 'dry_run_default',
  });
  assert.equal(
    resolveApplyGate({ applyRequested: true, env: {} }).allowed,
    false,
  );
  assert.equal(
    resolveApplyGate({
      applyRequested: false,
      env: { TEACHER_PROFILE_BACKFILL_APPLY: '1' },
    }).allowed,
    false,
  );
  assert.deepEqual(
    resolveApplyGate({
      applyRequested: true,
      env: { TEACHER_PROFILE_BACKFILL_APPLY: '1', NODE_ENV: 'test' },
    }),
    { apply: true, allowed: true, reason: 'explicit_apply' },
  );
  assert.equal(
    resolveApplyGate({
      applyRequested: true,
      env: { TEACHER_PROFILE_BACKFILL_APPLY: '1', NODE_ENV: 'production' },
    }).reason,
    'production_apply_forbidden',
  );
});

test('cursor iteration progresses stably over multiple pages and stops on an empty page', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const calls = [];
  const findMany = async (args) => {
    calls.push(args);
    const start = args.cursor ? ids.indexOf(args.cursor.id) + args.skip : 0;
    return ids.slice(start, start + args.take).map((id) => ({ id }));
  };
  const seen = [];
  for await (const page of iterateCursorPages(findMany, 2)) {
    seen.push(...page.map((record) => record.id));
  }
  assert.deepEqual(seen, ids);
  assert.equal(new Set(seen).size, ids.length);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[1].cursor, { id: 'b' });
  assert.deepEqual(calls[3].cursor, { id: 'e' });
});

test('dry-run handles zero users without attempting a write', async () => {
  const prisma = createFakePrisma();
  const report = await runBackfill({
    prisma,
    options: { batchSize: 500, sampleLimit: 20 },
    applyGate: { apply: false, reason: 'dry_run_default' },
  });
  assert.equal(report.teacherUsers, 0);
  assert.equal(report.created, 0);
  assert.equal(prisma.createCalls, 0);
});

test('bounded pagination classifies more than 500 users exactly once', async () => {
  const users = Array.from({ length: 503 }, (_, index) =>
    teacherUser(`user-${String(index).padStart(4, '0')}`),
  );
  const memberships = users.map((user, index) => ({
    ...operationalMembership({ id: `membership-${index}` }),
    userId: user.id,
  }));
  const report = await runBackfill({
    prisma: createFakePrisma({ users, memberships }),
    options: { batchSize: 500, sampleLimit: 20 },
    applyGate: { apply: false, reason: 'dry_run_default' },
  });
  assert.equal(report.batches, 2);
  assert.equal(report.teacherUsers, 503);
  assert.equal(report.counts[BACKFILL_STATUS.ELIGIBLE], 503);
});

test('apply creates only incomplete INACTIVE profiles and second apply is a no-op', async () => {
  const user = teacherUser();
  const prisma = createFakePrisma({
    users: [user],
    memberships: [{ ...operationalMembership(), userId: user.id }],
  });
  const request = {
    prisma,
    options: { batchSize: 500, sampleLimit: 20 },
    applyGate: { apply: true, reason: 'explicit_apply' },
  };
  const first = await runBackfill(request);
  const second = await runBackfill(request);
  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.counts[BACKFILL_STATUS.EXISTING_SAME_SCHOOL_LIVE], 1);
  assert.equal(prisma.profiles[0].schoolId, 'school-a');
});

test('finds an archived same-school profile beyond unrelated cross-school history', async () => {
  const user = teacherUser();
  const profiles = ['b', 'c', 'd', 'e'].map((suffix, index) => ({
    id: `profile-0${index}`,
    userId: user.id,
    schoolId: `school-${suffix}`,
    deletedAt: new Date('2026-01-01T00:00:00.000Z'),
  }));
  profiles.push({
    id: 'profile-z',
    userId: user.id,
    schoolId: 'school-a',
    deletedAt: new Date('2026-02-01T00:00:00.000Z'),
  });
  const report = await runBackfill({
    prisma: createFakePrisma({
      users: [user],
      memberships: [{ ...operationalMembership(), userId: user.id }],
      profiles,
    }),
    options: { batchSize: 500, sampleLimit: 20 },
    applyGate: { apply: false, reason: 'dry_run_default' },
  });
  assert.equal(report.counts[BACKFILL_STATUS.ARCHIVED_SAME_SCHOOL], 1);
  assert.equal(report.counts[BACKFILL_STATUS.ELIGIBLE], 0);
});

test('unique conflict is classified without exposing raw database details', async () => {
  const user = teacherUser();
  const report = await runBackfill({
    prisma: createFakePrisma({
      users: [user],
      memberships: [{ ...operationalMembership(), userId: user.id }],
      conflictUserId: user.id,
    }),
    options: { batchSize: 500, sampleLimit: 1 },
    applyGate: { apply: true, reason: 'explicit_apply' },
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.created, 0);
  assert.equal(report.counts[BACKFILL_STATUS.UNIQUE_RACE_CONFLICT], 1);
  assert.doesNotMatch(serialized, /sensitive database detail/u);
});

test('samples are bounded and safe failures contain no raw values', () => {
  const samples = {};
  addBoundedSample(samples, 'anomaly', 'opaque-1', 2);
  addBoundedSample(samples, 'anomaly', 'opaque-2', 2);
  addBoundedSample(samples, 'anomaly', 'opaque-3', 2);
  assert.deepEqual(samples.anomaly, ['opaque-1', 'opaque-2']);
  assert.deepEqual(safeFailure('backfill_execution_failed'), {
    ok: false,
    error: 'backfill_execution_failed',
  });
  assert.doesNotMatch(
    JSON.stringify(safeFailure('backfill_execution_failed')),
    /email|phone|password|name|teacherCode|bucket|objectKey/iu,
  );
});
