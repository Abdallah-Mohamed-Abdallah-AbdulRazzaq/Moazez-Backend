'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { PrismaClient } = require('@prisma/client');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = '6e73da066beb79ba59284a7b96260134c0b38df5';
const REQUIRED_BRANCH = 'chore/production-readiness-3-cloud-sql';
const REQUIRED_NODE_VERSION = 'v22.23.1';
const REQUIRED_NODE_DIRECTORY = path.normalize(
  'C:\\Users\\Abdal\\AppData\\Local\\Moazez\\toolchains\\node-v22.23.1-win-x64',
);
const POSTGRES_IMAGE = 'postgres:16-alpine';
const OWNERSHIP_LABEL = 'com.moazez.prd3-g01-c.run';
const VERIFICATION_MODES = Object.freeze({
  CANDIDATE: 'candidate',
  REGRESSION: 'regression',
});

const EXPECTED_CHANGED_PATHS = Object.freeze([
  'docs/production-readiness/phase-3/04-database-identities-and-least-privilege-evidence.md',
  'scripts/ci/prd3-g01-c-database-privileges.cjs',
  'scripts/database/prd3-g01-c-role-bootstrap.sql',
  'scripts/tests/prd3-g01-c-database-privileges.test.cjs',
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

const MANAGED_ADMIN_LOGIN = 'moazez_cloudsql_admin_fixture';
const CLOUD_SQL_SYSTEM_ROLE = 'cloudsqlsuperuser';

const POSTGRESQL_ROLES = Object.freeze([
  'moazez_api',
  'moazez_core_worker',
  'moazez_media_worker',
  'moazez_migration',
]);

const RUNTIME_ROLES = Object.freeze({
  api: Object.freeze({
    login: 'moazez_api',
    applicationName: 'moazez-api',
    connectionLimit: 5,
    poolTimeoutSeconds: 5,
  }),
  'core-worker': Object.freeze({
    login: 'moazez_core_worker',
    applicationName: 'moazez-core-worker',
    connectionLimit: 6,
    poolTimeoutSeconds: 10,
  }),
  'media-worker': Object.freeze({
    login: 'moazez_media_worker',
    applicationName: 'moazez-media-worker',
    connectionLimit: 3,
    poolTimeoutSeconds: 10,
  }),
});

const ROLE_ATTRIBUTES = Object.freeze({
  login: true,
  superuser: false,
  createDatabase: false,
  createRole: false,
  replication: false,
  bypassRls: false,
  inherit: true,
});

const POSITIVE_CHECK_NAMES = Object.freeze([
  'connection',
  'application_name',
  'representative_read',
  'insert_update_delete',
  'transaction_rollback',
  'no_object_ownership',
]);

const NEGATIVE_CHECK_NAMES = Object.freeze([
  'create_table',
  'alter_table',
  'drop_table',
  'truncate_table',
  'create_index',
  'create_schema',
  'create_extension',
  'create_function',
  'grant_object_privileges',
  'revoke_object_privileges',
  'alter_object_owner',
  'create_role',
  'alter_role',
  'drop_role',
  'create_database',
  'set_role_migration',
  'set_role_other_runtime',
  'read_prisma_migrations',
  'modify_prisma_migrations',
]);

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
const PURE_TEST_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'tests',
  'prd3-g01-c-database-privileges.test.cjs',
);
const PRISMA_CLI_PATH = path.join(
  REPOSITORY_ROOT,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

function command(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    env: options.env ?? process.env,
    input: options.input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const error = new Error(
      `${options.label ?? 'bounded command'} failed with exit code ${String(result.status)}`,
    );
    error.exitCode = result.status;
    throw error;
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function commandExpectedFailure(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    env: options.env ?? process.env,
    input: options.input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });
  if (result.error || result.status === 0) {
    throw new Error(`${options.label ?? 'bounded command'} did not reject`);
  }
  return result.status;
}

function git(args) {
  return command('git', args, { label: 'git inspection' }).stdout.trim();
}

function docker(args, options = {}) {
  return command('docker', args, {
    ...options,
    label: options.label ?? 'local Docker command',
  });
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
    REGRESSION_PROTECTED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function validateRepositoryState(state, mode) {
  assert.ok(Object.values(VERIFICATION_MODES).includes(mode), 'unknown verification mode');
  assert.equal(state.nodeVersion, REQUIRED_NODE_VERSION);
  assert.equal(state.indexClean, true, 'the real index must remain clean');
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
    const protectedChanges = state.changedPaths.filter(isProtectedRegressionPath);
    assert.deepEqual(protectedChanges, [], 'protected repository scope changed');
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
  const headPackage = JSON.parse(git(['show', 'HEAD:package.json']));
  const workingPackage = JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  return {
    branch: git(['branch', '--show-current']),
    head: git(['rev-parse', 'HEAD']),
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

function readChangedPaths() {
  const output = command(
    'git',
    ['status', '--short', '--untracked-files=all'],
    { label: 'working-tree scope inspection' },
  ).stdout;
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .sort();
}

function verifyLocalDocker() {
  const configuredHost = process.env.DOCKER_HOST;
  if (
    configuredHost &&
    !configuredHost.startsWith('npipe://') &&
    !configuredHost.startsWith('unix://')
  ) {
    throw new Error('remote Docker endpoints are not permitted');
  }
  const endpoint = docker([
    'context',
    'inspect',
    '--format',
    '{{(index .Endpoints "docker").Host}}',
  ]).stdout.trim();
  if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')) {
    throw new Error('the active Docker context is not local');
  }
  const serverVersion = docker([
    'version',
    '--format',
    '{{.Server.Version}}',
  ]).stdout.trim();
  assert.ok(serverVersion.length > 0);
  return { endpointTransport: endpoint.split(':', 1)[0], serverVersion };
}

function inspectPostgresImage() {
  const inspected = docker([
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    POSTGRES_IMAGE,
  ]).stdout.trim();
  assert.match(inspected, /^sha256:[a-f0-9]{64}$/u);
  return inspected;
}

function syntheticCredential() {
  return crypto.randomBytes(32).toString('base64url');
}

function psqlArgs(context, login, databaseName, credential, extra = []) {
  return [
    'exec',
    '-i',
    '--env',
    `PGPASSWORD=${credential}`,
    context.containerName,
    'psql',
    '-X',
    '--no-psqlrc',
    '-q',
    '-h',
    '127.0.0.1',
    '-U',
    login,
    '-d',
    databaseName,
    ...extra,
  ];
}

function runSqlPolicy(context, sqlPath, variables, identity = {}) {
  const variableArgs = Object.entries(variables).flatMap(([name, value]) => [
    '-v',
    `${name}=${value}`,
  ]);
  return spawnSync(
    'docker',
    psqlArgs(
      context,
      identity.login ?? context.adminLogin,
      context.databaseName,
      identity.credential ?? context.adminCredential,
      [...variableArgs, '-f', '-'],
    ),
    {
      cwd: REPOSITORY_ROOT,
      input: fs.readFileSync(sqlPath),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

function applySqlPolicy(context, sqlPath, variables, identity) {
  const result = runSqlPolicy(context, sqlPath, variables, identity);
  if (result.error || result.status !== 0) {
    const safeCategory = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .split(/\r?\n/u)
      .map((line) => redactFixtureValues(context, line.trim()))
      .filter((line) => /^(?:ERROR:|FATAL:|psql:)/u.test(line))
      .slice(0, 5)
      .join(' | ');
    throw new Error(
      `SQL policy application failed with exit code ${String(result.status)}${safeCategory ? ` (${safeCategory})` : ''}`,
    );
  }
}

function applySqlPolicyExpectedFailure(context, sqlPath, variables, expectedError) {
  const result = runSqlPolicy(context, sqlPath, variables);
  if (result.error || result.status === 0) {
    throw new Error('unsafe SQL policy rehearsal did not fail closed');
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  for (const credential of context.credentialValues) {
    if (output.includes(credential)) {
      throw new Error('SQL policy failure output exposed synthetic credential material');
    }
  }
  if (!expectedError.test(output)) {
    throw new Error('SQL policy failure did not report the expected sanitized guard');
  }
  return true;
}

function queryScalarAs(context, login, credential, sql, databaseName) {
  return docker(
    psqlArgs(
      context,
      login,
      databaseName ?? context.databaseName,
      credential,
      ['-A', '-t', '-c', sql],
    ),
    { label: 'catalog assertion' },
  ).stdout.trim();
}

function queryScalar(context, sql) {
  return queryScalarAs(
    context,
    context.adminLogin,
    context.adminCredential,
    sql,
  );
}

function executePsql(context, login, credential, sql, databaseName) {
  docker(
    psqlArgs(
      context,
      login,
      databaseName ?? context.databaseName,
      credential,
      ['-v', 'ON_ERROR_STOP=1', '-f', '-'],
    ),
    { input: sql, label: 'bounded PostgreSQL assertion' },
  );
}

function executePsqlWithVariables(
  context,
  login,
  credential,
  sql,
  variables,
  databaseName,
) {
  const variableArgs = Object.entries(variables).flatMap(([name, value]) => [
    '-v',
    `${name}=${value}`,
  ]);
  docker(
    psqlArgs(
      context,
      login,
      databaseName ?? context.databaseName,
      credential,
      [...variableArgs, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    ),
    { input: sql, label: 'bounded PostgreSQL fixture setup' },
  );
}

function runPrisma(context, args, label) {
  const result = spawnSync(process.execPath, [PRISMA_CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, DATABASE_URL: context.migrationUrl },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const safeCategory = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .split(/\r?\n/u)
      .map((line) => redactFixtureValues(context, line.trim()))
      .filter((line) => /^(?:Error:|ERROR:|P\d{4}|Database error code:)/u.test(line))
      .slice(0, 5)
      .join(' | ');
    throw new Error(
      `${label} failed with exit code ${String(result.status)}${safeCategory ? ` (${safeCategory})` : ''}`,
    );
  }
  return result.stdout;
}

function redactFixtureValues(context, value) {
  let redacted = value;
  for (const sensitive of [
    context.fixtureOwnerLogin,
    context.fixtureOwnerCredential,
    context.adminLogin,
    context.adminCredential,
    context.databaseName,
    context.migrationUrl,
    ...context.credentialValues,
    ...POSTGRESQL_ROLES,
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0)) {
    redacted = redacted.replaceAll(sensitive, '[redacted]');
  }
  return redacted
    .replace(/postgres(?:ql)?:\/\/\S+/giu, '[redacted]')
    .replace(/127\.0\.0\.1(?::\d+)?/gu, '[redacted]');
}

function makeDatabaseUrl(context, login, credential, parameters = {}) {
  const url = new URL('postgresql://127.0.0.1');
  url.username = login;
  url.password = credential;
  url.port = String(context.hostPort);
  url.pathname = `/${context.databaseName}`;
  url.searchParams.set('schema', 'public');
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, String(value));
  }
  return url.toString();
}

function postgresReadinessProbe(context, execute = spawnSync) {
  return execute(
    'docker',
    [
      'exec',
      context.containerName,
      'pg_isready',
      '-q',
      '-h',
      '127.0.0.1',
      '-U',
      context.fixtureOwnerLogin,
      '-d',
      context.databaseName,
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
      shell: false,
    },
  );
}

function waitForPostgres(context, options = {}) {
  const now = options.now ?? Date.now;
  const probe = options.probe ?? postgresReadinessProbe;
  const poll =
    options.poll ??
    ((milliseconds) =>
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds));
  const deadline = now() + 60_000;
  while (now() < deadline) {
    const result = probe(context);
    if (result.status === 0) return;
    poll(250);
  }
  throw new Error('disposable PostgreSQL did not become ready');
}

function createFixture(dockerEvidence, imageId) {
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const fixtureOwnerCredential = syntheticCredential();
  const adminCredential = syntheticCredential();
  const credentials = {
    moazez_api: syntheticCredential(),
    moazez_core_worker: syntheticCredential(),
    moazez_media_worker: syntheticCredential(),
    moazez_migration: syntheticCredential(),
  };
  const context = {
    runId,
    label: `${OWNERSHIP_LABEL}=${runId}`,
    networkName: `moazez-g01c-net-${runId}`,
    containerName: `moazez-g01c-pg-${runId}`,
    fixtureOwnerLogin: `g01c_owner_${runId}`,
    fixtureOwnerCredential,
    adminLogin: MANAGED_ADMIN_LOGIN,
    adminCredential,
    databaseName: `g01c_app_${runId}`,
    credentials,
    credentialValues: new Set([
      fixtureOwnerCredential,
      adminCredential,
      ...Object.values(credentials),
    ]),
    imageId,
    dockerEvidence,
    containerCreated: false,
    networkCreated: false,
    hostPort: null,
    migrationUrl: null,
    trackedClients: new Set(),
    sessionsBeforeRemoval: null,
  };

  docker(['network', 'create', '--label', context.label, context.networkName]);
  context.networkCreated = true;
  docker([
    'run',
    '--detach',
    '--name',
    context.containerName,
    '--label',
    context.label,
    '--network',
    context.networkName,
    '--pull=never',
    '--tmpfs',
    '/var/lib/postgresql/data:rw,noexec,nosuid,size=512m',
    '--publish',
    '127.0.0.1::5432',
    '--env',
    `POSTGRES_USER=${context.fixtureOwnerLogin}`,
    '--env',
    `POSTGRES_PASSWORD=${context.fixtureOwnerCredential}`,
    '--env',
    `POSTGRES_DB=${context.databaseName}`,
    '--env',
    'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',
    imageId,
  ]);
  context.containerCreated = true;
  waitForPostgres(context);
  const mounts = JSON.parse(
    docker([
      'container',
      'inspect',
      '--format',
      '{{json .Mounts}}',
      context.containerName,
    ]).stdout.trim(),
  );
  assert.equal(
    mounts.some((mount) => mount.Type === 'volume' || mount.Type === 'bind'),
    false,
    'persistent or host-backed fixture storage is forbidden',
  );
  const tmpfs = JSON.parse(
    docker([
      'container',
      'inspect',
      '--format',
      '{{json .HostConfig.Tmpfs}}',
      context.containerName,
    ]).stdout.trim(),
  );
  assert.equal(
    Object.hasOwn(tmpfs, '/var/lib/postgresql/data'),
    true,
    'PostgreSQL fixture data must use tmpfs',
  );
  const port = docker([
    'port',
    context.containerName,
    '5432/tcp',
  ]).stdout.trim();
  const match = port.match(/^127\.0\.0\.1:(\d+)$/u);
  assert.ok(match, 'PostgreSQL must bind only to a random 127.0.0.1 port');
  context.hostPort = Number(match[1]);
  return context;
}

function initializeManagedAdministrator(context, operations = {}) {
  const executeFixtureSetup =
    operations.executePsqlWithVariables ?? executePsqlWithVariables;
  const inspectAs = operations.queryScalarAs ?? queryScalarAs;
  const inspect = operations.queryScalar ?? queryScalar;
  executeFixtureSetup(
    context,
    context.fixtureOwnerLogin,
    context.fixtureOwnerCredential,
    `CREATE ROLE ${MANAGED_ADMIN_LOGIN}
       LOGIN NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
       PASSWORD :'managed_admin_credential';
     ALTER DATABASE :"database_name" OWNER TO ${MANAGED_ADMIN_LOGIN};
     ALTER SCHEMA public OWNER TO ${MANAGED_ADMIN_LOGIN};`,
    {
      database_name: context.databaseName,
      managed_admin_credential: context.adminCredential,
    },
  );
  assert.equal(
    inspectAs(
      context,
      context.fixtureOwnerLogin,
      context.fixtureOwnerCredential,
      `SELECT rolcanlogin AND NOT rolsuper AND rolcreatedb AND rolcreaterole
         AND NOT rolreplication AND NOT rolbypassrls AND rolinherit
       FROM pg_catalog.pg_roles
       WHERE rolname = ${sqlLiteral(MANAGED_ADMIN_LOGIN)}`,
    ),
    't',
  );
  assert.equal(
    inspectAs(
      context,
      context.fixtureOwnerLogin,
      context.fixtureOwnerCredential,
      `SELECT count(*)
       FROM pg_catalog.pg_roles AS super_role
       JOIN pg_catalog.pg_roles AS managed_role
         ON managed_role.rolname = ${sqlLiteral(MANAGED_ADMIN_LOGIN)}
       WHERE super_role.rolsuper
         AND super_role.oid <> managed_role.oid
         AND pg_catalog.pg_has_role(managed_role.oid, super_role.oid, 'MEMBER')`,
    ),
    '0',
  );
  assert.equal(
    inspect(
      context,
      `SELECT database_owner.rolname = ${sqlLiteral(MANAGED_ADMIN_LOGIN)}
         AND schema_owner.rolname = ${sqlLiteral(MANAGED_ADMIN_LOGIN)}
       FROM pg_catalog.pg_database AS database
       JOIN pg_catalog.pg_roles AS database_owner ON database_owner.oid = database.datdba
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.nspname = 'public'
       JOIN pg_catalog.pg_roles AS schema_owner ON schema_owner.oid = namespace.nspowner
       WHERE database.datname = current_database()`,
    ),
    't',
  );
  return true;
}

function bootstrapVariables(context, credentials = context.credentials) {
  return {
    database_name: context.databaseName,
    api_role_credential: credentials.moazez_api,
    core_worker_role_credential: credentials.moazez_core_worker,
    media_worker_role_credential: credentials.moazez_media_worker,
    migration_role_credential: credentials.moazez_migration,
  };
}

function rotatedCredentials(context) {
  const credentials = Object.fromEntries(
    POSTGRESQL_ROLES.map((role) => [role, syntheticCredential()]),
  );
  for (const credential of Object.values(credentials)) {
    context.credentialValues.add(credential);
  }
  return credentials;
}

function verifyCredentialRotation(context, previousCredentials) {
  for (const role of POSTGRESQL_ROLES) {
    executePsql(context, role, context.credentials[role], 'SELECT 1;');
    commandExpectedFailure(
      'docker',
      psqlArgs(
        context,
        role,
        context.databaseName,
        previousCredentials[role],
        ['-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'],
      ),
      { label: 'retired synthetic database credential' },
    );
  }
  return true;
}

function verifyRoleCatalog(context) {
  const rows = JSON.parse(
    queryScalar(
      context,
      `SELECT COALESCE(json_agg(row_to_json(required_roles) ORDER BY rolname), '[]'::json)::text
       FROM (
         SELECT rolname, rolcanlogin AS login, rolsuper AS superuser,
                rolcreatedb AS "createDatabase", rolcreaterole AS "createRole",
                rolreplication AS replication, rolbypassrls AS "bypassRls",
                rolinherit AS inherit
         FROM pg_catalog.pg_roles
         WHERE rolname = ANY (ARRAY[${POSTGRESQL_ROLES.map(sqlLiteral).join(',')}])
       ) AS required_roles`,
    ),
  );
  assert.deepEqual(
    rows.map((row) => row.rolname).sort(),
    [...POSTGRESQL_ROLES].sort(),
  );
  for (const row of rows) {
    const { rolname, ...attributes } = row;
    assert.deepEqual(attributes, ROLE_ATTRIBUTES, `${rolname} attribute drift`);
  }
  return rows;
}

function verifyMembershipCatalog(context) {
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*)
       FROM pg_catalog.pg_roles AS member_role
       CROSS JOIN pg_catalog.pg_roles AS granted_role
       WHERE member_role.rolname = ANY (ARRAY[${POSTGRESQL_ROLES.map(sqlLiteral).join(',')}])
         AND (
           granted_role.rolname = ${sqlLiteral(CLOUD_SQL_SYSTEM_ROLE)}
           OR (
             granted_role.rolname = ANY (ARRAY[${POSTGRESQL_ROLES.map(sqlLiteral).join(',')}])
             AND granted_role.oid <> member_role.oid
           )
         )
         AND pg_catalog.pg_has_role(member_role.oid, granted_role.oid, 'MEMBER')`,
    ),
    '0',
  );
  return true;
}

function assertCredentialStillActive(context, role, credential) {
  executePsql(context, role, credential, 'SELECT 1;');
}

function assertCredentialRejected(context, role, credential) {
  commandExpectedFailure(
    'docker',
    psqlArgs(
      context,
      role,
      context.databaseName,
      credential,
      ['-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'],
    ),
    { label: 'rejected synthetic rehearsal credential' },
  );
}

function rehearseUnsafeRoleAttribute(context) {
  const candidateCredentials = rotatedCredentials(context);
  executePsql(
    context,
    context.fixtureOwnerLogin,
    context.fixtureOwnerCredential,
    'ALTER ROLE moazez_api CREATEDB;',
  );
  try {
    const before = securitySnapshot(context);
    applySqlPolicyExpectedFailure(
      context,
      ROLE_BOOTSTRAP_PATH,
      bootstrapVariables(context, candidateCredentials),
      /required database role attributes are unsafe/u,
    );
    assert.equal(securitySnapshot(context), before);
    assertCredentialStillActive(
      context,
      'moazez_api',
      context.credentials.moazez_api,
    );
    assertCredentialRejected(
      context,
      'moazez_api',
      candidateCredentials.moazez_api,
    );
  } finally {
    executePsql(
      context,
      context.fixtureOwnerLogin,
      context.fixtureOwnerCredential,
      'ALTER ROLE moazez_api NOCREATEDB;',
    );
  }
  verifyRoleCatalog(context);
  return true;
}

function rehearseCloudSqlSystemMembership(context) {
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_roles
       WHERE rolname = ${sqlLiteral(CLOUD_SQL_SYSTEM_ROLE)}`,
    ),
    '0',
  );
  const candidateCredentials = rotatedCredentials(context);
  executePsql(
    context,
    context.fixtureOwnerLogin,
    context.fixtureOwnerCredential,
    `CREATE ROLE ${CLOUD_SQL_SYSTEM_ROLE} NOLOGIN;
     GRANT ${CLOUD_SQL_SYSTEM_ROLE} TO moazez_api;`,
  );
  try {
    const before = securitySnapshot(context);
    applySqlPolicyExpectedFailure(
      context,
      ROLE_BOOTSTRAP_PATH,
      bootstrapVariables(context, candidateCredentials),
      /required database role memberships are unsafe/u,
    );
    assert.equal(securitySnapshot(context), before);
    assertCredentialStillActive(
      context,
      'moazez_api',
      context.credentials.moazez_api,
    );
    assertCredentialRejected(
      context,
      'moazez_api',
      candidateCredentials.moazez_api,
    );
  } finally {
    executePsql(
      context,
      context.fixtureOwnerLogin,
      context.fixtureOwnerCredential,
      `REVOKE ${CLOUD_SQL_SYSTEM_ROLE} FROM moazez_api;
       DROP ROLE ${CLOUD_SQL_SYSTEM_ROLE};`,
    );
  }
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_roles
       WHERE rolname = ${sqlLiteral(CLOUD_SQL_SYSTEM_ROLE)}`,
    ),
    '0',
  );
  verifyMembershipCatalog(context);
  return true;
}

function rehearseCrossRoleMembership(context) {
  const candidateCredentials = rotatedCredentials(context);
  executePsql(
    context,
    context.fixtureOwnerLogin,
    context.fixtureOwnerCredential,
    'GRANT moazez_migration TO moazez_api;',
  );
  try {
    const before = securitySnapshot(context);
    applySqlPolicyExpectedFailure(
      context,
      ROLE_BOOTSTRAP_PATH,
      bootstrapVariables(context, candidateCredentials),
      /required database role memberships are unsafe/u,
    );
    assert.equal(securitySnapshot(context), before);
    assertCredentialStillActive(
      context,
      'moazez_api',
      context.credentials.moazez_api,
    );
    assertCredentialRejected(
      context,
      'moazez_api',
      candidateCredentials.moazez_api,
    );
  } finally {
    executePsql(
      context,
      context.fixtureOwnerLogin,
      context.fixtureOwnerCredential,
      'REVOKE moazez_migration FROM moazez_api;',
    );
  }
  verifyMembershipCatalog(context);
  return true;
}

function verifyOwnershipAndPrivileges(context) {
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_class class
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
       JOIN pg_catalog.pg_roles owner ON owner.oid = class.relowner
       WHERE namespace.nspname = 'public'
         AND class.relkind IN ('r','p','S','v','m','f','i')
         AND owner.rolname <> 'moazez_migration'`,
    ),
    '0',
  );
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) = 1 AND bool_and(
         procedure.proname = 'normalize_learning_media_original_name'
         AND procedure.provolatile = 'i'
         AND procedure.proisstrict
         AND NOT procedure.prosecdef
         AND procedure.proparallel = 's'
         AND language.lanname = 'sql'
       )
       FROM pg_catalog.pg_proc procedure
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
       JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
       WHERE namespace.nspname = 'public'`,
    ),
    't',
  );
  for (const { login } of Object.values(RUNTIME_ROLES)) {
    assert.equal(
      queryScalar(
        context,
        `SELECT has_function_privilege(${sqlLiteral(login)}, 'public.normalize_learning_media_original_name(text)', 'EXECUTE')
           AND NOT EXISTS (
             SELECT 1
             FROM pg_catalog.pg_proc procedure
             JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
             JOIN pg_catalog.pg_roles grantee ON grantee.rolname = ${sqlLiteral(login)}
             CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) acl
             WHERE namespace.nspname = 'public' AND procedure.proname = 'normalize_learning_media_original_name'
               AND acl.grantee = grantee.oid
           )`,
      ),
      't',
    );
  }
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*)
       FROM pg_catalog.pg_default_acl defaults
       JOIN pg_catalog.pg_roles owner ON owner.oid = defaults.defaclrole
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
       CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
       WHERE owner.rolname = 'moazez_migration' AND namespace.nspname = 'public'
         AND defaults.defaclobjtype = 'f' AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'`,
    ),
    '0',
  );
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_proc procedure
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
       JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
       WHERE namespace.nspname = 'public' AND owner.rolname <> 'moazez_migration'`,
    ),
    '0',
  );
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_class class
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
       JOIN pg_catalog.pg_roles owner ON owner.oid = class.relowner
       WHERE namespace.nspname = 'public'
         AND owner.rolname = ANY (ARRAY[${Object.values(RUNTIME_ROLES).map((role) => sqlLiteral(role.login)).join(',')}])`,
    ),
    '0',
  );
  assert.equal(
    queryScalar(
      context,
      `SELECT has_database_privilege('moazez_migration', current_database(), 'CONNECT')
         AND has_database_privilege('moazez_migration', current_database(), 'CREATE')
         AND NOT has_database_privilege('moazez_migration', current_database(), 'TEMPORARY')
         AND has_schema_privilege('moazez_migration', 'public', 'USAGE')
         AND has_schema_privilege('moazez_migration', 'public', 'CREATE')`,
    ),
    't',
  );

  for (const { login } of Object.values(RUNTIME_ROLES)) {
    assert.equal(
      queryScalar(
        context,
        `SELECT bool_and(
           has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'SELECT')
           AND has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'INSERT')
           AND has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'UPDATE')
           AND has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'DELETE')
           AND NOT has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'TRUNCATE')
           AND NOT has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'REFERENCES')
           AND NOT has_table_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'TRIGGER')
         )
         FROM pg_catalog.pg_class class
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
         WHERE namespace.nspname = 'public' AND class.relkind IN ('r','p')
           AND class.relname <> '_prisma_migrations'`,
      ),
      't',
    );
    assert.equal(
      queryScalar(
        context,
        `SELECT count(*) FROM pg_catalog.pg_class class
         JOIN pg_catalog.pg_roles grantee ON grantee.rolname = ${sqlLiteral(login)}
         CROSS JOIN LATERAL aclexplode(COALESCE(class.relacl, acldefault(CASE WHEN class.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, class.relowner))) acl
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
         WHERE namespace.nspname = 'public' AND acl.grantee = grantee.oid
           AND acl.is_grantable`,
      ),
      '0',
    );
    assert.equal(
      queryScalar(
        context,
        `SELECT has_table_privilege(${sqlLiteral(login)}, 'public._prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
      ),
      'f',
    );
    assert.equal(
      queryScalar(
        context,
        `SELECT has_database_privilege(${sqlLiteral(login)}, current_database(), 'CONNECT')
           AND NOT has_database_privilege(${sqlLiteral(login)}, current_database(), 'CREATE')
           AND NOT has_database_privilege(${sqlLiteral(login)}, current_database(), 'TEMPORARY')
           AND has_schema_privilege(${sqlLiteral(login)}, 'public', 'USAGE')
           AND NOT has_schema_privilege(${sqlLiteral(login)}, 'public', 'CREATE')`,
      ),
      't',
    );
    assert.equal(
      queryScalar(
        context,
        `SELECT COALESCE(bool_and(
           has_sequence_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'USAGE')
           AND has_sequence_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'SELECT')
           AND NOT has_sequence_privilege(${sqlLiteral(login)}, format('%I.%I', namespace.nspname, class.relname), 'UPDATE')
         ), true)
         FROM pg_catalog.pg_class class
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
         WHERE namespace.nspname = 'public' AND class.relkind = 'S'`,
      ),
      't',
    );
  }

  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_namespace namespace,
       LATERAL aclexplode(COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))) acl
       WHERE namespace.nspname = 'public' AND acl.grantee = 0
         AND acl.privilege_type = 'CREATE'`,
    ),
    '0',
  );
  assert.equal(
    queryScalar(
      context,
      `SELECT count(*) FROM pg_catalog.pg_database database,
       LATERAL aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) acl
       WHERE database.datname = current_database() AND acl.grantee = 0`,
    ),
    '0',
  );
}

