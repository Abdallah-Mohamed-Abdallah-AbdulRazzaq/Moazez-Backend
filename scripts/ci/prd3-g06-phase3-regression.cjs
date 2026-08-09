'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const REQUIRED_NODE_VERSION = 'v22.23.1';
const SUMMARY_FILE_NAME = 'prd3-g06-summary.json';
const PRISMA_SCHEMA_DATABASE_URL =
  'postgresql://prd3_schema:prd3_schema@127.0.0.1:1/prd3_schema?schema=public';
const PRISMA_SCHEMA_ENVIRONMENT = Object.freeze({
  DATABASE_URL: PRISMA_SCHEMA_DATABASE_URL,
});
const ALLOWED_STAGE_STATUSES = Object.freeze(['PASS', 'FAIL', 'BLOCKED']);
const FAILURE_CLASSIFICATIONS = Object.freeze([
  'PRODUCT_DEFECT',
  'TEST_DEFECT',
  'STALE_TEST',
  'FIXTURE_DEFECT',
  'CI_SCRIPT_DEFECT',
  'WORKFLOW_DEFECT',
  'ENVIRONMENT_FAILURE',
  'TEARDOWN_FAILURE',
  'PERMISSION_FAILURE',
  'ARTIFACT_FAILURE',
  'FLAKE',
  'UNCLASSIFIED',
]);

const STAGE_PLAN = Object.freeze([
  stage('G01-A', 'npm', ['run', 'verify:prd3-g01-a']),
  stage('G01-B3', 'npm', ['run', 'verify:prd3-g01-b3-tests']),
  stage('PRISMA_VALIDATE', 'npx', ['prisma', 'validate'], PRISMA_SCHEMA_ENVIRONMENT),
  stage('PRISMA_GENERATE', 'npx', ['prisma', 'generate'], PRISMA_SCHEMA_ENVIRONMENT),
  stage('G01-C', 'npm', ['run', 'verify:prd3-g01-c-final', '--', '--regression']),
  stage('G02', 'npm', ['run', 'verify:prd3-g02-final']),
  stage('G03', 'npm', ['run', 'verify:prd3-g03-final']),
  stage('G04', 'npm', ['run', 'verify:prd3-g04-final', '--', '--regression']),
  stage('G05', 'npm', ['run', 'verify:prd3-g05-final', '--', '--regression']),
  stage('BUILD', 'npm', ['run', 'build']),
  stage('DIFF_CHECK', 'git', ['diff', '--check']),
]);

function stage(id, executable, args, environment = {}) {
  return Object.freeze({
    id,
    executable,
    args: Object.freeze([...args]),
    environment: Object.freeze({ ...environment }),
    required: true,
  });
}

function resolveSummaryPath(environment = process.env) {
  const directory = environment.PRD3_G06_EVIDENCE_DIR?.trim()
    ? path.resolve(environment.PRD3_G06_EVIDENCE_DIR)
    : path.join(os.tmpdir(), 'moazez-prd3-g06');
  return path.join(directory, SUMMARY_FILE_NAME);
}

function redactText(value) {
  return String(value ?? '')
    .replace(/\b(?:postgres(?:ql)?|redis|rediss):\/\/[^\s"'`]+/giu, '[REDACTED_URL]')
    .replace(
      /\b(DATABASE_URL|QUEUE_REDIS_URL|REALTIME_REDIS_URL)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/giu,
      '$1=[REDACTED]',
    )
    .replace(
      /\b(password|secret|token|private[_ -]?key|credential)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/giu,
      '$1=[REDACTED]',
    );
}

function sanitizeJson(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /password|secret|token|private[_ -]?key|credential/iu.test(key)
        ? '[REDACTED]'
        : sanitizeJson(entry),
    ]),
  );
}

function childEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !/DATABASE_URL|QUEUE_REDIS_URL|REALTIME_REDIS_URL|PASSWORD|SECRET|TOKEN|PRIVATE_KEY|CREDENTIAL/iu.test(
          key,
        ),
    ),
  );
}

function stageEnvironment(stageDefinition, environment = process.env) {
  return {
    ...childEnvironment(environment),
    ...(stageDefinition.environment ?? {}),
  };
}

