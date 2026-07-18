'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const {
  APPLY_ENVIRONMENT_KEY,
  evaluatePreconditions,
  mutationPlan,
  parseArguments,
  readEligibleCandidates,
  remediationReport,
  resolveApplyGate,
  runApply,
  runCli,
  runDryRun,
} = require('../remediate-orphan-teacher-identities-1b-0r.cjs');

const AS_OF = new Date('2026-07-18T17:00:00.000Z');
const FIXED_DELETED_AT = new Date('2026-07-18T17:01:00.000Z');

function classification(overrides = {}) {
  return {
    ok: true,
    counts: { targetPopulation: 18 },
    exclusiveMembershipCohorts: { NO_MEMBERSHIP_HISTORY: 18 },
    profileHistoryCounts: { noProfileRows: 18 },
    allocationExposureCounts: { noAllocations: 18 },
    sessionExposureCounts: {
      usersWithUnrevokedUnexpiredSession: 0,
      totalUnrevokedUnexpiredSessions: 0,
    },
    accountStatusCounts: { ACTIVE: 18 },
    credentialStateCounts: {
      hasUsername: 0,
      hasContactEmail: 0,
      hasPassword: 0,
      mustChangePassword: 0,
      passwordProvisioned: 0,
      credentialVersionZero: 18,
      credentialVersionGreaterThanZero: 0,
    },
    ...overrides,
  };
}

function readyInspection(count = 18) {
  const candidateIds = Array.from(
    { length: count },
    (_, index) => `candidate-${String(index).padStart(2, '0')}`,
  );
  const classified = classification(
    count === 18 ? {} : { counts: { targetPopulation: count } },
  );
  return {
    candidateIds,
    counts: {
      lockedExpectedTarget: 18,
      classifiedTarget: count,
      eligibleForRemediation: count,
      noMembershipHistory: count,
      noProfileHistory: count,
      noAllocationHistory: count,
      usersWithActiveSession: 0,
      activeSessions: 0,
    },
    preconditions: evaluatePreconditions(classified, count),
  };
}

test('CLI requires a fixed as-of and accepts apply only as an explicit flag', () => {
  assert.deepEqual(parseArguments([`--as-of=${AS_OF.toISOString()}`]), {
    asOf: AS_OF,
    applyRequested: false,
  });
  assert.equal(
    parseArguments([`--as-of=${AS_OF.toISOString()}`, '--apply'])
      .applyRequested,
    true,
  );
  assert.throws(() => parseArguments([]), /missing_as_of/);
  assert.throws(() => parseArguments(['--apply']), /missing_as_of/);
  assert.throws(
    () =>
      parseArguments([
        `--as-of=${AS_OF.toISOString()}`,
        `--as-of=${AS_OF.toISOString()}`,
      ]),
    /duplicate_as_of/,
  );
  assert.throws(
    () =>
      parseArguments([`--as-of=${AS_OF.toISOString()}`, '--apply', '--apply']),
    /duplicate_apply/,
  );
  assert.throws(() => parseArguments(['--unknown']), /unknown_argument/);
});

test('apply gate requires both confirmations and forbids production', () => {
  assert.deepEqual(resolveApplyGate({ applyRequested: false, env: {} }), {
    allowed: true,
    apply: false,
    reason: 'dry_run_default',
  });
  for (const input of [
    { applyRequested: true, env: {} },
    { applyRequested: false, env: { [APPLY_ENVIRONMENT_KEY]: '1' } },
  ]) {
    assert.equal(resolveApplyGate(input).reason, 'dual_confirmation_required');
  }
  assert.equal(
    resolveApplyGate({
      applyRequested: true,
      env: { [APPLY_ENVIRONMENT_KEY]: '1' },
    }).apply,
    true,
  );
  assert.equal(
    resolveApplyGate({
      applyRequested: true,
      env: { [APPLY_ENVIRONMENT_KEY]: '1', NODE_ENV: 'production' },
    }).reason,
    'production_apply_forbidden',
  );
});

