'use strict';

const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const GATE_LABEL = 'PRD3-G02';
const RUN_ID = randomUUID().replaceAll('-', '').slice(0, 20);
const OWNERSHIP_LABEL = 'com.moazez.evidence.gate';
const RUN_LABEL = 'com.moazez.evidence.run';
const ROLE_LABEL = 'com.moazez.evidence.redis-role';
const REDIS_IMAGE_REFERENCE = 'redis:7-alpine';
const COMMAND_TIMEOUT_MS = 30_000;
const PRISMA_GENERATE_TIMEOUT_MS = 2 * 60_000;
const TEST_TIMEOUT_MS = 10 * 60_000;

const resources = {
  queue: {
    role: 'queue',
    container: `moazez-prd3-g02-queue-${RUN_ID}`,
    network: `moazez-prd3-g02-queue-net-${RUN_ID}`,
  },
  realtime: {
    role: 'realtime',
    container: `moazez-prd3-g02-realtime-${RUN_ID}`,
    network: `moazez-prd3-g02-realtime-net-${RUN_ID}`,
  },
};

let primaryFailure = null;
let cleanupResult = null;

try {
  const prismaGenerationDatabaseUrl = [
    'postgresql',
    '://g02_prisma_generate:g02_prisma_generate@127.0.0.1:1/',
    'g02_prisma_generate?schema=public',
  ].join('');
  generatePrismaClient(prismaGenerationDatabaseUrl);

  const imageId = docker([
    'image',
    'inspect',
    REDIS_IMAGE_REFERENCE,
    '--format',
    '{{.Id}}',
  ]).trim();
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) {
    throw new Error('local_redis_image_identity_invalid');
  }

  resources.queue.hostPort = allocateLoopbackPort();
  do {
    resources.realtime.hostPort = allocateLoopbackPort();
  } while (resources.realtime.hostPort === resources.queue.hostPort);

  for (const resource of Object.values(resources)) {
    createNetwork(resource);
    startRedis(resource, imageId);
  }

  const queuePort = publishedPort(resources.queue.container);
  const realtimePort = publishedPort(resources.realtime.container);
  const jestPath = path.join(
    process.cwd(),
    'node_modules',
    'jest',
    'bin',
    'jest.js',
  );
  const testRun = spawnSync(
    process.execPath,
    [
      jestPath,
      '--config',
      './test/jest-e2e.json',
      '--runInBand',
      '--runTestsByPath',
      'test/integration/prd3-g02-redis-topology-recovery.integration.spec.ts',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: TEST_TIMEOUT_MS,
      killSignal: 'SIGTERM',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        RUN_PRD3_G02_REDIS_INTEGRATION: '1',
        TEST_QUEUE_REDIS_URL: `redis://127.0.0.1:${queuePort}`,
        TEST_REALTIME_REDIS_URL: `redis://127.0.0.1:${realtimePort}`,
        PRD3_G02_QUEUE_CONTAINER: resources.queue.container,
        PRD3_G02_REALTIME_CONTAINER: resources.realtime.container,
        PRD3_G02_RUN_ID: RUN_ID,
        PRD3_G02_REDIS_IMAGE_ID: imageId,
      },
    },
  );

  process.stdout.write(testRun.stdout || '');
  process.stderr.write(testRun.stderr || '');
  if (testRun.error) throw testRun.error;
  if (testRun.status !== 0) {
    throw new Error('prd3_g02_integration_evidence_failed');
  }
  if (!/PRD3_G02_EVIDENCE_JSON=/u.test(testRun.stdout || '')) {
    throw new Error('prd3_g02_evidence_summary_missing');
  }
} catch (error) {
  primaryFailure = error;
} finally {
  try {
    cleanupResult = cleanupOwnedResources();
  } catch (error) {
    primaryFailure ??= error;
  }
}

if (cleanupResult) {
  process.stdout.write(
    `PRD3_G02_CLEANUP_JSON=${JSON.stringify(cleanupResult)}\n`,
  );
}

if (primaryFailure) {
  process.stderr.write(
    `PRD3-G02 final verifier failed: ${safeErrorMessage(primaryFailure)}\n`,
  );
  process.exitCode = 1;
}

