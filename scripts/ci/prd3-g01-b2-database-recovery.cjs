'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const b1 = require('./prd3-g01-b-pool-saturation.cjs');

const GATE = 'PRD3-G01-B2';
const BASE_SHA = 'e50bba85c2a24c91f11cb26f909b3e1c8b47cc2b';
const EXPECTED_NODE_VERSION = 'v22.23.1';
const EXPECTED_PRISMA_VERSION = '6.19.3';
const POSTGRES_IMAGE = 'postgres:16-alpine';
const REDIS_IMAGE = 'redis:7-alpine';
const MINIO_IMAGE = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const POSTGRES_MAX_CONNECTIONS = 80;
const GATE_LABEL = 'com.moazez.evidence.gate';
const RUN_LABEL = 'com.moazez.evidence.run';
const OCI_REVISION_LABEL = 'org.opencontainers.image.revision';
const SOURCE_COMMIT_LABEL = 'com.moazez.source.commit';
const SOURCE_TREE_LABEL = 'com.moazez.source.tree';
const PACKAGE_LOCK_LABEL = 'com.moazez.package-lock.sha256';
const RUNTIME_MANIFEST_LABEL = 'com.moazez.runtime.manifest.sha256';
const OBSERVER_APPLICATION_NAME = 'moazez-prd3-g01-b2-observer';
const SUMMARY_SCHEMA_VERSION = 2;
const PROBE_MAXIMUM_ELAPSED_MS = 2500;
const RECOVERY_MAXIMUM_ELAPSED_MS = 60_000;
const PRISMA_OPERATION_TIMEOUT_MS = 10_000;
const PRISMA_DISCONNECT_PHASE_ONE_MS = 5_000;
const PRISMA_DISCONNECT_PHASE_TWO_MS = 10_000;
const INTERNAL_SUITE_DESCRIPTOR_KEY = 'PRD3_G01_B2_INTERNAL_SUITE_DESCRIPTOR';
const AUTHORIZED_PATHS = Object.freeze([
  'adr/ADR-0005-cloud-sql-runtime-connections-and-database-role-boundary.md',
  'adr/ADR-0010-production-health-and-observability-contract.md',
  'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  'docs/production-readiness/phase-3/00-cloud-sql-runtime-topology-and-connection-budget.md',
  'docs/production-readiness/phase-3/02-database-outage-readiness-and-reconnect-evidence.md',
  'package.json',
  'scripts/ci/health-probe-runtime.sh',
  'scripts/ci/prd3-g01-b2-database-recovery.cjs',
  'scripts/tests/prd3-g01-b2-database-recovery.test.cjs',
]);
const ROLE_KEYS = Object.freeze(['api', 'core-worker', 'media-worker']);
const ROLE_SUMMARY_KEYS = Object.freeze({
  api: 'api',
  'core-worker': 'coreWorker',
  'media-worker': 'mediaWorker',
});
const ROLE_APPLICATION_NAMES = Object.freeze({
  api: 'moazez-api',
  'core-worker': 'moazez-core-worker',
  'media-worker': 'moazez-media-worker',
});
const EXPECTED_ROLE_SETTINGS = Object.freeze({
  api: Object.freeze({ connectionLimit: 5, poolTimeoutSeconds: 5, connectTimeoutSeconds: 5 }),
  'core-worker': Object.freeze({ connectionLimit: 6, poolTimeoutSeconds: 10, connectTimeoutSeconds: 5 }),
  'media-worker': Object.freeze({ connectionLimit: 3, poolTimeoutSeconds: 10, connectTimeoutSeconds: 5 }),
});
const SCENARIOS = Object.freeze([
  'steady-state-outage',
  'same-process-recovery',
  'forced-session-reset',
  'startup-unavailable',
]);
const FAULT_INJECTION_KEY = 'PRD3_G01_B2_FAULT_INJECTION';
const FAULT_INJECTIONS = Object.freeze([
  'NONE',
  'SIGINT_DURING_OUTAGE',
  'SIGTERM_DURING_RECOVERY',
  'FALSE_READY_DURING_OUTAGE',
]);
const FAULT_MATRIX = Object.freeze([
  ['B2-F01', 'remote Docker endpoint', 'PREFLIGHT_REJECTED', 'NO_RESOURCES', false, 'pure', 'endpoint-policy'],
  ['B2-F02', 'missing PostgreSQL image', 'IMAGE_GATE_BLOCKED', 'NO_RESOURCES', false, 'pure', 'image-gate'],
  ['B2-F03', 'PostgreSQL create failure', 'CREATE_FAILED', 'OWNED_ONLY', false, 'pure', 'creation-reconcile'],
  ['B2-F04', 'PostgreSQL readiness timeout', 'FIXTURE_TIMEOUT', 'FULL', false, 'pure', 'poll-timeout'],
  ['B2-F05', 'runtime provenance failure', 'PROVENANCE_BLOCKED', 'IMAGE_CLEANUP', false, 'pure', 'provenance-gate'],
  ['B2-F06', 'API runtime exits unexpectedly', 'RUNTIME_EXIT', 'FULL', false, 'integration', 'runtime-exit-api'],
  ['B2-F07', 'Core Worker exits unexpectedly', 'RUNTIME_EXIT', 'FULL', false, 'integration', 'runtime-exit-core'],
  ['B2-F08', 'Media Worker exits unexpectedly', 'RUNTIME_EXIT', 'FULL', false, 'integration', 'runtime-exit-media'],
  ['B2-F09', 'database pause failure', 'OUTAGE_TRANSITION_FAILED', 'FULL', false, 'integration', 'pause-failure'],
  ['B2-F10', 'database unpause failure', 'RECOVERY_TRANSITION_FAILED', 'FULL', false, 'integration', 'unpause-failure'],
  ['B2-F11', 'false readiness during outage', 'FALSE_READY', 'FULL', false, 'live', 'false-ready-rehearsal'],
  ['B2-F12', 'liveness unavailable during outage', 'HEALTH_CONTRACT_FAILED', 'FULL', false, 'pure', 'outage-liveness'],
  ['B2-F13', 'public health unavailable while API alive', 'PUBLIC_CONTRACT_FAILED', 'FULL', false, 'pure', 'public-health'],
  ['B2-F14', 'readiness call hangs', 'PROBE_TIMEOUT', 'FULL', false, 'integration', 'readiness-timeout'],
  ['B2-F15', 'readiness creates unbounded work', 'BURST_FAILED', 'FULL', false, 'pure', 'burst-bound'],
  ['B2-F16', 'recovery timeout', 'RECOVERY_TIMEOUT', 'FULL', false, 'pure', 'recovery-timeout'],
  ['B2-F17', 'old sessions remain', 'SESSION_RECOVERY_FAILED', 'FULL', false, 'pure', 'old-session'],
  ['B2-F18', 'new role sessions absent', 'SESSION_RECOVERY_FAILED', 'FULL', false, 'pure', 'new-session'],
  ['B2-F19', 'application name mismatch', 'OBSERVATION_FAILED', 'FULL', false, 'pure', 'application-allowlist'],
  ['B2-F20', 'pool limit exceeded', 'POOL_OVERSHOOT', 'FULL', false, 'pure', 'pool-limit'],
  ['B2-F21', 'runtime restart detected', 'IDENTITY_FAILED', 'FULL', false, 'pure', 'runtime-identity'],
  ['B2-F22', 'observer operation timeout', 'OBSERVER_TIMEOUT', 'FULL', false, 'integration', 'observer-timeout'],
  ['B2-F23', 'startup falsely ready', 'STARTUP_FALSE_READY', 'FULL', false, 'pure', 'startup-fail-closed'],
  ['B2-F24', 'SIGINT during outage', 'INTERRUPTED_130', 'FULL', false, 'live', 'sigint-rehearsal'],
  ['B2-F25', 'SIGTERM during recovery', 'INTERRUPTED_143', 'FULL', false, 'live', 'sigterm-rehearsal'],
  ['B2-F26', 'cleanup inspection failure', 'CLEANUP_FAILED', 'CONTINUE', false, 'integration', 'inspection-failure'],
  ['B2-F27', 'owned resource residue', 'CLEANUP_FAILED', 'CONTINUE', false, 'integration', 'resource-residue'],
  ['B2-F28', 'summary publication failure', 'PUBLICATION_FAILED', 'FILES_REMOVED', false, 'integration', 'atomic-publication'],
  ['B2-F29', 'second formal run fails', 'FINAL_SUITE_BLOCKED', 'PER_RUN_FULL', false, 'pure', 'two-run-required'],
].map(([id, injection, expectedClassification, expectedCleanup, summaryEligible, proofType, proofId]) =>
  Object.freeze({ id, injection, expectedClassification, expectedCleanup, summaryEligible, proofType, proofId }),
));

const ACTIVITY_SQL = `
  SELECT application_name, pid, backend_start
  FROM pg_stat_activity
  WHERE application_name IN (
    'moazez-api',
    'moazez-core-worker',
    'moazez-media-worker'
  )
  ORDER BY application_name, pid
`;
const TERMINATE_SQL = `
  SELECT pid, pg_terminate_backend(pid) AS terminated
  FROM pg_stat_activity
  WHERE application_name IN (
    'moazez-api',
    'moazez-core-worker',
    'moazez-media-worker'
  )
  AND pid <> pg_backend_pid()
  ORDER BY pid
`;

function assertScenarioName(value) {
  if (!SCENARIOS.includes(value)) throw new Error('B2 scenario name is invalid');
  return value;
}

function validateFaultInjection(value) {
  const normalized = value || 'NONE';
  if (!FAULT_INJECTIONS.includes(normalized)) {
    throw new Error('B2 fault-injection selector is invalid');
  }
  return normalized;
}

function createRunId() {
  return b1.sanitizeResourceSuffix(
    `${Date.now().toString(36)}-${process.pid.toString(36)}-${randomBytes(6).toString('hex')}`,
  );
}

function createOwnershipLabels(runId) {
  return Object.freeze({ [GATE_LABEL]: GATE, [RUN_LABEL]: runId });
}

function labelArgs(labels) {
  return [
    '--label',
    `${GATE_LABEL}=${labels[GATE_LABEL]}`,
    '--label',
    `${RUN_LABEL}=${labels[RUN_LABEL]}`,
  ];
}

function loadCompiledDatabaseRuntimePolicy(repositoryRoot) {
  const policyPath = path.join(
    repositoryRoot,
    'dist',
    'infrastructure',
    'database',
    'database-runtime.policy.js',
  );
  if (!fs.existsSync(policyPath)) {
    throw new Error('Compiled database runtime policy is unavailable');
  }
  delete require.cache[require.resolve(policyPath)];
  const compiled = require(policyPath);
  if (
    !Array.isArray(compiled.DATABASE_RUNTIME_ROLES) ||
    !compiled.DATABASE_RUNTIME_POLICY ||
    typeof compiled.resolveDatabaseRuntimeSettings !== 'function'
  ) {
    throw new Error('Compiled database runtime policy exports are invalid');
  }
  if (JSON.stringify(compiled.DATABASE_RUNTIME_ROLES) !== JSON.stringify(ROLE_KEYS)) {
    throw new Error('Compiled database runtime roles are invalid');
  }
  const settings = Object.freeze(
    Object.fromEntries(
      ROLE_KEYS.map((role) => {
        const resolved = compiled.resolveDatabaseRuntimeSettings(role);
        return [role, Object.freeze({ ...resolved })];
      }),
    ),
  );
  return Object.freeze({ module: compiled, settings });
}

function buildDatabasePolicyEnvironment(role, databasePolicy) {
  if (!ROLE_KEYS.includes(role)) throw new Error('B2 database role is invalid');
  const settings = databasePolicy?.settings?.[role];
  if (!settings || settings.role !== role) {
    throw new Error('Compiled B2 database settings are unavailable');
  }
  for (const field of [
    'connectionLimit',
    'poolTimeoutSeconds',
    'connectTimeoutSeconds',
  ]) {
    if (!Number.isInteger(settings[field]) || settings[field] <= 0) {
      throw new Error('Compiled B2 database setting is invalid');
    }
  }
  return Object.freeze({
    B2_DATABASE_RUNTIME_ROLE: role,
    B2_DATABASE_CONNECTION_LIMIT: String(settings.connectionLimit),
    B2_DATABASE_POOL_TIMEOUT_SECONDS: String(settings.poolTimeoutSeconds),
    B2_DATABASE_CONNECT_TIMEOUT_SECONDS: String(settings.connectTimeoutSeconds),
  });
}

function buildNetworkCreateArgs(context) {
  return [
    'network',
    'create',
    '--internal',
    ...labelArgs(context.labels),
    context.networkName,
  ];
}

function buildPostgresRunArgs(context, fixture) {
  return [
    'run',
    '--detach',
    '--pull=never',
    '--restart=no',
    '--name',
    fixture.name,
    '--network',
    context.networkName,
    ...labelArgs(context.labels),
    '--tmpfs',
    '/var/lib/postgresql/data:rw,noexec,nosuid,size=536870912',
    '--publish',
    '127.0.0.1::5432',
    '--env',
    'POSTGRES_USER',
    '--env',
    'POSTGRES_PASSWORD',
    '--env',
    'POSTGRES_DB',
    context.imageIds.postgres,
    '-c',
    `max_connections=${POSTGRES_MAX_CONNECTIONS}`,
  ];
}

function buildRedisRunArgs(context) {
  return [
    'run',
    '--detach',
    '--pull=never',
    '--restart=no',
    '--name',
    context.redisName,
    '--network',
    context.networkName,
    ...labelArgs(context.labels),
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=67108864',
    context.imageIds.redis,
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ];
}

function buildMinioRunArgs(context) {
  return [
    'run',
    '--detach',
    '--pull=never',
    '--restart=no',
    '--name',
    context.minioName,
    '--network',
    context.networkName,
    ...labelArgs(context.labels),
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=268435456',
    '--env',
    'MINIO_ROOT_USER',
    '--env',
    'MINIO_ROOT_PASSWORD',
    context.imageIds.minio,
    'server',
    '/data',
  ];
}

function parseImageInspection(output, options = {}) {
  let inspected;
  try {
    inspected = JSON.parse(String(output).trim());
  } catch {
    throw new Error('Docker image inspection is invalid');
  }
  const id = b1.parseDockerImageId(inspected?.Id);
  const labels = Object.freeze({ ...(inspected?.Config?.Labels ?? {}) });
  if (options.requiredLabels) {
    for (const [name, value] of Object.entries(options.requiredLabels)) {
      if (labels[name] !== value) {
        throw new Error('Runtime image provenance label is invalid');
      }
    }
  }
  return Object.freeze({ id, labels });
}

function parseProbeResult(output) {
  let report;
  try {
    report = JSON.parse(String(output).trim());
  } catch {
    throw new Error('Probe result is not valid JSON');
  }
  if (
    !ROLE_KEYS.includes(report?.role) ||
    !['startup', 'liveness', 'readiness', 'public-health'].includes(report?.kind) ||
    !Number.isInteger(report?.statusCode) ||
    !Number.isInteger(report?.elapsedMs) ||
    report.elapsedMs < 0 ||
    !report.body ||
    typeof report.body !== 'object' ||
    Array.isArray(report.body)
  ) {
    throw new Error('Probe result is invalid');
  }
  return report;
}

