'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const EXPECTED_NODE_VERSION = 'v22.23.1';
const EXPECTED_PRISMA_VERSION = '6.19.3';
const POSTGRES_IMAGE = 'postgres:16-alpine';
const POSTGRES_MAX_CONNECTIONS = 80;
const OBSERVER_APPLICATION_NAME = 'moazez-prd3-g01-b-observer';
const ROLE_APPLICATION_NAMES = Object.freeze({
  api: 'moazez-api',
  'core-worker': 'moazez-core-worker',
  'media-worker': 'moazez-media-worker',
});
const OBSERVATION_SQL = `
  SELECT application_name, state, wait_event_type, wait_event, backend_start
  FROM pg_stat_activity
  WHERE application_name IN (
    'moazez-api',
    'moazez-core-worker',
    'moazez-media-worker'
  )
  ORDER BY application_name, backend_start
`;
const ROLE_KEYS = Object.freeze(Object.keys(ROLE_APPLICATION_NAMES));
const DEFAULT_CHILD_TIMEOUT_MS = 30_000;
const MAX_CAPTURE_BYTES = 64 * 1024;
const CHILD_TERMINATION_GRACE_MS = 1500;
const CHILD_FORCE_KILL_REAP_MS = 3000;
const PROCESS_TREE_COMMAND_TIMEOUT_MS = 5000;
const PRISMA_CONNECT_TIMEOUT_MS = 15_000;
const PRISMA_QUERY_TIMEOUT_MS = 15_000;
const PRISMA_SAMPLER_QUERY_TIMEOUT_MS = 4000;
const PRISMA_DISCONNECT_GRACE_MS = 5000;
const PRISMA_DISCONNECT_RETRY_MS = 5000;
const SCENARIO_TEARDOWN_TIMEOUT_MS = 20_000;
const SIGNAL_REHEARSAL_TIMEOUT_MS = 45_000;
const EVIDENCE_GATE = 'PRD3-G01-B1';
const EVIDENCE_GATE_LABEL = 'com.moazez.evidence.gate';
const EVIDENCE_RUN_LABEL = 'com.moazez.evidence.run';
const LOCAL_DOCKER_TRANSPORTS = Object.freeze(['npipe', 'unix']);
const MINIMAL_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'APPDATA',
  'COMSPEC',
  'HOME',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'WINDIR',
]);
const DOCKER_RESOURCE_STATE = Object.freeze({
  EXISTS: 'EXISTS',
  ABSENT: 'ABSENT',
  INSPECTION_FAILED: 'INSPECTION_FAILED',
});
const EVIDENCE_PHASE = Object.freeze({
  PREFLIGHT: 'PREFLIGHT',
  READY: 'READY',
  RUNNING: 'RUNNING',
  INTERRUPTED: 'INTERRUPTED',
  FINALIZING: 'FINALIZING',
  FINALIZED: 'FINALIZED',
  FAILED: 'FAILED',
});
const EVIDENCE_PHASE_ORDER = Object.freeze([
  EVIDENCE_PHASE.PREFLIGHT,
  EVIDENCE_PHASE.READY,
  EVIDENCE_PHASE.RUNNING,
  EVIDENCE_PHASE.INTERRUPTED,
  EVIDENCE_PHASE.FINALIZING,
  EVIDENCE_PHASE.FINALIZED,
  EVIDENCE_PHASE.FAILED,
]);
const PRISMA_DISCONNECT_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  REJECTED: 'REJECTED',
  TIMED_OUT: 'TIMED_OUT',
});
const ALLOWED_FAULT_INJECTIONS = Object.freeze([
  'NONE',
  'FAIL_AFTER_READINESS',
  'SIGINT_DURING_ACTIVE_MEASUREMENT',
  'SIGTERM_DURING_FINALIZATION',
]);
const LIVE_REHEARSAL_FAULTS = Object.freeze(
  ALLOWED_FAULT_INJECTIONS.filter((value) => value !== 'NONE'),
);
const FAULT_INJECTION_ENVIRONMENT_KEY = 'PRD3_G01_B1_FAULT_INJECTION';
const FAULT_MATRIX = Object.freeze(
  [
    [
      'F01',
      'remote DOCKER_HOST',
      'reject before Docker command',
      'remote DOCKER_HOST is rejected before commands',
    ],
    [
      'F02',
      'remote Docker context',
      'reject before daemon verification',
      'remote Docker context is rejected before daemon commands',
    ],
    [
      'F03',
      'conflicting Docker selectors',
      'reject synchronously',
      'conflicting Docker selectors are rejected without commands',
    ],
    [
      'F04',
      'missing local PostgreSQL image',
      'block before mutation',
      'missing image blocks before network mutation',
    ],
    [
      'F05',
      'malformed image ID',
      'fail image gate',
      'immutable Docker image parser rejects malformed output',
    ],
    [
      'F06',
      'network-create failure',
      'reconcile exact owned state',
      'failed network creation runs ownership reconciliation',
    ],
    [
      'F07',
      'same-name unowned network',
      'deny deletion',
      'failed creation cannot delete an unowned same-name resource',
    ],
    [
      'F08',
      'container-create failure',
      'reconcile exact owned state',
      'failed container creation runs ownership reconciliation',
    ],
    [
      'F09',
      'same-name unowned container',
      'deny deletion',
      'failed creation cannot delete an unowned same-name resource',
    ],
    [
      'F10',
      'bridge metadata mismatch',
      'reject before attachment',
      'built-in bridge metadata is verified before attachment',
    ],
    [
      'F11',
      'published-port discovery timeout',
      'bounded evidence failure',
      'bounded operation classifies published-port timeout',
    ],
    [
      'F12',
      'PostgreSQL readiness timeout',
      'bounded evidence failure',
      'abort-aware polling has a deterministic deadline',
    ],
    [
      'F13',
      'Prisma connect timeout',
      'retain client and finalize',
      'Prisma connect is bounded and disables PASS on timeout',
    ],
    [
      'F14',
      'observer query hang',
      'bounded evidence failure',
      'never-resolving observer query times out',
    ],
    [
      'F15',
      'sampler query hang',
      'bounded sampler failure',
      'never-resolving sampler query and stop are bounded',
    ],
    [
      'F16',
      'sleeper rejection',
      'scenario fails and finalizes',
      'rejected sleeper disables PASS and reaches finalizer',
    ],
    [
      'F17',
      'sleeper never resolves',
      'bounded teardown failure',
      'never-resolving sleeper teardown is bounded',
    ],
    [
      'F18',
      'P2024 mismatch',
      'exact-code failure',
      'P2024 classifier rejects mismatched errors',
    ],
    [
      'F19',
      'session-count overshoot',
      'sampled overshoot failure',
      'sampler records overshoot before failing closed',
    ],
    [
      'F20',
      'recovery query failure',
      'scenario failure',
      'recovery query failure disables PASS',
    ],
    [
      'F21',
      'scenario-local disconnect rejection',
      'retain client for retry',
      'rejected local disconnect leaves client tracked',
    ],
    [
      'F22',
      'scenario-local disconnect timeout',
      'retain client for retry',
      'timed-out local disconnect leaves client tracked',
    ],
    [
      'F23',
      'final disconnect rejection',
      'cleanup continues and PASS denied',
      'finalizer continues after disconnect rejection',
    ],
    [
      'F24',
      'final disconnect never resolves',
      'bounded retry and PASS denied',
      'never-resolving final disconnect is bounded',
    ],
    [
      'F25',
      'disconnect succeeds only on retry',
      'phase-two success',
      'two-phase disconnect retry can resolve a client',
    ],
    [
      'F26',
      'child ignores graceful termination',
      'force-kill and reap',
      'SIGTERM-resistant child is force-killed',
    ],
    [
      'F27',
      'child has a surviving grandchild',
      'tree kill and verify',
      'process-tree termination removes a grandchild',
    ],
    [
      'F28',
      'Docker daemon fails during cleanup inspection',
      'INSPECTION_FAILED',
      'Docker inspection failure cannot mean absence',
    ],
    [
      'F29',
      'Docker deletion fails',
      'cleanup failure and PASS denied',
      'Docker deletion failure is collected by finalizer',
    ],
    [
      'F30',
      'renamed resource retains current-run labels',
      'label-sweep failure',
      'renamed current-run resource fails cleanup',
    ],
    [
      'F31',
      'signal during active measurement',
      'exit 130 and no summary',
      'signal latch wins over a prior main continuation',
    ],
    [
      'F32',
      'signal during ordinary finalization',
      'join finalizer and preserve signal',
      'signal during finalization disables PASS',
    ],
    [
      'F33',
      'signal before summary write',
      'no scratch or summary',
      'signal immediately before summary creation forbids PASS',
    ],
    [
      'F34',
      'signal during scratch summary write',
      'remove partial evidence',
      'signal during scratch write removes partial evidence',
    ],
    [
      'F35',
      'summary validation failure',
      'no retained summary',
      'schema validation failure forbids retained evidence',
    ],
    [
      'F36',
      'summary rename failure',
      'remove scratch and fail',
      'atomic rename failure removes scratch evidence',
    ],
    [
      'F37',
      'summary hash failure',
      'remove retained summary and fail',
      'summary hash failure removes retained evidence',
    ],
    [
      'F38',
      'second live run failure',
      'overall BLOCKED',
      'failure rehearsal runner requires every configured run',
    ],
  ].map((entry) => Object.freeze(entry)),
);
const childLifecycleStates = new WeakMap();
const childTerminationPromises = new WeakMap();

class EvidenceState {
  constructor(options = {}) {
    this.phase = EVIDENCE_PHASE.PREFLIGHT;
    this.interrupted = false;
    this.firstSignal = null;
    this.requestedExitCode = 0;
    this.abortController = options.abortController ?? new AbortController();
    this.finalizationPromise = null;
    this.summaryEligibility = true;
    this.summaryPath = null;
    this.trackedPrismaClients = options.trackedPrismaClients ?? new Set();
    this.trackedChildProcesses = options.trackedChildProcesses ?? new Set();
    this.ownedDockerResources = options.ownedDockerResources ?? new Map();
    this.cleanupFailures = [];
    this.evidenceFailures = [];
    this.scratchPaths = new Set();
    this.retainedSummaryPaths = new Set();
    this.signalPromise = new Promise((resolve) => {
      this.resolveSignal = resolve;
    });
  }

  transition(nextPhase) {
    const current = EVIDENCE_PHASE_ORDER.indexOf(this.phase);
    const next = EVIDENCE_PHASE_ORDER.indexOf(nextPhase);
    if (next < 0 || next < current) {
      throw new Error('Evidence state transition is not monotonic');
    }
    this.phase = nextPhase;
    return this.phase;
  }

  disableSummary(reason, category = 'evidence') {
    this.summaryEligibility = false;
    const target =
      category === 'cleanup' ? this.cleanupFailures : this.evidenceFailures;
    if (reason && !target.includes(reason)) target.push(reason);
  }

  latchSignal(signal) {
    if (this.firstSignal) return false;
    if (!['SIGINT', 'SIGTERM'].includes(signal)) {
      throw new Error('Evidence signal is invalid');
    }
    this.interrupted = true;
    this.firstSignal = signal;
    this.requestedExitCode = signal === 'SIGINT' ? 130 : 143;
    this.summaryEligibility = false;
    if (
      EVIDENCE_PHASE_ORDER.indexOf(this.phase) <
      EVIDENCE_PHASE_ORDER.indexOf(EVIDENCE_PHASE.INTERRUPTED)
    ) {
      this.transition(EVIDENCE_PHASE.INTERRUPTED);
    }
    this.abortController.abort();
    this.resolveSignal(signal);
    return true;
  }

  assertSummaryEligible() {
    if (
      !this.summaryEligibility ||
      this.interrupted ||
      this.evidenceFailures.length !== 0 ||
      this.cleanupFailures.length !== 0
    ) {
      throw new Error('PASS summary is not eligible');
    }
  }
}

function assertExactNodeVersion(version = process.version) {
  if (version !== EXPECTED_NODE_VERSION) {
    throw new Error('Approved Node runtime is not active');
  }
  return version;
}

function validateFaultInjection(value) {
  const normalized =
    value === undefined || value === '' ? 'NONE' : String(value);
  if (!ALLOWED_FAULT_INJECTIONS.includes(normalized)) {
    throw new Error('Fault-injection selector is invalid');
  }
  return normalized;
}

function createOperationTimeoutError(label) {
  const error = new Error(`${label} exceeded its bounded deadline`);
  error.operationTimedOut = true;
  return error;
}

function createOperationAbortError(label) {
  const error = new Error(`${label} was aborted`);
  error.operationAborted = true;
  return error;
}

async function withDeadline(label, operation, options = {}) {
  const timeoutMs = options.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('Bounded operation deadline is invalid');
  }
  const signal = options.signal;
  if (signal?.aborted) throw createOperationAbortError(label);
  const started = process.hrtime.bigint();
  let timeout;
  let abortListener;
  const operationPromise = Promise.resolve().then(operation);
  void operationPromise.catch(() => undefined);
  const races = [
    operationPromise.then(
      (value) => ({ type: 'success', value }),
      (error) => ({ type: 'rejected', error }),
    ),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    }),
  ];
  if (signal) {
    races.push(
      new Promise((resolve) => {
        abortListener = () => resolve({ type: 'abort' });
        signal.addEventListener('abort', abortListener, { once: true });
      }),
    );
  }
  try {
    const result = await Promise.race(races);
    if (result.type === 'timeout') throw createOperationTimeoutError(label);
    if (result.type === 'abort') throw createOperationAbortError(label);
    if (result.type === 'rejected') throw result.error;
    return Object.freeze({
      value: result.value,
      elapsedMs: Math.round(monotonicMilliseconds(started)),
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortListener) signal.removeEventListener('abort', abortListener);
  }
}

