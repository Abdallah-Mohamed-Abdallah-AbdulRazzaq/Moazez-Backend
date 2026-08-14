'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const { MEDIA_RUNTIME_JEST_FILES, requireExactSha } = require('./plan-ci.cjs');

const SCHEMA_VERSION = 1;
const POSTGRES_IMAGE = 'postgres:16-alpine';
const REDIS_IMAGE = 'redis:7-alpine';
const MINIO_IMAGE = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const SHARD_CLEANUP_RESERVE_MINUTES = 8;
const JEST_OPEN_HANDLE_WARNING_PATTERN =
  /Jest has detected the following.*open handle|open handles? potentially keeping Jest from exiting|did not exit.*after the test run/iu;
const FAILURE_CLASSIFICATIONS = Object.freeze([
  'SOURCE_TEST_FAILURE',
  'FIXTURE_CONTRACT_FAILURE',
  'MIGRATION_FAILURE',
  'GOVERNANCE_INVARIANT_FAILURE',
  'CI_ORCHESTRATOR_FAILURE',
  'WORKFLOW_CONFIGURATION_FAILURE',
  'RUNNER_INFRA_FAILURE',
  'DEPENDENCY_INSTALL_FAILURE',
  'IMAGE_PULL_OR_BUILD_FAILURE',
  'TIMEOUT',
  'TEARDOWN_FAILURE',
  'CANCELLED_SUPERSEDED',
  'PERMISSION_FAILURE',
  'ARTIFACT_FAILURE',
  'UNCLASSIFIED',
]);

const SERVICE_PROFILES = new Set([
  'security',
  'g06-reinforcement-storage',
  'e2e',
  'integration-general',
  'source-integration',
  'teacher-closeout',
  'media-storage',
  'migration-governance',
]);

const REDIS_ONLY_PROFILES = new Set(['g05-email-redis']);
const SELF_CONTAINED_PROFILES = new Set([
  'prd3-g01',
  'prd3-g02',
  'prd3-g03',
  'prd3-g04',
  'prd3-g05',
]);

const SELF_CONTAINED_RUN_LABELS = Object.freeze({
  'prd3-g01': 'com.moazez.prd3-g01-c.run',
  'prd3-g02': 'com.moazez.evidence.run',
  'prd3-g03': 'com.moazez.evidence.run',
  'prd3-g04': 'com.moazez.prd3-g04.run',
  'prd3-g05': 'com.moazez.prd3-g05.run',
});

const SELF_CONTAINED_PROFILE_IMAGES = Object.freeze({
  'prd3-g01': Object.freeze([
    Object.freeze({ id: 'postgres', image: POSTGRES_IMAGE }),
  ]),
  'prd3-g02': Object.freeze([
    Object.freeze({ id: 'redis', image: REDIS_IMAGE }),
  ]),
  'prd3-g03': Object.freeze([
    Object.freeze({ id: 'postgres', image: POSTGRES_IMAGE }),
    Object.freeze({ id: 'redis', image: REDIS_IMAGE }),
    Object.freeze({ id: 'minio', image: MINIO_IMAGE }),
  ]),
  'prd3-g04': Object.freeze([
    Object.freeze({ id: 'postgres', image: POSTGRES_IMAGE }),
  ]),
  'prd3-g05': Object.freeze([
    Object.freeze({ id: 'postgres', image: POSTGRES_IMAGE }),
  ]),
});

const PROFILE_HARNESSES = Object.freeze({
  'prd3-g01': ['scripts/ci/prd3-g01-c-database-privileges.cjs', '--current-ci'],
  'prd3-g02': ['scripts/ci/prd3-g02-redis-topology-recovery.cjs'],
  'prd3-g03': ['scripts/ci/prd3-g03-critical-queue-recovery.cjs'],
  'prd3-g04': [
    'scripts/ci/prd3-g04-governed-migration-job.cjs',
    '--current-ci',
  ],
  'prd3-g05': ['scripts/ci/prd3-g05-clean-start.cjs', '--current-ci'],
});

const HEALTH_SCENARIOS = Object.freeze([
  'startup',
  'redis-recovery',
  'storage-recovery',
  'realtime-reconciliation',
  'graceful-shutdown',
  'forced-timeout',
]);

const MEDIA_CONTAINER_ENVIRONMENT_KEYS = Object.freeze([
  'NODE_ENV',
  'DATABASE_URL',
  'QUEUE_REDIS_URL',
  'REALTIME_REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'STORAGE_PROVIDER',
  'STORAGE_ENDPOINT',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
  'STORAGE_PUBLIC_BUCKET',
  'STORAGE_CORS_ORIGINS',
  'FCM_ENABLED',
  'FCM_DRY_RUN',
]);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeRepositoryPath(value) {
  const normalized = String(value).replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (
    normalized.length === 0 ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function redactText(value, sensitiveValues = []) {
  let output = String(value ?? '');
  for (const sensitive of [...new Set(sensitiveValues.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  )) {
    output = output.split(sensitive).join('[REDACTED]');
  }
  return output
    .replace(
      /\b(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s"'<>]+/giu,
      '[REDACTED_URL]',
    )
    .replace(
      /\bhttps?:\/\/[^\s"'<>]*:[^\s"'<>]*@[^\s"'<>]+/giu,
      '[REDACTED_URL]',
    )
    .replace(
      /\b(password|secret|token|private[_ -]?key|credential)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/giu,
      '$1=[REDACTED]',
    );
}

function sanitizeEvidence(value, sensitiveValues = []) {
  if (typeof value === 'string') return redactText(value, sensitiveValues);
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeEvidence(entry, sensitiveValues));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /password|secret|token|private[_ -]?key|credential|databaseUrl|redisUrl|storageEndpoint/iu.test(
        key,
      )
        ? '[REDACTED]'
        : sanitizeEvidence(entry, sensitiveValues),
    ]),
  );
}

function safeHostEnvironment(environment = process.env) {
  const allowed = new Set([
    'APPDATA',
    'CI',
    'ComSpec',
    'HOME',
    'LANG',
    'LC_ALL',
    'LOCALAPPDATA',
    'NODE_EXTRA_CA_CERTS',
    'NPM_CONFIG_CACHE',
    'PATH',
    'PATHEXT',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
    'TZ',
    'USERPROFILE',
    'WINDIR',
  ]);
  const prefixes = ['DOCKER_', 'GITHUB_', 'RUNNER_'];
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) =>
        value !== undefined &&
        (allowed.has(key) || prefixes.some((prefix) => key.startsWith(prefix))),
    ),
  );
}

function createBaselineTestEnvironment(environment) {
  return {
    ...environment,
    NODE_ENV: 'test',
    APP_PORT: '3000',
    APP_PROBE_PORT: '9090',
    APP_URL: 'http://127.0.0.1:3000',
    APP_CORS_ORIGINS: 'https://schools.moazez.invalid',
    SWAGGER_ENABLED: 'false',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test?schema=public',
    QUEUE_REDIS_URL: 'redis://127.0.0.1:1/0',
    REALTIME_REDIS_URL: 'redis://127.0.0.1:1/0',
    JWT_ACCESS_SECRET: 'ci-only-access-secret-not-for-production',
    JWT_REFRESH_SECRET: 'ci-only-refresh-secret-not-for-production',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    SETTINGS_SECRET_ENCRYPTION_KEY:
      'hex:0000000000000000000000000000000000000000000000000000000000000000',
    STORAGE_PROVIDER: 'minio',
    STORAGE_ENDPOINT: 'http://127.0.0.1:1',
    STORAGE_ACCESS_KEY: 'ci-only-storage-access',
    STORAGE_SECRET_KEY: 'ci-only-storage-secret',
    STORAGE_BUCKET: 'ci-only-private',
    STORAGE_PUBLIC_BUCKET: 'ci-only-public',
    STORAGE_CORS_ORIGINS: 'http://127.0.0.1:3001',
    FCM_ENABLED: 'false',
    FCM_DRY_RUN: 'true',
    SEED_DEMO_DATA: 'true',
    LOG_LEVEL: 'error',
  };
}

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    const inlineValue =
      separator === -1 ? undefined : argument.slice(separator + 1);
    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }
      return argv[index];
    };
    if (flag === '--plan') result.planPath = takeValue();
    else if (flag === '--shard') result.shardId = takeValue();
    else if (flag === '--evidence') result.evidencePath = takeValue();
    else if (flag === '--repository-root') result.repositoryRoot = takeValue();
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function loadPlan(planPath) {
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
  if (plan.schemaVersion !== 1) throw new Error('Unsupported CI plan schema');
  requireExactSha(plan.candidateSha, 'candidateSha');
  requireExactSha(plan.baseSha, 'baseSha');
  if (!Array.isArray(plan.shards) || !Array.isArray(plan.assignments)) {
    throw new Error('CI plan is missing shard or assignment arrays');
  }
  return plan;
}