test('preconditions accept only the exact locked orphan baseline', () => {
  assert.equal(evaluatePreconditions(classification(), 18).ready, true);
  assert.equal(evaluatePreconditions(classification(), 17).ready, false);
  assert.equal(
    evaluatePreconditions(
      classification({
        sessionExposureCounts: {
          usersWithUnrevokedUnexpiredSession: 1,
          totalUnrevokedUnexpiredSessions: 1,
        },
      }),
      18,
    ).ready,
    false,
  );
  assert.equal(
    evaluatePreconditions(
      classification({
        exclusiveMembershipCohorts: { NO_MEMBERSHIP_HISTORY: 17 },
      }),
      18,
    ).ready,
    false,
  );
});

test('credential drift fails the protected precondition', () => {
  const value = classification();
  value.credentialStateCounts.hasPassword = 1;
  assert.equal(evaluatePreconditions(value, 18).ready, false);
});

test('candidate reads are bounded and require absence of every authorized relation', async () => {
  const calls = [];
  const rows = Array.from({ length: 18 }, (_, index) => ({
    id: `candidate-${String(index).padStart(2, '0')}`,
  }));
  const prisma = {
    user: {
      async findMany(args) {
        calls.push(args);
        if (args.cursor) return [];
        return rows;
      },
    },
  };
  const result = await readEligibleCandidates(prisma, AS_OF);
  assert.equal(result.length, 18);
  assert.equal(
    calls.every((call) => call.take <= 500),
    true,
  );
  assert.equal(
    calls.every((call) => call.orderBy.id === 'asc'),
    true,
  );
  const where = calls[0].where;
  assert.deepEqual(where.memberships, { none: {} });
  assert.deepEqual(where.teacherProfiles, { none: {} });
  assert.deepEqual(where.teacherSubjectAllocations, { none: {} });
  assert.deepEqual(where.sessions, {
    none: { revokedAt: null, expiresAt: { gt: AS_OF } },
  });
});

test('dry-run returns the plan and performs no mutation', async () => {
  const prisma = {
    user: {
      async updateMany() {
        throw new Error('mutation attempted');
      },
    },
  };
  const report = await runDryRun(prisma, AS_OF, {
    inspect: async () => readyInspection(),
  });
  assert.equal(report.ok, true);
  assert.equal(report.mode, 'dry_run');
  assert.equal(report.result.rowsUpdated, 0);
  assert.equal(report.mutationPlan.status, 'DISABLED');
  assert.deepEqual(report.mutationPlan.fields, ['status', 'deletedAt']);
});

test('dry-run fails closed when the exact count moves', async () => {
  const report = await runDryRun({}, AS_OF, {
    inspect: async () => readyInspection(17),
  });
  assert.equal(report.ok, false);
  assert.equal(report.error, 'remediation_precondition_failed');
  assert.equal(report.result.rowsUpdated, 0);
});

test('apply uses one Serializable transaction, one update, and one fixed timestamp', async () => {
  const updates = [];
  let transactionOptions;
  const candidateIds = readyInspection().candidateIds;
  const transaction = {
    user: {
      async updateMany(args) {
        updates.push(args);
        return { count: 18 };
      },
      async findMany(args) {
        if (args.cursor) return [];
        return candidateIds.map((id) => ({
          id,
          status: 'DISABLED',
          deletedAt: FIXED_DELETED_AT,
        }));
      },
    },
  };
  const prisma = {
    async $transaction(callback, options) {
      transactionOptions = options;
      return callback(transaction);
    },
  };
  const report = await runApply(prisma, AS_OF, {
    inspect: async () => readyInspection(),
    now: () => FIXED_DELETED_AT,
  });
  assert.equal(report.ok, true);
  assert.equal(report.result.rowsUpdated, 18);
  assert.equal(report.result.fixedDeletedAt, FIXED_DELETED_AT.toISOString());
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].data, {
    status: 'DISABLED',
    deletedAt: FIXED_DELETED_AT,
  });
  assert.equal(updates[0].where.userType, 'TEACHER');
  assert.equal(updates[0].where.status, 'ACTIVE');
  assert.equal(updates[0].where.deletedAt, null);
  assert.equal(transactionOptions.isolationLevel, 'Serializable');
});

