import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

jest.setTimeout(600_000);

describe('teacher allocation operational write concurrency', () => {
  it('serializes real operational writers with reassignment on PostgreSQL', async () => {
    const harness = join(
      __dirname,
      'support',
      'teacher-allocation-operational-write-concurrency.harness.ts',
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
          DATABASE_CONNECTION_LIMIT: '5',
          DATABASE_POOL_TIMEOUT_SECONDS: '5',
          DATABASE_CONNECT_TIMEOUT_SECONDS: '5',
          QUEUE_REDIS_URL: 'redis://127.0.0.1:6379/0',
          REALTIME_REDIS_URL: 'redis://127.0.0.1:6379/1',
          NODE_OPTIONS: '--max-old-space-size=4096',
        },
        maxBuffer: 1024 * 1024,
        timeout: 540_000,
        windowsHide: true,
      },
    );

    for (const domain of [
      'TASK',
      'ANNOUNCEMENT',
      'LESSON_PLAN',
      'HOMEWORK',
      'TIMETABLE',
    ]) {
      expect(stdout).toContain(`${domain}_WRITER_FIRST=PASS`);
      expect(stdout).toContain(`${domain}_REASSIGNMENT_FIRST=PASS`);
    }
    expect(stdout).toContain('TIMETABLE_BULK_WRITER_FIRST=PASS');
    expect(stdout).toContain('TIMETABLE_BULK_REASSIGNMENT_FIRST=PASS');
    expect(stdout).toContain('MULTI_ALLOCATION_DEADLOCK_TEST=PASS');
    expect(stdout).toContain('UNSAFE_BULK_TEACHER_CONFLICT_COUNT=0');
    expect(stdout).toContain('ORPHANED_OPERATIONAL_STATE_COUNT=0');
    expect(stdout).toContain('CORE_REINFORCEMENT_WRITER_FIRST=PASS');
    expect(stdout).toContain('CORE_REINFORCEMENT_REASSIGNMENT_FIRST=PASS');
    expect(stdout).toContain(
      'CORE_REINFORCEMENT_POST_REASSIGN_OLD_OWNER_REJECTED=PASS',
    );
    expect(stdout).toContain('ACTIVE_REINFORCEMENT_ORPHAN_COUNT=0');
    expect(stdout).toContain('CORE_MULTI_CONNECTION_INTERLEAVING=PASS');
  });
});
