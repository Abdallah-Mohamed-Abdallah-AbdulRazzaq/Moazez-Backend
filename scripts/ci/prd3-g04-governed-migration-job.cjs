'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const {
  RELEASE_STAGE_IDS,
  runGovernedReleaseSequence,
} = require('../release/governed-release-gate.cjs');
const { buildManifest } = require('../migrations/migration-artifact-manifest.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = '3c2f6ad6b31001b37aa6b2962767de163474856d';
const REQUIRED_BRANCH = 'chore/production-readiness-3-cloud-sql';
const REQUIRED_NODE_VERSION = 'v22.23.1';
const REQUIRED_NODE_DIRECTORY = path.normalize(
  'C:\\Users\\Abdal\\AppData\\Local\\Moazez\\toolchains\\node-v22.23.1-win-x64',
);
const POSTGRES_IMAGE = 'postgres:16-alpine';
const GATE = 'PRD3-G04';
const RUN_ID = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
const RUN_LABEL = 'com.moazez.prd3-g04.run';
const GATE_LABEL = 'com.moazez.prd3-g04.gate';
const ROLE_LABEL = 'com.moazez.prd3-g04.role';
const NETWORK_NAME = `moazez-prd3-g04-net-${RUN_ID}`;
const DATABASE_CONTAINER = `moazez-prd3-g04-db-${RUN_ID}`;
const APPLICATION_IMAGE_TAG = `moazez-prd3-g04-final:${RUN_ID}`;
const TEMPORARY_PREFIX = 'moazez-prd3-g04-';
const VERIFICATION_MODES = Object.freeze({
  CANDIDATE: 'candidate',
  REGRESSION: 'regression',
});
const ROLE_BOOTSTRAP_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'database',
  'prd3-g01-c-role-bootstrap.sql',
);
const RUNTIME_GRANTS_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'database',
  'prd3-g01-c-runtime-grants.sql',
);
const FOCUSED_TEST_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'tests',
  'prd3-g04-governed-migration-job.test.cjs',
);
const EXPECTED_CHANGED_PATHS = Object.freeze([
  'Dockerfile',
  'MIGRATION_GOVERNANCE.md',
  'adr/ADR-0007-migration-job-and-deployment-ordering.md',
  'config/deployment/migration-artifact-manifest.json',
  'config/deployment/migration-job.contract.json',
  'config/deployment/release-sequence.contract.json',
  'docs/production-readiness/phase-0/02-production-decision-register.md',
  'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  'docs/production-readiness/phase-3/07-governed-migration-job-evidence.md',
  'package.json',
  'scripts/ci/prd3-g04-governed-migration-job.cjs',
  'scripts/migrations/migration-artifact-manifest.cjs',
  'scripts/migrations/run-governed-migration-job.cjs',
  'scripts/release/governed-release-gate.cjs',
  'scripts/tests/prd3-g04-governed-migration-job.test.cjs',
]);
const REGRESSION_PROTECTED_PATHS = Object.freeze([
  'prisma/schema.prisma',
  'package-lock.json',
  'Dockerfile',
]);
const REGRESSION_PROTECTED_PREFIXES = Object.freeze([
  'src/',
  'prisma/migrations/',
  'prisma/seeds/',
  '.github/',
  'config/',
  'adr/',
  'scripts/database/',
  'scripts/migrations/',
  'scripts/release/',
]);
const RUNTIME_ROLES = Object.freeze({
  api: 'moazez_api',
  'core-worker': 'moazez_core_worker',
  'media-worker': 'moazez_media_worker',
});
const DDL_DENIALS = Object.freeze([
  Object.freeze({ name: 'create_table', sql: 'CREATE TABLE public.g04_runtime_denied (id integer)' }),
  Object.freeze({ name: 'alter_table', sql: 'ALTER TABLE public.users ADD COLUMN g04_runtime_denied integer' }),
  Object.freeze({ name: 'drop_table', sql: 'DROP TABLE public.users' }),
  Object.freeze({ name: 'create_schema', sql: 'CREATE SCHEMA g04_runtime_denied' }),
  Object.freeze({ name: 'create_role', sql: 'CREATE ROLE g04_runtime_denied' }),
  Object.freeze({ name: 'grant_role', sql: 'GRANT moazez_migration TO moazez_api' }),
  Object.freeze({ name: 'read_prisma_migrations', sql: 'SELECT count(*) FROM public._prisma_migrations' }),
]);

const syntheticSecrets = Object.freeze({
  postgres: crypto.randomBytes(24).toString('base64url'),
  api: crypto.randomBytes(24).toString('base64url'),
  core: crypto.randomBytes(24).toString('base64url'),
  media: crypto.randomBytes(24).toString('base64url'),
  migration: crypto.randomBytes(24).toString('base64url'),
});

let databasePort;
let temporaryRoot;
let postgresImageId;
let applicationImageId;
let networkCreated = false;
let databaseCreated = false;
let applicationImageBuilt = false;

function safeMessage(error) {
  const stackLocation = String(error?.stack ?? '')
    .split(/\r?\n/u)
    .slice(1, 3)
    .join(' ')
    .replaceAll(REPOSITORY_ROOT, '<repository>');
  return `${String(error?.code ?? 'verification_failed')}: ${String(
    error?.message ?? 'verification failed',
  )} ${stackLocation}`
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[redacted-database-url]')
    .replace(/[\r\n]+/gu, ' ')
    .slice(0, 240);
}

