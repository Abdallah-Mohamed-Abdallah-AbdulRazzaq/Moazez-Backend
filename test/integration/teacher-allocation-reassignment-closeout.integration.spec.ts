import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

jest.setTimeout(300_000);

describe('teacher allocation reassignment closeout', () => {
  it('completes Preview and Execute with one application connection and proves real rollback', async () => {
    const harness = join(
      __dirname,
      'support',
      'teacher-allocation-reassignment-single-connection.harness.ts',
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--require',
        require.resolve('ts-node/register'),
        '--require',
        require.resolve('tsconfig-paths/register'),
        harness,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_RUNTIME_ROLE: 'api',
          DATABASE_CONNECTION_LIMIT: '1',
          DATABASE_POOL_TIMEOUT_SECONDS: '5',
          DATABASE_CONNECT_TIMEOUT_SECONDS: '5',
          NODE_OPTIONS: '--max-old-space-size=4096',
        },
        maxBuffer: 1024 * 1024,
        timeout: 240_000,
        windowsHide: true,
      },
    );

    expect(stdout).toContain('REASSIGNMENT_APP_DATABASE_CONNECTION_LIMIT=1');
    expect(stdout).toContain(
      'REASSIGNMENT_APP_DATABASE_POOL_TIMEOUT_SECONDS=5',
    );
    expect(stdout).toContain('REASSIGNMENT_SINGLE_CONNECTION_PREVIEW=PASS');
    expect(stdout).toContain('REASSIGNMENT_SINGLE_CONNECTION_EXECUTE=PASS');
    expect(stdout).toContain(
      'REASSIGNMENT_SINGLE_CONNECTION_NO_POOL_STARVATION=PASS',
    );
    expect(stdout).toContain('REASSIGNMENT_ATOMIC_ROLLBACK=PASS');
  });
});
