'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const BASELINE_SHA = 'd9cb589a49dfc920e2118feb618b2b9edac732b9';
const EXPECTED_BRANCH = 'chore/production-readiness-g07-universal-regression';
const MINIO_IMAGE = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const POSTGRES_IMAGE = 'postgres:16-alpine';
const REDIS_IMAGE = 'redis:7-alpine';
const STATUSES = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCKED' });
const DEFAULTS = Object.freeze({
  securityBatchSize: 3,
  e2eBatchSize: 5,
  integrationBatchSize: 5,
  nodeHeapMb: 1536,
  containerMemoryMb: 2304,
  stageTimeoutMs: 10 * 60 * 1000,
  unitTimeoutMs: 45 * 60 * 1000,
  imageBuildTimeoutMs: 30 * 60 * 1000,
});
const ALLOWED_SCOPE_PATHS = new Set([
  '.github/workflows/phase-1-universal-regression.yml',
  'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  'docs/production-readiness/phase-1/06-universal-regression-gate-closeout.md',
  'package.json',
  'scripts/prd1-g07-container-entry.cjs',
  'scripts/prd1-g07-universal-regression.cjs',
  'scripts/tests/prd1-g07-universal-regression.test.cjs',
  'test/e2e/communication-security-contract.e2e-spec.ts',
  'test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts',
  'test/e2e/dashboard-widgets-foundation.e2e-spec.ts',
]);

function normalizeRepositoryPath(value) {
  return value.split(path.sep).join('/');
}

function parsePositiveInteger(value, fallback, label) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function createBatches(files, batchSize) {
  const ordered = [...files].sort((left, right) => left.localeCompare(right));
  const batches = [];
  for (let index = 0; index < ordered.length; index += batchSize) {
    batches.push(ordered.slice(index, index + batchSize));
  }
  return batches;
}