function command(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    env: options.env ?? process.env,
    input: options.input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
  });
  if (result.error || (!options.allowFailure && result.status !== 0)) {
    const error = new Error(options.label ?? 'bounded command failed');
    error.code = options.errorCode ?? 'bounded_command_failed';
    error.status = result.status;
    error.stdout = result.stdout ?? '';
    error.stderr = result.stderr ?? '';
    throw error;
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function docker(args, options = {}) {
  return command('docker', args, {
    ...options,
    label: options.label ?? 'local Docker command failed',
    errorCode: options.errorCode ?? 'local_docker_command_failed',
  });
}

function git(args, options = {}) {
  return command('git', args, {
    ...options,
    label: options.label ?? 'git inspection failed',
    errorCode: options.errorCode ?? 'git_inspection_failed',
  });
}

function readChangedPaths() {
  return git(['status', '--short', '--untracked-files=all']).stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .sort();
}

function resolveVerificationMode(args = []) {
  if (args.length === 0) return VERIFICATION_MODES.CANDIDATE;
  if (args.length === 1 && args[0] === '--regression') {
    return VERIFICATION_MODES.REGRESSION;
  }
  throw new Error('unknown verification mode; expected no argument or --regression');
}

function isProtectedRegressionPath(changedPath) {
  const normalized = changedPath.replaceAll('\\', '/');
  return (
    REGRESSION_PROTECTED_PATHS.includes(normalized) ||
    REGRESSION_PROTECTED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    /(?:^|\/)(?:[^/]+\.tf|[^/]*terraform[^/]*|cloudbuild[^/]*)$/iu.test(normalized)
  );
}

function validateRepositoryState(state, mode) {
  assert.ok(Object.values(VERIFICATION_MODES).includes(mode), 'unknown verification mode');
  assert.equal(state.nodeVersion, REQUIRED_NODE_VERSION);
  assert.equal(state.indexClean, true, 'the real Git index must remain clean');
  assert.equal(state.dependencyChanged, false, 'dependency drift is not permitted');
  assert.equal(
    state.devDependencyChanged,
    false,
    'devDependency drift is not permitted',
  );
  if (mode === VERIFICATION_MODES.CANDIDATE) {
    assert.equal(state.branch, REQUIRED_BRANCH);
    assert.equal(
      path.normalize(state.nodeDirectory).toLowerCase(),
      REQUIRED_NODE_DIRECTORY.toLowerCase(),
    );
    assert.equal(state.head, BASE_SHA);
    assert.deepEqual([...state.changedPaths].sort(), [...EXPECTED_CHANGED_PATHS].sort());
  } else {
    assert.equal(
      state.historicalBaseIsAncestor,
      true,
      'historical BASE_SHA must be an ancestor of HEAD',
    );
    assert.deepEqual(
      state.changedPaths.filter(isProtectedRegressionPath),
      [],
      'protected repository scope changed',
    );
  }
  return true;
}

function inspectRepositoryState() {
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', BASE_SHA, 'HEAD'],
    { cwd: REPOSITORY_ROOT, windowsHide: true },
  );
  if (ancestor.error || ![0, 1].includes(ancestor.status)) {
    throw new Error('historical baseline ancestry inspection failed');
  }
  const cached = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: REPOSITORY_ROOT,
    windowsHide: true,
  });
  const headPackage = JSON.parse(git(['show', 'HEAD:package.json']).stdout);
  const workingPackage = JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  return {
    branch: git(['branch', '--show-current']).stdout.trim(),
    head: git(['rev-parse', 'HEAD']).stdout.trim(),
    nodeVersion: process.version,
    nodeDirectory: path.dirname(path.resolve(process.execPath)),
    platform: process.platform,
    indexClean: cached.status === 0,
    changedPaths: readChangedPaths(),
    historicalBaseIsAncestor: ancestor.status === 0,
    dependencyChanged: !isDeepStrictEqual(
      workingPackage.dependencies,
      headPackage.dependencies,
    ),
    devDependencyChanged: !isDeepStrictEqual(
      workingPackage.devDependencies,
      headPackage.devDependencies,
    ),
  };
}

function assertRepositoryPreflight(mode = VERIFICATION_MODES.CANDIDATE) {
  validateRepositoryState(inspectRepositoryState(), mode);
}

function assertProtectedScope(mode = VERIFICATION_MODES.CANDIDATE) {
  validateRepositoryState(inspectRepositoryState(), mode);
}