function verifyDefaultPrivilegesWithControlledDdl(context) {
  const suffix = context.runId.slice(0, 12);
  const tableName = `g01c_controlled_${suffix}`;
  executePsql(
    context,
    'moazez_migration',
    context.credentials.moazez_migration,
    `CREATE TABLE public.${tableName} (
       id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
       value text NOT NULL
     );`,
  );
  const sequenceName = queryScalar(
    context,
    `SELECT pg_get_serial_sequence('public.${tableName}', 'id')`,
  );
  assert.match(sequenceName, /^public\./u);
  for (const role of Object.values(RUNTIME_ROLES)) {
    assert.equal(
      queryScalar(
        context,
        `SELECT has_table_privilege(${sqlLiteral(role.login)}, 'public.${tableName}', 'SELECT')
           AND has_table_privilege(${sqlLiteral(role.login)}, 'public.${tableName}', 'INSERT')
           AND has_table_privilege(${sqlLiteral(role.login)}, 'public.${tableName}', 'UPDATE')
           AND has_table_privilege(${sqlLiteral(role.login)}, 'public.${tableName}', 'DELETE')
           AND NOT has_table_privilege(${sqlLiteral(role.login)}, 'public.${tableName}', 'TRUNCATE,REFERENCES,TRIGGER')
           AND has_sequence_privilege(${sqlLiteral(role.login)}, ${sqlLiteral(sequenceName)}, 'USAGE')
           AND has_sequence_privilege(${sqlLiteral(role.login)}, ${sqlLiteral(sequenceName)}, 'SELECT')
           AND NOT has_sequence_privilege(${sqlLiteral(role.login)}, ${sqlLiteral(sequenceName)}, 'UPDATE')`,
      ),
      't',
    );
    executePsql(
      context,
      role.login,
      context.credentials[role.login],
      `BEGIN;
       INSERT INTO public.${tableName} (value) VALUES ('synthetic');
       UPDATE public.${tableName} SET value = 'verified';
       DELETE FROM public.${tableName};
       COMMIT;`,
    );
  }
  executePsql(
    context,
    'moazez_migration',
    context.credentials.moazez_migration,
    `DROP TABLE public.${tableName};`,
  );
  assert.equal(queryScalar(context, `SELECT to_regclass('public.${tableName}') IS NULL`), 't');
}

