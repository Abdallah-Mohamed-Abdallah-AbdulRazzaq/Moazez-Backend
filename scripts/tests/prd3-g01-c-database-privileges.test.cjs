'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
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
  resolveVerificationMode,
  validateRepositoryState,
  validateSummary,
} = require('../ci/prd3-g01-c-database-privileges.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
const bootstrapSql = read('scripts/database/prd3-g01-c-role-bootstrap.sql');
const grantsSql = read('scripts/database/prd3-g01-c-runtime-grants.sql');
const verifier = read('scripts/ci/prd3-g01-c-database-privileges.cjs');
const executableBootstrapSql = bootstrapSql
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/--[^\r\n]*/gu, '');

const MAINTENANCE_CHANGED_PATHS = Object.freeze([
  'scripts/ci/prd3-g01-c-database-privileges.cjs',
  'scripts/tests/prd3-g01-c-database-privileges.test.cjs',
  'scripts/ci/prd3-g04-governed-migration-job.cjs',
  'scripts/tests/prd3-g04-governed-migration-job.test.cjs',
  'scripts/ci/prd3-g05-clean-start.cjs',
  'scripts/tests/prd3-g05-clean-start.test.cjs',
]);

function repositoryState(overrides = {}) {
  return {
    branch: 'chore/production-readiness-3-cloud-sql',
    head: 'd5983578be2007b8378de4818a1f96446e9e9c1e',
    nodeVersion: 'v22.23.1',
    nodeDirectory:
      'C:\\Users\\Abdal\\AppData\\Local\\Moazez\\toolchains\\node-v22.23.1-win-x64',
    platform: 'win32',
    indexClean: true,
    changedPaths: [...MAINTENANCE_CHANGED_PATHS],
    historicalBaseIsAncestor: true,
    dependencyChanged: false,
    devDependencyChanged: false,
    ...overrides,
  };
}

const ROLE_CREDENTIAL_VARIABLES = Object.freeze({
  moazez_api: 'api_role_credential',
  moazez_core_worker: 'core_worker_role_credential',
  moazez_media_worker: 'media_worker_role_credential',
  moazez_migration: 'migration_role_credential',
});

test('defines exactly the four approved PostgreSQL login identities', () => {
  assert.deepEqual(POSTGRESQL_ROLES, [
    'moazez_api',
    'moazez_core_worker',
    'moazez_media_worker',
    'moazez_migration',
  ]);
  for (const role of POSTGRESQL_ROLES) {
    assert.match(bootstrapSql, new RegExp(`\\('${role}'\\)`, 'u'));
    assert.match(bootstrapSql, new RegExp(`ALTER ROLE ${role}\\s+PASSWORD`, 'u'));
  }
});

test('requires the exact non-administrative role attributes through a fail-closed catalog guard', () => {
  assert.deepEqual(ROLE_ATTRIBUTES, {
    login: true,
    superuser: false,
    createDatabase: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    inherit: true,
  });
  for (const predicate of [
    'required_role.rolcanlogin',
    'NOT required_role.rolsuper',
    'NOT required_role.rolcreatedb',
    'NOT required_role.rolcreaterole',
    'NOT required_role.rolreplication',
    'NOT required_role.rolbypassrls',
    'required_role.rolinherit',
  ]) {
    assert.ok(bootstrapSql.includes(predicate), `missing catalog predicate: ${predicate}`);
  }
  assert.match(bootstrapSql, /required database role attributes are unsafe/u);
});

test('creates only missing LOGIN shells using PostgreSQL administrative defaults', () => {
  assert.match(
    executableBootstrapSql,
    /SELECT format\('CREATE ROLE %I LOGIN', role_name\)[\s\S]*?WHERE NOT EXISTS[\s\S]*?\\gexec/u,
  );
  assert.doesNotMatch(
    executableBootstrapSql,
    /CREATE ROLE %I LOGIN\s+(?:(?:NO)?SUPERUSER|(?:NO)?CREATEDB|(?:NO)?CREATEROLE|(?:NO)?REPLICATION|(?:NO)?BYPASSRLS|(?:NO)?INHERIT|PASSWORD)/iu,
  );
});

test('uses one password-only ALTER ROLE statement per exact identity', () => {
  const alterations = executableBootstrapSql.match(/ALTER\s+ROLE\s+[\s\S]*?;/giu) ?? [];
  assert.equal(alterations.length, POSTGRESQL_ROLES.length);
  for (const [role, variable] of Object.entries(ROLE_CREDENTIAL_VARIABLES)) {
    assert.match(
      executableBootstrapSql,
      new RegExp(`ALTER ROLE ${role}\\s+PASSWORD :'${variable}';`, 'u'),
    );
  }
  for (const alteration of alterations) {
    assert.doesNotMatch(alteration, /\bWITH\b|\bLOGIN\b|\b(?:NO)?SUPERUSER\b|\b(?:NO)?CREATEDB\b|\b(?:NO)?CREATEROLE\b|\b(?:NO)?REPLICATION\b|\b(?:NO)?BYPASSRLS\b|\b(?:NO)?INHERIT\b/iu);
  }
});

