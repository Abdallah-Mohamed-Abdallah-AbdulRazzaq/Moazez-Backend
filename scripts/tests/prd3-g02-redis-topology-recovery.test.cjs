'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('application and runtime validators enforce the split Redis matrix', () => {
  const api = read('src/config/env.validation.ts');
  const runtime = read('src/runtime/runtime-env.validation.ts');
  const shared = read('src/config/redis-env.validation.ts');

  assert.match(api, /QUEUE_REDIS_URL:\s*redisUrlSchema/u);
  assert.match(api, /REALTIME_REDIS_URL:\s*redisUrlSchema/u);
  assert.match(api, /refineRedisEndpointSeparation/u);
  assert.match(runtime, /coreWorkerSchema/u);
  assert.match(runtime, /mediaWorkerSchema/u);
  assert.match(runtime, /maintenanceSchedulerSchema/u);
  assert.match(shared, /must use different Redis endpoints/u);
  assert.doesNotMatch(api, /\bREDIS_URL\b/u);
  assert.doesNotMatch(runtime, /\bREDIS_URL\b/u);
});

test('queue production separates bounded commands from Worker connections', () => {
  const source = read('src/infrastructure/queue/bullmq.service.ts');

  assert.match(source, /getOrThrow<string>\('QUEUE_REDIS_URL'\)/u);
  assert.doesNotMatch(source, /DATABASE_RUNTIME_ROLE/u);
  assert.match(
    source,
    /class BullmqCommandRedisClient[\s\S]*?enableOfflineQueue: false,[\s\S]*?autoResendUnfulfilledCommands: false,[\s\S]*?maxRetriesPerRequest: 0/u,
  );
  assert.match(
    source,
    /class BullmqWorkerRedisClient[\s\S]*?enableOfflineQueue: true,[\s\S]*?autoResendUnfulfilledCommands: true,[\s\S]*?maxRetriesPerRequest: null/u,
  );
  assert.match(source, /connection: this\.getWorkerConnection\(\)/u);
  assert.match(source, /skipWaitingForReady: true/u);
  assert.match(source, /maxRetriesPerRequest: null/u);
  assert.match(source, /queue_redis_unavailable/u);
  assert.doesNotMatch(source, /REALTIME_REDIS_URL/u);
  assert.doesNotMatch(source, /\bREDIS_URL\b/u);
});

test('realtime adapter, state, and emitter use only Realtime Redis', () => {
  const gateway = read('src/infrastructure/realtime/realtime.gateway.ts');
  const state = read(
    'src/infrastructure/realtime/realtime-state-store.service.ts',
  );
  const emitter = read(
    'src/infrastructure/realtime/realtime-emitter.module.ts',
  );

  for (const source of [gateway, state, emitter]) {
    assert.match(source, /REALTIME_REDIS_URL/u);
    assert.doesNotMatch(source, /QUEUE_REDIS_URL/u);
    assert.doesNotMatch(source, /\bREDIS_URL\b/u);
  }
  assert.match(state, /environment !== 'staging'/u);
  assert.match(state, /environment !== 'production'/u);
  assert.match(state, /realtime_state_redis_unavailable/u);
});

test('runtime role ownership stays at the completed Phase 2 graph', () => {
  const contract = read('src/runtime/runtime-role.module-contract.spec.ts');

  assert.match(
    contract,
    /intersection\(graph\.providers, CONSUMER_PROVIDER_NAMES\)\)\.toEqual\(\[\]\)/u,
  );
  assert.match(
    contract,
    /CORE_WORKER_ASSIGNED_CONSUMERS\)\.toHaveLength\(6\)/u,
  );
  assert.match(
    contract,
    /MEDIA_WORKER_ASSIGNED_CONSUMERS\)\.toEqual\(\['learning-media-cleanup'\]\)/u,
  );
  assert.match(contract, /registerRepeatJob\)\.toHaveBeenCalledTimes\(7\)/u);
});