async function seedSyntheticFixture(context) {
  const client = new PrismaClient({ datasourceUrl: context.migrationUrl });
  context.trackedClients.add(client);
  const suffix = context.runId.slice(0, 12);
  const organization = await client.organization.create({
    data: { name: `G01C ${suffix}`, slug: `g01c-${suffix}` },
    select: { id: true },
  });
  const school = await client.school.create({
    data: {
      organizationId: organization.id,
      name: `G01C School ${suffix}`,
      slug: `g01c-school-${suffix}`,
    },
    select: { id: true },
  });
  const user = await client.user.create({
    data: {
      email: `g01c-${suffix}@invalid.example`,
      firstName: 'Synthetic',
      lastName: 'Fixture',
      userType: 'SERVICE_ACCOUNT',
    },
    select: { id: true },
  });
  const file = await client.file.create({
    data: {
      organizationId: organization.id,
      schoolId: school.id,
      uploaderId: user.id,
      bucket: `g01c-${suffix}`,
      objectKey: `fixture/${suffix}`,
      originalName: 'synthetic.txt',
      mimeType: 'text/plain',
      sizeBytes: 9n,
    },
    select: { id: true },
  });
  await disconnectTrackedClient(context, client);
  return { organizationId: organization.id, schoolId: school.id, userId: user.id, fileId: file.id };
}