function validateShard(plan, shardId, repositoryRoot) {
  if (shardId === 'preflight') {
    return {
      id: 'preflight',
      label: 'Fast deterministic preflight',
      category: 'preflight',
      profile: 'preflight',
      index: 1,
      total: 1,
      files: [],
      timeoutMinutes: 25,
    };
  }
  const shard = plan.shards.find((entry) => entry.id === shardId);
  if (!shard) throw new Error(`Unknown shard ID: ${shardId}`);
  if (!Array.isArray(shard.files) || shard.files.length === 0) {
    throw new Error(`Shard ${shardId} has no test files`);
  }
  const normalized = shard.files.map(normalizeRepositoryPath);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Shard ${shardId} contains duplicate files`);
  }
  if (
    normalized.some(
      (file, index) =>
        index > 0 && compareText(normalized[index - 1], file) > 0,
    )
  ) {
    throw new Error(`Shard ${shardId} test files are not sorted`);
  }
  for (const file of normalized) {
    if (!fs.existsSync(path.join(repositoryRoot, file))) {
      throw new Error(`Assigned test file does not exist: ${file}`);
    }
    const assignments = plan.assignments.filter(
      (assignment) =>
        assignment.execution === 'pull-request' && assignment.file === file,
    );
    if (assignments.length !== 1 || assignments[0].profile !== shard.profile) {
      throw new Error(`Assigned test ownership mismatch: ${file}`);
    }
  }
  return { ...shard, files: normalized };
}

function assertPlanWorkflowIdentity(plan, environment) {
  const candidateSha = requireExactSha(
    environment?.CI_CANDIDATE_SHA,
    'CI_CANDIDATE_SHA',
  );
  const baseSha = requireExactSha(environment?.CI_BASE_SHA, 'CI_BASE_SHA');
  if (plan.candidateSha !== candidateSha || plan.baseSha !== baseSha) {
    throw commandFailure(
      'CI plan identity differs from the independently verified workflow identity',
      'WORKFLOW_CONFIGURATION_FAILURE',
    );
  }
}

function createResourceIdentity(plan, shard, environment = process.env) {
  const runId = String(environment.GITHUB_RUN_ID ?? 'local');
  const attempt = String(environment.GITHUB_RUN_ATTEMPT ?? '1');
  const seed = [
    plan.candidateSha,
    shard.profile,
    shard.index,
    runId,
    attempt,
  ].join(':');
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 14);
  const profile = shard.profile
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .slice(0, 18);
  const suffix = `${profile}-${shard.index}-${digest}`;
  const database =
    shard.profile === 'g06-reinforcement-storage'
      ? `g06_${digest}`
      : shard.profile === 'teacher-closeout'
        ? `moazez_1b7_closeout_${digest}`
        : `ci_${digest}`;
  return {
    suffix,
    harnessRunId: digest,
    runId: `${runId}-${digest}`.replace(/[^A-Za-z0-9_.-]/gu, '-'),
    attempt,
    network: `moazez-ci-net-${suffix}`,
    postgres: `moazez-ci-pg-${suffix}`,
    redis: `moazez-ci-redis-${suffix}`,
    minio: `moazez-ci-minio-${suffix}`,
    runtimeImage: `moazez-ci-runtime:${suffix}`,
    mediaTestImage: `moazez-ci-media-test:${suffix}`,
    database,
    privateBucket: `ci-${digest}-private`,
    publicBucket: `ci-${digest}-public`,
    labels: {
      'com.moazez.ci.owner': 'canonical-ci',
      'com.moazez.ci.candidate': plan.candidateSha,
      'com.moazez.ci.shard': shard.id,
      'com.moazez.ci.run': `${runId}-${attempt}`,
    },
  };
}

function writeEvidence(evidencePath, evidence, sensitiveValues = []) {
  const absolutePath = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const safe = sanitizeEvidence(evidence, sensitiveValues);
  fs.writeFileSync(absolutePath, `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
}

function createInitialEvidence(plan, shard, startedAt) {
  return {
    schemaVersion: SCHEMA_VERSION,
    candidateSha: plan.candidateSha,
    baseSha: plan.baseSha,
    jobId: shard.id,
    category: shard.category,
    profile: shard.profile,
    shardIndex: shard.index,
    shardTotal: shard.total,
    testFiles: [...shard.files],
    executedTestFiles: [],
    testFileCount: shard.files.length,
    testSuiteCount: null,
    testCount: null,
    skippedTestCount: null,
    startedAt,
    finishedAt: null,
    durationMs: null,
    status: 'RUNNING',
    classification: null,
    cleanupStatus: 'PENDING',
    stages: [],
  };
}

function commandFailure(message, classification, details = {}) {
  const error = new Error(message);
  error.classification = classification;
  Object.assign(error, details);
  return error;
}

function terminateProcessTree(child, signal) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn(
      'taskkill.exe',
      ['/pid', String(child.pid), '/t', '/f'],
      {
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    killer.on('error', () => {});
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // A concurrently exited process tree is already in the desired state.
    }
  }
}

function hasJestOpenHandleWarning(output) {
  return JEST_OPEN_HANDLE_WARNING_PATTERN.test(String(output ?? ''));
}

function parseAppliedMigrationCount(output) {
  const lines = String(output ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts = lines.filter((line) => /^[1-9][0-9]*$/u.test(line));
  if (counts.length !== 1) {
    throw commandFailure(
      'Unable to prove the applied migration count',
      'MIGRATION_FAILURE',
    );
  }
  return counts[0];
}

function assertMigrationNoopEvidence(beforeOutput, afterOutput, deployOutput) {
  const before = parseAppliedMigrationCount(beforeOutput);
  const after = parseAppliedMigrationCount(afterOutput);
  if (!String(deployOutput ?? '').includes('No pending migrations to apply.')) {
    throw commandFailure(
      'The second migration deployment did not report a no-op',
      'MIGRATION_FAILURE',
    );
  }
  if (before !== after) {
    throw commandFailure(
      `Applied migration count changed on the second deploy: ${before} -> ${after}`,
      'MIGRATION_FAILURE',
    );
  }
  return after;
}

async function runProcess(command, args, options = {}) {
  const sensitiveValues = options.sensitiveValues ?? [];
  const retained = [];
  let retainedBytes = 0;
  const retain = (safe) => {
    const bytes = Buffer.byteLength(safe);
    retained.push(safe);
    retainedBytes += bytes;
    while (retainedBytes > 128 * 1024 && retained.length > 1) {
      retainedBytes -= Buffer.byteLength(retained.shift());
    }
  };
  const lineWriter = (target) => {
    let pending = '';
    return {
      write(chunk) {
        pending += chunk.toString('utf8');
        const lines = pending.split(/(?<=\n)/u);
        pending = lines.pop() ?? '';
        for (const line of lines) {
          const safe = redactText(line, sensitiveValues);
          retain(safe);
          target.write(safe);
        }
      },
      flush() {
        if (!pending) return;
        const safe = redactText(pending, sensitiveValues);
        retain(safe);
        target.write(safe);
        pending = '';
      },
    };
  };
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = lineWriter(options.stdoutTarget ?? process.stdout);
  const stderr = lineWriter(options.stderrTarget ?? process.stderr);
  child.stdout.on('data', (chunk) => stdout.write(chunk));
  child.stderr.on('data', (chunk) => stderr.write(chunk));
  let timedOut = false;
  let forceKillTimer;
  const timer = setTimeout(
    () => {
      timedOut = true;
      terminateProcessTree(child, 'SIGTERM');
      forceKillTimer = setTimeout(
        () => terminateProcessTree(child, 'SIGKILL'),
        5000,
      );
      forceKillTimer.unref();
    },
    options.timeoutMs ?? 15 * 60 * 1000,
  );
  timer.unref();
  const outcome = await new Promise((resolve) => {
    let settled = false;
    let spawnError = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (code, signal) =>
      finish({ code, signal, error: spawnError }),
    );
  });
  clearTimeout(timer);
  clearTimeout(forceKillTimer);
  stdout.flush();
  stderr.flush();
  const exitCode = outcome.code ?? 1;
  return {
    ok: exitCode === 0 && !timedOut,
    exitCode,
    signal: outcome.signal,
    timedOut,
    error: outcome.error?.message ?? null,
    outputTail: retained.join('').slice(-128 * 1024),
  };
}

