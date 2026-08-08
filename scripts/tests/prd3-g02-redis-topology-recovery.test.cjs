'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
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

test('Learning Media lifecycle fixture uses current isolated Redis test variables', () => {
  const workflow = read('.github/workflows/learning-media-integrity.yml');
  const lifecycleStep =
    /- name: BullMQ graceful shutdown and stalled-job recovery[\s\S]*?(?=\n      - name:)/u.exec(
      workflow,
    )?.[0] ?? '';

  assert.match(
    lifecycleStep,
    /TEST_QUEUE_REDIS_URL:\s*redis:\/\/127\.0\.0\.1:6379/u,
  );
  assert.match(
    lifecycleStep,
    /TEST_REALTIME_REDIS_URL:\s*redis:\/\/127\.0\.0\.1:6379/u,
  );
  assert.doesNotMatch(lifecycleStep, /^\s*TEST_REDIS_URL:/mu);
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
test('changed paths stay within the authorized G02 categories', () => {
  const changedPaths = command('git', ['status', '--short'])
    .stdout.split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'));
  const allowedExact = new Set([
    '.env.example',
    '.github/workflows/learning-content-integrity.yml',
    '.github/workflows/learning-media-integrity.yml',
    '.github/workflows/migration-integrity.yml',
    'package.json',
    'scripts/check-local-readiness.cjs',
    'scripts/prd1-g07-universal-regression.cjs',
    'src/app.module.ts',
  ]);
  const allowedPrefixes = [
    'adr/ADR-0008-',
    'docs/production-readiness/phase-0/03-',
    'docs/production-readiness/phase-0/05-',
    'docs/production-readiness/phase-3/05-',
    'scripts/ci/health-probe-runtime.sh',
    'scripts/ci/prd3-g01-b2-',
    'scripts/ci/prd3-g02-',
    'scripts/ci/prd3-g03-critical-queue-recovery.cjs',
    'scripts/tests/prd1-g07-',
    'scripts/tests/prd3-g01-b2-',
    'scripts/tests/prd3-g02-',
    'scripts/tests/prd3-g03-critical-queue-recovery.test.cjs',
    'src/config/',
    'src/infrastructure/push/firebase/tests/',
    'src/infrastructure/queue/',
    'src/infrastructure/realtime/',
    'src/modules/files/uploads/tests/',
    'src/runtime/',
    'test/integration/',
  ];
  const unexpected = changedPaths.filter(
    (changedPath) =>
      !allowedExact.has(changedPath) &&
      !allowedPrefixes.some((prefix) => changedPath.startsWith(prefix)),
  );

  assert.deepEqual(unexpected, []);
  assert.equal(
    changedPaths.some((changedPath) => changedPath === 'package-lock.json'),
    false,
  );
  assert.equal(
    changedPaths.some((changedPath) => changedPath.startsWith('prisma/')),
    false,
  );
});

test('added executable lines contain no shell escape or unsanitized secret URL', () => {
  const diffLines = command('git', [
    'diff',
    '--unified=0',
    '--',
    '*.ts',
    '*.cjs',
    '*.sh',
    '*.yml',
    '*.yaml',
  ]).stdout.split(/\r?\n/u);
  const addedLines = [];
  let currentPath = '';
  for (const line of diffLines) {
    const header = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (header) {
      currentPath = header[2];
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({ path: currentPath, value: line });
    }
  }
  const untrackedExecutables = command('git', ['status', '--short'])
    .stdout.split(/\r?\n/u)
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .filter((filePath) => /\.(?:ts|cjs|sh|ya?ml)$/u.test(filePath));
  for (const filePath of untrackedExecutables) {
    for (const value of read(filePath).split(/\r?\n/u)) {
      addedLines.push({ path: filePath, value });
    }
  }
  const nonTestLines = addedLines.filter(
    (line) =>
      !/\.spec\.ts$|^scripts\/tests\/|^test\/integration\//u.test(line.path),
  );

  assert.equal(
    addedLines.some((line) => /shell:\s*true/u.test(line.value)),
    false,
  );
  assert.equal(
    addedLines.some((line) => /process\.exit\(/u.test(line.value)),
    false,
  );
  assert.equal(
    nonTestLines.some((line) => /redis(?:s)?:\/\/[^\s@]+@/u.test(line.value)),
    false,
  );
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

  assert.match(adr, /## Status\s+Accepted/u);
  assert.match(adr, /Owner: Abdallah/u);
  assert.match(adr, /2026-08-06T05:56:00\+03:00/u);
  assert.match(register, /PRD0-Q012 \| APPROVED/u);
  assert.match(register, /PRD0-Q013 \| APPROVED/u);
  assert.match(
    matrix,
    /PRD3-G02[\s\S]*IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE/u,
  );
  assert.match(evidence, /EXPECTED_STEADY_QUEUE_REDIS_CONNECTIONS=36/u);
  assert.match(evidence, /QUEUE_RECOVERY_AND_OPERATIONS_RESERVE=4/u);
  assert.match(evidence, /MAX_QUEUE_REDIS_CONNECTIONS=36/u);
  assert.match(evidence, /MAX_REALTIME_REDIS_CONNECTIONS=14/u);
  assert.doesNotMatch(evidence, /32\/40/u);
  assert.match(evidence, /FINAL_QUEUE_REDIS_CONNECTIONS=0/u);
  assert.match(evidence, /FINAL_REALTIME_REDIS_CONNECTIONS=0/u);
});

function command(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    killSignal: 'SIGTERM',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`${executable}_contract_command_failed`);
  }
  return result;
}
