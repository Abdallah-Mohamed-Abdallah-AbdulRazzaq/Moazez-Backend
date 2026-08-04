'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const b1 = require('../ci/prd3-g01-b-pool-saturation.cjs');
const b2 = require('../ci/prd3-g01-b2-database-recovery.cjs');

const imageId = `sha256:${'a'.repeat(64)}`;
const hash64 = 'b'.repeat(64);
const treeSha = 'c'.repeat(40);
const packageVersion = require('../../package.json').version;
const coveredProofIds = new Set();
const cover = (...proofIds) => proofIds.forEach((proofId) => coveredProofIds.add(proofId));

function body(status = 'ok') {
  return {
    status,
    version: packageVersion,
    timestamp: '2026-08-04T12:00:00.000Z',
  };
}

function management(role, kind, statusCode, elapsedMs = 750) {
  return {
    role,
    kind,
    statusCode,
    contentType: 'application/json',
    cacheControl: 'no-store',
    body: body(statusCode === 200 ? 'ok' : 'unavailable'),
    elapsedMs,
  };
}

function publicHealth() {
  return {
    role: 'api',
    kind: 'public-health',
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    cacheControl: null,
    body: body('ok'),
    elapsedMs: 10,
  };
}

function sessions() {
  return [
    {
      applicationName: 'moazez-api',
      pid: 101,
      backendStart: '2026-08-04T12:00:00.000Z',
    },
    {
      applicationName: 'moazez-core-worker',
      pid: 102,
      backendStart: '2026-08-04T12:00:01.000Z',
    },
    {
      applicationName: 'moazez-media-worker',
      pid: 103,
      backendStart: '2026-08-04T12:00:02.000Z',
    },
  ];
}

function validSummary() {
  const role = {
    outageReadinessStatus: 503,
    outageLivenessStatus: 200,
    outageStartupStatus: 200,
    recoveryReadinessStatus: 200,
    outageDetectionLatencyMs: [800, 790],
    readinessBurstCount: 10,
    readinessBurstMaximumElapsedMs: 800,
    containerIdentityUnchanged: true,
    processIdentityUnchanged: true,
    newDatabaseSessionObserved: true,
    maximumObservedConnections: 1,
    readinessUnavailableEvents: 2,
    readinessRecoveredEvents: 2,
  };
  return {
    schemaVersion: 2,
    gate: 'PRD3-G01-B2',
    overall: 'PASS',
    runId: 'b2-valid-run-123',
    nodeVersion: 'v22.23.1',
    observerPrismaVersion: '6.19.3',
    runtimePrismaVersion: '6.19.3',
    packageVersion,
    baseCommit: b2.BASE_SHA,
    baseTree: treeSha,
    packageLockSha256: hash64,
    runtimeManifestSha256: hash64,
    runtimeImageLabelsVerified: true,
    runtimeManifestVerified: true,
    postgresMajor: 16,
    postgresMaxConnections: 80,
    runtimeImageId: imageId,
    postgresImageId: imageId,
    dockerTransport: 'npipe',
    roles: {
      api: { ...role },
      coreWorker: { ...role },
      mediaWorker: { ...role },
    },
    cycles: [1, 2].map((cycle) => ({
      cycle,
      publicHealthDuringOutage: 200,
      roles: {
        api: {
          outageReadinessStatus: 503,
          outageLivenessStatus: 200,
          outageStartupStatus: 200,
          recoveryReadinessStatus: 200,
          detectionLatencyMs: 800,
          readinessBurstCount: 10,
          readinessBurstMaximumElapsedMs: 800,
          recoveredSessionCount: 1,
        },
        coreWorker: {
          outageReadinessStatus: 503,
          outageLivenessStatus: 200,
          outageStartupStatus: 200,
          recoveryReadinessStatus: 200,
          detectionLatencyMs: 810,
          readinessBurstCount: 10,
          readinessBurstMaximumElapsedMs: 810,
          recoveredSessionCount: 1,
        },
        mediaWorker: {
          outageReadinessStatus: 503,
          outageLivenessStatus: 200,
          outageStartupStatus: 200,
          recoveryReadinessStatus: 200,
          detectionLatencyMs: 820,
          readinessBurstCount: 10,
          readinessBurstMaximumElapsedMs: 820,
          recoveredSessionCount: 1,
        },
      },
    })),
    publicHealthDuringOutage: 200,
    oldBackendSessionsRemaining: 0,
    forcedSessionsTerminated: 3,
    repeatedRecoveryCycles: 2,
    startupUnavailable: {
      api: 'FAIL_CLOSED_EXITED',
      coreWorker: 'FAIL_CLOSED_EXITED',
      mediaWorker: 'FAIL_CLOSED_EXITED',
    },
    freshStartupAfterRecovery: { api: true, coreWorker: true, mediaWorker: true },
    cleanup: {
      trackedPrismaClientsRemaining: 0,
      prismaDisconnectFailures: 0,
      trackedChildrenRemaining: 0,
      exactNameContainersRemaining: 0,
      exactNameNetworksRemaining: 0,
      currentRunLabeledContainersRemaining: 0,
      currentRunLabeledNetworksRemaining: 0,
      roleSessionsRemaining: 0,
      scratchFilesRemaining: 0,
      inspectionVerified: true,
    },
  };
}

function createFinalizerHarness(client, operationOverrides = {}) {
  const trackedPrismaClients = new Set(client ? [client] : []);
  const childTracker = new b1.ChildProcessTracker();
  const ownedDockerResources = new Map();
  const state = new b1.EvidenceState({
    trackedPrismaClients,
    trackedChildProcesses: childTracker.children,
    ownedDockerResources,
  });
  state.transition(b1.EVIDENCE_PHASE.READY);
  state.transition(b1.EVIDENCE_PHASE.RUNNING);
  const order = [];
  const context = {
    state,
    childTracker,
    cleanup: new b1.CleanupManager(),
    fileTracker: new b1.EvidenceFileTracker(),
    fixtures: [],
    pausedContainers: new Set(),
    allOwnedNames: new Map(),
    initialImageIds: [],
    sensitiveValues: [],
    removeSignalHandlers() {
      order.push('signals');
    },
    buildSummary: validSummary,
  };
  const operations = {
    stopRuntimes: async () => order.push('runtimes'),
    terminateChildren: async () => order.push('children'),
    cleanupResources: async () => {
      order.push('resources');
      return { ok: true };
    },
    verifyExactNames: async () => {
      order.push('exact');
      return { containers: 0, networks: 0 };
    },
    verifyLabels: async () => {
      order.push('labels');
      return { containers: 0, networks: 0 };
    },
    verifyImages: async () => {
      order.push('images');
      return [];
    },
    disconnectPhaseOne:
      operationOverrides.phaseOne ??
      ((clients) => b1.disconnectTrackedPrismaClients(clients, 30)),
    disconnectPhaseTwo:
      operationOverrides.phaseTwo ??
      ((clients) => b1.disconnectTrackedPrismaClients(clients, 30)),
    publishSummary:
      operationOverrides.publishSummary ??
      (async () => {
        order.push('publication');
        return { summaryPath: 'sanitized-summary.json', summaryHash: hash64 };
      }),
    ...operationOverrides.operations,
  };
  context.finalize = b2.createB2Finalizer(context, operations);
  return { context, state, order, trackedPrismaClients };
}

