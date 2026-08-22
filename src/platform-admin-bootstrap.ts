import { NestFactory } from '@nestjs/core';
import { TextDecoder } from 'node:util';
import {
  BootstrapInitialPlatformAdministratorUseCase,
  PLATFORM_ADMIN_ROLE_CODE,
  PlatformAdminBootstrapError,
  assertPlatformAdminBootstrapEnvironment,
  isPlatformAdminBootstrapEnvironment,
  isPlatformAdminBootstrapError,
  type BootstrapInitialPlatformAdministratorCommand,
  type BootstrapInitialPlatformAdministratorResult,
  type PlatformAdminBootstrapEnvironment,
} from './modules/platform-admin/bootstrap';

export { PLATFORM_ADMIN_ROLE_CODE };
export const MAX_BOOTSTRAP_PASSWORD_BYTES = 1_024;

const MAX_BOOTSTRAP_STDIN_BYTES = MAX_BOOTSTRAP_PASSWORD_BYTES + 2;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

const SAFE_BLOCKED_REASONS = new Set([
  'ALREADY_INITIALIZED',
  'ARGUMENTS_INVALID',
  'BOOTSTRAP_REJECTED',
  'CONCURRENT_BOOTSTRAP_CONFLICT',
  'EMAIL_IN_USE',
  'ENVIRONMENT_MISMATCH',
  'EXECUTION_CONFIRMATION_REQUIRED',
  'INVALID_INPUT',
  'PASSWORD_ARGUMENT_FORBIDDEN',
  'PASSWORD_INPUT_EMPTY',
  'PASSWORD_INPUT_INVALID_UTF8',
  'PASSWORD_INPUT_MULTILINE',
  'PASSWORD_INPUT_TOO_LARGE',
  'PASSWORD_POLICY_VIOLATION',
  'PASSWORD_STDIN_REQUIRED',
  'REFERENCE_DATA_INVALID',
  'UNSUPPORTED_ENVIRONMENT',
]);

const SAFE_FAILURE_REASONS = new Set([
  'INTERNAL_ERROR',
  'INVALID_BOOTSTRAP_RESULT',
  'PASSWORD_INPUT_UNAVAILABLE',
]);

export interface PlatformAdminBootstrapArguments {
  execute: true;
  environment: PlatformAdminBootstrapEnvironment;
  email: string;
  firstName: string;
  lastName: string;
}

export interface BootstrapPasswordInput extends AsyncIterable<
  string | Uint8Array
> {
  isTTY?: boolean;
}

export interface BootstrapInitialPlatformAdministratorExecutor {
  execute(
    command: BootstrapInitialPlatformAdministratorCommand,
  ): Promise<BootstrapInitialPlatformAdministratorResult>;
}

export interface PlatformAdminBootstrapApplicationContext {
  get(
    token: typeof BootstrapInitialPlatformAdministratorUseCase,
  ): BootstrapInitialPlatformAdministratorExecutor;
  close(): Promise<void>;
}

export interface PlatformAdminBootstrapCliDependencies {
  rawEnvironment?: NodeJS.ProcessEnv;
  stdin?: BootstrapPasswordInput;
  assertEnvironment?: (
    requestedEnvironment: string,
    rawEnvironment: NodeJS.ProcessEnv,
  ) => unknown;
  readPassword?: (stdin: BootstrapPasswordInput) => Promise<string>;
  createApplicationContext?: () => Promise<PlatformAdminBootstrapApplicationContext>;
  writeOutput?: (output: string) => void;
}

export type PlatformAdminBootstrapOutput =
  | {
      status: 'PASS';
      result: BootstrapInitialPlatformAdministratorResult;
    }
  | {
      status: 'BLOCKED' | 'FAIL';
      reason: string;
    };

export class PlatformAdminBootstrapCliError extends Error {
  constructor(
    readonly reason: string,
    readonly status: 'BLOCKED' | 'FAIL' = 'BLOCKED',
  ) {
    super(reason);
    this.name = PlatformAdminBootstrapCliError.name;
  }
}

