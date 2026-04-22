const { spawnSync } = require('node:child_process');

const SERVICES = [
  { service: 'postgres', container: 'moazez-postgres' },
  { service: 'redis', container: 'moazez-redis' },
  { service: 'minio', container: 'moazez-minio' },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    ...options,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function fail(message, details) {
  if (message) {
    console.error(message);
  }
  if (details) {
    console.error(details.trim());
  }
  process.exit(1);
}

function listExistingContainers() {
  const result = run('docker', [
    'ps',
    '-a',
    '--format',
    '{{.Names}}|{{.State}}',
  ]);

  if (result.status !== 0) {
    fail('Unable to inspect Docker containers.', result.stderr);
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, state] = line.split('|');
      return { name, state };
    });
}

function getHealth(containerName) {
  const result = run('docker', [
    'inspect',
    '--format',
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
    containerName,
  ]);

  if (result.status !== 0) {
    return 'missing';
  }

  return result.stdout.trim();
}

function waitForHealthy(containerNames, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const unhealthy = containerNames.filter((name) => {
      const status = getHealth(name);
      return status !== 'healthy' && status !== 'running';
    });

    if (unhealthy.length === 0) {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  const states = containerNames.map((name) => `${name}: ${getHealth(name)}`);
  fail(
    'Local infrastructure did not become ready in time.',
    states.join('\n'),
  );
}

function main() {
  const existingByName = new Map(
    listExistingContainers().map((container) => [container.name, container.state]),
  );

  const stoppedContainers = SERVICES.filter(
    ({ container }) =>
      existingByName.has(container) && existingByName.get(container) !== 'running',
  ).map(({ container }) => container);

  const missingServices = SERVICES.filter(
    ({ container }) => !existingByName.has(container),
  ).map(({ service }) => service);

  if (stoppedContainers.length > 0) {
    const startResult = run('docker', ['start', ...stoppedContainers]);
    if (startResult.status !== 0) {
      fail('Unable to start existing Moazez infrastructure containers.', startResult.stderr);
    }
  }

  if (missingServices.length > 0) {
    const composeResult = run('docker', [
      'compose',
      'up',
      '-d',
      '--wait',
      ...missingServices,
    ]);

    if (composeResult.status !== 0) {
      fail('Unable to start missing Moazez infrastructure services.', composeResult.stderr);
    }
  }

  const expectedContainers = SERVICES.map(({ container }) => container);
  waitForHealthy(expectedContainers);

  console.log(
    'Moazez local infrastructure is ready: PostgreSQL, Redis, and MinIO are running.',
  );
}

main();