async function runStage(context, definition) {
  const remainingMs = context.deadlineMs - Date.now();
  if (remainingMs <= 0) {
    throw commandFailure(
      `${definition.id} could not start before the shard deadline`,
      'TIMEOUT',
      { timedOut: true },
    );
  }
  const started = Date.now();
  const record = {
    id: definition.id,
    startedAt: new Date(started).toISOString(),
    finishedAt: null,
    durationMs: null,
    status: 'RUNNING',
    classification: null,
  };
  context.evidence.stages.push(record);
  writeEvidence(
    context.evidencePath,
    context.evidence,
    context.sensitiveValues,
  );
  const outcome = await context.execute(definition.command, definition.args, {
    cwd: context.repositoryRoot,
    env: definition.env ?? context.environment,
    timeoutMs: Math.min(definition.timeoutMs ?? remainingMs, remainingMs),
    sensitiveValues: context.sensitiveValues,
  });
  const finished = Date.now();
  Object.assign(record, {
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    status: outcome.ok ? 'PASS' : 'FAIL',
    classification: outcome.ok
      ? null
      : outcome.timedOut
        ? 'TIMEOUT'
        : definition.classification,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
  });
  writeEvidence(
    context.evidencePath,
    context.evidence,
    context.sensitiveValues,
  );
  if (!outcome.ok) {
    throw commandFailure(
      `${definition.id} failed${outcome.error ? `: ${outcome.error}` : ''}`,
      record.classification,
      { timedOut: outcome.timedOut, outputTail: outcome.outputTail },
    );
  }
  return outcome;
}