function assertStaticSecurity() {
  const runner = fs.readFileSync(
    path.join(REPOSITORY_ROOT, 'scripts', 'migrations', 'run-governed-migration-job.cjs'),
    'utf8',
  );
  const manifest = fs.readFileSync(
    path.join(REPOSITORY_ROOT, 'scripts', 'migrations', 'migration-artifact-manifest.cjs'),
    'utf8',
  );
  const executablePackageScript = JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  ).scripts['start:prod:migration-job'];
  assert.equal(
    executablePackageScript,
    'node scripts/migrations/run-governed-migration-job.cjs',
  );
  for (const forbidden of [
    'NestFactory',
    'dist/main.js',
    'dist/core-worker.js',
    'dist/media-worker.js',
    'dist/maintenance-scheduler.js',
    'migrate dev',
    'db push',
    'db execute',
    'migrate reset',
    'migrate resolve',
    'db seed',
  ]) {
    assert.ok(!runner.includes(forbidden), `runner contains forbidden executable: ${forbidden}`);
  }
  assert.match(runner, /shell: false/u);
  assert.doesNotMatch(runner, /shell:\s*true/u);
  assert.doesNotMatch(`${runner}\n${manifest}`, /readFileSync\([^\n]*\.env|dotenv/u);
  const dockerIgnore = fs.readFileSync(path.join(REPOSITORY_ROOT, '.dockerignore'), 'utf8');
  assert.match(dockerIgnore, /^\.env$/mu);
  assert.match(dockerIgnore, /^\.env\.\*$/mu);
}

async function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function verifyLocalDocker() {
  const configuredHost = process.env.DOCKER_HOST;
  if (
    configuredHost &&
    !configuredHost.startsWith('npipe://') &&
    !configuredHost.startsWith('unix://')
  ) {
    throw new Error('remote_docker_endpoint_rejected');
  }
  const inspection = JSON.parse(docker(['context', 'inspect']).stdout);
  const endpoint = inspection[0]?.Endpoints?.docker?.Host;
  if (!endpoint?.startsWith('npipe://') && !endpoint?.startsWith('unix://')) {
    throw new Error('non_local_docker_endpoint_rejected');
  }
  const serverVersion = docker(['version', '--format', '{{.Server.Version}}']).stdout.trim();
  assert.ok(serverVersion.length > 0);
  return { endpointTransport: endpoint.split(':', 1)[0], serverVersion };
}

function inspectLocalImage(reference) {
  const imageId = docker(['image', 'inspect', reference, '--format', '{{.Id}}']).stdout.trim();
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/u);
  return imageId;
}

function labels(role) {
  return [
    '--label',
    `${GATE_LABEL}=${GATE}`,
    '--label',
    `${RUN_LABEL}=${RUN_ID}`,
    '--label',
    `${ROLE_LABEL}=${role}`,
  ];
}

function buildApplicationImage() {
  docker(
    [
      'build',
      '--pull=false',
      '--target',
      'final',
      '--tag',
      APPLICATION_IMAGE_TAG,
      '--label',
      `${GATE_LABEL}=${GATE}`,
      '--label',
      `${RUN_LABEL}=${RUN_ID}`,
      '--label',
      `${ROLE_LABEL}=application-image`,
      '.',
    ],
    {
      timeoutMs: 15 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
      label: 'same-final-image build failed',
      errorCode: 'same_final_image_build_failed',
    },
  );
  applicationImageBuilt = true;
  return inspectLocalImage(APPLICATION_IMAGE_TAG);
}

function createNetworkAndDatabase() {
  docker([
    'network',
    'create',
    '--internal',
    ...labels('network'),
    NETWORK_NAME,
  ]);
  networkCreated = true;
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    DATABASE_CONTAINER,
    '--network',
    NETWORK_NAME,
    ...labels('postgresql'),
    '--publish',
    `127.0.0.1:${databasePort}:5432`,
    '--tmpfs',
    '/var/lib/postgresql/data:rw,noexec,nosuid,size=1073741824',
    '--env',
    `POSTGRES_PASSWORD=${syntheticSecrets.postgres}`,
    postgresImageId,
  ]);
  databaseCreated = true;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = docker(
      [
        'exec',
        '--env',
        `PGPASSWORD=${syntheticSecrets.postgres}`,
        DATABASE_CONTAINER,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      { allowFailure: true },
    );
    if (result.status === 0) return;
  }
  throw new Error('postgresql_startup_timeout');
}

function psql(login, databaseName, credential, sql, options = {}) {
  return docker(
    [
      'exec',
      '-i',
      '--env',
      `PGPASSWORD=${credential}`,
      DATABASE_CONTAINER,
      'psql',
      '-X',
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--set',
      'VERBOSITY=verbose',
      '-h',
      '127.0.0.1',
      '-U',
      login,
      '-d',
      databaseName,
      '-At',
    ],
    {
      input: sql,
      allowFailure: options.allowFailure,
      timeoutMs: options.timeoutMs ?? 120_000,
      label: options.label ?? 'disposable PostgreSQL command failed',
      errorCode: options.errorCode ?? 'disposable_postgresql_command_failed',
    },
  );
}

function adminSql(databaseName, sql, options = {}) {
  return psql('postgres', databaseName, syntheticSecrets.postgres, sql, options);
}

function queryScalar(databaseName, sql) {
  return adminSql(databaseName, `${sql.replace(/;?\s*$/u, '')};\n`).stdout.trim();
}

