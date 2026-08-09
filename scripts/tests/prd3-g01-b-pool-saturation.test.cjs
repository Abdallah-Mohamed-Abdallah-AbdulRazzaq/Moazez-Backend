'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const {
  ActivitySampler,
  ChildProcessTracker,
  CleanupManager,
  DOCKER_RESOURCE_STATE,
  EVIDENCE_GATE_LABEL,
  EVIDENCE_PHASE,
  EVIDENCE_RUN_LABEL,
  EvidenceFileTracker,
  EvidenceState,
  EXPECTED_NODE_VERSION,
  FAULT_MATRIX,
  PRISMA_DISCONNECT_STATUS,
  appendCapped,
  assertExactNodeVersion,
  assertOwnedResourceLabels,
  assertSanitizedSummary,
  buildBuiltInBridgeInspectionArgs,
  buildDockerNetworkCreateArgs,
  buildLoopbackBridgeAttachmentArgs,
  buildMinimalChildEnvironment,
  buildPostgresRunArgs,
  buildProcessTreeTerminationPlan,
  buildPublishedPortInspectionArgs,
  classifyDockerNameListResult,
  createEvidenceFinalizer,
  createEvidenceOwnershipLabels,
  createOwnedResourceAndRegisterCleanup,
  createSignalCleanupRouter,
  disconnectClient,
  disconnectTrackedPrismaClients,
  dockerCurrentRunLabelListArgs,
  executeSelectOne,
  emitPassPublication,
  inspectDockerSelectorEnvironment,
  inspectExistingPostgresImageId,
  isExactP2024,
  isProcessAlive,
  parseBuiltInBridgeInspection,
  parseDockerContextInspection,
  parseDockerImageId,
  parseDockerImageIdList,
  parseDockerOwnershipInspectionResult,
  parseLocalDockerEndpoint,
  parsePublishedPort,
  parsePublishedPortInspection,
  reconcileFailedOwnedResourceCreationWithOperations,
  redactText,
  resolvePinnedLocalDockerEndpoint,
  runBoundedPrismaOperation,
  runChild,
  runImageGateBeforeMutation,
  sanitizeResourceSuffix,
  settleScenarioPromises,
  startSleepers,
  timeoutWindow,
  validateAggregateBudget,
  validateCleanupResult,
  validateCutbackResult,
  validateDockerCleanupResult,
  validateFaultInjection,
  validateRequiredRunResults,
  validateRoleObservation,
  validateSummarySchemaV5,
  withDeadline,
  writeAtomicSanitizedSummary,
} = require('../ci/prd3-g01-b-pool-saturation.cjs');

const imageId = `sha256:${'a'.repeat(64)}`;
const exactRoleCounts = {
  api: 20,
  'core-worker': 12,
  'media-worker': 6,
};

function healthyDockerResult(stdout = '') {
  return {
    ok: true,
    exitCode: 0,
    timedOut: false,
    aborted: false,
    stdout,
  };
}

function createValidRoleEvidence(limit, poolTimeoutSeconds) {
  return {
    configuredLimit: limit,
    observedMaximum: limit,
    configuredPoolTimeoutSeconds: poolTimeoutSeconds,
    observedErrorCode: 'P2024',
    timeoutElapsedMs: poolTimeoutSeconds * 1000,
    recovered: true,
    sessionsAfterDisconnect: 0,
  };
}

function createValidSummary() {
  const cutback = createValidRoleEvidence(1, 1);
  return {
    schemaVersion: 5,
    gate: 'PRD3-G01-B1',
    overall: 'PASS',
    interrupted: false,
    firstSignal: null,
    requestedExitCode: 0,
    nodeVersion: 'v22.23.1',
    prismaVersion: '6.19.3',
    postgresMajor: 16,
    postgresMaxConnections: 80,
    postgresImageId: imageId,
    dockerEndpointTransport: 'npipe',
    loopbackBridgeAttachmentUsed: true,
    postgresImageIdentityVerified: true,
    trackedPrismaClientsRemaining: 0,
    prismaDisconnectFailures: 0,
    trackedChildrenRemaining: 0,
    roleSaturation: {
      api: createValidRoleEvidence(5, 5),
      'core-worker': createValidRoleEvidence(6, 10),
      'media-worker': createValidRoleEvidence(3, 10),
    },
    aggregate: {
      api: 20,
      coreWorker: 12,
      mediaWorker: 6,
      runtimeTotal: 38,
      sampledOvershootObserved: false,
      sessionsAfterDisconnect: {
        api: 0,
        'core-worker': 0,
        'media-worker': 0,
      },
    },
    cutback: {
      api: { ...cutback },
      'core-worker': { ...cutback },
      'media-worker': { ...cutback },
    },
    cleanup: {
      exactNameContainersRemaining: 0,
      exactNameNetworksRemaining: 0,
      currentRunLabeledContainersRemaining: 0,
      currentRunLabeledNetworksRemaining: 0,
      scratchFilesRemaining: 0,
      retainedSanitizedSummaryFiles: 1,
      inspectionVerified: true,
    },
  };
}