function resolveStageInvocation(stageDefinition, options = {}) {
  if (stageDefinition.executable === 'git') {
    return { executable: 'git', args: [...stageDefinition.args] };
  }
  assert.ok(
    ['npm', 'npx'].includes(stageDefinition.executable),
    `unsupported logical stage executable: ${stageDefinition.executable}`,
  );

  const environment = options.environment ?? process.env;
  const npmExecPath = environment.npm_execpath;
  assert.equal(typeof npmExecPath, 'string', 'npm_execpath is required');
  assert.notEqual(npmExecPath.trim(), '', 'npm_execpath must not be empty');

  const platform = options.platform ?? process.platform;
  const pathImplementation = platform === 'win32' ? path.win32 : path.posix;
  const npmCliPath = npmExecPath.trim();
  assert.equal(pathImplementation.isAbsolute(npmCliPath), true, 'npm_execpath must be absolute');
  assert.equal(
    pathImplementation.basename(npmCliPath),
    'npm-cli.js',
    'npm_execpath must identify npm-cli.js',
  );

  const fileExists = options.fileExists ?? fs.existsSync;
  assert.equal(fileExists(npmCliPath), true, 'npm-cli.js does not exist');
  const cliPath =
    stageDefinition.executable === 'npm'
      ? npmCliPath
      : pathImplementation.join(pathImplementation.dirname(npmCliPath), 'npx-cli.js');
  if (stageDefinition.executable === 'npx') {
    assert.equal(fileExists(cliPath), true, 'npx-cli.js does not exist');
  }

  return {
    executable: options.nodeExecutable ?? process.execPath,
    args: [cliPath, ...stageDefinition.args],
  };
}

function executeFixedStage(stageDefinition, options = {}) {
  const environment = options.environment ?? process.env;
  const invocation = resolveStageInvocation(stageDefinition, {
    environment,
    platform: options.platform,
    nodeExecutable: options.nodeExecutable,
    fileExists: options.fileExists,
  });
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: options.repositoryRoot ?? REPOSITORY_ROOT,
    encoding: 'utf8',
    env: stageEnvironment(stageDefinition, environment),
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    timeout: options.timeoutMs ?? 45 * 60 * 1000,
    windowsHide: true,
  });
  const output = redactText(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (output) process.stdout.write(output);
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    output,
    error: result.error ? redactText(result.error.message) : null,
  };
}

function classifyFailure(output, error) {
  const text = `${output ?? ''}\n${error ?? ''}`;
  if (/cleanup|teardown|owned .*remaining|resource leak/iu.test(text)) {
    return 'TEARDOWN_FAILURE';
  }
  if (/permission denied|EACCES|EPERM/iu.test(text)) return 'PERMISSION_FAILURE';
  if (/artifact|manifest|checksum|sha256/iu.test(text)) return 'ARTIFACT_FAILURE';
  if (/ENOENT|not recognized|not found|timed out|timeout/iu.test(text)) {
    return 'ENVIRONMENT_FAILURE';
  }
  return 'UNCLASSIFIED';
}

function blockedRecord(stageDefinition) {
  return {
    id: stageDefinition.id,
    executable: stageDefinition.executable,
    args: [...stageDefinition.args],
    required: stageDefinition.required,
    startedAt: null,
    finishedAt: null,
    durationMs: 0,
    exitCode: null,
    status: 'BLOCKED',
    classification: null,
  };
}

function runStagePlan(options = {}) {
  const plan = options.plan ?? STAGE_PLAN;
  const executeStage = options.executeStage ?? executeFixedStage;
  const now = options.now ?? (() => new Date());
  const records = [];
  let failed = false;

  for (const stageDefinition of plan) {
    if (failed) {
      records.push(blockedRecord(stageDefinition));
      continue;
    }
    const started = now();
    let execution;
    try {
      execution = executeStage(stageDefinition);
      if (
        execution?.status !== undefined &&
        !ALLOWED_STAGE_STATUSES.includes(execution.status)
      ) {
        throw new Error(`invalid stage result: ${execution.status}`);
      }
      if (!Number.isInteger(execution?.exitCode)) {
        throw new Error('stage result is missing an integer exitCode');
      }
    } catch (error) {
      execution = {
        exitCode: 1,
        output: '',
        error: redactText(error instanceof Error ? error.message : error),
        classification: 'CI_SCRIPT_DEFECT',
      };
    }
    const finished = now();
    const status = execution.exitCode === 0 ? 'PASS' : 'FAIL';
    const record = {
      id: stageDefinition.id,
      executable: stageDefinition.executable,
      args: [...stageDefinition.args],
      required: stageDefinition.required,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: Math.max(0, finished.getTime() - started.getTime()),
      exitCode: execution.exitCode,
      status,
      classification:
        status === 'FAIL'
          ? execution.classification ?? classifyFailure(execution.output, execution.error)
          : null,
    };
    if (status === 'FAIL') {
      record.failure = redactText(execution.error || execution.output || 'stage failed').slice(
        -8000,
      );
      failed = stageDefinition.required;
    }
    records.push(record);
  }
  return records;
}