async function runBoundedPrismaOperation(label, operation, options = {}) {
  return (
    await withDeadline(label, operation, {
      timeoutMs: options.timeoutMs ?? PRISMA_QUERY_TIMEOUT_MS,
      signal: options.signal,
    })
  ).value;
}

function assertNotInterrupted(state) {
  if (state?.interrupted || state?.abortController.signal.aborted) {
    throw createOperationAbortError('Evidence operation');
  }
}

async function pollWithDeadline(options) {
  const started = process.hrtime.bigint();
  while (monotonicMilliseconds(started) < options.timeoutMs) {
    assertNotInterrupted(options.state);
    if (await options.predicate()) return true;
    await withDeadline('Polling interval', () => delay(options.intervalMs), {
      timeoutMs: options.intervalMs + 1000,
      signal: options.state?.abortController.signal,
    });
  }
  throw createOperationTimeoutError(options.label);
}

function sanitizeResourceSuffix(value) {
  const sanitized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 32)
    .replace(/-+$/gu, '');
  if (!sanitized) throw new Error('Docker resource suffix is invalid');
  return sanitized;
}

function createResourceSuffix() {
  return sanitizeResourceSuffix(
    `${Date.now().toString(36)}-${process.pid.toString(36)}-${randomBytes(5).toString('hex')}`,
  );
}

function readEnvironmentValueCaseInsensitive(environment, expectedKey) {
  const matches = Object.entries(environment).filter(
    ([key]) => key.toLowerCase() === expectedKey.toLowerCase(),
  );
  if (matches.length === 0) {
    return Object.freeze({ present: false, value: undefined });
  }
  const values = [...new Set(matches.map(([, value]) => String(value ?? '')))];
  if (values.length !== 1) {
    throw new Error('Environment selector values are contradictory');
  }
  return Object.freeze({ present: true, value: values[0] });
}

function parseLocalDockerEndpoint(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new Error('Docker endpoint is not an approved local transport');
  }
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/iu.exec(value);
  if (!schemeMatch) {
    throw new Error('Docker endpoint is not an approved local transport');
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === 'unix') {
    const socketMatch = /^unix:\/\/(\/(?!\/)[^?#\r\n]+)$/iu.exec(value);
    if (!socketMatch || !path.posix.isAbsolute(socketMatch[1])) {
      throw new Error('Docker endpoint is not an approved local transport');
    }
    return Object.freeze({
      endpoint: `unix://${socketMatch[1]}`,
      transport: 'unix',
    });
  }
  if (scheme === 'npipe') {
    const localPipe =
      /^npipe:\/\/\/\/\.\/pipe\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/iu;
    if (!localPipe.test(value)) {
      throw new Error('Docker endpoint is not an approved local transport');
    }
    return Object.freeze({
      endpoint: `npipe:${value.slice(value.indexOf(':') + 1)}`,
      transport: 'npipe',
    });
  }
  throw new Error('Docker endpoint is not an approved local transport');
}

function inspectDockerSelectorEnvironment(environment = process.env) {
  const dockerHost = readEnvironmentValueCaseInsensitive(
    environment,
    'DOCKER_HOST',
  );
  const dockerContext = readEnvironmentValueCaseInsensitive(
    environment,
    'DOCKER_CONTEXT',
  );
  if (dockerHost.present && !dockerHost.value) {
    throw new Error('Docker endpoint selector is empty');
  }
  if (dockerContext.present && !dockerContext.value) {
    throw new Error('Docker context selector is empty');
  }
  if (dockerHost.present && dockerContext.present) {
    throw new Error('Docker endpoint selectors are contradictory');
  }
  return Object.freeze({ dockerHost, dockerContext });
}

function buildMinimalChildEnvironment(environment = process.env, options = {}) {
  const output = {};
  for (const key of MINIMAL_CHILD_ENVIRONMENT_KEYS) {
    const entry = readEnvironmentValueCaseInsensitive(environment, key);
    if (entry.present && entry.value) output[key] = entry.value;
  }
  if (options.dockerContext) output.DOCKER_CONTEXT = options.dockerContext;
  if (options.pinnedDockerEndpoint) {
    output.DOCKER_HOST = options.pinnedDockerEndpoint;
  }
  return output;
}

function parseDockerContextName(output) {
  const lines = String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    lines.length !== 1 ||
    lines[0].length > 128 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(lines[0])
  ) {
    throw new Error('Docker context selection is invalid');
  }
  return lines[0];
}

function parseDockerContextInspection(output) {
  let parsed;
  try {
    parsed = JSON.parse(String(output));
  } catch {
    throw new Error('Docker context inspection is invalid');
  }
  const endpoint = parsed?.[0]?.Endpoints?.docker?.Host;
  if (parsed.length !== 1 || typeof endpoint !== 'string') {
    throw new Error('Docker context inspection is invalid');
  }
  return endpoint;
}

function parsePublishedPort(output) {
  const lines = String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error('Published port mapping is invalid');
  const match = /^127\.0\.0\.1:(\d{1,5})$/u.exec(lines[0]);
  const port = match ? Number(match[1]) : 0;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Published port mapping is invalid');
  }
  return port;
}

function parsePublishedPortInspection(output) {
  const invalid = (code) => {
    const error = new Error('Published port inspection is invalid');
    error.portInspectionCode = code;
    return error;
  };
  let ports;
  try {
    ports = JSON.parse(String(output));
  } catch {
    throw invalid('invalid-json');
  }
  const mappings = ports?.['5432/tcp'];
  if (!Array.isArray(mappings)) throw invalid('mapping-absent');
  if (mappings.length !== 1) {
    throw invalid(mappings.length === 0 ? 'mapping-empty' : 'mapping-multiple');
  }
  if (
    typeof mappings[0]?.HostIp !== 'string' ||
    typeof mappings[0]?.HostPort !== 'string'
  ) {
    throw invalid('mapping-fields');
  }
  try {
    return parsePublishedPort(`${mappings[0].HostIp}:${mappings[0].HostPort}`);
  } catch {
    throw invalid('mapping-value');
  }
}

function isExactP2024(error, KnownRequestErrorClass) {
  return (
    typeof KnownRequestErrorClass === 'function' &&
    error instanceof KnownRequestErrorClass &&
    error.code === 'P2024'
  );
}

function timeoutWindow(poolTimeoutSeconds) {
  if (!Number.isInteger(poolTimeoutSeconds) || poolTimeoutSeconds < 1) {
    throw new Error('Pool timeout must be a positive integer');
  }
  return Object.freeze({
    minimumMs: poolTimeoutSeconds * 1000 - 750,
    maximumMs: poolTimeoutSeconds * 1000 + 5000,
  });
}