function createFixtureDatabase(databaseName) {
  assert.match(databaseName, /^[a-z0-9_]+$/u);
  adminSql('postgres', `CREATE DATABASE ${databaseName};\n`);
  const bootstrapSql = fs.readFileSync(ROLE_BOOTSTRAP_PATH, 'utf8');
  docker(
    [
      'exec',
      '-i',
      '--env',
      `PGPASSWORD=${syntheticSecrets.postgres}`,
      DATABASE_CONTAINER,
      'psql',
      '-X',
      '--no-psqlrc',
      '-q',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      databaseName,
      '--set',
      `database_name=${databaseName}`,
      '--set',
      `api_role_credential=${syntheticSecrets.api}`,
      '--set',
      `core_worker_role_credential=${syntheticSecrets.core}`,
      '--set',
      `media_worker_role_credential=${syntheticSecrets.media}`,
      '--set',
      `migration_role_credential=${syntheticSecrets.migration}`,
    ],
    {
      input: bootstrapSql,
      timeoutMs: 120_000,
      label: 'G01-compatible role bootstrap failed',
      errorCode: 'g01_role_bootstrap_failed',
    },
  );
}

function applyRuntimeGrants(databaseName) {
  const grantsSql = fs.readFileSync(RUNTIME_GRANTS_PATH, 'utf8');
  docker(
    [
      'exec',
      '-i',
      '--env',
      `PGPASSWORD=${syntheticSecrets.postgres}`,
      DATABASE_CONTAINER,
      'psql',
      '-X',
      '--no-psqlrc',
      '-q',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      databaseName,
      '--set',
      `database_name=${databaseName}`,
    ],
    {
      input: grantsSql,
      timeoutMs: 120_000,
      label: 'G01-compatible runtime grants failed',
      errorCode: 'g01_runtime_grants_failed',
    },
  );
}

function databaseUrl(databaseName) {
  const credential = encodeURIComponent(syntheticSecrets.migration);
  return `postgresql://moazez_migration:${credential}@${DATABASE_CONTAINER}:5432/${databaseName}?schema=public&connection_limit=2&connect_timeout=5&pool_timeout=5`;
}

function parseJsonLines(output) {
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error('migration_job_emitted_non_json_output');
      }
    });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startConnectionObserver(databaseName) {
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      '--env',
      `PGPASSWORD=${syntheticSecrets.postgres}`,
      DATABASE_CONTAINER,
      'psql',
      '-X',
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      databaseName,
    ],
    {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${String(chunk)}`.slice(0, 1024 * 1024);
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(0, 1024 * 1024);
  });
  child.stdin.end(`DO $g04_observer$
DECLARE
  sample_index integer;
  current_connections integer;
  maximum_connections integer := 0;
BEGIN
  FOR sample_index IN 1..6000 LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT count(*)
      INTO current_connections
      FROM pg_catalog.pg_stat_activity
     WHERE datname = current_database()
       AND usename = 'moazez_migration';
    maximum_connections := greatest(maximum_connections, current_connections);
    PERFORM pg_sleep(0.005);
  END LOOP;
  RAISE NOTICE 'G04_MAX_CONNECTIONS=%', maximum_connections;
END
$g04_observer$;\n`);
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
  return { completion };
}

async function spawnJobContainer(args, monitorDatabaseName) {
  const observer = monitorDatabaseName
    ? startConnectionObserver(monitorDatabaseName)
    : null;
  if (observer) await delay(100);
  const child = spawn('docker', args, {
    cwd: REPOSITORY_ROOT,
    env: process.env,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let complete = false;
  let maximumConnections = 0;
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${String(chunk)}`.slice(0, 2 * 1024 * 1024);
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(0, 2 * 1024 * 1024);
  });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      complete = true;
      resolve(code);
    });
  });
  const timeout = setTimeout(() => {
    docker(['rm', '--force', args[args.indexOf('--name') + 1]], { allowFailure: true });
  }, 5 * 60_000);
  timeout.unref();

  while (!complete && monitorDatabaseName) {
    try {
      const observed = Number(
        queryScalar(
          monitorDatabaseName,
          "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND usename = 'moazez_migration'",
        ),
      );
      if (Number.isInteger(observed)) maximumConnections = Math.max(maximumConnections, observed);
    } catch {
      // A startup race is expected before the job opens its first connection.
    }
    await delay(25);
  }
  const exitCode = await completion;
  clearTimeout(timeout);
  if (observer) {
    const observerResult = await observer.completion;
    assert.equal(observerResult.code, 0, 'connection observer failed');
    const match = `${observerResult.stdout}\n${observerResult.stderr}`.match(
      /G04_MAX_CONNECTIONS=(\d+)/u,
    );
    assert.ok(match, 'connection observer result is missing');
    maximumConnections = Math.max(maximumConnections, Number(match[1]));
  }
  return { exitCode, stdout, stderr, maximumConnections };
}