test('requires the exact approved Node runtime', () => {
  assert.equal(b1.assertExactNodeVersion(b2.EXPECTED_NODE_VERSION), 'v22.23.1');
  assert.throws(() => b1.assertExactNodeVersion('v22.21.1'), /Approved Node/u);
});

test('canonical suite runs bundled npm and npx through approved node without a shell', () => {
  for (const name of ['npm', 'npx']) {
    const command = b2.approvedNodeToolCommand(name);
    assert.equal(command.executable, process.execPath);
    assert.equal(command.argsPrefix.length, 1);
    assert.equal(fs.existsSync(command.argsPrefix[0]), true);
    assert.match(command.argsPrefix[0].replaceAll('\\', '/'), new RegExp(`/npm/bin/${name}-cli\\.js$`, 'u'));
  }
  assert.throws(() => b2.approvedNodeToolCommand('node'), /name/u);
});

test('accepts only the four exact B2 scenario names', () => {
  for (const scenario of b2.SCENARIOS) assert.equal(b2.assertScenarioName(scenario), scenario);
  assert.throws(() => b2.assertScenarioName('database-recovery'), /scenario/u);
});

test('accepts only the exact B2 fault-injection enum', () => {
  assert.equal(b2.validateFaultInjection(undefined), 'NONE');
  assert.equal(b2.validateFaultInjection('FALSE_READY_DURING_OUTAGE'), 'FALSE_READY_DURING_OUTAGE');
  assert.throws(() => b2.validateFaultInjection('UNKNOWN'), /selector/u);
});

test('documents every B2-F01 through B2-F29 mode exactly once', () => {
  assert.equal(b2.FAULT_MATRIX.length, 29);
  assert.deepEqual(
    b2.FAULT_MATRIX.map(({ id }) => id),
    Array.from({ length: 29 }, (_, index) => `B2-F${String(index + 1).padStart(2, '0')}`),
  );
  assert.equal(new Set(b2.FAULT_MATRIX.map(({ proofId }) => proofId)).size, 29);
  assert.ok(
    b2.FAULT_MATRIX.every(
      ({ id, injection, expectedClassification, expectedCleanup, summaryEligible, proofType, proofId }) =>
        id && injection && expectedClassification && expectedCleanup && summaryEligible === false && proofType && proofId,
    ),
  );
});

test('fault coverage parser accepts one TAP diagnostic and rejects ambiguity', () => {
  assert.deepEqual(
    [...b2.parseFaultCoverageMarker('# B2_PROOF_COVERAGE=endpoint-policy,image-gate\n')],
    ['endpoint-policy', 'image-gate'],
  );
  assert.throws(
    () => b2.parseFaultCoverageMarker(
      '# B2_PROOF_COVERAGE=endpoint-policy\nB2_PROOF_COVERAGE=image-gate\n',
    ),
    /marker/u,
  );
  assert.throws(
    () => b2.parseFaultCoverageMarker('# B2_PROOF_COVERAGE=endpoint-policy,endpoint-policy\n'),
    /duplicates/u,
  );
});

test('rejects remote and malformed Docker endpoints before daemon execution', async () => {
  for (const endpoint of ['tcp://remote.example.invalid:2375', 'ssh://remote.example.invalid', 'https://remote.example.invalid', 'malformed']) {
    let calls = 0;
    await assert.rejects(
      () => b1.resolvePinnedLocalDockerEndpoint({
        environment: { DOCKER_HOST: endpoint },
        commandRunner: async () => {
          calls += 1;
          return { ok: true, exitCode: 0, stdout: '' };
        },
      }),
      /approved local/u,
    );
    assert.equal(calls, 0);
  }
  cover('endpoint-policy');
});

test('B2 ownership labels are immutable and gate-specific', () => {
  assert.deepEqual(b2.createOwnershipLabels('run-123'), {
    'com.moazez.evidence.gate': 'PRD3-G01-B2',
    'com.moazez.evidence.run': 'run-123',
  });
  assert.equal(Object.isFrozen(b2.createOwnershipLabels('run-123')), true);
});

test('network creation is internal and uses both B2 ownership labels', () => {
  const args = b2.buildNetworkCreateArgs({
    labels: b2.createOwnershipLabels('run-123'),
    networkName: 'b2-run-123-net',
  });
  assert.deepEqual(args.slice(0, 3), ['network', 'create', '--internal']);
  assert.ok(args.includes('com.moazez.evidence.gate=PRD3-G01-B2'));
  assert.ok(args.includes('com.moazez.evidence.run=run-123'));
});

test('PostgreSQL fixture is tmpfs, loopback-only, no-pull, and immutable-ID based', () => {
  const context = {
    labels: b2.createOwnershipLabels('run-123'),
    networkName: 'b2-run-123-net',
    imageIds: { postgres: imageId },
  };
  const args = b2.buildPostgresRunArgs(context, { name: 'b2-postgres' });
  assert.ok(args.includes('--pull=never'));
  assert.ok(args.includes('127.0.0.1::5432'));
  assert.ok(args.includes('/var/lib/postgresql/data:rw,noexec,nosuid,size=536870912'));
  assert.ok(args.includes(imageId));
  assert.equal(args.includes('postgres:16-alpine'), false);
  assert.ok(args.includes('max_connections=80'));
});

test('Redis and MinIO fixtures are no-pull, tmpfs, and immutable-ID based', () => {
  const context = {
    labels: b2.createOwnershipLabels('run-123'),
    networkName: 'b2-run-123-net',
    redisName: 'b2-redis',
    minioName: 'b2-minio',
    imageIds: { redis: imageId, minio: imageId },
  };
  for (const args of [b2.buildRedisRunArgs(context), b2.buildMinioRunArgs(context)]) {
    assert.ok(args.includes('--pull=never'));
    assert.ok(args.includes(imageId));
    assert.ok(args.includes('--tmpfs'));
  }
});

test('runtime image inspection requires the complete immutable provenance label set', () => {
  const provenance = {
    baseCommit: b2.BASE_SHA,
    baseTree: treeSha,
    packageLockSha256: hash64,
    runtimeManifestSha256: hash64,
    suiteRunId: 'suite-run-123',
  };
  const requiredLabels = b2.requiredRuntimeLabels(provenance);
  const output = JSON.stringify({
    Id: imageId,
    Config: { Labels: requiredLabels },
  });
  assert.deepEqual(b2.parseImageInspection(output, { requiredLabels }), {
    id: imageId,
    labels: requiredLabels,
  });
  assert.throws(
    () => b2.parseImageInspection(JSON.stringify({ Id: imageId, Config: { Labels: {} } }), { requiredLabels }),
    /provenance/u,
  );
  assert.throws(() => b2.parseImageInspection('{'), /inspection/u);
  cover('image-gate', 'provenance-gate');
});