function createFinalizerFixture(options = {}) {
  const tracker = options.tracker ?? new ChildProcessTracker();
  const clients = options.clients ?? new Set();
  const state = new EvidenceState({
    trackedPrismaClients: clients,
    trackedChildProcesses: tracker.children,
    ownedDockerResources: options.ownedDockerResources ?? new Map(),
  });
  state.transition(EVIDENCE_PHASE.READY);
  state.transition(EVIDENCE_PHASE.RUNNING);
  if (options.disableSummary !== false) state.disableSummary('unit test');
  const fileTracker = new EvidenceFileTracker();
  const context = {
    state,
    clients,
    childTracker: tracker,
    cleanup: options.cleanup ?? new CleanupManager(),
    fileTracker,
    dockerEndpointVerified: options.dockerEndpointVerified ?? true,
    postgresImageId: options.postgresImageId ?? null,
    sensitiveValues: [],
    summaryPath: path.join(
      os.tmpdir(),
      `b1-unit-${Date.now()}-${Math.random()}.json`,
    ),
    buildSummary: () => createValidSummary(),
  };
  return { state, tracker, clients, fileTracker, context };
}

function finalizerInspectionOperations(overrides = {}) {
  return {
    cleanupResources: async () => ({ ok: true, failures: [] }),
    verifyExactNames: async () => ({
      exactNameContainersRemaining: 0,
      exactNameNetworksRemaining: 0,
    }),
    verifyCurrentRunLabels: async () => ({
      currentRunLabeledContainersRemaining: 0,
      currentRunLabeledNetworksRemaining: 0,
    }),
    removeSignalHandlers: () => undefined,
    ...overrides,
  };
}

test('enforces the exact approved Node version', () => {
  assert.equal(assertExactNodeVersion(EXPECTED_NODE_VERSION), 'v22.23.1');
  assert.throws(() => assertExactNodeVersion('v22.21.1'), /Approved Node/u);
});

test('fault injection accepts only the explicit rehearsal enum', () => {
  assert.equal(validateFaultInjection(undefined), 'NONE');
  assert.equal(
    validateFaultInjection('FAIL_AFTER_READINESS'),
    'FAIL_AFTER_READINESS',
  );
  assert.throws(() => validateFaultInjection('DROP_DATABASE'), /invalid/u);
});

test('fault matrix contains every F01 through F38 exactly once', () => {
  assert.equal(FAULT_MATRIX.length, 38);
  assert.deepEqual(
    FAULT_MATRIX.map(([id]) => id),
    Array.from(
      { length: 38 },
      (_, index) => `F${String(index + 1).padStart(2, '0')}`,
    ),
  );
  assert.ok(
    FAULT_MATRIX.every((entry) => entry.length === 4 && entry.every(Boolean)),
  );
});

test('evidence state transitions monotonically', () => {
  const state = new EvidenceState();
  assert.equal(state.transition(EVIDENCE_PHASE.READY), EVIDENCE_PHASE.READY);
  assert.equal(
    state.transition(EVIDENCE_PHASE.RUNNING),
    EVIDENCE_PHASE.RUNNING,
  );
  assert.throws(() => state.transition(EVIDENCE_PHASE.READY), /monotonic/u);
});

test('first signal wins and PASS eligibility never recovers', () => {
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  assert.equal(state.latchSignal('SIGINT'), true);
  assert.equal(state.latchSignal('SIGTERM'), false);
  assert.equal(state.interrupted, true);
  assert.equal(state.firstSignal, 'SIGINT');
  assert.equal(state.requestedExitCode, 130);
  assert.equal(state.summaryEligibility, false);
  assert.throws(() => state.assertSummaryEligible(), /not eligible/u);
});

test('a main continuation registered before a signal observes the latched exit code', async () => {
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  const continuation = Promise.resolve().then(() => state.requestedExitCode);
  state.latchSignal('SIGTERM');
  assert.equal(await continuation, 143);
});

test('signal router maps SIGINT to 130 and joins one finalizer', async () => {
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  let calls = 0;
  const exitCodes = [];
  const finalization = Promise.resolve({ ok: false });
  const route = createSignalCleanupRouter({
    state,
    finalize: () => {
      calls += 1;
      return finalization;
    },
    setExitCode: (code) => exitCodes.push(code),
  });
  assert.equal(route('SIGINT'), finalization);
  assert.equal(route('SIGTERM'), finalization);
  await finalization;
  assert.equal(calls, 2);
  assert.deepEqual(exitCodes, [130]);
  assert.equal(state.firstSignal, 'SIGINT');
});

test('signal during an existing finalization permanently disables PASS', async () => {
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.FINALIZING);
  let resolveFinalization;
  const finalization = new Promise((resolve) => {
    resolveFinalization = resolve;
  });
  state.finalizationPromise = finalization;
  const route = createSignalCleanupRouter({
    state,
    finalize: () => state.finalizationPromise,
    setExitCode: (code) => {
      assert.equal(code, 143);
    },
  });
  const routed = route('SIGTERM');
  assert.equal(routed, finalization);
  assert.equal(state.summaryEligibility, false);
  resolveFinalization({ ok: false });
  await routed;
});

test('signal latched after finalization but before output emits no PASS result', () => {
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.FINALIZED);
  state.latchSignal('SIGINT');
  const output = [];
  assert.throws(
    () =>
      emitPassPublication(
        state,
        { summaryPath: 'sanitized-summary', summaryHash: 'a'.repeat(64) },
        { write: (value) => output.push(value) },
      ),
    /not eligible/u,
  );
  assert.deepEqual(output, []);
});

test('sanitizes unique Docker resource suffixes', () => {
  assert.equal(sanitizeResourceSuffix(' B1/Run_ABC! '), 'b1-run-abc');
  assert.match(sanitizeResourceSuffix('A'.repeat(80)), /^[a-z0-9-]{1,32}$/u);
  assert.throws(() => sanitizeResourceSuffix('!!!'), /suffix/u);
});

