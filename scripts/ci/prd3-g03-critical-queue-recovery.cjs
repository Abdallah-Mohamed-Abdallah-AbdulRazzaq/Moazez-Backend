'use strict';

const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const GATE = 'PRD3-G03';
const RUN_ID = randomUUID().replaceAll('-', '').slice(0, 20);
const RUN_LABEL = 'com.moazez.evidence.run';
const GATE_LABEL = 'com.moazez.evidence.gate';
const ROLE_LABEL = 'com.moazez.evidence.role';
const NETWORK = `moazez-prd3-g03-net-${RUN_ID}`;
const claimedPorts = new Set();
const resources = {
  queue: {
    name: `moazez-prd3-g03-queue-${RUN_ID}`,
    image: 'redis:7-alpine',
    containerPort: 6379,
    port: allocateLoopbackPort(),
  },
  database: {
    name: `moazez-prd3-g03-database-${RUN_ID}`,
    image: 'postgres:16-alpine',
    containerPort: 5432,
    port: allocateLoopbackPort(),
  },
  storage: {
    name: `moazez-prd3-g03-storage-${RUN_ID}`,
    image: 'minio/minio:RELEASE.2025-09-07T16-13-09Z',
    containerPort: 9000,
    port: allocateLoopbackPort(),
  },
};
let primaryFailure;
let cleanupEvidence;

try {
  const imageIds = {};
  for (const [role, resource] of Object.entries(resources)) {
    imageIds[role] = docker([
      'image',
      'inspect',
      resource.image,
      '--format',
      '{{.Id}}',
    ]).trim();
    if (!/^sha256:[a-f0-9]{64}$/u.test(imageIds[role])) {
      throw new Error(`local_${role}_image_identity_invalid`);
    }
  }

  docker([
    'network',
    'create',
    '--label',
    `${GATE_LABEL}=${GATE}`,
    '--label',
    `${RUN_LABEL}=${RUN_ID}`,
    '--label',
    `${ROLE_LABEL}=shared`,
    NETWORK,
  ]);
  startQueue(imageIds.queue);
  startDatabase(imageIds.database);
  startStorage(imageIds.storage);
  waitForContainerCommand(
    resources.queue.name,
    ['redis-cli', '--raw', 'PING'],
    'PONG',
  );
  waitForContainerCommand(
    resources.database.name,
    ['pg_isready', '-U', 'g03_fixture', '-d', 'g03_fixture'],
    'accepting connections',
  );
  waitForTcp(resources.storage.port);

  const databaseUrl = [
    'postgresql',
    '://g03_fixture:g03_fixture@127.0.0.1:',
    String(resources.database.port),
    '/g03_fixture?schema=public',
  ].join('');
  const prismaCli = path.join(
    process.cwd(),
    'node_modules',
    'prisma',
    'build',
    'index.js',
  );
  const migrationRun = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 3 * 60_000,
      killSignal: 'SIGTERM',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
  process.stdout.write(migrationRun.stdout || '');
  process.stderr.write(migrationRun.stderr || '');
  if (migrationRun.error || migrationRun.status !== 0) {
    throw migrationRun.error || new Error('disposable_migration_deploy_failed');
  }

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
      '--max-old-space-size=4096',
      jestPath,
      '--config',
      './test/jest-e2e.json',
      '--runInBand',
      '--forceExit',
      '--runTestsByPath',
      'test/integration/prd3-g03-critical-queue-recovery.integration.spec.ts',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 8 * 60_000,
      killSignal: 'SIGTERM',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        RUN_PRD3_G03_RECOVERY_INTEGRATION: '1',
        PRD3_G03_RUN_ID: RUN_ID,
        PRD3_G03_NETWORK: NETWORK,
        PRD3_G03_QUEUE_CONTAINER: resources.queue.name,
        PRD3_G03_QUEUE_PORT: String(resources.queue.port),
        PRD3_G03_DATABASE_PORT: String(resources.database.port),
        PRD3_G03_STORAGE_PORT: String(resources.storage.port),
        PRD3_G03_REDIS_IMAGE_ID: imageIds.queue,
      },
    },
  );
  process.stdout.write(testRun.stdout || '');
  process.stderr.write(testRun.stderr || '');
  if (testRun.error) throw testRun.error;
  if (testRun.status !== 0) throw new Error('real_recovery_evidence_failed');
  if (!/PRD3_G03_EVIDENCE_JSON=/u.test(testRun.stdout || '')) {
    throw new Error('real_recovery_evidence_summary_missing');
  }
} catch (error) {
  primaryFailure = error;
} finally {
  try {
    cleanupEvidence = cleanup();
  } catch (error) {
    primaryFailure ||= error;
  }
}

if (cleanupEvidence) {
  process.stdout.write(
    `PRD3_G03_CLEANUP_JSON=${JSON.stringify(cleanupEvidence)}\n`,
  );
}
if (primaryFailure) {
  process.stderr.write(
    `PRD3-G03 real verifier failed: ${safeMessage(primaryFailure)}\n`,
  );
  process.exitCode = 1;
}

function startQueue(imageId) {
  const resource = resources.queue;
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    resource.name,
    '--network',
    NETWORK,
    ...labels('queue'),
    '--publish',
    `127.0.0.1:${resource.port}:6379`,
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=67108864',
    imageId,
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ]);
}