test('database-recovery launcher executes exact compiled-policy argv for every role', async () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const policy = b2.loadCompiledDatabaseRuntimePolicy(repositoryRoot);
  const gitBash = ['C:\\Program Files\\Git\\bin\\bash.exe', '/usr/bin/bash'].find((candidate) =>
    fs.existsSync(candidate),
  );
  assert.ok(gitBash, 'Git Bash is required for launcher argv proof');
  const expected = {
    api: { limit: '5', pool: '5', connect: '5', entrypoint: [] },
    'core-worker': { limit: '6', pool: '10', connect: '5', entrypoint: ['node', 'dist/core-worker'] },
    'media-worker': { limit: '3', pool: '10', connect: '5', entrypoint: ['node', 'dist/media-worker'] },
  };
  for (const role of b2.ROLE_KEYS) {
    const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'moazez-b2-launcher-'));
    try {
      const capturePath = path.join(temporary, 'argv.bin');
      const fakeDocker = path.join(temporary, 'docker');
      await fsp.writeFile(
        fakeDocker,
        '#!/usr/bin/env bash\nprintf \'%s\\0\' "$@" > "$B2_CAPTURE_PATH"\n',
        'utf8',
      );
      await fsp.chmod(fakeDocker, 0o755);
      const policyEnvironment = b2.buildDatabasePolicyEnvironment(role, policy);
      const result = await b1.runChild(
        gitBash,
        [path.join(repositoryRoot, 'scripts', 'ci', 'health-probe-runtime.sh'), 'database-recovery'],
        {
          cwd: repositoryRoot,
          timeoutMs: 10_000,
          env: {
            ...process.env,
            PATH: `${temporary}${path.delimiter}${process.env.PATH ?? process.env.Path}`,
            B2_CAPTURE_PATH: capturePath,
            B2_ACTION: 'launch-runtime',
            B2_ROLE: role,
            B2_RUNTIME_IMAGE_ID: imageId,
            B2_NETWORK_NAME: 'b2-network',
            B2_GATE_LABEL: 'PRD3-G01-B2',
            B2_RUN_LABEL: 'run-123',
            B2_API_CONTAINER_NAME: 'b2-api',
            B2_CORE_WORKER_CONTAINER_NAME: 'b2-core',
            B2_MEDIA_WORKER_CONTAINER_NAME: 'b2-media',
            ...policyEnvironment,
            DATABASE_URL: 'synthetic-database-url',
            REDIS_URL: 'synthetic-redis-url',
            STORAGE_ENDPOINT: 'synthetic-storage-endpoint',
            STORAGE_ACCESS_KEY: 'synthetic-access',
            STORAGE_SECRET_KEY: 'synthetic-secret',
            STORAGE_BUCKET: 'synthetic-private',
            STORAGE_PUBLIC_BUCKET: 'synthetic-public',
            JWT_ACCESS_SECRET: 'synthetic-jwt-access',
            JWT_REFRESH_SECRET: 'synthetic-jwt-refresh',
            SETTINGS_SECRET_ENCRYPTION_KEY: 'synthetic-settings-key',
          },
          sensitiveValues: ['synthetic-database-url', 'synthetic-secret'],
        },
      );
      assert.equal(result.ok, true);
      const args = (await fsp.readFile(capturePath)).toString('utf8').split('\0').filter(Boolean);
      assert.ok(args.includes('--pull=never'));
      assert.ok(args.includes(imageId));
      assert.ok(args.includes('com.moazez.evidence.gate=PRD3-G01-B2'));
      assert.ok(args.includes('com.moazez.evidence.run=run-123'));
      assert.ok(args.includes(`DATABASE_RUNTIME_ROLE=${role}`));
      assert.ok(args.includes(`DATABASE_CONNECTION_LIMIT=${expected[role].limit}`));
      assert.ok(args.includes(`DATABASE_POOL_TIMEOUT_SECONDS=${expected[role].pool}`));
      assert.ok(args.includes(`DATABASE_CONNECT_TIMEOUT_SECONDS=${expected[role].connect}`));
      assert.equal(args.some((arg) => /^(?:API|CORE|MEDIA)_DATABASE_URL=/u.test(arg)), false);
      const imageIndex = args.indexOf(imageId);
      assert.deepEqual(args.slice(imageIndex + 1), expected[role].entrypoint);
    } finally {
      await fsp.rm(temporary, { recursive: true, force: true });
    }
  }
});

test('database-recovery launcher rejects malformed or role-mismatched policy before Docker', async () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const policy = b2.loadCompiledDatabaseRuntimePolicy(repositoryRoot);
  const gitBash = ['C:\\Program Files\\Git\\bin\\bash.exe', '/usr/bin/bash'].find((candidate) =>
    fs.existsSync(candidate),
  );
  assert.ok(gitBash, 'Git Bash is required for launcher rejection proof');
  for (const override of [
    { B2_DATABASE_CONNECTION_LIMIT: '6' },
    { B2_DATABASE_CONNECTION_LIMIT: '4' },
    { B2_DATABASE_POOL_TIMEOUT_SECONDS: '5.5' },
    { B2_DATABASE_RUNTIME_ROLE: 'core-worker' },
  ]) {
    const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'moazez-b2-launcher-reject-'));
    try {
      const capturePath = path.join(temporary, 'argv.bin');
      const fakeDocker = path.join(temporary, 'docker');
      await fsp.writeFile(fakeDocker, '#!/usr/bin/env bash\nprintf \'invoked\' > "$B2_CAPTURE_PATH"\n', 'utf8');
      await fsp.chmod(fakeDocker, 0o755);
      const result = await b1.runChild(
        gitBash,
        [path.join(repositoryRoot, 'scripts', 'ci', 'health-probe-runtime.sh'), 'database-recovery'],
        {
          cwd: repositoryRoot,
          timeoutMs: 10_000,
          env: {
            ...process.env,
            PATH: `${temporary}${path.delimiter}${process.env.PATH ?? process.env.Path}`,
            B2_CAPTURE_PATH: capturePath,
            B2_ACTION: 'launch-runtime',
            B2_ROLE: 'api',
            B2_RUNTIME_IMAGE_ID: imageId,
            B2_NETWORK_NAME: 'b2-network',
            B2_GATE_LABEL: 'PRD3-G01-B2',
            B2_RUN_LABEL: 'run-123',
            B2_API_CONTAINER_NAME: 'b2-api',
            ...b2.buildDatabasePolicyEnvironment('api', policy),
            ...override,
            DATABASE_URL: 'synthetic-database-url',
            REDIS_URL: 'synthetic-redis-url',
            STORAGE_ENDPOINT: 'synthetic-storage-endpoint',
            STORAGE_ACCESS_KEY: 'synthetic-access',
            STORAGE_SECRET_KEY: 'synthetic-secret',
            STORAGE_BUCKET: 'synthetic-private',
            STORAGE_PUBLIC_BUCKET: 'synthetic-public',
            JWT_ACCESS_SECRET: 'synthetic-jwt-access',
            JWT_REFRESH_SECRET: 'synthetic-jwt-refresh',
            SETTINGS_SECRET_ENCRYPTION_KEY: 'synthetic-settings-key',
          },
          sensitiveValues: ['synthetic-database-url', 'synthetic-secret'],
        },
      );
      assert.equal(result.ok, false, JSON.stringify(override));
      assert.equal(fs.existsSync(capturePath), false, JSON.stringify(override));
    } finally {
      await fsp.rm(temporary, { recursive: true, force: true });
    }
  }
});