test('accepts local npipe and absolute local Unix Docker endpoints', () => {
  assert.deepEqual(parseLocalDockerEndpoint('npipe:////./pipe/docker_engine'), {
    endpoint: 'npipe:////./pipe/docker_engine',
    transport: 'npipe',
  });
  assert.deepEqual(parseLocalDockerEndpoint('unix:///var/run/docker.sock'), {
    endpoint: 'unix:///var/run/docker.sock',
    transport: 'unix',
  });
});

test('rejects TCP, SSH, HTTP, HTTPS, unknown, and malformed Docker endpoints', () => {
  for (const endpoint of [
    'tcp://127.0.0.1:2375',
    'ssh://operator@example.test',
    'http://example.test',
    'https://example.test',
    'ftp://example.test',
    '',
    'unix://relative.sock',
    'unix:////remote/docker.sock',
    'npipe:////remote/pipe/docker_engine',
    'malformed',
  ]) {
    assert.throws(() => parseLocalDockerEndpoint(endpoint), /approved local/u);
  }
});

test('remote DOCKER_HOST is rejected before any command', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      resolvePinnedLocalDockerEndpoint({
        environment: { docker_host: 'tcp://remote.example.test:2375' },
        commandRunner: async (...args) => {
          calls.push(args);
          return healthyDockerResult();
        },
      }),
    /approved local/u,
  );
  assert.equal(calls.length, 0);
});

test('remote Docker context is rejected before daemon verification or mutation', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      resolvePinnedLocalDockerEndpoint({
        environment: { PATH: process.env.PATH },
        commandRunner: async (command, args) => {
          calls.push([command, ...args]);
          return args[1] === 'show'
            ? healthyDockerResult('remote-context\n')
            : healthyDockerResult(
                JSON.stringify([
                  {
                    Endpoints: {
                      docker: { Host: 'ssh://remote.example.test' },
                    },
                  },
                ]),
              );
        },
      }),
    /approved local/u,
  );
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((call) => call.includes('run') || call.includes('version')),
    false,
  );
});

test('conflicting Docker selectors are rejected without commands', async () => {
  const environment = {
    Docker_Host: 'npipe:////./pipe/docker_engine',
    docker_context: 'desktop-linux',
  };
  assert.throws(
    () => inspectDockerSelectorEnvironment(environment),
    /contradictory/u,
  );
  let calls = 0;
  await assert.rejects(
    () =>
      resolvePinnedLocalDockerEndpoint({
        environment,
        commandRunner: async () => {
          calls += 1;
          return healthyDockerResult();
        },
      }),
    /contradictory/u,
  );
  assert.equal(calls, 0);
});

test('minimal child environment is case-insensitive and strips remote Docker state', async () => {
  const environment = {
    Path: 'C:\\approved-tools',
    temp: 'C:\\approved-temp',
    docker_host: 'npipe:////./pipe/docker_engine',
    DOCKER_TLS_VERIFY: '1',
    docker_cert_path: 'C:\\remote-certificates',
    DOCKER_AUTH_CONFIG: 'registry-auth-blob',
    SSH_AUTH_SOCK: 'remote-agent',
  };
  const policy = await resolvePinnedLocalDockerEndpoint({ environment });
  assert.deepEqual(policy.childEnvironment, {
    PATH: 'C:\\approved-tools',
    TEMP: 'C:\\approved-temp',
    DOCKER_HOST: 'npipe:////./pipe/docker_engine',
  });
  assert.throws(
    () => buildMinimalChildEnvironment({ Path: 'one', PATH: 'two' }),
    /contradictory/u,
  );
});

test('Docker context parsing retains only the selected local endpoint', () => {
  const output = JSON.stringify([
    {
      Name: 'desktop-linux',
      Endpoints: { docker: { Host: 'npipe:////./pipe/docker_engine' } },
    },
  ]);
  assert.equal(
    parseDockerContextInspection(output),
    'npipe:////./pipe/docker_engine',
  );
  assert.throws(() => parseDockerContextInspection('{}'), /inspection/u);
});

test('parses only an exact random loopback published port', () => {
  assert.equal(parsePublishedPort('127.0.0.1:49152\n'), 49152);
  assert.throws(() => parsePublishedPort('0.0.0.0:49152'), /mapping/u);
  assert.equal(
    parsePublishedPortInspection(
      JSON.stringify({
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }],
      }),
    ),
    54321,
  );
  assert.throws(() => parsePublishedPortInspection('{}'));
});

test('published-port discovery has a deterministic bounded timeout', async () => {
  const started = Date.now();
  await assert.rejects(
    () =>
      withDeadline('Published-port discovery', () => new Promise(() => {}), {
        timeoutMs: 30,
      }),
    /bounded deadline/u,
  );
  assert.ok(Date.now() - started < 1000);
});

test('accepts only exact lowercase immutable image IDs and inventories', () => {
  assert.equal(parseDockerImageId(`${imageId}\n`), imageId);
  assert.deepEqual(parseDockerImageIdList(`${imageId}\n${imageId}\n`), [
    imageId,
  ]);
  assert.throws(
    () => parseDockerImageId(`sha256:${'A'.repeat(64)}`),
    /identity/u,
  );
  assert.throws(
    () => parseDockerImageIdList('postgres:16-alpine'),
    /inventory/u,
  );
});

test('missing image blocks before network mutation', async () => {
  let mutated = false;
  await assert.rejects(
    () =>
      runImageGateBeforeMutation({
        inspectImage: () =>
          inspectExistingPostgresImageId(
            {
              repositoryRoot: process.cwd(),
              childEnvironment: { PATH: process.env.PATH },
              childTracker: new ChildProcessTracker(),
              sensitiveValues: [],
            },
            async () => ({ ...healthyDockerResult(), ok: false, exitCode: 1 }),
          ),
        mutate: async () => {
          mutated = true;
        },
      }),
    /unavailable/u,
  );
  assert.equal(mutated, false);
});