function nodeStage(id, args, classification, options = {}) {
  return {
    id,
    command: process.execPath,
    args,
    classification,
    timeoutMs: options.timeoutMs,
    env: options.env,
  };
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function npxExecutable() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function dockerLabelArgs(labels) {
  return Object.entries(labels).flatMap(([key, value]) => [
    '--label',
    `${key}=${value}`,
  ]);
}

async function docker(context, args, options = {}) {
  return context.execute('docker', args, {
    cwd: context.repositoryRoot,
    env: context.environment,
    timeoutMs: options.timeoutMs ?? 2 * 60 * 1000,
    sensitiveValues: context.sensitiveValues,
  });
}

async function assertLocalDocker(context) {
  const result = await docker(
    context,
    ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'],
    { timeoutMs: 30_000 },
  );
  if (!result.ok) {
    throw commandFailure(
      'Docker context inspection failed',
      'RUNNER_INFRA_FAILURE',
    );
  }
  const endpoint = result.outputTail.trim();
  if (endpoint && !/^(?:unix|npipe):\/\//u.test(endpoint)) {
    throw commandFailure(
      'Remote Docker endpoints are forbidden in CI shards',
      'PERMISSION_FAILURE',
    );
  }
}

async function waitForContainer(context, container, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await docker(
      context,
      [
        'inspect',
        '--format',
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
        container,
      ],
      { timeoutMs: 10_000 },
    );
    if (result.ok && /^(?:healthy|running)$/u.test(result.outputTail.trim()))
      return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw commandFailure(
    `${container} did not become healthy`,
    'RUNNER_INFRA_FAILURE',
  );
}

async function waitForHttpReady(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
    } catch {
      // Continue the bounded readiness poll without exposing endpoint details.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw commandFailure('MinIO did not become ready', 'RUNNER_INFRA_FAILURE');
}

async function publishedPort(context, container, port) {
  const result = await docker(context, ['port', container, `${port}/tcp`], {
    timeoutMs: 15_000,
  });
  if (!result.ok)
    throw commandFailure(
      'Docker port discovery failed',
      'RUNNER_INFRA_FAILURE',
    );
  const firstLine = result.outputTail.trim().split(/\r?\n/u)[0];
  const match = firstLine.match(/:(\d+)$/u);
  if (!match)
    throw commandFailure(
      'Docker returned an invalid port mapping',
      'RUNNER_INFRA_FAILURE',
    );
  return Number(match[1]);
}

async function removeAndVerify(context, kind, name) {
  const removeArgs =
    kind === 'network'
      ? ['network', 'rm', name]
      : kind === 'image'
        ? ['image', 'rm', '--force', name]
        : ['rm', '--force', name];
  await docker(context, removeArgs, { timeoutMs: 60_000 });
  const inspectKind =
    kind === 'network' ? 'network' : kind === 'image' ? 'image' : 'container';
  const inspection = await docker(context, [inspectKind, 'inspect', name], {
    timeoutMs: 15_000,
  });
  if (inspection.ok)
    throw new Error(`${kind} cleanup verification failed: ${name}`);
  if (
    !/(?:no such (?:container|image|network|object)|not found)/iu.test(
      inspection.outputTail,
    )
  ) {
    throw new Error(`${kind} cleanup could not prove absence: ${name}`);
  }
}

async function listOwnedDockerIds(context, kind, filter) {
  const args =
    kind === 'container'
      ? ['ps', '--all', '--quiet', '--filter', filter]
      : [kind, 'ls', '--quiet', '--filter', filter];
  const result = await docker(context, args, { timeoutMs: 30_000 });
  if (!result.ok) {
    throw new Error(`Unable to enumerate owned Docker ${kind} resources`);
  }
  return result.outputTail.split(/\r?\n/u).filter(Boolean);
}

async function cleanupDockerResourcesByLabel(context, label, value) {
  if (!/^com\.moazez\.[a-z0-9.-]+$/u.test(label)) {
    throw new Error('Unsafe Docker cleanup label');
  }
  if (!/^[a-f0-9]{14}$/u.test(value)) {
    throw new Error('Unsafe Docker cleanup label value');
  }
  const filter = `label=${label}=${value}`;
  for (const kind of ['container', 'network', 'image']) {
    const ids = await listOwnedDockerIds(context, kind, filter);
    for (const id of ids) await removeAndVerify(context, kind, id);
  }
  for (const kind of ['container', 'network', 'image']) {
    const remaining = await listOwnedDockerIds(context, kind, filter);
    if (remaining.length > 0) {
      throw new Error(`Owned Docker ${kind} cleanup verification failed`);
    }
  }
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

async function startInfrastructure(context, options = {}) {
  await assertLocalDocker(context);
  const identity = context.identity;
  const labels = dockerLabelArgs(identity.labels);
  context.cleanup.add('owned Docker network', () =>
    removeAndVerify(context, 'network', identity.network),
  );
  let outcome = await docker(context, [
    'network',
    'create',
    ...labels,
    identity.network,
  ]);
  if (!outcome.ok)
    throw commandFailure(
      'Docker network creation failed',
      'RUNNER_INFRA_FAILURE',
    );

  if (options.postgres) {
    context.cleanup.add('owned PostgreSQL container', () =>
      removeAndVerify(context, 'container', identity.postgres),
    );
    outcome = await docker(
      context,
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        identity.postgres,
        ...labels,
        '--network',
        identity.network,
        '--publish',
        '127.0.0.1::5432',
        '--tmpfs',
        '/var/lib/postgresql/data:rw,noexec,nosuid,size=1073741824',
        '--env',
        'POSTGRES_USER=moazez_ci',
        '--env',
        'POSTGRES_PASSWORD=ci-only-postgres-password',
        '--env',
        `POSTGRES_DB=${identity.database}`,
        '--health-cmd',
        `pg_isready -U moazez_ci -d ${identity.database}`,
        '--health-interval',
        '2s',
        '--health-timeout',
        '3s',
        '--health-retries',
        '30',
        POSTGRES_IMAGE,
      ],
      { timeoutMs: 3 * 60 * 1000 },
    );
    if (!outcome.ok)
      throw commandFailure(
        'PostgreSQL image pull/start failed',
        'IMAGE_PULL_OR_BUILD_FAILURE',
      );
  }

  if (options.redis) {
    context.cleanup.add('owned Redis container', () =>
      removeAndVerify(context, 'container', identity.redis),
    );
    outcome = await docker(
      context,
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        identity.redis,
        ...labels,
        '--network',
        identity.network,
        '--publish',
        '127.0.0.1::6379',
        '--tmpfs',
        '/data:rw,noexec,nosuid,size=268435456',
        '--health-cmd',
        'redis-cli ping',
        '--health-interval',
        '2s',
        '--health-timeout',
        '3s',
        '--health-retries',
        '30',
        REDIS_IMAGE,
      ],
      { timeoutMs: 3 * 60 * 1000 },
    );
    if (!outcome.ok)
      throw commandFailure(
        'Redis image pull/start failed',
        'IMAGE_PULL_OR_BUILD_FAILURE',
      );
  }

  if (options.minio) {
    context.cleanup.add('owned MinIO container', () =>
      removeAndVerify(context, 'container', identity.minio),
    );
    const minioPublish =
      context.shard.profile === 'g06-reinforcement-storage'
        ? '127.0.0.1:59000:9000'
        : '127.0.0.1::9000';
    outcome = await docker(
      context,
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        identity.minio,
        ...labels,
        '--network',
        identity.network,
        '--publish',
        minioPublish,
        '--tmpfs',
        '/data:rw,noexec,nosuid,size=536870912',
        '--env',
        'MINIO_ROOT_USER=ci-only-storage-access',
        '--env',
        'MINIO_ROOT_PASSWORD=ci-only-storage-secret',
        '--env',
        'MINIO_API_CORS_ALLOW_ORIGIN=http://127.0.0.1:3001',
        MINIO_IMAGE,
        'server',
        '/data',
      ],
      { timeoutMs: 3 * 60 * 1000 },
    );
    if (!outcome.ok)
      throw commandFailure(
        'MinIO image pull/start failed',
        'IMAGE_PULL_OR_BUILD_FAILURE',
      );
  }

  await Promise.all([
    ...(options.postgres ? [waitForContainer(context, identity.postgres)] : []),
    ...(options.redis ? [waitForContainer(context, identity.redis)] : []),
  ]);

  const postgresPort = options.postgres
    ? await publishedPort(context, identity.postgres, 5432)
    : null;
  const redisPort = options.redis
    ? await publishedPort(context, identity.redis, 6379)
    : null;
  const minioPort = options.minio
    ? await publishedPort(context, identity.minio, 9000)
    : null;
  if (minioPort) {
    await waitForHttpReady(`http://127.0.0.1:${minioPort}/minio/health/ready`);
  }
  const databaseUrl = postgresPort
    ? `postgresql://moazez_ci:ci-only-postgres-password@127.0.0.1:${postgresPort}/${identity.database}?schema=public`
    : 'postgresql://build:build@127.0.0.1:1/build?schema=public';
  const redisUrl = redisPort
    ? `redis://127.0.0.1:${redisPort}/0`
    : 'redis://127.0.0.1:1/0';
  const storageEndpoint = minioPort
    ? `http://127.0.0.1:${minioPort}`
    : 'http://127.0.0.1:1';
  context.sensitiveValues.push(databaseUrl, redisUrl, storageEndpoint);
  context.testEnvironment = {
    ...context.environment,
    NODE_ENV: 'test',
    APP_PORT: '3000',
    APP_PROBE_PORT: '9090',
    APP_URL: 'http://127.0.0.1:3000',
    APP_CORS_ORIGINS: 'https://schools.moazez.invalid',
    SWAGGER_ENABLED: 'false',
    DATABASE_URL: databaseUrl,
    QUEUE_REDIS_URL: redisUrl,
    REALTIME_REDIS_URL: redisUrl,
    TEST_QUEUE_REDIS_URL: redisUrl,
    TEST_REALTIME_REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: 'ci-only-access-secret-not-for-production',
    JWT_REFRESH_SECRET: 'ci-only-refresh-secret-not-for-production',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    SETTINGS_SECRET_ENCRYPTION_KEY:
      'hex:0000000000000000000000000000000000000000000000000000000000000000',
    STORAGE_PROVIDER: 'minio',
    STORAGE_ENDPOINT: storageEndpoint,
    STORAGE_ACCESS_KEY: 'ci-only-storage-access',
    STORAGE_SECRET_KEY: 'ci-only-storage-secret',
    STORAGE_BUCKET: identity.privateBucket,
    STORAGE_PUBLIC_BUCKET: identity.publicBucket,
    STORAGE_CORS_ORIGINS: 'http://127.0.0.1:3001',
    FCM_ENABLED: 'false',
    FCM_DRY_RUN: 'true',
    SEED_DEMO_DATA: 'true',
    LOG_LEVEL: 'error',
    RUN_PRD1_G05_REDIS_INTEGRATION: '1',
    PRD1_G05_REDIS_URL: redisPort
      ? `redis://127.0.0.1:${redisPort}/15`
      : redisUrl,
  };
  context.sensitiveValues.push(
    context.testEnvironment.JWT_ACCESS_SECRET,
    context.testEnvironment.JWT_REFRESH_SECRET,
    context.testEnvironment.SETTINGS_SECRET_ENCRYPTION_KEY,
    context.testEnvironment.STORAGE_ACCESS_KEY,
    context.testEnvironment.STORAGE_SECRET_KEY,
    context.testEnvironment.PRD1_G05_REDIS_URL,
  );

  if (options.minio) await provisionBuckets(context);
}

async function preloadSelfContainedImages(context, profile) {
  const images = SELF_CONTAINED_PROFILE_IMAGES[profile];
  if (!images) {
    throw commandFailure(
      `No Docker image preload contract exists for ${profile}`,
      'WORKFLOW_CONFIGURATION_FAILURE',
    );
  }
  await assertLocalDocker(context);
  for (const { id, image } of images) {
    await runStage(context, {
      id: `${profile}-pull-${id}`,
      command: 'docker',
      args: ['pull', image],
      classification: 'IMAGE_PULL_OR_BUILD_FAILURE',
      timeoutMs: 5 * 60 * 1000,
      env: context.environment,
    });
  }
}

async function provisionBuckets(context) {
  const script = [
    "const {Client}=require('minio');",
    'const endpoint=new URL(process.env.STORAGE_ENDPOINT);',
    'const client=new Client({endPoint:endpoint.hostname,port:Number(endpoint.port),useSSL:false,accessKey:process.env.STORAGE_ACCESS_KEY,secretKey:process.env.STORAGE_SECRET_KEY});',
    'void (async()=>{for(const bucket of [process.env.STORAGE_BUCKET,process.env.STORAGE_PUBLIC_BUCKET]){if(!(await client.bucketExists(bucket)))await client.makeBucket(bucket)}})().catch(()=>{process.exitCode=1});',
  ].join('');
  await runStage(
    context,
    nodeStage(
      'provision-minio-buckets',
      ['-e', script],
      'RUNNER_INFRA_FAILURE',
      { timeoutMs: 60_000, env: context.testEnvironment },
    ),
  );
}

