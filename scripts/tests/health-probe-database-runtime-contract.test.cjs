'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts',
  'ci',
  'health-probe-runtime.sh',
);
const script = fs.readFileSync(SCRIPT_PATH, 'utf8');
const MEDIA_RUNTIME_GUARD_PATH = path.join(
  REPOSITORY_ROOT,
  'src',
  'modules',
  'files',
  'uploads',
  'application',
  'media-runtime-startup.guard.ts',
);
const mediaRuntimeGuard = fs.readFileSync(MEDIA_RUNTIME_GUARD_PATH, 'utf8');

test('API receives the exact bounded database runtime wiring', () => {
  const apiLauncher = functionBody('start_runtime');
  assert.match(apiLauncher, /--env NODE_ENV=test/u);
  assert.match(apiLauncher, /--env MEDIA_RUNTIME_ENFORCE_IN_TEST=true/u);
  assert.match(apiLauncher, /--env DATABASE_URL="\$HEALTH_DATABASE_URL"/u);
  assert.match(apiLauncher, /--env DATABASE_RUNTIME_ROLE=api/u);
  assert.match(apiLauncher, /--env DATABASE_CONNECTION_LIMIT=5/u);
  assert.match(apiLauncher, /--env DATABASE_POOL_TIMEOUT_SECONDS=5/u);
  assert.match(apiLauncher, /--env DATABASE_CONNECT_TIMEOUT_SECONDS=5/u);
  assert.match(
    apiLauncher,
    /--env STORAGE_ENDPOINT="\$HEALTH_STORAGE_ENDPOINT"/u,
  );
});

test('Core and Media receive their exact role-specific bounded settings', () => {
  const workerLauncher = functionBody('start_application_context_runtime');
  const coreBranch = caseBranch(workerLauncher, 'core-worker');
  const mediaBranch = caseBranch(workerLauncher, 'media-worker');

  assert.match(coreBranch, /database_connection_limit=6/u);
  assert.match(coreBranch, /database_pool_timeout_seconds=10/u);
  assert.match(mediaBranch, /database_connection_limit=3/u);
  assert.match(mediaBranch, /database_pool_timeout_seconds=10/u);

  assert.match(workerLauncher, /--env NODE_ENV=test/u);
  assert.doesNotMatch(workerLauncher, /MEDIA_RUNTIME_ENFORCE_IN_TEST/u);
  assert.match(
    workerLauncher,
    /--env DATABASE_URL="\$HEALTH_DATABASE_URL"/u,
  );
  assert.match(workerLauncher, /--env DATABASE_RUNTIME_ROLE="\$role"/u);
  assert.match(
    workerLauncher,
    /--env DATABASE_CONNECTION_LIMIT="\$database_connection_limit"/u,
  );
  assert.match(
    workerLauncher,
    /--env DATABASE_POOL_TIMEOUT_SECONDS="\$database_pool_timeout_seconds"/u,
  );
  assert.match(workerLauncher, /--env DATABASE_CONNECT_TIMEOUT_SECONDS=5/u);
  assert.match(
    workerLauncher,
    /--env STORAGE_ENDPOINT="\$HEALTH_STORAGE_ENDPOINT"/u,
  );
});

test('canonical health dependencies use direct container DNS on the probe network', () => {
  const inputValidation = functionBody('validate_canonical_health_inputs');
  const networkCreation = functionBody('create_network');
  const commonRuntime = functionBody('start_common_runtime');

  assert.match(inputValidation, /HEALTH_POSTGRES_CONTAINER/u);
  assert.match(inputValidation, /HEALTH_DATABASE_URL/u);
  assert.match(inputValidation, /HEALTH_MINIO_CONTAINER/u);
  assert.match(inputValidation, /HEALTH_STORAGE_ENDPOINT/u);
  assert.match(inputValidation, /databaseUrl\.port === '5432'/u);
  assert.match(inputValidation, /storageEndpoint\.port === '9000'/u);

  const createIndex = networkCreation.indexOf(
    'docker network create "$PROBE_NETWORK"',
  );
  const postgresIndex = networkCreation.indexOf(
    'docker network connect "$PROBE_NETWORK" "$POSTGRES_CONTAINER"',
  );
  const minioIndex = networkCreation.indexOf(
    'docker network connect "$PROBE_NETWORK" "$MINIO_CONTAINER"',
  );
  assert.ok(createIndex >= 0 && createIndex < postgresIndex);
  assert.ok(postgresIndex < minioIndex);

  const commonCreateIndex = commonRuntime.indexOf('create_network');
  const commonRedisIndex = commonRuntime.indexOf('start_redis');
  const commonApiIndex = commonRuntime.indexOf('start_runtime');
  assert.ok(commonCreateIndex >= 0 && commonCreateIndex < commonRedisIndex);
  assert.ok(commonRedisIndex < commonApiIndex);
  assert.doesNotMatch(script, /host\.docker\.internal/u);
});

