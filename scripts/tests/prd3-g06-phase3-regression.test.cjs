'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  EXPECTED_PHASE3_CERTIFICATION,
  STAGE_PLAN,
  baseSummary,
  childEnvironment,
  computeSummarySha256,
  deriveOverall,
  deriveStageCounts,
  executeFixedStage,
  finalizeSummary,
  readGovernance,
  redactText,
  resolveStageInvocation,
  resolveSummaryPath,
  runStagePlan,
  sanitizeJson,
  stageEnvironment,
  validateExactCandidateState,
  validateHistoricalPhase3Certification,
  validateSummary,
} = require('../ci/prd3-g06-phase3-regression.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(
    path.join(REPOSITORY_ROOT, ...relativePath.split('/')),
    'utf8',
  );
const readJson = (relativePath) => JSON.parse(read(relativePath));
const PHASE3_CLOSEOUT_PATH =
  'docs/production-readiness/phase-3/10-phase-3-closeout.md';
const PHASE3_CERTIFICATION_PATH =
  'docs/production-readiness/phase-3/phase-3-certification.json';

const EXPECTED_STAGES = Object.freeze([
  ['G01-A', 'npm', ['run', 'verify:prd3-g01-a']],
  ['G01-B3', 'npm', ['run', 'verify:prd3-g01-b3-tests']],
  ['PRISMA_VALIDATE', 'npx', ['prisma', 'validate']],
  ['PRISMA_GENERATE', 'npx', ['prisma', 'generate']],
  ['G01-C', 'npm', ['run', 'verify:prd3-g01-c-final', '--', '--regression']],
  ['G02', 'npm', ['run', 'verify:prd3-g02-final']],
  ['G03', 'npm', ['run', 'verify:prd3-g03-final']],
  ['G04', 'npm', ['run', 'verify:prd3-g04-final', '--', '--regression']],
  ['G05', 'npm', ['run', 'verify:prd3-g05-final', '--', '--regression']],
  ['BUILD', 'npm', ['run', 'build']],
  ['DIFF_CHECK', 'git', ['diff', '--check']],
]);
const PRISMA_CLIENT_CONSUMER_SOURCES = Object.freeze({
  'G01-C': 'scripts/ci/prd3-g01-c-database-privileges.cjs',
  G05: 'scripts/ci/prd3-g05-clean-start.cjs',
});
const APPROVED_PRISMA_SCHEMA_DATABASE_URL =
  'postgresql://prd3_schema:prd3_schema@127.0.0.1:1/prd3_schema?schema=public';
const PHASE3_FIXTURE_IMAGES = Object.freeze([
  'postgres:16-alpine',
  'redis:7-alpine',
  'minio/minio:RELEASE.2025-09-07T16-13-09Z',
]);
const PHASE3_FIXTURE_IMAGE_SOURCES = Object.freeze({
  'postgres:16-alpine': Object.freeze([
    'scripts/ci/prd3-g01-c-database-privileges.cjs',
    'scripts/ci/prd3-g03-critical-queue-recovery.cjs',
    'scripts/ci/prd3-g04-governed-migration-job.cjs',
    'scripts/ci/prd3-g05-clean-start.cjs',
  ]),
  'redis:7-alpine': Object.freeze([
    'scripts/ci/prd3-g02-redis-topology-recovery.cjs',
    'scripts/ci/prd3-g03-critical-queue-recovery.cjs',
  ]),
  'minio/minio:RELEASE.2025-09-07T16-13-09Z': Object.freeze([
    'scripts/ci/prd3-g03-critical-queue-recovery.cjs',
  ]),
});

function repositoryState(overrides = {}) {
  return {
    headSha: 'a'.repeat(40),
    branch: 'HEAD',
    platform: 'linux',
    nodeVersion: 'v22.23.1',
    nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
    workingTreeClean: true,
    indexClean: true,
    changedPaths: [],
    productionSourceChanged: false,
    prismaSchemaChanged: false,
    migrationFilesChanged: false,
    seedSourceChanged: false,
    dependencyChanged: false,
    devDependencyChanged: false,
    lockfileChanged: false,
    ...overrides,
  };
}