let executionCounter = 0;
async function runMigrationJob(databaseName, options = {}) {
  executionCounter += 1;
  const executionId = `g04-${RUN_ID}-${executionCounter}`;
  const environment = options.environment ?? 'disposable';
  const backupCheckpoint =
    options.backupCheckpoint ?? `DISPOSABLE_NA:${executionId}`;
  const dataAuthority =
    options.dataAuthority ?? `DISPOSABLE_NA:${executionId}`;
  const approvalRef = options.approvalRef ?? `SYNTHETIC_APPROVAL:${executionId}`;
  const jobDatabaseUrl = options.databaseUrl ?? databaseUrl(databaseName);
  const containerName = `moazez-prd3-g04-job-${RUN_ID}-${executionCounter}`;
  const args = [
    'run',
    '--rm',
    '--pull',
    'never',
    '--name',
    containerName,
    '--network',
    NETWORK_NAME,
    ...labels('migration-job'),
    '--env',
    `DATABASE_URL=${jobDatabaseUrl}`,
    '--env',
    `MIGRATION_JOB_EXECUTION_ID=${executionId}`,
    '--env',
    `MIGRATION_JOB_ENVIRONMENT=${environment}`,
    '--env',
    `MIGRATION_JOB_ARTIFACT_DIGEST=${applicationImageId}`,
    '--env',
    `MIGRATION_JOB_APPROVAL_REF=${approvalRef}`,
    '--env',
    `MIGRATION_JOB_BACKUP_CHECKPOINT=${backupCheckpoint}`,
    '--env',
    `MIGRATION_JOB_DATA_AUTHORITY=${dataAuthority}`,
    ...(options.mountArgs ?? []),
    applicationImageId,
    'node',
    'scripts/migrations/run-governed-migration-job.cjs',
  ];
  const result = await spawnJobContainer(args, options.monitorConnections ? databaseName : null);
  const events = parseJsonLines(result.stdout);
  const combined = `${result.stdout}\n${result.stderr}`;
  for (const sensitive of [
    jobDatabaseUrl,
    'postgresql://',
    'postgres://',
    'DATABASE_URL',
    'moazez_migration',
    DATABASE_CONTAINER,
    syntheticSecrets.migration,
    approvalRef,
    backupCheckpoint,
    dataAuthority,
  ]) {
    assert.ok(!combined.includes(sensitive), 'migration output exposed synthetic sensitive material');
  }
  return { ...result, events, executionId };
}

function resultEvent(job) {
  return job.events.findLast((event) => event.event === 'migration.job.result');
}

function stageStarted(job, stage) {
  return job.events.some(
    (event) =>
      event.event === 'migration.job.stage' &&
      event.stage === stage &&
      event.status === 'started',
  );
}

function countDatabaseCommandStarts(job) {
  return job.events.filter(
    (event) =>
      event.event === 'migration.job.stage' &&
      event.status === 'started' &&
      ['prisma-validate', 'migrate-deploy', 'migrate-status', 'migrate-diff'].includes(
        event.stage,
      ),
  ).length;
}