async function prepareDatabase(context) {
  await runStage(context, {
    id: 'migrate-deploy',
    command: npxExecutable(),
    args: ['prisma', 'migrate', 'deploy'],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 8 * 60 * 1000,
    env: context.testEnvironment,
  });
  await runStage(context, {
    id: 'seed',
    command: npmExecutable(),
    args: ['run', 'seed'],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 8 * 60 * 1000,
    env: context.testEnvironment,
  });
}

async function readAppliedMigrationCount(context, id) {
  const outcome = await runStage(context, {
    id,
    command: 'docker',
    args: [
      'exec',
      context.identity.postgres,
      'psql',
      '--username=moazez_ci',
      `--dbname=${context.identity.database}`,
      '--tuples-only',
      '--no-align',
      '--command=SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;',
    ],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 60_000,
    env: context.testEnvironment,
  });
  parseAppliedMigrationCount(outcome.outputTail);
  return outcome.outputTail;
}

async function prepareMediaDatabase(context) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'moazez-ci-media-base-'),
  );
  context.cleanup.add('owned migration-base directory', async () => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    if (fs.existsSync(temporaryRoot)) {
      throw new Error('Migration-base directory cleanup verification failed');
    }
  });
  const archivePath = path.join(temporaryRoot, 'base-migrations.tar');
  await runStage(context, {
    id: 'media-base-migration-archive',
    command: 'git',
    args: [
      'archive',
      '--format=tar',
      `--output=${archivePath}`,
      context.plan.baseSha,
      'prisma/migrations',
    ],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 2 * 60 * 1000,
  });
  await runStage(context, {
    id: 'media-base-migration-extract',
    command: 'tar',
    args: ['-xf', archivePath, '-C', temporaryRoot],
    classification: 'RUNNER_INFRA_FAILURE',
    timeoutMs: 2 * 60 * 1000,
  });
  fs.copyFileSync(
    path.join(context.repositoryRoot, 'prisma', 'schema.prisma'),
    path.join(temporaryRoot, 'prisma', 'schema.prisma'),
  );
  await runStage(context, {
    id: 'media-base-migration-deploy',
    command: npxExecutable(),
    args: [
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      path.join(temporaryRoot, 'prisma', 'schema.prisma'),
    ],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 8 * 60 * 1000,
    env: context.testEnvironment,
  });
  await runStage(context, {
    id: 'legacy-learning-media-classification',
    command: npmExecutable(),
    args: ['run', 'verify:legacy-learning-media'],
    classification: 'GOVERNANCE_INVARIANT_FAILURE',
    timeoutMs: 3 * 60 * 1000,
    env: context.testEnvironment,
  });
  await runStage(context, {
    id: 'media-current-migration-deploy',
    command: npxExecutable(),
    args: ['prisma', 'migrate', 'deploy'],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 8 * 60 * 1000,
    env: context.testEnvironment,
  });
  await runStage(context, {
    id: 'media-seed',
    command: npmExecutable(),
    args: ['run', 'seed'],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 8 * 60 * 1000,
    env: context.testEnvironment,
  });
}

function readJestCounts(resultPath) {
  const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  return {
    testSuiteCount: parsed.numTotalTestSuites ?? null,
    testCount: parsed.numTotalTests ?? null,
    skippedTestCount: parsed.numPendingTests ?? null,
  };
}

async function runHostJest(context, files, id = 'jest') {
  if (files.length === 0) return;
  const resultPath = path.join(
    path.dirname(context.evidencePath),
    `${context.shard.id}-${id}.json`,
  );
  const usesE2eConfig = files.some((file) => file.startsWith('test/'));
  const args = [
    path.join('node_modules', 'jest', 'bin', 'jest.js'),
    ...(usesE2eConfig ? ['--config', './test/jest-e2e.json'] : []),
    '--runInBand',
    '--detectOpenHandles',
    '--runTestsByPath',
    ...files,
    '--json',
    '--outputFile',
    resultPath,
  ];
  const outcome = await runStage(
    context,
    nodeStage(id, args, 'SOURCE_TEST_FAILURE', {
      timeoutMs: 20 * 60 * 1000,
      env: context.testEnvironment ?? context.environment,
    }),
  );
  if (hasJestOpenHandleWarning(outcome.outputTail)) {
    failStagePostcondition(context, id, 'SOURCE_TEST_FAILURE');
    throw commandFailure(
      `${id} reported an open-handle warning`,
      'SOURCE_TEST_FAILURE',
    );
  }
  const counts = readJestCounts(resultPath);
  if (counts.skippedTestCount > 0) {
    failStagePostcondition(context, id, 'SOURCE_TEST_FAILURE');
    throw commandFailure(
      `${id} reported ${counts.skippedTestCount} skipped tests`,
      'SOURCE_TEST_FAILURE',
    );
  }
  context.evidence.testSuiteCount =
    (context.evidence.testSuiteCount ?? 0) + (counts.testSuiteCount ?? 0);
  context.evidence.testCount =
    (context.evidence.testCount ?? 0) + (counts.testCount ?? 0);
  context.evidence.skippedTestCount =
    (context.evidence.skippedTestCount ?? 0) + (counts.skippedTestCount ?? 0);
}

async function runMediaContainerJest(context, options) {
  const mountSource = path.dirname(context.evidencePath);
  const resultPath = path.join(mountSource, options.resultFileName);
  const containerEnvironmentArgs = MEDIA_CONTAINER_ENVIRONMENT_KEYS.flatMap(
    (key) => ['--env', key],
  );
  const containerName = registerOwnedOneShotContainer(context, options.id);
  const jestCommand = [
    ...(options.generatePrisma ? ['npx prisma generate &&'] : []),
    'node node_modules/jest/bin/jest.js',
    ...(options.configPath ? [`--config ${options.configPath}`] : []),
    '--runInBand',
    '--detectOpenHandles',
    '--json',
    `--outputFile /ci-evidence/${options.resultFileName}`,
    '--runTestsByPath "$@"',
  ].join(' ');
  const outcome = await runStage(context, {
    id: options.id,
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--name',
      containerName,
      ...dockerLabelArgs(context.identity.labels),
      '--user',
      'root',
      '--network',
      'host',
      ...containerEnvironmentArgs,
      '--mount',
      `type=bind,source=${mountSource},target=/ci-evidence`,
      '--entrypoint',
      'sh',
      context.identity.mediaTestImage,
      '-c',
      jestCommand,
      'sh',
      ...options.files,
    ],
    classification: 'SOURCE_TEST_FAILURE',
    timeoutMs: 15 * 60 * 1000,
    env: context.testEnvironment,
  });
  if (hasJestOpenHandleWarning(outcome.outputTail)) {
    failStagePostcondition(context, options.id, 'SOURCE_TEST_FAILURE');
    throw commandFailure(
      `${options.id} reported an open-handle warning`,
      'SOURCE_TEST_FAILURE',
    );
  }
  if (!fs.existsSync(resultPath)) {
    failStagePostcondition(context, options.id, 'ARTIFACT_FAILURE');
    throw commandFailure(
      `${options.id} did not write its Jest result`,
      'ARTIFACT_FAILURE',
    );
  }
  const counts = readJestCounts(resultPath);
  if (counts.skippedTestCount > 0) {
    failStagePostcondition(context, options.id, 'SOURCE_TEST_FAILURE');
    throw commandFailure(
      `${options.id} reported ${counts.skippedTestCount} skipped tests`,
      'SOURCE_TEST_FAILURE',
    );
  }
  return counts;
}

function registerOwnedOneShotContainer(context, id) {
  const component = String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 30);
  const name = `moazez-ci-task-${component}-${context.identity.suffix}`;
  context.cleanup.add(`owned ${id} container`, () =>
    removeAndVerify(context, 'container', name),
  );
  return name;
}

