import { Readable } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  PlatformAdminBootstrapError,
  BootstrapInitialPlatformAdministratorUseCase,
} from './modules/platform-admin/bootstrap';
import {
  MAX_BOOTSTRAP_PASSWORD_BYTES,
  type BootstrapInitialPlatformAdministratorExecutor,
  type BootstrapPasswordInput,
  type PlatformAdminBootstrapApplicationContext,
  formatPlatformAdminBootstrapRefusal,
  parsePlatformAdminBootstrapArguments,
  readBootstrapPasswordFromStdin,
  runPlatformAdminBootstrapCli,
} from './platform-admin-bootstrap';

const EMAIL = `stage20b-${randomUUID()}@example.test`;
const VALID_ARGUMENTS = [
  '--execute',
  '--environment=staging',
  `--email=${EMAIL}`,
  '--first-name=Initial',
  '--last-name=Administrator',
] as const;

const USER_ID = 'ca9ab8a3-1ea1-4ee8-9ccf-7615564dc266';
const PASSWORD = `Aa1!${randomBytes(24).toString('base64url')}`;
const PASSWORD_HASH = `$argon2id$${randomBytes(24).toString('base64url')}`;

describe('Platform Administrator bootstrap operator CLI', () => {
  it('accepts only the complete explicit argument contract', () => {
    expect(parsePlatformAdminBootstrapArguments(VALID_ARGUMENTS)).toEqual({
      execute: true,
      environment: 'staging',
      email: EMAIL,
      firstName: 'Initial',
      lastName: 'Administrator',
    });

    const invalidArgumentSets: readonly (readonly string[])[] = [
      VALID_ARGUMENTS.slice(1),
      [...VALID_ARGUMENTS, '--execute'],
      [...VALID_ARGUMENTS, `--email=second-${randomUUID()}@example.test`],
      [...VALID_ARGUMENTS, '--unknown=value'],
      [
        ...VALID_ARGUMENTS.filter((value) => !value.startsWith('--email=')),
        '--email',
      ],
      VALID_ARGUMENTS.map((value) =>
        value === '--environment=staging' ? '--environment=production' : value,
      ),
      [...VALID_ARGUMENTS, 'positional-value'],
    ];

    for (const invalidArguments of invalidArgumentSets) {
      expect(() =>
        parsePlatformAdminBootstrapArguments(invalidArguments),
      ).toThrow();
    }
  });

  it.each([
    `--password=${PASSWORD}`,
    '--password-file=/synthetic/path',
    `--initial-password=${PASSWORD}`,
    '--PASSWORD-STDIN=true',
  ])('explicitly rejects password-bearing argv flag %s', (argument) => {
    expect(() =>
      parsePlatformAdminBootstrapArguments([...VALID_ARGUMENTS, argument]),
    ).toThrow('PASSWORD_ARGUMENT_FORBIDDEN');
  });

  it('checks the exact environment before reading stdin or creating Nest context', async () => {
    const calls: string[] = [];
    const outputs: string[] = [];
    const readPassword = jest.fn(() => {
      calls.push('stdin');
      return Promise.resolve(PASSWORD);
    });
    const createApplicationContext = jest.fn(() => {
      calls.push('context');
      return Promise.resolve(successfulContext());
    });

    const exitCode = await runPlatformAdminBootstrapCli(VALID_ARGUMENTS, {
      rawEnvironment: { NODE_ENV: 'production' },
      assertEnvironment: () => {
        calls.push('environment');
        throw new Error('private environment detail');
      },
      readPassword,
      createApplicationContext,
      writeOutput: (output) => outputs.push(output),
    });

    expect(exitCode).toBe(2);
    expect(calls).toEqual(['environment']);
    expect(readPassword).not.toHaveBeenCalled();
    expect(createApplicationContext).not.toHaveBeenCalled();
    expect(outputs).toEqual([
      'BOOTSTRAP_STATUS=BLOCKED\nREASON=ENVIRONMENT_MISMATCH',
    ]);
  });

  it('fails closed before framework startup in a wrong-environment process', () => {
    const repositoryRoot = resolve(__dirname, '..');
    const processResult = spawnSync(
      process.execPath,
      [
        '--require',
        'ts-node/register',
        'src/platform-admin-bootstrap.ts',
        ...VALID_ARGUMENTS,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'production' },
        input: `${PASSWORD}\n`,
        timeout: 30_000,
        windowsHide: true,
      },
    );

    expect(processResult.status).toBe(2);
    expect(processResult.signal).toBeNull();
    expect(processResult.stdout.trim()).toBe(
      'BOOTSTRAP_STATUS=BLOCKED\nREASON=ENVIRONMENT_MISMATCH',
    );
    expect(processResult.stdout).not.toContain(PASSWORD);
    expect(processResult.stderr).not.toContain(PASSWORD);
  });

  it('rejects TTY, multiline, oversized, empty, and invalid UTF-8 password input', async () => {
    await expect(
      readBootstrapPasswordFromStdin(passwordInput([PASSWORD], true)),
    ).rejects.toThrow('PASSWORD_STDIN_REQUIRED');
    await expect(
      readBootstrapPasswordFromStdin(passwordInput(['line-one\nline-two\n'])),
    ).rejects.toThrow('PASSWORD_INPUT_MULTILINE');
    await expect(
      readBootstrapPasswordFromStdin(
        passwordInput([Buffer.alloc(MAX_BOOTSTRAP_PASSWORD_BYTES + 1, 0x61)]),
      ),
    ).rejects.toThrow('PASSWORD_INPUT_TOO_LARGE');
    await expect(
      readBootstrapPasswordFromStdin(passwordInput(['\n'])),
    ).rejects.toThrow('PASSWORD_INPUT_EMPTY');
    await expect(
      readBootstrapPasswordFromStdin(
        passwordInput([Buffer.from([0xc3, 0x28])]),
      ),
    ).rejects.toThrow('PASSWORD_INPUT_INVALID_UTF8');
  });

  it('removes only one terminal CRLF or LF', async () => {
    await expect(
      readBootstrapPasswordFromStdin(passwordInput([`${PASSWORD}\r\n`])),
    ).resolves.toBe(PASSWORD);
    await expect(
      readBootstrapPasswordFromStdin(passwordInput([`${PASSWORD}\n`])),
    ).resolves.toBe(PASSWORD);
    await expect(
      readBootstrapPasswordFromStdin(passwordInput([`${PASSWORD}\n\n`])),
    ).rejects.toThrow('PASSWORD_INPUT_MULTILINE');
  });

  it('emits bounded PASS evidence only after the application context closes', async () => {
    const calls: string[] = [];
    const outputs: string[] = [];
    const executor: BootstrapInitialPlatformAdministratorExecutor = {
      execute: (command) => {
        calls.push('execute');
        expect(command).toEqual({
          email: EMAIL,
          password: PASSWORD,
          firstName: 'Initial',
          lastName: 'Administrator',
        });
        return Promise.resolve({
          status: 'PASS',
          platformAdminCreated: true,
          platformAdminUserId: USER_ID,
          roleCode: 'platform_super_admin',
        });
      },
    };
    const context = applicationContext(executor, () => {
      calls.push('close');
      return Promise.resolve();
    });

    const exitCode = await runPlatformAdminBootstrapCli(VALID_ARGUMENTS, {
      rawEnvironment: { NODE_ENV: 'staging' },
      assertEnvironment: (requestedEnvironment, rawEnvironment) => {
        calls.push('environment');
        expect(requestedEnvironment).toBe('staging');
        expect(rawEnvironment.NODE_ENV).toBe('staging');
        return 'staging';
      },
      readPassword: () => {
        calls.push('stdin');
        return Promise.resolve(PASSWORD);
      },
      createApplicationContext: () => {
        calls.push('context');
        return Promise.resolve(context);
      },
      writeOutput: (output) => {
        calls.push('output');
        outputs.push(output);
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      'environment',
      'stdin',
      'context',
      'execute',
      'close',
      'output',
    ]);
    expect(outputs).toEqual([
      [
        'BOOTSTRAP_STATUS=PASS',
        'PLATFORM_ADMIN_CREATED=YES',
        `PLATFORM_ADMIN_USER_ID=${USER_ID}`,
        'ROLE_CODE=platform_super_admin',
      ].join('\n'),
    ]);
    expect(outputs[0]).not.toContain(PASSWORD);
    expect(outputs[0]).not.toContain(PASSWORD_HASH);
  });

  it('emits an allowlisted BLOCKED reason and closes after a domain refusal', async () => {
    const outputs: string[] = [];
    const close = jest.fn(() => Promise.resolve());
    const context = applicationContext(
      {
        execute: jest.fn(() =>
          Promise.reject(
            new PlatformAdminBootstrapError('ALREADY_INITIALIZED'),
          ),
        ),
      },
      close,
    );

    const exitCode = await runPlatformAdminBootstrapCli(VALID_ARGUMENTS, {
      assertEnvironment: () => 'staging',
      readPassword: () => Promise.resolve(PASSWORD),
      createApplicationContext: () => Promise.resolve(context),
      writeOutput: (output) => outputs.push(output),
    });

    expect(exitCode).toBe(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(outputs).toEqual([
      'BOOTSTRAP_STATUS=BLOCKED\nREASON=ALREADY_INITIALIZED',
    ]);
    expect(outputs[0]).not.toContain(PASSWORD);
    expect(outputs[0]).not.toContain(PASSWORD_HASH);
  });

  it('maps unknown failures to a fixed non-secret reason and still closes', async () => {
    const outputs: string[] = [];
    const close = jest.fn(() => Promise.resolve());
    const context = applicationContext(
      {
        execute: jest.fn(() =>
          Promise.reject(new Error(`private: ${PASSWORD} ${PASSWORD_HASH}`)),
        ),
      },
      close,
    );

    const exitCode = await runPlatformAdminBootstrapCli(VALID_ARGUMENTS, {
      assertEnvironment: () => 'staging',
      readPassword: () => Promise.resolve(PASSWORD),
      createApplicationContext: () => Promise.resolve(context),
      writeOutput: (output) => outputs.push(output),
    });

    expect(exitCode).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(outputs).toEqual(['BOOTSTRAP_STATUS=FAIL\nREASON=INTERNAL_ERROR']);
    expect(outputs[0]).not.toContain(PASSWORD);
    expect(outputs[0]).not.toContain(PASSWORD_HASH);
  });

  it('does not pass through an unrecognized refusal reason', () => {
    expect(
      formatPlatformAdminBootstrapRefusal(
        'BLOCKED',
        `PRIVATE_${PASSWORD}_${PASSWORD_HASH}`,
      ),
    ).toBe('BOOTSTRAP_STATUS=BLOCKED\nREASON=BOOTSTRAP_REJECTED');
  });
});

function passwordInput(
  chunks: readonly (string | Uint8Array)[],
  isTTY = false,
): BootstrapPasswordInput {
  const input = Readable.from(chunks) as BootstrapPasswordInput;
  input.isTTY = isTTY;
  return input;
}

function successfulContext(): PlatformAdminBootstrapApplicationContext {
  return applicationContext({
    execute: () =>
      Promise.resolve({
        status: 'PASS',
        platformAdminCreated: true,
        platformAdminUserId: USER_ID,
        roleCode: 'platform_super_admin',
      }),
  });
}

function applicationContext(
  executor: BootstrapInitialPlatformAdministratorExecutor,
  close: () => Promise<void> = () => Promise.resolve(),
): PlatformAdminBootstrapApplicationContext {
  return {
    get: (token) => {
      expect(token).toBe(BootstrapInitialPlatformAdministratorUseCase);
      return executor;
    },
    close,
  };
}