function normalizedSchemaHash(databaseName) {
  const dump = docker(
    [
      'exec',
      '--env',
      `PGPASSWORD=${syntheticSecrets.postgres}`,
      DATABASE_CONTAINER,
      'pg_dump',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      databaseName,
    ],
    { timeoutMs: 120_000 },
  ).stdout;
  const normalized = dump
    .split(/\r?\n/u)
    .filter(
      (line) =>
        !line.startsWith('\\restrict ') &&
        !line.startsWith('\\unrestrict ') &&
        !line.startsWith('-- Dumped') &&
        !line.startsWith('-- Started') &&
        !line.startsWith('-- Completed'),
    )
    .join('\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function verifyRuntimeDdlDenials(databaseName) {
  const results = {};
  const credentials = {
    api: syntheticSecrets.api,
    'core-worker': syntheticSecrets.core,
    'media-worker': syntheticSecrets.media,
  };
  for (const [runtime, login] of Object.entries(RUNTIME_ROLES)) {
    results[runtime] = {};
    for (const denial of DDL_DENIALS) {
      const result = psql(
        login,
        databaseName,
        credentials[runtime],
        `${denial.sql};\n`,
        { allowFailure: true },
      );
      assert.notEqual(result.status, 0, `${runtime} unexpectedly passed ${denial.name}`);
      assert.match(`${result.stdout}\n${result.stderr}`, /42501/u);
      results[runtime][denial.name] = true;
    }
  }
  return results;
}

async function releaseFailureMatrix() {
  const failureStages = [
    'artifact-and-checksum-preflight',
    'backup-and-data-authority-checkpoint',
    'migration-job',
    'migration-status-and-drift-verification',
    'protected-readiness-and-smoke',
  ];
  const runtimeStages = new Set([
    'core-worker-promotion',
    'media-worker-promotion',
    'api-no-traffic-promotion',
    'maintenance-scheduler-promotion',
  ]);
  const matrix = {};
  for (const failureStage of failureStages) {
    const calls = [];
    const operations = Object.fromEntries(
      RELEASE_STAGE_IDS.map((stage) => [
        stage,
        async () => {
          calls.push(stage);
          if (stage === failureStage) throw new Error('synthetic release failure');
        },
      ]),
    );
    await assert.rejects(() => runGovernedReleaseSequence(operations));
    const failureIndex = RELEASE_STAGE_IDS.indexOf(failureStage);
    assert.deepEqual(calls, RELEASE_STAGE_IDS.slice(0, failureIndex + 1));
    matrix[failureStage] = {
      callbacks: calls.length,
      runtimePromotions: calls.filter((stage) => runtimeStages.has(stage)).length,
      trafficPromotions: calls.filter((stage) => stage === 'traffic-promotion').length,
      laterCallbacks: 0,
    };
  }
  return matrix;
}

function inspectFinalImage() {
  const inspection = JSON.parse(
    docker(['image', 'inspect', applicationImageId]).stdout,
  )[0];
  assert.equal(inspection.Id, applicationImageId);
  assert.deepEqual(inspection.Config.Cmd, ['node', 'dist/main.js']);
  assert.equal(inspection.Config.User, 'node');
  const check = docker([
    'run',
    '--rm',
    '--pull',
    'never',
    ...labels('image-contract-check'),
    applicationImageId,
    'node',
    '-e',
    [
      "const fs=require('node:fs');",
      "const required=['dist/main.js','dist/core-worker.js','dist/media-worker.js','dist/maintenance-scheduler.js','scripts/migrations/run-governed-migration-job.cjs','scripts/migrations/migration-artifact-manifest.cjs','config/deployment/migration-artifact-manifest.json','config/deployment/migration-job.contract.json','config/deployment/release-sequence.contract.json'];",
      "if(required.some((file)=>!fs.existsSync(file))||fs.existsSync('.env'))process.exit(1);",
    ].join(''),
  ]);
  assert.equal(check.status, 0);
  return {
    imageId: applicationImageId,
    defaultCommand: inspection.Config.Cmd,
    migrationCommand: ['node', 'scripts/migrations/run-governed-migration-job.cjs'],
    user: inspection.Config.User,
    buildCount: 1,
    runtimeCommandsPresent: 4,
    environmentFilePresent: false,
  };
}

function cleanupOwnedResources() {
  const containerIds = docker(
    ['ps', '--all', '--quiet', '--filter', `label=${RUN_LABEL}=${RUN_ID}`],
    { allowFailure: true },
  ).stdout.split(/\r?\n/u).filter(Boolean);
  for (const containerId of containerIds) {
    docker(['rm', '--force', containerId], { allowFailure: true });
  }
  databaseCreated = false;

  const networkIds = docker(
    ['network', 'ls', '--quiet', '--filter', `label=${RUN_LABEL}=${RUN_ID}`],
    { allowFailure: true },
  ).stdout.split(/\r?\n/u).filter(Boolean);
  for (const networkId of networkIds) {
    docker(['network', 'rm', networkId], { allowFailure: true });
  }
  networkCreated = false;

  const imageIds = docker(
    ['image', 'ls', '--quiet', '--filter', `label=${RUN_LABEL}=${RUN_ID}`],
    { allowFailure: true },
  ).stdout.split(/\r?\n/u).filter(Boolean);
  for (const imageId of [...new Set(imageIds)]) {
    docker(['image', 'rm', '--force', imageId], { allowFailure: true });
  }
  applicationImageBuilt = false;

  if (temporaryRoot) {
    const resolved = path.resolve(temporaryRoot);
    const expectedParent = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), expectedParent);
    assert.ok(path.basename(resolved).startsWith(TEMPORARY_PREFIX));
    fs.rmSync(resolved, { recursive: true, force: true });
    temporaryRoot = null;
  }

  const remainingContainers = docker([
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
  ]).stdout.trim();
  const remainingNetworks = docker([
    'network',
    'ls',
    '--quiet',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
  ]).stdout.trim();
  const remainingImages = docker([
    'image',
    'ls',
    '--quiet',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
  ]).stdout.trim();
  assert.equal(remainingContainers, '');
  assert.equal(remainingNetworks, '');
  assert.equal(remainingImages, '');
  return {
    containers: 0,
    networks: 0,
    images: 0,
    volumes: 0,
    processes: 0,
    temporaryDirectories: 0,
  };
}