test('network creation is internal and exactly labeled', () => {
  const args = buildDockerNetworkCreateArgs({
    suffix: 'run-123',
    networkName: 'prd3-g01-b1-run-123-net',
  });
  assert.deepEqual(args.slice(0, 3), ['network', 'create', '--internal']);
  assert.ok(args.includes('com.moazez.evidence.gate=PRD3-G01-B1'));
  assert.ok(args.includes('com.moazez.evidence.run=run-123'));
});

test('PostgreSQL execution disables pulls and uses only the immutable image ID', () => {
  const args = buildPostgresRunArgs(
    {
      suffix: 'run-123',
      networkName: 'prd3-g01-b1-run-123-net',
      containerName: 'prd3-g01-b1-run-123-postgres',
      postgresImageId: imageId,
    },
    {
      databaseUser: 'synthetic_user',
      databasePassword: 'synthetic_password',
      databaseName: 'synthetic_database',
    },
  );
  assert.ok(args.includes('--pull=never'));
  assert.ok(args.includes(imageId));
  assert.equal(args.includes('postgres:16-alpine'), false);
  assert.deepEqual(
    buildPublishedPortInspectionArgs({ containerName: 'owned' }),
    [
      'container',
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      'owned',
    ],
  );
});

test('built-in bridge metadata is verified before owned-container attachment', () => {
  assert.deepEqual(buildBuiltInBridgeInspectionArgs(), [
    'network',
    'inspect',
    '--format',
    '{{json .}}',
    'bridge',
  ]);
  assert.equal(
    parseBuiltInBridgeInspection(
      JSON.stringify({
        Name: 'bridge',
        Driver: 'bridge',
        Scope: 'local',
        Internal: false,
      }),
    ),
    true,
  );
  assert.throws(
    () =>
      parseBuiltInBridgeInspection(
        JSON.stringify({
          Name: 'bridge',
          Driver: 'overlay',
          Scope: 'local',
          Internal: false,
        }),
      ),
    /metadata/u,
  );
  assert.deepEqual(
    buildLoopbackBridgeAttachmentArgs({ containerName: 'owned' }),
    ['network', 'connect', 'bridge', 'owned'],
  );
});

test('exact P2024 classifier rejects other Prisma and plain errors', () => {
  class KnownRequestError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  assert.equal(
    isExactP2024(new KnownRequestError('P2024'), KnownRequestError),
    true,
  );
  assert.equal(
    isExactP2024(new KnownRequestError('P2025'), KnownRequestError),
    false,
  );
  assert.equal(isExactP2024(new Error('P2024'), KnownRequestError), false);
});

test('validates timeout windows and exact aggregate 20/12/6/38', () => {
  assert.deepEqual(timeoutWindow(5), { minimumMs: 4250, maximumMs: 10_000 });
  assert.equal(
    validateRoleObservation(exactRoleCounts, exactRoleCounts, {
      requireExact: true,
      totalLimit: 38,
    }),
    38,
  );
  assert.equal(
    validateAggregateBudget(
      {
        roleCounts: exactRoleCounts,
        runtimeTotal: 38,
        sampledOvershootObserved: false,
      },
      { roleCounts: exactRoleCounts, runtimeTotal: 38 },
    ),
    true,
  );
  assert.throws(
    () =>
      validateAggregateBudget(
        {
          roleCounts: { ...exactRoleCounts, api: 21 },
          runtimeTotal: 39,
          sampledOvershootObserved: true,
        },
        { roleCounts: exactRoleCounts, runtimeTotal: 38 },
      ),
    /api|aggregate/iu,
  );
});

test('sampler records sampled overshoot before failing closed', async () => {
  const observer = {
    $queryRawUnsafe: async () =>
      Array.from({ length: 21 }, () => ({
        application_name: 'moazez-api',
        state: 'active',
        wait_event_type: null,
        wait_event: null,
        backend_start: new Date(),
      })),
  };
  const sampler = new ActivitySampler(observer, exactRoleCounts);
  await assert.rejects(() => sampler.sample(), /exceed/u);
  assert.equal(sampler.sampledOvershootObserved, true);
});

test('never-resolving sampler query and sampler stop are bounded', async () => {
  const sampler = new ActivitySampler(
    { $queryRawUnsafe: () => new Promise(() => {}) },
    exactRoleCounts,
    { queryTimeoutMs: 30, stopTimeoutMs: 100 },
  );
  sampler.start();
  await delay(60);
  await assert.rejects(() => sampler.stop(), /deadline/u);

  const stalledStop = new ActivitySampler({}, exactRoleCounts, {
    stopTimeoutMs: 30,
  });
  stalledStop.running = true;
  stalledStop.loopPromise = new Promise(() => {});
  await assert.rejects(() => stalledStop.stop(), /deadline/u);
});

test('abort prevents a late sampler query from updating successful evidence', async () => {
  let resolveQuery;
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  const sampler = new ActivitySampler(
    {
      $queryRawUnsafe: () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    },
    exactRoleCounts,
    { state, queryTimeoutMs: 1000 },
  );
  const sample = sampler.sample();
  await delay(0);
  state.latchSignal('SIGINT');
  resolveQuery([]);
  await assert.rejects(() => sample, /aborted/u);
  assert.equal(sampler.sampleCount, 0);
  assert.deepEqual(sampler.maximum, {
    api: 0,
    'core-worker': 0,
    'media-worker': 0,
  });
});

