'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  DEFAULT_MANIFEST_PATH,
  verifyManifest,
} = require('./migration-artifact-manifest.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const PRISMA_CLI_PATH = path.join(
  REPOSITORY_ROOT,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);
const TOTAL_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024;
const REQUIRED_ENVIRONMENT_KEYS = Object.freeze([
  'DATABASE_URL',
  'MIGRATION_JOB_EXECUTION_ID',
  'MIGRATION_JOB_ENVIRONMENT',
  'MIGRATION_JOB_ARTIFACT_DIGEST',
  'MIGRATION_JOB_APPROVAL_REF',
  'MIGRATION_JOB_BACKUP_CHECKPOINT',
  'MIGRATION_JOB_DATA_AUTHORITY',
]);
const ALLOWED_ENVIRONMENTS = Object.freeze(['disposable', 'staging', 'production']);
const ARTIFACT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const OPAQUE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const PRISMA_COMMANDS = Object.freeze([
  Object.freeze({ stage: 'prisma-validate', args: Object.freeze(['validate']) }),
  Object.freeze({ stage: 'migrate-deploy', args: Object.freeze(['migrate', 'deploy']) }),
  Object.freeze({ stage: 'migrate-status', args: Object.freeze(['migrate', 'status']) }),
  Object.freeze({
    stage: 'migrate-diff',
    args: Object.freeze([
      'migrate',
      'diff',
      '--from-schema-datasource',
      'prisma/schema.prisma',
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ]),
  }),
]);

class MigrationJobError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'MigrationJobError';
    this.code = code;
  }
}