test('canonical image build uses the archived Dockerfile, pull=false, and immutable labels', () => {
  const contextPath = path.join(os.tmpdir(), 'canonical-context');
  const labels = b2.buildRuntimeProvenanceLabels({
    baseCommit: b2.BASE_SHA,
    baseTree: treeSha,
    packageLockSha256: hash64,
    runtimeManifestSha256: hash64,
    suiteRunId: 'suite-run-123',
  });
  const args = b2.buildCanonicalDockerBuildArgs({
    contextPath,
    tag: 'moazez-prd3-g01-b2:suite-run-123-runtime',
    labels,
  });
  assert.deepEqual(args.slice(0, 3), ['build', '--pull=false', '--file']);
  assert.equal(args[3], path.join(contextPath, 'Dockerfile'));
  assert.equal(args.at(-1), contextPath);
  assert.ok(args.includes(`org.opencontainers.image.revision=${b2.BASE_SHA}`));
  assert.ok(args.includes(`com.moazez.source.tree=${treeSha}`));
  assert.ok(args.includes(`com.moazez.runtime.manifest.sha256=${hash64}`));
  assert.equal(args.includes('--pull'), false);
});

test('in-image verification bypasses the production entrypoint without network access', () => {
  const lockPath = path.join(os.tmpdir(), 'canonical-context', 'package-lock.json');
  const args = b2.buildRuntimeVerificationArgs(imageId, lockPath);
  assert.deepEqual(args.slice(0, 4), ['run', '--rm', '--pull=never', '--network=none']);
  assert.ok(args.includes(`type=bind,source=${lockPath},target=/evidence/package-lock.json,readonly`));
  const entrypoint = args.indexOf('--entrypoint');
  assert.deepEqual(args.slice(entrypoint, entrypoint + 3), ['--entrypoint', 'node', imageId]);
  assert.equal(args[entrypoint + 3], '-e');
  assert.doesNotMatch(args[entrypoint + 4], /postgres(?:ql)?:\/\//iu);
  assert.match(args[entrypoint + 4], /entryCount: entries\.length/u);
  assert.doesNotMatch(args[entrypoint + 4], /JSON\.stringify\(\{ \.\.\.payload/u);
});

test('canonical Dockerfile parser accepts only the approved digest-pinned Node base', () => {
  const canonical = `ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:${'a'.repeat(64)}\nFROM \${NODE_IMAGE} AS base\n`;
  assert.equal(
    b2.parseCanonicalBaseImage(canonical),
    `node:22.23.1-bookworm-slim@sha256:${'a'.repeat(64)}`,
  );
  assert.throws(() => b2.parseCanonicalBaseImage('FROM node:22\n'), /base image/u);
});

test('canonical base-image gate retries exact read-only inspection but remains fail-closed', async () => {
  let calls = 0;
  assert.equal(
    await b2.requireLocalImageInspection(async () => {
      calls += 1;
      return calls === 2
        ? { ok: true, timedOut: false }
        : { ok: false, timedOut: false };
    }, { attempts: 3, retryDelayMs: 0 }),
    true,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    () => b2.requireLocalImageInspection(
      async () => ({ ok: false, timedOut: true }),
      { attempts: 2, retryDelayMs: 0 },
    ),
    /local gate/u,
  );
});

test('failed create reconciles before rethrow and never registers ownership', async () => {
  const ownedResources = new Map();
  const cleanup = new b1.CleanupManager();
  const calls = [];
  const context = { ownedResources, cleanup };
  await assert.rejects(
    () =>
      b2.createOwned(
        context,
        'container',
        'owned-name',
        async () => {
          throw new Error('create failed');
        },
        { reconcile: async (_context, kind, name) => calls.push(`${kind}:${name}`) },
      ),
    /create failed/u,
  );
  assert.deepEqual(calls, ['container:owned-name']);
  assert.equal(ownedResources.size, 0);
  cover('creation-reconcile');
});

test('pause and unpause command failures do not claim successful transitions', async () => {
  const fixture = { name: 'owned-postgres', paused: false };
  const context = { pausedContainers: new Set() };
  await assert.rejects(
    () => b2.pausePostgres(context, fixture, async () => { throw new Error('pause failed'); }),
    /pause failed/u,
  );
  assert.equal(fixture.paused, false);
  assert.equal(context.pausedContainers.size, 0);
  fixture.paused = true;
  context.pausedContainers.add(fixture.name);
  await assert.rejects(
    () => b2.unpausePostgres(context, fixture, async () => { throw new Error('unpause failed'); }),
    /unpause failed/u,
  );
  assert.equal(fixture.paused, true);
  cover('pause-failure', 'unpause-failure');
});

test('unexpected exit identity is rejected for API, Core, and Media', () => {
  for (const [role, proofId] of [
    ['api', 'runtime-exit-api'],
    ['core-worker', 'runtime-exit-core'],
    ['media-worker', 'runtime-exit-media'],
  ]) {
    assert.throws(
      () => b2.parseRuntimeIdentity(JSON.stringify({ Id: 'a'.repeat(64), State: { StartedAt: 'time', Pid: 0 }, RestartCount: 0 })),
      /invalid/u,
      role,
    );
    cover(proofId);
  }
});

test('probe-result parser accepts a canonical result and rejects malformed output', () => {
  assert.deepEqual(b2.parseProbeResult(JSON.stringify(management('api', 'readiness', 503))), management('api', 'readiness', 503));
  assert.throws(() => b2.parseProbeResult('{'), /JSON/u);
  assert.throws(() => b2.parseProbeResult(JSON.stringify({ role: 'scheduler' })), /invalid/u);
});

test('management response schema is exact and private', () => {
  assert.equal(b2.validateResponseBody(body('ok'), 'ok', packageVersion), true);
  assert.throws(() => b2.validateResponseBody({ ...body('ok'), database: 'down' }, 'ok', packageVersion), /schema/u);
  assert.throws(() => b2.validateResponseBody({ ...body('ok'), status: 'unavailable' }, 'ok', packageVersion), /schema/u);
  assert.throws(() => b2.validateResponseBody({ ...body('ok'), version: 'wrong' }, 'ok', packageVersion), /schema/u);
});

test('outage readiness must be exact 503 within the caller bound', () => {
  const options = { expectedRole: 'api', expectedKind: 'readiness', expectedStatusCode: 503, expectedVersion: packageVersion, maximumElapsedMs: 2500 };
  assert.equal(b2.validateManagementProbe(management('api', 'readiness', 503, 800), options), true);
  assert.throws(() => b2.validateManagementProbe(management('api', 'readiness', 200), options), /contract/u);
  assert.throws(() => b2.validateManagementProbe(management('api', 'readiness', 503, 2501), options), /contract/u);
  assert.throws(() => b2.validateManagementProbe(management('core-worker', 'readiness', 503), options), /contract/u);
  assert.throws(() => b2.validateManagementProbe(management('api', 'liveness', 503), options), /contract/u);
  cover('outage-liveness');
});

test('startup and liveness remain exact 200 during steady-state outage', () => {
  for (const role of b2.ROLE_KEYS) {
    for (const kind of ['startup', 'liveness']) {
      assert.equal(b2.validateManagementProbe(management(role, kind, 200), {
        expectedRole: role,
        expectedKind: kind,
        expectedStatusCode: 200,
        expectedVersion: packageVersion,
      }), true);
    }
  }
});

test('public health remains compatibility-only and exact 200', () => {
  assert.equal(b2.validatePublicHealth(publicHealth(), packageVersion), true);
  cover('public-health');
  assert.throws(() => b2.validatePublicHealth({ ...publicHealth(), statusCode: 503 }), /contract/u);
});

test('readiness latency bound rejects unbounded callers', () => {
  const options = { expectedRole: 'api', expectedKind: 'readiness', expectedStatusCode: 503, expectedVersion: packageVersion };
  assert.equal(b2.validateManagementProbe(management('api', 'readiness', 503, 2499), options), true);
  assert.throws(() => b2.validateManagementProbe(management('api', 'readiness', 503, 3000), options), /contract/u);
  cover('readiness-timeout');
});

test('runtime identity comparison detects replacement', () => {
  const identity = { containerId: 'a'.repeat(64), startedAt: '2026-08-04T00:00:00Z', restartCount: 0, processId: 123 };
  assert.equal(b2.validateRuntimeIdentity(identity, { ...identity }), true);
  assert.throws(() => b2.validateRuntimeIdentity(identity, { ...identity, containerId: 'b'.repeat(64) }), /changed/u);
  cover('runtime-identity');
});

test('runtime identity parser requires running process identity fields', () => {
  const report = { Id: 'a'.repeat(64), State: { StartedAt: '2026-08-04T00:00:00Z', Pid: 123 }, RestartCount: 0 };
  assert.deepEqual(b2.parseRuntimeIdentity(JSON.stringify(report)), {
    containerId: 'a'.repeat(64),
    startedAt: '2026-08-04T00:00:00Z',
    restartCount: 0,
    processId: 123,
  });
  assert.throws(() => b2.parseRuntimeIdentity(JSON.stringify({ ...report, RestartCount: '0' })), /invalid/u);
});

test('restart-count changes are independently rejected', () => {
  const before = { containerId: 'a'.repeat(64), startedAt: 'time', restartCount: 0, processId: 1 };
  assert.throws(() => b2.validateRuntimeIdentity(before, { ...before, restartCount: 1 }), /changed/u);
});

test('pg_stat_activity parser allows only exact runtime application names', () => {
  const rows = sessions().map((session) => ({
    application_name: session.applicationName,
    pid: session.pid,
    backend_start: new Date(session.backendStart),
  }));
  assert.deepEqual(b2.parseActivityRows(rows), sessions());
  assert.throws(() => b2.parseActivityRows([{ application_name: 'moazez-api-copy', pid: 1, backend_start: new Date() }]), /invalid/u);
  cover('application-allowlist');
});

test('session identity includes application, PID, and backend start', () => {
  assert.equal(b2.sessionIdentity(sessions()[0]), 'moazez-api:101:2026-08-04T12:00:00.000Z');
});

test('old-session disappearance and new-session appearance are both required', () => {
  const before = sessions();
  const after = before.map((session, index) => ({ ...session, pid: session.pid + 100, backendStart: `2026-08-04T12:01:0${index}.000Z` }));
  assert.equal(b2.validateSessionRecovery(before, after, [101, 102, 103]), true);
  assert.throws(() => b2.validateSessionRecovery(before, before, [101, 102, 103]), /old/u);
  assert.throws(() => b2.validateSessionRecovery(before, after.slice(0, 2), [101, 102, 103]), /application name/u);
  cover('old-session', 'new-session');
});

test('per-role recovery pool limits are exact upper bounds', () => {
  assert.equal(b2.validatePoolLimits({ api: 5, 'core-worker': 6, 'media-worker': 3 }), true);
  assert.throws(() => b2.validatePoolLimits({ api: 6, 'core-worker': 6, 'media-worker': 3 }), /api/u);
  cover('pool-limit');
});

test('recovery polling has a deterministic bounded timeout', async () => {
  const started = Date.now();
  await assert.rejects(() => b1.withDeadline('B2 recovery', () => new Promise(() => {}), { timeoutMs: 30 }), /deadline/u);
  assert.ok(Date.now() - started < 1000);
  cover('poll-timeout', 'recovery-timeout', 'observer-timeout');
});

test('a readiness child timeout is executable and force-reaped', { timeout: 10_000 }, async () => {
  const tracker = new b1.ChildProcessTracker({ graceMs: 50, forceReapMs: 3000 });
  const result = await b1.runChild(
    process.execPath,
    ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
    {
      timeoutMs: 100,
      terminationGraceMs: 50,
      forceKillReapMs: 3000,
      tracker,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.termination.reaped, true);
  assert.equal(tracker.children.size, 0);
  cover('readiness-timeout');
});

test('observer connect timeout remains tracked and later cleanup still executes', async () => {
  const client = {
    $connect: () => new Promise(() => {}),
    $queryRawUnsafe: async () => [],
    $disconnect: async () => undefined,
  };
  const harness = createFinalizerHarness();
  harness.context.prismaTimeouts = { connect: 30, operation: 30 };
  const fixture = {};
  await assert.rejects(
    () => b2.initializeObserver(harness.context, fixture, client),
    /deadline/u,
  );
  assert.equal(fixture.observer, client);
  assert.equal(harness.trackedPrismaClients.has(client), true);
  const finalization = await harness.context.finalize({ operationFailed: true, failureStage: 'observer-connect' });
  assert.equal(finalization.terminalPhase, b1.EVIDENCE_PHASE.FAILED);
  assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 0);
  assert.ok(harness.order.includes('resources'));
  assert.ok(harness.order.includes('exact'));
});

test('observer failure before fixture assignment remains tracked for finalization', async () => {
  const client = {
    $connect: async () => undefined,
    $queryRawUnsafe: async () => [],
    $disconnect: async () => undefined,
  };
  const harness = createFinalizerHarness();
  const fixture = {};
  Object.defineProperty(fixture, 'observer', {
    set() {
      throw new Error('fixture assignment failed');
    },
  });
  await assert.rejects(
    () => b2.initializeObserver(harness.context, fixture, client),
    /assignment failed/u,
  );
  assert.equal(harness.trackedPrismaClients.has(client), true);
  const finalization = await harness.context.finalize({
    operationFailed: true,
    failureStage: 'observer-assignment',
  });
  assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 0);
  assert.ok(harness.order.includes('resources'));
  assert.ok(harness.order.includes('labels'));
});

test('SHOW server_version timeout remains discoverable and cleanup continues', async () => {
  const client = {
    $connect: async () => undefined,
    $queryRawUnsafe: () => new Promise(() => {}),
    $disconnect: async () => undefined,
  };
  const harness = createFinalizerHarness();
  harness.context.prismaTimeouts = { connect: 30, operation: 30 };
  const fixture = {};
  await assert.rejects(() => b2.initializeObserver(harness.context, fixture, client), /deadline/u);
  assert.equal(fixture.observer, client);
  const finalization = await harness.context.finalize({ operationFailed: true, failureStage: 'show-version' });
  assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 0);
  assert.ok(harness.order.includes('resources'));
});

test('SHOW max_connections timeout remains discoverable and cleanup continues', async () => {
  let calls = 0;
  const client = {
    $connect: async () => undefined,
    $queryRawUnsafe: () => {
      calls += 1;
      return calls === 1 ? Promise.resolve([{ server_version: '16.1' }]) : new Promise(() => {});
    },
    $disconnect: async () => undefined,
  };
  const harness = createFinalizerHarness();
  harness.context.prismaTimeouts = { connect: 30, operation: 30 };
  const fixture = {};
  await assert.rejects(() => b2.initializeObserver(harness.context, fixture, client), /deadline/u);
  assert.equal(fixture.observer, client);
  const finalization = await harness.context.finalize({ operationFailed: true, failureStage: 'show-limit' });
  assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 0);
  assert.ok(harness.order.includes('resources'));
});

