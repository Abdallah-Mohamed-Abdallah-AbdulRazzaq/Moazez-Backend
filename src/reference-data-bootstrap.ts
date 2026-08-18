import { NestFactory } from '@nestjs/core';
import {
  BootstrapAuthorizationReferenceDataUseCase,
  ReferenceDataBootstrapError,
  isReferenceDataBootstrapError,
  type BootstrapAuthorizationReferenceDataResult,
} from './modules/iam/reference-data';
import { assertPlatformAdminBootstrapEnvironment } from './modules/platform-admin/bootstrap/platform-admin-bootstrap.environment';

const SAFE_BLOCKED_REASONS = new Set([
  'ARGUMENTS_INVALID',
  'ENVIRONMENT_MISMATCH',
  'EXECUTION_CONFIRMATION_REQUIRED',
  'REFERENCE_DATA_DRIFT',
  'UNSUPPORTED_ENVIRONMENT',
]);

const SAFE_FAILURE_REASONS = new Set([
  'INTERNAL_ERROR',
  'INVALID_BOOTSTRAP_RESULT',
]);

export interface ReferenceDataBootstrapArguments {
  execute: true;
  environment: 'staging';
}

export interface AuthorizationReferenceDataBootstrapExecutor {
  execute(): Promise<BootstrapAuthorizationReferenceDataResult>;
}

export interface ReferenceDataBootstrapApplicationContext {
  get(
    token: typeof BootstrapAuthorizationReferenceDataUseCase,
  ): AuthorizationReferenceDataBootstrapExecutor;
  close(): Promise<void>;
}

export interface ReferenceDataBootstrapCliDependencies {
  rawEnvironment?: NodeJS.ProcessEnv;
  assertEnvironment?: (
    requestedEnvironment: string,
    rawEnvironment: NodeJS.ProcessEnv,
  ) => unknown;
  createApplicationContext?: () => Promise<ReferenceDataBootstrapApplicationContext>;
  writeOutput?: (output: string) => void;
}

export type ReferenceDataBootstrapOutput =
  | {
      status: 'PASS';
      result: BootstrapAuthorizationReferenceDataResult;
    }
  | {
      status: 'BLOCKED' | 'FAIL';
      reason: string;
    };

export class ReferenceDataBootstrapCliError extends Error {
  constructor(
    readonly reason: string,
    readonly status: 'BLOCKED' | 'FAIL' = 'BLOCKED',
  ) {
    super(reason);
    this.name = ReferenceDataBootstrapCliError.name;
  }
}

export function parseReferenceDataBootstrapArguments(
  argv: readonly string[],
): ReferenceDataBootstrapArguments {
  let execute = false;
  let environment: string | undefined;

  for (const argument of argv) {
    if (argument === '--execute') {
      if (execute) {
        throw new ReferenceDataBootstrapCliError('ARGUMENTS_INVALID');
      }
      execute = true;
      continue;
    }

    const match = /^--environment=(.*)$/u.exec(argument);
    if (
      !match ||
      environment !== undefined ||
      match[1].length === 0 ||
      /[\0\r\n]/u.test(match[1])
    ) {
      throw new ReferenceDataBootstrapCliError('ARGUMENTS_INVALID');
    }
    environment = match[1];
  }

  if (!execute) {
    throw new ReferenceDataBootstrapCliError('EXECUTION_CONFIRMATION_REQUIRED');
  }
  if (!environment) {
    throw new ReferenceDataBootstrapCliError('ARGUMENTS_INVALID');
  }
  if (environment !== 'staging') {
    throw new ReferenceDataBootstrapCliError('UNSUPPORTED_ENVIRONMENT');
  }

  return { execute: true, environment };
}

export function formatReferenceDataBootstrapSuccess(
  result: BootstrapAuthorizationReferenceDataResult,
): string {
  if (
    result.status !== 'PASS' ||
    result.permissionsReady !== true ||
    result.systemRolesReady !== true ||
    result.platformSuperAdminReady !== true ||
    result.userMutation !== false ||
    !isSafeCount(result.permissionCount) ||
    result.permissionCount === 0 ||
    !isSafeCount(result.systemRoleCount) ||
    result.systemRoleCount === 0 ||
    !isSafeCount(result.platformSuperAdminPermissionCount) ||
    result.platformSuperAdminPermissionCount !== result.permissionCount
  ) {
    throw new ReferenceDataBootstrapCliError(
      'INVALID_BOOTSTRAP_RESULT',
      'FAIL',
    );
  }

  return [
    'REFERENCE_BOOTSTRAP_STATUS=PASS',
    'PERMISSIONS_READY=YES',
    'SYSTEM_ROLES_READY=YES',
    'PLATFORM_SUPER_ADMIN_READY=YES',
    `PERMISSION_COUNT=${result.permissionCount}`,
    `SYSTEM_ROLE_COUNT=${result.systemRoleCount}`,
    `PLATFORM_SUPER_ADMIN_PERMISSION_COUNT=${result.platformSuperAdminPermissionCount}`,
    'USER_MUTATION=NO',
  ].join('\n');
}