function validateRoleObservation(counts, limits, options = {}) {
  let runtimeTotal = 0;
  for (const role of ROLE_KEYS) {
    const count = counts[role];
    const limit = limits[role];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Role observation is invalid for ${role}`);
    }
    if (!Number.isInteger(limit) || limit < 1 || count > limit) {
      throw new Error(
        `Role observation exceeds the approved limit for ${role}`,
      );
    }
    if (options.requireExact && count !== limit) {
      throw new Error(
        `Role observation does not equal the expected limit for ${role}`,
      );
    }
    runtimeTotal += count;
  }
  if (options.totalLimit !== undefined && runtimeTotal > options.totalLimit) {
    throw new Error('Runtime observation exceeds the approved total');
  }
  return runtimeTotal;
}

function validateAggregateBudget(observed, expected) {
  const calculatedTotal = validateRoleObservation(
    observed.roleCounts,
    expected.roleCounts,
    { requireExact: true, totalLimit: expected.runtimeTotal },
  );
  if (
    observed.runtimeTotal !== calculatedTotal ||
    observed.runtimeTotal !== expected.runtimeTotal ||
    observed.sampledOvershootObserved !== false
  ) {
    throw new Error('Aggregate runtime budget evidence is invalid');
  }
  return true;
}

function validateCutbackResult(result) {
  for (const role of ROLE_KEYS) {
    const evidence = result[role];
    if (
      !evidence ||
      evidence.configuredLimit !== 1 ||
      evidence.observedMaximum !== 1 ||
      evidence.configuredPoolTimeoutSeconds !== 1 ||
      evidence.observedErrorCode !== 'P2024' ||
      !Number.isInteger(evidence.timeoutElapsedMs) ||
      evidence.timeoutElapsedMs < timeoutWindow(1).minimumMs ||
      evidence.timeoutElapsedMs > timeoutWindow(1).maximumMs ||
      evidence.recovered !== true ||
      evidence.sessionsAfterDisconnect !== 0
    ) {
      throw new Error(`Cutback evidence is invalid for ${role}`);
    }
  }
  return true;
}

function validateCleanupResult(result) {
  if (
    result.exactNameContainersRemaining !== 0 ||
    result.exactNameNetworksRemaining !== 0 ||
    result.currentRunLabeledContainersRemaining !== 0 ||
    result.currentRunLabeledNetworksRemaining !== 0 ||
    result.scratchFilesRemaining !== 0 ||
    result.retainedSanitizedSummaryFiles !== 1 ||
    result.inspectionVerified !== true
  ) {
    throw new Error('Cleanup evidence is incomplete or resources remain');
  }
  return true;
}

function validateSummarySchemaV5(summary) {
  if (
    !summary ||
    summary.schemaVersion !== 5 ||
    summary.gate !== EVIDENCE_GATE ||
    summary.overall !== 'PASS' ||
    summary.interrupted !== false ||
    summary.firstSignal !== null ||
    summary.requestedExitCode !== 0 ||
    summary.nodeVersion !== EXPECTED_NODE_VERSION ||
    summary.prismaVersion !== EXPECTED_PRISMA_VERSION ||
    summary.postgresMajor !== 16 ||
    summary.postgresMaxConnections !== POSTGRES_MAX_CONNECTIONS ||
    !/^sha256:[a-f0-9]{64}$/u.test(summary.postgresImageId ?? '') ||
    !LOCAL_DOCKER_TRANSPORTS.includes(summary.dockerEndpointTransport) ||
    summary.loopbackBridgeAttachmentUsed !== true ||
    summary.postgresImageIdentityVerified !== true ||
    summary.trackedPrismaClientsRemaining !== 0 ||
    summary.prismaDisconnectFailures !== 0 ||
    summary.trackedChildrenRemaining !== 0
  ) {
    throw new Error('Summary schema version 5 is invalid');
  }
  const expectedRoleSettings = {
    api: { limit: 5, poolTimeoutSeconds: 5 },
    'core-worker': { limit: 6, poolTimeoutSeconds: 10 },
    'media-worker': { limit: 3, poolTimeoutSeconds: 10 },
  };
  for (const role of ROLE_KEYS) {
    const measured = summary.roleSaturation?.[role];
    const expected = expectedRoleSettings[role];
    const window = timeoutWindow(expected.poolTimeoutSeconds);
    if (
      measured?.configuredLimit !== expected.limit ||
      measured?.observedMaximum !== expected.limit ||
      measured?.configuredPoolTimeoutSeconds !== expected.poolTimeoutSeconds ||
      measured?.observedErrorCode !== 'P2024' ||
      measured?.recovered !== true ||
      measured?.sessionsAfterDisconnect !== 0 ||
      !Number.isInteger(measured?.timeoutElapsedMs) ||
      measured.timeoutElapsedMs < window.minimumMs ||
      measured.timeoutElapsedMs > window.maximumMs
    ) {
      throw new Error(`Summary role evidence is invalid for ${role}`);
    }
  }
  validateAggregateBudget(
    {
      roleCounts: {
        api: summary.aggregate?.api,
        'core-worker': summary.aggregate?.coreWorker,
        'media-worker': summary.aggregate?.mediaWorker,
      },
      runtimeTotal: summary.aggregate?.runtimeTotal,
      sampledOvershootObserved: summary.aggregate?.sampledOvershootObserved,
    },
    {
      roleCounts: { api: 20, 'core-worker': 12, 'media-worker': 6 },
      runtimeTotal: 38,
    },
  );
  validateCutbackResult(summary.cutback);
  validateCleanupResult(summary.cleanup);
  return true;
}

function validateDockerCleanupResult(result) {
  if (
    result.exactNameContainersRemaining !== 0 ||
    result.exactNameNetworksRemaining !== 0 ||
    result.currentRunLabeledContainersRemaining !== 0 ||
    result.currentRunLabeledNetworksRemaining !== 0 ||
    result.inspectionVerified !== true
  ) {
    throw new Error('Owned Docker resources remain after cleanup');
  }
  return true;
}

function redactText(value, sensitiveValues = []) {
  let redacted = String(value ?? '');
  const values = [...new Set(sensitiveValues.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  for (const sensitiveValue of values) {
    redacted = redacted.split(sensitiveValue).join('[REDACTED]');
  }
  return redacted
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s"'<>]+/giu, '[REDACTED_URL]')
    .replace(
      /\bhttps?:\/\/[^\s"'<>]*:[^\s"'<>]*@[^\s"'<>]+/giu,
      '[REDACTED_URL]',
    );
}

function assertSanitizedSummary(summary, sensitiveValues = []) {
  const forbiddenKeys = new Set([
    'certificatepath',
    'connectionstring',
    'contextmetadata',
    'databaseurl',
    'databasename',
    'dockerendpoint',
    'dockerhost',
    'endpoint',
    'environment',
    'environmentdump',
    'host',
    'hostname',
    'hostport',
    'password',
    'port',
    'querystring',
    'socketpath',
    'url',
    'username',
  ]);
  const visit = (value, key = '') => {
    if (Array.isArray(value)) {
      value.forEach((nested) => visit(nested, key));
      return;
    }
    if (typeof value === 'string') {
      if (
        /\b(?:postgres(?:ql)?|redis(?:s)?|tcp|ssh|https?|unix|npipe):\/\//iu.test(
          value,
        ) ||
        /\\\\\.\\pipe\\/iu.test(value) ||
        /\/(?:[^/\s]+\/)*[^/\s]*(?:\.sock|socket)\b/iu.test(value) ||
        /\b(?:localhost|\d{1,3}(?:\.\d{1,3}){3})\b/iu.test(value) ||
        /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|local)\b/iu.test(
          value,
        ) ||
        /(?:^|[\\/])[^\\/]+\.(?:pem|crt|key)$/iu.test(value)
      ) {
        throw new Error('Summary contains endpoint or credential material');
      }
      if (
        key === 'dockerendpointtransport' &&
        !LOCAL_DOCKER_TRANSPORTS.includes(value)
      ) {
        throw new Error('Summary Docker endpoint transport is invalid');
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [nestedKey, nested] of Object.entries(value)) {
      const normalizedKey = nestedKey.replace(/[^a-z0-9]/giu, '').toLowerCase();
      if (forbiddenKeys.has(normalizedKey)) {
        throw new Error('Summary contains a forbidden sensitive field');
      }
      visit(nested, normalizedKey);
    }
  };
  visit(summary);
  const serialized = JSON.stringify(summary);
  if (/\b(?:postgres(?:ql)?|redis(?:s)?):\/\//iu.test(serialized)) {
    throw new Error('Summary contains a connection URL');
  }
  for (const sensitiveValue of sensitiveValues.filter(Boolean)) {
    if (serialized.includes(sensitiveValue)) {
      throw new Error('Summary contains synthetic sensitive input');
    }
  }
  return true;
}

class CleanupManager {
  constructor() {
    this.actions = [];
    this.cleanupPromise = null;
  }

  add(label, action) {
    if (this.cleanupPromise) {
      throw new Error('Cleanup is already in progress');
    }
    this.actions.push({ label, action });
  }

  run() {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = (async () => {
      const failures = [];
      for (const item of [...this.actions].reverse()) {
        try {
          await item.action();
        } catch {
          failures.push(item.label);
        }
      }
      return Object.freeze({ ok: failures.length === 0, failures });
    })();
    return this.cleanupPromise;
  }
}

class ChildProcessTracker {
  constructor(options = {}) {
    this.children = new Set();
    this.terminationOptions = {
      graceMs: options.graceMs ?? CHILD_TERMINATION_GRACE_MS,
      forceReapMs: options.forceReapMs ?? CHILD_FORCE_KILL_REAP_MS,
      sendGracefulTermination: options.sendGracefulTermination,
      sendForceKill: options.sendForceKill,
    };
  }

  add(child) {
    this.children.add(child);
  }

  remove(child) {
    this.children.delete(child);
  }

  async terminateAll() {
    const children = [...this.children];
    const reports = await Promise.all(
      children.map((child) =>
        terminateChildProcess(child, this.terminationOptions),
      ),
    );
    children.forEach((child, index) => {
      if (reports[index].reaped) this.remove(child);
    });
    if (reports.some((report) => !report.reaped)) {
      throw new Error('Tracked child process termination did not complete');
    }
    return reports;
  }
}

function isChildExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function getChildLifecycleState(child) {
  const existing = childLifecycleStates.get(child);
  if (existing) return existing;

  let resolveOutcome;
  const state = {
    settled: false,
    outcome: null,
    promise: new Promise((resolve) => {
      resolveOutcome = resolve;
    }),
  };
  const settle = (outcome) => {
    if (state.settled) return;
    state.settled = true;
    state.outcome = outcome;
    child.removeListener('error', onError);
    child.removeListener('close', onClose);
    resolveOutcome(outcome);
  };
  const onError = () => settle({ code: 1, signal: null, spawnError: true });
  const onClose = (code, signal) => settle({ code, signal, spawnError: false });
  child.once('error', onError);
  child.once('close', onClose);
  if (isChildExited(child)) {
    settle({
      code: child.exitCode,
      signal: child.signalCode,
      spawnError: false,
    });
  }
  childLifecycleStates.set(child, state);
  return state;
}

async function waitForChildOutcome(state, timeoutMs) {
  if (state.settled) return { completed: true, outcome: state.outcome };
  let timeout;
  try {
    return await Promise.race([
      state.promise.then((outcome) => ({ completed: true, outcome })),
      new Promise((resolve) => {
        timeout = setTimeout(
          () => resolve({ completed: false, outcome: null }),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sendChildSignal(child, signal) {
  if (isChildExited(child)) return false;
  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

function runUntrackedTerminationCommand(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    let timer;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(ok);
    };
    try {
      child = spawn(command, args, {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }
    child.once('error', () => finish(false));
    child.once('close', (code) => finish(code === 0 || code === 128));
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // The bounded caller treats an unreaped helper as a failed attempt.
      }
      finish(false);
    }, timeoutMs);
  });
}

async function sendProcessTreeTermination(child, force) {
  if (isChildExited(child)) return false;
  const pid = child.pid;
  if (!Number.isInteger(pid) || pid < 1) return false;
  const plan = buildProcessTreeTerminationPlan(process.platform, pid, force);
  if (plan.kind === 'windows-tree-command') {
    return runUntrackedTerminationCommand(
      plan.command,
      plan.args,
      PROCESS_TREE_COMMAND_TIMEOUT_MS,
    );
  }
  try {
    process.kill(plan.processGroupId, plan.signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return true;
    return false;
  }
}

function buildProcessTreeTerminationPlan(platform, pid, force) {
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error('Process-tree identifier is invalid');
  }
  if (platform === 'win32') {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    return Object.freeze({
      kind: 'windows-tree-command',
      command: 'taskkill.exe',
      args: Object.freeze(args),
    });
  }
  return Object.freeze({
    kind: 'posix-process-group',
    processGroupId: -pid,
    signal: force ? 'SIGKILL' : 'SIGTERM',
  });
}

function terminateChildProcess(child, options = {}) {
  const existing = childTerminationPromises.get(child);
  if (existing) return existing;

  const terminationPromise = (async () => {
    const state = getChildLifecycleState(child);
    if (state.settled || isChildExited(child)) {
      const completed = await waitForChildOutcome(state, 0);
      return Object.freeze({
        reaped: true,
        gracefulTerminationSent: false,
        forceKillSent: false,
        outcome: completed.outcome ?? state.outcome,
      });
    }

    const sendGracefulTermination =
      options.sendGracefulTermination ??
      ((target) => sendProcessTreeTermination(target, false));
    const sendForceKill =
      options.sendForceKill ??
      ((target) => sendProcessTreeTermination(target, true));
    const gracefulTerminationSent = Boolean(
      await sendGracefulTermination(child),
    );
    const graceful = await waitForChildOutcome(
      state,
      options.graceMs ?? CHILD_TERMINATION_GRACE_MS,
    );
    if (graceful.completed) {
      return Object.freeze({
        reaped: true,
        gracefulTerminationSent,
        forceKillSent: false,
        outcome: graceful.outcome,
      });
    }

    const forceKillSent = Boolean(await sendForceKill(child));
    const forced = await waitForChildOutcome(
      state,
      options.forceReapMs ?? CHILD_FORCE_KILL_REAP_MS,
    );
    return Object.freeze({
      reaped: forced.completed,
      gracefulTerminationSent,
      forceKillSent,
      outcome: forced.outcome,
    });
  })();
  childTerminationPromises.set(child, terminationPromise);
  void terminationPromise.then(
    (report) => {
      if (!report.reaped) childTerminationPromises.delete(child);
    },
    () => childTerminationPromises.delete(child),
  );
  return terminationPromise;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function appendCapped(chunks, chunk, currentBytes, maximumBytes) {
  if (currentBytes >= maximumBytes) return currentBytes;
  const buffer = Buffer.from(chunk);
  const available = maximumBytes - currentBytes;
  chunks.push(buffer.subarray(0, available));
  return currentBytes + Math.min(buffer.length, available);
}

async function runChild(command, args, options = {}) {
  const started = process.hrtime.bigint();
  const tracker = options.tracker;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  const childPid = child.pid ?? null;
  const lifecycle = getChildLifecycleState(child);
  tracker?.add(child);

  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  child.stdout.on('data', (chunk) => {
    stdoutBytes = appendCapped(
      stdout,
      chunk,
      stdoutBytes,
      options.maxCaptureBytes ?? MAX_CAPTURE_BYTES,
    );
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes = appendCapped(
      stderr,
      chunk,
      stderrBytes,
      options.maxCaptureBytes ?? MAX_CAPTURE_BYTES,
    );
  });

  let timedOut = false;
  let aborted = false;
  let interruptReason = null;
  let resolveInterruption;
  const interruption = new Promise((resolve) => {
    resolveInterruption = resolve;
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    if (!interruptReason) {
      interruptReason = 'timeout';
      resolveInterruption(interruptReason);
    }
  }, options.timeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS);
  const abort = () => {
    aborted = true;
    if (!interruptReason) {
      interruptReason = 'abort';
      resolveInterruption(interruptReason);
    }
  };
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });

  let outcome;
  let termination = null;
  try {
    const first = await Promise.race([
      lifecycle.promise.then((value) => ({ type: 'outcome', value })),
      interruption.then((value) => ({ type: 'interruption', value })),
    ]);
    if (first.type === 'outcome') {
      outcome = first.value;
    } else {
      termination = await terminateChildProcess(child, {
        graceMs: options.terminationGraceMs ?? CHILD_TERMINATION_GRACE_MS,
        forceReapMs: options.forceKillReapMs ?? CHILD_FORCE_KILL_REAP_MS,
        sendGracefulTermination: options.sendGracefulTermination,
        sendForceKill: options.sendForceKill,
      });
      outcome = termination.outcome ?? {
        code: 1,
        signal: null,
        spawnError: false,
      };
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    if (lifecycle.settled || termination?.reaped) tracker?.remove(child);
  }

  const sensitiveValues = options.sensitiveValues ?? [];
  const exitCode = outcome.code ?? 1;
  return Object.freeze({
    ok:
      exitCode === 0 &&
      !timedOut &&
      !aborted &&
      !outcome.spawnError &&
      termination?.reaped !== false,
    exitCode,
    signal: outcome.signal,
    timedOut,
    aborted,
    childPid,
    elapsedMs: Math.round(monotonicMilliseconds(started)),
    termination,
    stdout: redactText(Buffer.concat(stdout).toString('utf8'), sensitiveValues),
    stderr: redactText(Buffer.concat(stderr).toString('utf8'), sensitiveValues),
  });
}

function createEvidenceFinalizer(context, operations = {}) {
  const state = context.state;
  if (!(state instanceof EvidenceState)) {
    throw new Error('Unified evidence state is required');
  }
  return (options = {}) => {
    if (options.operationFailed) {
      state.disableSummary(options.failureStage ?? 'evidence operation');
      state.abortController.abort();
    }
    if (state.finalizationPromise) return state.finalizationPromise;

    state.finalizationPromise = (async () => {
      if (
        EVIDENCE_PHASE_ORDER.indexOf(state.phase) <
        EVIDENCE_PHASE_ORDER.indexOf(EVIDENCE_PHASE.FINALIZING)
      ) {
        state.transition(EVIDENCE_PHASE.FINALIZING);
      }
      const failures = [];
      const runStep = async (label, action) => {
        try {
          return await action();
        } catch {
          failures.push(label);
          state.disableSummary(label, 'cleanup');
          return undefined;
        }
      };

      if (context.faultInjection === 'SIGTERM_DURING_FINALIZATION') {
        context.emitStage?.('finalization-active');
        await runStep('finalization signal rehearsal deadline', () =>
          withDeadline(
            'Finalization signal rehearsal',
            () => state.signalPromise,
            {
              timeoutMs: SIGNAL_REHEARSAL_TIMEOUT_MS,
            },
          ),
        );
      }

      const phaseOne =
        (await runStep('Prisma disconnect phase one', () =>
          (operations.disconnectPhaseOne ?? disconnectTrackedPrismaClients)(
            state.trackedPrismaClients,
            PRISMA_DISCONNECT_GRACE_MS,
          ),
        )) ?? [];

      await runStep('tracked child termination', () =>
        (
          operations.terminateChildren ??
          (() => context.childTracker.terminateAll())
        )(),
      );
      await runStep('owned Docker resource cleanup', async () => {
        const result = await (
          operations.cleanupResources ?? (() => context.cleanup.run())
        )();
        if (!result?.ok) throw new Error('Owned resource cleanup failed');
      });

      let exactNameEvidence = {
        exactNameContainersRemaining: 0,
        exactNameNetworksRemaining: 0,
      };
      let labelSweepEvidence = {
        currentRunLabeledContainersRemaining: 0,
        currentRunLabeledNetworksRemaining: 0,
      };
      let exactNameInspectionVerified = false;
      let labelSweepInspectionVerified = false;
      let postgresImageIdentityVerified = false;
      if (context.dockerEndpointVerified) {
        const exact = await runStep('exact-name cleanup inspection', () =>
          (operations.verifyExactNames ?? verifyExactResourceNamesAbsent)(
            context,
          ),
        );
        if (exact) {
          exactNameEvidence = exact;
          exactNameInspectionVerified = true;
        }
        const labels = await runStep(
          'current-run label cleanup inspection',
          () =>
            (operations.verifyCurrentRunLabels ?? verifyCurrentRunLabelsAbsent)(
              context,
            ),
        );
        if (labels) {
          labelSweepEvidence = labels;
          labelSweepInspectionVerified = true;
        }
        if (context.postgresImageId) {
          postgresImageIdentityVerified =
            (await runStep('PostgreSQL image identity verification', () =>
              (operations.verifyImageIdentity ?? verifyPostgresImageIdentity)(
                context,
              ),
            )) === true;
        }
      }

      const phaseTwo =
        (await runStep('Prisma disconnect phase two', () =>
          (operations.disconnectPhaseTwo ?? disconnectTrackedPrismaClients)(
            state.trackedPrismaClients,
            PRISMA_DISCONNECT_RETRY_MS,
          ),
        )) ?? [];
      const trackedPrismaClientsRemaining = state.trackedPrismaClients.size;
      const prismaDisconnectFailures = trackedPrismaClientsRemaining;
      if (trackedPrismaClientsRemaining !== 0) {
        failures.push('tracked Prisma clients remain');
        state.disableSummary('tracked Prisma clients remain', 'cleanup');
      }
      const trackedChildrenRemaining = context.childTracker.children.size;
      if (trackedChildrenRemaining !== 0) {
        failures.push('tracked children remain');
        state.disableSummary('tracked children remain', 'cleanup');
      }
      if (state.ownedDockerResources.size !== 0) {
        failures.push('owned Docker resources remain tracked');
        state.disableSummary(
          'owned Docker resources remain tracked',
          'cleanup',
        );
      }

      await runStep('scratch-file cleanup', () =>
        (operations.removeScratchFiles ?? removeTrackedEvidenceFiles)(
          state,
          context.fileTracker,
          { removeRetained: state.interrupted || !state.summaryEligibility },
        ),
      );

      const trackedFilesBeforePublication = context.fileTracker.snapshot();
      let cleanupEvidence = Object.freeze({
        ...exactNameEvidence,
        ...labelSweepEvidence,
        scratchFilesRemaining:
          trackedFilesBeforePublication.scratchFilesRemaining,
        retainedSanitizedSummaryFiles:
          trackedFilesBeforePublication.retainedSanitizedSummaryFiles,
        inspectionVerified:
          exactNameInspectionVerified && labelSweepInspectionVerified,
      });
      if (context.dockerEndpointVerified) {
        try {
          validateDockerCleanupResult(cleanupEvidence);
        } catch {
          failures.push('Docker cleanup evidence');
          state.disableSummary('Docker cleanup evidence', 'cleanup');
        }
      }

      let publication;
      if (
        failures.length === 0 &&
        state.summaryEligibility &&
        !state.interrupted &&
        options.operationFailed !== true
      ) {
        const summaryCleanupEvidence = Object.freeze({
          ...cleanupEvidence,
          retainedSanitizedSummaryFiles: 1,
        });
        const summary = context.buildSummary({
          cleanupEvidence: summaryCleanupEvidence,
          trackedPrismaClientsRemaining,
          prismaDisconnectFailures,
          trackedChildrenRemaining,
          postgresImageIdentityVerified,
        });
        publication = await runStep('summary publication', () =>
          (operations.publishSummary ?? writeAtomicSanitizedSummary)({
            state,
            fileTracker: context.fileTracker,
            summary,
            summaryPath: context.summaryPath,
            sensitiveValues: context.sensitiveValues,
            hooks: operations.summaryHooks,
          }),
        );
        if (publication) {
          const files = context.fileTracker.snapshot();
          if (
            files.scratchFilesRemaining !== 0 ||
            files.retainedSanitizedSummaryFiles !== 1
          ) {
            failures.push('published summary accounting');
            state.disableSummary('published summary accounting', 'cleanup');
            await removeTrackedEvidenceFiles(state, context.fileTracker, {
              removeRetained: true,
            }).catch(() => undefined);
            publication = undefined;
          } else {
            cleanupEvidence = Object.freeze({
              ...cleanupEvidence,
              ...files,
            });
          }
        }
      }

      if (!publication && state.retainedSummaryPaths.size !== 0) {
        await runStep('ineligible retained-summary cleanup', () =>
          removeTrackedEvidenceFiles(state, context.fileTracker, {
            removeRetained: true,
          }),
        );
      }
      if (!publication) {
        await runStep('signal handler removal', () =>
          Promise.resolve(operations.removeSignalHandlers?.()),
        );
      }

      const ok =
        failures.length === 0 &&
        Boolean(publication) &&
        !state.interrupted &&
        state.summaryEligibility;
      state.transition(ok ? EVIDENCE_PHASE.FINALIZED : EVIDENCE_PHASE.FAILED);
      return Object.freeze({
        ok,
        failures: Object.freeze([...failures]),
        phaseOneDisconnect: Object.freeze([...phaseOne]),
        phaseTwoDisconnect: Object.freeze([...phaseTwo]),
        trackedPrismaClientsRemaining,
        prismaDisconnectFailures,
        trackedChildrenRemaining,
        postgresImageIdentityVerified,
        cleanupEvidence,
        publication,
      });
    })();
    return state.finalizationPromise;
  };
}

function createSignalCleanupRouter({ state, finalize, setExitCode }) {
  return (signal) => {
    const first = state.latchSignal(signal);
    if (first) setExitCode(state.requestedExitCode);
    return finalize({ operationFailed: false, signal });
  };
}

function installSignalCleanup(options) {
  const route = createSignalCleanupRouter(options);
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      const promise = route(signal);
      void promise.catch(() => undefined);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  const messageHandler = (message) => {
    if (
      options.allowTestSignalInjection === true &&
      message &&
      message.type === 'PRD3_G01_B1_TEST_SIGNAL' &&
      ['SIGINT', 'SIGTERM'].includes(message.signal)
    ) {
      const promise = route(message.signal);
      void promise.catch(() => undefined);
    }
  };
  if (options.allowTestSignalInjection === true) {
    process.on('message', messageHandler);
  }
  return () => {
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
    process.removeListener('message', messageHandler);
  };
}

async function resolvePinnedLocalDockerEndpoint(options = {}) {
  const environment = options.environment ?? process.env;
  const commandRunner = options.commandRunner ?? runChild;
  const selectors = inspectDockerSelectorEnvironment(environment);
  let endpointPolicy;

  if (selectors.dockerHost.present) {
    endpointPolicy = parseLocalDockerEndpoint(selectors.dockerHost.value);
  } else {
    const contextEnvironment = buildMinimalChildEnvironment(environment, {
      dockerContext: selectors.dockerContext.value,
    });
    const contextShow = await commandRunner('docker', ['context', 'show'], {
      cwd: options.cwd,
      env: contextEnvironment,
      timeoutMs: 10_000,
      tracker: options.tracker,
    });
    if (!contextShow.ok) {
      throw new Error('Docker context selection could not be verified');
    }
    const contextName = parseDockerContextName(contextShow.stdout);
    if (
      selectors.dockerContext.present &&
      contextName !== selectors.dockerContext.value
    ) {
      throw new Error('Docker endpoint selectors are contradictory');
    }
    const contextInspect = await commandRunner(
      'docker',
      ['context', 'inspect', contextName],
      {
        cwd: options.cwd,
        env: contextEnvironment,
        timeoutMs: 10_000,
        tracker: options.tracker,
      },
    );
    if (!contextInspect.ok) {
      throw new Error('Docker context selection could not be verified');
    }
    endpointPolicy = parseLocalDockerEndpoint(
      parseDockerContextInspection(contextInspect.stdout),
    );
  }

  return Object.freeze({
    endpoint: endpointPolicy.endpoint,
    transport: endpointPolicy.transport,
    childEnvironment: Object.freeze(
      buildMinimalChildEnvironment(environment, {
        pinnedDockerEndpoint: endpointPolicy.endpoint,
      }),
    ),
  });
}

function emptyRoleCounts() {
  return {
    api: 0,
    'core-worker': 0,
    'media-worker': 0,
  };
}

function roleForApplicationName(applicationName) {
  return ROLE_KEYS.find(
    (role) => ROLE_APPLICATION_NAMES[role] === applicationName,
  );
}

class ActivitySampler {
  constructor(observer, limits, options = {}) {
    this.observer = observer;
    this.limits = limits;
    this.intervalMs = options.intervalMs ?? 75;
    this.queryTimeoutMs =
      options.queryTimeoutMs ?? PRISMA_SAMPLER_QUERY_TIMEOUT_MS;
    this.stopTimeoutMs = options.stopTimeoutMs ?? this.queryTimeoutMs + 1500;
    this.state = options.state;
    this.current = emptyRoleCounts();
    this.currentActive = emptyRoleCounts();
    this.maximum = emptyRoleCounts();
    this.maximumTotal = 0;
    this.sampledOvershootObserved = false;
    this.sampleCount = 0;
    this.failure = null;
    this.running = false;
    this.loopPromise = null;
  }

  start() {
    if (this.running) return this.loopPromise;
    this.running = true;
    this.loopPromise = this.loop();
    return this.loopPromise;
  }

  async loop() {
    while (this.running) {
      if (this.state?.interrupted) {
        this.running = false;
        break;
      }
      try {
        await this.sample();
      } catch (error) {
        this.failure = error;
        this.running = false;
        break;
      }
      if (this.running) await delay(this.intervalMs);
    }
  }

  async sample() {
    assertNotInterrupted(this.state);
    const rows = await runBoundedPrismaOperation(
      'Prisma activity sampler query',
      () => this.observer.$queryRawUnsafe(OBSERVATION_SQL),
      {
        timeoutMs: this.queryTimeoutMs,
        signal: this.state?.abortController.signal,
      },
    );
    assertNotInterrupted(this.state);
    const counts = emptyRoleCounts();
    const active = emptyRoleCounts();
    for (const row of rows) {
      const role = roleForApplicationName(row.application_name);
      if (!role) throw new Error('Unexpected role observation');
      counts[role] += 1;
      if (row.state === 'active') active[role] += 1;
      if (
        typeof row.wait_event_type !== 'string' &&
        row.wait_event_type !== null
      ) {
        throw new Error('Role wait-event observation is invalid');
      }
      if (typeof row.wait_event !== 'string' && row.wait_event !== null) {
        throw new Error('Role wait-event observation is invalid');
      }
      if (!(row.backend_start instanceof Date)) {
        throw new Error('Role backend-start observation is invalid');
      }
    }
    const totalLimit = Object.values(this.limits).reduce(
      (sum, value) => sum + value,
      0,
    );
    const sampledTotal = Object.values(counts).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (
      ROLE_KEYS.some((role) => counts[role] > this.limits[role]) ||
      sampledTotal > totalLimit
    ) {
      this.sampledOvershootObserved = true;
      throw new Error('Sampled runtime sessions exceed the approved budget');
    }
    const total = validateRoleObservation(counts, this.limits, {
      totalLimit,
    });
    for (const role of ROLE_KEYS) {
      this.maximum[role] = Math.max(this.maximum[role], counts[role]);
    }
    this.maximumTotal = Math.max(this.maximumTotal, total);
    this.current = counts;
    this.currentActive = active;
    this.sampleCount += 1;
  }

  assertHealthy() {
    if (this.failure) throw this.failure;
  }

  async waitFor(predicate, timeoutMs, label) {
    const started = process.hrtime.bigint();
    while (monotonicMilliseconds(started) < timeoutMs) {
      assertNotInterrupted(this.state);
      this.assertHealthy();
      if (predicate(this.current, this.currentActive)) return;
      await delay(50);
    }
    this.assertHealthy();
    throw new Error(`Timed out waiting for ${label}`);
  }

  async stop() {
    this.running = false;
    if (this.loopPromise) {
      await withDeadline('Activity sampler shutdown', () => this.loopPromise, {
        timeoutMs: this.stopTimeoutMs,
      });
    }
    this.assertHealthy();
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function monotonicMilliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

async function expectP2024(
  client,
  poolTimeoutSeconds,
  KnownRequestErrorClass,
  state,
) {
  const started = process.hrtime.bigint();
  let observedError;
  try {
    await runBoundedPrismaOperation(
      'Prisma queued pool-timeout query',
      () => client.$queryRawUnsafe('SELECT 1'),
      {
        timeoutMs: timeoutWindow(poolTimeoutSeconds).maximumMs + 1000,
        signal: state?.abortController.signal,
      },
    );
  } catch (error) {
    observedError = error;
  }
  const elapsedMs = monotonicMilliseconds(started);
  if (!isExactP2024(observedError, KnownRequestErrorClass)) {
    throw new Error('Expected exact Prisma P2024 pool timeout');
  }
  const window = timeoutWindow(poolTimeoutSeconds);
  if (elapsedMs < window.minimumMs || elapsedMs > window.maximumMs) {
    throw new Error('Prisma P2024 elapsed time is outside the approved window');
  }
  return Math.round(elapsedMs);
}

async function executeSelectOne(client, state) {
  const rows = await runBoundedPrismaOperation(
    'Prisma recovery query',
    () => client.$queryRawUnsafe('SELECT 1 AS value'),
    {
      timeoutMs: PRISMA_QUERY_TIMEOUT_MS,
      signal: state?.abortController.signal,
    },
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    Number(rows[0].value) !== 1
  ) {
    throw new Error(
      'PostgreSQL recovery query did not return the expected value',
    );
  }
}

function startSleepers(client, count, seconds, state, options = {}) {
  const completion = runBoundedPrismaOperation(
    'Prisma pool sleeper group',
    () =>
      Promise.all(
        Array.from({ length: count }, () =>
          client.$queryRawUnsafe(
            'SELECT 1 AS value FROM pg_sleep($1::double precision)',
            seconds,
          ),
        ),
      ),
    {
      timeoutMs: options.timeoutMs ?? Math.ceil(seconds * 1000) + 5000,
      signal: state?.abortController.signal,
    },
  );
  void completion.catch(() => undefined);
  return completion;
}

async function disconnectClient(client, clients, options = {}) {
  try {
    await runBoundedPrismaOperation(
      'Prisma client disconnect',
      () => client.$disconnect(),
      { timeoutMs: options.timeoutMs ?? PRISMA_DISCONNECT_GRACE_MS },
    );
    clients.delete(client);
    return PRISMA_DISCONNECT_STATUS.SUCCESS;
  } catch (error) {
    if (error?.operationTimedOut) {
      return PRISMA_DISCONNECT_STATUS.TIMED_OUT;
    }
    return PRISMA_DISCONNECT_STATUS.REJECTED;
  }
}

async function disconnectTrackedPrismaClients(clients, timeoutMs) {
  const entries = [...clients];
  const statuses = await Promise.all(
    entries.map(async (client) => ({
      client,
      status: await disconnectClient(client, clients, { timeoutMs }),
    })),
  );
  return Object.freeze(statuses);
}

async function settleScenarioPromises(promises, state, options = {}) {
  if (promises.length === 0) return [];
  const results = (
    await withDeadline(
      'Scenario-local asynchronous teardown',
      () => Promise.allSettled(promises),
      {
        timeoutMs: options.timeoutMs ?? SCENARIO_TEARDOWN_TIMEOUT_MS,
        signal: state?.abortController.signal.aborted
          ? undefined
          : state?.abortController.signal,
      },
    )
  ).value;
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Scenario-local teardown did not complete');
  }
  return results;
}

async function runScenarioA(context) {
  const state = context.state;
  const limits = Object.fromEntries(
    ROLE_KEYS.map((role) => [
      role,
      context.policy.DATABASE_RUNTIME_POLICY[role].connectionLimit.default,
    ]),
  );
  const sampler = new ActivitySampler(context.observer, limits, { state });
  sampler.start();
  const roleClients = {};
  const sleepers = {};
  try {
    for (const role of ROLE_KEYS) {
      roleClients[role] = context.createRoleClient(role);
    }
    await Promise.all(
      ROLE_KEYS.map((role) =>
        runBoundedPrismaOperation(
          `Prisma ${role} connect`,
          () => roleClients[role].$connect(),
          {
            timeoutMs: PRISMA_CONNECT_TIMEOUT_MS,
            signal: state.abortController.signal,
          },
        ),
      ),
    );
    for (const role of ROLE_KEYS) {
      const rolePolicy = context.policy.DATABASE_RUNTIME_POLICY[role];
      sleepers[role] = startSleepers(
        roleClients[role],
        limits[role],
        rolePolicy.poolTimeoutSeconds.default + 3,
        state,
      );
    }
    await sampler.waitFor(
      (_, active) => ROLE_KEYS.every((role) => active[role] === limits[role]),
      10_000,
      'exact role saturation',
    );
    await context.onActiveMeasurement?.();
    assertNotInterrupted(state);

    const timeouts = await Promise.all(
      ROLE_KEYS.map(async (role) => {
        const poolTimeoutSeconds =
          context.policy.DATABASE_RUNTIME_POLICY[role].poolTimeoutSeconds
            .default;
        return [
          role,
          await expectP2024(
            roleClients[role],
            poolTimeoutSeconds,
            context.KnownRequestErrorClass,
            state,
          ),
        ];
      }),
    );
    await Promise.all(Object.values(sleepers));
    await Promise.all(
      ROLE_KEYS.map((role) => executeSelectOne(roleClients[role], state)),
    );
    const disconnectStatuses = await Promise.all(
      ROLE_KEYS.map((role) =>
        disconnectClient(roleClients[role], context.clients),
      ),
    );
    if (
      disconnectStatuses.some(
        (status) => status !== PRISMA_DISCONNECT_STATUS.SUCCESS,
      )
    ) {
      throw new Error('Scenario A Prisma disconnect did not complete');
    }
    await sampler.waitFor(
      (counts) => ROLE_KEYS.every((role) => counts[role] === 0),
      5000,
      'role disconnect cleanup',
    );
    const timeoutMap = Object.fromEntries(timeouts);
    return Object.fromEntries(
      ROLE_KEYS.map((role) => {
        const rolePolicy = context.policy.DATABASE_RUNTIME_POLICY[role];
        return [
          role,
          Object.freeze({
            configuredLimit: limits[role],
            observedMaximum: sampler.maximum[role],
            configuredPoolTimeoutSeconds: rolePolicy.poolTimeoutSeconds.default,
            observedErrorCode: 'P2024',
            timeoutElapsedMs: timeoutMap[role],
            recovered: true,
            sessionsAfterDisconnect: sampler.current[role],
          }),
        ];
      }),
    );
  } finally {
    const teardown = [];
    teardown.push(...Object.values(sleepers));
    teardown.push(
      ...Object.values(roleClients)
        .filter((client) => context.clients.has(client))
        .map((client) => disconnectClient(client, context.clients)),
    );
    teardown.push(sampler.stop());
    await settleScenarioPromises(teardown, state);
  }
}

async function runScenarioB(context) {
  const state = context.state;
  const clientsByRole = {};
  const expectedRoleCounts = {};
  for (const role of ROLE_KEYS) {
    const rolePolicy = context.policy.DATABASE_RUNTIME_POLICY[role];
    clientsByRole[role] = Array.from({ length: rolePolicy.maxInstances }, () =>
      context.createRoleClient(role),
    );
    expectedRoleCounts[role] =
      rolePolicy.maxInstances * rolePolicy.connectionLimit.default;
  }
  const expected = {
    roleCounts: expectedRoleCounts,
    runtimeTotal: Object.values(expectedRoleCounts).reduce(
      (sum, value) => sum + value,
      0,
    ),
  };
  const sampler = new ActivitySampler(context.observer, expectedRoleCounts, {
    state,
  });
  sampler.start();
  const sleepers = [];
  try {
    const allClients = ROLE_KEYS.flatMap((role) => clientsByRole[role]);
    await Promise.all(
      allClients.map((client) =>
        runBoundedPrismaOperation(
          'Prisma aggregate client connect',
          () => client.$connect(),
          {
            timeoutMs: PRISMA_CONNECT_TIMEOUT_MS,
            signal: state.abortController.signal,
          },
        ),
      ),
    );
    for (const role of ROLE_KEYS) {
      const count =
        context.policy.DATABASE_RUNTIME_POLICY[role].connectionLimit.default;
      for (const client of clientsByRole[role]) {
        sleepers.push(startSleepers(client, count, 10, state));
      }
    }
    await sampler.waitFor(
      (counts, active) =>
        ROLE_KEYS.every(
          (role) =>
            counts[role] === expectedRoleCounts[role] &&
            active[role] === expectedRoleCounts[role],
        ),
      10_000,
      'aggregate runtime saturation',
    );
    await Promise.all(sleepers);
    const disconnectStatuses = await Promise.all(
      allClients.map((client) => disconnectClient(client, context.clients)),
    );
    if (
      disconnectStatuses.some(
        (status) => status !== PRISMA_DISCONNECT_STATUS.SUCCESS,
      )
    ) {
      throw new Error('Scenario B Prisma disconnect did not complete');
    }
    await sampler.waitFor(
      (counts) => ROLE_KEYS.every((role) => counts[role] === 0),
      5000,
      'aggregate disconnect cleanup',
    );
    const observed = {
      roleCounts: { ...sampler.maximum },
      runtimeTotal: sampler.maximumTotal,
      sampledOvershootObserved: sampler.sampledOvershootObserved,
    };
    validateAggregateBudget(observed, expected);
    return Object.freeze({
      api: observed.roleCounts.api,
      coreWorker: observed.roleCounts['core-worker'],
      mediaWorker: observed.roleCounts['media-worker'],
      runtimeTotal: observed.runtimeTotal,
      sampledOvershootObserved: observed.sampledOvershootObserved,
      sessionsAfterDisconnect: { ...sampler.current },
    });
  } finally {
    const teardown = [...sleepers];
    teardown.push(
      ...ROLE_KEYS.flatMap((role) => clientsByRole[role])
        .filter((client) => context.clients.has(client))
        .map((client) => disconnectClient(client, context.clients)),
    );
    teardown.push(sampler.stop());
    await settleScenarioPromises(teardown, state);
  }
}

async function runScenarioC(context) {
  const state = context.state;
  const limits = Object.fromEntries(ROLE_KEYS.map((role) => [role, 1]));
  const sampler = new ActivitySampler(context.observer, limits, { state });
  sampler.start();
  const roleClients = {};
  const sleepers = {};
  try {
    for (const role of ROLE_KEYS) {
      roleClients[role] = context.createRoleClient(role, {
        connectionLimit: 1,
        poolTimeoutSeconds: 1,
      });
    }
    await Promise.all(
      ROLE_KEYS.map((role) =>
        runBoundedPrismaOperation(
          `Prisma ${role} cutback connect`,
          () => roleClients[role].$connect(),
          {
            timeoutMs: PRISMA_CONNECT_TIMEOUT_MS,
            signal: state.abortController.signal,
          },
        ),
      ),
    );
    for (const role of ROLE_KEYS) {
      sleepers[role] = startSleepers(roleClients[role], 1, 4, state);
    }
    await sampler.waitFor(
      (_, active) => ROLE_KEYS.every((role) => active[role] === 1),
      5000,
      'cutback saturation',
    );
    const timeouts = await Promise.all(
      ROLE_KEYS.map(async (role) => [
        role,
        await expectP2024(
          roleClients[role],
          1,
          context.KnownRequestErrorClass,
          state,
        ),
      ]),
    );
    await Promise.all(Object.values(sleepers));
    await Promise.all(
      ROLE_KEYS.map((role) => executeSelectOne(roleClients[role], state)),
    );
    const disconnectStatuses = await Promise.all(
      ROLE_KEYS.map((role) =>
        disconnectClient(roleClients[role], context.clients),
      ),
    );
    if (
      disconnectStatuses.some(
        (status) => status !== PRISMA_DISCONNECT_STATUS.SUCCESS,
      )
    ) {
      throw new Error('Scenario C Prisma disconnect did not complete');
    }
    await sampler.waitFor(
      (counts) => ROLE_KEYS.every((role) => counts[role] === 0),
      5000,
      'cutback disconnect cleanup',
    );
    const timeoutMap = Object.fromEntries(timeouts);
    const result = Object.fromEntries(
      ROLE_KEYS.map((role) => [
        role,
        Object.freeze({
          configuredLimit: 1,
          observedMaximum: sampler.maximum[role],
          configuredPoolTimeoutSeconds: 1,
          observedErrorCode: 'P2024',
          timeoutElapsedMs: timeoutMap[role],
          recovered: true,
          sessionsAfterDisconnect: sampler.current[role],
        }),
      ]),
    );
    validateCutbackResult(result);
    return result;
  } finally {
    const teardown = [...Object.values(sleepers)];
    teardown.push(
      ...Object.values(roleClients)
        .filter((client) => context.clients.has(client))
        .map((client) => disconnectClient(client, context.clients)),
    );
    teardown.push(sampler.stop());
    await settleScenarioPromises(teardown, state);
  }
}

async function runRequiredChild(context, args, label, timeoutMs) {
  const result = await runChild('docker', args, {
    cwd: context.repositoryRoot,
    env: context.childEnvironment,
    timeoutMs,
    signal: context.abortController.signal,
    tracker: context.childTracker,
    sensitiveValues: context.sensitiveValues,
  });
  if (!result.ok) throw new Error(`${label} failed`);
  return result.stdout.trim();
}

function parseDockerImageId(output) {
  const value = String(output).trim();
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new Error('Docker image identity is invalid');
  }
  return value;
}

async function inspectExistingPostgresImageId(
  context,
  commandRunner = runChild,
) {
  const result = await commandRunner(
    'docker',
    ['image', 'inspect', '--format', '{{.Id}}', POSTGRES_IMAGE],
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 15_000,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  if (!result.ok) {
    throw new Error('Required local PostgreSQL image is unavailable');
  }
  return parseDockerImageId(result.stdout);
}

function parseDockerImageIdList(output) {
  const lines = String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.some((line) => !/^sha256:[a-f0-9]{64}$/u.test(line))) {
    throw new Error('Docker image inventory is invalid');
  }
  return Object.freeze([...new Set(lines)].sort());
}

async function inspectLocalDockerImageIds(context, commandRunner = runChild) {
  const result = await commandRunner(
    'docker',
    ['image', 'ls', '--no-trunc', '--quiet'],
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 15_000,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  if (!result.ok)
    throw new Error('Docker image inventory could not be verified');
  return parseDockerImageIdList(result.stdout);
}

async function runImageGateBeforeMutation(options) {
  const imageId = await options.inspectImage();
  await options.mutate(imageId);
  return imageId;
}

function buildDockerNetworkCreateArgs(context) {
  return [
    'network',
    'create',
    '--internal',
    '--label',
    `${EVIDENCE_GATE_LABEL}=${EVIDENCE_GATE}`,
    '--label',
    `${EVIDENCE_RUN_LABEL}=${context.suffix}`,
    context.networkName,
  ];
}

function buildPostgresRunArgs(context, credentials) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(context.postgresImageId ?? '')) {
    throw new Error('Pinned PostgreSQL image identity is unavailable');
  }
  return [
    'run',
    '--pull=never',
    '--detach',
    '--name',
    context.containerName,
    '--network',
    context.networkName,
    '--label',
    `${EVIDENCE_GATE_LABEL}=${EVIDENCE_GATE}`,
    '--label',
    `${EVIDENCE_RUN_LABEL}=${context.suffix}`,
    '--tmpfs',
    '/var/lib/postgresql/data:rw,noexec,nosuid,size=536870912',
    '--publish',
    '127.0.0.1::5432',
    '--env',
    `POSTGRES_USER=${credentials.databaseUser}`,
    '--env',
    `POSTGRES_PASSWORD=${credentials.databasePassword}`,
    '--env',
    `POSTGRES_DB=${credentials.databaseName}`,
    context.postgresImageId,
    '-c',
    `max_connections=${POSTGRES_MAX_CONNECTIONS}`,
  ];
}

function buildPublishedPortInspectionArgs(context) {
  return [
    'container',
    'inspect',
    '--format',
    '{{json .NetworkSettings.Ports}}',
    context.containerName,
  ];
}

function buildLoopbackBridgeAttachmentArgs(context) {
  return ['network', 'connect', 'bridge', context.containerName];
}

function buildBuiltInBridgeInspectionArgs() {
  return ['network', 'inspect', '--format', '{{json .}}', 'bridge'];
}

function parseBuiltInBridgeInspection(output) {
  let metadata;
  try {
    metadata = JSON.parse(String(output).trim());
  } catch {
    throw new Error('Built-in bridge metadata is invalid');
  }
  if (
    !metadata ||
    Array.isArray(metadata) ||
    metadata.Name !== 'bridge' ||
    metadata.Driver !== 'bridge' ||
    metadata.Scope !== 'local' ||
    metadata.Internal !== false
  ) {
    throw new Error('Built-in bridge metadata is invalid');
  }
  return true;
}

async function verifyBuiltInBridge(context, commandRunner = runChild) {
  const result = await commandRunner(
    'docker',
    buildBuiltInBridgeInspectionArgs(),
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 10_000,
      signal: context.state?.abortController.signal,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  if (!result.ok) throw new Error('Built-in bridge inspection failed');
  return parseBuiltInBridgeInspection(result.stdout);
}

async function verifyPostgresImageIdentity(context) {
  const observedImageId = await inspectExistingPostgresImageId(context);
  if (observedImageId !== context.postgresImageId) {
    throw new Error('PostgreSQL image identity changed during evidence run');
  }
  const finalImageIds = await inspectLocalDockerImageIds(context);
  if (
    !Array.isArray(context.initialImageIds) ||
    JSON.stringify(finalImageIds) !== JSON.stringify(context.initialImageIds)
  ) {
    throw new Error('Docker image inventory changed during evidence run');
  }
  return true;
}

function dockerInspectionError() {
  const error = new Error('Docker resource inspection failed');
  error.resourceState = DOCKER_RESOURCE_STATE.INSPECTION_FAILED;
  return error;
}

function classifyDockerNameListResult(result, exactName) {
  const lines = parseDockerNameListResult(result);
  return lines.includes(exactName)
    ? DOCKER_RESOURCE_STATE.EXISTS
    : DOCKER_RESOURCE_STATE.ABSENT;
}

function parseDockerNameListResult(result) {
  if (
    !result ||
    result.ok !== true ||
    result.exitCode !== 0 ||
    result.timedOut === true ||
    result.aborted === true ||
    typeof result.stdout !== 'string'
  ) {
    throw dockerInspectionError();
  }
  const lines = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    lines.some((line) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(line)) ||
    new Set(lines).size !== lines.length
  ) {
    throw dockerInspectionError();
  }
  return lines;
}

function dockerNameListArgs(kind, name) {
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
  if (kind === 'network') {
    return [
      'network',
      'ls',
      '--filter',
      `name=^${name}$`,
      '--format',
      '{{.Name}}',
    ];
  }
  throw new Error('Docker resource kind is invalid');
}

function dockerCurrentRunLabelListArgs(kind, ownershipLabels) {
  const base =
    kind === 'container'
      ? ['container', 'ls', '--all']
      : kind === 'network'
        ? ['network', 'ls']
        : null;
  if (!base) throw new Error('Docker resource kind is invalid');
  return [
    ...base,
    '--filter',
    `label=${EVIDENCE_GATE_LABEL}=${ownershipLabels[EVIDENCE_GATE_LABEL]}`,
    '--filter',
    `label=${EVIDENCE_RUN_LABEL}=${ownershipLabels[EVIDENCE_RUN_LABEL]}`,
    '--format',
    kind === 'container' ? '{{.Names}}' : '{{.Name}}',
  ];
}

async function inspectDockerResourceState(
  context,
  kind,
  name,
  commandRunner = runChild,
) {
  const result = await commandRunner('docker', dockerNameListArgs(kind, name), {
    cwd: context.repositoryRoot,
    env: context.childEnvironment,
    timeoutMs: 10_000,
    tracker: context.childTracker,
    sensitiveValues: context.sensitiveValues,
  });
  return classifyDockerNameListResult(result, name);
}

async function inspectCurrentRunLabeledResourceNames(
  context,
  kind,
  commandRunner = runChild,
) {
  const result = await commandRunner(
    'docker',
    dockerCurrentRunLabelListArgs(kind, context.ownershipLabels),
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 10_000,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  return parseDockerNameListResult(result);
}

function createEvidenceOwnershipLabels(runId) {
  return Object.freeze({
    [EVIDENCE_GATE_LABEL]: EVIDENCE_GATE,
    [EVIDENCE_RUN_LABEL]: runId,
  });
}

function assertOwnedResourceLabels(actualLabels, expectedLabels) {
  if (
    !actualLabels ||
    typeof actualLabels !== 'object' ||
    Array.isArray(actualLabels) ||
    actualLabels[EVIDENCE_GATE_LABEL] !== expectedLabels[EVIDENCE_GATE_LABEL] ||
    actualLabels[EVIDENCE_RUN_LABEL] !== expectedLabels[EVIDENCE_RUN_LABEL]
  ) {
    throw new Error('Docker resource ownership verification failed');
  }
  return true;
}

function parseDockerOwnershipInspectionResult(
  result,
  expectedLabels,
  expectedName,
  kind = 'container',
) {
  if (
    !result ||
    result.ok !== true ||
    result.exitCode !== 0 ||
    result.timedOut === true ||
    result.aborted === true ||
    typeof result.stdout !== 'string'
  ) {
    throw dockerInspectionError();
  }
  const output = result.stdout.trim();
  if (!output || output.includes('\n') || output.includes('\r')) {
    throw dockerInspectionError();
  }
  let inspected;
  try {
    inspected = JSON.parse(output);
  } catch {
    throw dockerInspectionError();
  }
  const rawName = inspected?.Name;
  const normalizedName =
    kind === 'container' && rawName?.startsWith('/')
      ? rawName.slice(1)
      : rawName;
  if (normalizedName !== expectedName) throw dockerInspectionError();
  const labels =
    kind === 'container' ? inspected?.Config?.Labels : inspected?.Labels;
  return assertOwnedResourceLabels(labels, expectedLabels);
}

async function inspectDockerResourceOwnership(
  context,
  kind,
  name,
  commandRunner = runChild,
) {
  const labelTemplate = '{{json .}}';
  const result = await commandRunner(
    'docker',
    [kind, 'inspect', '--format', labelTemplate, name],
    {
      cwd: context.repositoryRoot,
      env: context.childEnvironment,
      timeoutMs: 10_000,
      tracker: context.childTracker,
      sensitiveValues: context.sensitiveValues,
    },
  );
  return parseDockerOwnershipInspectionResult(
    result,
    context.ownershipLabels,
    name,
    kind,
  );
}

async function removeOwnedDockerResource(context, kind, name) {
  const removeArgs =
    kind === 'network'
      ? ['network', 'rm', name]
      : ['container', 'rm', '--force', name];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const state = await inspectDockerResourceState(context, kind, name);
    if (state === DOCKER_RESOURCE_STATE.ABSENT) return;
    await inspectDockerResourceOwnership(context, kind, name);
    if (state === DOCKER_RESOURCE_STATE.EXISTS) {
      const removal = await runChild('docker', removeArgs, {
        cwd: context.repositoryRoot,
        env: context.childEnvironment,
        timeoutMs: 15_000,
        tracker: context.childTracker,
        sensitiveValues: context.sensitiveValues,
      });
      if (!removal.ok) throw new Error(`Owned Docker ${kind} removal failed`);
    }
    await delay(150);
    if (
      (await inspectDockerResourceState(context, kind, name)) ===
      DOCKER_RESOURCE_STATE.ABSENT
    ) {
      return;
    }
  }
  throw new Error(`Owned Docker ${kind} cleanup failed`);
}

async function reconcileFailedOwnedResourceCreation(context, kind, name) {
  return reconcileFailedOwnedResourceCreationWithOperations({
    inspectState: () => inspectDockerResourceState(context, kind, name),
    verifyOwnership: () => inspectDockerResourceOwnership(context, kind, name),
    remove: () => removeOwnedDockerResource(context, kind, name),
  });
}

async function reconcileFailedOwnedResourceCreationWithOperations(operations) {
  const state = await operations.inspectState();
  if (state === DOCKER_RESOURCE_STATE.ABSENT) return;
  if (state !== DOCKER_RESOURCE_STATE.EXISTS) {
    throw dockerInspectionError();
  }
  await operations.verifyOwnership();
  await operations.remove();
}

async function createOwnedResourceAndRegisterCleanup(options) {
  try {
    await options.create();
  } catch (error) {
    await options.reconcileFailedCreate();
    throw error;
  }
  options.registerCleanup();
}

async function verifyExactResourceNamesAbsent(context) {
  const containerState = await inspectDockerResourceState(
    context,
    'container',
    context.containerName,
  );
  const networkState = await inspectDockerResourceState(
    context,
    'network',
    context.networkName,
  );
  const evidence = Object.freeze({
    exactNameContainersRemaining:
      containerState === DOCKER_RESOURCE_STATE.EXISTS ? 1 : 0,
    exactNameNetworksRemaining:
      networkState === DOCKER_RESOURCE_STATE.EXISTS ? 1 : 0,
  });
  if (
    evidence.exactNameContainersRemaining !== 0 ||
    evidence.exactNameNetworksRemaining !== 0
  ) {
    throw new Error('Exact-name Docker resources remain after cleanup');
  }
  return evidence;
}

async function verifyCurrentRunLabelsAbsent(context) {
  const containerNames = await inspectCurrentRunLabeledResourceNames(
    context,
    'container',
  );
  const networkNames = await inspectCurrentRunLabeledResourceNames(
    context,
    'network',
  );
  const evidence = Object.freeze({
    currentRunLabeledContainersRemaining: containerNames.length,
    currentRunLabeledNetworksRemaining: networkNames.length,
  });
  if (
    evidence.currentRunLabeledContainersRemaining !== 0 ||
    evidence.currentRunLabeledNetworksRemaining !== 0
  ) {
    throw new Error(
      'Current-run labeled Docker resources remain after cleanup',
    );
  }
  return evidence;
}

class EvidenceFileTracker {
  constructor(exists = fs.existsSync) {
    this.exists = exists;
    this.scratchFiles = new Set();
    this.retainedSanitizedSummaryFiles = new Set();
  }

  registerScratch(filePath) {
    this.scratchFiles.add(filePath);
  }

  unregisterScratch(filePath) {
    this.scratchFiles.delete(filePath);
  }

  registerRetainedSanitizedSummary(filePath) {
    this.retainedSanitizedSummaryFiles.add(filePath);
  }

  unregisterRetainedSanitizedSummary(filePath) {
    this.retainedSanitizedSummaryFiles.delete(filePath);
  }

  snapshot() {
    const countExisting = (paths) =>
      [...paths].filter((filePath) => this.exists(filePath)).length;
    return Object.freeze({
      scratchFilesRemaining: countExisting(this.scratchFiles),
      retainedSanitizedSummaryFiles: countExisting(
        this.retainedSanitizedSummaryFiles,
      ),
    });
  }
}

async function removeTrackedEvidenceFiles(state, fileTracker, options = {}) {
  const failures = [];
  const removeOne = async (filePath, retained) => {
    try {
      await (options.removeFile ?? fsp.rm)(filePath, { force: true });
      if (retained) {
        fileTracker.unregisterRetainedSanitizedSummary(filePath);
        state.retainedSummaryPaths.delete(filePath);
      } else {
        fileTracker.unregisterScratch(filePath);
        state.scratchPaths.delete(filePath);
      }
    } catch {
      failures.push(retained ? 'retained summary removal' : 'scratch removal');
    }
  };
  for (const scratchPath of [...state.scratchPaths]) {
    await removeOne(scratchPath, false);
  }
  if (options.removeRetained) {
    for (const summaryPath of [...state.retainedSummaryPaths]) {
      await removeOne(summaryPath, true);
    }
  }
  if (failures.length !== 0) {
    throw new Error('Evidence file cleanup did not complete');
  }
}

async function writeAtomicSanitizedSummary(options) {
  const { state, fileTracker, summary, sensitiveValues = [] } = options;
  state.assertSummaryEligible();
  validateSummarySchemaV5(summary);
  assertSanitizedSummary(summary, sensitiveValues);
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  const finalPath = options.summaryPath;
  const scratchPath = `${finalPath}.${randomBytes(8).toString('hex')}.scratch`;
  state.summaryPath = finalPath;
  state.scratchPaths.add(scratchPath);
  fileTracker.registerScratch(scratchPath);
  let handle;
  let renamed = false;
  try {
    state.assertSummaryEligible();
    await options.hooks?.beforeScratchOpen?.();
    state.assertSummaryEligible();
    handle = await (options.openFile ?? fsp.open)(scratchPath, 'wx', 0o600);
    state.assertSummaryEligible();
    await (options.hooks?.writeScratch
      ? options.hooks.writeScratch(handle, serialized)
      : handle.writeFile(serialized, { encoding: 'utf8' }));
    await options.hooks?.afterScratchWrite?.();
    state.assertSummaryEligible();
    if (typeof handle.sync === 'function') await handle.sync();
    await handle.close();
    handle = null;
    state.assertSummaryEligible();
    await options.hooks?.beforeRename?.();
    state.assertSummaryEligible();
    await (options.renameFile ?? fsp.rename)(scratchPath, finalPath);
    renamed = true;
    state.scratchPaths.delete(scratchPath);
    fileTracker.unregisterScratch(scratchPath);
    state.retainedSummaryPaths.add(finalPath);
    fileTracker.registerRetainedSanitizedSummary(finalPath);
    state.assertSummaryEligible();
    await options.hooks?.beforeHash?.();
    state.assertSummaryEligible();
    const retained = await (options.readFile ?? fsp.readFile)(finalPath);
    if (!Buffer.from(retained).equals(Buffer.from(serialized, 'utf8'))) {
      throw new Error('Retained summary content verification failed');
    }
    const summaryHash = createHash('sha256').update(retained).digest('hex');
    state.assertSummaryEligible();
    return Object.freeze({ summaryPath: finalPath, summaryHash, serialized });
  } catch (error) {
    state.disableSummary('summary publication');
    if (handle) await handle.close().catch(() => undefined);
    await fsp.rm(scratchPath, { force: true }).catch(() => undefined);
    state.scratchPaths.delete(scratchPath);
    fileTracker.unregisterScratch(scratchPath);
    if (renamed || state.retainedSummaryPaths.has(finalPath)) {
      await fsp.rm(finalPath, { force: true }).catch(() => undefined);
      state.retainedSummaryPaths.delete(finalPath);
      fileTracker.unregisterRetainedSanitizedSummary(finalPath);
    }
    throw error;
  }
}

function buildObserverUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.set('application_name', OBSERVER_APPLICATION_NAME);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '2');
  url.searchParams.set('connect_timeout', '5');
  return url.toString();
}

function createSummaryBuilder(context, prismaVersion) {
  return (finalization) => {
    const evidence = context.evidence;
    if (!evidence) throw new Error('Measured evidence is unavailable');
    return Object.freeze({
      schemaVersion: 5,
      gate: EVIDENCE_GATE,
      overall: 'PASS',
      interrupted: false,
      firstSignal: null,
      requestedExitCode: 0,
      nodeVersion: process.version,
      prismaVersion,
      postgresMajor: 16,
      postgresMaxConnections: evidence.maxConnections,
      postgresImageId: context.postgresImageId,
      dockerEndpointTransport: context.dockerEndpointTransport,
      loopbackBridgeAttachmentUsed: context.loopbackBridgeAttachmentUsed,
      postgresImageIdentityVerified: finalization.postgresImageIdentityVerified,
      trackedPrismaClientsRemaining: finalization.trackedPrismaClientsRemaining,
      prismaDisconnectFailures: finalization.prismaDisconnectFailures,
      trackedChildrenRemaining: finalization.trackedChildrenRemaining,
      roleSaturation: evidence.roleSaturation,
      aggregate: evidence.aggregate,
      cutback: evidence.cutback,
      cleanup: Object.freeze({ ...finalization.cleanupEvidence }),
    });
  };
}

function emitPassPublication(state, publication, options = {}) {
  state.assertSummaryEligible();
  const write = options.write ?? ((value) => process.stdout.write(value));
  try {
    write(`SUMMARY_PATH=${publication.summaryPath}\n`);
    write(`SUMMARY_SHA256=${publication.summaryHash}\n`);
  } finally {
    options.removeSignalHandlers?.();
  }
}

async function runLiveEvidenceFinal() {
  assertExactNodeVersion();
  const faultSelector = readEnvironmentValueCaseInsensitive(
    process.env,
    FAULT_INJECTION_ENVIRONMENT_KEY,
  );
  const faultInjection = validateFaultInjection(
    faultSelector.present ? faultSelector.value : undefined,
  );
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const compiledPolicyPath = path.join(
    repositoryRoot,
    'dist',
    'infrastructure',
    'database',
    'database-runtime.policy.js',
  );
  if (!fs.existsSync(compiledPolicyPath)) {
    throw new Error('Compiled database runtime policy is missing');
  }
  const policy = require(compiledPolicyPath);
  const { Prisma, PrismaClient } = require('@prisma/client');
  const prismaVersion = require('@prisma/client/package.json').version;
  if (prismaVersion !== EXPECTED_PRISMA_VERSION) {
    throw new Error('Installed Prisma Client version is not approved');
  }
  if (
    JSON.stringify(policy.DATABASE_RUNTIME_ROLES) !==
      JSON.stringify(ROLE_KEYS) ||
    ROLE_KEYS.some(
      (role) =>
        policy.DATABASE_RUNTIME_POLICY[role].applicationName !==
        ROLE_APPLICATION_NAMES[role],
    )
  ) {
    throw new Error('Compiled database runtime policy is inconsistent');
  }

  const suffix = createResourceSuffix();
  const childTracker = new ChildProcessTracker();
  const state = new EvidenceState({
    trackedPrismaClients: new Set(),
    trackedChildProcesses: childTracker.children,
    ownedDockerResources: new Map(),
  });
  const fileTracker = new EvidenceFileTracker();
  const context = {
    state,
    repositoryRoot,
    suffix,
    networkName: `prd3-g01-b1-${suffix}-net`,
    containerName: `prd3-g01-b1-${suffix}-postgres`,
    ownershipLabels: createEvidenceOwnershipLabels(suffix),
    childEnvironment: null,
    childTracker,
    abortController: state.abortController,
    cleanup: new CleanupManager(),
    fileTracker,
    summaryPath: path.join(
      os.tmpdir(),
      `moazez-prd3-g01-b1-${suffix}-summary.json`,
    ),
    sensitiveValues: [],
    clients: state.trackedPrismaClients,
    policy,
    KnownRequestErrorClass: Prisma.PrismaClientKnownRequestError,
    observer: null,
    dockerEndpointVerified: false,
    dockerEndpointTransport: null,
    postgresImageId: null,
    initialImageIds: null,
    loopbackBridgeAttachmentUsed: false,
    faultInjection,
    evidence: null,
    emitStage: (stage) => {
      if (faultInjection !== 'NONE') {
        process.stderr.write(`EVIDENCE_STAGE=${stage}\n`);
      }
    },
  };
  context.buildSummary = createSummaryBuilder(context, prismaVersion);

  let removeSignalHandlers = () => undefined;
  const finalize = createEvidenceFinalizer(context, {
    removeSignalHandlers: () => removeSignalHandlers(),
  });
  removeSignalHandlers = installSignalCleanup({
    state,
    finalize,
    setExitCode: (code) => {
      process.exitCode = code;
    },
    allowTestSignalInjection: LIVE_REHEARSAL_FAULTS.includes(faultInjection),
  });

  let primaryError;
  let primaryFailureStage;
  let finalizationResult;
  let activeStage = 'docker-endpoint-policy';
  try {
    state.transition(EVIDENCE_PHASE.READY);
    state.transition(EVIDENCE_PHASE.RUNNING);
    const endpointPolicy = await resolvePinnedLocalDockerEndpoint({
      environment: process.env,
      cwd: repositoryRoot,
      tracker: context.childTracker,
    });
    context.childEnvironment = endpointPolicy.childEnvironment;
    context.dockerEndpointTransport = endpointPolicy.transport;
    context.dockerEndpointVerified = true;
    context.sensitiveValues.push(endpointPolicy.endpoint);
    assertNotInterrupted(state);

    activeStage = 'docker-daemon-verification';
    await runRequiredChild(
      context,
      [
        'version',
        '--format',
        'client={{.Client.Version}} server={{.Server.Version}}',
      ],
      'Docker daemon verification',
      30_000,
    );
    activeStage = 'postgres-image-gate';
    context.postgresImageId = await inspectExistingPostgresImageId(context);
    context.initialImageIds = await inspectLocalDockerImageIds(context);
    if (!context.initialImageIds.includes(context.postgresImageId)) {
      throw new Error('Pinned PostgreSQL image is absent from local inventory');
    }
    assertNotInterrupted(state);

    activeStage = 'docker-network-creation';
    await createOwnedResourceAndRegisterCleanup({
      create: () =>
        runRequiredChild(
          context,
          buildDockerNetworkCreateArgs(context),
          'Disposable Docker network creation',
          30_000,
        ),
      reconcileFailedCreate: () =>
        reconcileFailedOwnedResourceCreation(
          context,
          'network',
          context.networkName,
        ),
      registerCleanup: () => {
        state.ownedDockerResources.set(context.networkName, 'network');
        context.cleanup.add('owned network', async () => {
          await removeOwnedDockerResource(
            context,
            'network',
            context.networkName,
          );
          state.ownedDockerResources.delete(context.networkName);
        });
      },
    });

    const databaseUser = `prd3_b1_${suffix.replace(/-/gu, '_').slice(-12)}`;
    const databasePassword = `synthetic-${randomBytes(24).toString('hex')}`;
    const databaseName = `prd3_b1_${randomBytes(8).toString('hex')}`;
    context.sensitiveValues.push(databaseUser, databasePassword, databaseName);
    activeStage = 'postgres-container-creation';
    await createOwnedResourceAndRegisterCleanup({
      create: () =>
        runRequiredChild(
          context,
          buildPostgresRunArgs(context, {
            databaseUser,
            databasePassword,
            databaseName,
          }),
          'Disposable PostgreSQL creation',
          180_000,
        ),
      reconcileFailedCreate: () =>
        reconcileFailedOwnedResourceCreation(
          context,
          'container',
          context.containerName,
        ),
      registerCleanup: () => {
        state.ownedDockerResources.set(context.containerName, 'container');
        context.cleanup.add('owned container', async () => {
          await removeOwnedDockerResource(
            context,
            'container',
            context.containerName,
          );
          state.ownedDockerResources.delete(context.containerName);
        });
      },
    });

    activeStage = 'loopback-bridge-attachment';
    await verifyBuiltInBridge(context);
    await inspectDockerResourceOwnership(
      context,
      'container',
      context.containerName,
    );
    await runRequiredChild(
      context,
      buildLoopbackBridgeAttachmentArgs(context),
      'Loopback bridge attachment',
      30_000,
    );
    context.loopbackBridgeAttachmentUsed = true;

    activeStage = 'postgres-readiness';
    await pollWithDeadline({
      label: 'Disposable PostgreSQL readiness',
      timeoutMs: 90_000,
      intervalMs: 500,
      state,
      predicate: async () => {
        const result = await runChild(
          'docker',
          [
            'exec',
            context.containerName,
            'pg_isready',
            '-U',
            databaseUser,
            '-d',
            databaseName,
          ],
          {
            cwd: repositoryRoot,
            env: context.childEnvironment,
            timeoutMs: 5000,
            signal: context.abortController.signal,
            tracker: context.childTracker,
            sensitiveValues: context.sensitiveValues,
          },
        );
        return result.ok;
      },
    });
    if (
      faultInjection === 'FAIL_AFTER_READINESS' ||
      faultInjection === 'SIGTERM_DURING_FINALIZATION'
    ) {
      activeStage = 'controlled-failure-after-readiness';
      throw new Error('Controlled evidence rehearsal failure');
    }

    activeStage = 'postgres-port-inspection';
    const portOutput = await runRequiredChild(
      context,
      buildPublishedPortInspectionArgs(context),
      'Disposable PostgreSQL port inspection',
      15_000,
    );
    activeStage = 'postgres-port-parsing';
    let port;
    try {
      port = parsePublishedPortInspection(portOutput);
    } catch (error) {
      activeStage = `postgres-port-${error.portInspectionCode ?? 'parsing'}`;
      throw error;
    }
    const databaseUrl = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${encodeURIComponent(databaseName)}`;
    context.sensitiveValues.push(databaseUrl);

    const observer = new PrismaClient({
      datasourceUrl: buildObserverUrl(databaseUrl),
    });
    context.observer = observer;
    context.clients.add(observer);
    activeStage = 'postgres-observer-verification';
    await runBoundedPrismaOperation(
      'Prisma observer connect',
      () => observer.$connect(),
      {
        timeoutMs: PRISMA_CONNECT_TIMEOUT_MS,
        signal: state.abortController.signal,
      },
    );
    const versionRows = await runBoundedPrismaOperation(
      'PostgreSQL version observation',
      () => observer.$queryRawUnsafe('SHOW server_version'),
      {
        timeoutMs: PRISMA_QUERY_TIMEOUT_MS,
        signal: state.abortController.signal,
      },
    );
    const maxConnectionRows = await runBoundedPrismaOperation(
      'PostgreSQL connection-limit observation',
      () => observer.$queryRawUnsafe('SHOW max_connections'),
      {
        timeoutMs: PRISMA_QUERY_TIMEOUT_MS,
        signal: state.abortController.signal,
      },
    );
    const serverVersion = String(versionRows[0]?.server_version ?? '');
    const maxConnections = Number(maxConnectionRows[0]?.max_connections);
    if (!serverVersion.startsWith('16.')) {
      throw new Error('Disposable PostgreSQL major version is not 16');
    }
    if (maxConnections !== POSTGRES_MAX_CONNECTIONS) {
      throw new Error('Disposable PostgreSQL max_connections is not 80');
    }

    context.createRoleClient = (role, overrides = {}) => {
      assertNotInterrupted(state);
      const settings = policy.resolveDatabaseRuntimeSettings(role, overrides);
      const datasourceUrl = policy.buildPrismaPostgresqlDatasourceUrl({
        databaseUrl,
        ...settings,
      });
      const client = new PrismaClient({ datasourceUrl });
      context.clients.add(client);
      return client;
    };
    context.onActiveMeasurement = async () => {
      if (faultInjection !== 'SIGINT_DURING_ACTIVE_MEASUREMENT') return;
      context.emitStage('active-measurement');
      await withDeadline(
        'Active-measurement signal rehearsal',
        () => state.signalPromise,
        { timeoutMs: SIGNAL_REHEARSAL_TIMEOUT_MS },
      );
      assertNotInterrupted(state);
    };

    activeStage = 'scenario-a';
    const roleSaturation = await runScenarioA(context);
    assertNotInterrupted(state);
    activeStage = 'scenario-b';
    const aggregate = await runScenarioB(context);
    assertNotInterrupted(state);
    activeStage = 'scenario-c';
    const cutback = await runScenarioC(context);
    assertNotInterrupted(state);
    context.evidence = {
      serverVersion,
      maxConnections,
      roleSaturation,
      aggregate,
      cutback,
    };
  } catch (error) {
    primaryError = error;
    primaryFailureStage = activeStage;
    state.disableSummary(primaryFailureStage);
  } finally {
    finalizationResult = await finalize({
      operationFailed: Boolean(primaryError),
      failureStage: primaryFailureStage,
    });
  }

  if (!finalizationResult.ok) {
    const error = new Error('Live Prisma pool evidence did not reach PASS');
    error.evidenceStage = state.interrupted
      ? 'signal-interruption'
      : (primaryFailureStage ?? 'finalization');
    error.finalizationResult = finalizationResult;
    error.evidenceState = state;
    throw error;
  }
  const publication = finalizationResult.publication;
  if (state.interrupted || !state.summaryEligibility) {
    await removeTrackedEvidenceFiles(state, context.fileTracker, {
      removeRetained: true,
    });
    removeSignalHandlers();
    state.transition(EVIDENCE_PHASE.FAILED);
    const error = new Error('Evidence was interrupted before PASS output');
    error.evidenceStage = 'signal-before-pass-output';
    error.finalizationResult = Object.freeze({
      ...finalizationResult,
      ok: false,
      cleanupEvidence: Object.freeze({
        ...finalizationResult.cleanupEvidence,
        retainedSanitizedSummaryFiles: 0,
      }),
    });
    error.evidenceState = state;
    throw error;
  }
  emitPassPublication(state, publication, { removeSignalHandlers });
  return Object.freeze({
    summaryPath: publication.summaryPath,
    summaryHash: publication.summaryHash,
  });
}