function generatePrismaClient(databaseUrl) {
  const prismaCli = path.join(
    process.cwd(),
    'node_modules',
    'prisma',
    'build',
    'index.js',
  );
  const generationRun = spawnSync(
    process.execPath,
    [
      prismaCli,
      'generate',
      '--schema',
      path.join('prisma', 'schema.prisma'),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: PRISMA_GENERATE_TIMEOUT_MS,
      killSignal: 'SIGTERM',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
  if (generationRun.error) {
    throw new Error('prd3_g02_prisma_client_generation_execution_failed', {
      cause: generationRun.error,
    });
  }
  if (generationRun.status !== 0) {
    throw new Error('prd3_g02_prisma_client_generation_failed');
  }
}

function createNetwork(resource) {
  docker([
    'network',
    'create',
    '--label',
    `${OWNERSHIP_LABEL}=${GATE_LABEL}`,
    '--label',
    `${RUN_LABEL}=${RUN_ID}`,
    '--label',
    `${ROLE_LABEL}=${resource.role}`,
    resource.network,
  ]);
}

function startRedis(resource, imageId) {
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    resource.container,
    '--network',
    resource.network,
    '--label',
    `${OWNERSHIP_LABEL}=${GATE_LABEL}`,
    '--label',
    `${RUN_LABEL}=${RUN_ID}`,
    '--label',
    `${ROLE_LABEL}=${resource.role}`,
    '--publish',
    `127.0.0.1:${resource.hostPort}:6379`,
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=67108864',
    imageId,
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ]);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const probe = dockerResult([
      'exec',
      resource.container,
      'redis-cli',
      '--raw',
      'PING',
    ]);
    if (probe.status === 0 && probe.stdout.trim() === 'PONG') return;
    boundedPause(100);
  }
  throw new Error(`redis_${resource.role}_startup_timeout`);
}

function publishedPort(containerName) {
  const mapping = docker(['port', containerName, '6379/tcp']).trim();
  const match = /^127\.0\.0\.1:(\d+)$/u.exec(mapping);
  if (!match) throw new Error('redis_loopback_port_mapping_invalid');
  return Number(match[1]);
}

function allocateLoopbackPort() {
  const script = [
    "const net = require('node:net');",
    'const server = net.createServer();',
    "server.listen(0, '127.0.0.1', () => {",
    '  const address = server.address();',
    '  process.stdout.write(String(address.port));',
    '  server.close();',
    '});',
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5_000,
    killSignal: 'SIGTERM',
  });
  if (result.error || result.status !== 0) {
    throw new Error('loopback_port_allocation_failed');
  }
  const port = Number(result.stdout.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('loopback_port_allocation_invalid');
  }
  return port;
}

function cleanupOwnedResources() {
  for (const resource of Object.values(resources)) {
    if (containerExists(resource.container)) {
      assertContainerOwnership(resource);
      docker(['rm', '--force', resource.container]);
    }
  }

  for (const resource of Object.values(resources)) {
    if (networkExists(resource.network)) {
      assertNetworkOwnership(resource);
      docker(['network', 'rm', resource.network]);
    }
  }

  const residualContainers = Object.values(resources).filter((resource) =>
    containerExists(resource.container),
  );
  const residualNetworks = Object.values(resources).filter((resource) =>
    networkExists(resource.network),
  );
  const residualByRunLabel = docker([
    'ps',
    '--all',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
    '--format',
    '{{.Names}}',
  ]).trim();
  const residualNetworksByRunLabel = docker([
    'network',
    'ls',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
    '--format',
    '{{.Name}}',
  ]).trim();

  if (
    residualContainers.length > 0 ||
    residualNetworks.length > 0 ||
    residualByRunLabel ||
    residualNetworksByRunLabel
  ) {
    throw new Error('prd3_g02_owned_resource_cleanup_incomplete');
  }

  return {
    runId: RUN_ID,
    containers: 0,
    networks: 0,
    processes: 0,
    temporaryFiles: 0,
  };
}

function assertContainerOwnership(resource) {
  const inspected = docker([
    'inspect',
    resource.container,
    '--format',
    `{{index .Config.Labels "${OWNERSHIP_LABEL}"}}|{{index .Config.Labels "${RUN_LABEL}"}}|{{index .Config.Labels "${ROLE_LABEL}"}}`,
  ]).trim();
  if (inspected !== `${GATE_LABEL}|${RUN_ID}|${resource.role}`) {
    throw new Error('prd3_g02_container_ownership_mismatch');
  }
}

function assertNetworkOwnership(resource) {
  const inspected = docker([
    'network',
    'inspect',
    resource.network,
    '--format',
    `{{index .Labels "${OWNERSHIP_LABEL}"}}|{{index .Labels "${RUN_LABEL}"}}|{{index .Labels "${ROLE_LABEL}"}}`,
  ]).trim();
  if (inspected !== `${GATE_LABEL}|${RUN_ID}|${resource.role}`) {
    throw new Error('prd3_g02_network_ownership_mismatch');
  }
}

function containerExists(containerName) {
  return (
    dockerResult([
      'container',
      'inspect',
      containerName,
      '--format',
      '{{.Name}}',
    ]).status === 0
  );
}

function networkExists(networkName) {
  return (
    dockerResult(['network', 'inspect', networkName, '--format', '{{.Name}}'])
      .status === 0
  );
}

function docker(args) {
  const result = dockerResult(args);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker_command_failed:${args[0]}:${args[1] || ''}`);
  }
  return result.stdout;
}

function dockerResult(args) {
  return spawnSync('docker', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });
}

function boundedPause(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function safeErrorMessage(error) {
  if (!(error instanceof Error)) return 'unknown_failure';
  return error.message.replaceAll(/redis(?:s)?:\/\/\S+/gu, '[REDACTED]');
}
