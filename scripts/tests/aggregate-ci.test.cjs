'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  aggregateCi,
  buildSummaryMarkdown,
  calculateExecutionParity,
  classifyJobResult,
  validateExpectedPlanIdentity,
} = require('../ci/aggregate-ci.cjs');

const CANDIDATE = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function plan(overrides = {}) {
  return {
    schemaVersion: 1,
    candidateSha: CANDIDATE,
    baseSha: BASE,
    mergeBaseSha: BASE,
    categories: ['application'],
    requiredDomains: ['security'],
    inventory: { active: 2 },
    assignments: [
      { file: 'src/a.spec.ts', execution: 'pull-request', profile: 'unit' },
      {
        file: 'test/security/a.spec.ts',
        execution: 'pull-request',
        profile: 'security',
      },
    ],
    shards: [
      {
        id: 'unit-1-of-1',
        category: 'unit',
        profile: 'unit',
        index: 1,
        total: 1,
        files: ['src/a.spec.ts'],
      },
      {
        id: 'security-1-of-1',
        category: 'service',
        profile: 'security',
        index: 1,
        total: 1,
        files: ['test/security/a.spec.ts'],
      },
    ],
    ...overrides,
  };
}

function evidence(shard, overrides = {}) {
  return {
    schemaVersion: 1,
    candidateSha: CANDIDATE,
    baseSha: BASE,
    jobId: shard.id,
    category: shard.category,
    profile: shard.profile,
    shardIndex: shard.index,
    shardTotal: shard.total,
    testFiles: [...shard.files],
    executedTestFiles: [...shard.files],
    testFileCount: shard.files.length,
    testSuiteCount: null,
    testCount: null,
    skippedTestCount: null,
    startedAt: '2026-08-11T10:00:00.000Z',
    finishedAt: '2026-08-11T10:01:00.000Z',
    durationMs: 60_000,
    status: 'PASS',
    classification: null,
    cleanupStatus: 'PASS',
    ...overrides,
  };
}

function preflight(overrides = {}) {
  return evidence(
    {
      id: 'preflight',
      category: 'preflight',
      profile: 'preflight',
      index: 1,
      total: 1,
      files: [],
    },
    overrides,
  );
}

function passingFixture() {
  const ciPlan = plan();
  return {
    plan: ciPlan,
    needs: {
      plan: { result: 'success' },
      preflight: { result: 'success' },
      regression: { result: 'success' },
    },
    records: {
      preflight: preflight(),
      ...Object.fromEntries(
        ciPlan.shards.map((shard) => [shard.id, evidence(shard)]),
      ),
    },
    now: Date.parse('2026-08-11T10:02:00.000Z'),
  };
}

test('the aggregate passes only with successful upstreams, evidence, cleanup, and parity', () => {
  const summary = aggregateCi(passingFixture());
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.testsDiscovered, 2);
  assert.equal(summary.testsExecuted, 2);
  assert.deepEqual(summary.parity.missing, []);
  assert.deepEqual(summary.parity.duplicateAssignments, []);
  assert.deepEqual(summary.parity.unexpected, []);
  assert.equal(summary.cleanupStatus, 'PASS');
  assert.equal(summary.wallClockMs, 60_000);
});

test('a failed shard retains its stable classification and fails the aggregate', () => {
  const fixture = passingFixture();
  fixture.needs.regression.result = 'failure';
  fixture.records['security-1-of-1'] = evidence(fixture.plan.shards[1], {
    status: 'FAIL',
    classification: 'SOURCE_TEST_FAILURE',
  });
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.deepEqual(summary.failedShardIds, ['security-1-of-1']);
  assert.ok(summary.failureClassifications.includes('SOURCE_TEST_FAILURE'));
  assert.equal(summary.failureClassifications.includes('UNCLASSIFIED'), false);
});

test('a failed preflight blocks every unstarted shard without inventing artifact failures', () => {
  const fixture = passingFixture();
  fixture.needs.preflight.result = 'failure';
  fixture.needs.regression.result = 'skipped';
  fixture.records = {
    preflight: preflight({
      status: 'FAIL',
      classification: 'FIXTURE_CONTRACT_FAILURE',
    }),
  };
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.preflightStatus, 'FAIL');
  assert.deepEqual(summary.failedShardIds, []);
  assert.deepEqual(summary.blockedShardIds, ['security-1-of-1', 'unit-1-of-1']);
  assert.deepEqual(summary.failureClassifications, [
    'FIXTURE_CONTRACT_FAILURE',
  ]);
  assert.equal(summary.parity.status, 'BLOCKED');
  assert.equal(summary.cleanupStatus, 'PASS');
  assert.ok(
    Object.values(summary.shardStatus).every((status) => status === 'BLOCKED'),
  );
});