test('rejected and never-resolving sleepers fail within bounded teardown', async () => {
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  const rejected = startSleepers(
    {
      $queryRawUnsafe: async () => {
        throw new Error('synthetic sleeper rejection');
      },
    },
    1,
    1,
    state,
    { timeoutMs: 100 },
  );
  await assert.rejects(() => rejected, /synthetic sleeper/u);
  const stalled = startSleepers(
    { $queryRawUnsafe: () => new Promise(() => {}) },
    1,
    1,
    state,
    { timeoutMs: 30 },
  );
  await assert.rejects(() => stalled, /deadline/u);
  await assert.rejects(
    () =>
      settleScenarioPromises([new Promise(() => {})], state, { timeoutMs: 30 }),
    /deadline/u,
  );
});

test('observer and recovery query failures are bounded and sanitized', async () => {
  await assert.rejects(
    () =>
      runBoundedPrismaOperation('Observer query', () => new Promise(() => {}), {
        timeoutMs: 30,
      }),
    /bounded deadline/u,
  );
  await assert.rejects(
    () =>
      executeSelectOne({
        $queryRawUnsafe: async () => {
          throw new Error('synthetic query failure');
        },
      }),
    /synthetic query failure/u,
  );
});

test('normal Prisma disconnect removes a client only after success', async () => {
  const client = { $disconnect: async () => undefined };
  const clients = new Set([client]);
  assert.equal(
    await disconnectClient(client, clients, { timeoutMs: 50 }),
    PRISMA_DISCONNECT_STATUS.SUCCESS,
  );
  assert.equal(clients.size, 0);
});

test('rejected and timed-out disconnects leave clients tracked', async () => {
  const rejectedClient = {
    $disconnect: async () => {
      throw new Error('synthetic rejection');
    },
  };
  const rejected = new Set([rejectedClient]);
  assert.equal(
    await disconnectClient(rejectedClient, rejected, { timeoutMs: 50 }),
    PRISMA_DISCONNECT_STATUS.REJECTED,
  );
  assert.equal(rejected.size, 1);

  const stalledClient = { $disconnect: () => new Promise(() => {}) };
  const stalled = new Set([stalledClient]);
  assert.equal(
    await disconnectClient(stalledClient, stalled, { timeoutMs: 30 }),
    PRISMA_DISCONNECT_STATUS.TIMED_OUT,
  );
  assert.equal(stalled.size, 1);
});

test('two-phase finalizer retries and resolves a client after Docker cleanup', async () => {
  let attempts = 0;
  const calls = [];
  const client = {
    $disconnect: () => {
      attempts += 1;
      return attempts === 1 ? new Promise(() => {}) : Promise.resolve();
    },
  };
  const fixture = createFinalizerFixture({ clients: new Set([client]) });
  const finalize = createEvidenceFinalizer(
    fixture.context,
    finalizerInspectionOperations({
      disconnectPhaseOne: (clients) =>
        disconnectTrackedPrismaClients(clients, 30),
      disconnectPhaseTwo: (clients) =>
        disconnectTrackedPrismaClients(clients, 30),
      cleanupResources: async () => {
        calls.push('docker-cleanup');
        return { ok: true };
      },
    }),
  );
  const result = await finalize();
  assert.equal(result.trackedPrismaClientsRemaining, 0);
  assert.equal(
    result.phaseOneDisconnect[0].status,
    PRISMA_DISCONNECT_STATUS.TIMED_OUT,
  );
  assert.equal(
    result.phaseTwoDisconnect[0].status,
    PRISMA_DISCONNECT_STATUS.SUCCESS,
  );
  assert.deepEqual(calls, ['docker-cleanup']);
});

test('final disconnect rejection and timeout deny PASS while cleanup continues', async () => {
  for (const client of [
    {
      $disconnect: async () => {
        throw new Error('synthetic reject');
      },
    },
    { $disconnect: () => new Promise(() => {}) },
  ]) {
    const calls = [];
    const fixture = createFinalizerFixture({ clients: new Set([client]) });
    const finalize = createEvidenceFinalizer(
      fixture.context,
      finalizerInspectionOperations({
        disconnectPhaseOne: (clients) =>
          disconnectTrackedPrismaClients(clients, 30),
        disconnectPhaseTwo: (clients) =>
          disconnectTrackedPrismaClients(clients, 30),
        terminateChildren: async () => calls.push('children'),
        cleanupResources: async () => {
          calls.push('docker');
          return { ok: true };
        },
      }),
    );
    const result = await finalize();
    assert.equal(result.ok, false);
    assert.equal(result.trackedPrismaClientsRemaining, 1);
    assert.deepEqual(calls, ['children', 'docker']);
  }
});

test('a cleanup failure does not skip disconnect retry or later inspections', async () => {
  const calls = [];
  const fixture = createFinalizerFixture();
  const finalize = createEvidenceFinalizer(
    fixture.context,
    finalizerInspectionOperations({
      disconnectPhaseOne: async () => {
        calls.push('disconnect-1');
        return [];
      },
      terminateChildren: async () => {
        calls.push('children');
        throw new Error('synthetic');
      },
      cleanupResources: async () => {
        calls.push('docker');
        throw new Error('synthetic');
      },
      verifyExactNames: async () => {
        calls.push('names');
        return {
          exactNameContainersRemaining: 0,
          exactNameNetworksRemaining: 0,
        };
      },
      verifyCurrentRunLabels: async () => {
        calls.push('labels');
        return {
          currentRunLabeledContainersRemaining: 0,
          currentRunLabeledNetworksRemaining: 0,
        };
      },
      disconnectPhaseTwo: async () => {
        calls.push('disconnect-2');
        return [];
      },
    }),
  );
  const result = await finalize();
  assert.equal(result.ok, false);
  assert.deepEqual(calls, [
    'disconnect-1',
    'children',
    'docker',
    'names',
    'labels',
    'disconnect-2',
  ]);
});