function governance() {
  return {
    g01State: 'COMPLETE',
    g01ProviderCleanupDebtState: 'DEFERRED_NON_BLOCKING_PROVIDER_DEBT',
    g02State: 'COMPLETE',
    g03State: 'COMPLETE',
    g04State: 'COMPLETE',
    g05State: 'COMPLETE',
    g06State: 'COMPLETE',
    phase3State: 'COMPLETE',
    historicalCertificationState: 'COMPLETE',
    certifiedCandidateSha: '7cb6123345b4f3ae7ca068162a72b9766df2f61a',
    certifiedMergeSha: '84f06b3f33a4ebde0adff4295ef00832fc13e71f',
    certifiedTreeSha: '84ba9e1565664fdd608bf9762513f75e428afa64',
    postMergeUniversalVerificationDebtState:
      'DEFERRED_NON_BLOCKING_UNCLASSIFIED_VERIFICATION_DEBT',
    postMergeUniversalVerificationClassification: 'UNCLASSIFIED',
  };
}

function clock() {
  let milliseconds = Date.parse('2026-08-07T00:00:00.000Z');
  return () => {
    const value = new Date(milliseconds);
    milliseconds += 7;
    return value;
  };
}

function successfulStages() {
  return runStagePlan({ executeStage: () => ({ exitCode: 0 }), now: clock() });
}

function validSummary() {
  const state = repositoryState();
  return finalizeSummary(
    baseSummary(state, governance(), '2026-08-07T00:00:00.000Z'),
    successfulStages(),
    state,
    '2026-08-07T00:01:00.000Z',
  );
}

function launcherStage(executable, args) {
  return { executable, args };
}

function simulatedLauncher(platform) {
  const windows = platform === 'win32';
  const npmCliPath = windows
    ? 'C:\\portable\\node_modules\\npm\\bin\\npm-cli.js'
    : '/portable/node_modules/npm/bin/npm-cli.js';
  const npxCliPath = windows
    ? 'C:\\portable\\node_modules\\npm\\bin\\npx-cli.js'
    : '/portable/node_modules/npm/bin/npx-cli.js';
  const nodeExecutable = windows
    ? 'C:\\portable\\node.exe'
    : '/portable/bin/node';
  const existingFiles = new Set([npmCliPath, npxCliPath]);
  return {
    npmCliPath,
    npxCliPath,
    nodeExecutable,
    options: {
      platform,
      environment: { npm_execpath: npmCliPath },
      nodeExecutable,
      fileExists: (candidate) => existingFiles.has(candidate),
    },
  };
}

test('stage plan has exactly the eleven required IDs in deterministic order', () => {
  assert.equal(STAGE_PLAN.length, 11);
  assert.deepEqual(
    STAGE_PLAN.map((entry) => entry.id),
    EXPECTED_STAGES.map(([id]) => id),
  );
});

test('stage plan fixes every executable and argument array exactly', () => {
  assert.deepEqual(
    STAGE_PLAN.map(({ id, executable, args }) => [id, executable, [...args]]),
    EXPECTED_STAGES,
  );
  assert.ok(STAGE_PLAN.every((entry) => entry.required));
});

