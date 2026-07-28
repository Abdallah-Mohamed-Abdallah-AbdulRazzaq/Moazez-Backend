import { spawn } from 'node:child_process';

jest.setTimeout(20_000);

describe('graceful shutdown early-failure process behavior', () => {
  it.each(['worker', 'http'] as const)(
    'observes an immediate %s rejection with active work',
    async (failureSource) => {
      const result = await runFailureProcess(failureSource);
      const evidence = JSON.parse(result.stdout) as {
        events: string[];
        uncaughtExceptions: number;
        unhandledRejections: number;
      };

      expect(result.code).toBe(1);
      expect(result.stderr).toBe('');
      expect(evidence.events).toContain('lifecycle.shutdown.failed');
      expect(evidence.events).not.toContain('lifecycle.shutdown.completed');
      expect(evidence.unhandledRejections).toBe(0);
      expect(evidence.uncaughtExceptions).toBe(0);
      expect(result.stdout).not.toContain('redis://owner:secret@localhost');
    },
  );
});

function runFailureProcess(
  failureSource: 'worker' | 'http',
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  const fixture = `
const { ApplicationLifecycleState } = require('./src/bootstrap/application-lifecycle.state');
const { GracefulShutdownCoordinator } = require('./src/bootstrap/graceful-shutdown');
const failureSource = process.argv[1];
const secret = 'redis://owner:secret@localhost';
const events = [];
let unhandledRejections = 0;
let uncaughtExceptions = 0;
process.on('unhandledRejection', () => { unhandledRejections += 1; });
process.on('uncaughtException', () => { uncaughtExceptions += 1; });
const lifecycle = new ApplicationLifecycleState();
lifecycle.tryAdmit('http');
const processTarget = {
  exitCode: undefined,
  on() {},
  off() {},
  exit(code) { process.exitCode = code; },
};
const coordinator = new GracefulShutdownCoordinator({
  app: { close: async () => undefined },
  httpServer: {
    close(callback) {
      callback(failureSource === 'http' ? new Error(secret) : undefined);
    },
  },
  lifecycle,
  queue: {
    beginWorkerDrain() {
      return failureSource === 'worker'
        ? Promise.reject(new Error(secret))
        : Promise.resolve();
    },
  },
  realtime: { disconnectSocketsForShutdown: async () => undefined },
  timeoutMs: 1000,
  logger: {
    log(entry) { events.push(entry.event); },
    error(entry) { events.push(entry.event); },
  },
  processTarget,
});
coordinator.handleSignal('SIGTERM').then(() => {
  setImmediate(() => {
    process.stdout.write(JSON.stringify({
      events,
      unhandledRejections,
      uncaughtExceptions,
    }));
  });
});
`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', fixture, failureSource],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TS_NODE_PROJECT: 'tsconfig.json',
        },
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}