test('apply precondition failure returns without an update', async () => {
  let updates = 0;
  const transaction = {
    user: {
      async updateMany() {
        updates += 1;
      },
    },
  };
  const report = await runApply(
    {
      async $transaction(callback) {
        return callback(transaction);
      },
    },
    AS_OF,
    { inspect: async () => readyInspection(17) },
  );
  assert.equal(report.ok, false);
  assert.equal(report.error, 'remediation_precondition_failed');
  assert.equal(updates, 0);
});

test('apply rolls back through failure when update count differs', async () => {
  const transaction = {
    user: {
      async updateMany() {
        return { count: 17 };
      },
    },
  };
  await assert.rejects(
    runApply(
      {
        async $transaction(callback) {
          return callback(transaction);
        },
      },
      AS_OF,
      { inspect: async () => readyInspection() },
    ),
    /update_count_mismatch/,
  );
});

test('mutation plan forbids every out-of-scope change', () => {
  assert.deepEqual(mutationPlan(), {
    model: 'User',
    fields: ['status', 'deletedAt'],
    status: 'DISABLED',
    hardDelete: false,
    changesUserType: false,
    createsTenantRelations: false,
    changesCredentials: false,
    changesAllocations: false,
    appliesTeacherProfileBackfill: false,
  });
});

test('public reports contain no candidate identifiers', () => {
  const report = remediationReport({
    mode: 'dry_run',
    asOf: AS_OF,
    ok: true,
    gate: 'dry_run_default',
    inspection: readyInspection(),
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('candidate-'), false);
  assert.equal(serialized.includes('candidateIds'), false);
});

test('CLI refuses apply without dual confirmation before constructing Prisma', async () => {
  let constructed = false;
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`, '--apply'], {
    env: {},
    createPrisma: () => {
      constructed = true;
    },
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 2);
  assert.equal(constructed, false);
  assert.equal(JSON.parse(output).error, 'dual_confirmation_required');
});

test('CLI dry-run success disconnects and exits zero', async () => {
  let disconnects = 0;
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`], {
    env: {},
    createPrisma: () => ({
      async $disconnect() {
        disconnects += 1;
      },
    }),
    runDryRun: async () =>
      remediationReport({
        mode: 'dry_run',
        asOf: AS_OF,
        ok: true,
        gate: 'dry_run_default',
        inspection: readyInspection(),
      }),
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(disconnects, 1);
  assert.equal(JSON.parse(output).ok, true);
});

test('CLI database failure is generic and disconnects', async () => {
  let disconnects = 0;
  let output = '';
  const exitCode = await runCli([`--as-of=${AS_OF.toISOString()}`], {
    env: {},
    createPrisma: () => ({
      async $disconnect() {
        disconnects += 1;
      },
    }),
    runDryRun: async () => {
      throw new Error('private infrastructure detail');
    },
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 1);
  assert.equal(disconnects, 1);
  assert.equal(JSON.parse(output).error, 'database_operation_failed');
  assert.equal(output.includes('private infrastructure detail'), false);
});

test('source mutates only User through updateMany', () => {
  const source = readFileSync(
    require.resolve('../remediate-orphan-teacher-identities-1b-0r.cjs'),
    'utf8',
  );
  assert.equal((source.match(/\.updateMany\s*\(/g) ?? []).length, 1);
  assert.equal(source.includes('transaction.user.updateMany'), true);
  for (const forbidden of [
    '.create(',
    '.createMany(',
    '.upsert(',
    '.delete(',
    '.deleteMany(',
    '$executeRaw',
    '$queryRaw',
    'passwordHash:',
    'credentialVersion:',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