function failStagePostcondition(context, id, classification) {
  const record = [...context.evidence.stages]
    .reverse()
    .find((stage) => stage.id === id);
  if (record) {
    record.status = 'FAIL';
    record.classification = classification;
    writeEvidence(
      context.evidencePath,
      context.evidence,
      context.sensitiveValues,
    );
  }
}

async function runTapFiles(context, files) {
  if (files.length === 0) return;
  await runStage(
    context,
    nodeStage(
      'node-tap',
      ['--require', 'ts-node/register', '--test', ...files],
      context.shard.profile === 'orchestrator'
        ? 'CI_ORCHESTRATOR_FAILURE'
        : 'GOVERNANCE_INVARIANT_FAILURE',
      {
        timeoutMs: 12 * 60 * 1000,
        env: context.testEnvironment ?? context.environment,
      },
    ),
  );
}

async function runPreflight(context) {
  const head = await context.execute(
    'git',
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    {
      cwd: context.repositoryRoot,
      env: context.environment,
      timeoutMs: 30_000,
    },
  );
  if (!head.ok || head.outputTail.trim() !== context.plan.candidateSha) {
    throw commandFailure(
      'Checked out HEAD does not match the planned candidate SHA',
      'WORKFLOW_CONFIGURATION_FAILURE',
    );
  }
  await runStage(context, {
    id: 'candidate-diff-check',
    command: 'git',
    args: [
      'diff',
      '--check',
      `${context.plan.mergeBaseSha}..${context.plan.candidateSha}`,
    ],
    classification: 'WORKFLOW_CONFIGURATION_FAILURE',
    timeoutMs: 60_000,
  });
  verifyTrackedEnvironmentScope(context.repositoryRoot);
  verifyStorageSourceBoundary(context.repositoryRoot);
  await installDependencies(context);
  await runStage(
    context,
    nodeStage(
      'current-governance',
      ['scripts/ci/validate-production-readiness-governance.cjs'],
      'GOVERNANCE_INVARIANT_FAILURE',
      { timeoutMs: 2 * 60 * 1000 },
    ),
  );
  await runStage(
    context,
    nodeStage(
      'migration-governance',
      ['scripts/check-migration-governance.cjs'],
      'MIGRATION_FAILURE',
      {
        timeoutMs: 2 * 60 * 1000,
        env: {
          ...context.environment,
          MIGRATION_BASE_REF: context.plan.baseSha,
        },
      },
    ),
  );
  await runStage(context, {
    id: 'prisma-validate',
    command: npxExecutable(),
    args: ['prisma', 'validate'],
    classification: 'MIGRATION_FAILURE',
    timeoutMs: 2 * 60 * 1000,
    env: {
      ...context.environment,
      DATABASE_URL:
        'postgresql://schema:schema@127.0.0.1:1/schema?schema=public',
    },
  });
  await runStage(context, {
    id: 'prisma-generate',
    command: npxExecutable(),
    args: ['prisma', 'generate'],
    classification: 'CI_ORCHESTRATOR_FAILURE',
    timeoutMs: 3 * 60 * 1000,
    env: {
      ...context.environment,
      DATABASE_URL:
        'postgresql://generate:generate@127.0.0.1:1/generate?schema=public',
    },
  });
  await runStage(
    context,
    nodeStage(
      'runtime-policy',
      ['scripts/verify-runtime-policy.cjs'],
      'GOVERNANCE_INVARIANT_FAILURE',
      { timeoutMs: 2 * 60 * 1000 },
    ),
  );
  await runStage(
    context,
    nodeStage(
      'fixture-contract',
      ['--require', 'ts-node/register', 'scripts/ci/ci-fixture-contract.cjs'],
      'FIXTURE_CONTRACT_FAILURE',
      { timeoutMs: 3 * 60 * 1000 },
    ),
  );
  await runStage(context, {
    id: 'nest-build',
    command: npmExecutable(),
    args: ['run', 'build'],
    classification: 'SOURCE_TEST_FAILURE',
    timeoutMs: 8 * 60 * 1000,
    env: { ...context.environment, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
}

function verifyTrackedEnvironmentScope(repositoryRoot) {
  const { execFileSync } = require('node:child_process');
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  const forbidden = output
    .split('\0')
    .filter(Boolean)
    .map(normalizeRepositoryPath)
    .filter((file) => /(?:^|\/)\.env(?:\..+)?$/u.test(file))
    .filter((file) => !/(?:\.example|\.template|\.sample)$/u.test(file));
  if (forbidden.length > 0) {
    throw commandFailure(
      `Tracked environment files are forbidden: ${forbidden.join(', ')}`,
      'PERMISSION_FAILURE',
    );
  }
}

function verifyStorageSourceBoundary(repositoryRoot) {
  const { execFileSync } = require('node:child_process');
  const files = execFileSync('git', ['ls-files', '-z', '--', 'src/**/*.ts'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
    .split('\0')
    .filter(Boolean)
    .map(normalizeRepositoryPath)
    .filter((file) => !/(?:\.spec\.ts$|\/tests\/)/u.test(file));
  const violations = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    const isStorageInfrastructure = file.startsWith(
      'src/infrastructure/storage/',
    );
    if (
      !isStorageInfrastructure &&
      /\b(?:MinioAdapter|GcsAdapter)\b/u.test(source)
    ) {
      violations.push(`${file}:direct-adapter`);
    }
    if (
      !isStorageInfrastructure &&
      /from\s+['"](?:minio|@google-cloud\/storage)['"]/u.test(source)
    ) {
      violations.push(`${file}:provider-sdk`);
    }
  }
  if (violations.length > 0) {
    throw commandFailure(
      `Storage source boundary violations: ${violations.join(', ')}`,
      'GOVERNANCE_INVARIANT_FAILURE',
    );
  }
}

async function installDependencies(context) {
  await runStage(context, {
    id: 'npm-ci',
    command: npmExecutable(),
    args: ['ci'],
    classification: 'DEPENDENCY_INSTALL_FAILURE',
    timeoutMs: 10 * 60 * 1000,
  });
}

async function generatePrisma(context) {
  await runStage(context, {
    id: 'prisma-generate',
    command: npxExecutable(),
    args: ['prisma', 'generate'],
    classification: 'CI_ORCHESTRATOR_FAILURE',
    timeoutMs: 3 * 60 * 1000,
    env: {
      ...context.environment,
      DATABASE_URL:
        'postgresql://generate:generate@127.0.0.1:1/generate?schema=public',
    },
  });
}

async function runMediaRuntime(context, files) {
  await assertLocalDocker(context);
  context.cleanup.add('owned media-test image', () =>
    removeAndVerify(context, 'image', context.identity.mediaTestImage),
  );
  context.cleanup.add('owned runtime image', () =>
    removeAndVerify(context, 'image', context.identity.runtimeImage),
  );
  context.cleanup.add('owned health-probe resources', () =>
    cleanupHealthResources(context),
  );
  await runStage(context, {
    id: 'build-runtime-image',
    command: 'docker',
    args: ['build', '--tag', context.identity.runtimeImage, '.'],
    classification: 'IMAGE_PULL_OR_BUILD_FAILURE',
    timeoutMs: 20 * 60 * 1000,
    env: { ...context.environment, DOCKER_BUILDKIT: '1' },
  });
  const runtimeIdentityContainer = registerOwnedOneShotContainer(
    context,
    'runtime-identity',
  );
  await runStage(context, {
    id: 'build-media-test-image',
    command: 'docker',
    args: [
      'build',
      '--target',
      'media-test',
      '--tag',
      context.identity.mediaTestImage,
      '.',
    ],
    classification: 'IMAGE_PULL_OR_BUILD_FAILURE',
    timeoutMs: 20 * 60 * 1000,
    env: { ...context.environment, DOCKER_BUILDKIT: '1' },
  });
  await runStage(context, {
    id: 'runtime-identity',
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--name',
      runtimeIdentityContainer,
      ...dockerLabelArgs(context.identity.labels),
      '--network',
      'none',
      '--entrypoint',
      'sh',
      context.identity.runtimeImage,
      '-c',
      'test "$(node --version)" = "v22.23.1" && test "$(id -u)" != 0 && node -e "require(\'firebase-admin/app\');require(\'firebase-admin/messaging\');require(\'@prisma/client\')"',
    ],
    classification: 'GOVERNANCE_INVARIANT_FAILURE',
    timeoutMs: 2 * 60 * 1000,
    env: context.testEnvironment,
  });
  const ffprobeContainer = registerOwnedOneShotContainer(
    context,
    'ffprobe-runtime-contract',
  );
  await runStage(context, {
    id: 'ffprobe-runtime-contract',
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--name',
      ffprobeContainer,
      ...dockerLabelArgs(context.identity.labels),
      '--network',
      'none',
      '--entrypoint',
      'node',
      context.identity.runtimeImage,
      'scripts/verify-media-runtime.cjs',
    ],
    classification: 'GOVERNANCE_INVARIANT_FAILURE',
    timeoutMs: 3 * 60 * 1000,
    env: context.testEnvironment,
  });

  const runtimeFiles = files.filter((file) =>
    MEDIA_RUNTIME_JEST_FILES.has(file),
  );
  if (runtimeFiles.length !== MEDIA_RUNTIME_JEST_FILES.size) {
    throw commandFailure(
      'Media runtime shard does not own the complete image contract set',
      'CI_ORCHESTRATOR_FAILURE',
    );
  }
  const sourceRuntimeFiles = runtimeFiles.filter((file) =>
    file.startsWith('src/'),
  );
  const integrationRuntimeFiles = runtimeFiles.filter((file) =>
    file.startsWith('test/'),
  );
  const runtimeCounts = [
    await runMediaContainerJest(context, {
      id: 'media-test-source-runtime-contracts',
      files: sourceRuntimeFiles,
      resultFileName: 'media-source-runtime-jest.json',
      generatePrisma: true,
    }),
    await runMediaContainerJest(context, {
      id: 'media-test-verifier-integration',
      files: integrationRuntimeFiles,
      resultFileName: 'media-verifier-integration-jest.json',
      configPath: './test/jest-e2e.json',
      generatePrisma: false,
    }),
  ];
  context.evidence.testSuiteCount = runtimeCounts.reduce(
    (total, counts) => total + (counts.testSuiteCount ?? 0),
    0,
  );
  context.evidence.testCount = runtimeCounts.reduce(
    (total, counts) => total + (counts.testCount ?? 0),
    0,
  );
  context.evidence.skippedTestCount = runtimeCounts.reduce(
    (total, counts) => total + (counts.skippedTestCount ?? 0),
    0,
  );

  const healthDatabaseUrl = new URL(context.testEnvironment.DATABASE_URL);
  healthDatabaseUrl.hostname = context.identity.postgres;
  healthDatabaseUrl.port = '5432';
  const healthDatabaseUrlValue = healthDatabaseUrl.toString();
  const healthStorageEndpoint = `http://${context.identity.minio}:9000`;
  context.sensitiveValues.push(
    healthDatabaseUrlValue,
    healthStorageEndpoint,
  );
  const healthEnvironment = {
    ...context.testEnvironment,
    GITHUB_RUN_ID: context.identity.runId,
    GITHUB_RUN_ATTEMPT: context.identity.attempt,
    GITHUB_WORKSPACE: context.repositoryRoot,
    RUNNER_TEMP: process.env.RUNNER_TEMP ?? os.tmpdir(),
    HEALTH_RUNTIME_IMAGE: context.identity.runtimeImage,
    HEALTH_POSTGRES_CONTAINER: context.identity.postgres,
    HEALTH_DATABASE_URL: healthDatabaseUrlValue,
    HEALTH_MINIO_CONTAINER: context.identity.minio,
    HEALTH_STORAGE_ENDPOINT: healthStorageEndpoint,
    HEALTH_MINIO_READY_URL: `${context.testEnvironment.STORAGE_ENDPOINT}/minio/health/ready`,
  };
  const healthFailures = [];
  for (const scenario of HEALTH_SCENARIOS) {
    try {
      await runStage(context, {
        id: `health-${scenario}`,
        command: 'bash',
        args: ['scripts/ci/health-probe-runtime.sh', scenario],
        classification: 'GOVERNANCE_INVARIANT_FAILURE',
        timeoutMs: 5 * 60 * 1000,
        env: healthEnvironment,
      });
    } catch (error) {
      healthFailures.push({ scenario, error });
    }
  }
  if (healthFailures.length > 0) {
    throw commandFailure(
      `Media health scenarios failed: ${healthFailures
        .map(({ scenario }) => scenario)
        .join(', ')}`,
      healthFailures[0].error.classification ?? 'GOVERNANCE_INVARIANT_FAILURE',
    );
  }
}

async function cleanupHealthResources(context) {
  const filter = `name=${context.identity.runId}`;
  const containers = await docker(
    context,
    ['ps', '--all', '--quiet', '--filter', filter],
    { timeoutMs: 30_000 },
  );
  if (containers.ok) {
    for (const id of containers.outputTail.split(/\r?\n/u).filter(Boolean)) {
      await docker(context, ['rm', '--force', id], { timeoutMs: 30_000 });
    }
  }
  const networks = await docker(
    context,
    ['network', 'ls', '--quiet', '--filter', filter],
    { timeoutMs: 30_000 },
  );
  if (networks.ok) {
    for (const id of networks.outputTail.split(/\r?\n/u).filter(Boolean)) {
      await docker(context, ['network', 'rm', id], { timeoutMs: 30_000 });
    }
  }
  const remainingContainers = await docker(
    context,
    ['ps', '--all', '--quiet', '--filter', filter],
    { timeoutMs: 30_000 },
  );
  const remainingNetworks = await docker(
    context,
    ['network', 'ls', '--quiet', '--filter', filter],
    { timeoutMs: 30_000 },
  );
  if (
    !remainingContainers.ok ||
    !remainingNetworks.ok ||
    remainingContainers.outputTail.trim() ||
    remainingNetworks.outputTail.trim()
  ) {
    throw new Error('Health-probe cleanup verification failed');
  }
}

async function runRegression(context) {
  await installDependencies(context);
  await generatePrisma(context);
  const profile = context.shard.profile;
  const tapFiles = context.shard.files.filter((file) =>
    file.startsWith('scripts/tests/'),
  );
  const jestFiles = context.shard.files.filter(
    (file) => !file.startsWith('scripts/tests/'),
  );

  if (SELF_CONTAINED_PROFILES.has(profile)) {
    const runLabel = SELF_CONTAINED_RUN_LABELS[profile];
    context.cleanup.add(`owned ${profile} harness resources`, () =>
      cleanupDockerResourcesByLabel(
        context,
        runLabel,
        context.identity.harnessRunId,
      ),
    );
    await preloadSelfContainedImages(context, profile);
    const harnessOwnedTapFiles = new Set([
      ...(profile === 'prd3-g01'
        ? ['scripts/tests/prd3-g01-c-database-privileges.test.cjs']
        : []),
      ...(profile === 'prd3-g04'
        ? ['scripts/tests/prd3-g04-governed-migration-job.test.cjs']
        : []),
      ...(profile === 'prd3-g05'
        ? ['scripts/tests/prd3-g05-clean-start.test.cjs']
        : []),
    ]);
    await runTapFiles(
      context,
      tapFiles.filter((file) => !harnessOwnedTapFiles.has(file)),
    );
    const [script, ...args] = PROFILE_HARNESSES[profile];
    await runStage(
      context,
      nodeStage(
        `${profile}-durable-harness`,
        [script, ...args],
        'GOVERNANCE_INVARIANT_FAILURE',
        {
          timeoutMs: 25 * 60 * 1000,
          env: {
            ...context.environment,
            MOAZEZ_CI_PARENT_RUN_ID: context.identity.harnessRunId,
          },
        },
      ),
    );
  } else if (profile === 'runtime-governance' || profile === 'orchestrator') {
    await runTapFiles(context, tapFiles);
  } else {
    const needsServices = SERVICE_PROFILES.has(profile);
    const redisOnly = REDIS_ONLY_PROFILES.has(profile);
    if (needsServices || redisOnly) {
      await startInfrastructure(context, {
        postgres: needsServices,
        redis:
          redisOnly || (needsServices && profile !== 'migration-governance'),
        minio: needsServices && profile !== 'migration-governance',
      });
      if (profile === 'migration-governance') {
        await runStage(
          context,
          nodeStage(
            'migration-rebaseline-authorization',
            ['scripts/authorize-migration-rebaseline-0a.cjs'],
            'MIGRATION_FAILURE',
            { timeoutMs: 2 * 60 * 1000 },
          ),
        );
      }
      if (profile === 'media-storage') await prepareMediaDatabase(context);
      else if (needsServices) await prepareDatabase(context);
    } else {
      context.testEnvironment = createBaselineTestEnvironment(
        context.environment,
      );
    }

    if (profile === 'migration-governance') {
      await runTapFiles(context, tapFiles);
      const beforeCount = await readAppliedMigrationCount(
        context,
        'migration-count-before-second-deploy',
      );
      const secondDeploy = await runStage(context, {
        id: 'migration-second-deploy-noop',
        command: npxExecutable(),
        args: ['prisma', 'migrate', 'deploy'],
        classification: 'MIGRATION_FAILURE',
        timeoutMs: 5 * 60 * 1000,
        env: context.testEnvironment,
      });
      const afterCount = await readAppliedMigrationCount(
        context,
        'migration-count-after-second-deploy',
      );
      try {
        assertMigrationNoopEvidence(
          beforeCount,
          afterCount,
          secondDeploy.outputTail,
        );
      } catch (error) {
        failStagePostcondition(
          context,
          'migration-second-deploy-noop',
          'MIGRATION_FAILURE',
        );
        throw error;
      }
      await runStage(context, {
        id: 'migration-final-status',
        command: npxExecutable(),
        args: ['prisma', 'migrate', 'status'],
        classification: 'MIGRATION_FAILURE',
        timeoutMs: 3 * 60 * 1000,
        env: context.testEnvironment,
      });
    } else if (profile === 'media-storage') {
      await runMediaRuntime(context, jestFiles);
      const hostFiles = jestFiles.filter(
        (file) => !MEDIA_RUNTIME_JEST_FILES.has(file),
      );
      await runHostJest(context, hostFiles, 'media-storage-host-contracts');
    } else {
      await runTapFiles(context, tapFiles);
      await runHostJest(context, jestFiles);
    }
  }
  context.evidence.executedTestFiles = [...context.shard.files];
}

async function runShard(options = {}) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? path.resolve(__dirname, '../..'),
  );
  const plan = options.plan ?? loadPlan(options.planPath);
  const shard = validateShard(plan, options.shardId, repositoryRoot);
  const evidencePath = path.resolve(options.evidencePath);
  const started = Date.now();
  const evidence = createInitialEvidence(
    plan,
    shard,
    new Date(started).toISOString(),
  );
  const cleanup = new CleanupManager();
  const context = {
    repositoryRoot,
    plan,
    shard,
    evidence,
    evidencePath,
    cleanup,
    identity: createResourceIdentity(plan, shard, options.environment),
    deadlineMs:
      started +
      Math.max(
        60_000,
        (shard.timeoutMinutes - SHARD_CLEANUP_RESERVE_MINUTES) * 60 * 1000,
      ),
    environment: safeHostEnvironment(options.environment),
    testEnvironment: null,
    sensitiveValues: [],
    execute: options.execute ?? runProcess,
  };
  context.environment.CI_CANDIDATE_SHA = plan.candidateSha;
  context.environment.CI_BASE_SHA = plan.baseSha;
  context.environment.MIGRATION_BASE_REF = plan.baseSha;
  context.testEnvironment = createBaselineTestEnvironment(context.environment);
  context.sensitiveValues.push(
    context.testEnvironment.DATABASE_URL,
    context.testEnvironment.QUEUE_REDIS_URL,
    context.testEnvironment.REALTIME_REDIS_URL,
    context.testEnvironment.JWT_ACCESS_SECRET,
    context.testEnvironment.JWT_REFRESH_SECRET,
    context.testEnvironment.SETTINGS_SECRET_ENCRYPTION_KEY,
    context.testEnvironment.STORAGE_ACCESS_KEY,
    context.testEnvironment.STORAGE_SECRET_KEY,
  );
  writeEvidence(evidencePath, evidence);
  let primaryError = null;
  try {
    assertPlanWorkflowIdentity(plan, options.environment ?? process.env);
    if (shard.profile === 'preflight') await runPreflight(context);
    else await runRegression(context);
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupOutcome = await cleanup.run();
    evidence.cleanupStatus = cleanupOutcome.ok ? 'PASS' : 'FAIL';
    if (!cleanupOutcome.ok) evidence.cleanupFailures = cleanupOutcome.failures;
    const finished = Date.now();
    evidence.finishedAt = new Date(finished).toISOString();
    evidence.durationMs = finished - started;
    if (!cleanupOutcome.ok) {
      evidence.status = 'FAIL';
      evidence.classification = 'TEARDOWN_FAILURE';
      if (primaryError)
        evidence.primaryClassification =
          primaryError.classification ?? 'UNCLASSIFIED';
    } else if (primaryError) {
      evidence.status = 'FAIL';
      evidence.classification = FAILURE_CLASSIFICATIONS.includes(
        primaryError.classification,
      )
        ? primaryError.classification
        : 'UNCLASSIFIED';
      evidence.failure = redactText(
        primaryError.message,
        context.sensitiveValues,
      ).slice(-4000);
      evidence.timedOut = Boolean(primaryError.timedOut);
    } else {
      evidence.status = 'PASS';
      evidence.classification = null;
    }
    writeEvidence(evidencePath, evidence, context.sensitiveValues);
  }
  if (evidence.status !== 'PASS') {
    const error = new Error(`${shard.id} failed: ${evidence.classification}`);
    error.evidence = evidence;
    throw error;
  }
  return evidence;
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/ci/run-ci-shard.cjs --plan <plan.json> --shard <id> --evidence <path>',
      '',
      'The special shard ID "preflight" executes the service-free preflight.',
      '',
    ].join('\n'),
  );
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const cli = parseCliArgs(argv);
  if (cli.help) {
    printUsage();
    return null;
  }
  const required = ['planPath', 'shardId', 'evidencePath'];
  for (const field of required) {
    if (!cli[field]) throw new Error(`Missing required option: ${field}`);
  }
  return runShard({ ...cli, environment });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  CleanupManager,
  FAILURE_CLASSIFICATIONS,
  HEALTH_SCENARIOS,
  PROFILE_HARNESSES,
  SELF_CONTAINED_PROFILE_IMAGES,
  SERVICE_PROFILES,
  assertMigrationNoopEvidence,
  assertPlanWorkflowIdentity,
  cleanupDockerResourcesByLabel,
  commandFailure,
  cleanupHealthResources,
  createBaselineTestEnvironment,
  createInitialEvidence,
  createResourceIdentity,
  hasJestOpenHandleWarning,
  loadPlan,
  normalizeRepositoryPath,
  parseCliArgs,
  parseAppliedMigrationCount,
  preloadSelfContainedImages,
  prepareMediaDatabase,
  redactText,
  removeAndVerify,
  runProcess,
  runShard,
  safeHostEnvironment,
  sanitizeEvidence,
  validateShard,
  verifyStorageSourceBoundary,
  verifyTrackedEnvironmentScope,
  writeEvidence,
};