function discoverTestFiles(repositoryRoot, relativeDirectory, pattern) {
  const directory = path.join(repositoryRoot, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  const pending = [directory];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      if (entry.isFile() && pattern.test(entry.name)) {
        files.push(normalizeRepositoryPath(path.relative(repositoryRoot, absolute)));
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function routeIntegrationFile(file) {
  const normalized = normalizeRepositoryPath(file);
  if (normalized.endsWith('/school-email-delivery-job-id.integration.spec.ts')) {
    return 'g05-redis';
  }
  if (
    /\/teacher-(?:lifecycle|reality-classifier)-closeout\.integration\.spec\.ts$/u.test(normalized)
    || normalized.endsWith('/membership-ended-at-constraint.integration.spec.ts')
  ) {
    return 'teacher-closeout';
  }
  if (/\/reinforcement-proof-(?:content-verifier|file\.repository|persistence)\.integration\.spec\.ts$/u.test(normalized)) {
    return 'g06';
  }
  return 'general';
}

function redactText(value, sensitiveValues = []) {
  let redacted = String(value ?? '');
  const values = [...new Set(sensitiveValues.filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (const sensitive of values) {
    redacted = redacted.split(sensitive).join('[REDACTED]');
  }
  redacted = redacted
    .replace(/\b(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s"'<>]+/giu, '[REDACTED_URL]')
    .replace(/\bhttps?:\/\/[^\s"'<>]*:[^\s"'<>]*@[^\s"'<>]+/giu, '[REDACTED_URL]');
  return redacted;
}

function redactJson(value, sensitiveValues = []) {
  return JSON.parse(redactText(JSON.stringify(value), sensitiveValues));
}

class CleanupManager {
  constructor() {
    this.actions = [];
    this.promise = null;
  }

  add(label, action) {
    this.actions.push({ label, action });
  }

  async run() {
    if (this.promise) return this.promise;
    this.promise = (async () => {
      const failures = [];
      for (const item of [...this.actions].reverse()) {
        try {
          await item.action();
        } catch (error) {
          failures.push({
            label: item.label,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { ok: failures.length === 0, failures };
    })();
    return this.promise;
  }
}

function deriveExitCode(results) {
  return results.some(
    (result) => result.required !== false && result.status !== STATUSES.PASS,
  ) ? 1 : 0;
}

async function runStageGraph(stages, runStage, options = {}) {
  const results = [];
  const byId = new Map();
  for (const stage of stages) {
    const blockedBy = (stage.dependsOn ?? []).filter(
      (dependency) => byId.get(dependency)?.status !== STATUSES.PASS,
    );
    if (blockedBy.length > 0 || options.isAborted?.()) {
      const result = {
        id: stage.id,
        label: stage.label,
        status: STATUSES.BLOCKED,
        required: stage.required !== false,
        blockedBy: blockedBy.length > 0 ? blockedBy : ['signal'],
        exitCode: null,
        durationMs: 0,
        files: stage.files ?? [],
      };
      results.push(result);
      byId.set(stage.id, result);
      options.onResult?.(result);
      continue;
    }

    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await runStage(stage);
    } catch (error) {
      outcome = {
        ok: false,
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const result = {
      id: stage.id,
      label: stage.label,
      status: outcome.ok ? STATUSES.PASS : STATUSES.FAIL,
      required: stage.required !== false,
      exitCode: outcome.exitCode ?? (outcome.ok ? 0 : 1),
      durationMs: Date.now() - startedAt,
      files: stage.files ?? [],
      counts: outcome.counts,
      error: outcome.error,
      timedOut: Boolean(outcome.timedOut),
    };
    results.push(result);
    byId.set(stage.id, result);
    options.onResult?.(result);
  }
  return results;
}

async function executePlannedGate({ stages, runStage, cleanup, isAborted, onResult }) {
  let results = [];
  try {
    results = await runStageGraph(stages, runStage, { isAborted, onResult });
  } finally {
    const startedAt = Date.now();
    const cleanupOutcome = await cleanup.run();
    const cleanupResult = {
      id: 'cleanup',
      label: 'Disposable Docker and temporary-file cleanup',
      status: cleanupOutcome.ok ? STATUSES.PASS : STATUSES.FAIL,
      required: true,
      exitCode: cleanupOutcome.ok ? 0 : 1,
      durationMs: Date.now() - startedAt,
      error: cleanupOutcome.ok ? undefined : JSON.stringify(cleanupOutcome.failures),
      files: [],
    };
    results.push(cleanupResult);
    onResult?.(cleanupResult);
  }
  return { results, exitCode: deriveExitCode(results) };
}

function createSuffix() {
  return `${Date.now().toString(36)}-${process.pid.toString(36)}-${randomBytes(3).toString('hex')}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, '-')
    .slice(0, 28);
}

function createSafeHostEnvironment(environment = process.env) {
  const allowedExact = new Set([
    'APPDATA', 'CI', 'ComSpec', 'HOME', 'LANG', 'LC_ALL', 'LOCALAPPDATA',
    'NODE_EXTRA_CA_CERTS', 'NPM_CONFIG_CACHE', 'PATH', 'PATHEXT', 'SystemDrive',
    'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'TZ', 'USERPROFILE', 'WINDIR',
  ]);
  const allowedPrefixes = ['DOCKER_', 'GITHUB_', 'RUNNER_'];
  const output = {};
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    if (allowedExact.has(key) || allowedPrefixes.some((prefix) => key.startsWith(prefix))) {
      output[key] = value;
    }
  }
  return output;
}

function createFixture(suffix) {
  const dbSuffix = suffix.replace(/-/gu, '_');
  const postgresHost = `g07-${suffix}-postgres`;
  const redisHost = `g07-${suffix}-redis`;
  const minioHost = `g06-${suffix}-minio`;
  const postgresUser = 'g07_ci';
  const postgresPassword = 'g07-ci-postgres-fixture-password';
  const storageAccessKey = 'g07-ci-storage-access';
  const storageSecretKey = 'g07-ci-storage-fixture-secret';
  const databaseNames = {
    general: `g07_${dbSuffix}`,
    g06: `g06_${dbSuffix}`,
    teacher: `moazez_1b7_closeout_${dbSuffix}`,
  };
  const databaseUrl = (databaseName) =>
    `postgresql://${postgresUser}:${postgresPassword}@${postgresHost}:5432/${databaseName}?schema=public`;
  const redisUrl = `redis://${redisHost}:6379/0`;
  const storageEndpoint = `http://${minioHost}:9000`;
  const environment = {
    NODE_ENV: 'test',
    APP_PORT: '3000',
    APP_PROBE_PORT: '9090',
    APP_URL: 'http://127.0.0.1:3000',
    SWAGGER_ENABLED: 'false',
    DATABASE_URL: databaseUrl(databaseNames.general),
    REDIS_URL: redisUrl,
    TEST_REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: 'g07-ci-access-token-secret-not-production',
    JWT_REFRESH_SECRET: 'g07-ci-refresh-token-secret-not-production',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    SETTINGS_SECRET_ENCRYPTION_KEY:
      'hex:0000000000000000000000000000000000000000000000000000000000000000',
    STORAGE_PROVIDER: 'minio',
    STORAGE_ENDPOINT: storageEndpoint,
    STORAGE_ACCESS_KEY: storageAccessKey,
    STORAGE_SECRET_KEY: storageSecretKey,
    STORAGE_BUCKET: `g07-${suffix}-private`.slice(0, 63),
    STORAGE_PUBLIC_BUCKET: `g07-${suffix}-public`.slice(0, 63),
    STORAGE_CORS_ORIGINS: 'http://127.0.0.1:3001',
    FFPROBE_PATH: '/usr/bin/ffprobe',
    FFPROBE_TIMEOUT_MS: '15000',
    FFPROBE_MAX_OUTPUT_BYTES: '1048576',
    MEDIA_VERIFICATION_VERSION: 'ffprobe-5.1.9-debian12-learning-media-v1',
    MEDIA_RUNTIME_ENFORCE_IN_TEST: 'false',
    FCM_ENABLED: 'false',
    FCM_DRY_RUN: 'true',
    SEED_DEMO_DATA: 'true',
    LOG_LEVEL: 'error',
    RUN_PRD1_G05_REDIS_INTEGRATION: '1',
    PRD1_G05_REDIS_URL: `redis://${redisHost}:6379/15`,
  };
  return {
    suffix,
    network: `moazez-g07-${suffix}`,
    image: `moazez-g07-test:${suffix}`,
    containers: {
      postgres: postgresHost,
      redis: redisHost,
      minio: minioHost,
    },
    postgresUser,
    postgresPassword,
    storageAccessKey,
    storageSecretKey,
    databaseNames,
    databaseUrl,
    environment,
    sensitiveValues: [
      postgresPassword,
      storageAccessKey,
      storageSecretKey,
      environment.JWT_ACCESS_SECRET,
      environment.JWT_REFRESH_SECRET,
      environment.SETTINGS_SECRET_ENCRYPTION_KEY,
      databaseUrl(databaseNames.general),
      databaseUrl(databaseNames.g06),
      databaseUrl(databaseNames.teacher),
      redisUrl,
      environment.PRD1_G05_REDIS_URL,
      storageEndpoint,
    ],
  };
}

function createBatchDatabaseName(fixture, stageId, databaseKind = 'general') {
  const digest = createHash('sha256')
    .update(`${fixture.suffix}:${databaseKind}:${stageId}`)
    .digest('hex')
    .slice(0, 20);
  if (databaseKind === 'g06') return `g06_${digest}`;
  if (databaseKind === 'teacher') return `moazez_1b7_closeout_${digest}`;
  return `g07_${digest}`;
}

function makeLineWriter(target, sensitiveValues, capture) {
  let pending = '';
  return {
    write(chunk) {
      pending += chunk.toString('utf8');
      const lines = pending.split(/(?<=\n)/u);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        capture.push(line);
        target.write(redactText(line, sensitiveValues));
      }
    },
    flush() {
      if (pending) {
        capture.push(pending);
        target.write(redactText(pending, sensitiveValues));
        pending = '';
      }
    },
  };
}

async function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.stageTimeoutMs;
  const stdoutCaptured = [];
  const stderrCaptured = [];
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  options.onSpawn?.(child);
  const stdout = makeLineWriter(process.stdout, options.sensitiveValues ?? [], stdoutCaptured);
  const stderr = makeLineWriter(process.stderr, options.sensitiveValues ?? [], stderrCaptured);
  child.stdout.on('data', (chunk) => stdout.write(chunk));
  child.stderr.on('data', (chunk) => stderr.write(chunk));

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    options.onTimeout?.(child);
    if (!child.killed) child.kill('SIGTERM');
  }, timeoutMs);
  timer.unref();

  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: 1, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal, error: null }));
  });
  clearTimeout(timer);
  stdout.flush();
  stderr.flush();
  options.onExit?.(child);
  const stdoutOutput = stdoutCaptured.join('');
  const stderrOutput = stderrCaptured.join('');
  const combinedOutput = `${stdoutOutput}${stderrOutput}`;
  const openHandleWarning = /Jest did not exit one second after the test run has completed/iu.test(combinedOutput);
  const exitCode = result.code ?? (result.signal ? 1 : 0);
  return {
    ok: exitCode === 0 && !timedOut && !openHandleWarning,
    exitCode: exitCode === 0 && openHandleWarning ? 1 : exitCode,
    signal: result.signal,
    timedOut,
    openHandleWarning,
    error: result.error?.message,
    output: combinedOutput,
    stdout: stdoutOutput,
    stderr: stderrOutput,
  };
}

function dockerArgsForEnvironment(environment) {
  return Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
}

function containerCommand(context, commandArgs, options = {}) {
  const runName = `g07-${context.fixture.suffix}-run-${++context.runCounter}`;
  const args = [
    'run', '--rm', '--name', runName,
    '--network', options.network === false ? 'none' : context.fixture.network,
    '--memory', `${context.config.containerMemoryMb}m`,
    '--memory-swap', `${context.config.containerMemoryMb}m`,
    '--user', 'root',
    '--mount', `type=bind,source=${context.repositoryRoot},target=/workspace-source,readonly`,
    '--mount', `type=bind,source=${context.outputDirectory},target=/g07-output`,
    '--tmpfs', '/workspace:rw,exec,nosuid,mode=1777,size=805306368',
    ...dockerArgsForEnvironment({ ...context.fixture.environment, ...(options.environment ?? {}) }),
    '--env', 'NODE_PATH=/app/node_modules',
    context.fixture.image,
    'node', '/workspace-source/scripts/prd1-g07-container-entry.cjs', '--',
    ...commandArgs,
  ];
  return { runName, args };
}

async function runContainer(context, commandArgs, options = {}) {
  const invocation = containerCommand(context, commandArgs, options);
  const result = await runCommand('docker', invocation.args, {
    cwd: context.repositoryRoot,
    env: context.hostEnvironment,
    timeoutMs: options.timeoutMs,
    sensitiveValues: context.fixture.sensitiveValues,
    onSpawn: (child) => {
      context.currentChild = child;
      context.currentRunContainer = invocation.runName;
    },
    onTimeout: () => {
      void runCommand('docker', ['rm', '--force', invocation.runName], {
        cwd: context.repositoryRoot,
        env: context.hostEnvironment,
        timeoutMs: 30_000,
        sensitiveValues: context.fixture.sensitiveValues,
      });
    },
    onExit: () => {
      context.currentChild = null;
      context.currentRunContainer = null;
    },
  });
  return result;
}

async function runDocker(context, args, timeoutMs = DEFAULTS.stageTimeoutMs) {
  return runCommand('docker', args, {
    cwd: context.repositoryRoot,
    env: context.hostEnvironment,
    timeoutMs,
    sensitiveValues: context.fixture.sensitiveValues,
    onSpawn: (child) => { context.currentChild = child; },
    onExit: () => { context.currentChild = null; },
  });
}

async function buildPreparedTestImage(context, timeoutMs) {
  const built = await runDocker(context, [
    'build', '--target', 'media-test', '--tag', context.fixture.image, '.',
  ], timeoutMs);
  if (!built.ok) return built;
  context.cleanup.add('temporary G07 test image', () =>
    removeDockerResource(context, 'image', context.fixture.image));

  const preparationContainer = `g07-${context.fixture.suffix}-image-prep`;
  context.cleanup.add('test-image preparation container', () =>
    removeDockerResource(context, 'container', preparationContainer));
  const created = await runDocker(context, [
    'create', '--name', preparationContainer, '--network', 'none', '--user', 'root',
    '--env', 'DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build',
    context.fixture.image,
    'node', '/app/node_modules/prisma/build/index.js', 'generate',
    '--schema', '/app/prisma/schema.prisma',
  ], 60_000);
  if (!created.ok) return created;
  const started = await runDocker(
    context,
    ['start', '--attach', preparationContainer],
    5 * 60 * 1000,
  );
  if (!started.ok) return started;
  const committed = await runDocker(
    context,
    ['commit', preparationContainer, context.fixture.image],
    5 * 60 * 1000,
  );
  if (!committed.ok) return committed;
  const removed = await runDocker(
    context,
    ['rm', '--force', preparationContainer],
    60_000,
  );
  return removed.ok ? { ok: true, exitCode: 0 } : removed;
}

async function waitForHealthy(context, containerName, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await runCommand('docker', [
      'inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', containerName,
    ], {
      cwd: context.repositoryRoot,
      env: context.hostEnvironment,
      timeoutMs: 10_000,
      sensitiveValues: context.fixture.sensitiveValues,
    });
    if (result.ok && /healthy|running/u.test(result.output.trim())) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${containerName} did not become healthy`);
}

async function removeDockerResource(context, kind, name) {
  const inspectType = kind === 'image' ? 'image' : kind === 'network' ? 'network' : 'container';
  const removeArgs = kind === 'image'
    ? ['image', 'rm', '--force', name]
    : kind === 'network'
      ? ['network', 'rm', name]
      : ['rm', '--force', name];
  await runCommand('docker', removeArgs, {
    cwd: context.repositoryRoot,
    env: context.hostEnvironment,
    timeoutMs: 60_000,
    sensitiveValues: context.fixture.sensitiveValues,
  });
  const inspection = await runCommand('docker', [inspectType, 'inspect', name], {
    cwd: context.repositoryRoot,
    env: context.hostEnvironment,
    timeoutMs: 15_000,
    sensitiveValues: context.fixture.sensitiveValues,
  });
  if (inspection.ok) throw new Error(`${kind} cleanup verification failed: ${name}`);
}

async function startInfrastructure(context) {
  const fixture = context.fixture;
  const network = await runDocker(context, ['network', 'create', '--internal', fixture.network]);
  if (!network.ok) return network;
  context.cleanup.add('docker network', () => removeDockerResource(context, 'network', fixture.network));

  const postgres = await runDocker(context, [
    'run', '--detach', '--rm', '--name', fixture.containers.postgres,
    '--network', fixture.network, '--network-alias', fixture.containers.postgres,
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=1073741824',
    '--env', `POSTGRES_USER=${fixture.postgresUser}`,
    '--env', `POSTGRES_PASSWORD=${fixture.postgresPassword}`,
    '--env', `POSTGRES_DB=${fixture.databaseNames.general}`,
    '--health-cmd', `pg_isready -U ${fixture.postgresUser} -d ${fixture.databaseNames.general}`,
    '--health-interval', '2s', '--health-timeout', '3s', '--health-retries', '30',
    POSTGRES_IMAGE,
  ]);
  if (!postgres.ok) return postgres;
  context.cleanup.add('postgres container', () => removeDockerResource(context, 'container', fixture.containers.postgres));

  const redis = await runDocker(context, [
    'run', '--detach', '--rm', '--name', fixture.containers.redis,
    '--network', fixture.network, '--network-alias', fixture.containers.redis,
    '--tmpfs', '/data:rw,noexec,nosuid,size=268435456',
    '--health-cmd', 'redis-cli ping', '--health-interval', '2s',
    '--health-timeout', '3s', '--health-retries', '30', REDIS_IMAGE,
  ]);
  if (!redis.ok) return redis;
  context.cleanup.add('redis container', () => removeDockerResource(context, 'container', fixture.containers.redis));

  const minio = await runDocker(context, [
    'run', '--detach', '--rm', '--name', fixture.containers.minio,
    '--network', fixture.network, '--network-alias', fixture.containers.minio,
    '--tmpfs', '/data:rw,noexec,nosuid,size=536870912',
    '--env', `MINIO_ROOT_USER=${fixture.storageAccessKey}`,
    '--env', `MINIO_ROOT_PASSWORD=${fixture.storageSecretKey}`,
    '--env', 'MINIO_API_CORS_ALLOW_ORIGIN=http://127.0.0.1:3001',
    MINIO_IMAGE, 'server', '/data',
  ]);
  if (!minio.ok) return minio;
  context.cleanup.add('minio container', () => removeDockerResource(context, 'container', fixture.containers.minio));

  await Promise.all([
    waitForHealthy(context, fixture.containers.postgres),
    waitForHealthy(context, fixture.containers.redis),
    waitForHealthy(context, fixture.containers.minio),
  ]);

  for (const databaseName of [fixture.databaseNames.g06, fixture.databaseNames.teacher]) {
    const created = await runDocker(context, [
      'exec', fixture.containers.postgres, 'createdb', '-U', fixture.postgresUser, databaseName,
    ]);
    if (!created.ok) return created;
  }

  let buckets = { ok: false, exitCode: 1 };
  for (let attempt = 0; attempt < 30; attempt += 1) {
    buckets = await runContainer(context, [
      'node', 'scripts/prd1-g07-universal-regression.cjs', '--internal', 'provision-minio',
    ]);
    if (buckets.ok) return buckets;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return buckets;
}

async function resetRedis(context) {
  return runDocker(context, ['exec', context.fixture.containers.redis, 'redis-cli', 'FLUSHALL'], 30_000);
}

async function provisionBatchDatabase(context, stage) {
  const databaseName = createBatchDatabaseName(
    context.fixture,
    stage.id,
    stage.databaseKind,
  );
  const databaseUrl = context.fixture.databaseUrl(databaseName);
  context.fixture.sensitiveValues.push(databaseUrl);
  const created = await runDocker(context, [
    'exec', context.fixture.containers.postgres,
    'createdb', '-U', context.fixture.postgresUser, databaseName,
  ]);
  if (!created.ok) return { ...created, databaseName, databaseUrl };

  const migrated = await runContainer(context, prismaArgs('migrate', [
    'deploy', '--schema', 'prisma/schema.prisma',
  ]), {
    environment: { DATABASE_URL: databaseUrl },
    timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
  });
  if (!migrated.ok) return { ...migrated, databaseName, databaseUrl };

  const seeded = await runContainer(context, [
    'node', '--max-old-space-size=1024', '--require', 'ts-node/register',
    'prisma/seeds/index.ts',
  ], {
    environment: { DATABASE_URL: databaseUrl, SEED_DEMO_DATA: 'true' },
    timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
  });
  return { ...seeded, databaseName, databaseUrl };
}

async function dropBatchDatabase(context, databaseName) {
  return runDocker(context, [
    'exec', context.fixture.containers.postgres,
    'dropdb', '--if-exists', '--force', '-U', context.fixture.postgresUser, databaseName,
  ], 60_000);
}

function prismaArgs(command, extra = []) {
  return ['node', '--max-old-space-size=1024', 'node_modules/prisma/build/index.js', command, ...extra];
}

function nodeArgs(context, script, extra = [], heapMb = context.config.nodeHeapMb) {
  return ['node', `--max-old-space-size=${heapMb}`, script, ...extra];
}

function jestArgs(context, files, options = {}) {
  const outputName = `${options.resultId}.json`;
  const args = [
    'node', `--max-old-space-size=${options.heapMb ?? context.config.nodeHeapMb}`,
    'node_modules/jest/bin/jest.js',
  ];
  if (options.config) args.push('--config', options.config);
  args.push('--runInBand', '--json', `--outputFile=/g07-output/${outputName}`);
  if (files?.length) args.push('--runTestsByPath', ...files);
  return { args, outputName };
}

async function readJestCounts(context, outputName) {
  const outputPath = path.join(context.outputDirectory, outputName);
  try {
    const parsed = JSON.parse(await fsp.readFile(outputPath, 'utf8'));
    return {
      suites: parsed.numTotalTestSuites,
      passedSuites: parsed.numPassedTestSuites,
      failedSuites: parsed.numFailedTestSuites,
      tests: parsed.numTotalTests,
      passedTests: parsed.numPassedTests,
      failedTests: parsed.numFailedTests,
      skippedTests: parsed.numPendingTests,
    };
  } catch {
    return undefined;
  }
}

async function runJestStage(context, stage) {
  let database;
  if (stage.freshDatabase) {
    database = await provisionBatchDatabase(context, stage);
    if (!database.ok) {
      if (database.databaseName) await dropBatchDatabase(context, database.databaseName);
      return { ...database, error: 'Fresh batch database provisioning failed' };
    }
  }
  const reset = await resetRedis(context);
  if (!reset.ok) {
    if (database?.databaseName) await dropBatchDatabase(context, database.databaseName);
    return { ...reset, error: 'Redis reset failed before batch' };
  }
  const invocation = jestArgs(context, stage.files, stage.jest);
  let result;
  let databaseCleanup;
  try {
    result = await runContainer(context, invocation.args, {
      environment: {
        ...stage.environment,
        ...(database ? { DATABASE_URL: database.databaseUrl } : {}),
      },
      timeoutMs: stage.timeoutMs,
    });
  } finally {
    if (database?.databaseName) {
      databaseCleanup = await dropBatchDatabase(context, database.databaseName);
    }
  }
  const counts = await readJestCounts(context, invocation.outputName);
  const skipped = counts?.skippedTests ?? 0;
  const cleanupFailed = databaseCleanup && !databaseCleanup.ok;
  return {
    ...result,
    ok: result.ok && skipped === 0 && !cleanupFailed,
    exitCode: result.ok && (skipped > 0 || cleanupFailed) ? 1 : result.exitCode,
    counts,
    error: cleanupFailed
      ? 'Fresh batch database cleanup failed'
      : skipped > 0
        ? `${skipped} unexplained skipped tests`
        : result.error,
  };
}

function buildStages(context) {
  const securityFiles = discoverTestFiles(context.repositoryRoot, 'test/security', /\.spec\.ts$/u);
  const g06Security = securityFiles.filter((file) => file.endsWith('tenancy.reinforcement-proof-mime.spec.ts'));
  const generalSecurity = securityFiles.filter((file) => !g06Security.includes(file));
  const e2eFiles = discoverTestFiles(context.repositoryRoot, 'test/e2e', /\.e2e-spec\.ts$/u);
  const testIntegrations = discoverTestFiles(context.repositoryRoot, 'test/integration', /(?:\.integration\.spec|\.spec)\.ts$/u);
  const srcIntegrations = discoverTestFiles(context.repositoryRoot, 'src', /\.integration\.spec\.ts$/u);
  const integrationGroups = {
    general: [],
    src: srcIntegrations,
    g06: [],
    'teacher-closeout': [],
    'g05-redis': [],
  };
  for (const file of testIntegrations) {
    integrationGroups[routeIntegrationFile(file)].push(file);
  }

  const stages = [
    { id: 'orchestrator_tests', label: 'G07 orchestrator contract tests', runner: 'host-node-test', files: ['scripts/tests/prd1-g07-universal-regression.test.cjs'] },
    { id: 'scope', label: 'Baseline, worktree, scope, and tracked-env checks', runner: 'scope' },
    { id: 'diff_check', label: 'Git whitespace integrity', runner: 'git-diff-check' },
    { id: 'migration_governance', label: 'Migration governance check', runner: 'host-node', script: 'scripts/check-migration-governance.cjs' },
    { id: 'image', label: 'Node 22.23.1 media-test image build', runner: 'image-build', timeoutMs: context.config.imageBuildTimeoutMs },
    { id: 'runtime_identity', label: 'Exact Node and Firebase Admin runtime identity', runner: 'container-command', dependsOn: ['image'], command: ['node', '-e', "if(process.version!=='v22.23.1')process.exit(1);require('firebase-admin/app');require('firebase-admin/messaging')"], network: false },
    { id: 'runtime_policy', label: 'Runtime policy verification', runner: 'container-command', dependsOn: ['image'], command: nodeArgs(context, 'scripts/verify-runtime-policy.cjs'), network: false },
    { id: 'runtime_policy_tests', label: 'Runtime policy tests', runner: 'container-command', dependsOn: ['image'], command: ['node', '--test', 'scripts/tests/verify-runtime-policy.test.cjs'], network: false },
    { id: 'infra', label: 'Disposable PostgreSQL, Redis, MinIO, and isolated network', runner: 'infra', dependsOn: ['image'] },
    { id: 'prisma_validate', label: 'Prisma schema validation', runner: 'container-command', dependsOn: ['image'], command: prismaArgs('validate', ['--schema', 'prisma/schema.prisma']), network: false },
    { id: 'prisma_generate', label: 'Prisma Client generation', runner: 'container-command', dependsOn: ['image', 'prisma_validate'], command: prismaArgs('generate', ['--schema', 'prisma/schema.prisma']), network: false },
    { id: 'build', label: 'Nest application build', runner: 'container-command', dependsOn: ['image', 'prisma_generate'], command: nodeArgs(context, 'node_modules/@nestjs/cli/bin/nest.js', ['build'], 2048), network: false },
    { id: 'migration_tests', label: 'Migration governance tests', runner: 'host-node-test', files: ['scripts/tests/check-migration-governance.test.cjs', 'scripts/tests/migration-rebaseline-authorization.test.cjs'] },
    { id: 'migrate_general', label: 'Fresh migration replay: G07 general database', runner: 'prisma-db', dependsOn: ['infra', 'migration_governance', 'prisma_validate'], database: 'general', command: 'migrate', args: ['deploy'] },
    { id: 'migrate_g06', label: 'Fresh migration replay: G06 database', runner: 'prisma-db', dependsOn: ['infra', 'migration_governance', 'prisma_validate'], database: 'g06', command: 'migrate', args: ['deploy'] },
    { id: 'migrate_teacher', label: 'Fresh migration replay: Teacher closeout database', runner: 'prisma-db', dependsOn: ['infra', 'migration_governance', 'prisma_validate'], database: 'teacher', command: 'migrate', args: ['deploy'] },
    { id: 'migration_status', label: 'Prisma migration status', runner: 'prisma-db', dependsOn: ['migrate_general'], database: 'general', command: 'migrate', args: ['status'] },
    { id: 'migration_noop', label: 'Second migration deploy no-op proof', runner: 'prisma-db', dependsOn: ['migrate_general'], database: 'general', command: 'migrate', args: ['deploy'] },
    { id: 'seed_general', label: 'Seed G07 general database', runner: 'seed', dependsOn: ['migrate_general', 'prisma_generate'], database: 'general' },
    { id: 'seed_g06', label: 'Seed G06 database', runner: 'seed', dependsOn: ['migrate_g06', 'prisma_generate'], database: 'g06' },
    { id: 'seed_teacher', label: 'Seed Teacher closeout database', runner: 'seed', dependsOn: ['migrate_teacher', 'prisma_generate'], database: 'teacher' },
    { id: 'media_runtime', label: 'Pinned ffprobe media runtime verification', runner: 'container-command', dependsOn: ['image'], command: nodeArgs(context, 'scripts/verify-media-runtime.cjs'), network: false, timeoutMs: context.config.stageTimeoutMs },
    { id: 'unit', label: 'Complete unit regression', runner: 'jest', dependsOn: ['seed_general', 'build'], files: [], jest: { resultId: 'unit', heapMb: 2048 }, timeoutMs: context.config.unitTimeoutMs },
  ];

  createBatches(generalSecurity, context.config.securityBatchSize).forEach((files, index) => {
    stages.push({
      id: `security_${index + 1}`, label: `Security batch ${index + 1}`, runner: 'jest',
      dependsOn: ['seed_general', 'build'], files, freshDatabase: true, databaseKind: 'general',
      jest: { resultId: `security-${index + 1}`, config: 'test/jest-e2e.json' },
      timeoutMs: context.config.stageTimeoutMs,
    });
  });
  stages.push({
    id: 'security_g06', label: 'G06 MIME security fixture', runner: 'jest',
    dependsOn: ['seed_g06', 'build'], files: g06Security,
    freshDatabase: true, databaseKind: 'g06',
    jest: { resultId: 'security-g06', config: 'test/jest-e2e.json' },
    timeoutMs: context.config.stageTimeoutMs,
  });

  createBatches(e2eFiles, context.config.e2eBatchSize).forEach((files, index) => {
    stages.push({
      id: `e2e_${index + 1}`, label: `E2E batch ${index + 1}`, runner: 'jest',
      dependsOn: ['seed_general', 'build'], files, freshDatabase: true, databaseKind: 'general',
      jest: { resultId: `e2e-${index + 1}`, config: 'test/jest-e2e.json' },
      timeoutMs: context.config.stageTimeoutMs,
    });
  });
  stages.push({
    id: 'e2e_root', label: 'Root AppModule E2E', runner: 'jest',
    dependsOn: ['seed_general', 'build'], files: ['test/app.e2e-spec.ts'],
    freshDatabase: true, databaseKind: 'general',
    jest: { resultId: 'e2e-root', config: 'test/jest-e2e.json' },
    timeoutMs: context.config.stageTimeoutMs,
  });

  createBatches(integrationGroups.general, context.config.integrationBatchSize).forEach((files, index) => {
    stages.push({
      id: `integration_general_${index + 1}`, label: `General integration batch ${index + 1}`, runner: 'jest',
      dependsOn: ['seed_general', 'build'], files, freshDatabase: true, databaseKind: 'general',
      jest: { resultId: `integration-general-${index + 1}`, config: 'test/jest-e2e.json' },
      timeoutMs: context.config.stageTimeoutMs,
    });
  });
  stages.push({
    id: 'integration_src', label: 'Integration specs under src', runner: 'jest',
    dependsOn: ['seed_general', 'build'], files: integrationGroups.src,
    freshDatabase: true, databaseKind: 'general',
    jest: { resultId: 'integration-src' },
    timeoutMs: context.config.stageTimeoutMs,
  });
  stages.push({
    id: 'integration_g06', label: 'G06 repository and persistence integrations', runner: 'jest',
    dependsOn: ['seed_g06', 'build'], files: integrationGroups.g06,
    freshDatabase: true, databaseKind: 'g06',
    jest: { resultId: 'integration-g06', config: 'test/jest-e2e.json' },
    timeoutMs: context.config.stageTimeoutMs,
  });
  stages.push({
    id: 'integration_teacher', label: 'Teacher closeout integrations', runner: 'jest',
    dependsOn: ['seed_teacher', 'build'], files: integrationGroups['teacher-closeout'],
    freshDatabase: true, databaseKind: 'teacher',
    jest: { resultId: 'integration-teacher', config: 'test/jest-e2e.json' },
    timeoutMs: context.config.stageTimeoutMs,
  });
  stages.push({
    id: 'integration_g05', label: 'G05 dedicated BullMQ Redis proof', runner: 'jest',
    dependsOn: ['seed_general', 'build'], files: integrationGroups['g05-redis'],
    freshDatabase: true, databaseKind: 'general',
    jest: { resultId: 'integration-g05', config: 'test/jest-e2e.json' },
    timeoutMs: context.config.stageTimeoutMs,
  });

  context.inventory = {
    securityFiles: securityFiles.length,
    e2eFiles: e2eFiles.length,
    rootE2eFiles: 1,
    integrationFiles: testIntegrations.length + srcIntegrations.length,
    integrationRoutes: Object.fromEntries(
      Object.entries(integrationGroups).map(([key, value]) => [key, value.length]),
    ),
    batchSizes: {
      security: context.config.securityBatchSize,
      e2e: context.config.e2eBatchSize,
      integration: context.config.integrationBatchSize,
    },
  };
  return stages;
}

async function runScopeCheck(context) {
  const commands = [
    ['rev-parse', 'HEAD'],
    ['merge-base', '--is-ancestor', BASELINE_SHA, 'HEAD'],
    ['branch', '--show-current'],
    ['diff', '--name-only', BASELINE_SHA],
    ['ls-files', '--others', '--exclude-standard'],
    ['ls-files', '--', '.env', '.env.*'],
  ];
  const outputs = [];
  for (const args of commands) {
    const result = await runCommand('git', args, {
      cwd: context.repositoryRoot,
      env: context.hostEnvironment,
      timeoutMs: 30_000,
      sensitiveValues: context.fixture.sensitiveValues,
    });
    if (!result.ok) return result;
    outputs.push(result.stdout.trim());
  }
  const branch = outputs[2];
  if (branch && branch !== EXPECTED_BRANCH && !process.env.CI) {
    return { ok: false, exitCode: 1, error: `Unexpected branch: ${branch}` };
  }
  const changed = [...outputs[3].split(/\r?\n/u), ...outputs[4].split(/\r?\n/u)]
    .filter(Boolean).map((item) => item.replace(/\\/gu, '/'));
  const outOfScope = [...new Set(changed)].filter((item) => !ALLOWED_SCOPE_PATHS.has(item));
  if (outOfScope.length > 0) {
    return { ok: false, exitCode: 1, error: `Out-of-scope paths: ${outOfScope.join(', ')}` };
  }
  const trackedEnv = outputs[5].split(/\r?\n/u).filter(
    (item) => item && item !== '.env.example',
  );
  if (trackedEnv.length > 0) {
    return { ok: false, exitCode: 1, error: `Tracked env files: ${trackedEnv.join(', ')}` };
  }
  if (changed.some((item) => item === 'package-lock.json' || item === 'prisma/schema.prisma' || item.startsWith('prisma/migrations/'))) {
    return { ok: false, exitCode: 1, error: 'Forbidden schema, migration, or lockfile scope change' };
  }
  return { ok: true, exitCode: 0, counts: { changedPaths: new Set(changed).size } };
}

async function runStage(context, stage) {
  process.stdout.write(`\n[G07] ${stage.id}: ${stage.label}\n`);
  if (stage.files?.length) {
    for (const file of stage.files) process.stdout.write(`  - ${file}\n`);
  }
  switch (stage.runner) {
    case 'host-node-test':
      return runCommand(process.execPath, ['--test', ...stage.files], {
        cwd: context.repositoryRoot, env: context.hostEnvironment,
        timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
        sensitiveValues: context.fixture.sensitiveValues,
      });
    case 'host-node':
      return runCommand(process.execPath, [stage.script], {
        cwd: context.repositoryRoot,
        env: { ...context.hostEnvironment, MIGRATION_BASE_REF: BASELINE_SHA },
        timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
        sensitiveValues: context.fixture.sensitiveValues,
      });
    case 'scope':
      return runScopeCheck(context);
    case 'git-diff-check': {
      for (const args of [
        ['diff', '--check', BASELINE_SHA], ['diff', '--check'], ['diff', '--cached', '--check'],
      ]) {
        const result = await runCommand('git', args, {
          cwd: context.repositoryRoot, env: context.hostEnvironment, timeoutMs: 30_000,
          sensitiveValues: context.fixture.sensitiveValues,
        });
        if (!result.ok) return result;
      }
      return { ok: true, exitCode: 0 };
    }
    case 'image-build': {
      return buildPreparedTestImage(context, stage.timeoutMs);
    }
    case 'infra':
      return startInfrastructure(context);
    case 'container-command':
      return runContainer(context, stage.command, {
        network: stage.network,
        timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
      });
    case 'prisma-db':
      return runContainer(context, prismaArgs(stage.command, stage.args), {
        environment: {
          DATABASE_URL: context.fixture.databaseUrl(context.fixture.databaseNames[stage.database]),
        },
        timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
      });
    case 'seed':
      return runContainer(context, [
        'node', '--max-old-space-size=1024', '--require', 'ts-node/register',
        'prisma/seeds/index.ts',
      ], {
        environment: {
          DATABASE_URL: context.fixture.databaseUrl(context.fixture.databaseNames[stage.database]),
          SEED_DEMO_DATA: 'true',
        },
        timeoutMs: stage.timeoutMs ?? context.config.stageTimeoutMs,
      });
    case 'jest':
      return runJestStage(context, stage);
    default:
      throw new Error(`Unknown G07 runner: ${stage.runner}`);
  }
}

function printResult(result) {
  const exit = result.exitCode === null ? '-' : result.exitCode;
  process.stdout.write(`[G07] ${result.status.padEnd(7)} ${result.id} (exit ${exit}, ${result.durationMs} ms)\n`);
}

function printHumanSummary(summary) {
  process.stdout.write('\nPRD1-G07 Universal Regression Summary\n');
  process.stdout.write(`Baseline: ${summary.baseline}\n`);
  process.stdout.write(`Overall: ${summary.overall}\n`);
  for (const result of summary.results) {
    const counts = result.counts
      ? ` | suites ${result.counts.passedSuites ?? result.counts.suites ?? '-'} / ${result.counts.suites ?? '-'}, tests ${result.counts.passedTests ?? '-'} / ${result.counts.tests ?? '-'}, skipped ${result.counts.skippedTests ?? 0}`
      : '';
    process.stdout.write(`${result.status.padEnd(7)} ${result.id} | exit ${result.exitCode ?? '-'}${counts}\n`);
  }
  process.stdout.write(`Machine summary: ${summary.summaryPath}\n`);
}

async function provisionMinioInternal() {
  const { Client } = require('minio');
  const endpoint = new URL(process.env.STORAGE_ENDPOINT);
  const client = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || '9000'),
    useSSL: endpoint.protocol === 'https:',
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
  });
  const privateBucket = process.env.STORAGE_BUCKET;
  const publicBucket = process.env.STORAGE_PUBLIC_BUCKET;
  for (const bucket of [privateBucket, publicBucket]) {
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
  }
  await client.setBucketPolicy(publicBucket, JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${publicBucket}/*`],
    }],
  }));
  process.stdout.write('Provisioned private and public G07 buckets\n');
}