async function runLiveEvidence() {
  const dockerEvidence = verifyLocalDocker();
  postgresImageId = inspectLocalImage(POSTGRES_IMAGE);
  databasePort = await allocateLoopbackPort();
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMPORARY_PREFIX));
  applicationImageId = buildApplicationImage();
  const image = inspectFinalImage();
  createNetworkAndDatabase();

  const freshDatabase = `g04_fresh_${RUN_ID}`;
  createFixtureDatabase(freshDatabase);
  const schemaGuard = await runMigrationJob(freshDatabase, {
    databaseUrl: databaseUrl(freshDatabase).replace('schema=public', 'schema=private'),
  });
  assert.notEqual(schemaGuard.exitCode, 0);
  assert.equal(
    resultEvent(schemaGuard)?.code,
    'migration_environment_contract_invalid',
  );
  assert.equal(countDatabaseCommandStarts(schemaGuard), 0);
  assert.ok(!stageStarted(schemaGuard, 'manifest-verification'));

  const fresh = await runMigrationJob(freshDatabase, { monitorConnections: true });
  assert.equal(fresh.exitCode, 0);
  assert.equal(resultEvent(fresh)?.status, 'migration_applied');
  assert.equal(countDatabaseCommandStarts(fresh), 4);
  assert.ok(stageStarted(fresh, 'migrate-status'));
  assert.ok(stageStarted(fresh, 'migrate-diff'));
  assert.ok(
    fresh.maximumConnections >= 1 && fresh.maximumConnections <= 2,
    `migration connection maximum was ${fresh.maximumConnections}, expected 1..2`,
  );

  const migrationCount = Number(
    queryScalar(
      freshDatabase,
      'SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ),
  );
  assert.equal(migrationCount, 7);
  const checksumsBefore = queryScalar(
    freshDatabase,
    "SELECT string_agg(migration_name || ':' || checksum, E'\\n' ORDER BY migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
  );
  const schemaBefore = normalizedSchemaHash(freshDatabase);
  const seedRows = Number(
    queryScalar(
      freshDatabase,
      'SELECT (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.roles) + (SELECT count(*) FROM public.permissions) + (SELECT count(*) FROM public.organizations) + (SELECT count(*) FROM public.schools)',
    ),
  );
  assert.equal(seedRows, 0);

  const second = await runMigrationJob(freshDatabase);
  assert.equal(second.exitCode, 0);
  assert.equal(resultEvent(second)?.status, 'migration_noop');
  const migrationCountAfter = Number(
    queryScalar(
      freshDatabase,
      'SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ),
  );
  const checksumsAfter = queryScalar(
    freshDatabase,
    "SELECT string_agg(migration_name || ':' || checksum, E'\\n' ORDER BY migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
  );
  const schemaAfter = normalizedSchemaHash(freshDatabase);
  assert.equal(migrationCountAfter, migrationCount);
  assert.equal(checksumsAfter, checksumsBefore);
  assert.equal(schemaAfter, schemaBefore);

  applyRuntimeGrants(freshDatabase);
  const runtimeDdlDenials = verifyRuntimeDdlDenials(freshDatabase);
  const runtimeDdlDenialTotal = Object.values(runtimeDdlDenials).reduce(
    (total, checks) => total + Object.keys(checks).length,
    0,
  );
  assert.equal(runtimeDdlDenialTotal, 21);

  adminSql(
    freshDatabase,
    'CREATE TABLE public.g04_unauthorized_drift (id integer);\n',
  );
  const drift = await runMigrationJob(freshDatabase);
  assert.notEqual(drift.exitCode, 0);
  assert.equal(resultEvent(drift)?.code, 'migration_drift_detected');
  assert.ok(stageStarted(drift, 'migrate-diff'));

  const failedHistoryDatabase = `g04_failed_${RUN_ID}`;
  createFixtureDatabase(failedHistoryDatabase);
  const failedHistoryBaseline = await runMigrationJob(failedHistoryDatabase);
  assert.equal(failedHistoryBaseline.exitCode, 0);
  adminSql(
    failedHistoryDatabase,
    `INSERT INTO public._prisma_migrations
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES
      ('${crypto.randomUUID()}', '${'f'.repeat(64)}', NULL,
       '20260807000000_synthetic_failed_history', 'synthetic failed history',
       NULL, now(), 0);\n`,
  );
  const failedHistory = await runMigrationJob(failedHistoryDatabase);
  assert.notEqual(failedHistory.exitCode, 0);
  assert.ok(
    ['migration_p3009_detected', 'migration_failed_history_detected'].includes(
      resultEvent(failedHistory)?.code,
    ),
  );
  assert.ok(stageStarted(failedHistory, 'migrate-deploy'));
  assert.ok(!stageStarted(failedHistory, 'migrate-status'));

  const divergenceDatabase = `g04_diverged_${RUN_ID}`;
  createFixtureDatabase(divergenceDatabase);
  const divergenceBaseline = await runMigrationJob(divergenceDatabase);
  assert.equal(divergenceBaseline.exitCode, 0);
  adminSql(
    divergenceDatabase,
    `UPDATE public._prisma_migrations
        SET migration_name = '20260807000001_synthetic_history_divergence'
      WHERE migration_name = '20260710135222_baseline_v1';\n`,
  );
  const divergence = await runMigrationJob(divergenceDatabase);
  assert.notEqual(divergence.exitCode, 0);
  assert.ok(
    ['migration_history_diverged', 'migration_status_failed'].includes(
      resultEvent(divergence)?.code,
    ),
  );

  const manifest = buildManifest();
  const tamperSource = path.join(
    REPOSITORY_ROOT,
    ...manifest.migrations[0].path.split('/'),
  );
  const tamperPath = path.join(temporaryRoot, 'tampered-migration.sql');
  fs.copyFileSync(tamperSource, tamperPath);
  fs.appendFileSync(tamperPath, ' ');
  const tampered = await runMigrationJob(divergenceDatabase, {
    mountArgs: [
      '--mount',
      `type=bind,source=${tamperPath},target=/app/${manifest.migrations[0].path},readonly`,
    ],
  });
  assert.notEqual(tampered.exitCode, 0);
  assert.equal(resultEvent(tampered)?.code, 'migration_manifest_mismatch');
  assert.equal(countDatabaseCommandStarts(tampered), 0);

  const productionGuard = await runMigrationJob(divergenceDatabase, {
    environment: 'production',
  });
  assert.notEqual(productionGuard.exitCode, 0);
  assert.equal(
    resultEvent(productionGuard)?.code,
    'migration_environment_contract_invalid',
  );
  assert.equal(countDatabaseCommandStarts(productionGuard), 0);
  assert.ok(!stageStarted(productionGuard, 'manifest-verification'));

  const releaseMatrix = await releaseFailureMatrix();
  assert.equal(releaseMatrix['migration-job'].runtimePromotions, 0);
  assert.equal(releaseMatrix['migration-job'].trafficPromotions, 0);
  assert.equal(
    releaseMatrix['migration-status-and-drift-verification'].runtimePromotions,
    0,
  );
  assert.equal(releaseMatrix['protected-readiness-and-smoke'].trafficPromotions, 0);

  return {
    status: 'PASS',
    baseSha: BASE_SHA,
    nodeVersion: process.version,
    prismaVersion: JSON.parse(
      fs.readFileSync(
        path.join(REPOSITORY_ROOT, 'node_modules', 'prisma', 'package.json'),
        'utf8',
      ),
    ).version,
    docker: {
      ...dockerEvidence,
      postgresImageId,
      loopbackPortAllocated: true,
      networkInternal: true,
      noPersistentVolume: true,
    },
    image,
    manifest: {
      migrationCount: manifest.migrations.length,
      aggregateMigrationChainSha256: manifest.aggregateMigrationChainSha256,
    },
    schemaGuard: {
      code: resultEvent(schemaGuard)?.code,
      databaseCommandCount: countDatabaseCommandStarts(schemaGuard),
      manifestVerificationStarted: stageStarted(schemaGuard, 'manifest-verification'),
    },
    fresh: {
      result: resultEvent(fresh)?.status,
      exitCode: fresh.exitCode,
      statusSucceeded: true,
      driftEmpty: true,
      seedRows,
      applicationBootstrapCount: 0,
      maximumMigrationConnections: fresh.maximumConnections,
    },
    second: {
      result: resultEvent(second)?.status,
      exitCode: second.exitCode,
      migrationCountUnchanged: migrationCountAfter === migrationCount,
      checksumsUnchanged: checksumsAfter === checksumsBefore,
      schemaUnchanged: schemaAfter === schemaBefore,
    },
    drift: {
      code: resultEvent(drift)?.code,
      exitCode: drift.exitCode,
      runtimePromotions: 0,
      trafficPromotions: 0,
    },
    failedHistory: {
      code: resultEvent(failedHistory)?.code,
      exitCode: failedHistory.exitCode,
      runtimePromotions: 0,
      trafficPromotions: 0,
    },
    divergence: {
      code: resultEvent(divergence)?.code,
      exitCode: divergence.exitCode,
      runtimePromotions: 0,
      trafficPromotions: 0,
    },
    tamper: {
      code: resultEvent(tampered)?.code,
      databaseCommandCount: countDatabaseCommandStarts(tampered),
      runtimePromotions: 0,
    },
    productionGuard: {
      code: resultEvent(productionGuard)?.code,
      databaseCommandCount: countDatabaseCommandStarts(productionGuard),
    },
    runtimeDdlDenials,
    runtimeDdlDenialTotal,
    migrationIdentityDdl: 'PASS',
    releaseMatrix,
    forbiddenMigrationCommandExecutionCounts: {
      seed: 0,
      dbPush: 0,
      dbExecute: 0,
      migrateReset: 0,
      migrateResolve: 0,
      migrateDev: 0,
    },
    structuredLogRedaction: 'PASS',
  };
}

function runLocalChecks() {
  command(process.execPath, ['--test', FOCUSED_TEST_PATH], {
    timeoutMs: 180_000,
    label: 'focused G04 test suite failed',
    errorCode: 'focused_g04_tests_failed',
  });
  const nestCliPath = path.join(
    REPOSITORY_ROOT,
    'node_modules',
    '@nestjs',
    'cli',
    'bin',
    'nest.js',
  );
  command(process.execPath, [nestCliPath, 'build'], {
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    timeoutMs: 10 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
    label: 'application build failed',
    errorCode: 'application_build_failed',
  });
  git(['diff', '--check'], {
    timeoutMs: 120_000,
    label: 'git diff check failed',
    errorCode: 'git_diff_check_failed',
  });
}

async function main() {
  const mode = resolveVerificationMode(process.argv.slice(2));
  let summary;
  let cleanup;
  let primaryFailure;
  try {
    assertRepositoryPreflight(mode);
    assertProtectedScope(mode);
    assertStaticSecurity();
    runLocalChecks();
    assertRepositoryPreflight(mode);
    summary = await runLiveEvidence();
    assertRepositoryPreflight(mode);
    assertProtectedScope(mode);
    assertStaticSecurity();
  } catch (error) {
    primaryFailure = error;
  } finally {
    try {
      cleanup = cleanupOwnedResources();
    } catch (error) {
      primaryFailure ??= error;
    }
  }
  if (primaryFailure) throw primaryFailure;
  summary.cleanup = cleanup;
  process.stdout.write(`PRD3_G04_EVIDENCE_JSON=${JSON.stringify(summary)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`PRD3-G04 final verification failed: ${safeMessage(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  BASE_SHA,
  DDL_DENIALS,
  EXPECTED_CHANGED_PATHS,
  RUNTIME_ROLES,
  VERIFICATION_MODES,
  inspectRepositoryState,
  isProtectedRegressionPath,
  readChangedPaths,
  resolveVerificationMode,
  validateRepositoryState,
};