async function verifyRuntimePositive(context, runtimeRole, fixture) {
  const policy = RUNTIME_ROLES[runtimeRole];
  const databaseUrl = makeDatabaseUrl(
    context,
    policy.login,
    context.credentials[policy.login],
    {
      connection_limit: policy.connectionLimit,
      pool_timeout: policy.poolTimeoutSeconds,
      connect_timeout: 5,
      application_name: policy.applicationName,
    },
  );
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const priorRuntimeRole = process.env.DATABASE_RUNTIME_ROLE;
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_RUNTIME_ROLE = runtimeRole;
  const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  context.trackedClients.add(client);
  const checks = Object.fromEntries(POSITIVE_CHECK_NAMES.map((name) => [name, false]));
  try {
    await client.$connect();
    checks.connection = true;
    const applicationRows = await client.$queryRawUnsafe(
      `SELECT current_setting('application_name') AS "applicationName"`,
    );
    assert.equal(applicationRows[0].applicationName, policy.applicationName);
    checks.application_name = true;
    const representativeCount =
      runtimeRole === 'api'
        ? await client.organization.count()
        : runtimeRole === 'core-worker'
          ? await client.importJob.count()
          : await client.fileUploadSession.count();
    assert.equal(Number.isSafeInteger(representativeCount), true);
    assert.ok(representativeCount >= (runtimeRole === 'api' ? 1 : 0));
    checks.representative_read = true;
    await runRepresentativeDml(client, runtimeRole, fixture, context.runId);
    checks.insert_update_delete = true;
    await verifyRepresentativeRollback(client, runtimeRole, fixture, context.runId);
    checks.transaction_rollback = true;
    const ownership = await client.$queryRawUnsafe(
      `SELECT count(*)::int AS count
       FROM pg_catalog.pg_class class
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public' AND class.relowner = current_user::regrole`,
    );
    assert.equal(ownership[0].count, 0);
    checks.no_object_ownership = true;
  } finally {
    await disconnectTrackedClient(context, client);
    restoreEnvironment('DATABASE_URL', priorDatabaseUrl);
    restoreEnvironment('DATABASE_RUNTIME_ROLE', priorRuntimeRole);
  }
  return checks;
}