function deriveStageCounts(stages) {
  return {
    requiredStageCount: stages.filter((entry) => entry.required).length,
    passedStageCount: stages.filter((entry) => entry.required && entry.status === 'PASS')
      .length,
    failedStageCount: stages.filter((entry) => entry.required && entry.status === 'FAIL')
      .length,
    blockedStageCount: stages.filter(
      (entry) => entry.required && entry.status === 'BLOCKED',
    ).length,
  };
}

function deriveOverall(stages, finalRepositoryClean = true) {
  const exactPlan =
    stages.length === STAGE_PLAN.length &&
    stages.every((entry, index) => entry.id === STAGE_PLAN[index].id);
  return exactPlan &&
    finalRepositoryClean &&
    stages.every((entry) => !entry.required || entry.status === 'PASS')
    ? 'PASS'
    : 'FAIL';
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.repositoryRoot ?? REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  if (result.error || ![...(options.allowedStatuses ?? [0])].includes(result.status)) {
    throw new Error(options.label ?? `git ${args[0]} failed`);
  }
  return result;
}

function changedPaths(repositoryRoot = REPOSITORY_ROOT) {
  return runGit(['status', '--porcelain=v1', '--untracked-files=all'], {
    repositoryRoot,
    label: 'working-tree inspection failed',
  }).stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .sort();
}

function inspectRepositoryState(repositoryRoot = REPOSITORY_ROOT) {
  const headSha = runGit(['rev-parse', '--verify', 'HEAD^{commit}'], {
    repositoryRoot,
    label: 'HEAD is not resolvable',
  }).stdout.trim();
  const branch = runGit(['branch', '--show-current'], { repositoryRoot }).stdout.trim() || 'HEAD';
  const index = runGit(['diff', '--cached', '--quiet'], {
    repositoryRoot,
    allowedStatuses: [0, 1],
    label: 'Git index inspection failed',
  });
  const paths = changedPaths(repositoryRoot);
  const headPackage = JSON.parse(
    runGit(['show', 'HEAD:package.json'], { repositoryRoot }).stdout,
  );
  const currentPackage = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  return {
    headSha,
    branch,
    platform: process.platform,
    nodeVersion: process.version,
    nodeDirectory: path.dirname(path.resolve(process.execPath)),
    workingTreeClean: paths.length === 0,
    indexClean: index.status === 0,
    changedPaths: paths,
    productionSourceChanged: paths.some((entry) => entry.startsWith('src/')),
    prismaSchemaChanged: paths.includes('prisma/schema.prisma'),
    migrationFilesChanged: paths.some((entry) => entry.startsWith('prisma/migrations/')),
    seedSourceChanged: paths.some((entry) => entry.startsWith('prisma/seeds/')),
    dependencyChanged: !isDeepStrictEqual(
      currentPackage.dependencies,
      headPackage.dependencies,
    ),
    devDependencyChanged: !isDeepStrictEqual(
      currentPackage.devDependencies,
      headPackage.devDependencies,
    ),
    lockfileChanged: paths.includes('package-lock.json'),
  };
}

function validateExactCandidateState(state) {
  assert.match(state.headSha, /^[0-9a-f]{40}$/u, 'HEAD must resolve to a commit SHA');
  assert.equal(state.nodeVersion, REQUIRED_NODE_VERSION, 'wrong Node version');
  assert.equal(state.indexClean, true, 'Git index must be clean');
  assert.equal(state.workingTreeClean, true, 'working tree must be clean');
  assert.equal(state.dependencyChanged, false, 'dependency drift is not permitted');
  assert.equal(state.devDependencyChanged, false, 'devDependency drift is not permitted');
  return true;
}