test('activity query timeout is bounded and later cleanup still executes', async () => {
  const client = {
    $queryRawUnsafe: () => new Promise(() => {}),
    $disconnect: async () => undefined,
  };
  const harness = createFinalizerHarness(client);
  harness.context.prismaTimeouts = { operation: 30 };
  await assert.rejects(() => b2.observeActivity(harness.context, client), /deadline/u);
  const finalization = await harness.context.finalize({ operationFailed: true, failureStage: 'activity' });
  assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 0);
  assert.ok(harness.order.includes('resources'));
  cover('observer-timeout');
});

test('disconnect rejection and timeout receive two bounded phases without skipping cleanup', async () => {
  for (const mode of ['reject', 'timeout']) {
    const client = {
      $disconnect:
        mode === 'reject'
          ? async () => { throw new Error('rejected'); }
          : () => new Promise(() => {}),
    };
    const harness = createFinalizerHarness(client);
    const finalization = await harness.context.finalize({ operationFailed: true, failureStage: `disconnect-${mode}` });
    assert.equal(finalization.phaseOneDisconnect[0].status, mode === 'reject' ? b1.PRISMA_DISCONNECT_STATUS.REJECTED : b1.PRISMA_DISCONNECT_STATUS.TIMED_OUT);
    assert.equal(finalization.phaseTwoDisconnect[0].status, mode === 'reject' ? b1.PRISMA_DISCONNECT_STATUS.REJECTED : b1.PRISMA_DISCONNECT_STATUS.TIMED_OUT);
    assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 1);
    assert.ok(harness.order.indexOf('resources') > harness.order.indexOf('children'));
    assert.ok(harness.order.includes('exact'));
  }
});