async function runRehearsalChild(faultInjection) {
  const expected = {
    FAIL_AFTER_READINESS: { exitCode: 1, marker: null },
    SIGINT_DURING_ACTIVE_MEASUREMENT: {
      exitCode: 130,
      marker: 'EVIDENCE_STAGE=active-measurement',
      signal: 'SIGINT',
    },
    SIGTERM_DURING_FINALIZATION: {
      exitCode: 143,
      marker: 'EVIDENCE_STAGE=finalization-active',
      signal: 'SIGTERM',
    },
  }[faultInjection];
  if (!expected) throw new Error('Failure rehearsal is invalid');
  const child = spawn(process.execPath, [__filename], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env, [FAULT_INJECTION_ENVIRONMENT_KEY]: faultInjection },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  const lifecycle = getChildLifecycleState(child);
  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let signalSent = false;
  const inspectMarker = () => {
    if (
      !signalSent &&
      expected.marker &&
      Buffer.concat(stderr).toString('utf8').includes(expected.marker)
    ) {
      signalSent = true;
      child.send({
        type: 'PRD3_G01_B1_TEST_SIGNAL',
        signal: expected.signal,
      });
    }
  };
  child.stdout.on('data', (chunk) => {
    stdoutBytes = appendCapped(stdout, chunk, stdoutBytes, MAX_CAPTURE_BYTES);
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes = appendCapped(stderr, chunk, stderrBytes, MAX_CAPTURE_BYTES);
    inspectMarker();
  });
  const waited = await waitForChildOutcome(lifecycle, 240_000);
  if (!waited.completed) {
    await terminateChildProcess(child);
    throw new Error('Failure rehearsal exceeded its bounded deadline');
  }
  const outcome = waited.outcome;
  if (child.connected) child.disconnect();
  const combined = `${Buffer.concat(stdout).toString('utf8')}\n${Buffer.concat(stderr).toString('utf8')}`;
  if (
    outcome.code !== expected.exitCode ||
    (expected.marker && !signalSent) ||
    /SUMMARY_PATH=/u.test(combined) ||
    !/FAILURE_CLEANUP_VERIFIED=true/u.test(combined) ||
    !/FAILURE_TRACKED_PRISMA_CLIENTS=0/u.test(combined) ||
    !/FAILURE_TRACKED_CHILDREN=0/u.test(combined) ||
    !/FAILURE_SCRATCH_FILES=0/u.test(combined)
  ) {
    throw new Error('Failure rehearsal did not fail closed');
  }
  return true;
}