function validateResponseBody(body, expectedStatus, expectedVersion) {
  const keys = Object.keys(body).sort();
  const canonicalTimestamp =
    typeof body.timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(body.timestamp) &&
    new Date(body.timestamp).toISOString() === body.timestamp;
  if (
    JSON.stringify(keys) !== JSON.stringify(['status', 'timestamp', 'version']) ||
    body.status !== expectedStatus ||
    body.version !== expectedVersion ||
    !canonicalTimestamp ||
    /database|redis|storage|queue|provider|topology|credential|secret|url|host|port|prisma/iu.test(
      JSON.stringify(body),
    )
  ) {
    throw new Error('Health response schema is invalid');
  }
  return true;
}

function validateManagementProbe(report, options) {
  const {
    expectedRole,
    expectedKind,
    expectedStatusCode,
    expectedVersion,
    maximumElapsedMs = PROBE_MAXIMUM_ELAPSED_MS,
  } = options ?? {};
  const expectedStatus = expectedStatusCode === 200 ? 'ok' : 'unavailable';
  if (
    report.role !== expectedRole ||
    report.kind !== expectedKind ||
    report.statusCode !== expectedStatusCode ||
    report.kind === 'public-health' ||
    report.contentType !== 'application/json' ||
    report.cacheControl !== 'no-store' ||
    report.elapsedMs > maximumElapsedMs
  ) {
    throw new Error('Management probe contract is invalid');
  }
  validateResponseBody(report.body, expectedStatus, expectedVersion);
  return true;
}

function validatePublicHealth(report, expectedVersion) {
  if (
    report.role !== 'api' ||
    report.kind !== 'public-health' ||
    report.statusCode !== 200 ||
    !String(report.contentType ?? '').startsWith('application/json') ||
    report.elapsedMs > PROBE_MAXIMUM_ELAPSED_MS
  ) {
    throw new Error('Public health contract is invalid');
  }
  validateResponseBody(report.body, 'ok', expectedVersion);
  return true;
}

function validateReadinessBurst(report, options = {}) {
  if (
    report?.role !== options.expectedRole ||
    report?.kind !== 'readiness' ||
    !Array.isArray(report?.results)
  ) {
    throw new Error('Readiness burst result is invalid');
  }
  const expectedCount = options.expectedCount ?? 10;
  const maximumElapsedMs = options.maximumElapsedMs ?? PROBE_MAXIMUM_ELAPSED_MS;
  if (report.results.length !== expectedCount) {
    throw new Error('Readiness burst count is invalid');
  }
  for (const result of report.results) {
    if (
      result?.statusCode !== 503 ||
      !Number.isInteger(result?.elapsedMs) ||
      result.elapsedMs < 0 ||
      result.elapsedMs > maximumElapsedMs
    ) {
      throw new Error('Readiness burst did not fail closed within its bound');
    }
    validateResponseBody(result.body, 'unavailable', options.expectedVersion);
  }
  return Object.freeze({
    count: report.results.length,
    maximumElapsedMs: Math.max(...report.results.map((result) => result.elapsedMs)),
  });
}

function parseRuntimeIdentity(output) {
  let inspected;
  try {
    inspected = JSON.parse(String(output).trim());
  } catch {
    throw new Error('Runtime identity inspection is invalid');
  }
  const identity = {
    containerId: inspected?.Id,
    startedAt: inspected?.State?.StartedAt,
    restartCount: inspected?.RestartCount,
    processId: inspected?.State?.Pid,
  };
  if (
    !/^[a-f0-9]{64}$/u.test(identity.containerId ?? '') ||
    typeof identity.startedAt !== 'string' ||
    !Number.isInteger(identity.restartCount) ||
    !Number.isInteger(identity.processId) ||
    identity.processId < 1
  ) {
    throw new Error('Runtime identity inspection is invalid');
  }
  return Object.freeze(identity);
}

function validateRuntimeIdentity(before, after) {
  if (
    before.containerId !== after.containerId ||
    before.startedAt !== after.startedAt ||
    before.restartCount !== after.restartCount ||
    before.processId !== after.processId
  ) {
    throw new Error('Runtime identity changed during database recovery');
  }
  return true;
}

function parseActivityRows(rows) {
  if (!Array.isArray(rows)) throw new Error('PostgreSQL activity observation is invalid');
  return Object.freeze(
    rows.map((row) => {
      if (
        !Object.values(ROLE_APPLICATION_NAMES).includes(row?.application_name) ||
        !Number.isInteger(row?.pid) ||
        row.pid < 1 ||
        !(row?.backend_start instanceof Date) ||
        Number.isNaN(row.backend_start.getTime())
      ) {
        throw new Error('PostgreSQL activity observation is invalid');
      }
      return Object.freeze({
        applicationName: row.application_name,
        pid: row.pid,
        backendStart: row.backend_start.toISOString(),
      });
    }),
  );
}

function sessionIdentity(session) {
  return `${session.applicationName}:${session.pid}:${session.backendStart}`;
}

function countSessionsByRole(sessions) {
  const counts = { api: 0, 'core-worker': 0, 'media-worker': 0 };
  for (const session of sessions) {
    const role = ROLE_KEYS.find(
      (candidate) => ROLE_APPLICATION_NAMES[candidate] === session.applicationName,
    );
    if (!role) throw new Error('Observed application name is not approved');
    counts[role] += 1;
  }
  return counts;
}

function validatePoolLimits(counts, settings = EXPECTED_ROLE_SETTINGS) {
  for (const role of ROLE_KEYS) {
    const limit = settings?.[role]?.connectionLimit;
    if (
      !Number.isInteger(limit) ||
      !Number.isInteger(counts?.[role]) ||
      counts[role] < 0 ||
      counts[role] > limit
    ) {
      throw new Error(`Recovered pool exceeds the configured limit for ${role}`);
    }
  }
  return true;
}

function validateSessionRecovery(
  before,
  after,
  terminatedPids,
  settings = EXPECTED_ROLE_SETTINGS,
) {
  const old = new Set(before.map(sessionIdentity));
  const newer = new Set(after.map(sessionIdentity));
  if (!Array.isArray(terminatedPids) || terminatedPids.length < 1) {
    throw new Error('No established runtime backend was terminated');
  }
  if (before.some((session) => !terminatedPids.includes(session.pid))) {
    throw new Error('Not every observed old runtime session was terminated');
  }
  if ([...old].some((identity) => newer.has(identity))) {
    throw new Error('An old PostgreSQL backend session remains');
  }
  for (const applicationName of Object.values(ROLE_APPLICATION_NAMES)) {
    if (!after.some((session) => session.applicationName === applicationName)) {
      throw new Error('A recovered runtime application name is absent');
    }
  }
  validatePoolLimits(countSessionsByRole(after), settings);
  return true;
}

function classifyStartupUnavailable(observation) {
  if (observation?.startupStatus === 200 || observation?.readinessStatus === 200) {
    throw new Error('Runtime falsely advertised readiness during startup outage');
  }
  if (observation?.running === false && observation?.exitCode !== 0) {
    return 'FAIL_CLOSED_EXITED';
  }
  if (
    observation?.running === true &&
    observation?.startupStatus !== 200 &&
    observation?.readinessStatus !== 200
  ) {
    return 'FAIL_CLOSED_UNAVAILABLE';
  }
  throw new Error('Startup-unavailable result is indeterminate');
}

function validateLogTransitions(text, expectedCycles, sensitiveValues = []) {
  const redacted = b1.redactText(text, sensitiveValues);
  if (redacted !== text) throw new Error('Runtime logs contain sensitive input');
  const unavailable = (text.match(/management\.probe\.readiness_unavailable/gu) ?? [])
    .length;
  const recovered = (text.match(/management\.probe\.readiness_recovered/gu) ?? [])
    .length;
  if (
    unavailable < expectedCycles ||
    unavailable > expectedCycles + 1 ||
    recovered !== unavailable
  ) {
    throw new Error(
      `Readiness transition logging mismatch unavailable:${unavailable} recovered:${recovered} minimum:${expectedCycles}`,
    );
  }
  if (/P10(?:01|02|17)|postgres(?:ql)?:\/\//iu.test(text)) {
    throw new Error('Runtime management logs expose database detail');
  }
  return Object.freeze({ unavailable, recovered });
}

function validateCleanupEvidence(cleanup) {
  if (
    cleanup?.trackedPrismaClientsRemaining !== 0 ||
    cleanup?.prismaDisconnectFailures !== 0 ||
    cleanup?.trackedChildrenRemaining !== 0 ||
    cleanup?.exactNameContainersRemaining !== 0 ||
    cleanup?.exactNameNetworksRemaining !== 0 ||
    cleanup?.currentRunLabeledContainersRemaining !== 0 ||
    cleanup?.currentRunLabeledNetworksRemaining !== 0 ||
    cleanup?.roleSessionsRemaining !== 0 ||
    cleanup?.scratchFilesRemaining !== 0 ||
    cleanup?.inspectionVerified !== true
  ) {
    throw new Error('B2 cleanup evidence is incomplete');
  }
  return true;
}

function requireInteger(value, minimum, maximum, field) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`B2 summary integer is invalid for ${field}`);
  }
  return value;
}

function validateSummary(summary) {
  if (
    summary?.schemaVersion !== SUMMARY_SCHEMA_VERSION ||
    summary?.gate !== GATE ||
    summary?.overall !== 'PASS' ||
    !/^[a-z0-9][a-z0-9-]{5,80}$/u.test(summary?.runId ?? '') ||
    summary?.nodeVersion !== EXPECTED_NODE_VERSION ||
    summary?.observerPrismaVersion !== EXPECTED_PRISMA_VERSION ||
    summary?.runtimePrismaVersion !== EXPECTED_PRISMA_VERSION ||
    summary?.baseCommit !== BASE_SHA ||
    !/^[a-f0-9]{40}$/u.test(summary?.baseTree ?? '') ||
    !/^[a-f0-9]{64}$/u.test(summary?.packageLockSha256 ?? '') ||
    !/^[a-f0-9]{64}$/u.test(summary?.runtimeManifestSha256 ?? '') ||
    typeof summary?.packageVersion !== 'string' ||
    summary.packageVersion.length < 1 ||
    summary?.runtimeImageLabelsVerified !== true ||
    summary?.runtimeManifestVerified !== true ||
    summary?.postgresMajor !== 16 ||
    summary?.postgresMaxConnections !== POSTGRES_MAX_CONNECTIONS ||
    !/^sha256:[a-f0-9]{64}$/u.test(summary?.runtimeImageId ?? '') ||
    !/^sha256:[a-f0-9]{64}$/u.test(summary?.postgresImageId ?? '') ||
    !['npipe', 'unix'].includes(summary?.dockerTransport) ||
    summary?.oldBackendSessionsRemaining !== 0 ||
    summary?.repeatedRecoveryCycles !== 2 ||
    !Array.isArray(summary?.cycles) ||
    summary.cycles.length !== 2
  ) {
    throw new Error('B2 summary schema is invalid');
  }
  requireInteger(summary.forcedSessionsTerminated, 1, 14, 'forcedSessionsTerminated');
  for (const [index, cycle] of summary.cycles.entries()) {
    if (
      cycle?.cycle !== index + 1 ||
      cycle?.publicHealthDuringOutage !== 200 ||
      !cycle?.roles ||
      typeof cycle.roles !== 'object'
    ) {
      throw new Error('B2 cycle evidence is invalid');
    }
    for (const role of ROLE_KEYS) {
      const measured = cycle.roles[ROLE_SUMMARY_KEYS[role]];
      if (
        measured?.outageReadinessStatus !== 503 ||
        measured?.outageLivenessStatus !== 200 ||
        measured?.outageStartupStatus !== 200 ||
        measured?.recoveryReadinessStatus !== 200
      ) {
        throw new Error(`B2 cycle role evidence is invalid for ${role}`);
      }
      requireInteger(
        measured.detectionLatencyMs,
        0,
        PROBE_MAXIMUM_ELAPSED_MS,
        `${role}.detectionLatencyMs`,
      );
      requireInteger(measured.readinessBurstCount, 10, 10, `${role}.burstCount`);
      requireInteger(
        measured.readinessBurstMaximumElapsedMs,
        0,
        PROBE_MAXIMUM_ELAPSED_MS,
        `${role}.burstElapsed`,
      );
      requireInteger(
        measured.recoveredSessionCount,
        1,
        EXPECTED_ROLE_SETTINGS[role].connectionLimit,
        `${role}.recoveredSessionCount`,
      );
    }
  }
  for (const role of ROLE_KEYS) {
    const measured = summary.roles?.[ROLE_SUMMARY_KEYS[role]];
    if (
      measured?.outageReadinessStatus !== 503 ||
      measured?.outageLivenessStatus !== 200 ||
      measured?.outageStartupStatus !== 200 ||
      measured?.recoveryReadinessStatus !== 200 ||
      measured?.containerIdentityUnchanged !== true ||
      measured?.processIdentityUnchanged !== true ||
      measured?.newDatabaseSessionObserved !== true ||
      !Array.isArray(measured?.outageDetectionLatencyMs) ||
      measured.outageDetectionLatencyMs.length !== 2 ||
      !['FAIL_CLOSED_EXITED', 'FAIL_CLOSED_UNAVAILABLE'].includes(
        summary.startupUnavailable?.[ROLE_SUMMARY_KEYS[role]],
      ) ||
      summary.freshStartupAfterRecovery?.[ROLE_SUMMARY_KEYS[role]] !== true
    ) {
      throw new Error(`B2 summary role evidence is invalid for ${role}`);
    }
    requireInteger(
      measured.maximumObservedConnections,
      1,
      EXPECTED_ROLE_SETTINGS[role].connectionLimit,
      `${role}.maximumObservedConnections`,
    );
    for (const latency of measured.outageDetectionLatencyMs) {
      requireInteger(latency, 0, PROBE_MAXIMUM_ELAPSED_MS, `${role}.outageLatency`);
    }
    requireInteger(measured.readinessBurstCount, 10, 10, `${role}.burstCount`);
    requireInteger(
      measured.readinessBurstMaximumElapsedMs,
      0,
      PROBE_MAXIMUM_ELAPSED_MS,
      `${role}.burstElapsed`,
    );
    requireInteger(
      measured.readinessUnavailableEvents,
      2,
      20,
      `${role}.unavailableEvents`,
    );
    requireInteger(
      measured.readinessRecoveredEvents,
      measured.readinessUnavailableEvents,
      measured.readinessUnavailableEvents,
      `${role}.recoveredEvents`,
    );
  }
  validateCleanupEvidence(summary.cleanup);
  b1.assertSanitizedSummary(summary);
  return true;
}