test('disconnect succeeds on phase-two retry and resolves tracked client', async () => {
  let calls = 0;
  const client = {
    $disconnect: async () => {
      calls += 1;
      if (calls === 1) throw new Error('phase one rejected');
    },
  };
  const harness = createFinalizerHarness(client);
  const finalization = await harness.context.finalize({ operationFailed: true, failureStage: 'retry' });
  assert.equal(finalization.phaseOneDisconnect[0].status, b1.PRISMA_DISCONNECT_STATUS.REJECTED);
  assert.equal(finalization.phaseTwoDisconnect[0].status, b1.PRISMA_DISCONNECT_STATUS.SUCCESS);
  assert.equal(finalization.cleanup.trackedPrismaClientsRemaining, 0);
  assert.equal(calls, 2);
  assert.ok(harness.order.includes('resources'));
});

test('unified finalization is idempotent, monotonic, and removes handlers last', async () => {
  const client = { $disconnect: async () => undefined };
  const harness = createFinalizerHarness(client);
  const first = harness.context.finalize();
  const second = harness.context.finalize();
  assert.equal(first, second);
  const finalization = await first;
  assert.equal(finalization.ok, true);
  assert.equal(finalization.terminalPhase, b1.EVIDENCE_PHASE.FINALIZED);
  assert.equal(harness.state.phase, b1.EVIDENCE_PHASE.FINALIZED);
  assert.equal(harness.order.at(-1), 'signals');
  assert.ok(harness.order.indexOf('children') < harness.order.indexOf('resources'));
  assert.ok(harness.order.indexOf('resources') < harness.order.indexOf('publication'));
  assert.throws(() => harness.state.transition(b1.EVIDENCE_PHASE.RUNNING), /transition/u);
});

test('cleanup inspection failure prevents PASS without skipping later phases', async () => {
  const harness = createFinalizerHarness(undefined, {
    operations: {
      verifyExactNames: async () => {
        harness.order.push('exact-failed');
        throw new Error('inspection failed');
      },
    },
  });
  const result = await harness.context.finalize();
  assert.equal(result.ok, false);
  assert.equal(result.terminalPhase, b1.EVIDENCE_PHASE.FAILED);
  assert.equal(result.cleanup.inspectionVerified, false);
  assert.ok(harness.order.includes('labels'));
  assert.ok(harness.order.includes('images'));
  assert.ok(harness.order.includes('signals'));
  cover('inspection-failure');
});

test('owned-resource residue prevents PASS and still reaches inspections', async () => {
  const harness = createFinalizerHarness(undefined, {
    operations: {
      verifyExactNames: async () => ({ containers: 1, networks: 0 }),
    },
  });
  const result = await harness.context.finalize();
  assert.equal(result.ok, false);
  assert.equal(result.terminalPhase, b1.EVIDENCE_PHASE.FAILED);
  assert.equal(result.cleanup.exactNameContainersRemaining, 1);
  assert.ok(result.failures.includes('B2 summary publication'));
  assert.equal(harness.order.at(-1), 'signals');
  cover('resource-residue');
});

