'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
  CleanupManager,
  DEFAULTS,
  STATUSES,
  buildStages,
  createBatchDatabaseName,
  createBatches,
  createFixture,
  deriveExitCode,
  executePlannedGate,
  redactJson,
  routeIntegrationFile,
  runCommand,
  runStageGraph,
} = require('../prd1-g07-universal-regression.cjs');
const { isExcluded } = require('../prd1-g07-container-entry.cjs');

test('a child-process failure produces a non-zero final exit', async () => {
  const child = await runCommand(process.execPath, ['-e', 'process.exit(7)'], {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    timeoutMs: 10_000,
  });
  const cleanup = new CleanupManager();
  const execution = await executePlannedGate({
    stages: [{ id: 'child', label: 'child' }],
    runStage: async () => child,
    cleanup,
  });
  assert.equal(execution.exitCode, 1);
  assert.equal(execution.results[0].status, STATUSES.FAIL);
  assert.equal(execution.results[0].exitCode, 7);
});

test('all successful stages produce exit zero', async () => {
  const cleanup = new CleanupManager();
  const execution = await executePlannedGate({
    stages: [{ id: 'one', label: 'one' }, { id: 'two', label: 'two' }],
    runStage: async () => ({ ok: true, exitCode: 0 }),
    cleanup,
  });
  assert.equal(execution.exitCode, 0);
  assert.ok(execution.results.every((result) => result.status === STATUSES.PASS));
});

test('a failed stage is never recorded as successful', async () => {
  const results = await runStageGraph(
    [{ id: 'bad', label: 'bad' }],
    async () => ({ ok: false, exitCode: 3 }),
  );
  assert.deepEqual(results.map((result) => result.status), [STATUSES.FAIL]);
  assert.equal(deriveExitCode(results), 1);
});

test('batches are deterministic and sorted', () => {
  assert.deepEqual(createBatches(['z.ts', 'a.ts', 'm.ts', 'b.ts'], 2), [
    ['a.ts', 'b.ts'],
    ['m.ts', 'z.ts'],
  ]);
});

test('special integration fixtures route to the required topology', () => {
  assert.equal(routeIntegrationFile('test/integration/school-email-delivery-job-id.integration.spec.ts'), 'g05-redis');
  assert.equal(routeIntegrationFile('test/integration/teacher-lifecycle-closeout.integration.spec.ts'), 'teacher-closeout');
  assert.equal(routeIntegrationFile('test/integration/teacher-reality-classifier-closeout.integration.spec.ts'), 'teacher-closeout');
  assert.equal(routeIntegrationFile('test/integration/membership-ended-at-constraint.integration.spec.ts'), 'teacher-closeout');
  assert.equal(routeIntegrationFile('test/integration/reinforcement-proof-persistence.integration.spec.ts'), 'g06');
  assert.equal(routeIntegrationFile('test/integration/learning-media-storage.integration.spec.ts'), 'general');
  const fixture = createFixture('abc-123');
  assert.match(fixture.databaseNames.g06, /^g06_[a-z0-9_]+$/u);
  assert.match(fixture.databaseNames.teacher, /^moazez_1b7_closeout_[a-z0-9_]+$/u);
  assert.match(new URL(fixture.environment.STORAGE_ENDPOINT).hostname, /^g06-[a-z0-9-]+-minio$/u);
  assert.equal(fixture.environment.RUN_PRD1_G05_REDIS_INTEGRATION, '1');
  assert.equal(fixture.environment.SEED_DEMO_DATA, 'true');
  assert.match(createBatchDatabaseName(fixture, 'security_1', 'general'), /^g07_[a-f0-9]+$/u);
  assert.match(createBatchDatabaseName(fixture, 'security_g06', 'g06'), /^g06_[a-f0-9]+$/u);
  assert.match(
    createBatchDatabaseName(fixture, 'integration_teacher', 'teacher'),
    /^moazez_1b7_closeout_[a-f0-9]+$/u,
  );
});

test('src integration specs use the default Jest project instead of the E2E config', () => {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const context = {
    repositoryRoot,
    config: DEFAULTS,
    fixture: createFixture('src-integration'),
  };
  const stages = buildStages(context);
  const stage = stages.find((candidate) => candidate.id === 'integration_src');
  assert.equal(stage.files.length, 4);
  assert.equal(stage.jest.config, undefined);
  assert.equal(context.inventory.integrationFiles, 27);
  assert.equal(context.inventory.integrationRoutes.src, 4);
});

test('cleanup runs once after success and is idempotent', async () => {
  let calls = 0;
  const cleanup = new CleanupManager();
  cleanup.add('fixture', async () => { calls += 1; });
  const execution = await executePlannedGate({
    stages: [{ id: 'ok', label: 'ok' }],
    runStage: async () => ({ ok: true, exitCode: 0 }),
    cleanup,
  });
  await cleanup.run();
  assert.equal(calls, 1);
  assert.equal(execution.results.at(-1).status, STATUSES.PASS);
});

test('cleanup runs after failure and cleanup failure makes the gate fail', async () => {
  let calls = 0;
  const cleanup = new CleanupManager();
  cleanup.add('fixture', async () => {
    calls += 1;
    throw new Error('cleanup failed');
  });
  const execution = await executePlannedGate({
    stages: [{ id: 'bad', label: 'bad' }],
    runStage: async () => ({ ok: false, exitCode: 2 }),
    cleanup,
  });
  assert.equal(calls, 1);
  assert.equal(execution.results.at(-1).status, STATUSES.FAIL);
  assert.equal(execution.exitCode, 1);
});

test('machine summary redacts credentials and fixture URLs', () => {
  const fixture = createFixture('redaction');
  const summary = redactJson({
    url: fixture.environment.DATABASE_URL,
    redis: fixture.environment.REDIS_URL,
    credential: fixture.storageSecretKey,
  }, fixture.sensitiveValues);
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /g07-ci-postgres-fixture-password|g07-ci-storage-fixture-secret|postgresql:\/\/|redis:\/\//u);
});

test('an independent later stage runs after failure while a dependent is BLOCKED', async () => {
  const visited = [];
  const results = await runStageGraph([
    { id: 'failed', label: 'failed' },
    { id: 'independent', label: 'independent' },
    { id: 'dependent', label: 'dependent', dependsOn: ['failed'] },
  ], async (stage) => {
    visited.push(stage.id);
    return { ok: stage.id !== 'failed', exitCode: stage.id === 'failed' ? 1 : 0 };
  });
  assert.deepEqual(visited, ['failed', 'independent']);
  assert.equal(results[1].status, STATUSES.PASS);
  assert.equal(results[2].status, STATUSES.BLOCKED);
  assert.deepEqual(results[2].blockedBy, ['failed']);
});

test('required FAIL or BLOCKED results cannot produce a false green', () => {
  assert.equal(deriveExitCode([{ status: STATUSES.PASS, required: true }]), 0);
  assert.equal(deriveExitCode([{ status: STATUSES.FAIL, required: true }]), 1);
  assert.equal(deriveExitCode([{ status: STATUSES.BLOCKED, required: true }]), 1);
});

test('container workspace excludes local env files', () => {
  assert.equal(isExcluded('.env'), true);
  assert.equal(isExcluded('.env.test.local'), true);
  assert.equal(isExcluded('.env.example'), false);
});
