'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const {
  APPROVED_REBASELINE_BASE_COMMIT,
  APPROVED_REBASELINE_MIGRATION,
  APPROVED_REBASELINE_SAFETY_TAG,
  evaluateIncidentRebaselineAuthorization,
} = require('../check-migration-governance.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_PATH = path.join(
  REPOSITORY_ROOT,
  '.github',
  'workflows',
  'ci.yml',
);
const SHARD_RUNNER_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'ci',
  'run-ci-shard.cjs',
);

function approvedMigrationRecord(overrides = {}) {
  return {
    name: APPROVED_REBASELINE_MIGRATION,
    sqlExists: true,
    sqlNonEmpty: true,
    valid: true,
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateIncidentRebaselineAuthorization({
    baseCommit: APPROVED_REBASELINE_BASE_COMMIT,
    safetyTagCommit: APPROVED_REBASELINE_BASE_COMMIT,
    migrationRecords: [approvedMigrationRecord()],
    ...overrides,
  });
}

function problemCodes(result) {
  return result.problems.map((problem) => problem.code);
}

test('binds the one-time authorization to the published incident constants', () => {
  assert.equal(
    APPROVED_REBASELINE_BASE_COMMIT,
    '905d67c09c1da3299316dcd37c8480a3a983efb1',
  );
  assert.equal(
    APPROVED_REBASELINE_SAFETY_TAG,
    'migration-history-pre-rebaseline-20260710',
  );
  assert.equal(APPROVED_REBASELINE_MIGRATION, '20260710135222_baseline_v1');
});

test('approves only the exact base, safety tag target, and active baseline', () => {
  const result = evaluate();

  assert.equal(result.approved, true);
  assert.deepEqual(result.problems, []);
});

test('rejects a different legacy base commit', () => {
  const result = evaluate({
    baseCommit: '1111111111111111111111111111111111111111',
  });

  assert.equal(result.approved, false);
  assert.ok(problemCodes(result).includes('REBASELINE_BASE_COMMIT_MISMATCH'));
});

test('rejects a missing safety tag', () => {
  const result = evaluate({ safetyTagCommit: null });

  assert.equal(result.approved, false);
  assert.ok(problemCodes(result).includes('REBASELINE_SAFETY_TAG_MISMATCH'));
});

test('rejects a safety tag that targets a different commit', () => {
  const result = evaluate({
    safetyTagCommit: '2222222222222222222222222222222222222222',
  });

  assert.equal(result.approved, false);
  assert.ok(problemCodes(result).includes('REBASELINE_SAFETY_TAG_MISMATCH'));
});

test('rejects a different active baseline directory', () => {
  const result = evaluate({
    migrationRecords: [
      approvedMigrationRecord({ name: '20270101000000_baseline_v1' }),
    ],
  });

  assert.equal(result.approved, false);
  assert.ok(problemCodes(result).includes('REBASELINE_BASELINE_NAME_MISMATCH'));
});

test('rejects two active migration directories', () => {
  const result = evaluate({
    migrationRecords: [
      approvedMigrationRecord(),
      approvedMigrationRecord({ name: '20260710135223_extra' }),
    ],
  });

  assert.equal(result.approved, false);
  assert.ok(problemCodes(result).includes('REBASELINE_ACTIVE_SET_MISMATCH'));
});

test('rejects a missing or empty baseline migration.sql', () => {
  for (const migrationRecord of [
    approvedMigrationRecord({ sqlExists: false, sqlNonEmpty: false }),
    approvedMigrationRecord({ sqlExists: true, sqlNonEmpty: false }),
  ]) {
    const result = evaluate({ migrationRecords: [migrationRecord] });
    assert.equal(result.approved, false);
    assert.ok(problemCodes(result).includes('REBASELINE_BASELINE_SQL_INVALID'));
  }
});

test('central CI has no manual bypass and always runs strict authorization', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const shardRunner = fs.readFileSync(SHARD_RUNNER_PATH, 'utf8');

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /rebaseline_approved|inputs\./i);
  assert.match(
    workflow,
    /node scripts\/ci\/run-ci-shard\.cjs[\s\S]+--shard preflight/,
  );
  assert.doesNotMatch(
    `${workflow}\n${shardRunner}`,
    /MIGRATION_REBASELINE_APPROVED\s*:\s*['"]?1/i,
  );
  assert.equal(
    (
      shardRunner.match(/'scripts\/authorize-migration-rebaseline-0a\.cjs'/g) ??
      []
    ).length,
    1,
  );
  assert.match(
    shardRunner,
    /profile === 'migration-governance'[\s\S]+migration-rebaseline-authorization[\s\S]+'scripts\/authorize-migration-rebaseline-0a\.cjs'/,
  );
  assert.match(
    shardRunner,
    /current-governance[\s\S]+'scripts\/check-migration-governance\.cjs'/,
  );
});