test('startup-unavailable classification accepts exit or bounded unavailable state', () => {
  assert.equal(b2.classifyStartupUnavailable({ running: false, exitCode: 1, startupStatus: 'unavailable', readinessStatus: 'unavailable' }), 'FAIL_CLOSED_EXITED');
  assert.equal(b2.classifyStartupUnavailable({ running: true, exitCode: 0, startupStatus: 503, readinessStatus: 503 }), 'FAIL_CLOSED_UNAVAILABLE');
  assert.throws(() => b2.classifyStartupUnavailable({ running: true, exitCode: 0, startupStatus: 200, readinessStatus: 503 }), /falsely/u);
  cover('startup-fail-closed');
});

test('ten-request readiness burst must return only bounded 503 results', () => {
  const report = { role: 'api', kind: 'readiness', results: Array.from({ length: 10 }, () => ({ statusCode: 503, body: body('unavailable'), elapsedMs: 800 })) };
  const options = { expectedRole: 'api', expectedVersion: packageVersion };
  assert.deepEqual(b2.validateReadinessBurst(report, options), { count: 10, maximumElapsedMs: 800 });
  assert.throws(() => b2.validateReadinessBurst({ ...report, role: 'core-worker' }, options), /invalid/u);
  assert.throws(() => b2.validateReadinessBurst({ ...report, kind: 'liveness' }, options), /invalid/u);
  assert.throws(() => b2.validateReadinessBurst({ ...report, results: [{ statusCode: 200, body: body('ok'), elapsedMs: 1 }] }, options), /count|fail closed/u);
  cover('burst-bound');
});

test('synthetic sensitive values are redacted and rejected from summaries', () => {
  const sensitive = 'synthetic-sensitive-value';
  assert.doesNotMatch(b1.redactText(`failure ${sensitive}`, [sensitive]), new RegExp(sensitive, 'u'));
  assert.throws(() => b1.assertSanitizedSummary({ ...validSummary(), detail: sensitive }, [sensitive]), /sensitive/u);
});

test('readiness logs require exactly paired, deduplicated outage transitions', () => {
  const logs = [
    'management.probe.readiness_unavailable dependency=prisma',
    'management.probe.readiness_recovered',
    'management.probe.readiness_unavailable dependency=prisma',
    'management.probe.readiness_recovered',
  ].join('\n');
  assert.deepEqual(b2.validateLogTransitions(logs, 2), { unavailable: 2, recovered: 2 });
  assert.throws(
    () =>
      b2.validateLogTransitions(
        `${logs}\nmanagement.probe.readiness_unavailable\nmanagement.probe.readiness_unavailable`,
        2,
      ),
    /mismatch/u,
  );
});

test('readiness logs reject raw Prisma codes and database URLs', () => {
  assert.throws(() => b2.validateLogTransitions('management.probe.readiness_unavailable P1001\nmanagement.probe.readiness_recovered', 1), /expose/u);
});

test('signal during outage latches 130 and permanently disables PASS', () => {
  const state = new b1.EvidenceState();
  state.transition(b1.EVIDENCE_PHASE.RUNNING);
  assert.equal(state.latchSignal('SIGINT'), true);
  assert.equal(state.requestedExitCode, 130);
  assert.throws(() => state.assertSummaryEligible(), /not eligible/u);
});

test('signal during recovery latches 143 and aborts pending work', () => {
  const state = new b1.EvidenceState();
  state.transition(b1.EVIDENCE_PHASE.RUNNING);
  state.latchSignal('SIGTERM');
  assert.equal(state.requestedExitCode, 143);
  assert.equal(state.abortController.signal.aborted, true);
});

test('tracked SIGTERM-resistant child tree is force-reaped', { timeout: 10_000 }, async () => {
  const tracker = new b1.ChildProcessTracker({ graceMs: 100, forceReapMs: 3000 });
  const source = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const result = await b1.runChild(process.execPath, ['-e', source], {
    timeoutMs: 200,
    terminationGraceMs: 100,
    forceKillReapMs: 3000,
    tracker,
  });
  assert.equal(result.ok, false);
  assert.equal(result.termination.reaped, true);
  assert.equal(tracker.children.size, 0);
  assert.equal(b1.isProcessAlive(result.childPid), false);
});

test('cleanup evidence requires exact-name and current-run label absence', () => {
  assert.equal(b2.validateCleanupEvidence(validSummary().cleanup), true);
  assert.throws(() => b2.validateCleanupEvidence({ ...validSummary().cleanup, currentRunLabeledContainersRemaining: 1 }), /incomplete/u);
  assert.throws(() => b2.validateCleanupEvidence({ ...validSummary().cleanup, inspectionVerified: false }), /incomplete/u);
});

test('B2 summary schema validates all terminal recovery invariants', () => {
  assert.equal(b2.validateSummary(validSummary()), true);
  assert.throws(() => b2.validateSummary({ ...validSummary(), oldBackendSessionsRemaining: 1 }), /schema/u);
  const invalid = validSummary();
  invalid.roles.api.maximumObservedConnections = 6;
  assert.throws(() => b2.validateSummary(invalid), /api/u);
});

