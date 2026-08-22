import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  BootstrapAuthorizationReferenceDataUseCase,
  ReferenceDataBootstrapError,
} from './modules/iam/reference-data';
import {
  type AuthorizationReferenceDataBootstrapExecutor,
  type ReferenceDataBootstrapApplicationContext,
  formatReferenceDataBootstrapRefusal,
  parseReferenceDataBootstrapArguments,
  runReferenceDataBootstrapCli,
} from './reference-data-bootstrap';

const VALID_STAGING_ARGUMENTS = [
  '--execute',
  '--environment=staging',
] as const;
const VALID_PRODUCTION_ARGUMENTS = [
  '--execute',
  '--environment=production',
] as const;
const SYNTHETIC_SECRET = randomBytes(24).toString('base64url');
const SYNTHETIC_DATABASE_URL = `postgresql://moazez_api:${SYNTHETIC_SECRET}@127.0.0.1:5432/moazez?sslmode=require`;

describe('authorization reference-data bootstrap operator CLI', () => {
  it('accepts the exact governed staging and production contracts', () => {
    expect(
      parseReferenceDataBootstrapArguments(VALID_STAGING_ARGUMENTS),
    ).toEqual({
      execute: true,
      environment: 'staging',
    });
    expect(
      parseReferenceDataBootstrapArguments(VALID_PRODUCTION_ARGUMENTS),
    ).toEqual({
      execute: true,
      environment: 'production',
    });
  });

  it.each(['qa', 'prod'] as const)(
    'rejects the well-formed unsupported environment %s',
    (environment) => {
      expect(() =>
        parseReferenceDataBootstrapArguments([
          '--execute',
          '--environment=' + environment,
        ]),
      ).toThrow('UNSUPPORTED_ENVIRONMENT');
    },
  );

  it.each([
    {
      name: 'missing execution confirmation',
      argv: ['--environment=staging'],
      reason: 'EXECUTION_CONFIRMATION_REQUIRED',
    },
    {
      name: 'missing environment',
      argv: ['--execute'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'duplicate execution confirmation',
      argv: [...VALID_STAGING_ARGUMENTS, '--execute'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'duplicate environment',
      argv: [...VALID_STAGING_ARGUMENTS, '--environment=production'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'unknown flag',
      argv: [...VALID_STAGING_ARGUMENTS, '--unknown=value'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'positional argument',
      argv: [...VALID_STAGING_ARGUMENTS, 'positional-value'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'malformed execution confirmation',
      argv: ['--execute=true', '--environment=staging'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'malformed environment argument',
      argv: ['--execute', '--environment'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'empty environment',
      argv: ['--execute', '--environment='],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'environment containing a carriage return',
      argv: ['--execute', '--environment=staging\rproduction'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'environment containing a line feed',
      argv: ['--execute', '--environment=staging\nproduction'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'environment containing NUL',
      argv: ['--execute', '--environment=staging\0production'],
      reason: 'ARGUMENTS_INVALID',
    },
    {
      name: 'unsupported qa environment',
      argv: ['--execute', '--environment=qa'],
      reason: 'UNSUPPORTED_ENVIRONMENT',
    },
    {
      name: 'unsupported prod alias',
      argv: ['--execute', '--environment=prod'],
      reason: 'UNSUPPORTED_ENVIRONMENT',
    },
  ] as const)(
    'rejects $name before environment or database startup',
    async ({ argv, reason }) => {
      const assertEnvironment = jest.fn();
      const createApplicationContext = jest.fn();
      const outputs: string[] = [];

      const exitCode = await runReferenceDataBootstrapCli(argv, {
        assertEnvironment,
        createApplicationContext,
        writeOutput: (output) => outputs.push(output),
      });

      expect(exitCode).toBe(2);
      expect(assertEnvironment).not.toHaveBeenCalled();
      expect(createApplicationContext).not.toHaveBeenCalled();
      expect(outputs).toEqual([
        [
          'REFERENCE_BOOTSTRAP_STATUS=BLOCKED',
          'REASON=' + reason,
        ].join('\n'),
      ]);
    },
  );

  it('requires the governed staging runtime identity before database startup', async () => {
    const createApplicationContext = jest.fn();
    const outputs: string[] = [];

    const exitCode = await runReferenceDataBootstrapCli(
      VALID_STAGING_ARGUMENTS,
      {
        rawEnvironment: {
          NODE_ENV: 'staging',
          DATABASE_URL: SYNTHETIC_DATABASE_URL,
        },
        createApplicationContext,
        writeOutput: (output) => outputs.push(output),
      },
    );

    expect(exitCode).toBe(2);
    expect(createApplicationContext).not.toHaveBeenCalled();
    expect(outputs).toEqual([
      'REFERENCE_BOOTSTRAP_STATUS=BLOCKED\nREASON=ENVIRONMENT_MISMATCH',
    ]);
    expect(outputs[0]).not.toContain(SYNTHETIC_SECRET);
    expect(outputs[0]).not.toContain('DATABASE_URL');
  });

  it.each([
    {
      name: 'Staging',
      environment: 'staging',
      argv: VALID_STAGING_ARGUMENTS,
    },
    {
      name: 'Production',
      environment: 'production',
      argv: VALID_PRODUCTION_ARGUMENTS,
    },
  ] as const)(
    'runs the governed $name guard before context startup and emits stable PASS evidence last',
    async ({ environment, argv }) => {
      const calls: string[] = [];
      const outputs: string[] = [];
      const rawEnvironment = { NODE_ENV: environment };
      const assertEnvironment = jest.fn(
        (
          requestedEnvironment: string,
          receivedRawEnvironment: NodeJS.ProcessEnv,
        ) => {
          calls.push('environment');
          expect(requestedEnvironment).toBe(environment);
          expect(receivedRawEnvironment).toBe(rawEnvironment);
          return requestedEnvironment;
        },
      );
      const context = applicationContext(
        {
          execute: () => {
            calls.push('execute');
            return Promise.resolve(successfulResult());
          },
        },
        () => {
          calls.push('close');
          return Promise.resolve();
        },
      );

      const exitCode = await runReferenceDataBootstrapCli(argv, {
        rawEnvironment,
        assertEnvironment,
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
      expect(assertEnvironment).toHaveBeenCalledWith(
        environment,
        rawEnvironment,
      );
      expect(calls).toEqual([
        'environment',
        'context',
        'execute',
        'close',
        'output',
      ]);
      expect(outputs).toEqual([
        [
          'REFERENCE_BOOTSTRAP_STATUS=PASS',
          'PERMISSIONS_READY=YES',
          'SYSTEM_ROLES_READY=YES',
          'PLATFORM_SUPER_ADMIN_READY=YES',
          'PERMISSION_COUNT=236',
          'SYSTEM_ROLE_COUNT=7',
          'PLATFORM_SUPER_ADMIN_PERMISSION_COUNT=236',
          'USER_MUTATION=NO',
        ].join('\n'),
      ]);
    },
  );

  it('blocks a Production environment mismatch before application context startup', async () => {
    const calls: string[] = [];
    const outputs: string[] = [];
    const rawEnvironment = { NODE_ENV: 'staging' };
    const execute = jest.fn(() => Promise.resolve(successfulResult()));
    const createApplicationContext = jest.fn(() =>
      Promise.resolve(applicationContext({ execute })),
    );
    const assertEnvironment = jest.fn((requestedEnvironment: string) => {
      calls.push('environment');
      expect(requestedEnvironment).toBe('production');
      throw new Error('synthetic environment mismatch');
    });

    const exitCode = await runReferenceDataBootstrapCli(
      VALID_PRODUCTION_ARGUMENTS,
      {
        rawEnvironment,
        assertEnvironment,
        createApplicationContext,
        writeOutput: (output) => {
          calls.push('output');
          outputs.push(output);
        },
      },
    );

    expect(exitCode).toBe(2);
    expect(assertEnvironment).toHaveBeenCalledWith('production', rawEnvironment);
    expect(createApplicationContext).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(calls).toEqual(['environment', 'output']);
    expect(outputs).toEqual([
      'REFERENCE_BOOTSTRAP_STATUS=BLOCKED\nREASON=ENVIRONMENT_MISMATCH',
    ]);
  });

  it('returns a safe drift refusal and closes the application context', async () => {
    const close = jest.fn(() => Promise.resolve());
    const outputs: string[] = [];
    const context = applicationContext(
      {
        execute: () =>
          Promise.reject(
            new ReferenceDataBootstrapError('REFERENCE_DATA_DRIFT'),
          ),
      },
      close,
    );

    const exitCode = await runReferenceDataBootstrapCli(
      VALID_STAGING_ARGUMENTS,
      {
        assertEnvironment: () => 'staging',
        createApplicationContext: () => Promise.resolve(context),
        writeOutput: (output) => outputs.push(output),
      },
    );

    expect(exitCode).toBe(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(outputs).toEqual([
      'REFERENCE_BOOTSTRAP_STATUS=BLOCKED\nREASON=REFERENCE_DATA_DRIFT',
    ]);
  });

  it('collapses unexpected failures and cleanup failures without leaking secrets', async () => {
    for (const context of [
      applicationContext({
        execute: () =>
          Promise.reject(
            new Error(`private ${SYNTHETIC_DATABASE_URL} ${SYNTHETIC_SECRET}`),
          ),
      }),
      applicationContext(
        { execute: () => Promise.resolve(successfulResult()) },
        () => Promise.reject(new Error(`private ${SYNTHETIC_SECRET}`)),
      ),
    ]) {
      const outputs: string[] = [];
      const exitCode = await runReferenceDataBootstrapCli(
        VALID_STAGING_ARGUMENTS,
        {
          assertEnvironment: () => 'staging',
          createApplicationContext: () => Promise.resolve(context),
          writeOutput: (output) => outputs.push(output),
        },
      );

      expect(exitCode).toBe(1);
      expect(outputs).toEqual([
        'REFERENCE_BOOTSTRAP_STATUS=FAIL\nREASON=INTERNAL_ERROR',
      ]);
      expect(outputs[0]).not.toContain(SYNTHETIC_SECRET);
      expect(outputs[0]).not.toContain('DATABASE_URL');
    }
  });

  it('fails before framework startup in a wrong-environment process', () => {
    const repositoryRoot = resolve(__dirname, '..');
    const processResult = spawnSync(
      process.execPath,
      [
        '--require',
        'ts-node/register',
        'src/reference-data-bootstrap.ts',
        ...VALID_STAGING_ARGUMENTS,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DATABASE_URL: SYNTHETIC_DATABASE_URL,
        },
        timeout: 30_000,
        windowsHide: true,
      },
    );

    expect(processResult.status).toBe(2);
    expect(processResult.stdout.trim()).toBe(
      'REFERENCE_BOOTSTRAP_STATUS=BLOCKED\nREASON=ENVIRONMENT_MISMATCH',
    );
    expect(`${processResult.stdout}\n${processResult.stderr}`).not.toContain(
      SYNTHETIC_SECRET,
    );
  });

  it('does not pass through an unrecognized refusal reason', () => {
    expect(
      formatReferenceDataBootstrapRefusal(
        'FAIL',
        `PRIVATE_${SYNTHETIC_SECRET}`,
      ),
    ).toBe('REFERENCE_BOOTSTRAP_STATUS=FAIL\nREASON=INTERNAL_ERROR');
  });
});

function successfulResult() {
  return {
    status: 'PASS' as const,
    permissionsReady: true as const,
    systemRolesReady: true as const,
    platformSuperAdminReady: true as const,
    permissionCount: 236,
    systemRoleCount: 7,
    platformSuperAdminPermissionCount: 236,
    userMutation: false as const,
  };
}

function applicationContext(
  executor: AuthorizationReferenceDataBootstrapExecutor,
  close: () => Promise<void> = () => Promise.resolve(),
): ReferenceDataBootstrapApplicationContext {
  return {
    get: (token) => {
      expect(token).toBe(BootstrapAuthorizationReferenceDataUseCase);
      return executor;
    },
    close,
  };
}