function validateRequiredRunResults(results) {
  if (
    !Array.isArray(results) ||
    results.length !== 2 ||
    results.some((result) => result !== true)
  ) {
    throw new Error('Both independent B2 evidence runs must pass');
  }
  return true;
}

function validateFaultCoverage(coveredProofIds) {
  const covered = [...coveredProofIds];
  const required = FAULT_MATRIX.map((entry) => entry.proofId);
  const missing = required.filter((proofId) => !covered.includes(proofId));
  const unknown = covered.filter((proofId) => !required.includes(proofId));
  const duplicates = covered.filter((proofId, index) => covered.indexOf(proofId) !== index);
  if (missing.length !== 0 || unknown.length !== 0 || duplicates.length !== 0) {
    throw new Error('Executable B2 fault coverage is incomplete');
  }
  return Object.freeze({
    covered: required.length,
    missing: 0,
    duplicate: 0,
    unknown: 0,
  });
}

function parseFaultCoverageMarker(output) {
  const matches = [
    ...String(output).matchAll(/^(?:# )?B2_PROOF_COVERAGE=([a-z0-9,-]+)$/gmu),
  ];
  if (matches.length !== 1) throw new Error('B2 proof coverage marker is invalid');
  const proofIds = matches[0][1].split(',').filter(Boolean);
  if (new Set(proofIds).size !== proofIds.length) {
    throw new Error('B2 proof coverage marker contains duplicates');
  }
  return new Set(proofIds);
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildRuntimeProvenanceLabels(provenance, includeManifest = true) {
  const labels = {
    [OCI_REVISION_LABEL]: provenance.baseCommit,
    [SOURCE_COMMIT_LABEL]: provenance.baseCommit,
    [SOURCE_TREE_LABEL]: provenance.baseTree,
    [PACKAGE_LOCK_LABEL]: provenance.packageLockSha256,
    [GATE_LABEL]: GATE,
    [RUN_LABEL]: provenance.suiteRunId,
  };
  if (includeManifest) {
    labels[RUNTIME_MANIFEST_LABEL] = provenance.runtimeManifestSha256;
  }
  return Object.freeze(labels);
}

function buildCanonicalDockerBuildArgs(options) {
  const args = [
    'build',
    '--pull=false',
    '--file',
    path.join(options.contextPath, 'Dockerfile'),
    '--tag',
    options.tag,
  ];
  for (const [name, value] of Object.entries(options.labels).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    args.push('--label', `${name}=${value}`);
  }
  args.push(options.contextPath);
  return args;
}

function runtimeManifestVerificationScript() {
  return String.raw`
    'use strict';
    const fs = require('node:fs');
    const path = require('node:path');
    const crypto = require('node:crypto');
    const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
    const entries = [];
    const add = (logical, actual) => {
      if (!fs.existsSync(actual) || !fs.statSync(actual).isFile()) {
        throw new Error('required_runtime_material_absent');
      }
      entries.push([logical, hash(fs.readFileSync(actual))]);
    };
    const walk = (root, logicalRoot) => {
      for (const name of fs.readdirSync(root).sort()) {
        const actual = path.join(root, name);
        const logical = path.posix.join(logicalRoot, name);
        const stat = fs.statSync(actual);
        if (stat.isDirectory()) walk(actual, logical);
        else if (stat.isFile()) add(logical, actual);
      }
    };
    walk('/app/dist', 'dist');
    add('package.json', '/app/package.json');
    add('package-lock.json', '/evidence/package-lock.json');
    add('prisma-client/package.json', '/app/node_modules/@prisma/client/package.json');
    add('prisma-generated/package.json', '/app/node_modules/.prisma/client/package.json');
    const entrypoints = ['dist/main.js', 'dist/core-worker.js', 'dist/media-worker.js'];
    for (const entrypoint of entrypoints) add('entrypoint:' + entrypoint, '/app/' + entrypoint);
    entries.sort(([a], [b]) => a.localeCompare(b));
    const packageJson = require('/app/package.json');
    const prismaVersion = require('/app/node_modules/@prisma/client/package.json').version;
    const payload = { entries, entrypoints, nodeVersion: process.version, packageVersion: packageJson.version, prismaVersion };
    const runtimeManifestSha256 = hash(Buffer.from(JSON.stringify(payload)));
    process.stdout.write(JSON.stringify({
      entryCount: entries.length,
      entrypoints,
      nodeVersion: payload.nodeVersion,
      packageVersion: payload.packageVersion,
      prismaVersion: payload.prismaVersion,
      runtimeManifestSha256,
    }));
  `;
}

function parseRuntimeManifestVerification(output) {
  let report;
  try {
    report = JSON.parse(String(output).trim());
  } catch {
    throw new Error('Runtime manifest verification output is invalid');
  }
  if (
    report?.nodeVersion !== EXPECTED_NODE_VERSION ||
    report?.prismaVersion !== EXPECTED_PRISMA_VERSION ||
    typeof report?.packageVersion !== 'string' ||
    report.packageVersion.length < 1 ||
    !Number.isInteger(report?.entryCount) ||
    report.entryCount < 4 ||
    JSON.stringify(report?.entrypoints) !==
      JSON.stringify(['dist/main.js', 'dist/core-worker.js', 'dist/media-worker.js']) ||
    !/^[a-f0-9]{64}$/u.test(report?.runtimeManifestSha256 ?? '')
  ) {
    throw new Error('Runtime manifest verification failed');
  }
  return Object.freeze({
    nodeVersion: report.nodeVersion,
    prismaVersion: report.prismaVersion,
    packageVersion: report.packageVersion,
    runtimeManifestSha256: report.runtimeManifestSha256,
    entryCount: report.entryCount,
  });
}

function buildRuntimeVerificationArgs(imageId, packageLockPath) {
  b1.parseDockerImageId(imageId);
  if (!path.isAbsolute(packageLockPath)) {
    throw new Error('Runtime verification package-lock path is invalid');
  }
  return [
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--mount',
    `type=bind,source=${packageLockPath},target=/evidence/package-lock.json,readonly`,
    '--entrypoint',
    'node',
    imageId,
    '-e',
    runtimeManifestVerificationScript(),
  ];
}

function requiredRuntimeLabels(provenance) {
  return buildRuntimeProvenanceLabels(provenance, true);
}

function validateRuntimeProvenance(provenance) {
  if (
    provenance?.baseCommit !== BASE_SHA ||
    !/^[a-f0-9]{40}$/u.test(provenance?.baseTree ?? '') ||
    !/^[a-f0-9]{64}$/u.test(provenance?.packageLockSha256 ?? '') ||
    !/^[a-f0-9]{64}$/u.test(provenance?.runtimeManifestSha256 ?? '') ||
    !/^sha256:[a-f0-9]{64}$/u.test(provenance?.runtimeImageId ?? '') ||
    provenance?.runtimeNodeVersion !== EXPECTED_NODE_VERSION ||
    provenance?.runtimePrismaVersion !== EXPECTED_PRISMA_VERSION ||
    typeof provenance?.packageVersion !== 'string' ||
    provenance.packageVersion.length < 1 ||
    !/^[a-z0-9][a-z0-9-]{5,80}$/u.test(provenance?.suiteRunId ?? '') ||
    typeof provenance?.packageLockPath !== 'string' ||
    !path.isAbsolute(provenance.packageLockPath)
  ) {
    throw new Error('Canonical runtime provenance is invalid');
  }
  const labels = requiredRuntimeLabels(provenance);
  for (const [name, value] of Object.entries(labels)) {
    if (provenance?.labels?.[name] !== value) {
      throw new Error('Canonical runtime provenance labels are invalid');
    }
  }
  return Object.freeze({ ...provenance, labels: Object.freeze({ ...provenance.labels }) });
}

function readInternalSuiteDescriptor(environment = process.env) {
  const descriptorPath = environment[INTERNAL_SUITE_DESCRIPTOR_KEY];
  if (!descriptorPath || !path.isAbsolute(descriptorPath)) {
    throw new Error('Internal B2 suite descriptor is unavailable');
  }
  let descriptor;
  try {
    descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  } catch {
    throw new Error('Internal B2 suite descriptor is invalid');
  }
  return validateRuntimeProvenance(descriptor);
}

async function command(context, args, label, options = {}) {
  const result = await b1.runChild('docker', args, {
    cwd: context.repositoryRoot,
    env: options.env ?? context.childEnvironment,
    timeoutMs: options.timeoutMs ?? 20_000,
    signal: options.ignoreAbort ? undefined : context.state.abortController.signal,
    tracker: context.childTracker,
    sensitiveValues: context.sensitiveValues,
  });
  if (!result.ok) throw new Error(`${label} failed`);
  return result.stdout.trim();
}

async function inspectImage(context, reference, options = {}) {
  const output = await command(
    context,
    ['image', 'inspect', '--format', '{{json .}}', reference],
    'Required local image inspection',
  );
  const inspected = parseImageInspection(output, options);
  return options.returnInspection ? inspected : inspected.id;
}

async function inspectImageInventory(context, options = {}) {
  const output = await command(
    context,
    ['image', 'ls', '--no-trunc', '--quiet'],
    'Docker image inventory inspection',
    options,
  );
  return b1.parseDockerImageIdList(output);
}

async function runSuiteChild(context, executable, args, label, options = {}) {
  const result = await b1.runChild(executable, args, {
    cwd: options.cwd ?? context.repositoryRoot,
    env: options.env ?? context.childEnvironment ?? process.env,
    timeoutMs: options.timeoutMs ?? 60_000,
    maxCaptureBytes: options.maxCaptureBytes ?? 64 * 1024,
    tracker: context.childTracker,
    sensitiveValues: context.sensitiveValues,
  });
  if (!result.ok && !options.allowFailure) throw new Error(`${label} failed`);
  return result;
}

async function requireLocalImageInspection(commandRunner, options = {}) {
  const attempts = options.attempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 250;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await commandRunner(attempt);
    if (result?.ok === true && result?.timedOut !== true) return true;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error('Canonical base-image local gate failed');
}

async function assertAuthorizedRepositoryState(context) {
  const git = async (args, label, options = {}) =>
    runSuiteChild(context, 'git', args, label, options);
  await git(['cat-file', '-e', `${BASE_SHA}^{commit}`], 'Base commit verification');
  const branch = (
    await git(['branch', '--show-current'], 'Branch verification')
  ).stdout.trim();
  const head = (await git(['rev-parse', 'HEAD'], 'HEAD verification')).stdout.trim();
  const baseTree = (
    await git(['rev-parse', `${BASE_SHA}^{tree}`], 'Base tree verification')
  ).stdout.trim();
  const index = await git(['diff', '--cached', '--quiet'], 'Index verification', {
    allowFailure: true,
  });
  const status = await git(
    ['status', '--porcelain=v1', '-z'],
    'Authorized path verification',
  );
  const dirtyPaths = status.stdout
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll('\\', '/'));
  const unauthorized = dirtyPaths.filter((file) => !AUTHORIZED_PATHS.includes(file));
  const runtimeDiff = await git(
    [
      'diff',
      '--name-only',
      BASE_SHA,
      '--',
      'src',
      'prisma',
      'package-lock.json',
      'Dockerfile',
      '.github/workflows',
    ],
    'Production runtime source verification',
  );
  if (
    branch !== 'chore/production-readiness-3-cloud-sql' ||
    head !== BASE_SHA ||
    !/^[a-f0-9]{40}$/u.test(baseTree) ||
    !index.ok ||
    dirtyPaths.length !== AUTHORIZED_PATHS.length ||
    unauthorized.length !== 0 ||
    runtimeDiff.stdout.trim() !== ''
  ) {
    throw new Error('B2 final-suite repository preflight failed');
  }
  return Object.freeze({ branch, head, baseTree, dirtyPaths: Object.freeze(dirtyPaths) });
}

function parseCanonicalBaseImage(dockerfile) {
  const match = String(dockerfile).match(/^ARG NODE_IMAGE=([^\r\n]+)$/mu);
  if (!match || !/^node:22\.23\.1-[^@\s]+@sha256:[a-f0-9]{64}$/u.test(match[1])) {
    throw new Error('Canonical Dockerfile base image is invalid');
  }
  return match[1];
}

async function verifyRuntimeMaterialInImage(context, imageId, packageLockPath) {
  const result = await runSuiteChild(
    context,
    'docker',
    buildRuntimeVerificationArgs(imageId, packageLockPath),
    'In-image runtime material verification',
    { timeoutMs: 120_000 },
  );
  return parseRuntimeManifestVerification(result.stdout);
}

async function inspectOwnedRuntimeImage(context, reference, requiredLabels) {
  const result = await runSuiteChild(
    context,
    'docker',
    ['image', 'inspect', '--format', '{{json .}}', reference],
    'Runtime image provenance inspection',
  );
  return parseImageInspection(result.stdout, { requiredLabels });
}

async function removeOwnedRuntimeImage(context, image) {
  const inspection = await inspectOwnedRuntimeImage(
    context,
    image.id,
    image.requiredLabels,
  );
  if (inspection.id !== image.id) throw new Error('Owned runtime image identity changed');
  const users = await runSuiteChild(
    context,
    'docker',
    ['container', 'ls', '--all', '--filter', `ancestor=${image.id}`, '--format', '{{.ID}}'],
    'Runtime image user inspection',
  );
  if (users.stdout.trim()) throw new Error('Owned runtime image remains in use');
  await runSuiteChild(
    context,
    'docker',
    ['image', 'rm', '--no-prune', image.tag],
    'Owned runtime image tag removal',
  );
  const remaining = await runSuiteChild(
    context,
    'docker',
    ['image', 'inspect', image.id],
    'Owned runtime image absence inspection',
    { allowFailure: true },
  );
  if (remaining.ok) {
    await runSuiteChild(
      context,
      'docker',
      ['image', 'rm', '--no-prune', image.id],
      'Owned runtime image removal',
    );
  }
  const final = await runSuiteChild(
    context,
    'docker',
    ['image', 'inspect', image.id],
    'Owned runtime image final absence inspection',
    { allowFailure: true },
  );
  if (final.ok || final.timedOut) throw new Error('Owned runtime image remains');
}

async function createCanonicalRuntimeImage(context, baseTree) {
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'moazez-b2-r1-build-'));
  context.temporaryPaths.add(temporaryRoot);
  const archivePath = path.join(temporaryRoot, 'base.tar');
  const contextPath = path.join(temporaryRoot, 'context');
  await fsp.mkdir(contextPath);
  await runSuiteChild(
    context,
    'git',
    ['archive', '--format=tar', `--output=${archivePath}`, BASE_SHA],
    'Canonical source archive creation',
  );
  await runSuiteChild(
    context,
    'tar',
    ['-xf', archivePath, '-C', contextPath],
    'Canonical source archive extraction',
  );
  const dockerfilePath = path.join(contextPath, 'Dockerfile');
  const packageLockPath = path.join(contextPath, 'package-lock.json');
  const baseImage = parseCanonicalBaseImage(await fsp.readFile(dockerfilePath, 'utf8'));
  await requireLocalImageInspection(() =>
    runSuiteChild(
      context,
      'docker',
      ['image', 'inspect', baseImage],
      'Canonical base-image local gate',
      { allowFailure: true },
    ),
  );
  const packageLockSha256 = sha256File(packageLockPath);
  const provenance = {
    baseCommit: BASE_SHA,
    baseTree,
    packageLockSha256,
    suiteRunId: context.suiteRunId,
  };
  const probeTag = `moazez-prd3-g01-b2:${context.suiteRunId}-probe`;
  const probeLabels = buildRuntimeProvenanceLabels(provenance, false);
  await runSuiteChild(
    context,
    'docker',
    buildCanonicalDockerBuildArgs({ contextPath, tag: probeTag, labels: probeLabels }),
    'Canonical probe runtime image build',
    { timeoutMs: 1_800_000 },
  );
  const probeInspection = await inspectOwnedRuntimeImage(context, probeTag, probeLabels);
  const probeImage = Object.freeze({
    tag: probeTag,
    id: probeInspection.id,
    requiredLabels: probeLabels,
  });
  context.runtimeImages.push(probeImage);
  const probeVerification = await verifyRuntimeMaterialInImage(
    context,
    probeImage.id,
    packageLockPath,
  );
  provenance.runtimeManifestSha256 = probeVerification.runtimeManifestSha256;
  const finalTag = `moazez-prd3-g01-b2:${context.suiteRunId}-runtime`;
  const finalLabels = requiredRuntimeLabels(provenance);
  await runSuiteChild(
    context,
    'docker',
    buildCanonicalDockerBuildArgs({ contextPath, tag: finalTag, labels: finalLabels }),
    'Canonical final runtime image build',
    { timeoutMs: 1_800_000 },
  );
  const finalInspection = await inspectOwnedRuntimeImage(context, finalTag, finalLabels);
  const finalImage = Object.freeze({
    tag: finalTag,
    id: finalInspection.id,
    requiredLabels: finalLabels,
  });
  context.runtimeImages.push(finalImage);
  const finalVerification = await verifyRuntimeMaterialInImage(
    context,
    finalImage.id,
    packageLockPath,
  );
  if (
    finalVerification.runtimeManifestSha256 !== provenance.runtimeManifestSha256 ||
    finalVerification.packageVersion !== probeVerification.packageVersion ||
    finalVerification.prismaVersion !== EXPECTED_PRISMA_VERSION ||
    finalVerification.nodeVersion !== EXPECTED_NODE_VERSION
  ) {
    throw new Error('Final runtime image material differs from canonical probe build');
  }
  await removeOwnedRuntimeImage(context, probeImage);
  context.runtimeImages.splice(context.runtimeImages.indexOf(probeImage), 1);
  return Object.freeze({
    ...provenance,
    runtimeImageId: finalImage.id,
    runtimeImageTag: finalTag,
    runtimeNodeVersion: finalVerification.nodeVersion,
    runtimePrismaVersion: finalVerification.prismaVersion,
    packageVersion: finalVerification.packageVersion,
    runtimeManifestEntryCount: finalVerification.entryCount,
    labels: finalLabels,
    buildContextPath: contextPath,
    packageLockPath,
  });
}