function startDatabase(imageId) {
  const resource = resources.database;
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    resource.name,
    '--network',
    NETWORK,
    ...labels('database'),
    '--publish',
    `127.0.0.1:${resource.port}:5432`,
    '--tmpfs',
    '/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456',
    '--env',
    'POSTGRES_USER=g03_fixture',
    '--env',
    'POSTGRES_PASSWORD=g03_fixture',
    '--env',
    'POSTGRES_DB=g03_fixture',
    imageId,
  ]);
}

function startStorage(imageId) {
  const resource = resources.storage;
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    resource.name,
    '--network',
    NETWORK,
    ...labels('storage'),
    '--publish',
    `127.0.0.1:${resource.port}:9000`,
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=134217728',
    '--env',
    'MINIO_ROOT_USER=g03fixture',
    '--env',
    'MINIO_ROOT_PASSWORD=g03fixture-secret',
    imageId,
    'server',
    '/data',
    '--console-address',
    ':9001',
  ]);
}

function labels(role) {
  return [
    '--label',
    `${GATE_LABEL}=${GATE}`,
    '--label',
    `${RUN_LABEL}=${RUN_ID}`,
    '--label',
    `${ROLE_LABEL}=${role}`,
  ];
}

function waitForContainerCommand(name, command, expected) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = dockerResult(['exec', name, ...command]);
    if (result.status === 0 && result.stdout.includes(expected)) return;
    pause(100);
  }
  throw new Error('container_startup_timeout');
}

function waitForTcp(port) {
  const script = [
    "const net=require('node:net');",
    "const socket=net.createConnection({host:'127.0.0.1',port:Number(process.argv[1])});",
    'socket.setTimeout(1000);',
    "socket.on('connect',()=>{socket.destroy();process.exit(0)});",
    "socket.on('error',()=>process.exit(1));",
    "socket.on('timeout',()=>process.exit(1));",
  ].join('');
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = spawnSync(process.execPath, ['-e', script, String(port)], {
      encoding: 'utf8',
      timeout: 2_000,
    });
    if (result.status === 0) return;
    pause(100);
  }
  throw new Error('storage_startup_timeout');
}

function cleanup() {
  for (const [role, resource] of Object.entries(resources)) {
    if (!containerExists(resource.name)) continue;
    const ownership = docker([
      'inspect',
      resource.name,
      '--format',
      `{{index .Config.Labels "${GATE_LABEL}"}}|{{index .Config.Labels "${RUN_LABEL}"}}|{{index .Config.Labels "${ROLE_LABEL}"}}`,
    ]).trim();
    if (ownership !== `${GATE}|${RUN_ID}|${role}`) {
      throw new Error('container_ownership_mismatch');
    }
    docker(['rm', '--force', resource.name]);
  }
  if (networkExists(NETWORK)) {
    const ownership = docker([
      'network',
      'inspect',
      NETWORK,
      '--format',
      `{{index .Labels "${GATE_LABEL}"}}|{{index .Labels "${RUN_LABEL}"}}|{{index .Labels "${ROLE_LABEL}"}}`,
    ]).trim();
    if (ownership !== `${GATE}|${RUN_ID}|shared`) {
      throw new Error('network_ownership_mismatch');
    }
    docker(['network', 'rm', NETWORK]);
  }
  const residualContainers = docker([
    'ps',
    '--all',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
    '--format',
    '{{.Names}}',
  ]).trim();
  const residualNetworks = docker([
    'network',
    'ls',
    '--filter',
    `label=${RUN_LABEL}=${RUN_ID}`,
    '--format',
    '{{.Name}}',
  ]).trim();
  if (residualContainers || residualNetworks) {
    throw new Error('owned_resource_cleanup_incomplete');
  }
  return {
    runId: RUN_ID,
    containers: 0,
    networks: 0,
    processes: 0,
    temporaryFiles: 0,
  };
}

function allocateLoopbackPort() {
  const script = [
    "const net=require('node:net');",
    'const server=net.createServer();',
    "server.listen(0,'127.0.0.1',()=>{",
    'process.stdout.write(String(server.address().port));server.close();',
    '});',
  ].join('');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    const port = Number(result.stdout.trim());
    if (
      result.status === 0 &&
      Number.isInteger(port) &&
      !claimedPorts.has(port)
    ) {
      claimedPorts.add(port);
      return port;
    }
  }
  throw new Error('loopback_port_allocation_failed');
}

function containerExists(name) {
  return dockerResult(['container', 'inspect', name]).status === 0;
}

function networkExists(name) {
  return dockerResult(['network', 'inspect', name]).status === 0;
}

function docker(args) {
  const result = dockerResult(args);
  if (result.error || result.status !== 0) {
    throw new Error(`docker_command_failed:${args[0]}:${args[1] || ''}`);
  }
  return result.stdout;
}

function dockerResult(args) {
  return spawnSync('docker', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
    killSignal: 'SIGTERM',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function pause(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function safeMessage(error) {
  if (!(error instanceof Error)) return 'unknown_failure';
  return error.message.replaceAll(
    /(?:redis|postgresql):\/\/\S+/gu,
    '[REDACTED]',
  );
}