async function auditAllGateResources() {
  const tracker = new ChildProcessTracker();
  const endpoint = await resolvePinnedLocalDockerEndpoint({
    environment: process.env,
    cwd: path.resolve(__dirname, '..', '..'),
    tracker,
  });
  try {
    for (const kind of ['container', 'network']) {
      const base =
        kind === 'container' ? ['container', 'ls', '--all'] : ['network', 'ls'];
      const result = await runChild(
        'docker',
        [
          ...base,
          '--filter',
          `label=${EVIDENCE_GATE_LABEL}=${EVIDENCE_GATE}`,
          '--format',
          kind === 'container' ? '{{.Names}}' : '{{.Name}}',
        ],
        {
          cwd: path.resolve(__dirname, '..', '..'),
          env: endpoint.childEnvironment,
          timeoutMs: 15_000,
          tracker,
          sensitiveValues: [endpoint.endpoint],
        },
      );
      if (parseDockerNameListResult(result).length !== 0) {
        throw new Error('Failure rehearsal left an owned Docker resource');
      }
    }
  } finally {
    await tracker.terminateAll();
  }
  return true;
}

async function runLiveFailureRehearsals() {
  assertExactNodeVersion();
  const labels = ['A', 'B', 'C'];
  for (let index = 0; index < LIVE_REHEARSAL_FAULTS.length; index += 1) {
    await runRehearsalChild(LIVE_REHEARSAL_FAULTS[index]);
    await auditAllGateResources();
    process.stdout.write(`REHEARSAL_${labels[index]}=PASS\n`);
  }
  return true;
}