function exactAssignment(source, name, expected) {
  const matches = source.match(new RegExp(`^${name}=${expected}$`, 'gmu')) ?? [];
  assert.equal(matches.length, 1, `${name} governance state mismatch`);
}

function validateGovernanceSources(matrix, providerDisposition) {
  exactAssignment(matrix, 'PRD3-G01', 'COMPLETE');
  exactAssignment(
    matrix,
    'PRD3-G01-PROVIDER-CLEANUP',
    'DEFERRED_NON_BLOCKING_PROVIDER_DEBT',
  );
  for (const gate of ['PRD3-G02', 'PRD3-G03', 'PRD3-G04', 'PRD3-G05']) {
    exactAssignment(matrix, gate, 'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE');
  }
  exactAssignment(matrix, 'PRD3-G06', 'NOT_STARTED');
  exactAssignment(providerDisposition, 'NEW_CONSUMERS_ALLOWED', 'NO');
  exactAssignment(providerDisposition, 'PRODUCTION_REUSE_ALLOWED', 'NO');
  exactAssignment(providerDisposition, 'PHASE_3', 'ACTIVE');
  exactAssignment(providerDisposition, 'PRODUCTION_TRAFFIC_ALLOWED', 'NO');
  return {
    g01State: 'COMPLETE',
    g01ProviderCleanupDebtState: 'DEFERRED_NON_BLOCKING_PROVIDER_DEBT',
    g02State: 'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
    g03State: 'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
    g04State: 'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
    g05State: 'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
  };
}

function readGovernance(repositoryRoot = REPOSITORY_ROOT) {
  return validateGovernanceSources(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'docs',
        'production-readiness',
        'phase-0',
        '03-acceptance-and-risk-matrix.md',
      ),
      'utf8',
    ),
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'docs',
        'production-readiness',
        'phase-3',
        '09-g01-provider-retention-disposition.md',
      ),
      'utf8',
    ),
  );
}

function baseSummary(state, governance, startedAt) {
  const stages = STAGE_PLAN.map(blockedRecord);
  return {
    schemaVersion: 1,
    gate: 'PRD3-G06',
    mode: 'exact-candidate',
    headSha: state.headSha,
    branch: state.branch,
    platform: state.platform,
    nodeVersion: state.nodeVersion,
    nodeDirectory: state.nodeDirectory,
    startedAt,
    finishedAt: null,
    stages,
    ...deriveStageCounts(stages),
    ...governance,
    productionSourceChanged: state.productionSourceChanged,
    prismaSchemaChanged: state.prismaSchemaChanged,
    migrationFilesChanged: state.migrationFilesChanged,
    seedSourceChanged: state.seedSourceChanged,
    dependencyChanged: state.dependencyChanged || state.devDependencyChanged,
    lockfileChanged: state.lockfileChanged,
    cleanup: 'FAIL',
    overall: 'FAIL',
    exitCode: 1,
    aborted: true,
    summarySha256: null,
  };
}

function computeSummarySha256(summary) {
  const hashable = { ...sanitizeJson(summary), summarySha256: null };
  return crypto.createHash('sha256').update(JSON.stringify(hashable)).digest('hex');
}

function validateSummary(summary, options = {}) {
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.gate, 'PRD3-G06');
  assert.equal(summary.mode, 'exact-candidate');
  assert.match(summary.headSha, /^[0-9a-f]{40}$/u);
  assert.equal(summary.stages.length, STAGE_PLAN.length, 'missing required stage');
  for (const [index, requiredStage] of STAGE_PLAN.entries()) {
    const record = summary.stages[index];
    assert.equal(record.id, requiredStage.id, 'required stage order mismatch');
    assert.equal(record.executable, requiredStage.executable);
    assert.deepEqual(record.args, [...requiredStage.args]);
    assert.equal(record.required, true);
    assert.ok(ALLOWED_STAGE_STATUSES.includes(record.status), 'invalid stage status');
    assert.ok(record.durationMs >= 0);
    if (record.status === 'PASS') assert.equal(record.exitCode, 0);
    if (record.status === 'FAIL') {
      assert.notEqual(record.exitCode, 0);
      assert.ok(FAILURE_CLASSIFICATIONS.includes(record.classification));
    }
    if (record.status === 'BLOCKED') assert.equal(record.exitCode, null);
  }
  const counts = deriveStageCounts(summary.stages);
  for (const [key, value] of Object.entries(counts)) assert.equal(summary[key], value);
  assert.ok(['PASS', 'FAIL'].includes(summary.overall));
  if (summary.overall === 'PASS') {
    assert.equal(deriveOverall(summary.stages, true), 'PASS');
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.aborted, false);
    assert.equal(summary.cleanup, 'PASS');
  } else {
    assert.equal(summary.exitCode, 1);
  }
  if (options.requireHash !== false) {
    assert.equal(summary.summarySha256, computeSummarySha256(summary));
  }
  return true;
}

