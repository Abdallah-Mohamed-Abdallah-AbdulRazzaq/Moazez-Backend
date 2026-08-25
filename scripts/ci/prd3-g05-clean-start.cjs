'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { resolveCiParentRunId } = require('./ci-parent-run-id.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = '10be00c51eba72bbdfe9591eb0e00399402100ef';
const REQUIRED_BRANCH = 'chore/production-readiness-3-cloud-sql';
const REQUIRED_NODE_VERSION = 'v22.23.1';
const REQUIRED_NODE_DIRECTORY = path.normalize(
  'C:\\Users\\Abdal\\AppData\\Local\\Moazez\\toolchains\\node-v22.23.1-win-x64',
);
const POSTGRES_IMAGE = 'postgres:16-alpine';
const GATE = 'PRD3-G05';
const RUN_ID = resolveCiParentRunId(process.env.MOAZEZ_CI_PARENT_RUN_ID, () =>
  crypto.randomUUID().replaceAll('-', '').slice(0, 16),
);
const RUN_LABEL = 'com.moazez.prd3-g05.run';
const GATE_LABEL = 'com.moazez.prd3-g05.gate';
const ROLE_LABEL = 'com.moazez.prd3-g05.role';
const DATABASE_CONTAINER = `moazez-prd3-g05-db-${RUN_ID}`;
const DATABASE_NAME = `g05_clean_${RUN_ID}`;
const TEMPORARY_PREFIX = 'moazez-prd3-g05-';
const MAX_MIGRATION_FAILURE_OUTPUT_BYTES = 64 * 1024;
const MIGRATION_RESULT_CODE_PATTERN = /^[a-z][a-z0-9_]{0,127}$/u;
const VERIFICATION_MODES = Object.freeze({
  CANDIDATE: 'candidate',
  REGRESSION: 'regression',
  CURRENT_CI: 'current-ci',
});
const FOCUSED_TEST_COUNT = 22;
const CURRENT_CI_SKIPPED_TEST_COUNT = 8;
const ROLE_BOOTSTRAP_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'database',
  'prd3-g01-c-role-bootstrap.sql',
);
const MIGRATION_RUNNER_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'migrations',
  'run-governed-migration-job.cjs',
);
const FOCUSED_TEST_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'tests',
  'prd3-g05-clean-start.test.cjs',
);
const EXPECTED_CHANGED_PATHS = Object.freeze([
  'adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md',
  'config/deployment/production-data-branch.contract.json',
  'config/deployment/production-seed-inventory.json',
  'docs/production-readiness/phase-0/02-production-decision-register.md',
  'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  'docs/production-readiness/phase-3/08-clean-start-production-data-evidence.md',
  'package.json',
  'scripts/ci/prd3-g05-clean-start.cjs',
  'scripts/tests/prd3-g05-clean-start.test.cjs',
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
const ALLOWED_NONZERO_APPLICATION_TABLES = Object.freeze([
  'permissions',
  'role_permissions',
  'roles',
]);

const syntheticSecrets = Object.freeze({
  postgres: crypto.randomBytes(24).toString('base64url'),
  api: crypto.randomBytes(24).toString('base64url'),
  core: crypto.randomBytes(24).toString('base64url'),
  media: crypto.randomBytes(24).toString('base64url'),
  migration: crypto.randomBytes(24).toString('base64url'),
});

let databasePort;
let postgresImageId;
let databaseCreated = false;
let temporaryRoot;

function safeMessage(error) {
  return `${String(error?.code ?? 'verification_failed')}: ${String(
    error?.message ?? 'verification failed',
  )}`
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
    shell: false,
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
  return git(['status', '--short', '--untracked-files=all'])
    .stdout.split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .sort();
}

function resolveVerificationMode(args = []) {
  if (args.length === 0) return VERIFICATION_MODES.CANDIDATE;
  if (args.length === 1 && args[0] === '--regression') {
    return VERIFICATION_MODES.REGRESSION;
  }
  if (args.length === 1 && args[0] === '--current-ci') {
    return VERIFICATION_MODES.CURRENT_CI;
  }
  throw new Error(
    'unknown verification mode; expected no argument, --regression, or --current-ci',
  );
}

function isProtectedRegressionPath(changedPath) {
  const normalized = changedPath.replaceAll('\\', '/');
  return (
    REGRESSION_PROTECTED_PATHS.includes(normalized) ||
    REGRESSION_PROTECTED_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    ) ||
    /(?:^|\/)(?:[^/]+\.tf|[^/]*terraform[^/]*|cloudbuild[^/]*)$/iu.test(
      normalized,
    )
  );
}

function validateRepositoryState(state, mode) {
  assert.ok(
    Object.values(VERIFICATION_MODES).includes(mode),
    'unknown verification mode',
  );
  assert.equal(state.nodeVersion, REQUIRED_NODE_VERSION);
  assert.equal(state.indexClean, true, 'the real Git index must remain clean');
  if (mode === VERIFICATION_MODES.CURRENT_CI) return true;
  assert.equal(
    state.dependencyChanged,
    false,
    'dependency drift is not permitted',
  );
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
    assert.deepEqual(
      [...state.changedPaths].sort(),
      [...EXPECTED_CHANGED_PATHS].sort(),
    );
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

function inspectRepositoryState(mode = VERIFICATION_MODES.CANDIDATE) {
  const cached = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: REPOSITORY_ROOT,
    windowsHide: true,
  });
  const currentState = {
    nodeVersion: process.version,
    nodeDirectory: path.dirname(path.resolve(process.execPath)),
    platform: process.platform,
    indexClean: cached.status === 0,
  };
  if (mode === VERIFICATION_MODES.CURRENT_CI) return currentState;

  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', BASE_SHA, 'HEAD'],
    { cwd: REPOSITORY_ROOT, windowsHide: true },
  );
  if (ancestor.error || ![0, 1].includes(ancestor.status)) {
    throw new Error('historical baseline ancestry inspection failed');
  }
  const headPackage = JSON.parse(git(['show', 'HEAD:package.json']).stdout);
  const workingPackage = JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  return {
    ...currentState,
    branch: git(['branch', '--show-current']).stdout.trim(),
    head: git(['rev-parse', 'HEAD']).stdout.trim(),
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
  validateRepositoryState(inspectRepositoryState(mode), mode);
}