test('real evidence harness locks two instances, budgets, outages, and cleanup', () => {
  const wrapper = read('scripts/ci/prd3-g02-redis-topology-recovery.cjs');
  const integration = read(
    'test/integration/prd3-g02-redis-topology-recovery.integration.spec.ts',
  );

  assert.match(wrapper, /--pull',\s*'never'/u);
  assert.match(wrapper, /127\.0\.0\.1:\$\{resource\.hostPort\}:6379/u);
  assert.match(wrapper, /--tmpfs/u);
  assert.match(wrapper, /assertContainerOwnership/u);
  assert.match(wrapper, /assertNetworkOwnership/u);
  assert.match(wrapper, /residualContainers/u);
  assert.match(
    wrapper,
    /resolveCiParentRunId\(\s*process\.env\.MOAZEZ_CI_PARENT_RUN_ID/u,
  );
  assert.match(wrapper, /const RUN_LABEL = 'com\.moazez\.evidence\.run'/u);
  assert.match(
    wrapper,
    /node_modules[\s\S]*?prisma[\s\S]*?build[\s\S]*?index\.js/u,
  );
  assert.match(
    wrapper,
    /spawnSync\(\s*process\.execPath,[\s\S]*?'generate'[\s\S]*?'--schema'[\s\S]*?schema\.prisma/u,
  );
  assert.match(wrapper, /timeout: PRISMA_GENERATE_TIMEOUT_MS/u);
  assert.match(wrapper, /maxBuffer: 8 \* 1024 \* 1024/u);
  assert.match(wrapper, /prd3_g02_prisma_client_generation_failed/u);
  assert.ok(
    wrapper.indexOf('generatePrismaClient(prismaGenerationDatabaseUrl)') <
      wrapper.indexOf('const testRun = spawnSync'),
  );
  assert.doesNotMatch(wrapper, /--forceExit/u);
  assert.match(integration, /EXPECTED_QUEUE_STEADY_MAXIMUM = 36/u);
  assert.match(integration, /EXPECTED_REALTIME_STEADY_MAXIMUM = 14/u);
  assert.match(integration, /QUEUE_GOVERNED_MAXIMUM = 40/u);
  assert.match(integration, /REALTIME_GOVERNED_MAXIMUM = 30/u);
  assert.match(integration, /fallbackSuccessCount/u);
  assert.match(integration, /failedProducerReplayCount/u);
  assert.match(integration, /apiProducerFailureMilliseconds/u);
  assert.match(integration, /coreProducerFailureMilliseconds/u);
  assert.match(integration, /mediaProducerFailureMilliseconds/u);
  assert.match(integration, /schedulerRegistrationFailureMilliseconds/u);
  assert.match(integration, /failedSchedulerRegistrationActiveDuringOutage/u);
  assert.match(integration, /failedSchedulerRegistrationDesiredDuringOutage/u);
  assert.match(integration, /failedSchedulerDesiredRegistrationRestored/u);
  assert.match(integration, /failedSchedulerRegistrationActiveCount/u);
  assert.match(integration, /failedSchedulerRegistrationDesiredCount/u);
  assert.match(integration, /recoveredSchedulerRegistrationActive/u);
  assert.match(integration, /getDesiredRepeatRegistrations/u);
  assert.match(
    integration,
    /expect\(failedSchedulerActiveRegistrations\)\.toHaveLength\(1\)/u,
  );
  assert.match(
    integration,
    /expect\(failedSchedulerDesiredRegistrations\)\.toHaveLength\(1\)/u,
  );
  assert.match(
    integration,
    /expect\(recoveredSchedulerRegistrations\)\.toHaveLength\(1\)/u,
  );
  assert.doesNotMatch(integration, /failedSchedulerRegistrationReplayed/u);
  assert.match(integration, /processInstancesReplaced: 0/u);
});

test('central CI service fixture uses current isolated Redis test variables', () => {
  const workflow = read('.github/workflows/ci.yml');
  const shardRunner = read('scripts/ci/run-ci-shard.cjs');
  const infrastructure =
    /async function startInfrastructure[\s\S]*?(?=\nasync function provisionBuckets)/u.exec(
      shardRunner,
    )?.[0] ?? '';

  assert.match(workflow, /node scripts\/ci\/run-ci-shard\.cjs/u);
  assert.match(infrastructure, /TEST_QUEUE_REDIS_URL:\s*redisUrl/u);
  assert.match(infrastructure, /TEST_REALTIME_REDIS_URL:\s*redisUrl/u);
  assert.match(infrastructure, /`redis:\/\/127\.0\.0\.1:\$\{redisPort\}\/0`/u);
  assert.doesNotMatch(infrastructure, /^\s*TEST_REDIS_URL:/mu);
});

test('legacy REDIS_URL has no executable fallback reference', () => {
  const allowed = new Set([
    'src/config/env.validation.spec.ts',
    'src/infrastructure/queue/bullmq.service.spec.ts',
    'src/infrastructure/realtime/tests/realtime.gateway-redis-lifecycle.spec.ts',
    'src/runtime/runtime-env.validation.spec.ts',
  ]);
  const excluded = 'scripts/tests/prd3-g02-redis-topology-recovery.test.cjs';

  function collectFiles(relativePath) {
    const absolutePath = path.join(ROOT, relativePath);
    const stat = fs.statSync(absolutePath);

    if (stat.isFile()) {
      return [relativePath.replaceAll('\\', '/')];
    }

    return fs
      .readdirSync(absolutePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .flatMap((entry) => collectFiles(path.join(relativePath, entry.name)));
  }

  const unexpected = ['src', 'scripts', 'test', '.github']
    .flatMap(collectFiles)
    .filter((relativePath) => relativePath !== excluded)
    .filter((relativePath) => /\bREDIS_URL\b/u.test(read(relativePath)))
    .filter((relativePath) => !allowed.has(relativePath))
    .sort();

  assert.deepEqual(unexpected, []);
});
test('accepted ADR and governance records carry exact owner authority', () => {
  const adr = read('adr/ADR-0008-redis-topology-and-recovery.md');
  const register = read(
    'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  );
  const matrix = read(
    'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  );
  const evidence = read(
    'docs/production-readiness/phase-3/05-redis-topology-and-recovery-evidence.md',
  );
  const closeout = read(
    'docs/production-readiness/phase-3/10-phase-3-closeout.md',
  );
  const certification = JSON.parse(
    read('docs/production-readiness/phase-3/phase-3-certification.json'),
  );

  assert.match(adr, /## Status\s+Accepted/u);
  assert.match(adr, /Owner: Abdallah/u);
  assert.match(adr, /2026-08-06T05:56:00\+03:00/u);
  assert.match(register, /PRD0-Q012 \| APPROVED/u);
  assert.match(register, /PRD0-Q013 \| APPROVED/u);
  assert.match(matrix, /\| PRD3-G02 \|[^\n]+\| COMPLETE \|/u);
  assert.equal((matrix.match(/^PRD3-G02=COMPLETE$/gmu) ?? []).length, 1);
  assert.doesNotMatch(matrix, /PRD3-G02=IMPLEMENTATION_COMPLETE_PENDING/u);
  assert.match(closeout, /^PRD3_G02: COMPLETE$/mu);
  assert.equal(certification.gateStatuses['PRD3-G02'], 'COMPLETE');
  assert.match(evidence, /EXPECTED_STEADY_QUEUE_REDIS_CONNECTIONS=36/u);
  assert.match(evidence, /QUEUE_RECOVERY_AND_OPERATIONS_RESERVE=4/u);
  assert.match(evidence, /MAX_QUEUE_REDIS_CONNECTIONS=36/u);
  assert.match(evidence, /MAX_REALTIME_REDIS_CONNECTIONS=14/u);
  assert.doesNotMatch(evidence, /32\/40/u);
  assert.match(evidence, /FINAL_QUEUE_REDIS_CONNECTIONS=0/u);
  assert.match(evidence, /FINAL_REALTIME_REDIS_CONNECTIONS=0/u);
});