test('bootstrap SQL accepts variables and contains no literal role credential', () => {
  for (const variable of Object.values(ROLE_CREDENTIAL_VARIABLES)) {
    assert.match(bootstrapSql, new RegExp(`PASSWORD :'${variable}'`, 'u'));
  }
  assert.doesNotMatch(bootstrapSql, /PASSWORD\s+'[^']+'/iu);
  assert.doesNotMatch(bootstrapSql, /postgres(?:ql)?:\/\//iu);
});

test('runtime grants SQL contains no credential or connection coordinate', () => {
  assert.doesNotMatch(grantsSql, /PASSWORD|credential|postgres(?:ql)?:\/\/|127\.0\.0\.1|localhost/iu);
});

test('neither SQL policy uses GRANT ALL', () => {
  assert.doesNotMatch(`${bootstrapSql}\n${grantsSql}`, /GRANT\s+ALL(?:\s+PRIVILEGES)?/iu);
});

test('runtime table DML grant set is exactly SELECT INSERT UPDATE DELETE', () => {
  assert.match(
    grantsSql,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO\s+moazez_api,\s+moazez_core_worker,\s+moazez_media_worker;/u,
  );
  assert.match(
    grantsSql,
    /ALTER DEFAULT PRIVILEGES[\s\S]*?GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO\s+moazez_api, moazez_core_worker, moazez_media_worker;/u,
  );
});

test('runtime DDL and ownership grants are absent', () => {
  assert.doesNotMatch(
    grantsSql,
    /GRANT\s+(?:CREATE|TRUNCATE|REFERENCES|TRIGGER|OWNERSHIP)|WITH\s+GRANT\s+OPTION/iu,
  );
  assert.match(grantsSql, /REVOKE ALL PRIVILEGES ON SCHEMA public FROM[\s\S]*?GRANT USAGE ON SCHEMA public TO/u);
  assert.doesNotMatch(grantsSql, /REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM\s+PUBLIC/u);
  assert.match(grantsSql, /ALTER DEFAULT PRIVILEGES[\s\S]*?REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/u);
});

test('runtime access to _prisma_migrations is explicitly revoked', () => {
  assert.match(
    grantsSql,
    /REVOKE ALL PRIVILEGES ON TABLE public\._prisma_migrations FROM\s+moazez_api,\s+moazez_core_worker,\s+moazez_media_worker;/u,
  );
  assert.match(verifier, /read_prisma_migrations/u);
  assert.match(verifier, /modify_prisma_migrations/u);
});

test('migration-owned default table privileges are exact', () => {
  assert.match(
    grantsSql,
    /ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public[\s\S]*?GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES/u,
  );
});

test('current and default sequence privileges are USAGE and SELECT only', () => {
  assert.match(grantsSql, /GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public/u);
  assert.match(
    grantsSql,
    /ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public[\s\S]*?GRANT USAGE, SELECT ON SEQUENCES/u,
  );
  assert.doesNotMatch(grantsSql, /GRANT UPDATE ON (?:ALL )?SEQUENCES/iu);
});

test('PUBLIC schema CREATE and unnecessary database privileges are revoked', () => {
  assert.match(
    bootstrapSql,
    /REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM\s+PUBLIC/u,
  );
  assert.match(
    bootstrapSql,
    /REVOKE ALL PRIVILEGES ON SCHEMA public FROM\s+PUBLIC/u,
  );
});

test('Cloud SQL system and Moazez cross-role memberships fail closed', () => {
  assert.match(bootstrapSql, /system_role\.rolname = 'cloudsqlsuperuser'/u);
  assert.match(bootstrapSql, /pg_catalog\.pg_has_role\(member_role\.oid, system_role\.oid, 'MEMBER'\)/u);
  assert.match(bootstrapSql, /member_role\.oid <> granted_role\.oid/u);
  assert.match(bootstrapSql, /pg_catalog\.pg_has_role\(member_role\.oid, granted_role\.oid, 'MEMBER'\)/u);
  assert.match(bootstrapSql, /required database role memberships are unsafe/u);
  assert.doesNotMatch(bootstrapSql, /REVOKE\s+moazez_[a-z_]+\s+FROM\s+moazez_/iu);
  assert.match(verifier, /pg_catalog\.pg_auth_members/u);
  assert.match(verifier, /verifyAllSetRoleDenials/u);
});

test('live verifier executes bootstrap through a managed-admin-like non-superuser', () => {
  assert.match(verifier, /MANAGED_ADMIN_LOGIN = 'moazez_cloudsql_admin_fixture'/u);
  assert.match(
    verifier,
    /LOGIN NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS INHERIT/u,
  );
  assert.match(verifier, /initializeManagedAdministrator\(context\)/u);
  assert.match(verifier, /context\.fixtureOwnerLogin/u);
  assert.match(verifier, /runSqlPolicy\(context, sqlPath, variables\)/u);
});

test('live verifier rehearses unsafe attributes and both membership boundaries', () => {
  assert.match(verifier, /ALTER ROLE moazez_api CREATEDB/u);
  assert.match(verifier, /rehearseUnsafeRoleAttribute/u);
  assert.match(verifier, /CREATE ROLE \$\{CLOUD_SQL_SYSTEM_ROLE\} NOLOGIN/u);
  assert.match(verifier, /rehearseCloudSqlSystemMembership/u);
  assert.match(verifier, /GRANT moazez_migration TO moazez_api/u);
  assert.match(verifier, /rehearseCrossRoleMembership/u);
  assert.match(verifier, /SQL policy failure output exposed synthetic credential material/u);
});

test('production runtimes retain one DATABASE_URL deployment contract', () => {
  const databaseValidation = read('src/infrastructure/database/database-runtime-env.validation.ts');
  const provider = read('src/infrastructure/database/prisma-client-options.provider.ts');
  assert.match(databaseValidation, /'DATABASE_URL'/u);
  assert.match(databaseValidation, /'DATABASE_RUNTIME_ROLE'/u);
  assert.match(provider, /getOrThrow<string>\('DATABASE_URL'\)/u);
  assert.deepEqual(Object.keys(RUNTIME_ROLES), ['api', 'core-worker', 'media-worker']);
});

test('no role-specific database URL variable is introduced', () => {
  const changedText = EXPECTED_CHANGED_PATHS.filter(
    (file) =>
      file !== 'scripts/tests/prd3-g01-c-database-privileges.test.cjs' &&
      fs.existsSync(path.join(REPOSITORY_ROOT, file)),
  )
    .map(read)
    .join('\n');
  assert.doesNotMatch(
    changedText,
    /API_DATABASE_URL|CORE_DATABASE_URL|MEDIA_DATABASE_URL|MIGRATION_DATABASE_URL/u,
  );
});

test('Maintenance Scheduler remains database-free in validation and composition', () => {
  const validation = read('src/runtime/runtime-env.validation.ts');
  const moduleSource = read('src/runtime/maintenance-scheduler/maintenance-scheduler-runtime.module.ts');
  assert.match(validation, /assertDatabaseFreeRuntimeEnvironment\(raw, 'Maintenance Scheduler'\)/u);
  assert.doesNotMatch(moduleSource, /PrismaModule|PrismaService|DATABASE_URL|DATABASE_RUNTIME_ROLE/u);
  assert.match(moduleSource, /MaintenanceSchedulesModule/u);
});

test('negative runtime matrix is exact and complete', () => {
  assert.deepEqual(NEGATIVE_CHECK_NAMES, [
    'create_table', 'alter_table', 'drop_table', 'truncate_table', 'create_index',
    'create_schema', 'create_extension', 'create_function', 'grant_object_privileges',
    'revoke_object_privileges', 'alter_object_owner', 'create_role', 'alter_role',
    'drop_role', 'create_database', 'set_role_migration', 'set_role_other_runtime',
    'read_prisma_migrations', 'modify_prisma_migrations',
  ]);
  for (const check of NEGATIVE_CHECK_NAMES) assert.match(verifier, new RegExp(`'${check}'`, 'u'));
});

test('positive runtime matrix is exact and complete', () => {
  assert.deepEqual(POSITIVE_CHECK_NAMES, [
    'connection',
    'application_name',
    'representative_read',
    'insert_update_delete',
    'transaction_rollback',
    'no_object_ownership',
  ]);
});

test('cleanup rejects any residual owned resource or database session', () => {
  assert.equal(assertCleanup({ containers: 0, networks: 0, sessions: 0 }), undefined);
  assert.throws(() => assertCleanup({ containers: 1, networks: 0, sessions: 0 }));
  assert.throws(() => assertCleanup({ containers: 0, networks: 1, sessions: 0 }));
  assert.throws(() => assertCleanup({ containers: 0, networks: 0, sessions: 1 }));
});

test('final summary rejects a missing or failed permission check', () => {
  const passing = createPassingSummaryForTests();
  assert.equal(validateSummary(passing), true);
  const missing = structuredClone(passing);
  delete missing.runtimes.api.negative.create_table;
  assert.throws(() => validateSummary(missing));
  const failed = structuredClone(passing);
  failed.runtimes['media-worker'].positive.insert_update_delete = false;
  assert.throws(() => validateSummary(failed));
  const missingBootstrapGuard = structuredClone(passing);
  missingBootstrapGuard.bootstrap.cloudSqlSystemMembershipRejected = false;
  assert.throws(() => validateSummary(missingBootstrapGuard));
});

test('working-tree scope is exactly the four C1 authorized paths', () => {
  assert.equal(EXPECTED_CHANGED_PATHS.length, 4);
  assert.deepEqual(EXPECTED_CHANGED_PATHS, [
    'docs/production-readiness/phase-3/04-database-identities-and-least-privilege-evidence.md',
    'scripts/ci/prd3-g01-c-database-privileges.cjs',
    'scripts/database/prd3-g01-c-role-bootstrap.sql',
    'scripts/tests/prd3-g01-c-database-privileges.test.cjs',
  ]);
  assert.equal(
    validateRepositoryState(
      repositoryState({ head: BASE_SHA, changedPaths: [...EXPECTED_CHANGED_PATHS] }),
      VERIFICATION_MODES.CANDIDATE,
    ),
    true,
  );
  assert.throws(() =>
    validateRepositoryState(repositoryState(), VERIFICATION_MODES.CANDIDATE),
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ head: BASE_SHA, changedPaths: EXPECTED_CHANGED_PATHS.slice(1) }),
      VERIFICATION_MODES.CANDIDATE,
    ),
  );
  for (const override of [
    { branch: 'main', head: BASE_SHA, changedPaths: [...EXPECTED_CHANGED_PATHS] },
    { nodeVersion: 'v22.22.0', head: BASE_SHA, changedPaths: [...EXPECTED_CHANGED_PATHS] },
    {
      nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
      head: BASE_SHA,
      changedPaths: [...EXPECTED_CHANGED_PATHS],
    },
  ]) {
    assert.throws(() =>
      validateRepositoryState(
        repositoryState(override),
        VERIFICATION_MODES.CANDIDATE,
      ),
    );
  }
});