async function runRepresentativeDml(client, runtimeRole, fixture, runId) {
  const suffix = crypto.randomUUID().slice(0, 8);
  await client.$transaction(async (transaction) => {
    if (runtimeRole === 'api') {
      const row = await transaction.organization.create({
        data: { name: 'G01C API DML', slug: `g01c-api-${runId}-${suffix}` },
        select: { id: true },
      });
      await transaction.organization.update({ where: { id: row.id }, data: { name: 'G01C API updated' } });
      await transaction.organization.delete({ where: { id: row.id } });
      return;
    }
    if (runtimeRole === 'core-worker') {
      const row = await transaction.importJob.create({
        data: {
          schoolId: fixture.schoolId,
          uploadedFileId: fixture.fileId,
          createdById: fixture.userId,
          type: `g01c-${suffix}`,
        },
        select: { id: true },
      });
      await transaction.importJob.update({ where: { id: row.id }, data: { status: 'PROCESSING' } });
      await transaction.importJob.delete({ where: { id: row.id } });
      return;
    }
    const createdAt = new Date();
    const row = await transaction.fileUploadSession.create({
      data: {
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        createdByUserId: fixture.userId,
        clientRequestId: crypto.randomUUID(),
        purpose: 'LESSON_CONTENT',
        originalName: 'synthetic.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: 128n,
        stagingBucket: 'g01c-staging',
        stagingObjectKey: `staging/${runId}/${suffix}`,
        finalBucket: 'g01c-final',
        finalObjectKey: `media/${runId}/${suffix}`,
        expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        createdAt,
      },
      select: { id: true },
    });
    await transaction.fileUploadSession.update({
      where: { id: row.id },
      data: {
        status: 'UPLOADING',
        latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
      },
    });
    await transaction.fileUploadSession.delete({ where: { id: row.id } });
  });
}