function writeSummary(summaryPath, summary) {
  const sanitized = sanitizeJson(summary);
  sanitized.summarySha256 = computeSummarySha256(sanitized);
  validateSummary(sanitized);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  const temporaryPath = `${summaryPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, summaryPath);
  return sanitized;
}

function finalizeSummary(summary, stages, finalState, finishedAt) {
  const overall = deriveOverall(stages, finalState.workingTreeClean && finalState.indexClean);
  return {
    ...summary,
    finishedAt,
    stages,
    ...deriveStageCounts(stages),
    productionSourceChanged: finalState.productionSourceChanged,
    prismaSchemaChanged: finalState.prismaSchemaChanged,
    migrationFilesChanged: finalState.migrationFilesChanged,
    seedSourceChanged: finalState.seedSourceChanged,
    dependencyChanged: finalState.dependencyChanged || finalState.devDependencyChanged,
    lockfileChanged: finalState.lockfileChanged,
    cleanup: overall === 'PASS' ? 'PASS' : 'FAIL',
    overall,
    exitCode: overall === 'PASS' ? 0 : 1,
    aborted: overall !== 'PASS',
    summarySha256: null,
  };
}

function main() {
  const summaryPath = resolveSummaryPath();
  const startedAt = new Date().toISOString();
  let state;
  let governance;
  let summary;
  try {
    state = inspectRepositoryState();
    governance = readGovernance();
    summary = baseSummary(state, governance, startedAt);
    writeSummary(summaryPath, summary);
    validateExactCandidateState(state);

    const stages = runStagePlan();
    const finalState = inspectRepositoryState();
    summary = finalizeSummary(summary, stages, finalState, new Date().toISOString());
  } catch (error) {
    const fallbackState = state ?? {
      headSha: '0000000000000000000000000000000000000000',
      branch: 'UNKNOWN',
      platform: process.platform,
      nodeVersion: process.version,
      nodeDirectory: path.dirname(path.resolve(process.execPath)),
      productionSourceChanged: false,
      prismaSchemaChanged: false,
      migrationFilesChanged: false,
      seedSourceChanged: false,
      dependencyChanged: false,
      devDependencyChanged: false,
      lockfileChanged: false,
    };
    const fallbackGovernance = governance ?? {
      g01State: 'UNKNOWN',
      g01ProviderCleanupDebtState: 'UNKNOWN',
      g02State: 'UNKNOWN',
      g03State: 'UNKNOWN',
      g04State: 'UNKNOWN',
      g05State: 'UNKNOWN',
    };
    summary = baseSummary(fallbackState, fallbackGovernance, startedAt);
    summary.finishedAt = new Date().toISOString();
    summary.failure = redactText(error instanceof Error ? error.message : error);
  }

  const written = writeSummary(summaryPath, summary);
  process.stdout.write(`PRD3_G06_SUMMARY_PATH=${summaryPath}\n`);
  process.stdout.write(`PRD3_G06_SUMMARY_SHA256=${written.summarySha256}\n`);
  process.stdout.write(`PRD3_G06_OVERALL=${written.overall}\n`);
  return written.exitCode;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  ALLOWED_STAGE_STATUSES,
  FAILURE_CLASSIFICATIONS,
  REQUIRED_NODE_VERSION,
  STAGE_PLAN,
  baseSummary,
  blockedRecord,
  childEnvironment,
  classifyFailure,
  computeSummarySha256,
  deriveOverall,
  deriveStageCounts,
  finalizeSummary,
  inspectRepositoryState,
  main,
  readGovernance,
  redactText,
  resolveStageInvocation,
  resolveSummaryPath,
  runStagePlan,
  sanitizeJson,
  stageEnvironment,
  executeFixedStage,
  validateExactCandidateState,
  validateGovernanceSources,
  validateSummary,
  writeSummary,
};