test('a failed plan blocks preflight and regression without blaming unstarted shards', () => {
  const fixture = passingFixture();
  fixture.needs.plan.result = 'failure';
  fixture.needs.preflight.result = 'skipped';
  fixture.needs.regression.result = 'skipped';
  fixture.records = {};
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.preflightStatus, 'BLOCKED');
  assert.deepEqual(summary.failedShardIds, []);
  assert.equal(summary.blockedShardIds.length, fixture.plan.shards.length);
  assert.equal(summary.cleanupStatus, 'NOT_REQUIRED');
  assert.equal(
    summary.failureClassifications.includes('ARTIFACT_FAILURE'),
    false,
  );
  assert.equal(
    summary.failureClassifications.includes('WORKFLOW_CONFIGURATION_FAILURE'),
    false,
  );
  assert.ok(summary.failureClassifications.includes('UNCLASSIFIED'));
});

test('a cancelled matrix keeps absent shards blocked while retaining cancellation evidence', () => {
  const fixture = passingFixture();
  fixture.needs.regression.result = 'cancelled';
  delete fixture.records['security-1-of-1'];
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.deepEqual(summary.failedShardIds, []);
  assert.deepEqual(summary.blockedShardIds, ['security-1-of-1']);
  assert.equal(summary.cleanupStatus, 'UNKNOWN');
  assert.ok(summary.failureClassifications.includes('UNCLASSIFIED'));
  assert.equal(
    summary.failureClassifications.includes('ARTIFACT_FAILURE'),
    false,
  );
});

test('an early shard failure does not misclassify its unexecuted files as an orchestrator defect', () => {
  const fixture = passingFixture();
  fixture.needs.regression.result = 'failure';
  fixture.records['security-1-of-1'] = evidence(fixture.plan.shards[1], {
    executedTestFiles: [],
    status: 'FAIL',
    classification: 'RUNNER_INFRA_FAILURE',
  });
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.parity.status, 'BLOCKED');
  assert.ok(summary.failureClassifications.includes('RUNNER_INFRA_FAILURE'));
  assert.equal(
    summary.failureClassifications.includes('CI_ORCHESTRATOR_FAILURE'),
    false,
  );
  assert.equal(summary.failureClassifications.includes('UNCLASSIFIED'), false);
});

test('missing evidence is an artifact failure and cannot become green', () => {
  const fixture = passingFixture();
  delete fixture.records['unit-1-of-1'];
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.ok(summary.failureClassifications.includes('ARTIFACT_FAILURE'));
  assert.deepEqual(summary.parity.missing, ['src/a.spec.ts']);
  assert.equal(summary.cleanupStatus, 'UNKNOWN');
});

test('missing every evidence record never reports cleanup as vacuously passing', () => {
  const fixture = passingFixture();
  fixture.records = {};
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.cleanupStatus, 'UNKNOWN');
  assert.ok(summary.failureClassifications.includes('ARTIFACT_FAILURE'));
});

test('unexpected cancellation is not guessed to be superseded or a flake', () => {
  const fixture = passingFixture();
  fixture.needs.regression.result = 'cancelled';
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.ok(summary.failureClassifications.includes('UNCLASSIFIED'));
  assert.equal(
    summary.failureClassifications.includes('CANCELLED_SUPERSEDED'),
    false,
  );
  assert.equal(summary.failureClassifications.includes('FLAKE'), false);
  assert.equal(
    classifyJobResult('cancelled', { superseded: true }),
    'CANCELLED_SUPERSEDED',
  );
});

test('an unexpected skipped upstream fails closed', () => {
  const fixture = passingFixture();
  fixture.needs.domainMedia = { result: 'skipped' };
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.ok(
    summary.failureClassifications.includes('WORKFLOW_CONFIGURATION_FAILURE'),
  );
});

test('a planner-declared not-applicable domain job may be skipped', () => {
  const fixture = passingFixture();
  fixture.plan.notApplicableJobs = ['domainMedia'];
  fixture.needs.domainMedia = { result: 'skipped' };
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'PASS');
});

test('cleanup failure is independently classified as teardown failure', () => {
  const fixture = passingFixture();
  fixture.records['unit-1-of-1'] = evidence(fixture.plan.shards[0], {
    status: 'FAIL',
    classification: 'TEARDOWN_FAILURE',
    cleanupStatus: 'FAIL',
  });
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.cleanupStatus, 'FAIL');
  assert.ok(summary.failureClassifications.includes('TEARDOWN_FAILURE'));
});