async function main() {
  if (process.argv[2] === '--internal' && process.argv[3] === 'provision-minio') {
    await provisionMinioInternal();
    return;
  }

  const repositoryRoot = path.resolve(__dirname, '..');
  const suffix = createSuffix();
  const fixture = createFixture(suffix);
  const outputDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), `moazez-g07-${suffix}-`));
  const summaryPath = path.resolve(
    process.env.G07_SUMMARY_PATH || path.join(outputDirectory, 'summary.json'),
  );
  const cleanup = new CleanupManager();
  cleanup.add('temporary output directory', async () => {
    await fsp.rm(outputDirectory, { recursive: true, force: true });
  });
  const context = {
    repositoryRoot,
    outputDirectory,
    summaryPath,
    fixture,
    cleanup,
    hostEnvironment: createSafeHostEnvironment(),
    config: {
      securityBatchSize: parsePositiveInteger(process.env.G07_SECURITY_BATCH_SIZE, DEFAULTS.securityBatchSize, 'G07_SECURITY_BATCH_SIZE'),
      e2eBatchSize: parsePositiveInteger(process.env.G07_E2E_BATCH_SIZE, DEFAULTS.e2eBatchSize, 'G07_E2E_BATCH_SIZE'),
      integrationBatchSize: parsePositiveInteger(process.env.G07_INTEGRATION_BATCH_SIZE, DEFAULTS.integrationBatchSize, 'G07_INTEGRATION_BATCH_SIZE'),
      nodeHeapMb: parsePositiveInteger(process.env.G07_NODE_HEAP_MB, DEFAULTS.nodeHeapMb, 'G07_NODE_HEAP_MB'),
      containerMemoryMb: parsePositiveInteger(process.env.G07_CONTAINER_MEMORY_MB, DEFAULTS.containerMemoryMb, 'G07_CONTAINER_MEMORY_MB'),
      stageTimeoutMs: parsePositiveInteger(process.env.G07_STAGE_TIMEOUT_MS, DEFAULTS.stageTimeoutMs, 'G07_STAGE_TIMEOUT_MS'),
      unitTimeoutMs: parsePositiveInteger(process.env.G07_UNIT_TIMEOUT_MS, DEFAULTS.unitTimeoutMs, 'G07_UNIT_TIMEOUT_MS'),
      imageBuildTimeoutMs: parsePositiveInteger(process.env.G07_IMAGE_BUILD_TIMEOUT_MS, DEFAULTS.imageBuildTimeoutMs, 'G07_IMAGE_BUILD_TIMEOUT_MS'),
    },
    currentChild: null,
    currentRunContainer: null,
    runCounter: 0,
    aborted: false,
    inventory: null,
  };

  const stop = async (signal) => {
    if (context.aborted) return;
    context.aborted = true;
    process.stderr.write(`\n[G07] ${signal} received; cleaning disposable resources.\n`);
    if (context.currentRunContainer) {
      await runCommand('docker', ['rm', '--force', context.currentRunContainer], {
        cwd: repositoryRoot, env: context.hostEnvironment, timeoutMs: 30_000,
        sensitiveValues: fixture.sensitiveValues,
      });
    }
    if (context.currentChild && !context.currentChild.killed) context.currentChild.kill('SIGTERM');
  };
  process.once('SIGINT', () => { void stop('SIGINT'); });
  process.once('SIGTERM', () => { void stop('SIGTERM'); });

  const stages = buildStages(context);
  const startedAt = new Date();
  const execution = await executePlannedGate({
    stages,
    runStage: (stage) => runStage(context, stage),
    cleanup,
    isAborted: () => context.aborted,
    onResult: printResult,
  });
  const finishedAt = new Date();
  if (context.aborted) execution.exitCode = 1;

  const summary = redactJson({
    schemaVersion: 1,
    gate: 'PRD1-G07',
    baseline: BASELINE_SHA,
    expectedBranch: EXPECTED_BRANCH,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    overall: execution.exitCode === 0 ? STATUSES.PASS : STATUSES.FAIL,
    exitCode: execution.exitCode,
    aborted: context.aborted,
    inventory: context.inventory,
    fixtureTopology: {
      postgres: POSTGRES_IMAGE,
      redis: REDIS_IMAGE,
      minio: MINIO_IMAGE,
      network: 'isolated-internal',
      hostPortsPublished: 0,
      databases: ['general', 'g06', 'teacher-closeout'],
      batchDatabases: 'fresh-migrate-seed-drop-per-process',
      buckets: ['private', 'public'],
    },
    results: execution.results,
    summaryPath,
  }, fixture.sensitiveValues);
  await fsp.mkdir(path.dirname(summaryPath), { recursive: true });
  await fsp.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  printHumanSummary(summary);
  process.exitCode = execution.exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${redactText(error instanceof Error ? error.stack ?? error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_SCOPE_PATHS,
  BASELINE_SHA,
  CleanupManager,
  DEFAULTS,
  EXPECTED_BRANCH,
  STATUSES,
  buildStages,
  createBatches,
  createBatchDatabaseName,
  createFixture,
  deriveExitCode,
  discoverTestFiles,
  executePlannedGate,
  parsePositiveInteger,
  redactJson,
  redactText,
  routeIntegrationFile,
  runCommand,
  runStageGraph,
};