test('cleanup manager is idempotent', async () => {
  const cleanup = new CleanupManager();
  let calls = 0;
  cleanup.add('fixture', async () => {
    calls += 1;
  });
  const first = cleanup.run();
  assert.equal(first, cleanup.run());
  assert.deepEqual(await first, { ok: true, failures: [] });
  assert.equal(calls, 1);
});

test('cooperative child exits cleanly with shell disabled', async () => {
  const result = await runChild(
    process.execPath,
    ['-e', "process.stdout.write('OK')"],
    { timeoutMs: 2000 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.stdout, 'OK');
  assert.equal(result.timedOut, false);
});

test(
  'SIGTERM-resistant child is force-killed within a bounded timeout',
  { timeout: 10_000 },
  async () => {
    const source =
      "process.on('SIGTERM',()=>{});process.stdout.write('READY\\n');setInterval(()=>{},1000)";
    const result = await runChild(process.execPath, ['-e', source], {
      timeoutMs: 300,
      terminationGraceMs: 150,
      forceKillReapMs: 3000,
    });
    assert.match(result.stdout, /READY/u);
    assert.equal(result.timedOut, true);
    assert.equal(result.ok, false);
    assert.equal(result.termination.reaped, true);
    assert.equal(isProcessAlive(result.childPid), false);
    assert.ok(result.elapsedMs < 6000);
  },
);

test(
  'abort force-kills a SIGTERM-resistant child',
  { timeout: 10_000 },
  async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300);
    try {
      const result = await runChild(
        process.execPath,
        ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
        {
          timeoutMs: 5000,
          terminationGraceMs: 150,
          forceKillReapMs: 3000,
          signal: controller.signal,
        },
      );
      assert.equal(result.aborted, true);
      assert.equal(result.ok, false);
      assert.equal(result.termination.reaped, true);
      assert.equal(isProcessAlive(result.childPid), false);
    } finally {
      clearTimeout(timer);
    }
  },
);

test(
  'process-tree termination removes a child and grandchild',
  { timeout: 12_000 },
  async () => {
    const source = [
      "const {spawn}=require('node:child_process');",
      "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});",
      "process.stdout.write(String(child.pid)+'\\n');",
      "process.on('SIGTERM',()=>{});",
      'setInterval(()=>{},1000);',
    ].join('');
    const result = await runChild(process.execPath, ['-e', source], {
      timeoutMs: 500,
      terminationGraceMs: 150,
      forceKillReapMs: 4000,
    });
    const grandchildPid = Number(result.stdout.trim());
    await delay(100);
    assert.equal(result.ok, false);
    assert.equal(result.termination.reaped, true);
    assert.equal(isProcessAlive(result.childPid), false);
    assert.equal(isProcessAlive(grandchildPid), false);
  },
);

test(
  'ordinary finalization terminates every tracked child',
  { timeout: 10_000 },
  async () => {
    const tracker = new ChildProcessTracker({
      graceMs: 100,
      forceReapMs: 3000,
    });
    const child = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
        detached: process.platform !== 'win32',
      },
    );
    tracker.add(child);
    await delay(200);
    const fixture = createFinalizerFixture({ tracker });
    const result = await createEvidenceFinalizer(
      fixture.context,
      finalizerInspectionOperations(),
    )();
    assert.equal(result.trackedChildrenRemaining, 0);
    assert.equal(tracker.children.size, 0);
    assert.equal(isProcessAlive(child.pid), false);
  },
);

test('Windows and POSIX process-tree plans target the complete tree', () => {
  assert.deepEqual(buildProcessTreeTerminationPlan('win32', 1234, true), {
    kind: 'windows-tree-command',
    command: 'taskkill.exe',
    args: ['/PID', '1234', '/T', '/F'],
  });
  assert.deepEqual(buildProcessTreeTerminationPlan('linux', 1234, false), {
    kind: 'posix-process-group',
    processGroupId: -1234,
    signal: 'SIGTERM',
  });
  assert.deepEqual(buildProcessTreeTerminationPlan('darwin', 1234, true), {
    kind: 'posix-process-group',
    processGroupId: -1234,
    signal: 'SIGKILL',
  });
});

test('Docker name inspection is exact and fail-closed', () => {
  assert.equal(
    classifyDockerNameListResult(healthyDockerResult('owned\n'), 'owned'),
    DOCKER_RESOURCE_STATE.EXISTS,
  );
  assert.equal(
    classifyDockerNameListResult(healthyDockerResult(''), 'owned'),
    DOCKER_RESOURCE_STATE.ABSENT,
  );
  assert.equal(
    classifyDockerNameListResult(healthyDockerResult('owned-old\n'), 'owned'),
    DOCKER_RESOURCE_STATE.ABSENT,
  );
  for (const result of [
    { ...healthyDockerResult(), ok: false, exitCode: 1 },
    { ...healthyDockerResult(), ok: false, timedOut: true },
    healthyDockerResult('owned resource\n'),
  ]) {
    assert.throws(
      () => classifyDockerNameListResult(result, 'owned'),
      (error) =>
        error.resourceState === DOCKER_RESOURCE_STATE.INSPECTION_FAILED,
    );
  }
});