test('execution parity detects duplicates and unexpected files independently', () => {
  const ciPlan = plan();
  const parity = calculateExecutionParity(ciPlan, [
    {
      executedTestFiles: [
        'src/a.spec.ts',
        'src/a.spec.ts',
        'src/extra.spec.ts',
      ],
    },
    { executedTestFiles: ['test/security/a.spec.ts'] },
  ]);
  assert.deepEqual(parity.missing, []);
  assert.deepEqual(parity.duplicateAssignments, [
    { file: 'src/a.spec.ts', count: 2 },
  ]);
  assert.deepEqual(parity.unexpected, ['src/extra.spec.ts']);
});

test('candidate/base identity mismatch is an artifact failure', () => {
  const fixture = passingFixture();
  fixture.records['unit-1-of-1'] = evidence(fixture.plan.shards[0], {
    candidateSha: 'c'.repeat(40),
  });
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.ok(summary.failureClassifications.includes('ARTIFACT_FAILURE'));
});

test('malformed counts and timing can never produce a green aggregate', () => {
  for (const overrides of [
    { testFileCount: 0 },
    { testSuiteCount: undefined },
    { testCount: -1 },
    { skippedTestCount: 1.5 },
    { testCount: 1, skippedTestCount: 2 },
    { startedAt: 'not-a-timestamp' },
    { finishedAt: '2026-08-11T09:59:59.000Z' },
    { durationMs: 59_999 },
  ]) {
    const fixture = passingFixture();
    fixture.records['unit-1-of-1'] = evidence(
      fixture.plan.shards[0],
      overrides,
    );
    const summary = aggregateCi(fixture);
    assert.equal(summary.status, 'FAIL', JSON.stringify(overrides));
    assert.ok(
      summary.failureClassifications.includes('ARTIFACT_FAILURE'),
      JSON.stringify(overrides),
    );
  }

  const fixture = passingFixture();
  fixture.records.preflight = preflight({ durationMs: null });
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.ok(summary.failureClassifications.includes('ARTIFACT_FAILURE'));
});

test('PASS evidence rejects every contradictory failure marker', () => {
  for (const overrides of [
    { classification: 'SOURCE_TEST_FAILURE' },
    { timedOut: true },
    { failure: 'contradiction' },
    { primaryClassification: 'TIMEOUT' },
    { cleanupFailures: [] },
  ]) {
    const fixture = passingFixture();
    fixture.records['unit-1-of-1'] = evidence(
      fixture.plan.shards[0],
      overrides,
    );
    const summary = aggregateCi(fixture);
    assert.equal(summary.status, 'FAIL', JSON.stringify(overrides));
    assert.ok(
      summary.failureClassifications.includes('ARTIFACT_FAILURE'),
      JSON.stringify(overrides),
    );
  }

  const fixture = passingFixture();
  fixture.records.preflight = preflight({
    classification: 'SOURCE_TEST_FAILURE',
  });
  const summary = aggregateCi(fixture);
  assert.equal(summary.status, 'FAIL');
  assert.ok(summary.failureClassifications.includes('ARTIFACT_FAILURE'));
});

test('aggregate identity is independently bound to workflow candidate and base SHAs', () => {
  const ciPlan = plan();
  assert.doesNotThrow(() =>
    validateExpectedPlanIdentity(ciPlan, CANDIDATE, BASE),
  );
  assert.throws(
    () => validateExpectedPlanIdentity(ciPlan, 'c'.repeat(40), BASE),
    /candidate SHA differs/u,
  );
  assert.throws(
    () => validateExpectedPlanIdentity(ciPlan, CANDIDATE, 'd'.repeat(40)),
    /base SHA differs/u,
  );
  assert.throws(
    () => validateExpectedPlanIdentity(ciPlan, 'not-a-sha', BASE),
    /expected candidate SHA is invalid/u,
  );
});

test('the human summary contains the required decision fields without evidence secrets', () => {
  const summary = aggregateCi(passingFixture());
  const markdown = buildSummaryMarkdown(summary);
  assert.match(markdown, /CI \/ Required/u);
  assert.match(markdown, new RegExp(CANDIDATE, 'u'));
  assert.match(markdown, /Tests discovered\/executed: 2\/2/u);
  assert.match(markdown, /Shard outcomes: PASS=2, FAIL=0, BLOCKED=0/u);
  assert.match(markdown, /Cleanup: PASS/u);
  assert.doesNotMatch(markdown, /DATABASE_URL|JWT|redis:\/\//u);
});
