'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  EXPECTED_CHANGED_PATHS,
  NEGATIVE_CHECK_NAMES,
  POSITIVE_CHECK_NAMES,
  POSTGRESQL_ROLES,
  ROLE_ATTRIBUTES,
  RUNTIME_ROLES,
  assertCleanup,
  createPassingSummaryForTests,
  readChangedPaths,
  validateSummary,
} = require('../ci/prd3-g01-c-database-privileges.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
const bootstrapSql = read('scripts/database/prd3-g01-c-role-bootstrap.sql');
const grantsSql = read('scripts/database/prd3-g01-c-runtime-grants.sql');
const verifier = read('scripts/ci/prd3-g01-c-database-privileges.cjs');

test('defines exactly the four approved PostgreSQL login identities', () => {
  assert.deepEqual(POSTGRESQL_ROLES, [
    'moazez_api',
    'moazez_core_worker',
    'moazez_media_worker',
    'moazez_migration',
  ]);
  for (const role of POSTGRESQL_ROLES) assert.match(bootstrapSql, new RegExp(`ALTER ROLE ${role} WITH`, 'u'));
});

test('normalizes the exact non-administrative role attributes', () => {
  assert.deepEqual(ROLE_ATTRIBUTES, {
    login: true,
    superuser: false,
    createDatabase: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    inherit: true,
  });
  for (const role of POSTGRESQL_ROLES) {
    assert.match(
      bootstrapSql,
      new RegExp(`ALTER ROLE ${role} WITH[\\s\\S]*?LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`, 'u'),
    );
  }
});

test('bootstrap SQL accepts variables and contains no literal role credential', () => {
  for (const variable of [
    'api_role_credential',
    'core_worker_role_credential',
    'media_worker_role_credential',
    'migration_role_credential',
  ]) {
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

test('cross-role membership is removed and catalog-verified', () => {
  for (const role of POSTGRESQL_ROLES) assert.match(bootstrapSql, new RegExp(`REVOKE ${role} FROM`, 'u'));
  assert.match(verifier, /pg_catalog\.pg_auth_members/u);
  assert.match(verifier, /verifyAllSetRoleDenials/u);
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
});

test('working-tree scope is exactly the nine authorized paths', () => {
  assert.equal(EXPECTED_CHANGED_PATHS.length, 9);
  assert.deepEqual(readChangedPaths(), [...EXPECTED_CHANGED_PATHS].sort());
});