async function verifyRepresentativeRollback(client, runtimeRole, fixture, runId) {
  const rollbackId = crypto.randomUUID();
  let createdId;
  await assert.rejects(
    client.$transaction(async (transaction) => {
      if (runtimeRole === 'api') {
        const row = await transaction.organization.create({
          data: { name: 'G01C rollback', slug: `g01c-rollback-${rollbackId}` },
          select: { id: true },
        });
        createdId = row.id;
      } else if (runtimeRole === 'core-worker') {
        const row = await transaction.importJob.create({
          data: {
            schoolId: fixture.schoolId,
            uploadedFileId: fixture.fileId,
            createdById: fixture.userId,
            type: `g01c-rollback-${rollbackId}`,
          },
          select: { id: true },
        });
        createdId = row.id;
      } else {
        const createdAt = new Date();
        const row = await transaction.fileUploadSession.create({
          data: {
            organizationId: fixture.organizationId,
            schoolId: fixture.schoolId,
            createdByUserId: fixture.userId,
            clientRequestId: rollbackId,
            purpose: 'LESSON_CONTENT',
            originalName: 'rollback.mp4',
            expectedMimeType: 'video/mp4',
            expectedSizeBytes: 64n,
            stagingBucket: 'g01c-staging',
            stagingObjectKey: `rollback-staging/${runId}/${rollbackId}`,
            finalBucket: 'g01c-final',
            finalObjectKey: `rollback/${runId}/${rollbackId}`,
            expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
            createdAt,
          },
          select: { id: true },
        });
        createdId = row.id;
      }
      throw new Error('G01C_EXPECTED_ROLLBACK');
    }),
    /G01C_EXPECTED_ROLLBACK/u,
  );
  assert.ok(createdId);
  const model = runtimeRole === 'api' ? client.organization : runtimeRole === 'core-worker' ? client.importJob : client.fileUploadSession;
  assert.equal(await model.count({ where: { id: createdId } }), 0);
}

function securitySnapshot(context) {
  return queryScalar(
    context,
    `SELECT jsonb_build_object(
       'roles', (SELECT COALESCE(jsonb_agg(to_jsonb(role_row) ORDER BY rolname), '[]'::jsonb)
                 FROM (SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
                              rolbypassrls, rolinherit
                       FROM pg_catalog.pg_roles
                       WHERE rolname = ANY (ARRAY[${POSTGRESQL_ROLES.map(sqlLiteral).join(',')}])) role_row),
       'memberships', (SELECT COALESCE(jsonb_agg(to_jsonb(member_row) ORDER BY granted_role, member_role), '[]'::jsonb)
                       FROM (SELECT granted.rolname granted_role, member.rolname member_role,
                                    membership.admin_option, membership.inherit_option, membership.set_option
                             FROM pg_catalog.pg_auth_members membership
                             JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
                             JOIN pg_catalog.pg_roles member ON member.oid = membership.member
                             WHERE granted.rolname = ANY (ARRAY[${POSTGRESQL_ROLES.map(sqlLiteral).join(',')}])
                                OR member.rolname = ANY (ARRAY[${POSTGRESQL_ROLES.map(sqlLiteral).join(',')}])) member_row),
       'databases', (SELECT jsonb_agg(jsonb_build_array(datname, COALESCE(datacl::text, '')) ORDER BY datname)
                     FROM pg_catalog.pg_database),
       'namespaces', (SELECT jsonb_agg(jsonb_build_array(nspname, owner.rolname, COALESCE(nspacl::text, '')) ORDER BY nspname)
                      FROM pg_catalog.pg_namespace namespace
                      JOIN pg_catalog.pg_roles owner ON owner.oid = namespace.nspowner
                      WHERE nspname = 'public'),
       'classes', (SELECT jsonb_agg(jsonb_build_array(relname, relkind, owner.rolname, COALESCE(relacl::text, '')) ORDER BY relname, relkind)
                   FROM pg_catalog.pg_class class
                   JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
                   JOIN pg_catalog.pg_roles owner ON owner.oid = class.relowner
                   WHERE namespace.nspname = 'public'),
       'attributes', (SELECT jsonb_agg(jsonb_build_array(class.relname, attribute.attname) ORDER BY class.relname, attribute.attnum)
                      FROM pg_catalog.pg_attribute attribute
                      JOIN pg_catalog.pg_class class ON class.oid = attribute.attrelid
                      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
                      WHERE namespace.nspname = 'public' AND attribute.attnum > 0 AND NOT attribute.attisdropped),
       'procedures', (SELECT COALESCE(jsonb_agg(jsonb_build_array(procedure.proname, owner.rolname, COALESCE(procedure.proacl::text, '')) ORDER BY procedure.proname), '[]'::jsonb)
                      FROM pg_catalog.pg_proc procedure
                      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
                      JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
                      WHERE namespace.nspname = 'public'),
       'extensions', (SELECT jsonb_agg(extname ORDER BY extname) FROM pg_catalog.pg_extension),
       'defaults', (SELECT COALESCE(jsonb_agg(jsonb_build_array(owner.rolname, namespace.nspname, defaclobjtype, defaclacl::text)
                                              ORDER BY owner.rolname, namespace.nspname, defaclobjtype), '[]'::jsonb)
                    FROM pg_catalog.pg_default_acl defaults
                    JOIN pg_catalog.pg_roles owner ON owner.oid = defaults.defaclrole
                    LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.oid = defaults.defaclnamespace)
     )::text`,
  );
}

function negativeCases(context, role) {
  const suffix = `${context.runId.slice(0, 8)}_${role.login.replace('moazez_', '')}`;
  const otherRuntime = Object.values(RUNTIME_ROLES).find((candidate) => candidate.login !== role.login);
  return [
    ['create_table', `CREATE TABLE public.g01c_denied_table_${suffix} (id integer)`, true],
    ['alter_table', `ALTER TABLE public.organizations ADD COLUMN g01c_denied_${suffix} text`, true],
    ['drop_table', 'DROP TABLE public.organizations', true],
    ['truncate_table', 'TRUNCATE TABLE public.organizations', true],
    ['create_index', `CREATE INDEX g01c_denied_index_${suffix} ON public.organizations (name)`, true],
    ['create_schema', `CREATE SCHEMA g01c_denied_schema_${suffix}`, true],
    ['create_extension', 'CREATE EXTENSION pg_trgm', true],
    ['create_function', `CREATE FUNCTION public.g01c_denied_function_${suffix}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`, true],
    ['grant_object_privileges', 'GRANT SELECT ON TABLE public.organizations TO moazez_migration', true],
    ['revoke_object_privileges', `REVOKE SELECT ON TABLE public.organizations FROM ${role.login} GRANTED BY moazez_migration`, true],
    ['alter_object_owner', `ALTER TABLE public.organizations OWNER TO ${role.login}`, true],
    ['create_role', `CREATE ROLE g01c_denied_role_${suffix}`, true],
    ['alter_role', 'ALTER ROLE moazez_migration WITH CREATEDB', true],
    ['drop_role', 'DROP ROLE moazez_migration', true],
    ['create_database', `CREATE DATABASE g01c_denied_db_${suffix}`, false],
    ['set_role_migration', 'SET ROLE moazez_migration', true],
    ['set_role_other_runtime', `SET ROLE ${otherRuntime.login}`, true],
    ['read_prisma_migrations', 'SELECT count(*) FROM public._prisma_migrations', true],
    ['modify_prisma_migrations', "UPDATE public._prisma_migrations SET logs = 'denied'", true],
  ];
}

function runExpectedSqlFailure(context, login, credential, sql, transactional) {
  const script = transactional
    ? `\\set ON_ERROR_STOP off\nBEGIN;\n${sql};\n\\if :ERROR\nROLLBACK;\n\\else\nROLLBACK;\n\\quit 91\n\\endif\n\\set ON_ERROR_STOP on\nSELECT 1;\n`
    : `\\set ON_ERROR_STOP off\n${sql};\n\\if :ERROR\nROLLBACK;\n\\else\nROLLBACK;\n\\quit 91\n\\endif\n\\set ON_ERROR_STOP on\nSELECT 1;\n`;
  executePsql(context, login, credential, script);
}