function validateRequiredRunResults(results) {
  if (
    !Array.isArray(results) ||
    results.length !== 2 ||
    results.some((result) => result !== true)
  ) {
    throw new Error('Both independent live evidence runs must pass');
  }
  return true;
}

if (require.main === module) {
  const mode = process.argv[2];
  const operation =
    mode === '--failure-rehearsals'
      ? runLiveFailureRehearsals()
      : mode === undefined
        ? runLiveEvidenceFinal()
        : Promise.reject(new Error('Evidence command mode is invalid'));
  operation.catch((error) => {
    if (/^[a-z0-9-]+$/u.test(error?.evidenceStage ?? '')) {
      process.stderr.write(`FAILURE_STAGE=${error.evidenceStage}\n`);
    }
    const finalization = error?.finalizationResult;
    const state = error?.evidenceState;
    if (finalization) {
      let cleanupVerified = false;
      try {
        cleanupVerified = validateDockerCleanupResult(
          finalization.cleanupEvidence,
        );
      } catch {
        cleanupVerified = false;
      }
      process.stderr.write(`FAILURE_CLEANUP_VERIFIED=${cleanupVerified}\n`);
      process.stderr.write(
        `FAILURE_TRACKED_PRISMA_CLIENTS=${finalization.trackedPrismaClientsRemaining}\n`,
      );
      process.stderr.write(
        `FAILURE_TRACKED_CHILDREN=${finalization.trackedChildrenRemaining}\n`,
      );
      process.stderr.write(
        `FAILURE_SCRATCH_FILES=${finalization.cleanupEvidence.scratchFilesRemaining}\n`,
      );
      if (state?.firstSignal) {
        process.stderr.write(`FAILURE_FIRST_SIGNAL=${state.firstSignal}\n`);
      }
    }
    process.stderr.write(
      'PRD3-G01-B1 live evidence failed after sanitized cleanup\n',
    );
    if (process.connected) process.disconnect();
    if (!process.exitCode) process.exitCode = 1;
  });
}