test('scenario Redis keeps its owned identity with bounded network-local DNS', () => {
  const redisLauncher = functionBody('start_redis');
  const redisRecovery = functionBody('scenario_redis_recovery');

  assert.match(redisLauncher, /--name "\$REDIS_CONTAINER"/u);
  assert.match(redisLauncher, /--network "\$PROBE_NETWORK"/u);
  assert.match(redisLauncher, /--network-alias "\$REDIS_NETWORK_ALIAS"/u);
  assert.match(script, /readonly REDIS_NETWORK_ALIAS='redis'/u);
  assert.match(
    script,
    /QUEUE_REDIS_URL="redis:\/\/\$\{REDIS_NETWORK_ALIAS\}:6379"/u,
  );
  assert.match(
    script,
    /REALTIME_REDIS_URL="redis:\/\/\$\{REDIS_NETWORK_ALIAS\}:6379"/u,
  );
  assert.match(redisRecovery, /docker pause "\$REDIS_CONTAINER"/u);
  assert.match(redisRecovery, /docker unpause "\$REDIS_CONTAINER"/u);
  assert.doesNotMatch(script, /HEALTH_REDIS_CONTAINER/u);
});

test('cleanup detaches parent dependencies before verified probe-network removal', () => {
  const cleanup = functionBody('cleanup_resources');
  const ownedRemoval = cleanup.match(
    /docker rm --force\s+([\s\S]*?)\s+>\/dev\/null 2>&1 \|\| true/u,
  );
  assert.ok(ownedRemoval);
  assert.doesNotMatch(ownedRemoval[1], /POSTGRES_CONTAINER|MINIO_CONTAINER/u);

  const postgresDisconnectIndex = cleanup.indexOf(
    '"$PROBE_NETWORK" "$POSTGRES_CONTAINER"',
  );
  const minioDisconnectIndex = cleanup.indexOf(
    '"$PROBE_NETWORK" "$MINIO_CONTAINER"',
  );
  const networkRemovalIndex = cleanup.indexOf(
    'docker network rm "$PROBE_NETWORK"',
  );
  assert.ok(postgresDisconnectIndex >= 0);
  assert.ok(minioDisconnectIndex > postgresDisconnectIndex);
  assert.ok(networkRemovalIndex > minioDisconnectIndex);
  assert.match(
    cleanup,
    /if docker network inspect "\$PROBE_NETWORK"[\s\S]*?cleanup_status=1/u,
  );
});

test('API test-mode media verification cannot take the ffprobe bypass', () => {
  const apiLauncher = functionBody('start_runtime');
  const startupEnvironmentAssertion = functionBody(
    'assert_startup_runtime_environment_contract',
  );

  assert.match(apiLauncher, /--env MEDIA_RUNTIME_ENFORCE_IN_TEST=true/u);
  assert.match(
    startupEnvironmentAssertion,
    /"\$APP_CONTAINER" MEDIA_RUNTIME_ENFORCE_IN_TEST true/u,
  );
  assert.match(
    mediaRuntimeGuard,
    /if \(isTest && !enforceInTest\)[\s\S]*?return;[\s\S]*?await this\.verify\(\);/u,
  );
  assert.match(script, /api_media_runtime_verification=enforced-in-test/u);
});

test('Maintenance Scheduler cannot enter the database-backed launcher', () => {
  const workerLauncher = functionBody('start_application_context_runtime');
  const databaseFields = [
    'DATABASE_URL',
    'DATABASE_RUNTIME_ROLE',
    'DATABASE_CONNECTION_LIMIT',
    'DATABASE_POOL_TIMEOUT_SECONDS',
    'DATABASE_CONNECT_TIMEOUT_SECONDS',
  ];
  assert.doesNotMatch(workerLauncher, /maintenance-scheduler\)/u);
  assert.match(
    workerLauncher,
    /\*\)\s+fail_scenario "contract=database-runtime-role observed=unsupported-role"/u,
  );
  assert.doesNotMatch(script, /MAINTENANCE_SCHEDULER_CONTAINER/u);
  assert.doesNotMatch(script, /DATABASE_RUNTIME_ROLE=maintenance-scheduler/u);
  for (const field of databaseFields) {
    assert.doesNotMatch(
      script,
      new RegExp(`maintenance-scheduler[^\\n]*${field}`, 'u'),
    );
  }
});

test('diagnostics redact the sole database URL contract', () => {
  const safeOutput = functionBody('safe_output');
  assert.match(safeOutput, /"DATABASE_URL"/u);
  assert.match(safeOutput, /"HEALTH_DATABASE_URL"/u);
  assert.match(safeOutput, /"HEALTH_STORAGE_ENDPOINT"/u);
  assert.doesNotMatch(
    script,
    /API_DATABASE_URL|CORE_DATABASE_URL|MEDIA_DATABASE_URL/u,
  );
});

function functionBody(name) {
  const start = script.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `missing shell function ${name}`);
  const following = script.slice(start + name.length + 4);
  const nextFunction = following.search(/^\w+\(\) \{/mu);
  return nextFunction < 0
    ? script.slice(start)
    : script.slice(start, start + name.length + 4 + nextFunction);
}

function caseBranch(functionText, role) {
  const match = functionText.match(
    new RegExp(`\\n\\s*${role}\\)\\s*([\\s\\S]*?)\\n\\s*;;`, 'u'),
  );
  assert.ok(match, `missing ${role} case branch`);
  return match[1];
}