export function parsePlatformAdminBootstrapArguments(
  argv: readonly string[],
): PlatformAdminBootstrapArguments {
  const values = new Map<string, string>();
  let execute = false;

  for (const argument of argv) {
    const flagName = argument.split('=', 1)[0];
    if (/^--[^=]*password[^=]*$/iu.test(flagName)) {
      throw new PlatformAdminBootstrapCliError('PASSWORD_ARGUMENT_FORBIDDEN');
    }

    if (argument === '--execute') {
      if (execute) {
        throw new PlatformAdminBootstrapCliError('ARGUMENTS_INVALID');
      }
      execute = true;
      continue;
    }

    const match =
      /^(--environment|--email|--first-name|--last-name)=(.*)$/u.exec(argument);
    if (!match) {
      throw new PlatformAdminBootstrapCliError('ARGUMENTS_INVALID');
    }

    const [, name, value] = match;
    if (values.has(name) || value.length === 0 || /[\0\r\n]/u.test(value)) {
      throw new PlatformAdminBootstrapCliError('ARGUMENTS_INVALID');
    }
    values.set(name, value);
  }

  if (!execute) {
    throw new PlatformAdminBootstrapCliError('EXECUTION_CONFIRMATION_REQUIRED');
  }

  const environment = values.get('--environment');
  const email = values.get('--email');
  const firstName = values.get('--first-name');
  const lastName = values.get('--last-name');
  if (!environment || !email || !firstName || !lastName) {
    throw new PlatformAdminBootstrapCliError('ARGUMENTS_INVALID');
  }
  if (!isPlatformAdminBootstrapEnvironment(environment)) {
    throw new PlatformAdminBootstrapCliError('UNSUPPORTED_ENVIRONMENT');
  }

  return {
    execute: true,
    environment,
    email,
    firstName,
    lastName,
  };
}