function hashReference(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function sanitizeCapturedOutput(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[redacted-database-url]')
    .replace(/DATABASE_URL\s*=\s*[^\s"']+/giu, 'DATABASE_URL=[redacted]')
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/@\s]+@/gu, '$1[redacted]@')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .slice(0, MAX_CAPTURED_OUTPUT_BYTES);
}

function outputFingerprint(result) {
  const sanitized = sanitizeCapturedOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return hashReference(sanitized);
}

function assertReference(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  if (/[\r\n\u0000]/u.test(value)) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  return value;
}

function assertBoundReference(value, prefix, executionId) {
  const reference = assertReference(value);
  const boundPrefix = `${prefix}:${executionId}:`;
  if (!reference.startsWith(boundPrefix)) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  const opaqueReference = reference.slice(boundPrefix.length);
  if (!OPAQUE_REFERENCE_PATTERN.test(opaqueReference)) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  return reference;
}

function validateDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  let databaseIdentity;
  try {
    databaseIdentity = decodeURIComponent(url.username);
  } catch {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  if (
    databaseIdentity !== 'moazez_migration' ||
    url.password.length === 0 ||
    url.hostname.length === 0 ||
    url.pathname.replace(/^\//u, '').length === 0
  ) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  const connectionLimits = url.searchParams.getAll('connection_limit');
  const schemas = url.searchParams.getAll('schema');
  const overridesSearchPath = [...url.searchParams.keys()].some((key) =>
    ['options', 'search_path'].includes(key.toLowerCase()),
  );
  if (
    connectionLimits.length !== 1 ||
    connectionLimits[0] !== '2' ||
    schemas.length !== 1 ||
    schemas[0] !== 'public' ||
    overridesSearchPath
  ) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  return databaseIdentity;
}

function validateEnvironment(rawEnvironment = process.env) {
  for (const key of REQUIRED_ENVIRONMENT_KEYS) {
    if (typeof rawEnvironment[key] !== 'string' || rawEnvironment[key].length === 0) {
      throw new MigrationJobError('migration_environment_contract_invalid');
    }
  }

  const executionId = rawEnvironment.MIGRATION_JOB_EXECUTION_ID;
  const environment = rawEnvironment.MIGRATION_JOB_ENVIRONMENT;
  const artifactDigest = rawEnvironment.MIGRATION_JOB_ARTIFACT_DIGEST;
  if (
    !EXECUTION_ID_PATTERN.test(executionId) ||
    !ALLOWED_ENVIRONMENTS.includes(environment) ||
    !ARTIFACT_DIGEST_PATTERN.test(artifactDigest)
  ) {
    throw new MigrationJobError('migration_environment_contract_invalid');
  }

  const disposableReference = `DISPOSABLE_NA:${executionId}`;
  let approvalRef;
  let backupCheckpoint;
  let dataAuthority;
  if (environment === 'disposable') {
    approvalRef = assertReference(rawEnvironment.MIGRATION_JOB_APPROVAL_REF);
    backupCheckpoint = assertReference(rawEnvironment.MIGRATION_JOB_BACKUP_CHECKPOINT);
    dataAuthority = assertReference(rawEnvironment.MIGRATION_JOB_DATA_AUTHORITY);
    if (
      approvalRef !== `SYNTHETIC_APPROVAL:${executionId}` ||
      backupCheckpoint !== disposableReference ||
      dataAuthority !== disposableReference
    ) {
      throw new MigrationJobError('migration_environment_contract_invalid');
    }
  } else {
    approvalRef = assertBoundReference(
      rawEnvironment.MIGRATION_JOB_APPROVAL_REF,
      'APPROVED',
      executionId,
    );
    backupCheckpoint = assertBoundReference(
      rawEnvironment.MIGRATION_JOB_BACKUP_CHECKPOINT,
      'BACKUP',
      executionId,
    );
    dataAuthority = assertBoundReference(
      rawEnvironment.MIGRATION_JOB_DATA_AUTHORITY,
      'DATA_AUTHORITY',
      executionId,
    );
  }

  const databaseIdentity = validateDatabaseUrl(rawEnvironment.DATABASE_URL);
  return Object.freeze({
    executionId,
    environment,
    artifactDigest,
    databaseIdentity,
    approvalRefHash: hashReference(approvalRef),
    backupCheckpointHash: hashReference(backupCheckpoint),
    dataAuthorityHash: hashReference(dataAuthority),
  });
}

function createJsonLogger(writeLine = (line) => process.stdout.write(`${line}\n`)) {
  return (event) => writeLine(JSON.stringify(event));
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 1_000);
  forceTimer.unref();
}

function createPrismaExecutor(options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  const prismaCliPath = options.prismaCliPath ?? PRISMA_CLI_PATH;
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const signalState = options.signalState ?? { interrupted: false, activeChild: null };

  return function executePrisma(args, remainingMs, environment) {
    return new Promise((resolve) => {
      if (remainingMs <= 0) {
        resolve({ exitCode: null, stdout: '', stderr: '', timedOut: true, interrupted: false });
        return;
      }

      const child = spawnProcess(process.execPath, [prismaCliPath, ...args], {
        cwd: repositoryRoot,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      signalState.activeChild = child;
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const appendBounded = (current, chunk) =>
        `${current}${String(chunk)}`.slice(0, MAX_CAPTURED_OUTPUT_BYTES);
      child.stdout?.on('data', (chunk) => {
        stdout = appendBounded(stdout, chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderr = appendBounded(stderr, chunk);
      });

      const timer = setTimeout(() => {
        timedOut = true;
        terminateChild(child);
      }, remainingMs);

      const finish = (exitCode, spawnError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signalState.activeChild === child) signalState.activeChild = null;
        resolve({
          exitCode,
          stdout,
          stderr,
          timedOut,
          interrupted: signalState.interrupted,
          spawnError: Boolean(spawnError),
        });
      };
      child.once('error', (error) => finish(null, error));
      child.once('exit', (code) => finish(code, null));
    });
  };
}

function hasP3009(output) {
  return /\bP3009\b/iu.test(output);
}

function hasFailedHistory(output) {
  return /failed migration|found failed migrations|migration.*failed.*database/iu.test(output);
}

function hasHistoryDivergence(output) {
  return /\bP3018\b|diverg(?:e|ed|ence)|migration history|not found in the local migrations directory|modified since it was applied/iu.test(
    output,
  );
}

function classifyCommandFailure(stage, result) {
  if (result.interrupted) return 'migration_interrupted';
  if (result.timedOut) return 'migration_timeout';
  const output = sanitizeCapturedOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (hasP3009(output)) return 'migration_p3009_detected';
  if (hasHistoryDivergence(output)) return 'migration_history_diverged';
  if (hasFailedHistory(output)) return 'migration_failed_history_detected';
  if (stage === 'prisma-validate') return 'migration_validation_failed';
  if (stage === 'migrate-deploy') return 'migration_deploy_failed';
  if (stage === 'migrate-status' || stage === 'migrate-diff') {
    return 'migration_status_failed';
  }
  return 'migration_deploy_failed';
}

function stageEvent(context, stage, status, extra = {}) {
  return {
    event: 'migration.job.stage',
    executionId: context.executionId,
    artifactDigest: context.artifactDigest,
    stage,
    status,
    ...extra,
  };
}

async function runGovernedMigrationJob(options = {}) {
  const startedAt = (options.now ?? Date.now)();
  const timeoutMs = options.timeoutMs ?? TOTAL_TIMEOUT_MS;
  const deadline = startedAt + timeoutMs;
  const logger = options.logger ?? createJsonLogger();
  const rawEnvironment = options.environment ?? process.env;
  const now = options.now ?? Date.now;
  let context;

  try {
    context = validateEnvironment(rawEnvironment);
  } catch (error) {
    logger({
      event: 'migration.job.result',
      status: 'migration_failed',
      code: 'migration_environment_contract_invalid',
    });
    throw error;
  }

  logger({
    event: 'migration.job.started',
    executionId: context.executionId,
    artifactDigest: context.artifactDigest,
    environment: context.environment,
    databaseIdentityPolicy: 'dedicated-migration-role',
    approvalRefHash: context.approvalRefHash,
    backupCheckpointHash: context.backupCheckpointHash,
    dataAuthorityHash: context.dataAuthorityHash,
  });

  const verify = options.verifyManifest ?? verifyManifest;
  logger(stageEvent(context, 'manifest-verification', 'started'));
  let manifest;
  try {
    manifest = verify(options.manifestPath ?? DEFAULT_MANIFEST_PATH, options.repositoryRoot);
  } catch (cause) {
    const error = new MigrationJobError('migration_manifest_mismatch', cause);
    logger(stageEvent(context, 'manifest-verification', 'failed', { code: error.code }));
    logger({
      event: 'migration.job.result',
      executionId: context.executionId,
      artifactDigest: context.artifactDigest,
      status: 'migration_failed',
      code: error.code,
    });
    throw error;
  }
  logger(
    stageEvent(context, 'manifest-verification', 'succeeded', {
      migrationCount: manifest.migrations.length,
      aggregateMigrationChainSha256: manifest.aggregateMigrationChainSha256,
    }),
  );

  const signalState = options.signalState ?? { interrupted: false, activeChild: null };
  const executePrisma =
    options.executePrisma ??
    createPrismaExecutor({
      repositoryRoot: options.repositoryRoot,
      prismaCliPath: options.prismaCliPath,
      signalState,
    });
  const signalHandler = () => {
    signalState.interrupted = true;
    terminateChild(signalState.activeChild);
  };
  if (options.installSignalHandlers !== false) {
    process.once('SIGTERM', signalHandler);
    process.once('SIGINT', signalHandler);
  }

  let deploymentResult = 'migration_applied';
  try {
    for (const command of PRISMA_COMMANDS) {
      if (signalState.interrupted) throw new MigrationJobError('migration_interrupted');
      const remainingMs = deadline - now();
      if (remainingMs <= 0) throw new MigrationJobError('migration_timeout');
      logger(stageEvent(context, command.stage, 'started'));
      const result = await executePrisma(
        [...command.args],
        remainingMs,
        rawEnvironment,
      );
      if (command.stage === 'migrate-diff' && result.exitCode === 2) {
        throw new MigrationJobError('migration_drift_detected');
      }
      if (
        result.exitCode !== 0 ||
        result.timedOut ||
        result.interrupted ||
        result.spawnError
      ) {
        throw new MigrationJobError(classifyCommandFailure(command.stage, result));
      }
      if (
        command.stage === 'migrate-deploy' &&
        /No pending migrations to apply/iu.test(`${result.stdout}\n${result.stderr}`)
      ) {
        deploymentResult = 'migration_noop';
      }
      logger(
        stageEvent(context, command.stage, 'succeeded', {
          outputSha256: outputFingerprint(result),
        }),
      );
    }
  } catch (cause) {
    const error =
      cause instanceof MigrationJobError
        ? cause
        : new MigrationJobError('migration_deploy_failed', cause);
    logger(
      stageEvent(context, 'hard-stop', 'failed', {
        code: error.code,
      }),
    );
    logger({
      event: 'migration.job.result',
      executionId: context.executionId,
      artifactDigest: context.artifactDigest,
      status: 'migration_failed',
      code: error.code,
    });
    throw error;
  } finally {
    if (options.installSignalHandlers !== false) {
      process.removeListener('SIGTERM', signalHandler);
      process.removeListener('SIGINT', signalHandler);
    }
  }

  const result = Object.freeze({
    status: deploymentResult,
    migrationCount: manifest.migrations.length,
    aggregateMigrationChainSha256: manifest.aggregateMigrationChainSha256,
  });
  logger({
    event: 'migration.job.result',
    executionId: context.executionId,
    artifactDigest: context.artifactDigest,
    status: result.status,
    migrationCount: result.migrationCount,
    aggregateMigrationChainSha256: result.aggregateMigrationChainSha256,
  });
  return result;
}

async function main(argv = process.argv.slice(2), options = {}) {
  const logger = options.logger ?? createJsonLogger();
  if (argv.length !== 0) {
    logger({
      event: 'migration.job.result',
      status: 'migration_failed',
      code: 'migration_environment_contract_invalid',
    });
    throw new MigrationJobError('migration_environment_contract_invalid');
  }
  await runGovernedMigrationJob({ ...options, logger });
}

if (require.main === module) {
  main().catch((error) => {
    if (!(error instanceof MigrationJobError)) {
      process.stdout.write(
        `${JSON.stringify({
          event: 'migration.job.result',
          status: 'migration_failed',
          code: 'migration_deploy_failed',
        })}\n`,
      );
    }
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_ENVIRONMENTS,
  ARTIFACT_DIGEST_PATTERN,
  MigrationJobError,
  PRISMA_COMMANDS,
  PRISMA_CLI_PATH,
  REQUIRED_ENVIRONMENT_KEYS,
  TOTAL_TIMEOUT_MS,
  classifyCommandFailure,
  createJsonLogger,
  createPrismaExecutor,
  hashReference,
  main,
  runGovernedMigrationJob,
  sanitizeCapturedOutput,
  validateDatabaseUrl,
  validateEnvironment,
};
