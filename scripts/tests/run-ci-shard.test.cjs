'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CleanupManager,
  FAILURE_CLASSIFICATIONS,
  PROFILE_HARNESSES,
  SELF_CONTAINED_PROFILE_IMAGES,
  assertMigrationNoopEvidence,
  assertPlanWorkflowIdentity,
  cleanupDockerResourcesByLabel,
  createBaselineTestEnvironment,
  createResourceIdentity,
  hasJestOpenHandleWarning,
  loadPlan,
  parseAppliedMigrationCount,
  redactText,
  removeAndVerify,
  runProcess,
  safeHostEnvironment,
  sanitizeEvidence,
  validateShard,
} = require('../ci/run-ci-shard.cjs');

const CANDIDATE = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const RUN_CI_SHARD_SOURCE = fs.readFileSync(
  path.join(REPOSITORY_ROOT, 'scripts', 'ci', 'run-ci-shard.cjs'),
  'utf8',
);

function samplePlan(overrides = {}) {
  const file = 'src/example.spec.ts';
  return {
    schemaVersion: 1,
    candidateSha: CANDIDATE,
    baseSha: BASE,
    mergeBaseSha: BASE,
    assignments: [
      {
        file,
        execution: 'pull-request',
        profile: 'unit',
      },
    ],
    shards: [
      {
        id: 'unit-1-of-1',
        label: 'Unit 1/1',
        category: 'unit',
        profile: 'unit',
        index: 1,
        total: 1,
        files: [file],
        timeoutMinutes: 10,
      },
    ],
    ...overrides,
  };
}

function temporaryRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moazez-ci-shard-test-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'example.spec.ts'), 'export {};\n');
  return root;
}

test('the failure taxonomy contains every stable machine classification exactly once', () => {
  assert.equal(
    new Set(FAILURE_CLASSIFICATIONS).size,
    FAILURE_CLASSIFICATIONS.length,
  );
  for (const classification of [
    'SOURCE_TEST_FAILURE',
    'FIXTURE_CONTRACT_FAILURE',
    'MIGRATION_FAILURE',
    'GOVERNANCE_INVARIANT_FAILURE',
    'CI_ORCHESTRATOR_FAILURE',
    'WORKFLOW_CONFIGURATION_FAILURE',
    'RUNNER_INFRA_FAILURE',
    'DEPENDENCY_INSTALL_FAILURE',
    'IMAGE_PULL_OR_BUILD_FAILURE',
    'TIMEOUT',
    'TEARDOWN_FAILURE',
    'CANCELLED_SUPERSEDED',
    'PERMISSION_FAILURE',
    'ARTIFACT_FAILURE',
    'UNCLASSIFIED',
  ]) {
    assert.ok(FAILURE_CLASSIFICATIONS.includes(classification));
  }
  assert.equal(FAILURE_CLASSIFICATIONS.includes('FLAKE'), false);
});

test('durable Phase 3 profiles use current-CI modes rather than historical scope guards', () => {
  for (const profile of ['prd3-g01', 'prd3-g04', 'prd3-g05']) {
    assert.ok(PROFILE_HARNESSES[profile].includes('--current-ci'), profile);
    assert.equal(PROFILE_HARNESSES[profile].includes('--regression'), false);
  }
});

test('every self-contained Phase 3 profile preloads its exact fresh-run images', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(SELF_CONTAINED_PROFILE_IMAGES).map(([profile, images]) => [
        profile,
        images.map(({ image }) => image),
      ]),
    ),
    {
      'prd3-g01': ['postgres:16-alpine'],
      'prd3-g02': ['redis:7-alpine'],
      'prd3-g03': [
        'postgres:16-alpine',
        'redis:7-alpine',
        'minio/minio:RELEASE.2025-09-07T16-13-09Z',
      ],
      'prd3-g04': ['postgres:16-alpine'],
      'prd3-g05': ['postgres:16-alpine'],
    },
  );
});