test('verifier is locked to the C1 baseline and proves password rotation idempotency', () => {
  assert.match(verifier, /BASE_SHA = '6e73da066beb79ba59284a7b96260134c0b38df5'/u);
  assert.match(verifier, /verifyCredentialRotation/u);
  assert.match(verifier, /assert\.deepEqual\(secondRoleCatalog, firstRoleCatalog\)/u);
  assert.doesNotMatch(verifier, /BASE_SHA = '1816a3294be92ac177b6a5e906199a33d9c1912a'/u);
});

test('verification mode parsing preserves candidate default and explicit regression only', () => {
  assert.equal(resolveVerificationMode([]), VERIFICATION_MODES.CANDIDATE);
  assert.equal(resolveVerificationMode(['--regression']), VERIFICATION_MODES.REGRESSION);
  for (const option of [
    '--skip-preflight', '--force', '--current', '--ignore-scope', '--anything-else',
  ]) {
    assert.throws(() => resolveVerificationMode([option]), /unknown verification mode/u);
  }
  assert.throws(
    () => resolveVerificationMode(['--regression', '--force']),
    /unknown verification mode/u,
  );
});

test('regression mode accepts a descendant and rejects non-descendant or staged state', () => {
  for (const branch of ['main', 'HEAD']) {
    assert.equal(
      validateRepositoryState(
        repositoryState({
          branch,
          nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
          platform: 'linux',
        }),
        VERIFICATION_MODES.REGRESSION,
      ),
      true,
    );
  }
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ nodeVersion: 'v22.22.0' }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ historicalBaseIsAncestor: false }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ indexClean: false }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
});

test('regression mode rejects every protected production and release-contract scope', () => {
  for (const changedPath of [
    'src/main.ts',
    'prisma/schema.prisma',
    'prisma/migrations/20260101000000_fixture/migration.sql',
    'prisma/seeds/01-permissions.seed.ts',
    'package-lock.json',
    'Dockerfile',
    '.github/workflows/fixture.yml',
    'config/deployment/fixture.json',
    'adr/ADR-9999-fixture.md',
    'scripts/database/fixture.sql',
    'scripts/migrations/fixture.cjs',
    'scripts/release/fixture.cjs',
  ]) {
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({ changedPaths: [changedPath] }),
        VERIFICATION_MODES.REGRESSION,
      ),
    );
  }
});

test('regression mode rejects dependency or devDependency drift', () => {
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ dependencyChanged: true }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ devDependencyChanged: true }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
});