function verifyRuntimeNegatives(context, runtimeRole) {
  const role = RUNTIME_ROLES[runtimeRole];
  const checks = Object.fromEntries(NEGATIVE_CHECK_NAMES.map((name) => [name, false]));
  for (const [name, sql, transactional] of negativeCases(context, role)) {
    const before = securitySnapshot(context);
    runExpectedSqlFailure(
      context,
      role.login,
      context.credentials[role.login],
      sql,
      transactional,
    );
    assert.equal(securitySnapshot(context), before, `${runtimeRole}/${name} changed catalog state`);
    checks[name] = true;
  }
  return checks;
}

function verifyAllSetRoleDenials(context) {
  const result = {};
  for (const source of Object.values(RUNTIME_ROLES)) {
    result[source.login] = {};
    for (const target of POSTGRESQL_ROLES.filter((role) => role !== source.login)) {
      const before = securitySnapshot(context);
      runExpectedSqlFailure(
        context,
        source.login,
        context.credentials[source.login],
        `SET ROLE ${target}`,
        true,
      );
      assert.equal(securitySnapshot(context), before);
      result[source.login][target] = true;
    }
  }
  return result;
}

function verifyMigrationAdministrativeBoundary(context) {
  const result = {};
  for (const [name, sql, transactional] of [
    ['create_role', `CREATE ROLE g01c_migration_denied_${context.runId.slice(0, 8)}`, true],
    ['alter_role', 'ALTER ROLE moazez_api WITH CREATEDB', true],
    ['create_database', `CREATE DATABASE g01c_migration_denied_${context.runId.slice(0, 8)}`, false],
  ]) {
    const before = securitySnapshot(context);
    runExpectedSqlFailure(
      context,
      'moazez_migration',
      context.credentials.moazez_migration,
      sql,
      transactional,
    );
    assert.equal(securitySnapshot(context), before);
    result[name] = true;
  }
  return result;
}