test('exact name and ownership labels are required before removal', () => {
  const expected = createEvidenceOwnershipLabels('run-123');
  assert.equal(assertOwnedResourceLabels({ ...expected }, expected), true);
  const containerInspection = {
    Name: '/owned-container',
    Config: { Labels: { ...expected } },
  };
  assert.equal(
    parseDockerOwnershipInspectionResult(
      healthyDockerResult(JSON.stringify(containerInspection)),
      expected,
      'owned-container',
      'container',
    ),
    true,
  );
  assert.throws(() =>
    parseDockerOwnershipInspectionResult(
      healthyDockerResult(
        JSON.stringify({ ...containerInspection, Name: '/renamed' }),
      ),
      expected,
      'owned-container',
      'container',
    ),
  );
  assert.throws(
    () =>
      assertOwnedResourceLabels(
        { [EVIDENCE_GATE_LABEL]: 'PRD3-G01-B1' },
        expected,
      ),
    /ownership/u,
  );
  assert.throws(
    () =>
      assertOwnedResourceLabels(
        { ...expected, [EVIDENCE_RUN_LABEL]: 'other-run' },
        expected,
      ),
    /ownership/u,
  );
});

test('cleanup is registered only after successful creation', async () => {
  const calls = [];
  await createOwnedResourceAndRegisterCleanup({
    create: async () => calls.push('create'),
    reconcileFailedCreate: async () => calls.push('reconcile'),
    registerCleanup: () => calls.push('register'),
  });
  assert.deepEqual(calls, ['create', 'register']);
  const failed = [];
  await assert.rejects(
    () =>
      createOwnedResourceAndRegisterCleanup({
        create: async () => {
          failed.push('create');
          throw new Error('network-create failure');
        },
        reconcileFailedCreate: async () => failed.push('reconcile'),
        registerCleanup: () => failed.push('register'),
      }),
    /network-create/u,
  );
  assert.deepEqual(failed, ['create', 'reconcile']);
});

test('failed network or container creation cannot delete an unowned same-name object', async () => {
  for (const kind of ['network', 'container']) {
    let removed = false;
    await assert.rejects(
      () =>
        reconcileFailedOwnedResourceCreationWithOperations({
          inspectState: async () => DOCKER_RESOURCE_STATE.EXISTS,
          verifyOwnership: async () => {
            throw new Error(`${kind} ownership mismatch`);
          },
          remove: async () => {
            removed = true;
          },
        }),
      /ownership/u,
    );
    assert.equal(removed, false);
  }
});

test('current-run label sweep uses both exact labels and exact run identity', () => {
  const current = createEvidenceOwnershipLabels('current-run');
  const args = dockerCurrentRunLabelListArgs('container', current);
  assert.ok(args.includes('label=com.moazez.evidence.gate=PRD3-G01-B1'));
  assert.ok(args.includes('label=com.moazez.evidence.run=current-run'));
  assert.equal(args.includes('label=com.moazez.evidence.run=other-run'), false);
});

test('exact-name absence is insufficient when a renamed labeled resource remains', () => {
  const complete = {
    exactNameContainersRemaining: 0,
    exactNameNetworksRemaining: 0,
    currentRunLabeledContainersRemaining: 0,
    currentRunLabeledNetworksRemaining: 0,
    inspectionVerified: true,
  };
  assert.equal(validateDockerCleanupResult(complete), true);
  assert.throws(
    () =>
      validateDockerCleanupResult({
        ...complete,
        currentRunLabeledContainersRemaining: 1,
      }),
    /remain/u,
  );
  assert.throws(
    () =>
      validateDockerCleanupResult({
        ...complete,
        currentRunLabeledNetworksRemaining: 1,
      }),
    /remain/u,
  );
  assert.throws(
    () =>
      validateDockerCleanupResult({ ...complete, inspectionVerified: false }),
    /remain/u,
  );
});