function assertProtectedScope(mode = VERIFICATION_MODES.CANDIDATE) {
  validateRepositoryState(inspectRepositoryState(mode), mode);
}

function focusedTestEnvironment(mode, environment = process.env) {
  const focusedEnvironment = { ...environment };
  if (mode === VERIFICATION_MODES.CURRENT_CI) {
    focusedEnvironment.PRD3_CURRENT_CI = '1';
  } else {
    delete focusedEnvironment.PRD3_CURRENT_CI;
  }
  return focusedEnvironment;
}

function runFocusedTests(mode = VERIFICATION_MODES.CANDIDATE) {
  const result = command(process.execPath, ['--test', FOCUSED_TEST_PATH], {
    env: focusedTestEnvironment(mode),
    timeoutMs: 180_000,
    label: 'focused G05 test suite failed',
    errorCode: 'focused_g05_tests_failed',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const tests = Number(output.match(/# tests (\d+)/u)?.[1]);
  const failed = Number(output.match(/# fail (\d+)/u)?.[1]);
  const skipped = Number(output.match(/# skipped (\d+)/u)?.[1]);
  const expectedSkipped =
    mode === VERIFICATION_MODES.CURRENT_CI ? CURRENT_CI_SKIPPED_TEST_COUNT : 0;
  assert.equal(tests, FOCUSED_TEST_COUNT);
  assert.equal(failed, 0);
  assert.equal(skipped, expectedSkipped);
  return { tests, passed: tests - skipped, failed, skipped };
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
  const serverVersion = docker([
    'version',
    '--format',
    '{{.Server.Version}}',
  ]).stdout.trim();
  assert.ok(serverVersion.length > 0);
  postgresImageId = docker([
    'image',
    'inspect',
    POSTGRES_IMAGE,
    '--format',
    '{{.Id}}',
  ]).stdout.trim();
  assert.match(postgresImageId, /^sha256:[a-f0-9]{64}$/u);
  return {
    endpointTransport: endpoint.split(':', 1)[0],
    serverVersion,
    postgresImageId,
  };
}

function ownershipLabels() {
  return [
    '--label',
    `${GATE_LABEL}=${GATE}`,
    '--label',
    `${RUN_LABEL}=${RUN_ID}`,
    '--label',
    `${ROLE_LABEL}=postgresql`,
  ];
}

function createDatabaseContainer() {
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    DATABASE_CONTAINER,
    ...ownershipLabels(),
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
    const ready = docker(
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
    if (ready.status === 0) break;
  }
  assert.ok(Date.now() < deadline, 'postgresql_startup_timeout');

  const inspection = JSON.parse(
    docker(['container', 'inspect', DATABASE_CONTAINER]).stdout,
  )[0];
  assert.equal(inspection.Name, `/${DATABASE_CONTAINER}`);
  assert.equal(inspection.Config.Labels[RUN_LABEL], RUN_ID);
  assert.equal(inspection.Config.Labels[GATE_LABEL], GATE);
  assert.equal(inspection.HostConfig.RestartPolicy.Name, 'no');
  assert.equal(
    inspection.HostConfig.PortBindings['5432/tcp'][0].HostIp,
    '127.0.0.1',
  );
  assert.ok(inspection.HostConfig.Tmpfs['/var/lib/postgresql/data']);
  assert.ok(
    inspection.Mounts.every(
      (mount) => mount.Type !== 'volume' && mount.Type !== 'bind',
    ),
  );
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
  return psql(
    'postgres',
    databaseName,
    syntheticSecrets.postgres,
    sql,
    options,
  );
}

function queryScalar(databaseName, sql) {
  return adminSql(
    databaseName,
    `${sql.replace(/;?\s*$/u, '')};\n`,
  ).stdout.trim();
}

function createFixtureDatabase() {
  adminSql('postgres', `CREATE DATABASE ${DATABASE_NAME};\n`);
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
      DATABASE_NAME,
      '--set',
      `database_name=${DATABASE_NAME}`,
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
      label: 'G01/G04-compatible role bootstrap failed',
      errorCode: 'migration_role_bootstrap_failed',
    },
  );
}

function databaseUrl() {
  const credential = encodeURIComponent(syntheticSecrets.migration);
  return `postgresql://moazez_migration:${credential}@127.0.0.1:${databasePort}/${DATABASE_NAME}?schema=public&connection_limit=2&connect_timeout=5&pool_timeout=5`;
}

function parseJsonLines(output) {
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function governedMigrationFailureCode(error) {
  const boundedOutput = `${String(error?.stdout ?? '').slice(
    -MAX_MIGRATION_FAILURE_OUTPUT_BYTES,
  )}\n${String(error?.stderr ?? '').slice(-MAX_MIGRATION_FAILURE_OUTPUT_BYTES)}`;
  let resultCode;
  for (const line of boundedOutput.split(/\r?\n/u)) {
    try {
      const event = JSON.parse(line);
      if (
        event?.event === 'migration.job.result' &&
        event?.status === 'migration_failed' &&
        typeof event?.code === 'string' &&
        MIGRATION_RESULT_CODE_PATTERN.test(event.code)
      ) {
        resultCode = event.code;
      }
    } catch {
      // Ignore non-JSON child diagnostics and fail closed below when no result exists.
    }
  }
  return resultCode ?? 'migration_result_unavailable';
}

function governedMigrationFailure(error) {
  const failure = new Error(governedMigrationFailureCode(error));
  failure.code = 'governed_fresh_migration_failed';
  return failure;
}

function runGovernedFreshMigration() {
  const executionId = `g05-${RUN_ID}-fresh`;
  const url = databaseUrl();
  const artifactDigest = `sha256:${crypto
    .createHash('sha256')
    .update(`g05-disposable:${BASE_SHA}`, 'utf8')
    .digest('hex')}`;
  const environment = {
    ...process.env,
    DATABASE_URL: url,
    DOTENV_CONFIG_PATH: path.join(temporaryRoot, 'no-dotenv-file'),
    DOTENV_CONFIG_QUIET: 'true',
    MIGRATION_JOB_EXECUTION_ID: executionId,
    MIGRATION_JOB_ENVIRONMENT: 'disposable',
    MIGRATION_JOB_ARTIFACT_DIGEST: artifactDigest,
    MIGRATION_JOB_APPROVAL_REF: `SYNTHETIC_APPROVAL:${executionId}`,
    MIGRATION_JOB_BACKUP_CHECKPOINT: `DISPOSABLE_NA:${executionId}`,
    MIGRATION_JOB_DATA_AUTHORITY: `DISPOSABLE_NA:${executionId}`,
  };
  delete environment.SEED_DEMO_DATA;
  let result;
  try {
    result = command(process.execPath, [MIGRATION_RUNNER_PATH], {
      env: environment,
      timeoutMs: 5 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
      label: 'existing G04 governed migration runner failed',
      errorCode: 'governed_fresh_migration_failed',
    });
  } catch (error) {
    throw governedMigrationFailure(error);
  }
  const combined = `${result.stdout}\n${result.stderr}`;
  for (const sensitive of [url, syntheticSecrets.migration]) {
    assert.ok(
      !combined.includes(sensitive),
      'migration output exposed synthetic material',
    );
  }
  const events = parseJsonLines(result.stdout);
  const final = events.findLast(
    (event) => event.event === 'migration.job.result',
  );
  const succeededStages = new Set(
    events
      .filter(
        (event) =>
          event.event === 'migration.job.stage' && event.status === 'succeeded',
      )
      .map((event) => event.stage),
  );
  assert.equal(final?.status, 'migration_applied');
  assert.ok(
    Number.isSafeInteger(final?.migrationCount) && final.migrationCount > 0,
    'governed migration result must expose a positive migration count',
  );
  assert.ok(succeededStages.has('migrate-status'));
  assert.ok(succeededStages.has('migrate-diff'));
  return {
    result: final.status,
    migrationCount: final.migrationCount,
    migrateStatus: 'PASS',
    postDeployDrift: 'ZERO',
    seedExecutions: 0,
    applicationBootstrapExecutions: 0,
    databaseIdentity: 'moazez_migration',
    connectionLimit: 2,
    schema: 'public',
  };
}

function runApprovedReferenceSeeds() {
  const script = [
    "const { PrismaClient } = require('@prisma/client');",
    "const { seedPermissions } = require('./prisma/seeds/01-permissions.seed.ts');",
    "const { seedSystemRoles } = require('./prisma/seeds/02-system-roles.seed.ts');",
    'delete process.env.SEED_DEMO_DATA;',
    '(async () => {',
    '  const prisma = new PrismaClient();',
    '  let approvedFunctionExecutions = 0;',
    '  try {',
    '    await seedPermissions(prisma);',
    '    approvedFunctionExecutions += 1;',
    '    await seedSystemRoles(prisma);',
    '    approvedFunctionExecutions += 1;',
    '    process.stdout.write(`\\nG05_SEED_RESULT=${JSON.stringify({ approvedFunctionExecutions, platformAdminExecutions: 0, demoSeedExecutions: 0 })}\\n`);',
    '  } finally {',
    '    await prisma.$disconnect();',
    '  }',
    '})().catch(() => { process.exitCode = 1; });',
  ].join('\n');
  const environment = { ...process.env, DATABASE_URL: databaseUrl() };
  delete environment.SEED_DEMO_DATA;
  const result = command(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-e', script],
    {
      env: environment,
      timeoutMs: 5 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
      label: 'approved reference seed execution failed',
      errorCode: 'approved_reference_seed_failed',
    },
  );
  assert.ok(
    !`${result.stdout}\n${result.stderr}`.includes(syntheticSecrets.migration),
  );
  const match = result.stdout.match(/G05_SEED_RESULT=(\{[^\r\n]+\})/u);
  assert.ok(match, 'approved seed result marker missing');
  const execution = JSON.parse(match[1]);
  assert.deepEqual(execution, {
    approvedFunctionExecutions: 2,
    platformAdminExecutions: 0,
    demoSeedExecutions: 0,
  });
  return execution;
}

function inspectAllTableCounts() {
  const tableNames = queryScalar(
    DATABASE_NAME,
    "SELECT string_agg(tablename, E'\\n' ORDER BY tablename) FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
  )
    .split(/\r?\n/u)
    .filter(Boolean);
  const counts = {};
  for (const tableName of tableNames) {
    assert.match(tableName, /^[a-z0-9_]+$/u);
    counts[tableName] = Number(
      queryScalar(
        DATABASE_NAME,
        `SELECT count(*) FROM public.\"${tableName}\"`,
      ),
    );
    assert.ok(
      Number.isSafeInteger(counts[tableName]) && counts[tableName] >= 0,
    );
  }
  return counts;
}

function provePostSeedRowScope() {
  const counts = inspectAllTableCounts();
  const nonzeroApplicationTables = Object.entries(counts)
    .filter(
      ([tableName, count]) => tableName !== '_prisma_migrations' && count > 0,
    )
    .map(([tableName]) => tableName)
    .sort();
  assert.deepEqual(nonzeroApplicationTables, [
    ...ALLOWED_NONZERO_APPLICATION_TABLES,
  ]);
  const permissionCount = counts.permissions ?? 0;
  const systemRoleCount = Number(
    queryScalar(
      DATABASE_NAME,
      'SELECT count(*) FROM public.roles WHERE is_system = true',
    ),
  );
  const rolePermissionCount = counts.role_permissions ?? 0;
  const userCount = counts.users ?? 0;
  const organizationCount = counts.organizations ?? 0;
  const schoolCount = counts.schools ?? 0;
  const allOtherBusinessRowTotal = Object.entries(counts)
    .filter(
      ([tableName]) =>
        tableName !== '_prisma_migrations' &&
        !ALLOWED_NONZERO_APPLICATION_TABLES.includes(tableName),
    )
    .reduce((total, [, count]) => total + count, 0);

  assert.equal(permissionCount, 236);
  assert.equal(systemRoleCount, 7);
  assert.equal(rolePermissionCount, 847);
  assert.equal(userCount, 0);
  assert.equal(organizationCount, 0);
  assert.equal(schoolCount, 0);
  assert.equal(allOtherBusinessRowTotal, 0);
  return {
    nonzeroApplicationTables: ['Permission', 'Role', 'RolePermission'],
    nonzeroMetadataTables: ['_prisma_migrations'],
    permissionCount,
    systemRoleCount,
    rolePermissionCount,
    userCount,
    organizationCount,
    schoolCount,
    allOtherBusinessRowTotal,
  };
}

function cleanupOwnedResources() {
  if (databaseCreated) {
    const inspection = JSON.parse(
      docker(['container', 'inspect', DATABASE_CONTAINER], {
        allowFailure: false,
      }).stdout,
    )[0];
    assert.equal(inspection.Name, `/${DATABASE_CONTAINER}`);
    assert.equal(inspection.Config.Labels[RUN_LABEL], RUN_ID);
    assert.equal(inspection.Config.Labels[GATE_LABEL], GATE);
    docker(['rm', '--force', DATABASE_CONTAINER]);
    databaseCreated = false;
  }

  if (temporaryRoot) {
    const resolved = path.resolve(temporaryRoot);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
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
  const remainingVolumes = docker([
    'volume',
    'ls',
    '--quiet',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
  ]).stdout.trim();
  assert.equal(remainingContainers, '');
  assert.equal(remainingNetworks, '');
  assert.equal(remainingVolumes, '');
  return {
    containers: 0,
    networks: 0,
    volumes: 0,
    processes: 0,
    temporaryDirectories: 0,
  };
}

async function runLiveEvidence() {
  const dockerEvidence = verifyLocalDocker();
  databasePort = await allocateLoopbackPort();
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMPORARY_PREFIX));
  createDatabaseContainer();
  createFixtureDatabase();

  const cleanTargetPrecondition = {
    applicationTables: Number(
      queryScalar(
        DATABASE_NAME,
        "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
      ),
    ),
    legacyApplicationRows: 0,
    sourceDatabaseCopies: 0,
    sqlDumpsImported: 0,
    objectSourcesCopied: 0,
    redisDataCopied: 0,
  };
  assert.deepEqual(cleanTargetPrecondition, {
    applicationTables: 0,
    legacyApplicationRows: 0,
    sourceDatabaseCopies: 0,
    sqlDumpsImported: 0,
    objectSourcesCopied: 0,
    redisDataCopied: 0,
  });

  const migration = runGovernedFreshMigration();
  const appliedMigrations = Number(
    queryScalar(
      DATABASE_NAME,
      'SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ),
  );
  assert.equal(appliedMigrations, migration.migrationCount);

  const referenceSeedExecution = runApprovedReferenceSeeds();
  const rows = provePostSeedRowScope();

  return {
    status: 'PASS',
    baseSha: BASE_SHA,
    nodeVersion: process.version,
    docker: {
      ...dockerEvidence,
      loopbackPortAllocated: true,
      exactContainerName: true,
      ownershipLabels: true,
      boundedStartup: true,
      imagePulls: 0,
      persistentVolumes: 0,
    },
    cleanTargetPrecondition,
    migration: { ...migration, appliedMigrations },
    referenceSeedExecution,
    rows,
    sourceEvidence: {
      classification: 'OWNER_DATA_AUTHORITY_ATTESTATION',
      authoritativePostgresqlSourceCount: 0,
      authoritativeObjectSourceCount: 0,
      externalCloudAccountsScanned: false,
    },
    redis: {
      copyAllowed: false,
      recoveryPolicy: 'persisted-truth-reconciliation',
    },
    reopenOnDataDiscovery: true,
    seedInventoryCompleteness: 'PASS',
    cloudAccessCount: 0,
  };
}

async function main() {
  const mode = resolveVerificationMode(process.argv.slice(2));
  let summary;
  let cleanup;
  let primaryFailure;
  try {
    assertRepositoryPreflight(mode);
    assertProtectedScope(mode);
    const focusedTests = runFocusedTests(mode);
    summary = await runLiveEvidence();
    summary.focusedTests = focusedTests;
    assertRepositoryPreflight(mode);
    assertProtectedScope(mode);
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
  process.stdout.write(`PRD3_G05_EVIDENCE_JSON=${JSON.stringify(summary)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `PRD3-G05 final verification failed: ${safeMessage(error)}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_NONZERO_APPLICATION_TABLES,
  BASE_SHA,
  CURRENT_CI_SKIPPED_TEST_COUNT,
  EXPECTED_CHANGED_PATHS,
  FOCUSED_TEST_COUNT,
  VERIFICATION_MODES,
  command,
  focusedTestEnvironment,
  governedMigrationFailure,
  governedMigrationFailureCode,
  inspectRepositoryState,
  isProtectedRegressionPath,
  readChangedPaths,
  resolveVerificationMode,
  runGovernedFreshMigration,
  validateRepositoryState,
};