export function formatReferenceDataBootstrapRefusal(
  status: 'BLOCKED' | 'FAIL',
  reason: string,
): string {
  const allowedReasons =
    status === 'BLOCKED' ? SAFE_BLOCKED_REASONS : SAFE_FAILURE_REASONS;
  const safeReason = allowedReasons.has(reason)
    ? reason
    : status === 'BLOCKED'
      ? 'REFERENCE_DATA_DRIFT'
      : 'INTERNAL_ERROR';

  return [`REFERENCE_BOOTSTRAP_STATUS=${status}`, `REASON=${safeReason}`].join(
    '\n',
  );
}

export function formatReferenceDataBootstrapOutput(
  output: ReferenceDataBootstrapOutput,
): string {
  return output.status === 'PASS'
    ? formatReferenceDataBootstrapSuccess(output.result)
    : formatReferenceDataBootstrapRefusal(output.status, output.reason);
}

export function writeReferenceDataBootstrapOutput(output: string): void {
  process.stdout.write(`${output}\n`);
}

export async function createReferenceDataBootstrapApplicationContext(): Promise<ReferenceDataBootstrapApplicationContext> {
  const { ReferenceDataBootstrapModule } =
    await import('./modules/iam/reference-data/reference-data-bootstrap.module.js');
  return NestFactory.createApplicationContext(ReferenceDataBootstrapModule, {
    logger: false,
  });
}

export async function runReferenceDataBootstrapCli(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: ReferenceDataBootstrapCliDependencies = {},
): Promise<number> {
  const writeOutput =
    dependencies.writeOutput ?? writeReferenceDataBootstrapOutput;
  let argumentsValue: ReferenceDataBootstrapArguments;

  try {
    argumentsValue = parseReferenceDataBootstrapArguments(argv);
  } catch (error) {
    const output = classifyCliError(error);
    writeOutput(formatReferenceDataBootstrapOutput(output));
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
    const output: ReferenceDataBootstrapOutput = {
      status: 'BLOCKED',
      reason: 'ENVIRONMENT_MISMATCH',
    };
    writeOutput(formatReferenceDataBootstrapOutput(output));
    return exitCodeFor(output);
  }

  let application: ReferenceDataBootstrapApplicationContext | undefined;
  let output: ReferenceDataBootstrapOutput;
  try {
    const createApplicationContext =
      dependencies.createApplicationContext ??
      createReferenceDataBootstrapApplicationContext;
    application = await createApplicationContext();
    const useCase = application.get(BootstrapAuthorizationReferenceDataUseCase);
    output = { status: 'PASS', result: await useCase.execute() };
  } catch (error) {
    output = classifyBootstrapError(error);
  }

  if (application) {
    try {
      await application.close();
    } catch {
      output = { status: 'FAIL', reason: 'INTERNAL_ERROR' };
    }
  }

  let formatted: string;
  try {
    formatted = formatReferenceDataBootstrapOutput(output);
  } catch (error) {
    output = classifyCliError(error);
    formatted = formatReferenceDataBootstrapOutput(output);
  }
  writeOutput(formatted);
  return exitCodeFor(output);
}

function classifyCliError(error: unknown): ReferenceDataBootstrapOutput {
  if (error instanceof ReferenceDataBootstrapCliError) {
    return { status: error.status, reason: error.reason };
  }
  return { status: 'FAIL', reason: 'INTERNAL_ERROR' };
}

function classifyBootstrapError(error: unknown): ReferenceDataBootstrapOutput {
  if (
    error instanceof ReferenceDataBootstrapError ||
    isReferenceDataBootstrapError(error)
  ) {
    const reason = (error as { reason?: unknown }).reason;
    return {
      status: 'BLOCKED',
      reason: typeof reason === 'string' ? reason : 'REFERENCE_DATA_DRIFT',
    };
  }
  return { status: 'FAIL', reason: 'INTERNAL_ERROR' };
}

function isSafeCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function exitCodeFor(output: ReferenceDataBootstrapOutput): number {
  if (output.status === 'PASS') return 0;
  return output.status === 'BLOCKED' ? 2 : 1;
}

if (require.main === module) {
  void runReferenceDataBootstrapCli().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