function verifyMigrationCannotAccessOtherDatabase(context) {
  executePsql(
    context,
    context.fixtureOwnerLogin,
    context.fixtureOwnerCredential,
    'REVOKE ALL PRIVILEGES ON DATABASE postgres FROM PUBLIC;',
  );
  commandExpectedFailure(
    'docker',
    psqlArgs(
      context,
      'moazez_migration',
      'postgres',
      context.credentials.moazez_migration,
      ['-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'],
    ),
    { label: 'migration cross-database connection' },
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function disconnectTrackedClient(context, client) {
  await client.$disconnect();
  context.trackedClients.delete(client);
}

async function disconnectAllClients(context) {
  const failures = [];
  for (const client of [...context.trackedClients]) {
    try {
      await client.$disconnect();
      context.trackedClients.delete(client);
    } catch {
      failures.push(client);
    }
  }
  if (failures.length > 0) throw new Error('tracked Prisma client disconnect failed');
}

function dockerIds(args) {
  return docker(args, { label: 'owned Docker resource inspection' })
    .stdout.split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

function resourceExists(type, name) {
  const result = spawnSync('docker', [type, 'inspect', name], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return result.status === 0;
}

function cleanupFixture(context) {
  if (!context) return { containers: 0, networks: 0, sessions: 0 };
  if (context.containerCreated && resourceExists('container', context.containerName)) {
    docker(['rm', '--force', context.containerName], { label: 'owned container cleanup' });
  }
  if (context.networkCreated && resourceExists('network', context.networkName)) {
    docker(['network', 'rm', context.networkName], { label: 'owned network cleanup' });
  }
  const containers = dockerIds([
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=${context.label}`,
  ]).length;
  const networks = dockerIds([
    'network',
    'ls',
    '--quiet',
    '--filter',
    `label=${context.label}`,
  ]).length;
  return {
    containers,
    networks,
    sessions: context.sessionsBeforeRemoval ?? 0,
  };
}

function assertCleanup(cleanup) {
  assert.deepEqual(cleanup, { containers: 0, networks: 0, sessions: 0 });
}

function createPassingSummaryForTests() {
  const positive = Object.fromEntries(POSITIVE_CHECK_NAMES.map((name) => [name, true]));
  const negative = Object.fromEntries(NEGATIVE_CHECK_NAMES.map((name) => [name, true]));
  return {
    status: 'PASS',
    roles: [...POSTGRESQL_ROLES],
    runtimes: Object.fromEntries(
      Object.keys(RUNTIME_ROLES).map((role) => [role, { positive: { ...positive }, negative: { ...negative } }]),
    ),
    bootstrap: {
      managedAdministrator: true,
      localWithoutCloudSqlSystemRole: true,
      firstApply: true,
      secondApply: true,
      passwordRotation: true,
      attributesStable: true,
      unsafeAttributeRejected: true,
      cloudSqlSystemMembershipRejected: true,
      crossRoleMembershipRejected: true,
      credentialRedaction: true,
    },
    migration: {
      deploy: true,
      status: true,
      secondDeploy: true,
      controlledDdl: true,
      administrativeDenials: { create_role: true, alter_role: true, create_database: true },
      otherDatabaseDenied: true,
    },
    membershipChecks: true,
    setRoleDenials: Object.fromEntries(
      Object.values(RUNTIME_ROLES).map((source) => [
        source.login,
        Object.fromEntries(POSTGRESQL_ROLES.filter((target) => target !== source.login).map((target) => [target, true])),
      ]),
    ),
    cleanup: { containers: 0, networks: 0, sessions: 0 },
  };
}

function validateSummary(summary) {
  assert.equal(summary.status, 'PASS');
  assert.deepEqual([...summary.roles].sort(), [...POSTGRESQL_ROLES].sort());
  for (const runtimeRole of Object.keys(RUNTIME_ROLES)) {
    for (const name of POSITIVE_CHECK_NAMES) assert.equal(summary.runtimes?.[runtimeRole]?.positive?.[name], true);
    for (const name of NEGATIVE_CHECK_NAMES) assert.equal(summary.runtimes?.[runtimeRole]?.negative?.[name], true);
  }
  for (const name of [
    'managedAdministrator',
    'localWithoutCloudSqlSystemRole',
    'firstApply',
    'secondApply',
    'passwordRotation',
    'attributesStable',
    'unsafeAttributeRejected',
    'cloudSqlSystemMembershipRejected',
    'crossRoleMembershipRejected',
    'credentialRedaction',
  ]) {
    assert.equal(summary.bootstrap?.[name], true);
  }
  assert.equal(summary.migration?.deploy, true);
  assert.equal(summary.migration?.status, true);
  assert.equal(summary.migration?.secondDeploy, true);
  assert.equal(summary.migration?.controlledDdl, true);
  assert.equal(summary.migration?.otherDatabaseDenied, true);
  for (const name of ['create_role', 'alter_role', 'create_database']) {
    assert.equal(summary.migration?.administrativeDenials?.[name], true);
  }
  assert.equal(summary.membershipChecks, true);
  for (const source of Object.values(RUNTIME_ROLES)) {
    for (const target of POSTGRESQL_ROLES.filter((role) => role !== source.login)) {
      assert.equal(summary.setRoleDenials?.[source.login]?.[target], true);
    }
  }
  assertCleanup(summary.cleanup);
  return true;
}

async function runLiveVerification() {
  const dockerEvidence = verifyLocalDocker();
  const imageId = inspectPostgresImage();
  let context;
  let cleanup = { containers: 0, networks: 0, sessions: 0 };
  let failure;
  let summary;
  try {
    context = createFixture(dockerEvidence, imageId);
    const managedAdministrator = initializeManagedAdministrator(context);
    assert.equal(
      queryScalar(
        context,
        `SELECT count(*) FROM pg_catalog.pg_roles
         WHERE rolname = ${sqlLiteral(CLOUD_SQL_SYSTEM_ROLE)}`,
      ),
      '0',
    );

    const previousCredentials = { ...context.credentials };
    applySqlPolicy(
      context,
      ROLE_BOOTSTRAP_PATH,
      bootstrapVariables(context, previousCredentials),
    );
    const firstRoleCatalog = verifyRoleCatalog(context);
    verifyMembershipCatalog(context);

    const nextCredentials = rotatedCredentials(context);
    applySqlPolicy(
      context,
      ROLE_BOOTSTRAP_PATH,
      bootstrapVariables(context, nextCredentials),
    );
    context.credentials = nextCredentials;
    const secondRoleCatalog = verifyRoleCatalog(context);
    assert.deepEqual(secondRoleCatalog, firstRoleCatalog);
    verifyMembershipCatalog(context);
    const passwordRotation = verifyCredentialRotation(
      context,
      previousCredentials,
    );

    const unsafeAttributeRejected = rehearseUnsafeRoleAttribute(context);
    const cloudSqlSystemMembershipRejected =
      rehearseCloudSqlSystemMembership(context);
    const crossRoleMembershipRejected = rehearseCrossRoleMembership(context);
    verifyRoleCatalog(context);
    verifyMembershipCatalog(context);

    context.migrationUrl = makeDatabaseUrl(
      context,
      'moazez_migration',
      context.credentials.moazez_migration,
      { connection_limit: 2, application_name: 'moazez-migration' },
    );

    const deployOutput = runPrisma(context, ['migrate', 'deploy'], 'Prisma migration deployment');
    assert.match(deployOutput, /migrations? have been successfully applied|applied|No pending migrations/u);
    const statusOutput = runPrisma(context, ['migrate', 'status'], 'Prisma migration status');
    assert.match(statusOutput, /Database schema is up to date/u);
    const secondDeployOutput = runPrisma(context, ['migrate', 'deploy'], 'second Prisma migration deployment');
    assert.match(secondDeployOutput, /No pending migrations to apply/u);

    const fixtureOwner = {
      login: context.fixtureOwnerLogin,
      credential: context.fixtureOwnerCredential,
    };
    applySqlPolicy(
      context,
      RUNTIME_GRANTS_PATH,
      { database_name: context.databaseName },
      fixtureOwner,
    );
    applySqlPolicy(
      context,
      RUNTIME_GRANTS_PATH,
      { database_name: context.databaseName },
      fixtureOwner,
    );

    const postgresVersionNumber = Number(queryScalar(context, 'SHOW server_version_num'));
    assert.equal(Math.trunc(postgresVersionNumber / 10_000), 16);
    verifyRoleCatalog(context);
    verifyMembershipCatalog(context);
    verifyOwnershipAndPrivileges(context);
    verifyDefaultPrivilegesWithControlledDdl(context);
    const migrationAdministrativeDenials = verifyMigrationAdministrativeBoundary(context);
    verifyMigrationCannotAccessOtherDatabase(context);

    const fixture = await seedSyntheticFixture(context);
    const runtimes = {};
    for (const runtimeRole of Object.keys(RUNTIME_ROLES)) {
      runtimes[runtimeRole] = {
        positive: await verifyRuntimePositive(context, runtimeRole, fixture),
        negative: verifyRuntimeNegatives(context, runtimeRole),
      };
    }
    const setRoleDenials = verifyAllSetRoleDenials(context);
    await disconnectAllClients(context);
    assert.equal(context.trackedClients.size, 0);
    context.sessionsBeforeRemoval = Number(
      queryScalar(
        context,
        `SELECT count(*) FROM pg_catalog.pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid()`,
      ),
    );
    assert.equal(context.sessionsBeforeRemoval, 0);

    summary = {
      status: 'PASS',
      branch: REQUIRED_BRANCH,
      head: BASE_SHA,
      nodeVersion: process.version,
      postgresMajor: 16,
      postgresVersionNumber,
      fixtureTopology: 'unique labelled container + unique network + tmpfs + random 127.0.0.1 port + no volume',
      imageId,
      dockerEndpointTransport: dockerEvidence.endpointTransport,
      roles: [...POSTGRESQL_ROLES],
      runtimes,
      bootstrap: {
        managedAdministrator,
        localWithoutCloudSqlSystemRole: true,
        firstApply: true,
        secondApply: true,
        passwordRotation,
        attributesStable: true,
        unsafeAttributeRejected,
        cloudSqlSystemMembershipRejected,
        crossRoleMembershipRejected,
        credentialRedaction: true,
      },
      migration: {
        deploy: true,
        status: true,
        secondDeploy: true,
        controlledDdl: true,
        administrativeDenials: migrationAdministrativeDenials,
        otherDatabaseDenied: true,
      },
      membershipChecks: true,
      setRoleDenials,
      cleanup: null,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (context) {
      try {
        await disconnectAllClients(context);
      } catch (error) {
        failure ??= error;
      }
      try {
        if (context.containerCreated && context.sessionsBeforeRemoval === null) {
          context.sessionsBeforeRemoval = Number(
            queryScalar(
              context,
              `SELECT count(*) FROM pg_catalog.pg_stat_activity
               WHERE datname = current_database() AND pid <> pg_backend_pid()`,
            ),
          );
        }
      } catch (error) {
        failure ??= error;
      }
      try {
        cleanup = cleanupFixture(context);
      } catch (error) {
        failure ??= error;
      }
    }
  }
  assertCleanup(cleanup);
  if (failure) throw failure;
  summary.cleanup = cleanup;
  validateSummary(summary);
  return summary;
}

async function main() {
  const mode = resolveVerificationMode(process.argv.slice(2));
  assertRepositoryPreflight(mode);
  command(process.execPath, ['--test', PURE_TEST_PATH], {
    label: 'focused pure-test suite',
    timeoutMs: 180_000,
  });
  assertRepositoryPreflight(mode);
  const summary = await runLiveVerification();
  process.stdout.write(
    `${JSON.stringify({
      status: summary.status,
      nodeVersion: summary.nodeVersion,
      postgresMajor: summary.postgresMajor,
      postgresVersionNumber: summary.postgresVersionNumber,
      roles: summary.roles,
      managedAdministrator: summary.bootstrap.managedAdministrator,
      firstBootstrap: summary.bootstrap.firstApply,
      secondBootstrap: summary.bootstrap.secondApply,
      unsafeAttributeRejected: summary.bootstrap.unsafeAttributeRejected,
      cloudSqlSystemMembershipRejected:
        summary.bootstrap.cloudSqlSystemMembershipRejected,
      crossRoleMembershipRejected:
        summary.bootstrap.crossRoleMembershipRejected,
      positiveChecks: POSITIVE_CHECK_NAMES.length * Object.keys(RUNTIME_ROLES).length,
      negativeChecks: NEGATIVE_CHECK_NAMES.length * Object.keys(RUNTIME_ROLES).length,
      setRoleDenials: Object.values(summary.setRoleDenials).reduce(
        (total, checks) => total + Object.keys(checks).length,
        0,
      ),
      cleanup: summary.cleanup,
    })}\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`PRD3-G01-C verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  BASE_SHA,
  EXPECTED_CHANGED_PATHS,
  NEGATIVE_CHECK_NAMES,
  POSITIVE_CHECK_NAMES,
  POSTGRESQL_ROLES,
  ROLE_ATTRIBUTES,
  RUNTIME_ROLES,
  VERIFICATION_MODES,
  assertCleanup,
  createPassingSummaryForTests,
  initializeManagedAdministrator,
  inspectRepositoryState,
  isProtectedRegressionPath,
  postgresReadinessProbe,
  readChangedPaths,
  resolveVerificationMode,
  validateRepositoryState,
  validateSummary,
  waitForPostgres,
};