test('strict B2 summary rejects incomplete and ill-typed required evidence', () => {
  const cases = [
    (summary) => { delete summary.forcedSessionsTerminated; },
    (summary) => { summary.forcedSessionsTerminated = null; },
    (summary) => { summary.forcedSessionsTerminated = '3'; },
    (summary) => { summary.forcedSessionsTerminated = Number.NaN; },
    (summary) => { summary.forcedSessionsTerminated = -1; },
    (summary) => { summary.forcedSessionsTerminated = 15; },
    (summary) => { summary.oldBackendSessionsRemaining = null; },
    (summary) => { summary.oldBackendSessionsRemaining = '0'; },
    (summary) => { summary.oldBackendSessionsRemaining = Number.NaN; },
    (summary) => { summary.oldBackendSessionsRemaining = -1; },
    (summary) => { summary.oldBackendSessionsRemaining = 1; },
    (summary) => { summary.repeatedRecoveryCycles = null; },
    (summary) => { summary.repeatedRecoveryCycles = '2'; },
    (summary) => { summary.repeatedRecoveryCycles = Number.NaN; },
    (summary) => { summary.repeatedRecoveryCycles = -1; },
    (summary) => { summary.repeatedRecoveryCycles = 3; },
    (summary) => { summary.cycles = null; },
    (summary) => { summary.cycles = [summary.cycles[0]]; },
    (summary) => { summary.cycles[0].roles.api.detectionLatencyMs = null; },
    (summary) => { summary.cycles[0].roles.api.detectionLatencyMs = '800'; },
    (summary) => { summary.cycles[0].roles.api.detectionLatencyMs = Number.NaN; },
    (summary) => { summary.cycles[0].roles.api.detectionLatencyMs = -1; },
    (summary) => { summary.cycles[0].roles.api.detectionLatencyMs = 2501; },
    (summary) => { summary.roles.api.outageDetectionLatencyMs = null; },
    (summary) => { summary.roles.api.outageDetectionLatencyMs = [800]; },
    (summary) => { summary.roles.api.outageDetectionLatencyMs = [800, '790']; },
    (summary) => { summary.roles.api.outageDetectionLatencyMs = [800, Number.NaN]; },
    (summary) => { summary.roles.api.outageDetectionLatencyMs = [800, -1]; },
    (summary) => { summary.roles.api.outageDetectionLatencyMs = [800, 2501]; },
    (summary) => { summary.roles.api.maximumObservedConnections = null; },
    (summary) => { summary.roles.api.maximumObservedConnections = '1'; },
    (summary) => { summary.roles.api.maximumObservedConnections = Number.NaN; },
    (summary) => { summary.roles.api.maximumObservedConnections = -1; },
    (summary) => { summary.roles.api.maximumObservedConnections = 6; },
    (summary) => { summary.roles.api.readinessBurstCount = 9; },
    (summary) => { summary.roles.api.readinessBurstMaximumElapsedMs = 2501; },
    (summary) => { summary.roles.api.readinessUnavailableEvents = 1; },
    (summary) => { summary.roles.api.readinessRecoveredEvents = 1; },
    (summary) => { summary.startupUnavailable.api = 'FAIL_CLOSED_UNKNOWN'; },
  ];
  for (const mutate of cases) {
    const summary = validSummary();
    mutate(summary);
    assert.throws(() => b2.validateSummary(summary));
  }
  const preReviewIncomplete = validSummary();
  delete preReviewIncomplete.cycles;
  delete preReviewIncomplete.runtimeManifestSha256;
  delete preReviewIncomplete.cleanup.trackedPrismaClientsRemaining;
  assert.throws(() => b2.validateSummary(preReviewIncomplete), /schema|cleanup/u);
});

test('atomic B2 summary publication writes, fsyncs, renames, and hashes', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'b2-atomic-'));
  const state = new b1.EvidenceState();
  state.transition(b1.EVIDENCE_PHASE.RUNNING);
  const fileTracker = new b1.EvidenceFileTracker();
  const context = {
    state,
    fileTracker,
    summaryPath: path.join(directory, 'summary.json'),
    sensitiveValues: [],
  };
  try {
    const publication = await b2.atomicPublishSummary(context, validSummary());
    assert.match(publication.summaryHash, /^[a-f0-9]{64}$/u);
    assert.equal(fs.existsSync(publication.summaryPath), true);
    assert.deepEqual(fileTracker.snapshot(), {
      scratchFilesRemaining: 0,
      retainedSanitizedSummaryFiles: 1,
    });
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
  cover('atomic-publication');
});

test('signals at every publication boundary remove PASS and scratch artifacts', async () => {
  const cases = [
    ['beforeScratchOpen', async (state) => state.latchSignal('SIGINT')],
    ['writeScratch', async (state, handle, serialized) => {
      await handle.writeFile(serialized.slice(0, 24), 'utf8');
      state.latchSignal('SIGTERM');
    }],
    ['afterScratchClose', async (state) => state.latchSignal('SIGINT')],
    ['beforeRename', async (state) => state.latchSignal('SIGTERM')],
    ['afterRename', async (state) => state.latchSignal('SIGINT')],
    ['afterRetainedVerification', async (state) => state.latchSignal('SIGTERM')],
    ['beforeHashOutput', async (state) => state.latchSignal('SIGINT')],
  ];
  for (const [hookName, action] of cases) {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'b2-signal-publication-'));
    const state = new b1.EvidenceState();
    state.transition(b1.EVIDENCE_PHASE.RUNNING);
    const fileTracker = new b1.EvidenceFileTracker();
    const summaryPath = path.join(directory, 'summary.json');
    const hooks = {
      [hookName]:
        hookName === 'writeScratch'
          ? (handle, serialized) => action(state, handle, serialized)
          : () => action(state),
    };
    try {
      await assert.rejects(
        () => b2.atomicPublishSummary({ state, fileTracker, summaryPath, sensitiveValues: [] }, validSummary(), hooks),
        /eligible|interrupted/u,
      );
      assert.equal(fs.existsSync(summaryPath), false, hookName);
      assert.deepEqual(fileTracker.snapshot(), {
        scratchFilesRemaining: 0,
        retainedSanitizedSummaryFiles: 0,
      });
      assert.equal((await fsp.readdir(directory)).length, 0, hookName);
      assert.throws(() => state.assertSummaryEligible(), /eligible/u);
    } finally {
      await fsp.rm(directory, { recursive: true, force: true });
    }
  }
});

test('atomic B2 publication emits no file after schema failure', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'b2-invalid-'));
  const state = new b1.EvidenceState();
  state.transition(b1.EVIDENCE_PHASE.RUNNING);
  const summaryPath = path.join(directory, 'summary.json');
  try {
    await assert.rejects(() => b2.atomicPublishSummary({
      state,
      fileTracker: new b1.EvidenceFileTracker(),
      summaryPath,
      sensitiveValues: [],
    }, { ...validSummary(), overall: 'FAIL' }), /schema/u);
    assert.equal(fs.existsSync(summaryPath), false);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test('first-run pass followed by second-run failure prevents PASS', () => {
  assert.equal(b2.validateRequiredRunResults([true, true]), true);
  assert.throws(() => b2.validateRequiredRunResults([true, false]), /Both independent/u);
});

test('administrative SQL contains only the exact fixed application allowlist', () => {
  for (const name of Object.values(b2.ROLE_APPLICATION_NAMES)) {
    assert.match(b2.ACTIVITY_SQL, new RegExp(`'${name}'`, 'u'));
    assert.match(b2.TERMINATE_SQL, new RegExp(`'${name}'`, 'u'));
  }
  assert.match(b2.TERMINATE_SQL, /pg_terminate_backend\(pid\)/u);
  assert.match(b2.TERMINATE_SQL, /pid <> pg_backend_pid\(\)/u);
  assert.doesNotMatch(b2.TERMINATE_SQL, /\$\{/u);
});

test('B2 source forbids forceExit, shell mode, prune, and process.exit', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ci', 'prd3-g01-b2-database-recovery.cjs'), 'utf8');
  assert.doesNotMatch(source, /--forceExit|shell:\s*true|docker system prune|process\.exit\s*\(/u);
  assert.match(source, /maxCaptureBytes: 512 \* 1024/u);
});

test('executable pure and integration proofs cover every non-live fault mode', () => {
  const expected = b2.FAULT_MATRIX
    .filter(({ proofType, proofId }) => proofType !== 'live' && proofId !== 'two-run-required')
    .map(({ proofId }) => proofId);
  assert.deepEqual([...coveredProofIds].sort(), [...expected].sort());
  process.stdout.write(`B2_PROOF_COVERAGE=${[...coveredProofIds].sort().join(',')}\n`);
});