export async function readBootstrapPasswordFromStdin(
  stdin: BootstrapPasswordInput,
): Promise<string> {
  if (stdin.isTTY === true) {
    throw new PlatformAdminBootstrapCliError('PASSWORD_STDIN_REQUIRED');
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let joined: Buffer | undefined;

  try {
    for await (const chunk of stdin) {
      const buffer =
        typeof chunk === 'string'
          ? Buffer.from(chunk, 'utf8')
          : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_BOOTSTRAP_STDIN_BYTES) {
        buffer.fill(0);
        throw new PlatformAdminBootstrapCliError('PASSWORD_INPUT_TOO_LARGE');
      }
      chunks.push(buffer);
    }

    joined = Buffer.concat(chunks, totalBytes);
    let rawPassword: string;
    try {
      rawPassword = new TextDecoder('utf-8', { fatal: true }).decode(joined);
    } catch {
      throw new PlatformAdminBootstrapCliError('PASSWORD_INPUT_INVALID_UTF8');
    }

    const password = rawPassword.endsWith('\r\n')
      ? rawPassword.slice(0, -2)
      : rawPassword.endsWith('\n')
        ? rawPassword.slice(0, -1)
        : rawPassword;

    if (password.length === 0) {
      throw new PlatformAdminBootstrapCliError('PASSWORD_INPUT_EMPTY');
    }
    if (/[\r\n]/u.test(password)) {
      throw new PlatformAdminBootstrapCliError('PASSWORD_INPUT_MULTILINE');
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_BOOTSTRAP_PASSWORD_BYTES) {
      throw new PlatformAdminBootstrapCliError('PASSWORD_INPUT_TOO_LARGE');
    }

    return password;
  } finally {
    joined?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function formatPlatformAdminBootstrapSuccess(
  result: BootstrapInitialPlatformAdministratorResult,
): string {
  if (
    result.status !== 'PASS' ||
    result.platformAdminCreated !== true ||
    !SAFE_IDENTIFIER_PATTERN.test(result.platformAdminUserId) ||
    result.roleCode !== PLATFORM_ADMIN_ROLE_CODE
  ) {
    throw new PlatformAdminBootstrapCliError(
      'INVALID_BOOTSTRAP_RESULT',
      'FAIL',
    );
  }

  return [
    'BOOTSTRAP_STATUS=PASS',
    'PLATFORM_ADMIN_CREATED=YES',
    `PLATFORM_ADMIN_USER_ID=${result.platformAdminUserId}`,
    `ROLE_CODE=${PLATFORM_ADMIN_ROLE_CODE}`,
  ].join('\n');
}

export function formatPlatformAdminBootstrapRefusal(
  status: 'BLOCKED' | 'FAIL',
  reason: string,
): string {
  const allowedReasons =
    status === 'BLOCKED' ? SAFE_BLOCKED_REASONS : SAFE_FAILURE_REASONS;
  const safeReason = allowedReasons.has(reason)
    ? reason
    : status === 'BLOCKED'
      ? 'BOOTSTRAP_REJECTED'
      : 'INTERNAL_ERROR';

  return [`BOOTSTRAP_STATUS=${status}`, `REASON=${safeReason}`].join('\n');
}

export function formatPlatformAdminBootstrapOutput(
  output: PlatformAdminBootstrapOutput,
): string {
  return output.status === 'PASS'
    ? formatPlatformAdminBootstrapSuccess(output.result)
    : formatPlatformAdminBootstrapRefusal(output.status, output.reason);
}

export function writePlatformAdminBootstrapOutput(output: string): void {
  process.stdout.write(`${output}\n`);
}

export async function createPlatformAdminBootstrapApplicationContext(): Promise<PlatformAdminBootstrapApplicationContext> {
  const { PlatformAdminBootstrapModule } =
    await import('./modules/platform-admin/bootstrap/platform-admin-bootstrap.module.js');
  const application = await NestFactory.createApplicationContext(
    PlatformAdminBootstrapModule,
    { logger: false },
  );
  return application;
}

export async function runPlatformAdminBootstrapCli(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: PlatformAdminBootstrapCliDependencies = {},
): Promise<number> {
  const writeOutput =
    dependencies.writeOutput ?? writePlatformAdminBootstrapOutput;
  let argumentsValue: PlatformAdminBootstrapArguments;

  try {
    argumentsValue = parsePlatformAdminBootstrapArguments(argv);
  } catch (error) {
    const output = classifyCliError(error);
    writeOutput(formatPlatformAdminBootstrapOutput(output));
    return exitCodeFor(output);
  }

  try {
    const assertEnvironment =
      dependencies.assertEnvironment ?? assertPlatformAdminBootstrapEnvironment;
    assertEnvironment(
      argumentsValue.environment,
      dependencies.rawEnvironment ?? process.env,
    );
  } catch {
    const output: PlatformAdminBootstrapOutput = {
      status: 'BLOCKED',
      reason: 'ENVIRONMENT_MISMATCH',
    };
    writeOutput(formatPlatformAdminBootstrapOutput(output));
    return exitCodeFor(output);
  }

  let password: string | undefined;
  try {
    const readPassword =
      dependencies.readPassword ?? readBootstrapPasswordFromStdin;
    password = await readPassword(
      dependencies.stdin ?? (process.stdin as BootstrapPasswordInput),
    );
  } catch (error) {
    const output =
      error instanceof PlatformAdminBootstrapCliError
        ? classifyCliError(error)
        : ({
            status: 'FAIL',
            reason: 'PASSWORD_INPUT_UNAVAILABLE',
          } satisfies PlatformAdminBootstrapOutput);
    writeOutput(formatPlatformAdminBootstrapOutput(output));
    return exitCodeFor(output);
  }

  let application: PlatformAdminBootstrapApplicationContext | undefined;
  let output: PlatformAdminBootstrapOutput;
  try {
    const createApplicationContext =
      dependencies.createApplicationContext ??
      createPlatformAdminBootstrapApplicationContext;
    application = await createApplicationContext();
    const useCase = application.get(
      BootstrapInitialPlatformAdministratorUseCase,
    );
    const result = await useCase.execute({
      environment: argumentsValue.environment,
      email: argumentsValue.email,
      password,
      firstName: argumentsValue.firstName,
      lastName: argumentsValue.lastName,
    });
    output = { status: 'PASS', result };
  } catch (error) {
    output = classifyBootstrapError(error);
  } finally {
    password = undefined;
  }

  if (application) {
    try {
      await application.close();
    } catch {
      // The transaction outcome remains authoritative after cleanup is attempted.
    }
  }

  let formatted: string;
  try {
    formatted = formatPlatformAdminBootstrapOutput(output);
  } catch (error) {
    output = classifyCliError(error);
    formatted = formatPlatformAdminBootstrapOutput(output);
  }
  writeOutput(formatted);
  return exitCodeFor(output);
}

function classifyCliError(error: unknown): PlatformAdminBootstrapOutput {
  if (error instanceof PlatformAdminBootstrapCliError) {
    return { status: error.status, reason: error.reason };
  }
  return { status: 'FAIL', reason: 'INTERNAL_ERROR' };
}

function classifyBootstrapError(error: unknown): PlatformAdminBootstrapOutput {
  if (
    error instanceof PlatformAdminBootstrapError ||
    isPlatformAdminBootstrapError(error)
  ) {
    const reason = (error as { reason?: unknown }).reason;
    return {
      status: 'BLOCKED',
      reason: typeof reason === 'string' ? reason : 'BOOTSTRAP_REJECTED',
    };
  }
  return { status: 'FAIL', reason: 'INTERNAL_ERROR' };
}

function exitCodeFor(output: PlatformAdminBootstrapOutput): number {
  if (output.status === 'PASS') return 0;
  return output.status === 'BLOCKED' ? 2 : 1;
}

if (require.main === module) {
  void runPlatformAdminBootstrapCli().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