test('retained summaries and scratch paths use actual tracked filesystem state', async () => {
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'b1-file-tracker-'),
  );
  const summary = path.join(directory, 'summary.json');
  const scratch = path.join(directory, 'scratch.json');
  const tracker = new EvidenceFileTracker();
  try {
    tracker.registerRetainedSanitizedSummary(summary);
    tracker.registerScratch(scratch);
    await fsp.writeFile(summary, '{}');
    await fsp.writeFile(scratch, '{}');
    assert.deepEqual(tracker.snapshot(), {
      scratchFilesRemaining: 1,
      retainedSanitizedSummaryFiles: 1,
    });
    await fsp.rm(scratch);
    assert.deepEqual(tracker.snapshot(), {
      scratchFilesRemaining: 0,
      retainedSanitizedSummaryFiles: 1,
    });
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test('summary schema version 5 validates exact terminal invariants', () => {
  const summary = createValidSummary();
  assert.equal(validateSummarySchemaV5(summary), true);
  assert.equal(validateCleanupResult(summary.cleanup), true);
  assert.equal(validateCutbackResult(summary.cutback), true);
  assert.throws(
    () => validateSummarySchemaV5({ ...summary, interrupted: true }),
    /schema/u,
  );
  assert.throws(
    () =>
      validateSummarySchemaV5({ ...summary, trackedPrismaClientsRemaining: 1 }),
    /schema/u,
  );
});

test('summary sanitizer rejects keys and values containing endpoint or credential material', () => {
  const safe = createValidSummary();
  assert.equal(assertSanitizedSummary(safe), true);
  for (const unsafe of [
    { DOCKER_HOST: 'redacted' },
    { endpoint: 'redacted' },
    { hostname: 'redacted' },
    { hostPort: 5432 },
    { socketPath: 'redacted' },
    { databaseUrl: 'redacted' },
    { username: 'redacted' },
    { password: 'redacted' },
    { databaseName: 'redacted' },
    { environmentDump: 'redacted' },
  ]) {
    assert.throws(
      () => assertSanitizedSummary({ ...safe, ...unsafe }),
      /forbidden sensitive/u,
    );
  }
  assert.throws(
    () =>
      assertSanitizedSummary({
        ...safe,
        detail: 'postgresql://fixture:fixture@127.0.0.1/db',
      }),
    /endpoint|credential/u,
  );
  assert.throws(
    () => assertSanitizedSummary({ ...safe, dockerEndpointTransport: 'tcp' }),
    /transport/u,
  );
});

test('redaction removes connection URLs and exact sensitive inputs', () => {
  const output = redactText(
    'failed postgresql://fixture:fixture@127.0.0.1:5432/db value=SENSITIVE',
    ['SENSITIVE'],
  );
  assert.doesNotMatch(output, /fixture|SENSITIVE/u);
  assert.match(output, /REDACTED/u);
});

test('atomic summary publication fsyncs, renames, hashes, and accounts honestly', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'b1-atomic-'));
  const finalPath = path.join(directory, 'summary.json');
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  const tracker = new EvidenceFileTracker();
  try {
    const result = await writeAtomicSanitizedSummary({
      state,
      fileTracker: tracker,
      summary: createValidSummary(),
      summaryPath: finalPath,
    });
    assert.equal(fs.existsSync(finalPath), true);
    assert.match(result.summaryHash, /^[a-f0-9]{64}$/u);
    assert.deepEqual(tracker.snapshot(), {
      scratchFilesRemaining: 0,
      retainedSanitizedSummaryFiles: 1,
    });
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test('signal immediately before summary creation forbids scratch and retained evidence', async () => {
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'b1-signal-before-'),
  );
  const finalPath = path.join(directory, 'summary.json');
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  state.latchSignal('SIGINT');
  await assert.rejects(
    () =>
      writeAtomicSanitizedSummary({
        state,
        fileTracker: new EvidenceFileTracker(),
        summary: createValidSummary(),
        summaryPath: finalPath,
      }),
    /not eligible/u,
  );
  assert.equal(fs.existsSync(finalPath), false);
  await fsp.rm(directory, { recursive: true, force: true });
});

test('signal during scratch write removes partial and retained evidence', async () => {
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'b1-signal-write-'),
  );
  const finalPath = path.join(directory, 'summary.json');
  const state = new EvidenceState();
  state.transition(EVIDENCE_PHASE.RUNNING);
  const tracker = new EvidenceFileTracker();
  await assert.rejects(
    () =>
      writeAtomicSanitizedSummary({
        state,
        fileTracker: tracker,
        summary: createValidSummary(),
        summaryPath: finalPath,
        hooks: { afterScratchWrite: () => state.latchSignal('SIGTERM') },
      }),
    /not eligible/u,
  );
  assert.equal(fs.existsSync(finalPath), false);
  assert.deepEqual(tracker.snapshot(), {
    scratchFilesRemaining: 0,
    retainedSanitizedSummaryFiles: 0,
  });
  await fsp.rm(directory, { recursive: true, force: true });
});

test('summary validation, rename, and hash failures retain no evidence', async () => {
  for (const mode of ['validation', 'rename', 'hash']) {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), `b1-${mode}-`));
    const finalPath = path.join(directory, 'summary.json');
    const state = new EvidenceState();
    state.transition(EVIDENCE_PHASE.RUNNING);
    const tracker = new EvidenceFileTracker();
    const options = {
      state,
      fileTracker: tracker,
      summary:
        mode === 'validation'
          ? { ...createValidSummary(), overall: 'FAIL' }
          : createValidSummary(),
      summaryPath: finalPath,
    };
    if (mode === 'rename')
      options.renameFile = async () => {
        throw new Error('synthetic rename failure');
      };
    if (mode === 'hash')
      options.readFile = async () => {
        throw new Error('synthetic hash failure');
      };
    await assert.rejects(() => writeAtomicSanitizedSummary(options));
    assert.equal(fs.existsSync(finalPath), false);
    assert.deepEqual(tracker.snapshot(), {
      scratchFilesRemaining: 0,
      retainedSanitizedSummaryFiles: 0,
    });
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test('PASS remains forbidden after evidence or cleanup failure', () => {
  const evidenceFailure = new EvidenceState();
  evidenceFailure.disableSummary('evidence failure');
  assert.throws(() => evidenceFailure.assertSummaryEligible(), /not eligible/u);
  const cleanupFailure = new EvidenceState();
  cleanupFailure.disableSummary('cleanup failure', 'cleanup');
  assert.throws(() => cleanupFailure.assertSummaryEligible(), /not eligible/u);
});

test('both independent normal runs are required', () => {
  assert.equal(validateRequiredRunResults([true, true]), true);
  assert.throws(
    () => validateRequiredRunResults([true, false]),
    /Both independent/u,
  );
  assert.throws(() => validateRequiredRunResults([true]), /Both independent/u);
});

test('caps captured child output', () => {
  const chunks = [];
  let bytes = appendCapped(chunks, Buffer.from('abcdef'), 0, 4);
  bytes = appendCapped(chunks, Buffer.from('ghij'), bytes, 4);
  assert.equal(bytes, 4);
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'abcd');
});