module.exports = {
  ActivitySampler,
  CHILD_FORCE_KILL_REAP_MS,
  CHILD_TERMINATION_GRACE_MS,
  ChildProcessTracker,
  CleanupManager,
  DOCKER_RESOURCE_STATE,
  EVIDENCE_PHASE,
  EvidenceState,
  EVIDENCE_GATE_LABEL,
  EVIDENCE_RUN_LABEL,
  EvidenceFileTracker,
  EXPECTED_NODE_VERSION,
  EXPECTED_PRISMA_VERSION,
  FAULT_MATRIX,
  PRISMA_DISCONNECT_STATUS,
  ROLE_APPLICATION_NAMES,
  ROLE_KEYS,
  appendCapped,
  assertExactNodeVersion,
  assertOwnedResourceLabels,
  assertSanitizedSummary,
  assertNotInterrupted,
  auditAllGateResources,
  buildBuiltInBridgeInspectionArgs,
  buildProcessTreeTerminationPlan,
  buildDockerNetworkCreateArgs,
  buildLoopbackBridgeAttachmentArgs,
  buildMinimalChildEnvironment,
  buildPostgresRunArgs,
  buildPublishedPortInspectionArgs,
  classifyDockerNameListResult,
  createEvidenceFinalizer,
  createEvidenceOwnershipLabels,
  createOwnedResourceAndRegisterCleanup,
  createSignalCleanupRouter,
  disconnectClient,
  disconnectTrackedPrismaClients,
  executeSelectOne,
  emitPassPublication,
  isExactP2024,
  isProcessAlive,
  dockerCurrentRunLabelListArgs,
  inspectDockerSelectorEnvironment,
  inspectExistingPostgresImageId,
  inspectLocalDockerImageIds,
  parseDockerContextInspection,
  parseDockerContextName,
  parseDockerImageId,
  parseDockerImageIdList,
  parsePublishedPort,
  parsePublishedPortInspection,
  parseDockerOwnershipInspectionResult,
  parseBuiltInBridgeInspection,
  parseLocalDockerEndpoint,
  readEnvironmentValueCaseInsensitive,
  reconcileFailedOwnedResourceCreationWithOperations,
  redactText,
  removeTrackedEvidenceFiles,
  resolvePinnedLocalDockerEndpoint,
  runChild,
  runBoundedPrismaOperation,
  runImageGateBeforeMutation,
  runLiveFailureRehearsals,
  runRehearsalChild,
  sanitizeResourceSuffix,
  settleScenarioPromises,
  startSleepers,
  terminateChildProcess,
  timeoutWindow,
  validateFaultInjection,
  validateAggregateBudget,
  validateCleanupResult,
  validateCutbackResult,
  validateDockerCleanupResult,
  validateRoleObservation,
  validateRequiredRunResults,
  validateSummarySchemaV5,
  verifyBuiltInBridge,
  verifyPostgresImageIdentity,
  withDeadline,
  writeAtomicSanitizedSummary,
};