test('evidence redaction removes explicit values, credential URLs, and secret fields', () => {
  const explicit = 'do-not-print-this';
  const healthDatabaseUrl =
    'postgresql://health-user:health-password@owned-postgres:5432/health?schema=public';
  const safe = sanitizeEvidence(
    {
      message: `value=${explicit} ${healthDatabaseUrl}`,
      nested: { jwtSecret: 'unsafe', ordinary: 'kept' },
    },
    [explicit, healthDatabaseUrl],
  );
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(
    serialized,
    /do-not-print-this|health-user|health-password|unsafe/u,
  );
  assert.match(serialized, /\[REDACTED/u);
  assert.equal(safe.nested.ordinary, 'kept');
  assert.equal(
    redactText('redis://user:pass@127.0.0.1:6379/0'),
    '[REDACTED_URL]',
  );
});

test('media health endpoints use owned container DNS while host fixtures stay loopback-only', () => {
  const mediaRuntimeStart = RUN_CI_SHARD_SOURCE.indexOf(
    'async function runMediaRuntime',
  );
  const mediaRuntimeEnd = RUN_CI_SHARD_SOURCE.indexOf(
    'async function cleanupHealthResources',
    mediaRuntimeStart,
  );
  assert.ok(mediaRuntimeStart >= 0 && mediaRuntimeEnd > mediaRuntimeStart);
  const mediaRuntime = RUN_CI_SHARD_SOURCE.slice(
    mediaRuntimeStart,
    mediaRuntimeEnd,
  );

  assert.match(
    RUN_CI_SHARD_SOURCE,
    /--publish',\s*'127\.0\.0\.1::5432'/u,
  );
  assert.match(
    RUN_CI_SHARD_SOURCE,
    /minioPublish\s*=\s*[\s\S]*?'127\.0\.0\.1::9000'/u,
  );
  assert.match(
    RUN_CI_SHARD_SOURCE,
    /postgresql:\/\/moazez_ci:ci-only-postgres-password@127\.0\.0\.1:\$\{postgresPort\}/u,
  );
  assert.match(
    RUN_CI_SHARD_SOURCE,
    /const storageEndpoint = minioPort[\s\S]*?`http:\/\/127\.0\.0\.1:\$\{minioPort\}`/u,
  );

  assert.match(
    mediaRuntime,
    /healthDatabaseUrl\.hostname = context\.identity\.postgres/u,
  );
  assert.match(mediaRuntime, /healthDatabaseUrl\.port = '5432'/u);
  assert.match(
    mediaRuntime,
    /healthStorageEndpoint = `http:\/\/\$\{context\.identity\.minio\}:9000`/u,
  );
  assert.match(
    mediaRuntime,
    /HEALTH_POSTGRES_CONTAINER: context\.identity\.postgres/u,
  );
  assert.match(
    mediaRuntime,
    /HEALTH_DATABASE_URL: healthDatabaseUrlValue/u,
  );
  assert.match(
    mediaRuntime,
    /HEALTH_MINIO_CONTAINER: context\.identity\.minio/u,
  );
  assert.match(
    mediaRuntime,
    /HEALTH_STORAGE_ENDPOINT: healthStorageEndpoint/u,
  );
  assert.match(
    mediaRuntime,
    /context\.sensitiveValues\.push\([\s\S]*?healthDatabaseUrlValue/u,
  );
});

test('the child environment drops inherited URLs and secrets before adding CI fixtures', () => {
  const safe = safeHostEnvironment({
    PATH: '/bin',
    CI: 'true',
    GITHUB_RUN_ID: '123',
    DATABASE_URL: 'postgresql://production',
    JWT_ACCESS_SECRET: 'production-secret',
    RANDOM_VALUE: 'not-required',
  });
  assert.deepEqual(safe, { PATH: '/bin', CI: 'true', GITHUB_RUN_ID: '123' });
  const fixture = createBaselineTestEnvironment(safe);
  assert.equal(fixture.NODE_ENV, 'test');
  assert.match(fixture.DATABASE_URL, /127\.0\.0\.1:1/u);
  assert.doesNotMatch(
    JSON.stringify(fixture),
    /postgresql:\/\/production|production-secret/u,
  );
});

test('resource identities are stable for one candidate/run and isolated across runs', () => {
  const plan = samplePlan();
  const shard = plan.shards[0];
  const first = createResourceIdentity(plan, shard, {
    GITHUB_RUN_ID: '55',
    GITHUB_RUN_ATTEMPT: '1',
  });
  const repeat = createResourceIdentity(plan, shard, {
    GITHUB_RUN_ID: '55',
    GITHUB_RUN_ATTEMPT: '1',
  });
  const rerun = createResourceIdentity(plan, shard, {
    GITHUB_RUN_ID: '55',
    GITHUB_RUN_ATTEMPT: '2',
  });
  assert.deepEqual(first, repeat);
  assert.notEqual(first.network, rerun.network);
  assert.match(first.network, /^moazez-ci-net-unit-1-[a-f0-9]{14}$/u);
  assert.match(first.harnessRunId, /^[a-f0-9]{14}$/u);
  assert.equal(first.labels['com.moazez.ci.candidate'], CANDIDATE);
});

test('specialized G06 and teacher shards retain their disposable identity contracts', () => {
  const ciPlan = samplePlan();
  const environment = { GITHUB_RUN_ID: '55', GITHUB_RUN_ATTEMPT: '1' };
  const g06 = createResourceIdentity(
    ciPlan,
    { ...ciPlan.shards[0], profile: 'g06-reinforcement-storage' },
    environment,
  );
  const teacher = createResourceIdentity(
    ciPlan,
    { ...ciPlan.shards[0], profile: 'teacher-closeout' },
    environment,
  );
  assert.match(g06.database, /^g06_[a-f0-9]{14}$/u);
  assert.match(teacher.database, /^moazez_1b7_closeout_[a-f0-9]{14}$/u);
});

test('shard validation proves exact ownership, ordering, and file existence', () => {
  const root = temporaryRepository();
  try {
    const shard = validateShard(samplePlan(), 'unit-1-of-1', root);
    assert.deepEqual(shard.files, ['src/example.spec.ts']);
    assert.equal(shard.profile, 'unit');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shard validation fails closed for missing and duplicate assignments', () => {
  const root = temporaryRepository();
  try {
    assert.throws(
      () => validateShard(samplePlan({ assignments: [] }), 'unit-1-of-1', root),
      /ownership mismatch/u,
    );
    const duplicatePlan = samplePlan();
    duplicatePlan.shards[0].files.push('src/example.spec.ts');
    assert.throws(
      () => validateShard(duplicatePlan, 'unit-1-of-1', root),
      /duplicate files/u,
    );
    const missingPlan = samplePlan();
    missingPlan.shards[0].files = ['src/missing.spec.ts'];
    missingPlan.assignments[0].file = 'src/missing.spec.ts';
    assert.throws(
      () => validateShard(missingPlan, 'unit-1-of-1', root),
      /does not exist/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the synthetic preflight is explicit and owns no regression tests', () => {
  const root = temporaryRepository();
  try {
    const preflight = validateShard(samplePlan(), 'preflight', root);
    assert.equal(preflight.profile, 'preflight');
    assert.deepEqual(preflight.files, []);
    assert.equal(preflight.timeoutMinutes, 25);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan loading rejects non-exact SHA inputs and unsupported schemas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moazez-ci-plan-load-'));
  const file = path.join(root, 'plan.json');
  try {
    fs.writeFileSync(file, JSON.stringify(samplePlan({ candidateSha: 'abc' })));
    assert.throws(() => loadPlan(file), /exact 40-character/u);
    fs.writeFileSync(file, JSON.stringify(samplePlan({ schemaVersion: 2 })));
    assert.throws(() => loadPlan(file), /Unsupported CI plan schema/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shard execution is bound to independently verified workflow SHAs', () => {
  const ciPlan = samplePlan();
  assert.doesNotThrow(() =>
    assertPlanWorkflowIdentity(ciPlan, {
      CI_CANDIDATE_SHA: CANDIDATE,
      CI_BASE_SHA: BASE,
    }),
  );
  assert.throws(
    () =>
      assertPlanWorkflowIdentity(ciPlan, {
        CI_CANDIDATE_SHA: 'c'.repeat(40),
        CI_BASE_SHA: BASE,
      }),
    /independently verified workflow identity/u,
  );
  assert.throws(
    () => assertPlanWorkflowIdentity(ciPlan, {}),
    /CI_CANDIDATE_SHA must be an exact/u,
  );
});

test('cleanup is reverse-ordered, idempotent, and reports teardown failures', async () => {
  const cleanup = new CleanupManager();
  const order = [];
  cleanup.add('network', async () => order.push('network'));
  cleanup.add('container', async () => order.push('container'));
  cleanup.add('broken image', async () => {
    order.push('image');
    throw new Error('still exists');
  });
  const first = await cleanup.run();
  const second = await cleanup.run();
  assert.deepEqual(order, ['image', 'container', 'network']);
  assert.equal(first.ok, false);
  assert.deepEqual(first, second);
  assert.deepEqual(first.failures, [
    { label: 'broken image', message: 'still exists' },
  ]);
});

test('bounded command execution records a timeout and does not retry', async () => {
  const result = await runProcess(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    {
      timeoutMs: 30,
      env: process.env,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test('bounded command execution retains output through child stdio close', async () => {
  const marker = 'FINAL_STDIO_MARKER';
  const sink = { write() {} };
  const result = await runProcess(
    process.execPath,
    ['-e', `process.stdout.write('x'.repeat(200000) + '${marker}')`],
    {
      timeoutMs: 10_000,
      env: process.env,
      stdoutTarget: sink,
      stderrTarget: sink,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.outputTail.endsWith(marker), true);
});

test('timeout terminates the whole inherited-stdio process tree', async () => {
  const script = [
    "const { spawn } = require('node:child_process');",
    "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
    'setInterval(() => {}, 1000);',
  ].join('');
  const started = Date.now();
  const sink = { write() {} };
  const result = await runProcess(process.execPath, ['-e', script], {
    timeoutMs: 100,
    env: process.env,
    stdoutTarget: sink,
    stderrTarget: sink,
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 4000);
});

test('Jest open-handle warnings fail closed even when the process exits zero', () => {
  assert.equal(
    hasJestOpenHandleWarning(
      'Jest has detected the following 1 open handle potentially keeping Jest from exiting',
    ),
    true,
  );
  assert.equal(
    hasJestOpenHandleWarning('Test Suites: 1 passed, 1 total'),
    false,
  );
});

test('migration no-op evidence requires the exact message and a stable positive count', () => {
  assert.equal(parseAppliedMigrationCount('\n42\n'), '42');
  assert.equal(
    assertMigrationNoopEvidence(
      '42\n',
      '42\n',
      'No pending migrations to apply.\n',
    ),
    '42',
  );
  assert.throws(
    () =>
      assertMigrationNoopEvidence(
        '42',
        '43',
        'No pending migrations to apply.',
      ),
    /count changed/u,
  );
  assert.throws(
    () => assertMigrationNoopEvidence('42', '42', 'Database is up to date'),
    /did not report a no-op/u,
  );
  assert.throws(() => parseAppliedMigrationCount('0'), /Unable to prove/u);
});

test('cleanup treats Docker absence as success but daemon errors as unproven', async () => {
  const contextFor = (inspection) => ({
    repositoryRoot: REPOSITORY_ROOT,
    environment: {},
    sensitiveValues: [],
    execute: async (_command, args) =>
      args[1] === 'inspect'
        ? inspection
        : { ok: true, exitCode: 0, timedOut: false, outputTail: '' },
  });
  await assert.doesNotReject(() =>
    removeAndVerify(
      contextFor({
        ok: false,
        exitCode: 1,
        timedOut: false,
        outputTail: 'Error: No such container: owned-container',
      }),
      'container',
      'owned-container',
    ),
  );
  await assert.rejects(
    () =>
      removeAndVerify(
        contextFor({
          ok: false,
          exitCode: 1,
          timedOut: false,
          outputTail: 'Cannot connect to the Docker daemon',
        }),
        'container',
        'owned-container',
      ),
    /could not prove absence/u,
  );
});

test('parent cleanup proves self-contained harness labels are empty', async () => {
  const calls = [];
  const context = {
    repositoryRoot: REPOSITORY_ROOT,
    environment: {},
    sensitiveValues: [],
    execute: async (command, args) => {
      calls.push([command, ...args]);
      return {
        ok: true,
        exitCode: 0,
        timedOut: false,
        outputTail: '',
      };
    },
  };
  await cleanupDockerResourcesByLabel(
    context,
    'com.moazez.evidence.run',
    '0123456789abcd',
  );
  assert.equal(calls.length, 6);
  assert.ok(
    calls.every((args) =>
      args.includes('label=com.moazez.evidence.run=0123456789abcd'),
    ),
  );
  await assert.rejects(
    () =>
      cleanupDockerResourcesByLabel(context, 'unsafe.label', '0123456789abcd'),
    /Unsafe Docker cleanup label/u,
  );
});

test('the canonical workflow has one bounded matrix, fail-closed aggregate, and compatibility contexts', () => {
  const workflow = fs.readFileSync(
    path.join(REPOSITORY_ROOT, '.github', 'workflows', 'ci.yml'),
    'utf8',
  );
  assert.match(workflow, /^name: CI$/mu);
  assert.match(workflow, /^\s+name: CI \/ Required$/mu);
  assert.match(workflow, /^\s+if: always\(\)$/mu);
  assert.match(workflow, /^\s+fail-fast: false$/mu);
  assert.match(workflow, /^\s+max-parallel: 5$/mu);
  assert.match(workflow, /cancel-in-progress: true/u);
  assert.match(
    workflow,
    /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}/u,
  );
  assert.match(
    workflow,
    /candidate_sha: \$\{\{ steps\.refs\.outputs\.candidate_sha \}\}/u,
  );
  assert.match(
    workflow,
    /base_sha: \$\{\{ steps\.refs\.outputs\.base_sha \}\}/u,
  );
  assert.doesNotMatch(
    workflow,
    /^\s+(?:candidate_sha|base_sha): \$\{\{ steps\.plan\.outputs/mu,
  );
  assert.equal(
    (
      workflow.match(
        /CI_CANDIDATE_SHA: \$\{\{ needs\.plan\.outputs\.candidate_sha \}\}/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.equal(
    (
      workflow.match(
        /CI_BASE_SHA: \$\{\{ needs\.plan\.outputs\.base_sha \}\}/gu,
      ) ?? []
    ).length,
    3,
  );
  assert.match(workflow, /CI \/ \$\{\{ matrix\.label \}\}/u);
  assert.match(
    workflow,
    /preflight:[\s\S]*?timeout-minutes: 35[\s\S]*?Run deterministic preflight/u,
  );
  assert.match(
    workflow,
    /timeout-minutes: \$\{\{ matrix\.jobTimeoutMinutes \}\}/u,
  );
  assert.doesNotMatch(
    workflow,
    /timeout-minutes: \$\{\{ matrix\.timeoutMinutes \}\}/u,
  );
  for (const context of [
    'Blocking aggregate gate',
    'Exact-candidate Phase 3 gate',
    'Lesson Content atomicity and visibility',
    'learning-media-integrity',
    'Fresh PostgreSQL replay',
    'school-email-delivery-integrity',
  ]) {
    assert.ok(workflow.includes(`name: ${context}`), context);
  }
  assert.doesNotMatch(workflow, /pull_request_target|timeout-minutes:\s*240/u);
  const checkoutCount = (workflow.match(/uses: actions\/checkout@/gu) ?? [])
    .length;
  const disabledCredentialCount = (
    workflow.match(/persist-credentials: false/gu) ?? []
  ).length;
  assert.equal(disabledCredentialCount, checkoutCount);
  assert.match(
    workflow,
    /path: artifacts\/ci\/evidence\/\$\{\{ matrix\.id \}\}\.json/u,
  );
});

test('all workflow actions are immutable official pins and historical Phase 3 is manual only', () => {
  const workflowDirectory = path.join(REPOSITORY_ROOT, '.github', 'workflows');
  const files = fs
    .readdirSync(workflowDirectory)
    .filter((file) => file.endsWith('.yml'));
  assert.deepEqual(files.sort(), [
    'ci.yml',
    'phase-3-production-readiness.yml',
    'staging-wif-auth-proof.yml',
  ]);
  const expectedPins = new Set([
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093',
    'google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db',
  ]);
  for (const file of files) {
    const source = fs.readFileSync(path.join(workflowDirectory, file), 'utf8');
    const uses = [...source.matchAll(/^\s*uses:\s*(\S+)/gmu)].map(
      (match) => match[1],
    );
    assert.ok(uses.length > 0, `${file} must use pinned official actions`);
    for (const reference of uses) {
      assert.ok(expectedPins.has(reference), `${file}: ${reference}`);
      assert.match(reference, /@[0-9a-f]{40}$/u);
    }
    const checkoutCount = (source.match(/uses: actions\/checkout@/gu) ?? [])
      .length;
    const disabledCredentialCount = (
      source.match(/persist-credentials: false/gu) ?? []
    ).length;
    assert.equal(disabledCredentialCount, checkoutCount, file);
  }
  const historical = fs.readFileSync(
    path.join(workflowDirectory, 'phase-3-production-readiness.yml'),
    'utf8',
  );
  assert.match(historical, /^\s*workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(historical, /^\s*(?:pull_request|push):/mu);

  const stagingWif = fs.readFileSync(
    path.join(workflowDirectory, 'staging-wif-auth-proof.yml'),
    'utf8',
  );
  assert.match(stagingWif, /^\s*workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(stagingWif, /^\s*(?:pull_request|push):/mu);

  const stagingWifLines = stagingWif.split(/\r?\n/u);
  const permissionsIndex = stagingWifLines.findIndex((line) =>
    /^permissions:\s*$/u.test(line),
  );
  assert.notEqual(permissionsIndex, -1);
  const permissions = [];
  for (
    let index = permissionsIndex + 1;
    index < stagingWifLines.length;
    index += 1
  ) {
    const line = stagingWifLines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }
    if (!/^\s/u.test(line)) {
      break;
    }
    const permission = line
      .trim()
      .match(/^([a-z-]+):\s*(\S+?)(?:\s+#.*)?$/u);
    assert.ok(permission, `invalid staging WIF permission: ${line.trim()}`);
    permissions.push([permission[1], permission[2]]);
  }
  permissions.sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(permissions, [
    ['contents', 'read'],
    ['id-token', 'write'],
  ]);
});