test('Prisma validation and generation precede every known Prisma Client consumer', () => {
  const validateIndex = STAGE_PLAN.findIndex(
    (entry) => entry.id === 'PRISMA_VALIDATE',
  );
  const generateIndex = STAGE_PLAN.findIndex(
    (entry) => entry.id === 'PRISMA_GENERATE',
  );

  assert.equal(validateIndex, 2);
  assert.equal(generateIndex, 3);
  assert.ok(validateIndex < generateIndex);

  for (const [stageId, relativePath] of Object.entries(
    PRISMA_CLIENT_CONSUMER_SOURCES,
  )) {
    const consumerIndex = STAGE_PLAN.findIndex((entry) => entry.id === stageId);
    assert.match(read(relativePath), /require\(['"]@prisma\/client['"]\)/u);
    assert.ok(
      generateIndex < consumerIndex,
      `${stageId} must run after Prisma generate`,
    );
  }
});

test('G01-C, G04, and G05 use explicit portable regression mode', () => {
  for (const id of ['G01-C', 'G04', 'G05']) {
    assert.deepEqual(
      STAGE_PLAN.find((entry) => entry.id === id).args.slice(-2),
      ['--', '--regression'],
    );
  }
});

test('G02 and G03 use their canonical final verifier commands', () => {
  assert.deepEqual(STAGE_PLAN.find((entry) => entry.id === 'G02').args, [
    'run',
    'verify:prd3-g02-final',
  ]);
  assert.deepEqual(STAGE_PLAN.find((entry) => entry.id === 'G03').args, [
    'run',
    'verify:prd3-g03-final',
  ]);
});

test('stage plan contains neither Universal Regression nor Google Cloud commands', () => {
  const serialized = JSON.stringify(STAGE_PLAN);
  assert.doesNotMatch(serialized, /test:regression|universal-regression/iu);
  assert.doesNotMatch(serialized, /gcloud|google cloud/iu);
});

test('Windows npm resolves to Node plus the verified npm CLI entrypoint', () => {
  const simulation = simulatedLauncher('win32');
  assert.deepEqual(
    resolveStageInvocation(
      launcherStage('npm', ['run', 'build']),
      simulation.options,
    ),
    {
      executable: simulation.nodeExecutable,
      args: [simulation.npmCliPath, 'run', 'build'],
    },
  );
});

test('Windows npx resolves to Node plus the sibling npx CLI entrypoint', () => {
  const simulation = simulatedLauncher('win32');
  assert.deepEqual(
    resolveStageInvocation(
      launcherStage('npx', ['prisma', 'validate']),
      simulation.options,
    ),
    {
      executable: simulation.nodeExecutable,
      args: [simulation.npxCliPath, 'prisma', 'validate'],
    },
  );
});

test('git remains a direct fixed executable with its original arguments', () => {
  assert.deepEqual(
    resolveStageInvocation(launcherStage('git', ['diff', '--check'])),
    {
      executable: 'git',
      args: ['diff', '--check'],
    },
  );
});

test('Windows package-manager resolution never returns a shell or cmd launcher', () => {
  const simulation = simulatedLauncher('win32');
  for (const executable of ['npm', 'npx']) {
    const invocation = resolveStageInvocation(
      launcherStage(executable, ['--version']),
      simulation.options,
    );
    assert.equal(invocation.executable, simulation.nodeExecutable);
    assert.doesNotMatch(
      invocation.executable,
      /npm\.cmd|npx\.cmd|cmd\.exe|powershell\.exe|pwsh\.exe/iu,
    );
  }
});

test('Linux npm and npx also resolve through Node and JavaScript CLI entrypoints', () => {
  const simulation = simulatedLauncher('linux');
  assert.deepEqual(
    resolveStageInvocation(
      launcherStage('npm', ['--version']),
      simulation.options,
    ),
    {
      executable: simulation.nodeExecutable,
      args: [simulation.npmCliPath, '--version'],
    },
  );
  assert.deepEqual(
    resolveStageInvocation(
      launcherStage('npx', ['--version']),
      simulation.options,
    ),
    {
      executable: simulation.nodeExecutable,
      args: [simulation.npxCliPath, '--version'],
    },
  );
});

test('launcher preserves logical npm and npx argument arrays without mutation', () => {
  const simulation = simulatedLauncher('linux');
  for (const executable of ['npm', 'npx']) {
    const original = ['run', 'synthetic', '--', '--fixed'];
    const invocation = resolveStageInvocation(
      launcherStage(executable, original),
      simulation.options,
    );
    assert.deepEqual(invocation.args.slice(1), original);
    assert.deepEqual(original, ['run', 'synthetic', '--', '--fixed']);
  }
});

test('missing or empty npm_execpath fails closed', () => {
  const simulation = simulatedLauncher('linux');
  for (const environment of [{}, { npm_execpath: '   ' }]) {
    assert.throws(
      () =>
        resolveStageInvocation(launcherStage('npm', ['--version']), {
          ...simulation.options,
          environment,
        }),
      /npm_execpath/iu,
    );
  }
});

test('malformed or non-absolute npm CLI identity fails closed', () => {
  const simulation = simulatedLauncher('linux');
  for (const npmExecPath of ['/portable/bin/not-npm.js', 'npm-cli.js']) {
    assert.throws(
      () =>
        resolveStageInvocation(launcherStage('npm', ['--version']), {
          ...simulation.options,
          environment: { npm_execpath: npmExecPath },
        }),
      /npm_execpath/iu,
    );
  }
});

test('missing npm CLI file fails closed', () => {
  const simulation = simulatedLauncher('linux');
  assert.throws(
    () =>
      resolveStageInvocation(launcherStage('npm', ['--version']), {
        ...simulation.options,
        fileExists: () => false,
      }),
    /npm-cli\.js does not exist/iu,
  );
});

test('missing sibling npx CLI file fails closed', () => {
  const simulation = simulatedLauncher('linux');
  assert.throws(
    () =>
      resolveStageInvocation(launcherStage('npx', ['--version']), {
        ...simulation.options,
        fileExists: (candidate) => candidate === simulation.npmCliPath,
      }),
    /npx-cli\.js does not exist/iu,
  );
});

test('launcher identity failure is classified as CI_SCRIPT_DEFECT and cannot pass', () => {
  const plan = [
    {
      id: 'LAUNCHER_SMOKE',
      executable: 'npm',
      args: ['--version'],
      required: true,
    },
  ];
  const stages = runStagePlan({
    plan,
    executeStage: (stageDefinition) =>
      resolveStageInvocation(stageDefinition, { environment: {} }),
    now: clock(),
  });
  assert.equal(stages[0].status, 'FAIL');
  assert.equal(stages[0].classification, 'CI_SCRIPT_DEFECT');
  assert.equal(stages[0].exitCode, 1);
  assert.notEqual(deriveOverall(stages), 'PASS');
});

test('real npm launcher smoke succeeds through the production launcher', () => {
  const result = executeFixedStage(launcherStage('npm', ['--version']), {
    timeoutMs: 10_000,
  });
  assert.equal(result.error, null);
  assert.equal(result.exitCode, 0);
  assert.match(result.output.trim(), /^\d+\.\d+\.\d+/u);
});

test('real npx launcher smoke succeeds through the production launcher', () => {
  const result = executeFixedStage(launcherStage('npx', ['--version']), {
    timeoutMs: 10_000,
  });
  assert.equal(result.error, null);
  assert.equal(result.exitCode, 0);
  assert.match(result.output.trim(), /^\d+\.\d+\.\d+/u);
});

test('all successful required stages produce PASS with recorded timings', () => {
  const stages = successfulStages();
  assert.equal(deriveOverall(stages), 'PASS');
  assert.ok(
    stages.every(
      (entry) =>
        entry.status === 'PASS' &&
        entry.exitCode === 0 &&
        entry.durationMs === 7,
    ),
  );
  assert.deepEqual(deriveStageCounts(stages), {
    requiredStageCount: 11,
    passedStageCount: 11,
    failedStageCount: 0,
    blockedStageCount: 0,
  });
});

test('first required failure produces FAIL and blocks every later stage', () => {
  let calls = 0;
  const stages = runStagePlan({
    executeStage: () => ({
      exitCode: ++calls === 4 ? 1 : 0,
      output: 'fixture failed',
    }),
    now: clock(),
  });
  assert.equal(deriveOverall(stages), 'FAIL');
  assert.equal(stages[3].status, 'FAIL');
  assert.ok(stages.slice(4).every((entry) => entry.status === 'BLOCKED'));
  assert.equal(calls, 4);
  assert.deepEqual(deriveStageCounts(stages), {
    requiredStageCount: 11,
    passedStageCount: 3,
    failedStageCount: 1,
    blockedStageCount: 7,
  });
});

test('missing required stage cannot validate or produce PASS', () => {
  const summary = validSummary();
  summary.stages.pop();
  assert.equal(deriveOverall(summary.stages), 'FAIL');
  assert.throws(
    () => validateSummary(summary, { requireHash: false }),
    /missing required stage/u,
  );
});

test('pre-stage initialization failure blocks all stages without cleanup debt', () => {
  const summary = baseSummary(
    repositoryState(),
    governance(),
    '2026-08-07T00:00:00.000Z',
  );
  assert.deepEqual(deriveStageCounts(summary.stages), {
    requiredStageCount: 11,
    passedStageCount: 0,
    failedStageCount: 0,
    blockedStageCount: 11,
  });
  assert.equal(summary.failedStageCount, 0);
  assert.equal(summary.blockedStageCount, 11);
  assert.equal(summary.cleanup, 'NOT_REQUIRED');
  assert.equal(summary.overall, 'FAIL');
  assert.equal(validateSummary(summary, { requireHash: false }), true);
});

test('invalid stage result is converted to a failing stage and never PASS', () => {
  const stages = runStagePlan({
    executeStage: () => ({ exitCode: 0, status: 'UNKNOWN' }),
    now: clock(),
  });
  assert.equal(stages[0].status, 'FAIL');
  assert.equal(stages[0].classification, 'CI_SCRIPT_DEFECT');
  assert.equal(deriveOverall(stages), 'FAIL');
});

test('exact-candidate preflight accepts feature, main, and detached branch diagnostics', () => {
  for (const branch of [
    'chore/production-readiness-3-cloud-sql',
    'main',
    'HEAD',
  ]) {
    assert.equal(
      validateExactCandidateState(repositoryState({ branch })),
      true,
    );
  }
});

test('exact-candidate preflight does not require a Windows Node directory', () => {
  assert.equal(
    validateExactCandidateState(
      repositoryState({
        nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
      }),
    ),
    true,
  );
});

test('exact-candidate preflight rejects dirty working tree', () => {
  assert.throws(() =>
    validateExactCandidateState(repositoryState({ workingTreeClean: false })),
  );
});

test('exact-candidate preflight rejects staged index', () => {
  assert.throws(() =>
    validateExactCandidateState(repositoryState({ indexClean: false })),
  );
});

test('exact-candidate preflight rejects wrong Node version', () => {
  assert.throws(() =>
    validateExactCandidateState(repositoryState({ nodeVersion: 'v22.22.0' })),
  );
});

test('summary binds to inspected HEAD and never supplies a future hardcoded SHA', () => {
  const headSha = '1234567890abcdef1234567890abcdef12345678';
  const summary = baseSummary(
    repositoryState({ headSha }),
    governance(),
    '2026-08-07T00:00:00.000Z',
  );
  assert.equal(summary.headSha, headSha);
  assert.doesNotMatch(
    read('scripts/ci/prd3-g06-phase3-regression.cjs'),
    /const\s+(?:BASE|HEAD|CANDIDATE)_SHA\s*=\s*['"][0-9a-f]{40}/u,
  );
});

test('summary schema accepts complete PASS and rejects wrong order', () => {
  const summary = validSummary();
  summary.summarySha256 = computeSummarySha256(summary);
  assert.equal(validateSummary(summary), true);
  const wrongOrder = structuredClone(summary);
  [wrongOrder.stages[0], wrongOrder.stages[1]] = [
    wrongOrder.stages[1],
    wrongOrder.stages[0],
  ];
  assert.throws(() => validateSummary(wrongOrder, { requireHash: false }));
});

test('summary hash is deterministic and excludes its own value', () => {
  const summary = validSummary();
  const first = computeSummarySha256(summary);
  summary.summarySha256 = 'f'.repeat(64);
  assert.equal(computeSummarySha256(summary), first);
});

test('redaction removes PostgreSQL and Redis credential-bearing URLs', () => {
  const redacted = redactText(
    'postgresql://user:pass@db.invalid/app redis://user:pass@queue.invalid/0 rediss://cache.invalid/1',
  );
  assert.doesNotMatch(
    redacted,
    /user:pass|db\.invalid|queue\.invalid|cache\.invalid/u,
  );
  assert.match(redacted, /\[REDACTED_URL\]/u);
});

test('redaction removes URL variables and token/password-like values', () => {
  const redacted = redactText(
    'DATABASE_URL=synthetic QUEUE_REDIS_URL=synthetic password=synthetic token: synthetic',
  );
  assert.doesNotMatch(redacted, /=synthetic|: synthetic/u);
  assert.doesNotMatch(
    JSON.stringify(
      sanitizeJson({ password: 'synthetic', nested: { token: 'synthetic' } }),
    ),
    /synthetic/u,
  );
});

test('child environment excludes inherited secret-bearing values', () => {
  const environment = childEnvironment({
    PATH: '/usr/bin',
    npm_execpath: '/portable/node_modules/npm/bin/npm-cli.js',
    DATABASE_URL: 'synthetic',
    QUEUE_REDIS_URL: 'synthetic',
    JWT_SECRET: 'synthetic',
  });
  assert.deepEqual(environment, {
    PATH: '/usr/bin',
    npm_execpath: '/portable/node_modules/npm/bin/npm-cli.js',
  });
});

test('only Prisma schema stages receive the synthetic database URL', () => {
  const inheritedEnvironment = {
    PATH: '/usr/bin',
    npm_execpath: '/portable/node_modules/npm/bin/npm-cli.js',
    DATABASE_URL: 'postgresql://real-secret.example/database',
  };

  for (const stageId of ['PRISMA_VALIDATE', 'PRISMA_GENERATE']) {
    const environment = stageEnvironment(
      STAGE_PLAN.find((entry) => entry.id === stageId),
      inheritedEnvironment,
    );
    assert.equal(environment.DATABASE_URL, APPROVED_PRISMA_SCHEMA_DATABASE_URL);
    assert.equal(environment.PATH, inheritedEnvironment.PATH);
    assert.equal(environment.npm_execpath, inheritedEnvironment.npm_execpath);
    assert.doesNotMatch(environment.DATABASE_URL, /real-secret/u);
  }

  for (const stageDefinition of STAGE_PLAN.filter(
    (entry) => !['PRISMA_VALIDATE', 'PRISMA_GENERATE'].includes(entry.id),
  )) {
    const environment = stageEnvironment(stageDefinition, inheritedEnvironment);
    assert.equal(environment.DATABASE_URL, undefined);
    assert.equal(environment.PATH, inheritedEnvironment.PATH);
    assert.equal(environment.npm_execpath, inheritedEnvironment.npm_execpath);
  }
});

test('stage environment overrides are excluded from G06 evidence summaries', () => {
  const summary = validSummary();
  assert.ok(
    summary.stages.every((entry) => !Object.hasOwn(entry, 'environment')),
  );
  assert.doesNotMatch(JSON.stringify(summary), /DATABASE_URL|prd3_schema/u);
});

test('summary output path honors PRD3_G06_EVIDENCE_DIR', () => {
  const directory = path.join(os.tmpdir(), 'g06-contract-evidence');
  assert.equal(
    resolveSummaryPath({ PRD3_G06_EVIDENCE_DIR: directory }),
    path.join(path.resolve(directory), 'prd3-g06-summary.json'),
  );
});

test('historical certification validates the frozen record against the Phase 3 closeout', () => {
  const certification = readJson(PHASE3_CERTIFICATION_PATH);
  assert.deepEqual(certification, EXPECTED_PHASE3_CERTIFICATION);
  assert.deepEqual(
    validateHistoricalPhase3Certification(
      certification,
      read(PHASE3_CLOSEOUT_PATH),
    ),
    governance(),
  );
});

test('current matrix evolution cannot false-red the historical certification', (t) => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'prd3-historical-certification-'),
  );
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const phase0Directory = path.join(
    temporaryRoot,
    'docs',
    'production-readiness',
    'phase-0',
  );
  const phase3Directory = path.join(
    temporaryRoot,
    'docs',
    'production-readiness',
    'phase-3',
  );
  fs.mkdirSync(phase0Directory, { recursive: true });
  fs.mkdirSync(phase3Directory, { recursive: true });
  fs.writeFileSync(
    path.join(phase0Directory, '03-acceptance-and-risk-matrix.md'),
    'PRD3-G02=FUTURE_CURRENT_STATE\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(phase3Directory, '09-g01-provider-retention-disposition.md'),
    'PHASE_3=HISTORICAL_SNAPSHOT_NO_LONGER_CURRENT\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(phase3Directory, '10-phase-3-closeout.md'),
    read(PHASE3_CLOSEOUT_PATH),
    'utf8',
  );
  fs.writeFileSync(
    path.join(phase3Directory, 'phase-3-certification.json'),
    `${JSON.stringify(readJson(PHASE3_CERTIFICATION_PATH), null, 2)}\n`,
    'utf8',
  );

  assert.deepEqual(readGovernance(temporaryRoot), governance());
  const source = read('scripts/ci/prd3-g06-phase3-regression.cjs');
  assert.doesNotMatch(
    source,
    /03-acceptance-and-risk-matrix|09-g01-provider-retention/iu,
  );
});

test('every frozen SHA, run, artifact, digest, and debt field is immutable', () => {
  const closeout = read(PHASE3_CLOSEOUT_PATH);
  const immutablePaths = [
    ['candidate', 'sha'],
    ['candidate', 'treeSha'],
    ['merge', 'sha'],
    ['merge', 'treeSha'],
    ...readJson(PHASE3_CERTIFICATION_PATH).candidate.acceptedRuns.flatMap(
      (_entry, index) => [['candidate', 'acceptedRuns', index, 'runId']],
    ),
    ...readJson(PHASE3_CERTIFICATION_PATH).merge.acceptedRuns.flatMap(
      (_entry, index) => [['merge', 'acceptedRuns', index, 'runId']],
    ),
    ...readJson(PHASE3_CERTIFICATION_PATH).candidate.acceptedArtifacts.flatMap(
      (_entry, index) => [
        ['candidate', 'acceptedArtifacts', index, 'runId'],
        ['candidate', 'acceptedArtifacts', index, 'artifactId'],
        ['candidate', 'acceptedArtifacts', index, 'name'],
        ['candidate', 'acceptedArtifacts', index, 'digest'],
      ],
    ),
    ...readJson(PHASE3_CERTIFICATION_PATH).merge.acceptedArtifacts.flatMap(
      (_entry, index) => [
        ['merge', 'acceptedArtifacts', index, 'runId'],
        ['merge', 'acceptedArtifacts', index, 'artifactId'],
        ['merge', 'acceptedArtifacts', index, 'name'],
        ['merge', 'acceptedArtifacts', index, 'digest'],
      ],
    ),
    ['deferredDebts', 'providerCleanup', 'record'],
    ['deferredDebts', 'providerCleanup', 'status'],
    ['deferredDebts', 'postMergeUniversalVerification', 'record'],
    ['deferredDebts', 'postMergeUniversalVerification', 'status'],
    ['deferredDebts', 'postMergeUniversalVerification', 'state'],
    ['deferredDebts', 'postMergeUniversalVerification', 'ownerDisposition'],
    ['deferredDebts', 'postMergeUniversalVerification', 'acceptedOn'],
    ['deferredDebts', 'postMergeUniversalVerification', 'timezone'],
    ['deferredDebts', 'postMergeUniversalVerification', 'classification'],
    ['deferredDebts', 'postMergeUniversalVerification', 'investigation'],
    ['deferredDebts', 'postMergeUniversalVerification', 'runId'],
    ['deferredDebts', 'postMergeUniversalVerification', 'sha'],
    ['deferredDebts', 'postMergeUniversalVerification', 'result'],
    ['deferredDebts', 'postMergeUniversalVerification', 'artifactId'],
    ['deferredDebts', 'postMergeUniversalVerification', 'artifactName'],
    ['deferredDebts', 'postMergeUniversalVerification', 'artifactDigest'],
    [
      'deferredDebts',
      'postMergeUniversalVerification',
      'requiredResultRecords',
    ],
    ['deferredDebts', 'postMergeUniversalVerification', 'skippedTests'],
    ['deferredDebts', 'postMergeUniversalVerification', 'failedTests'],
    ['deferredDebts', 'postMergeUniversalVerification', 'failedStage'],
    ['deferredDebts', 'postMergeUniversalVerification', 'notClassifiedAs', 0],
  ];

  for (const fieldPath of immutablePaths) {
    const mutated = readJson(PHASE3_CERTIFICATION_PATH);
    const parent = fieldPath
      .slice(0, -1)
      .reduce((value, key) => value[key], mutated);
    const key = fieldPath.at(-1);
    parent[key] = typeof parent[key] === 'number' ? parent[key] + 1 : 'MUTATED';
    assert.throws(
      () => validateHistoricalPhase3Certification(mutated, closeout),
      /frozen Phase 3 certification record mismatch/u,
      fieldPath.join('.'),
    );
  }
});

test('Owner-deferred Universal debt cannot become flake, product, test, or resolved', () => {
  const closeout = read(PHASE3_CLOSEOUT_PATH);
  for (const classification of ['FLAKE', 'PRODUCT_DEFECT', 'TEST_DEFECT']) {
    const mutated = readJson(PHASE3_CERTIFICATION_PATH);
    mutated.deferredDebts.postMergeUniversalVerification.classification =
      classification;
    assert.throws(() =>
      validateHistoricalPhase3Certification(mutated, closeout),
    );
  }
  const resolved = readJson(PHASE3_CERTIFICATION_PATH);
  resolved.deferredDebts.postMergeUniversalVerification.state = 'RESOLVED';
  resolved.deferredDebts.postMergeUniversalVerification.status = 'RESOLVED';
  assert.throws(() =>
    validateHistoricalPhase3Certification(resolved, closeout),
  );
});

test('historical certification fails when closeout evidence is altered', () => {
  const closeout = read(PHASE3_CLOSEOUT_PATH);
  const mutated = closeout.replace(
    'sha256:f33e5ddc8bd55ba840fec3dac6cf60b4f6ee5489e2621e994b4b175e0d96735d',
    `sha256:${'f'.repeat(64)}`,
  );
  assert.notEqual(mutated, closeout);
  assert.throws(
    () =>
      validateHistoricalPhase3Certification(
        readJson(PHASE3_CERTIFICATION_PATH),
        mutated,
      ),
    /Phase 3 closeout merge Phase 3 artifact mismatch/u,
  );
});

test('package exposes only the two minimal G06 commands and preserves Universal Regression', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(
    packageJson.scripts['verify:prd3-g06-tests'],
    'node --test scripts/tests/prd3-g06-phase3-regression.test.cjs',
  );
  assert.equal(
    packageJson.scripts['verify:prd3-g06-final'],
    'node scripts/ci/prd3-g06-phase3-regression.cjs',
  );
  assert.equal(
    packageJson.scripts['test:regression'],
    'node scripts/universal-regression.cjs',
  );
});