function nameListArgs(kind, name) {
  if (kind === 'container') {
    return [
      'container',
      'ls',
      '--all',
      '--filter',
      `name=^/${name}$`,
      '--format',
      '{{.Names}}',
    ];
  }
  return [
    'network',
    'ls',
    '--filter',
    `name=^${name}$`,
    '--format',
    '{{.Name}}',
  ];
}

async function inspectResourceState(context, kind, name, options = {}) {
  const result = await b1.runChild('docker', nameListArgs(kind, name), {
    cwd: context.repositoryRoot,
    env: context.childEnvironment,
    timeoutMs: 10_000,
    signal: options.ignoreAbort ? undefined : context.state.abortController.signal,
    tracker: context.childTracker,
    sensitiveValues: context.sensitiveValues,
  });
  return b1.classifyDockerNameListResult(result, name);
}

async function verifyOwnership(context, kind, name, options = {}) {
  const result = await b1.runChild(
    'docker',
    [kind, 'inspect', '--format', '{{json .}}', name],
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 10_000,
      signal: options.ignoreAbort ? undefined : context.state.abortController.signal,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  return b1.parseDockerOwnershipInspectionResult(
    result,
    context.labels,
    name,
    kind,
  );
}

async function removeOwnedResource(context, kind, name) {
  const state = await inspectResourceState(context, kind, name, {
    ignoreAbort: true,
  });
  if (state === b1.DOCKER_RESOURCE_STATE.ABSENT) {
    context.ownedResources.delete(name);
    context.pausedContainers.delete(name);
    return;
  }
  await verifyOwnership(context, kind, name, { ignoreAbort: true });
  if (kind === 'container' && context.pausedContainers.has(name)) {
    await command(context, ['unpause', name], 'Owned PostgreSQL unpause', {
      ignoreAbort: true,
    });
    context.pausedContainers.delete(name);
  }
  if (
    kind === 'container' &&
    Object.values(context.runtimeNames).includes(name)
  ) {
    const stop = await b1.runChild(
      'docker',
      ['container', 'stop', '--time', '20', name],
      {
        cwd: context.repositoryRoot,
        env: context.childEnvironment,
        timeoutMs: 25_000,
        tracker: context.childTracker,
        sensitiveValues: context.sensitiveValues,
      },
    );
    if (!stop.ok) throw new Error('Owned runtime graceful stop failed');
  }
  const args =
    kind === 'network' ? ['network', 'rm', name] : ['container', 'rm', '--force', name];
  await command(context, args, `Owned Docker ${kind} removal`, {
    ignoreAbort: true,
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (
      (await inspectResourceState(context, kind, name, { ignoreAbort: true })) ===
      b1.DOCKER_RESOURCE_STATE.ABSENT
    ) {
      context.ownedResources.delete(name);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Owned Docker ${kind} remains after removal`);
}

async function reconcileFailedCreate(context, kind, name) {
  const state = await inspectResourceState(context, kind, name, {
    ignoreAbort: true,
  });
  if (state === b1.DOCKER_RESOURCE_STATE.ABSENT) return;
  await verifyOwnership(context, kind, name, { ignoreAbort: true });
  await removeOwnedResource(context, kind, name);
}

async function createOwned(context, kind, name, create, options = {}) {
  try {
    await create();
  } catch (error) {
    await (options.reconcile ?? reconcileFailedCreate)(context, kind, name);
    throw error;
  }
  context.ownedResources.set(name, kind);
  context.allOwnedNames.set(name, kind);
  context.cleanup.add(`${kind}:${name}`, () => removeOwnedResource(context, kind, name));
}

async function verifyNoCurrentRunLabels(context) {
  const result = { containers: 0, networks: 0 };
  for (const kind of ['container', 'network']) {
    const base = kind === 'container' ? ['container', 'ls', '--all'] : ['network', 'ls'];
    const output = await command(
      context,
      [
        ...base,
        '--filter',
        `label=${GATE_LABEL}=${GATE}`,
        '--filter',
        `label=${RUN_LABEL}=${context.runId}`,
        '--format',
        kind === 'container' ? '{{.Names}}' : '{{.Name}}',
      ],
      'Current-run label cleanup inspection',
      { ignoreAbort: true },
    );
    const names = output ? output.split(/\r?\n/u).filter(Boolean) : [];
    result[kind === 'container' ? 'containers' : 'networks'] = names.length;
  }
  if (result.containers !== 0 || result.networks !== 0) {
    throw new Error('Current-run labeled Docker resources remain');
  }
  return result;
}

async function verifyAllExactNamesAbsent(context) {
  let containers = 0;
  let networks = 0;
  for (const [name, kind] of context.allOwnedNames) {
    const state = await inspectResourceState(context, kind, name, {
      ignoreAbort: true,
    });
    if (state === b1.DOCKER_RESOURCE_STATE.EXISTS) {
      if (kind === 'container') containers += 1;
      else networks += 1;
    }
  }
  if (containers !== 0 || networks !== 0) {
    throw new Error('Exact-name Docker resources remain');
  }
  return { containers, networks };
}

async function poll(label, predicate, options = {}) {
  const started = process.hrtime.bigint();
  const timeoutMs = options.timeoutMs ?? 30_000;
  while (Number(process.hrtime.bigint() - started) / 1e6 < timeoutMs) {
    if (options.signal?.aborted) throw new Error(`${label} was aborted`);
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 250));
  }
  throw new Error(`${label} exceeded its bounded deadline`);
}

async function waitForPostgres(context, fixture) {
  await poll(
    'Disposable PostgreSQL readiness',
    async () => {
      const result = await b1.runChild(
        'docker',
        ['exec', fixture.name, 'pg_isready', '-U', fixture.user, '-d', fixture.database],
        {
          cwd: context.repositoryRoot,
          env: context.childEnvironment,
          timeoutMs: 5000,
          signal: context.state.abortController.signal,
          tracker: context.childTracker,
          sensitiveValues: context.sensitiveValues,
        },
      );
      return result.ok;
    },
    { timeoutMs: 60_000, intervalMs: 400, signal: context.state.abortController.signal },
  );
}

async function createPostgresFixture(context, ordinal) {
  const fixture = {
    name: `prd3-g01-b2-${context.runId}-postgres-${ordinal}`,
    user: `b2_${randomBytes(6).toString('hex')}`,
    password: `synthetic-${randomBytes(24).toString('hex')}`,
    database: `b2_${randomBytes(8).toString('hex')}`,
    paused: false,
    observer: null,
  };
  context.sensitiveValues.push(fixture.user, fixture.password, fixture.database);
  const env = {
    ...context.childEnvironment,
    POSTGRES_USER: fixture.user,
    POSTGRES_PASSWORD: fixture.password,
    POSTGRES_DB: fixture.database,
  };
  await createOwned(context, 'container', fixture.name, () =>
    command(
      context,
      buildPostgresRunArgs(context, fixture),
      'Disposable PostgreSQL creation',
      { env, timeoutMs: 90_000 },
    ),
  );
  await verifyOwnership(context, 'container', fixture.name);
  await command(
    context,
    ['network', 'inspect', '--format', '{{.Name}}|{{.Driver}}|{{.Scope}}|{{.Internal}}', 'bridge'],
    'Built-in bridge inspection',
  ).then((value) => {
    if (value !== 'bridge|bridge|local|false') {
      throw new Error('Built-in bridge metadata is invalid');
    }
  });
  await command(
    context,
    ['network', 'connect', 'bridge', fixture.name],
    'Loopback bridge attachment',
  );
  await waitForPostgres(context, fixture);
  const portOutput = await command(
    context,
    [
      'container',
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      fixture.name,
    ],
    'PostgreSQL published-port inspection',
  );
  const port = b1.parsePublishedPortInspection(portOutput);
  fixture.internalUrl = `postgresql://${encodeURIComponent(fixture.user)}:${encodeURIComponent(fixture.password)}@${fixture.name}:5432/${encodeURIComponent(fixture.database)}`;
  fixture.observerUrl = `postgresql://${encodeURIComponent(fixture.user)}:${encodeURIComponent(fixture.password)}@127.0.0.1:${port}/${encodeURIComponent(fixture.database)}?application_name=${OBSERVER_APPLICATION_NAME}&connection_limit=1&pool_timeout=2&connect_timeout=5`;
  context.sensitiveValues.push(fixture.internalUrl, fixture.observerUrl, String(port));
  return fixture;
}

async function pausePostgres(context, fixture, commandRunner = command) {
  await commandRunner(context, ['pause', fixture.name], 'PostgreSQL pause');
  context.pausedContainers.add(fixture.name);
  fixture.paused = true;
  const paused = await commandRunner(
    context,
    ['container', 'inspect', '--format', '{{.State.Paused}}', fixture.name],
    'PostgreSQL pause verification',
  );
  if (paused !== 'true') throw new Error('PostgreSQL pause transition failed');
}

async function unpausePostgres(
  context,
  fixture,
  commandRunner = command,
  readinessWaiter = waitForPostgres,
) {
  await commandRunner(context, ['unpause', fixture.name], 'PostgreSQL unpause', {
    ignoreAbort: false,
  });
  context.pausedContainers.delete(fixture.name);
  fixture.paused = false;
  await readinessWaiter(context, fixture);
}

async function findGitBash() {
  const candidates = [
    process.env.PRD3_G01_B2_GIT_BASH,
    process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === 'bash' || fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Working Git Bash executable is unavailable');
}

function runtimeName(context, role) {
  return context.runtimeNames[role];
}

function healthEnvironment(context, fixture, extra = {}) {
  const policyEnvironment = extra.role
    ? buildDatabasePolicyEnvironment(extra.role, context.databasePolicy)
    : {};
  return {
    ...context.childEnvironment,
    MSYS_NO_PATHCONV: '1',
    B2_ACTION: extra.action,
    B2_ROLE: extra.role,
    B2_PROBE_KIND: extra.kind,
    B2_RUNTIME_IMAGE_ID: context.imageIds.runtime,
    B2_NETWORK_NAME: context.networkName,
    B2_GATE_LABEL: GATE,
    B2_RUN_LABEL: context.runId,
    B2_API_CONTAINER_NAME: context.runtimeNames.api,
    B2_CORE_WORKER_CONTAINER_NAME: context.runtimeNames['core-worker'],
    B2_MEDIA_WORKER_CONTAINER_NAME: context.runtimeNames['media-worker'],
    ...policyEnvironment,
    DATABASE_URL: fixture.internalUrl,
    QUEUE_REDIS_URL: `redis://${context.redisName}:6379`,
    REALTIME_REDIS_URL: `redis://${context.redisName}:6379`,
    STORAGE_ENDPOINT: `http://${context.minioName}:9000`,
    STORAGE_ACCESS_KEY: context.credentials.storageAccessKey,
    STORAGE_SECRET_KEY: context.credentials.storageSecretKey,
    STORAGE_BUCKET: context.credentials.storageBucket,
    STORAGE_PUBLIC_BUCKET: context.credentials.storagePublicBucket,
    JWT_ACCESS_SECRET: context.credentials.jwtAccess,
    JWT_REFRESH_SECRET: context.credentials.jwtRefresh,
    SETTINGS_SECRET_ENCRYPTION_KEY: context.credentials.settingsKey,
  };
}

async function runHealthAction(context, fixture, extra, label, timeoutMs = 30_000) {
  const result = await b1.runChild(
    context.gitBash,
    [context.healthScript, 'database-recovery'],
    {
      cwd: context.repositoryRoot,
      env: healthEnvironment(context, fixture, extra),
      timeoutMs,
      signal: context.state.abortController.signal,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  if (!result.ok) throw new Error(`${label} failed`);
  return result.stdout.trim();
}

async function launchRuntime(context, fixture, role) {
  const name = runtimeName(context, role);
  try {
    const output = await runHealthAction(
      context,
      fixture,
      { action: 'launch-runtime', role },
      `${role} canonical runtime launch`,
      45_000,
    );
    const result = JSON.parse(output);
    if (result?.launched !== true || result?.role !== role) {
      throw new Error('Canonical runtime launch response is invalid');
    }
  } catch (error) {
    await reconcileFailedCreate(context, 'container', name);
    throw error;
  }
  context.ownedResources.set(name, 'container');
  context.allOwnedNames.set(name, 'container');
  context.cleanup.add(`container:${name}`, () =>
    removeOwnedResource(context, 'container', name),
  );
  await verifyRuntimeEnvironment(context, name, role);
}

async function verifyRuntimeEnvironment(context, name, role) {
  const output = await command(
    context,
    ['container', 'inspect', '--format', '{{json .Config.Env}}', name],
    'Runtime environment inspection',
  );
  let values;
  try {
    values = JSON.parse(output);
  } catch {
    throw new Error('Runtime environment inspection is invalid');
  }
  const map = new Map(values.map((entry) => entry.split(/=(.*)/su).slice(0, 2)));
  const settings = context.databasePolicy.settings[role];
  if (
    map.get('DATABASE_RUNTIME_ROLE') !== role ||
    map.get('DATABASE_CONNECTION_LIMIT') !== String(settings.connectionLimit) ||
    map.get('DATABASE_POOL_TIMEOUT_SECONDS') !== String(settings.poolTimeoutSeconds) ||
    map.get('DATABASE_CONNECT_TIMEOUT_SECONDS') !== String(settings.connectTimeoutSeconds) ||
    !map.has('DATABASE_URL')
  ) {
    throw new Error('Canonical runtime database environment is invalid');
  }
  for (const forbidden of ['API_DATABASE_URL', 'CORE_DATABASE_URL', 'MEDIA_DATABASE_URL']) {
    if (map.has(forbidden)) throw new Error('Role-specific database URL is forbidden');
  }
}

async function provisionStorage(context, fixture) {
  await poll(
    'Disposable storage provisioning',
    async () => {
      try {
        const output = await runHealthAction(
          context,
          fixture,
          { action: 'provision-storage', role: 'api' },
          'Disposable storage provisioning',
          10_000,
        );
        return JSON.parse(output)?.storageProvisioned === true;
      } catch {
        return false;
      }
    },
    { timeoutMs: 45_000, intervalMs: 500, signal: context.state.abortController.signal },
  );
}

async function observeProbe(context, fixture, role, kind) {
  const output = await runHealthAction(
    context,
    fixture,
    { action: 'observe-probe', role, kind },
    `${role} ${kind} observation`,
    10_000,
  );
  return parseProbeResult(output);
}

async function readinessBurst(context, fixture, role) {
  const output = await runHealthAction(
    context,
    fixture,
    { action: 'readiness-burst', role },
    `${role} readiness burst`,
    15_000,
  );
  return validateReadinessBurst(JSON.parse(output), {
    expectedRole: role,
    expectedVersion: context.packageVersion,
    expectedCount: 10,
    maximumElapsedMs: PROBE_MAXIMUM_ELAPSED_MS,
  });
}

async function waitForProbe(context, fixture, role, kind, statusCode, timeoutMs) {
  return poll(
    `${role} ${kind} ${statusCode}`,
    async () => {
      try {
        const result = await observeProbe(context, fixture, role, kind);
        if (result.statusCode !== statusCode) return false;
        validateManagementProbe(result, {
          expectedRole: role,
          expectedKind: kind,
          expectedStatusCode: statusCode,
          expectedVersion: context.packageVersion,
          maximumElapsedMs: PROBE_MAXIMUM_ELAPSED_MS,
        });
        return result;
      } catch {
        return false;
      }
    },
    { timeoutMs, intervalMs: 250, signal: context.state.abortController.signal },
  );
}

async function runtimeIdentity(context, role) {
  const output = await command(
    context,
    ['container', 'inspect', '--format', '{{json .}}', runtimeName(context, role)],
    'Runtime identity inspection',
  );
  return parseRuntimeIdentity(output);
}

async function assertRuntimesUnchanged(context, identities) {
  for (const role of ROLE_KEYS) {
    validateRuntimeIdentity(identities[role], await runtimeIdentity(context, role));
  }
}

async function observeActivity(context, observer) {
  const rows = await b1.runBoundedPrismaOperation(
    'B2 PostgreSQL activity observation',
    () => observer.$queryRawUnsafe(ACTIVITY_SQL),
    {
      timeoutMs: context.prismaTimeouts?.operation ?? PRISMA_OPERATION_TIMEOUT_MS,
      signal: context.state.abortController.signal,
    },
  );
  return parseActivityRows(rows);
}

async function waitForRoleSessions(context, observer) {
  return poll(
    'Exact recovered runtime sessions',
    async () => {
      const sessions = await observeActivity(context, observer);
      const counts = countSessionsByRole(sessions);
      validatePoolLimits(counts, context.databasePolicy.settings);
      return ROLE_KEYS.every((role) => counts[role] >= 1) ? sessions : false;
    },
    { timeoutMs: 30_000, intervalMs: 300, signal: context.state.abortController.signal },
  );
}

async function initializeObserver(context, fixture, observer) {
  context.state.trackedPrismaClients.add(observer);
  fixture.observer = observer;
  await b1.runBoundedPrismaOperation('B2 observer connect', () => observer.$connect(), {
    timeoutMs: context.prismaTimeouts?.connect ?? 15_000,
    signal: context.state.abortController.signal,
  });
  const versions = await b1.runBoundedPrismaOperation(
    'B2 PostgreSQL server-version observation',
    () => observer.$queryRawUnsafe('SHOW server_version'),
    {
      timeoutMs: context.prismaTimeouts?.operation ?? PRISMA_OPERATION_TIMEOUT_MS,
      signal: context.state.abortController.signal,
    },
  );
  const limits = await b1.runBoundedPrismaOperation(
    'B2 PostgreSQL connection-limit observation',
    () => observer.$queryRawUnsafe('SHOW max_connections'),
    {
      timeoutMs: context.prismaTimeouts?.operation ?? PRISMA_OPERATION_TIMEOUT_MS,
      signal: context.state.abortController.signal,
    },
  );
  if (
    !String(versions?.[0]?.server_version ?? '').startsWith('16.') ||
    Number(limits?.[0]?.max_connections) !== POSTGRES_MAX_CONNECTIONS
  ) {
    throw new Error('Disposable PostgreSQL server policy is invalid');
  }
  return observer;
}

async function connectObserver(context, fixture) {
  const { PrismaClient } = require('@prisma/client');
  const observer = new PrismaClient({ datasourceUrl: fixture.observerUrl });
  return initializeObserver(context, fixture, observer);
}

async function disconnectObserver(context, fixture) {
  if (!fixture?.observer) return;
  const observer = fixture.observer;
  const statuses = await b1.disconnectTrackedPrismaClients(
    context.state.trackedPrismaClients,
    PRISMA_DISCONNECT_PHASE_ONE_MS,
  );
  if (statuses.some(({ client, status }) => client === observer && status !== b1.PRISMA_DISCONNECT_STATUS.SUCCESS)) {
    throw new Error('B2 observer disconnect did not complete');
  }
  if (!context.state.trackedPrismaClients.has(observer)) fixture.observer = null;
}

async function startDependencies(context, fixture) {
  await createOwned(context, 'container', context.redisName, () =>
    command(context, buildRedisRunArgs(context), 'Disposable Redis creation', {
      timeoutMs: 45_000,
    }),
  );
  await poll(
    'Disposable Redis readiness',
    async () => {
      const result = await b1.runChild(
        'docker',
        ['exec', context.redisName, 'redis-cli', 'ping'],
        {
          cwd: context.repositoryRoot,
          env: context.childEnvironment,
          timeoutMs: 5000,
          signal: context.state.abortController.signal,
          tracker: context.childTracker,
          sensitiveValues: context.sensitiveValues,
        },
      );
      return result.ok && result.stdout.trim() === 'PONG';
    },
    { timeoutMs: 30_000, intervalMs: 300, signal: context.state.abortController.signal },
  );
  const minioEnvironment = {
    ...context.childEnvironment,
    MINIO_ROOT_USER: context.credentials.storageAccessKey,
    MINIO_ROOT_PASSWORD: context.credentials.storageSecretKey,
  };
  await createOwned(context, 'container', context.minioName, () =>
    command(context, buildMinioRunArgs(context), 'Disposable MinIO creation', {
      env: minioEnvironment,
      timeoutMs: 45_000,
    }),
  );
  await launchRuntime(context, fixture, 'api');
  await provisionStorage(context, fixture);
  await launchRuntime(context, fixture, 'core-worker');
  await launchRuntime(context, fixture, 'media-worker');
}

async function waitHealthyBaseline(context, fixture) {
  const reports = {};
  for (const role of ROLE_KEYS) {
    reports[role] = {};
    for (const kind of ['startup', 'liveness', 'readiness']) {
      reports[role][kind] = await waitForProbe(
        context,
        fixture,
        role,
        kind,
        200,
        45_000,
      );
    }
  }
  const publicHealth = await observeProbe(context, fixture, 'api', 'public-health');
  validatePublicHealth(publicHealth, context.packageVersion);
  return Object.freeze({ reports, publicHealth });
}

async function runOutageCycle(context, fixture, cycle, identities) {
  const started = process.hrtime.bigint();
  await pausePostgres(context, fixture);
  const outage = {};
  await Promise.all(
    ROLE_KEYS.map(async (role) => {
      const roleStarted = process.hrtime.bigint();
      let report = await waitForProbe(
        context,
        fixture,
        role,
        'readiness',
        503,
        12_000,
      );
      if (
        context.faultInjection === 'FALSE_READY_DURING_OUTAGE' &&
        role === 'api' &&
        cycle === 1
      ) {
        report = { ...report, statusCode: 200 };
      }
      validateManagementProbe(report, {
        expectedRole: role,
        expectedKind: 'readiness',
        expectedStatusCode: 503,
        expectedVersion: context.packageVersion,
        maximumElapsedMs: PROBE_MAXIMUM_ELAPSED_MS,
      });
      outage[role] = {
        readiness: report,
        detectionLatencyMs: Math.round(
          Number(process.hrtime.bigint() - roleStarted) / 1e6,
        ),
      };
    }),
  );
  if (context.faultInjection === 'SIGINT_DURING_OUTAGE' && cycle === 1) {
    context.emitStage('database-paused');
    await b1.withDeadline('SIGINT outage rehearsal', () => context.state.signalPromise, {
      timeoutMs: 45_000,
    });
    b1.assertNotInterrupted(context.state);
  }
  const bursts = Object.fromEntries(
    await Promise.all(
      ROLE_KEYS.map(async (role) => [role, await readinessBurst(context, fixture, role)]),
    ),
  );
  for (const role of ROLE_KEYS) {
    const startup = await observeProbe(context, fixture, role, 'startup');
    validateManagementProbe(startup, {
      expectedRole: role,
      expectedKind: 'startup',
      expectedStatusCode: 200,
      expectedVersion: context.packageVersion,
      maximumElapsedMs: PROBE_MAXIMUM_ELAPSED_MS,
    });
    const liveness = await observeProbe(context, fixture, role, 'liveness');
    validateManagementProbe(liveness, {
      expectedRole: role,
      expectedKind: 'liveness',
      expectedStatusCode: 200,
      expectedVersion: context.packageVersion,
      maximumElapsedMs: PROBE_MAXIMUM_ELAPSED_MS,
    });
    outage[role].startup = startup;
    outage[role].liveness = liveness;
  }
  const publicHealth = await observeProbe(context, fixture, 'api', 'public-health');
  validatePublicHealth(publicHealth, context.packageVersion);
  await assertRuntimesUnchanged(context, identities);
  await unpausePostgres(context, fixture);
  if (context.faultInjection === 'SIGTERM_DURING_RECOVERY' && cycle === 1) {
    context.emitStage('database-recovery-polling');
    await b1.withDeadline('SIGTERM recovery rehearsal', () => context.state.signalPromise, {
      timeoutMs: 45_000,
    });
    b1.assertNotInterrupted(context.state);
  }
  const recovered = {};
  await Promise.all(
    ROLE_KEYS.map(async (role) => {
      recovered[role] = await waitForProbe(
        context,
        fixture,
        role,
        'readiness',
        200,
        60_000,
      );
    }),
  );
  await assertRuntimesUnchanged(context, identities);
  const sessions = await waitForRoleSessions(context, fixture.observer);
  const counts = countSessionsByRole(sessions);
  validatePoolLimits(counts, context.databasePolicy.settings);
  return Object.freeze({
    cycle,
    outage,
    bursts,
    publicHealth,
    recovered,
    sessionCounts: counts,
    elapsedMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
  });
}

async function runSessionReset(context, fixture, identities) {
  const observer = fixture.observer;
  const before = await waitForRoleSessions(context, observer);
  const terminationRows = await b1.runBoundedPrismaOperation(
    'B2 runtime session termination',
    () => observer.$queryRawUnsafe(TERMINATE_SQL),
    { timeoutMs: 10_000, signal: context.state.abortController.signal },
  );
  const terminatedPids = terminationRows
    .filter((row) => row?.terminated === true && Number.isInteger(row?.pid))
    .map((row) => row.pid);
  if (terminatedPids.length < 1) throw new Error('No runtime backend was terminated');
  const oldIdentities = new Set(before.map(sessionIdentity));
  await poll(
    'Old backend session disappearance',
    async () => {
      const current = await observeActivity(context, observer);
      return current.every((session) => !oldIdentities.has(sessionIdentity(session)));
    },
    { timeoutMs: 20_000, intervalMs: 200, signal: context.state.abortController.signal },
  );
  await Promise.all(
    ROLE_KEYS.map((role) =>
      waitForProbe(context, fixture, role, 'readiness', 200, 30_000),
    ),
  );
  const after = await waitForRoleSessions(context, observer);
  validateSessionRecovery(
    before,
    after,
    terminatedPids,
    context.databasePolicy.settings,
  );
  await assertRuntimesUnchanged(context, identities);
  return Object.freeze({
    terminatedCount: terminatedPids.length,
    oldBackendSessionsRemaining: 0,
    newSessionCounts: countSessionsByRole(after),
  });
}

async function inspectStartupContainer(context, role) {
  const name = runtimeName(context, role);
  const output = await command(
    context,
    ['container', 'inspect', '--format', '{{json .State}}', name],
    'Startup-unavailable runtime state inspection',
    { ignoreAbort: true },
  );
  const state = JSON.parse(output);
  let startupStatus = 'unavailable';
  let readinessStatus = 'unavailable';
  if (state.Running) {
    try {
      startupStatus = (await observeProbe(context, context.activeFixture, role, 'startup'))
        .statusCode;
    } catch {}
    try {
      readinessStatus = (
        await observeProbe(context, context.activeFixture, role, 'readiness')
      ).statusCode;
    } catch {}
  }
  return {
    running: state.Running === true,
    exitCode: state.ExitCode,
    startupStatus,
    readinessStatus,
  };
}

async function stopAllRuntimes(context) {
  for (const role of [...ROLE_KEYS].reverse()) {
    const name = runtimeName(context, role);
    if (
      (await inspectResourceState(context, 'container', name, { ignoreAbort: true })) ===
      b1.DOCKER_RESOURCE_STATE.EXISTS
    ) {
      await removeOwnedResource(context, 'container', name);
    }
  }
}

async function runStartupUnavailable(context, oldFixture) {
  await stopAllRuntimes(context);
  await disconnectObserver(context, oldFixture);
  await removeOwnedResource(context, 'container', oldFixture.name);
  const fixture = await createPostgresFixture(context, 2);
  context.activeFixture = fixture;
  await pausePostgres(context, fixture);
  const startupUnavailable = {};
  for (const role of ROLE_KEYS) {
    await launchRuntime(context, fixture, role);
  }
  await new Promise((resolve) => setTimeout(resolve, 8000));
  for (const role of ROLE_KEYS) {
    const observation = await inspectStartupContainer(context, role);
    startupUnavailable[role] = classifyStartupUnavailable(observation);
  }
  await stopAllRuntimes(context);
  await unpausePostgres(context, fixture);
  for (const role of ROLE_KEYS) await launchRuntime(context, fixture, role);
  await provisionStorage(context, fixture);
  const baseline = await waitHealthyBaseline(context, fixture);
  const observer = await connectObserver(context, fixture);
  const sessions = await waitForRoleSessions(context, observer);
  const freshStartup = Object.fromEntries(ROLE_KEYS.map((role) => [role, true]));
  return Object.freeze({ fixture, startupUnavailable, freshStartup, baseline, sessions });
}

async function boundedRuntimeLogs(context, role) {
  const result = await b1.runChild(
    'docker',
    ['logs', '--tail', '300', runtimeName(context, role)],
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 10_000,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
      maxCaptureBytes: 128 * 1024,
    },
  );
  if (!result.ok) throw new Error('Bounded runtime log collection failed');
  return `${result.stdout}\n${result.stderr}`;
}

async function atomicPublishSummary(context, summary, hooks = {}) {
  context.state.assertSummaryEligible();
  validateSummary(summary);
  b1.assertSanitizedSummary(summary, context.sensitiveValues);
  const finalPath = context.summaryPath;
  const scratchPath = `${finalPath}.${randomBytes(6).toString('hex')}.scratch`;
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  context.fileTracker.registerScratch(scratchPath);
  context.state.scratchPaths.add(scratchPath);
  let handle;
  let renamed = false;
  try {
    context.state.assertSummaryEligible();
    await hooks.beforeScratchOpen?.();
    context.state.assertSummaryEligible();
    handle = await fsp.open(scratchPath, 'wx', 0o600);
    context.state.assertSummaryEligible();
    if (hooks.writeScratch) await hooks.writeScratch(handle, serialized);
    else await handle.writeFile(serialized, 'utf8');
    await hooks.afterScratchWrite?.();
    context.state.assertSummaryEligible();
    await handle.sync();
    await handle.close();
    handle = null;
    await hooks.afterScratchClose?.();
    context.state.assertSummaryEligible();
    await hooks.beforeRename?.();
    context.state.assertSummaryEligible();
    await fsp.rename(scratchPath, finalPath);
    renamed = true;
    context.fileTracker.unregisterScratch(scratchPath);
    context.state.scratchPaths.delete(scratchPath);
    context.fileTracker.registerRetainedSanitizedSummary(finalPath);
    context.state.retainedSummaryPaths.add(finalPath);
    await hooks.afterRename?.();
    context.state.assertSummaryEligible();
    await hooks.beforeRetainedVerification?.();
    context.state.assertSummaryEligible();
    const retained = await fsp.readFile(finalPath);
    if (retained.toString('utf8') !== serialized) {
      throw new Error('Retained B2 summary verification failed');
    }
    await hooks.afterRetainedVerification?.();
    context.state.assertSummaryEligible();
    await hooks.beforeHashOutput?.();
    context.state.assertSummaryEligible();
    return Object.freeze({
      summaryPath: finalPath,
      summaryHash: createHash('sha256').update(retained).digest('hex'),
    });
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await fsp.rm(scratchPath, { force: true }).catch(() => undefined);
    context.fileTracker.unregisterScratch(scratchPath);
    context.state.scratchPaths.delete(scratchPath);
    if (renamed || context.state.retainedSummaryPaths.has(finalPath)) {
      await fsp.rm(finalPath, { force: true }).catch(() => undefined);
      context.fileTracker.unregisterRetainedSanitizedSummary(finalPath);
      context.state.retainedSummaryPaths.delete(finalPath);
    }
    context.state.disableSummary('B2 summary publication');
    throw error;
  }
}

function createB2Finalizer(context, operations = {}) {
  const state = context.state;
  if (!(state instanceof b1.EvidenceState)) {
    throw new Error('Unified B2 evidence state is required');
  }
  return (options = {}) => {
    if (options.operationFailed) {
      state.disableSummary(options.failureStage ?? 'B2 evidence failure');
      state.abortController.abort();
    }
    if (state.finalizationPromise) return state.finalizationPromise;
    state.finalizationPromise = (async () => {
      if (
        ![b1.EVIDENCE_PHASE.FINALIZING, b1.EVIDENCE_PHASE.FINALIZED, b1.EVIDENCE_PHASE.FAILED].includes(
          state.phase,
        )
      ) {
        state.transition(b1.EVIDENCE_PHASE.FINALIZING);
      }
      const failures = [];
      const attempt = async (label, action) => {
        try {
          return await action();
        } catch {
          failures.push(label);
          state.disableSummary(label, 'cleanup');
          return undefined;
        }
      };
      let roleSessionsRemaining = 0;
      let exact;
      let labels;
      let finalImages;
      let phaseOne = [];
      let phaseTwo = [];
      let publication;
      try {
        await attempt('runtime shutdown', () =>
          (operations.stopRuntimes ?? stopAllRuntimes)(context),
        );
        await attempt('owned PostgreSQL unpause', async () => {
          for (const fixture of context.fixtures) {
            if (!context.pausedContainers.has(fixture.name)) continue;
            await command(context, ['unpause', fixture.name], 'Owned PostgreSQL unpause', {
              ignoreAbort: true,
            });
            context.pausedContainers.delete(fixture.name);
            fixture.paused = false;
          }
        });
        await attempt('runtime session disconnect observation', async () => {
          for (const fixture of context.fixtures) {
            if (!fixture.observer) continue;
            await poll(
              'Final runtime session disconnect',
              async () => {
                const rows = await b1.runBoundedPrismaOperation(
                  'Final PostgreSQL activity observation',
                  () => fixture.observer.$queryRawUnsafe(ACTIVITY_SQL),
                  { timeoutMs: PRISMA_OPERATION_TIMEOUT_MS },
                );
                const parsed = parseActivityRows(rows);
                roleSessionsRemaining = parsed.length;
                return parsed.length === 0;
              },
              { timeoutMs: 15_000, intervalMs: 200 },
            );
          }
        });
        phaseOne =
          (await attempt('Prisma disconnect phase one', () =>
            (operations.disconnectPhaseOne ?? b1.disconnectTrackedPrismaClients)(
              state.trackedPrismaClients,
              PRISMA_DISCONNECT_PHASE_ONE_MS,
            ),
          )) ?? [];
        await attempt('tracked child termination', () =>
          (operations.terminateChildren ?? (() => context.childTracker.terminateAll()))(),
        );
        await attempt('owned resource cleanup', async () => {
          const result = await (operations.cleanupResources ?? (() => context.cleanup.run()))();
          if (!result?.ok) throw new Error('Owned cleanup actions failed');
        });
        exact = await attempt('exact-name cleanup inspection', () =>
          (operations.verifyExactNames ?? verifyAllExactNamesAbsent)(context),
        );
        labels = await attempt('current-run label cleanup inspection', () =>
          (operations.verifyLabels ?? verifyNoCurrentRunLabels)(context),
        );
        finalImages = await attempt('Docker image inventory verification', () =>
          (operations.verifyImages ?? inspectImageInventory)(context, { ignoreAbort: true }),
        );
        if (
          finalImages &&
          JSON.stringify(finalImages) !== JSON.stringify(context.initialImageIds)
        ) {
          failures.push('Docker image inventory changed');
          state.disableSummary('Docker image inventory changed', 'cleanup');
        }
        phaseTwo =
          (await attempt('Prisma disconnect phase two', () =>
            (operations.disconnectPhaseTwo ?? b1.disconnectTrackedPrismaClients)(
              state.trackedPrismaClients,
              PRISMA_DISCONNECT_PHASE_TWO_MS,
            ),
          )) ?? [];
        if (state.trackedPrismaClients.size !== 0) {
          failures.push('tracked Prisma clients remain');
          state.disableSummary('tracked Prisma clients remain', 'cleanup');
        }
        if (context.childTracker.children.size !== 0) {
          failures.push('tracked children remain');
          state.disableSummary('tracked children remain', 'cleanup');
        }
        if (state.ownedDockerResources.size !== 0) {
          failures.push('owned Docker resources remain tracked');
          state.disableSummary('owned Docker resources remain tracked', 'cleanup');
        }
        await attempt('scratch evidence cleanup', () =>
          b1.removeTrackedEvidenceFiles(state, context.fileTracker, {
            removeRetained: state.interrupted || !state.summaryEligibility,
          }),
        );
        const cleanup = {
          trackedPrismaClientsRemaining: state.trackedPrismaClients.size,
          prismaDisconnectFailures: state.trackedPrismaClients.size,
          trackedChildrenRemaining: context.childTracker.children.size,
          exactNameContainersRemaining: exact?.containers ?? -1,
          exactNameNetworksRemaining: exact?.networks ?? -1,
          currentRunLabeledContainersRemaining: labels?.containers ?? -1,
          currentRunLabeledNetworksRemaining: labels?.networks ?? -1,
          roleSessionsRemaining,
          scratchFilesRemaining: context.fileTracker.snapshot().scratchFilesRemaining,
          inspectionVerified: Boolean(exact && labels && finalImages),
        };
        if (
          failures.length === 0 &&
          !options.operationFailed &&
          !state.interrupted &&
          state.summaryEligibility
        ) {
          publication = await attempt('B2 summary publication', async () => {
            validateCleanupEvidence(cleanup);
            const summary = context.buildSummary(cleanup);
            return (operations.publishSummary ?? atomicPublishSummary)(
              context,
              summary,
              operations.summaryHooks,
            );
          });
        }
        if (!publication && state.retainedSummaryPaths.size !== 0) {
          await attempt('ineligible retained summary cleanup', () =>
            b1.removeTrackedEvidenceFiles(state, context.fileTracker, { removeRetained: true }),
          );
        }
        const ok =
          failures.length === 0 &&
          Boolean(publication) &&
          !state.interrupted &&
          state.summaryEligibility;
        state.transition(ok ? b1.EVIDENCE_PHASE.FINALIZED : b1.EVIDENCE_PHASE.FAILED);
        return Object.freeze({
          ok,
          failures: Object.freeze([...failures]),
          phaseOneDisconnect: Object.freeze([...phaseOne]),
          phaseTwoDisconnect: Object.freeze([...phaseTwo]),
          cleanup,
          publication,
          terminalPhase: state.phase,
        });
      } finally {
        context.removeSignalHandlers?.();
      }
    })();
    return state.finalizationPromise;
  };
}

function installSignals(context) {
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      if (context.state.latchSignal(signal)) {
        process.exitCode = context.state.requestedExitCode;
        void context.finalize?.({
          operationFailed: true,
          failureStage: `signal-${signal.toLowerCase()}`,
        }).catch(() => undefined);
      }
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  const messageHandler = (message) => {
    if (
      message?.type === 'PRD3_G01_B2_TEST_SIGNAL' &&
      ['SIGINT', 'SIGTERM'].includes(message.signal)
    ) {
      handlers.get(message.signal)?.();
    }
  };
  process.on('message', messageHandler);
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.removeListener('message', messageHandler);
  };
}

function createSummary(context, cleanup) {
  const { cycles, reset, startup } = context.evidence;
  const roles = {};
  for (const role of ROLE_KEYS) {
    const maximumObservedConnections = Math.max(
      ...cycles.map((cycle) => cycle.sessionCounts[role]),
      reset.newSessionCounts[role],
      countSessionsByRole(startup.sessions)[role],
    );
    roles[ROLE_SUMMARY_KEYS[role]] = {
      outageReadinessStatus: cycles[0].outage[role].readiness.statusCode,
      outageLivenessStatus: cycles[0].outage[role].liveness.statusCode,
      outageStartupStatus: cycles[0].outage[role].startup.statusCode,
      recoveryReadinessStatus: cycles[1].recovered[role].statusCode,
      outageDetectionLatencyMs: cycles.map(
        (cycle) => cycle.outage[role].detectionLatencyMs,
      ),
      readinessBurstCount: cycles[0].bursts[role].count,
      readinessBurstMaximumElapsedMs: Math.max(
        ...cycles.map((cycle) => cycle.bursts[role].maximumElapsedMs),
      ),
      containerIdentityUnchanged: true,
      processIdentityUnchanged: true,
      newDatabaseSessionObserved: reset.newSessionCounts[role] >= 1,
      maximumObservedConnections,
      readinessUnavailableEvents: context.logEvidence[role].unavailable,
      readinessRecoveredEvents: context.logEvidence[role].recovered,
    };
  }
  const cycleEvidence = cycles.map((cycle, index) => ({
    cycle: index + 1,
    publicHealthDuringOutage: cycle.publicHealth.statusCode,
    roles: Object.fromEntries(
      ROLE_KEYS.map((role) => [
        ROLE_SUMMARY_KEYS[role],
        {
          outageReadinessStatus: cycle.outage[role].readiness.statusCode,
          outageLivenessStatus: cycle.outage[role].liveness.statusCode,
          outageStartupStatus: cycle.outage[role].startup.statusCode,
          recoveryReadinessStatus: cycle.recovered[role].statusCode,
          detectionLatencyMs: cycle.outage[role].detectionLatencyMs,
          readinessBurstCount: cycle.bursts[role].count,
          readinessBurstMaximumElapsedMs: cycle.bursts[role].maximumElapsedMs,
          recoveredSessionCount: cycle.sessionCounts[role],
        },
      ]),
    ),
  }));
  return Object.freeze({
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    gate: GATE,
    overall: 'PASS',
    runId: context.runId,
    nodeVersion: process.version,
    observerPrismaVersion: context.observerPrismaVersion,
    runtimePrismaVersion: context.runtimeProvenance.runtimePrismaVersion,
    packageVersion: context.packageVersion,
    baseCommit: context.runtimeProvenance.baseCommit,
    baseTree: context.runtimeProvenance.baseTree,
    packageLockSha256: context.runtimeProvenance.packageLockSha256,
    runtimeManifestSha256: context.runtimeProvenance.runtimeManifestSha256,
    runtimeImageLabelsVerified: true,
    runtimeManifestVerified: true,
    postgresMajor: 16,
    postgresMaxConnections: POSTGRES_MAX_CONNECTIONS,
    runtimeImageId: context.imageIds.runtime,
    postgresImageId: context.imageIds.postgres,
    dockerTransport: context.dockerTransport,
    roles,
    cycles: cycleEvidence,
    publicHealthDuringOutage: cycles[0].publicHealth.statusCode,
    oldBackendSessionsRemaining: reset.oldBackendSessionsRemaining,
    forcedSessionsTerminated: reset.terminatedCount,
    repeatedRecoveryCycles: cycles.length,
    startupUnavailable: Object.fromEntries(
      ROLE_KEYS.map((role) => [ROLE_SUMMARY_KEYS[role], startup.startupUnavailable[role]]),
    ),
    freshStartupAfterRecovery: Object.fromEntries(
      ROLE_KEYS.map((role) => [ROLE_SUMMARY_KEYS[role], startup.freshStartup[role]]),
    ),
    cleanup,
  });
}

async function runLiveEvidence(options = {}) {
  b1.assertExactNodeVersion();
  const observerPrismaVersion = require('@prisma/client/package.json').version;
  if (observerPrismaVersion !== EXPECTED_PRISMA_VERSION) {
    throw new Error('Installed Prisma Client version is not approved');
  }
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const runtimeProvenance = validateRuntimeProvenance(
    options.runtimeProvenance ?? readInternalSuiteDescriptor(),
  );
  const databasePolicy = loadCompiledDatabaseRuntimePolicy(repositoryRoot);
  const runId = createRunId();
  const childTracker = new b1.ChildProcessTracker();
  const prismaClients = new Set();
  const ownedDockerResources = new Map();
  const state = new b1.EvidenceState({
    trackedPrismaClients: prismaClients,
    trackedChildProcesses: childTracker.children,
    ownedDockerResources,
  });
  const context = {
    repositoryRoot,
    runId,
    labels: createOwnershipLabels(runId),
    networkName: `prd3-g01-b2-${runId}-net`,
    redisName: `prd3-g01-b2-${runId}-redis`,
    minioName: `prd3-g01-b2-${runId}-minio`,
    runtimeNames: {
      api: `prd3-g01-b2-${runId}-api`,
      'core-worker': `prd3-g01-b2-${runId}-core`,
      'media-worker': `prd3-g01-b2-${runId}-media`,
    },
    state,
    childTracker,
    cleanup: new b1.CleanupManager(),
    fileTracker: new b1.EvidenceFileTracker(),
    ownedResources: state.ownedDockerResources,
    allOwnedNames: new Map(),
    pausedContainers: new Set(),
    fixtures: [],
    sensitiveValues: [],
    credentials: {
      storageAccessKey: `b2${randomBytes(10).toString('hex')}`,
      storageSecretKey: `synthetic-${randomBytes(24).toString('hex')}`,
      storageBucket: `b2-${randomBytes(8).toString('hex')}-private`,
      storagePublicBucket: `b2-${randomBytes(8).toString('hex')}-public`,
      jwtAccess: `synthetic-${randomBytes(32).toString('hex')}`,
      jwtRefresh: `synthetic-${randomBytes(32).toString('hex')}`,
      settingsKey: `hex:${randomBytes(32).toString('hex')}`,
    },
    imageIds: {},
    initialImageIds: null,
    childEnvironment: null,
    dockerTransport: null,
    gitBash: null,
    healthScript: path.join(repositoryRoot, 'scripts', 'ci', 'health-probe-runtime.sh'),
    observerPrismaVersion,
    packageVersion: runtimeProvenance.packageVersion,
    runtimeProvenance,
    databasePolicy,
    summaryPath: path.join(os.tmpdir(), `moazez-prd3-g01-b2-${runId}-summary.json`),
    faultInjection: validateFaultInjection(process.env[FAULT_INJECTION_KEY]),
    failureStage: 'preflight',
    evidence: null,
    logEvidence: {},
    emitStage(stage) {
      if (this.faultInjection !== 'NONE') {
        process.stderr.write(`EVIDENCE_STAGE=${stage}\n`);
      }
    },
  };
  context.sensitiveValues.push(...Object.values(context.credentials));
  context.removeSignalHandlers = () => undefined;
  context.buildSummary = (cleanup) => createSummary(context, cleanup);
  context.finalize = createB2Finalizer(context, options.finalizerOperations);
  context.removeSignalHandlers = installSignals(context);
  let primaryError;
  let finalization;
  try {
    state.transition(b1.EVIDENCE_PHASE.READY);
    state.transition(b1.EVIDENCE_PHASE.RUNNING);
    const endpoint = await b1.resolvePinnedLocalDockerEndpoint({
      environment: process.env,
      cwd: repositoryRoot,
      tracker: childTracker,
    });
    context.childEnvironment = endpoint.childEnvironment;
    context.dockerTransport = endpoint.transport;
    context.sensitiveValues.push(endpoint.endpoint);
    context.gitBash = await findGitBash();
    await command(
      context,
      ['version', '--format', '{{.Server.Version}}'],
      'Local Docker daemon verification',
    );
    context.failureStage = 'image-gate';
    const runtimeInspection = await inspectImage(
      context,
      runtimeProvenance.runtimeImageId,
      {
        requiredLabels: requiredRuntimeLabels(runtimeProvenance),
        returnInspection: true,
      },
    );
    if (runtimeInspection.id !== runtimeProvenance.runtimeImageId) {
      throw new Error('Canonical runtime image identity changed');
    }
    const runtimeVerification = await verifyRuntimeMaterialInImage(
      context,
      runtimeInspection.id,
      runtimeProvenance.packageLockPath,
    );
    if (
      runtimeVerification.runtimeManifestSha256 !==
        runtimeProvenance.runtimeManifestSha256 ||
      runtimeVerification.nodeVersion !== EXPECTED_NODE_VERSION ||
      runtimeVerification.prismaVersion !== EXPECTED_PRISMA_VERSION ||
      runtimeVerification.packageVersion !== runtimeProvenance.packageVersion
    ) {
      throw new Error('Canonical runtime image verification changed');
    }
    context.imageIds.runtime = runtimeInspection.id;
    context.imageIds.postgres = await inspectImage(context, POSTGRES_IMAGE);
    context.imageIds.redis = await inspectImage(context, REDIS_IMAGE);
    context.imageIds.minio = await inspectImage(context, MINIO_IMAGE);
    context.initialImageIds = await inspectImageInventory(context);
    for (const [role, expected] of Object.entries(EXPECTED_ROLE_SETTINGS)) {
      const resolved = databasePolicy.settings[role];
      if (
        resolved.connectionLimit !== expected.connectionLimit ||
        resolved.poolTimeoutSeconds !== expected.poolTimeoutSeconds ||
        resolved.connectTimeoutSeconds !== expected.connectTimeoutSeconds
      ) {
        throw new Error('Compiled database runtime policy differs from the approved B2 assertions');
      }
    }

    context.failureStage = 'network-creation';
    await createOwned(context, 'network', context.networkName, () =>
      command(context, buildNetworkCreateArgs(context), 'Disposable network creation'),
    );
    const fixture = await createPostgresFixture(context, 1);
    context.fixtures.push(fixture);
    context.activeFixture = fixture;
    await startDependencies(context, fixture);
    context.failureStage = 'healthy-baseline';
    const baseline = await waitHealthyBaseline(context, fixture);
    const observer = await connectObserver(context, fixture);
    const identities = Object.fromEntries(
      await Promise.all(ROLE_KEYS.map(async (role) => [role, await runtimeIdentity(context, role)])),
    );
    await waitForRoleSessions(context, observer);

    context.failureStage = 'outage-recovery-cycles';
    const cycles = [];
    cycles.push(await runOutageCycle(context, fixture, 1, identities));
    cycles.push(await runOutageCycle(context, fixture, 2, identities));
    context.failureStage = 'forced-session-reset';
    const reset = await runSessionReset(context, fixture, identities);
    for (const role of ROLE_KEYS) {
      const runtimeLogs = await boundedRuntimeLogs(context, role);
      context.logEvidence[role] = validateLogTransitions(
        runtimeLogs,
        2,
        context.sensitiveValues,
      );
    }
    context.failureStage = 'startup-unavailable';
    const startup = await runStartupUnavailable(context, fixture);
    context.fixtures.push(startup.fixture);
    context.evidence = { baseline, cycles, reset, startup };
  } catch (error) {
    primaryError = error;
    state.disableSummary(context.failureStage);
  } finally {
    finalization = await context.finalize({
      operationFailed: Boolean(primaryError) || state.interrupted,
      failureStage: context.failureStage,
    });
  }
  if (!finalization.ok) {
    const error = new Error('B2 live evidence did not reach PASS');
    error.evidenceState = state;
    error.finalization = finalization;
    error.failureStage = context.failureStage;
    error.primaryReason = primaryError?.message;
    throw error;
  }
  process.stdout.write(`RUN_ID=${runId}\n`);
  process.stdout.write(`SUMMARY_PATH=${finalization.publication.summaryPath}\n`);
  process.stdout.write(`SUMMARY_SHA256=${finalization.publication.summaryHash}\n`);
  return finalization.publication;
}

function approvedNodeToolCommand(name) {
  if (!['npm', 'npx'].includes(name)) {
    throw new Error('Approved Node tool name is invalid');
  }
  const cliPath = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    `${name}-cli.js`,
  );
  if (!fs.existsSync(cliPath)) {
    throw new Error('Approved portable Node tool is unavailable');
  }
  return Object.freeze({
    executable: process.execPath,
    argsPrefix: Object.freeze([cliPath]),
  });
}

function assertNodeTestOutput(output, minimumTests) {
  const text = String(output);
  const tests = Number(text.match(/^# tests (\d+)$/mu)?.[1]);
  const passed = Number(text.match(/^# pass (\d+)$/mu)?.[1]);
  const failed = Number(text.match(/^# fail (\d+)$/mu)?.[1]);
  const skipped = Number(text.match(/^# skipped (\d+)$/mu)?.[1]);
  const todo = Number(text.match(/^# todo (\d+)$/mu)?.[1]);
  if (
    !Number.isInteger(tests) ||
    tests < minimumTests ||
    passed !== tests ||
    failed !== 0 ||
    skipped !== 0 ||
    todo !== 0
  ) {
    throw new Error('Required Node test suite did not pass completely');
  }
  return Object.freeze({ tests, passed, failed, skipped, todo });
}

function parseLivePublication(output) {
  const runId = String(output).match(/^RUN_ID=([a-z0-9-]+)$/mu)?.[1];
  const summaryPath = String(output).match(/^SUMMARY_PATH=(.+)$/mu)?.[1]?.trim();
  const summaryHash = String(output).match(/^SUMMARY_SHA256=([a-f0-9]{64})$/mu)?.[1];
  if (
    !runId ||
    !summaryPath ||
    !path.isAbsolute(summaryPath) ||
    !summaryHash ||
    !fs.existsSync(summaryPath)
  ) {
    throw new Error('Formal B2 publication output is invalid');
  }
  const retained = fs.readFileSync(summaryPath);
  if (createHash('sha256').update(retained).digest('hex') !== summaryHash) {
    throw new Error('Formal B2 summary hash verification failed');
  }
  const summary = JSON.parse(retained.toString('utf8'));
  validateSummary(summary);
  if (summary.runId !== runId) throw new Error('Formal B2 run identity is mismatched');
  return Object.freeze({ runId, summaryPath, summaryHash, summary });
}

async function removePriorB2Summaries() {
  const names = await fsp.readdir(os.tmpdir());
  for (const name of names) {
    if (!/^moazez-prd3-g01-b2-[a-z0-9-]+-summary\.json$/u.test(name)) continue;
    const filePath = path.join(os.tmpdir(), name);
    let parsed;
    try {
      parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch {
      throw new Error('Existing B2 summary cannot be safely classified');
    }
    if (parsed?.gate !== GATE) throw new Error('Existing B2 summary ownership is invalid');
    await fsp.rm(filePath);
  }
}

async function writeSuiteDescriptor(context, provenance) {
  const descriptorPath = path.join(
    path.dirname(provenance.buildContextPath),
    'suite-descriptor.json',
  );
  const descriptor = {
    ...provenance,
    packageLockPath: provenance.packageLockPath,
    labels: provenance.labels,
  };
  await fsp.writeFile(descriptorPath, `${JSON.stringify(descriptor)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  context.descriptorPath = descriptorPath;
  return descriptorPath;
}

async function runFormalChild(context) {
  const result = await runSuiteChild(
    context,
    process.execPath,
    [__filename, '--internal-live-run'],
    'Formal B2 live child',
    {
      env: {
        ...context.childEnvironment,
        [INTERNAL_SUITE_DESCRIPTOR_KEY]: context.descriptorPath,
        [FAULT_INJECTION_KEY]: 'NONE',
      },
      timeoutMs: 420_000,
    },
  );
  return parseLivePublication(result.stdout);
}

async function auditSuiteImages(context) {
  const result = await runSuiteChild(
    context,
    'docker',
    [
      'image',
      'ls',
      '--filter',
      `label=${GATE_LABEL}=${GATE}`,
      '--filter',
      `label=${RUN_LABEL}=${context.suiteRunId}`,
      '--no-trunc',
      '--format',
      '{{.ID}}',
    ],
    'Current-suite image label audit',
  );
  if (result.stdout.trim()) throw new Error('Current-suite runtime image remains');
  return true;
}

async function runFinalSuite() {
  b1.assertExactNodeVersion();
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const childTracker = new b1.ChildProcessTracker();
  const context = {
    repositoryRoot,
    suiteRunId: createRunId(),
    childTracker,
    childEnvironment: null,
    sensitiveValues: ['postgresql://build:build@127.0.0.1:5432/build'],
    runtimeImages: [],
    temporaryPaths: new Set(),
    formalPublications: [],
    descriptorPath: null,
  };
  let primaryError;
  let result;
  const cleanupFailures = [];
  try {
    const repository = await assertAuthorizedRepositoryState(context);
    const endpoint = await b1.resolvePinnedLocalDockerEndpoint({
      environment: process.env,
      cwd: repositoryRoot,
      tracker: childTracker,
    });
    context.childEnvironment = endpoint.childEnvironment;
    context.sensitiveValues.push(endpoint.endpoint);
    await runSuiteChild(
      context,
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      'Local Docker daemon verification',
    );
    await removePriorB2Summaries();
    const provenance = await createCanonicalRuntimeImage(context, repository.baseTree);
    await writeSuiteDescriptor(context, provenance);
    const npm = approvedNodeToolCommand('npm');
    const npx = approvedNodeToolCommand('npx');
    await runSuiteChild(
      context,
      npm.executable,
      [...npm.argsPrefix, 'run', 'verify:prd3-g01-a'],
      'PRD3-G01-A governance verification',
      { timeoutMs: 300_000 },
    );
    await runSuiteChild(
      context,
      npx.executable,
      [...npx.argsPrefix, 'prisma', 'generate'],
      'Host Prisma generation',
      { timeoutMs: 300_000 },
    );
    await runSuiteChild(
      context,
      npm.executable,
      [...npm.argsPrefix, 'run', 'build'],
      'Host application build',
      { timeoutMs: 600_000 },
    );
    const b1Tests = await runSuiteChild(
      context,
      process.execPath,
      ['--test', 'scripts/tests/prd3-g01-b-pool-saturation.test.cjs'],
      'B1 pure compatibility suite',
      { timeoutMs: 300_000, maxCaptureBytes: 512 * 1024 },
    );
    const b1Totals = assertNodeTestOutput(b1Tests.stdout, 60);
    const b2Tests = await runSuiteChild(
      context,
      process.execPath,
      ['--test', 'scripts/tests/prd3-g01-b2-database-recovery.test.cjs'],
      'B2 pure and adversarial suite',
      { timeoutMs: 300_000, maxCaptureBytes: 512 * 1024 },
    );
    const b2Totals = assertNodeTestOutput(b2Tests.stdout, 40);
    const coveredProofIds = parseFaultCoverageMarker(b2Tests.stdout);
    const rehearsals = await runFailureRehearsals(context);
    rehearsals.proofIds.forEach((proofId) => coveredProofIds.add(proofId));
    const runOne = await runFormalChild(context);
    context.formalPublications.push(runOne);
    const runTwo = await runFormalChild(context);
    context.formalPublications.push(runTwo);
    if (
      runOne.runId === runTwo.runId ||
      runOne.summary.runtimeImageId !== runTwo.summary.runtimeImageId ||
      runOne.summary.runtimeImageId !== provenance.runtimeImageId ||
      runOne.summary.runtimeManifestSha256 !== runTwo.summary.runtimeManifestSha256 ||
      runOne.summary.runtimeManifestSha256 !== provenance.runtimeManifestSha256
    ) {
      throw new Error('Formal B2 cross-run comparison failed');
    }
    coveredProofIds.add('two-run-required');
    const faultCoverage = validateFaultCoverage([...coveredProofIds]);
    const currentSummaries = (
      await fsp.readdir(os.tmpdir())
    ).filter((name) => /^moazez-prd3-g01-b2-[a-z0-9-]+-summary\.json$/u.test(name));
    if (currentSummaries.length !== 2) {
      throw new Error('Final suite did not retain exactly two formal summaries');
    }
    result = {
      repository,
      provenance,
      b1Totals,
      b2Totals,
      faultCoverage,
      rehearsals,
      runOne,
      runTwo,
      dockerTransport: endpoint.transport,
    };
  } catch (error) {
    primaryError = error;
  }
  try {
    await childTracker.terminateAll();
  } catch {
    cleanupFailures.push('tracked child cleanup');
  }
  try {
    await auditGateResources(context.childEnvironment, childTracker, context.sensitiveValues);
  } catch {
    cleanupFailures.push('B2 resource audit');
  }
  for (const image of [...context.runtimeImages].reverse()) {
    try {
      await removeOwnedRuntimeImage(context, image);
      context.runtimeImages.splice(context.runtimeImages.indexOf(image), 1);
    } catch {
      cleanupFailures.push('owned runtime image cleanup');
    }
  }
  try {
    if (context.childEnvironment) await auditSuiteImages(context);
  } catch {
    cleanupFailures.push('runtime image label audit');
  }
  for (const temporaryPath of context.temporaryPaths) {
    try {
      await fsp.rm(temporaryPath, { recursive: true, force: true });
      if (fs.existsSync(temporaryPath)) throw new Error('temporary path remains');
    } catch {
      cleanupFailures.push('temporary build-context cleanup');
    }
  }
  if (primaryError || cleanupFailures.length !== 0 || !result) {
    for (const publication of context.formalPublications) {
      await fsp.rm(publication.summaryPath, { force: true }).catch(() => undefined);
    }
    const error = new Error('PRD3-G01-B2 final suite failed closed');
    error.primaryReason = primaryError?.message;
    error.cleanupFailures = cleanupFailures;
    throw error;
  }
  for (const publication of context.formalPublications) {
    const retained = await fsp.readFile(publication.summaryPath);
    if (createHash('sha256').update(retained).digest('hex') !== publication.summaryHash) {
      throw new Error('Final summary hash changed after cleanup');
    }
  }
  process.stdout.write(`BASE_TREE=${result.repository.baseTree}\n`);
  process.stdout.write(`RUNTIME_IMAGE_ID=${result.provenance.runtimeImageId}\n`);
  process.stdout.write(`RUNTIME_MANIFEST_SHA256=${result.provenance.runtimeManifestSha256}\n`);
  process.stdout.write(`PACKAGE_LOCK_SHA256=${result.provenance.packageLockSha256}\n`);
  process.stdout.write(`RUNTIME_NODE_VERSION=${result.provenance.runtimeNodeVersion}\n`);
  process.stdout.write(`RUNTIME_PRISMA_VERSION=${result.provenance.runtimePrismaVersion}\n`);
  process.stdout.write(`OBSERVER_PRISMA_VERSION=${EXPECTED_PRISMA_VERSION}\n`);
  process.stdout.write(`B1_TESTS=${result.b1Totals.tests}\n`);
  process.stdout.write(`B2_TESTS=${result.b2Totals.tests}\n`);
  process.stdout.write(`FAULT_COVERAGE=${result.faultCoverage.covered}\n`);
  process.stdout.write(`RUN_1_ID=${result.runOne.runId}\n`);
  process.stdout.write(`RUN_1_SUMMARY=${result.runOne.summaryPath}\n`);
  process.stdout.write(`RUN_1_SHA256=${result.runOne.summaryHash}\n`);
  process.stdout.write(`RUN_2_ID=${result.runTwo.runId}\n`);
  process.stdout.write(`RUN_2_SUMMARY=${result.runTwo.summaryPath}\n`);
  process.stdout.write(`RUN_2_SHA256=${result.runTwo.summaryHash}\n`);
  process.stdout.write('FINAL_SUITE=PASS\n');
  return result;
}

async function auditGateResources(childEnvironment, existingTracker, sensitiveValues = []) {
  const tracker = existingTracker ?? new b1.ChildProcessTracker();
  let environment = childEnvironment;
  let endpoint;
  if (!environment) {
    endpoint = await b1.resolvePinnedLocalDockerEndpoint({
      environment: process.env,
      cwd: path.resolve(__dirname, '..', '..'),
      tracker,
    });
    environment = endpoint.childEnvironment;
  }
  try {
    for (const kind of ['container', 'network']) {
      const base = kind === 'container' ? ['container', 'ls', '--all'] : ['network', 'ls'];
      const result = await b1.runChild(
        'docker',
        [
          ...base,
          '--filter',
          `label=${GATE_LABEL}=${GATE}`,
          '--format',
          kind === 'container' ? '{{.Names}}' : '{{.Name}}',
        ],
        {
          cwd: path.resolve(__dirname, '..', '..'),
          env: environment,
          timeoutMs: 15_000,
          tracker,
          sensitiveValues: [...sensitiveValues, endpoint?.endpoint].filter(Boolean),
        },
      );
      if (!result.ok || result.stdout.trim()) {
        throw new Error('B2 gate resource audit failed');
      }
    }
  } finally {
    if (!existingTracker) await tracker.terminateAll();
  }
  return true;
}

async function runRehearsal(context, fault) {
  const expected = {
    SIGINT_DURING_OUTAGE: {
      exitCode: 130,
      marker: 'EVIDENCE_STAGE=database-paused',
      signal: 'SIGINT',
    },
    SIGTERM_DURING_RECOVERY: {
      exitCode: 143,
      marker: 'EVIDENCE_STAGE=database-recovery-polling',
      signal: 'SIGTERM',
    },
    FALSE_READY_DURING_OUTAGE: { exitCode: 1 },
  }[fault];
  if (!expected) throw new Error('B2 failure rehearsal is invalid');
  const child = spawn(process.execPath, [__filename, '--internal-live-run'], {
    cwd: context.repositoryRoot,
    env: {
      ...context.childEnvironment,
      [INTERNAL_SUITE_DESCRIPTOR_KEY]: context.descriptorPath,
      [FAULT_INJECTION_KEY]: fault,
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  context.childTracker.add(child);
  const stdout = [];
  const stderr = [];
  let sent = false;
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => {
    stderr.push(Buffer.from(chunk));
    if (
      expected.marker &&
      !sent &&
      Buffer.concat(stderr).toString('utf8').includes(expected.marker)
    ) {
      sent = true;
      child.send({ type: 'PRD3_G01_B2_TEST_SIGNAL', signal: expected.signal });
    }
  });
  const lifecycle = new Promise((resolve) => child.once('close', (code) => resolve(code)));
  let timer;
  const outcome = await Promise.race([
    lifecycle,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), 360_000);
    }),
  ]);
  if (timer) clearTimeout(timer);
  if (outcome === 'timeout') {
    await b1.terminateChildProcess(child);
    context.childTracker.remove(child);
    throw new Error('B2 failure rehearsal exceeded its bounded deadline');
  }
  context.childTracker.remove(child);
  if (child.connected) child.disconnect();
  const output = `${Buffer.concat(stdout)}\n${Buffer.concat(stderr)}`;
  if (
    outcome !== expected.exitCode ||
    (expected.marker && !sent) ||
    /SUMMARY_PATH=/u.test(output) ||
    !/FAILURE_CLEANUP_VERIFIED=true/u.test(output) ||
    !/FAILURE_TRACKED_CHILDREN=0/u.test(output)
  ) {
    throw new Error('B2 failure rehearsal did not fail closed');
  }
  await auditGateResources(
    context.childEnvironment,
    context.childTracker,
    context.sensitiveValues,
  );
  return {
    fault,
    exitCode: outcome,
    proofId:
      fault === 'SIGINT_DURING_OUTAGE'
        ? 'sigint-rehearsal'
        : fault === 'SIGTERM_DURING_RECOVERY'
          ? 'sigterm-rehearsal'
          : 'false-ready-rehearsal',
  };
}

async function runFailureRehearsals(context) {
  b1.assertExactNodeVersion();
  const results = [];
  for (const [index, fault] of [
    'SIGINT_DURING_OUTAGE',
    'SIGTERM_DURING_RECOVERY',
    'FALSE_READY_DURING_OUTAGE',
  ].entries()) {
    results.push(await runRehearsal(context, fault));
    process.stdout.write(`REHEARSAL_${index + 1}=PASS\n`);
  }
  return Object.freeze({
    results: Object.freeze(results),
    proofIds: Object.freeze(results.map((result) => result.proofId)),
  });
}

if (require.main === module) {
  const mode = process.argv[2];
  const operation =
    mode === '--final-suite'
      ? runFinalSuite()
      : mode === '--internal-live-run'
        ? runLiveEvidence()
        : Promise.reject(new Error('B2 command mode is invalid'));
  operation.catch((error) => {
    const finalization = error?.finalization;
    if (finalization) {
      let cleanupVerified = false;
      try {
        cleanupVerified = validateCleanupEvidence(finalization.cleanup);
      } catch {}
      process.stderr.write(`FAILURE_CLEANUP_VERIFIED=${cleanupVerified}\n`);
      process.stderr.write(
        `FAILURE_TRACKED_CHILDREN=${finalization.cleanup.trackedChildrenRemaining}\n`,
      );
      process.stderr.write(
        `FAILURE_SCRATCH_FILES=${finalization.cleanup.scratchFilesRemaining}\n`,
      );
    }
    if (/^[a-z0-9-]+$/u.test(error?.failureStage ?? '')) {
      process.stderr.write(`FAILURE_STAGE=${error.failureStage}\n`);
    }
    if (/^[A-Za-z0-9 .:_-]{1,160}$/u.test(error?.primaryReason ?? '')) {
      process.stderr.write(`FAILURE_REASON=${error.primaryReason}\n`);
    }
    if (Array.isArray(finalization?.failures) && finalization.failures.length) {
      process.stderr.write(
        `FAILURE_FINALIZATION=${finalization.failures.join(',').slice(0, 300)}\n`,
      );
    }
    if (Array.isArray(error?.cleanupFailures) && error.cleanupFailures.length) {
      process.stderr.write(
        `FAILURE_FINAL_SUITE_CLEANUP=${error.cleanupFailures.join(',').slice(0, 300)}\n`,
      );
    }
    process.stderr.write('PRD3-G01-B2 evidence failed after sanitized cleanup\n');
    if (process.connected) process.disconnect();
    if (!process.exitCode) process.exitCode = 1;
  });
}

module.exports = {
  ACTIVITY_SQL,
  AUTHORIZED_PATHS,
  BASE_SHA,
  EXPECTED_PRISMA_VERSION,
  EXPECTED_NODE_VERSION,
  EXPECTED_ROLE_SETTINGS,
  FAULT_MATRIX,
  GATE,
  GATE_LABEL,
  OCI_REVISION_LABEL,
  PACKAGE_LOCK_LABEL,
  RUNTIME_MANIFEST_LABEL,
  MINIO_IMAGE,
  POSTGRES_IMAGE,
  REDIS_IMAGE,
  ROLE_APPLICATION_NAMES,
  ROLE_KEYS,
  RUN_LABEL,
  SCENARIOS,
  SOURCE_COMMIT_LABEL,
  SOURCE_TREE_LABEL,
  SUMMARY_SCHEMA_VERSION,
  TERMINATE_SQL,
  assertScenarioName,
  approvedNodeToolCommand,
  atomicPublishSummary,
  buildCanonicalDockerBuildArgs,
  buildDatabasePolicyEnvironment,
  buildMinioRunArgs,
  buildNetworkCreateArgs,
  buildPostgresRunArgs,
  buildRedisRunArgs,
  buildRuntimeProvenanceLabels,
  buildRuntimeVerificationArgs,
  classifyStartupUnavailable,
  countSessionsByRole,
  createB2Finalizer,
  createOwned,
  createOwnershipLabels,
  initializeObserver,
  loadCompiledDatabaseRuntimePolicy,
  observeActivity,
  parseCanonicalBaseImage,
  parseActivityRows,
  parseFaultCoverageMarker,
  parseImageInspection,
  parseProbeResult,
  parseRuntimeManifestVerification,
  parseRuntimeIdentity,
  pausePostgres,
  requiredRuntimeLabels,
  requireLocalImageInspection,
  runtimeManifestVerificationScript,
  sessionIdentity,
  unpausePostgres,
  validateCleanupEvidence,
  validateFaultCoverage,
  validateFaultInjection,
  validateLogTransitions,
  validateManagementProbe,
  validatePoolLimits,
  validatePublicHealth,
  validateReadinessBurst,
  validateRequiredRunResults,
  validateResponseBody,
  validateRuntimeIdentity,
  validateSessionRecovery,
  validateSummary,
  validateRuntimeProvenance,
};
