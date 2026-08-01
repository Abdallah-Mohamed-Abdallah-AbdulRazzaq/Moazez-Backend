import { spawn } from 'node:child_process';

jest.setTimeout(20_000);

describe('management probe startup process state', () => {
  it.each([
    ['delayed', 0, [503, 200]],
    ['failed', 1, [503]],
  ] as const)(
    'reports bounded startup state for %s initialization',
    async (mode, expectedExit, expectedStatuses) => {
      const result = await runFixture(mode);

      expect(result.code).toBe(expectedExit);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({
        statuses: expectedStatuses,
      });
    },
  );
});

function runFixture(
  mode: 'delayed' | 'failed',
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  const fixture = `
const { ApplicationLifecycleState } =
  require('./src/bootstrap/application-lifecycle.state');
const {
  closeManagementProbeServer,
  createManagementProbeServer,
  listenManagementProbeServer,
} = require('./src/bootstrap/management-probe.server');
const { createOperationalRoleManifests } =
  require('./src/modules/health/operational-probe.manifests');
const { OperationalProbeService } =
  require('./src/modules/health/operational-probe.service');
const mode = process.argv[1];
const lifecycle = new ApplicationLifecycleState();
const service = new OperationalProbeService(
  lifecycle,
  { $queryRaw: async () => [{ value: 1 }] },
  {
    ping: async () => undefined,
    hasAvailableWorkers: () => true,
  },
  { checkReadiness: async () => undefined },
  { checkReadiness: async () => undefined },
  { checkReadiness: async () => undefined },
  {
    assertReady: async () => undefined,
    isVerified: () => true,
  },
  { checkReadiness: async () => undefined },
  createOperationalRoleManifests(),
);
const server = createManagementProbeServer(service);

void (async () => {
  await listenManagementProbeServer(server, 0, '127.0.0.1');
  const port = server.address().port;
  const readStartup = async () =>
    (await fetch(
      'http://127.0.0.1:' + port + '/internal/probes/api/startup'
    )).status;
  const statuses = [await readStartup()];
  if (mode === 'delayed') {
    await new Promise((resolve) => setTimeout(resolve, 20));
    service.markInitializationComplete();
    statuses.push(await readStartup());
  } else {
    service.markInitializationFailed();
    process.exitCode = 1;
  }
  await closeManagementProbeServer(server);
  process.stdout.write(JSON.stringify({ statuses }));
})().catch(() => {
  process.exitCode = 2;
});
`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', fixture, mode],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TS_NODE_PROJECT: 'tsconfig.json',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}