test('orchestrator uses fixed spawnSync execution with shell disabled', () => {
  const source = read('scripts/ci/prd3-g06-phase3-regression.cjs');
  assert.match(source, /spawnSync\(invocation\.executable, invocation\.args/u);
  assert.match(source, /shell: false/u);
  assert.doesNotMatch(source, /shell:\s*true|\bexec\s*\(|\bexecSync\s*\(/u);
  assert.doesNotMatch(
    source,
    /npm\.cmd|npx\.cmd|cmd\.exe|powershell\.exe|pwsh\.exe/iu,
  );
});

test('workflow is a manual exact-SHA historical audit with immutable official actions', () => {
  const workflow = read('.github/workflows/phase-3-production-readiness.yml');
  assert.match(workflow, /^name: Phase 3 Historical Certification Audit$/mu);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s+(?:pull_request|push):/gmu);
  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.match(workflow, /node-version: '22\.23\.1'/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /run: npm ci/u);
  assert.match(workflow, /github\.sha/u);
  assert.doesNotMatch(workflow, /github\.event|pull_request/u);
  assert.match(workflow, /git rev-parse HEAD/u);
  assert.match(workflow, /npm run verify:prd3-g06-final/u);
  assert.match(workflow, /PRD3_G06_EVIDENCE_DIR/u);
  assert.match(workflow, /prd3-g06-summary\.json/u);
  assert.match(
    workflow,
    /phase-3-historical-audit-summary-\$\{\{ github\.run_id \}\}/u,
  );
  assert.match(
    workflow,
    /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/u,
  );
  assert.match(
    workflow,
    /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/u,
  );
  assert.match(
    workflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/u,
  );
  assert.doesNotMatch(
    workflow,
    /actions\/(?:checkout|setup-node|upload-artifact)@v\d/iu,
  );
  assert.doesNotMatch(workflow, /npm run test:regression|gcloud/iu);
  assert.doesNotMatch(
    workflow,
    /git (?:switch|checkout -b|branch chore\/production-readiness)/iu,
  );
  assert.doesNotMatch(
    workflow,
    /C:\\Users\\Abdal|process\.execPath|ln -s|mklink/iu,
  );
});

test('workflow preloads every verifier-owned Phase 3 fixture image before the exact gate', () => {
  const workflow = read('.github/workflows/phase-3-production-readiness.yml');
  const preloadStepName = '- name: Preload Phase 3 disposable fixture images';
  const gateStepName = '- name: Run historical Phase 3 certification audit';
  assert.equal(workflow.split(preloadStepName).length - 1, 1);

  const preloadStart = workflow.indexOf(preloadStepName);
  const gateStart = workflow.indexOf(gateStepName);
  assert.ok(preloadStart >= 0 && gateStart > preloadStart);

  const nextStep = workflow.indexOf(
    '\n      - name:',
    preloadStart + preloadStepName.length,
  );
  assert.ok(nextStep > preloadStart && nextStep <= gateStart);
  const preloadStep = workflow.slice(preloadStart, nextStep);
  assert.match(preloadStep, /\n\s+shell: bash\s*\n/u);
  assert.match(preloadStep, /\n\s+set -euo pipefail\s*\n/u);
  assert.match(
    preloadStep,
    /docker version --format '\{\{\.Server\.Version\}\}' >\/dev\/null/u,
  );
  assert.match(preloadStep, /docker pull "\$image"/u);
  assert.match(
    preloadStep,
    /docker image inspect "\$image" --format '\{\{\.Id\}\}'/u,
  );
  assert.match(preloadStep, /\^sha256:\[a-f0-9\]\{64\}\$/u);

  const imageArray = preloadStep.match(
    /images=\(\s*\n(?<entries>[\s\S]*?)\n\s*\)/u,
  );
  assert.ok(imageArray?.groups?.entries);
  const declaredImages = [
    ...imageArray.groups.entries.matchAll(/^\s*'([^']+)'\s*$/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(declaredImages, PHASE3_FIXTURE_IMAGES);

  const gateEnd = workflow.indexOf(
    '\n      - name:',
    gateStart + gateStepName.length,
  );
  const gateStep = workflow.slice(gateStart, gateEnd);
  assert.match(
    gateStep,
    /^- name: Run historical Phase 3 certification audit\s*\n\s+run: npm run verify:prd3-g06-final\s*$/mu,
  );

  for (const [image, sources] of Object.entries(PHASE3_FIXTURE_IMAGE_SOURCES)) {
    for (const source of sources)
      assert.match(read(source), new RegExp(escapeRegExp(image), 'u'));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
