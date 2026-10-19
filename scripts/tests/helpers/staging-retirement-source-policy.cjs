'use strict';

// Test-only authority. Never import this module from application or operator code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const BASELINE_SHA = '8449769bcb453dd3ac8436d2b71c133e6369f6fa';
const RETIREMENT_CLOSEOUT_SHA = '35428c6c35d3035b7c410c4472de6a930d31f4f0';
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');
const ACTIONS = {
  REMOVE: [
    '.github/workflows/staging-backend-image.yml',
    '.github/workflows/staging-wif-auth-proof.yml',
    'infra/gcp/artifact-registry/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/artifact-registry/environments/nonprod/main.tf',
    'infra/gcp/artifact-registry/environments/nonprod/outputs.tf',
    'infra/gcp/artifact-registry/environments/nonprod/providers.tf',
    'infra/gcp/artifact-registry/environments/nonprod/variables.tf',
    'infra/gcp/artifact-registry/environments/nonprod/versions.tf',
    'infra/gcp/backend-runtime/environments/nonprod/migration/.terraform.lock.hcl',
    'infra/gcp/backend-runtime/environments/nonprod/migration/main.tf',
    'infra/gcp/backend-runtime/environments/nonprod/migration/outputs.tf',
    'infra/gcp/backend-runtime/environments/nonprod/migration/providers.tf',
    'infra/gcp/backend-runtime/environments/nonprod/migration/variables.tf',
    'infra/gcp/backend-runtime/environments/nonprod/migration/versions.tf',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/.terraform.lock.hcl',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/main.tf',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/outputs.tf',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/providers.tf',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/tests/release-orchestration.tftest.hcl',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/tests/runtime-module-preconditions.tftest.hcl',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/variables.tf',
    'infra/gcp/backend-runtime/environments/nonprod/runtime/versions.tf',
    'infra/gcp/deployment-identity/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/deployment-identity/environments/nonprod/main.tf',
    'infra/gcp/deployment-identity/environments/nonprod/outputs.tf',
    'infra/gcp/deployment-identity/environments/nonprod/providers.tf',
    'infra/gcp/deployment-identity/environments/nonprod/variables.tf',
    'infra/gcp/deployment-identity/environments/nonprod/versions.tf',
    'infra/gcp/edge/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/edge/environments/nonprod/main.tf',
    'infra/gcp/edge/environments/nonprod/outputs.tf',
    'infra/gcp/edge/environments/nonprod/providers.tf',
    'infra/gcp/edge/environments/nonprod/tests/candidate-route.tftest.hcl',
    'infra/gcp/edge/environments/nonprod/variables.tf',
    'infra/gcp/edge/environments/nonprod/versions.tf',
    'infra/gcp/network/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/network/environments/nonprod/main.tf',
    'infra/gcp/network/environments/nonprod/outputs.tf',
    'infra/gcp/network/environments/nonprod/providers.tf',
    'infra/gcp/network/environments/nonprod/variables.tf',
    'infra/gcp/network/environments/nonprod/versions.tf',
    'infra/gcp/redis/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/redis/environments/nonprod/main.tf',
    'infra/gcp/redis/environments/nonprod/outputs.tf',
    'infra/gcp/redis/environments/nonprod/providers.tf',
    'infra/gcp/redis/environments/nonprod/variables.tf',
    'infra/gcp/redis/environments/nonprod/versions.tf',
    'infra/gcp/runtime-iam/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/runtime-iam/environments/nonprod/main.tf',
    'infra/gcp/runtime-iam/environments/nonprod/outputs.tf',
    'infra/gcp/runtime-iam/environments/nonprod/providers.tf',
    'infra/gcp/runtime-iam/environments/nonprod/variables.tf',
    'infra/gcp/runtime-iam/environments/nonprod/versions.tf',
    'infra/gcp/secrets/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/secrets/environments/nonprod/main.tf',
    'infra/gcp/secrets/environments/nonprod/outputs.tf',
    'infra/gcp/secrets/environments/nonprod/providers.tf',
    'infra/gcp/secrets/environments/nonprod/variables.tf',
    'infra/gcp/secrets/environments/nonprod/versions.tf',
    'infra/gcp/sql/environments/nonprod/.terraform.lock.hcl',
    'infra/gcp/sql/environments/nonprod/main.tf',
    'infra/gcp/sql/environments/nonprod/outputs.tf',
    'infra/gcp/sql/environments/nonprod/providers.tf',
    'infra/gcp/sql/environments/nonprod/variables.tf',
    'infra/gcp/sql/environments/nonprod/versions.tf',
    'infra/gcp/storage/environments/nonprod/main.tf',
    'infra/gcp/storage/environments/nonprod/outputs.tf',
    'infra/gcp/storage/environments/nonprod/providers.tf',
    'infra/gcp/storage/environments/nonprod/terraform.tfvars.example',
    'infra/gcp/storage/environments/nonprod/variables.tf',
    'infra/gcp/storage/environments/nonprod/versions.tf',
  ],
  MODIFY: [
    'docs/communication-fcm-mobile-push-handoff.md',
    'docs/governance/runtime-capacity-governance.md',
    'infra/gcp/artifact-registry/modules/artifact-registry-environment/variables.tf',
    'infra/gcp/artifact-registry/README.md',
    'infra/gcp/backend-runtime/modules/migration-job-environment/variables.tf',
    'infra/gcp/backend-runtime/modules/runtime-environment/variables.tf',
    'infra/gcp/backend-runtime/README.md',
    'infra/gcp/deployment-identity/modules/deployment-identity-environment/variables.tf',
    'infra/gcp/deployment-identity/README.md',
    'infra/gcp/edge/modules/edge-environment/variables.tf',
    'infra/gcp/edge/README.md',
    'infra/gcp/network/modules/network-environment/variables.tf',
    'infra/gcp/network/README.md',
    'infra/gcp/redis/modules/redis-environment/variables.tf',
    'infra/gcp/redis/README.md',
    'infra/gcp/runtime-iam/modules/runtime-iam-environment/variables.tf',
    'infra/gcp/runtime-iam/README.md',
    'infra/gcp/secrets/modules/secret-environment/variables.tf',
    'infra/gcp/secrets/README.md',
    'infra/gcp/sql/modules/sql-environment/variables.tf',
    'infra/gcp/sql/README.md',
    'infra/gcp/storage/modules/storage-environment/variables.tf',
    'infra/gcp/storage/README.md',
    'README.md',
    'scripts/ci/plan-ci.cjs',
    'scripts/ci/run-ci-shard.cjs',
    'scripts/deployment-control/README.md',
    'scripts/deployment-control/runtime-capacity-control.cjs',
    'scripts/deployment-control/runtime-release-control.cjs',
    'scripts/deployment-control/tests/runtime-capacity-control.test.cjs',
    'scripts/deployment-control/tests/runtime-release-control.test.cjs',
    'scripts/migrations/run-governed-migration-job.cjs',
    'scripts/storage/gcs-batch2-iam-proof.cjs',
    'scripts/storage/gcs-batch2-preflight.ps1',
    'scripts/storage/gcs-batch2-proof-policy.cjs',
    'scripts/storage/gcs-batch2-proof.cjs',
    'scripts/storage/gcs-batch2-readonly-proof.ps1',
    'scripts/storage/tests/gcs-batch2-operator-scripts.test.cjs',
    'scripts/storage/tests/gcs-batch2-proof-policy.test.cjs',
    'scripts/storage/tests/gcs-batch2-terraform-policy.test.cjs',
    'scripts/tests/plan-ci.test.cjs',
    'scripts/tests/prd3-g04-governed-migration-job.test.cjs',
    'scripts/tests/pt-2-backend-firebase-production-bootstrap.test.cjs',
    'scripts/tests/run-ci-shard.test.cjs',
    'scripts/tests/stage-24a-production-cloud-sql-source.test.cjs',
    'scripts/tests/stage-25b-production-redis-source.test.cjs',
    'scripts/tests/stage-26c-production-foundation-source.test.cjs',
    'scripts/tests/stage-28a-production-migration-job-source.test.cjs',
    'scripts/tests/stage-29a-production-runtime-source.test.cjs',
    'scripts/tests/stage-30c1-production-frontend-edge-source.test.cjs',
    'scripts/tests/verify-runtime-policy.test.cjs',
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.environment.ts',
    'src/modules/platform-admin/bootstrap/tests/platform-admin-bootstrap.environment.spec.ts',
    'src/platform-admin-bootstrap.spec.ts',
    'src/platform-admin-bootstrap.ts',
    'src/reference-data-bootstrap.spec.ts',
    'src/reference-data-bootstrap.ts',
  ],
  ADD: [
    'adr/ADR-0016-staging-retirement-and-production-preservation.md',
    'scripts/tests/helpers/staging-retirement-source-policy.cjs',
    'scripts/tests/staging-retirement-source.test.cjs',
    'scripts/deployment-control/tests/staging-retirement-control.test.cjs',
    'infra/gcp/backend-runtime/modules/runtime-environment/tests/retirement-runtime.tftest.hcl',
    'infra/gcp/edge/modules/edge-environment/tests/retirement-edge.tftest.hcl',
  ],
};
for (const values of Object.values(ACTIONS)) Object.freeze(values);
Object.freeze(ACTIONS);
const SELECTORS = [
  {
    path: 'infra/gcp/artifact-registry/modules/artifact-registry-environment/variables.tf',
    selector: 'environment',
    productionCalls: [
      'infra/gcp/artifact-registry/environments/production/main.tf',
    ],
  },
  {
    path: 'infra/gcp/backend-runtime/modules/migration-job-environment/variables.tf',
    selector: 'migration_job_environment',
    productionCalls: [
      'infra/gcp/backend-runtime/environments/production/migration/main.tf',
    ],
  },
  {
    path: 'infra/gcp/backend-runtime/modules/runtime-environment/variables.tf',
    selector: 'environment',
    productionCalls: [
      'infra/gcp/backend-runtime/environments/production/runtime/main.tf',
    ],
  },
  {
    path: 'infra/gcp/deployment-identity/modules/deployment-identity-environment/variables.tf',
    selector: 'environment',
    productionCalls: [
      'infra/gcp/deployment-identity/environments/production/main.tf',
    ],
  },
  {
    path: 'infra/gcp/edge/modules/edge-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/edge/environments/production/main.tf'],
  },
  {
    path: 'infra/gcp/network/modules/network-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/network/environments/production/main.tf'],
  },
  {
    path: 'infra/gcp/redis/modules/redis-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/redis/environments/production/main.tf'],
  },
  {
    path: 'infra/gcp/runtime-iam/modules/runtime-iam-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/runtime-iam/environments/production/main.tf'],
  },
  {
    path: 'infra/gcp/secrets/modules/secret-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/secrets/environments/production/main.tf'],
  },
  {
    path: 'infra/gcp/sql/modules/sql-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/sql/environments/production/main.tf'],
  },
  {
    path: 'infra/gcp/storage/modules/storage-environment/variables.tf',
    selector: 'environment',
    productionCalls: ['infra/gcp/storage/environments/production/main.tf'],
  },
];
const HISTORICAL_MODULES = Object.freeze([
  'scripts/deployment-control/runtime-release-control.cjs',
  'scripts/deployment-control/runtime-capacity-control.cjs',
  'scripts/storage/gcs-batch2-proof-policy.cjs',
  'scripts/storage/gcs-batch2-proof.cjs',
  'scripts/storage/gcs-batch2-iam-proof.cjs',
  'scripts/migrations/run-governed-migration-job.cjs',
  'scripts/migrations/migration-artifact-manifest.cjs',
]);
const historicalModules = new Map();
function git(args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
}
function checkedPath(relativePath) {
  assert.equal(typeof relativePath, 'string');
  assert.ok(
    relativePath &&
      !path.isAbsolute(relativePath) &&
      !relativePath.split('/').includes('..') &&
      !relativePath.includes('\\'),
  );
  return relativePath;
}
function readHistoricalSource(relativePath) {
  return git(['show', BASELINE_SHA + ':' + checkedPath(relativePath)]);
}
function verifyCommit(sha, gitRunner = git) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u, 'exact commit SHA required');
  assert.equal(
    gitRunner(['rev-parse', '--verify', sha + '^{commit}']).trim(),
    sha,
    'commit identity mismatch',
  );
  return sha;
}
let retirementHistoryVerified = false;
function verifyRetirementHistory() {
  if (retirementHistoryVerified) return;
  verifyCommit(BASELINE_SHA);
  verifyCommit(RETIREMENT_CLOSEOUT_SHA);
  git(['merge-base', '--is-ancestor', BASELINE_SHA, RETIREMENT_CLOSEOUT_SHA]);
  git(['merge-base', '--is-ancestor', RETIREMENT_CLOSEOUT_SHA, 'HEAD']);
  retirementHistoryVerified = true;
}
function readRetirementCloseoutSource(relativePath) {
  verifyRetirementHistory();
  return git([
    'show',
    RETIREMENT_CLOSEOUT_SHA + ':' + checkedPath(relativePath),
  ]);
}
function parseChanges(output) {
  return output
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [action, file, ...extra] = line.split('\t');
      assert.deepEqual(extra, [], 'rename/copy is not authorized');
      assert.ok(['A', 'M', 'D'].includes(action), 'unexpected source action');
      checkedPath(file);
      return { action, file };
    });
}
function historicalChanges() {
  verifyRetirementHistory();
  return parseChanges(
    git([
      'diff',
      '--name-status',
      '--no-renames',
      BASELINE_SHA,
      RETIREMENT_CLOSEOUT_SHA,
      '--',
    ]),
  );
}
function currentGitContext({
  environment = process.env,
  headSha,
  gitRunner = git,
} = {}) {
  const actualHead = gitRunner([
    'rev-parse',
    '--verify',
    'HEAD^{commit}',
  ]).trim();
  const candidateSha = verifyCommit(headSha ?? actualHead, gitRunner);
  assert.equal(
    candidateSha,
    actualHead,
    'CI runtime candidate must be actual HEAD',
  );
  if (environment.CI_CANDIDATE_SHA !== undefined)
    assert.equal(
      environment.CI_CANDIDATE_SHA,
      candidateSha,
      'CI runtime candidate must be actual HEAD',
    );
  const baseSha = verifyCommit(
    environment.CI_BASE_SHA ??
      gitRunner(['rev-parse', '--verify', 'origin/main^{commit}']).trim(),
    gitRunner,
  );
  verifyCommit(RETIREMENT_CLOSEOUT_SHA, gitRunner);
  for (const descendant of [baseSha, candidateSha])
    gitRunner([
      'merge-base',
      '--is-ancestor',
      RETIREMENT_CLOSEOUT_SHA,
      descendant,
    ]);
  const mergeBaseSha = verifyCommit(
    gitRunner(['merge-base', baseSha, candidateSha]).trim(),
    gitRunner,
  );
  for (const descendant of [baseSha, candidateSha])
    gitRunner(['merge-base', '--is-ancestor', mergeBaseSha, descendant]);
  return { candidateSha, baseSha, mergeBaseSha };
}

function readVerifiedHistoricalSourceAtCommit(
  relativePath,
  commit,
  expectedBlob,
) {
  assert.equal(
    relativePath,
    'docs/production-readiness/phase-5a/01-gcs-iac-and-real-proof-runbook.md',
  );
  assert.match(commit, /^[a-f0-9]{40}$/u);
  const snapshots = {
    '8e497dc51b592b3d417621b0232853a5c2a31d26':
      '33f530150544f6bdc7295354a78a47e2518753f3',
    '8449769bcb453dd3ac8436d2b71c133e6369f6fa':
      'be7c0589d07ac7b3685965dd8d2135bc7bccad5f',
  };
  assert.ok(
    Object.hasOwn(snapshots, commit),
    'historical runbook snapshot is not approved',
  );
  assert.equal(
    expectedBlob,
    snapshots[commit],
    'historical expected blob mismatch',
  );
  assert.equal(
    git(['rev-parse', '--verify', commit + '^{commit}']).trim(),
    commit,
  );
  assert.equal(
    git(['rev-parse', commit + ':' + relativePath]).trim(),
    expectedBlob,
  );
  const source = git(['show', commit + ':' + relativePath]);
  const bytes = Buffer.from(source, 'utf8');
  assert.equal(
    createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex'),
    expectedBlob,
    'historical content blob mismatch',
  );
  return source;
}
function readCurrentSource(relativePath) {
  return fs
    .readFileSync(path.join(REPOSITORY_ROOT, checkedPath(relativePath)), 'utf8')
    .replace(/\r\n/gu, '\n');
}
function loadHistoricalModule(relativePath) {
  checkedPath(relativePath);
  assert.ok(
    HISTORICAL_MODULES.includes(relativePath),
    'historical module is not explicitly authorized',
  );
  if (historicalModules.has(relativePath))
    return historicalModules.get(relativePath).exports;
  const filename = path.join(REPOSITORY_ROOT, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireCurrentDependency = Module.createRequire(filename);
  loaded.require = (specifier) => {
    if (specifier.startsWith('.')) {
      const dependency = path
        .relative(
          REPOSITORY_ROOT,
          path.resolve(path.dirname(filename), specifier),
        )
        .replace(/\\/gu, '/');
      assert.ok(
        HISTORICAL_MODULES.includes(dependency),
        'unexpected historical local module dependency',
      );
      return loadHistoricalModule(dependency);
    }
    return requireCurrentDependency(specifier);
  };
  historicalModules.set(relativePath, loaded);
  try {
    loaded._compile(readHistoricalSource(relativePath), filename);
    return loaded.exports;
  } catch (error) {
    historicalModules.delete(relativePath);
    throw error;
  }
}
function expectedActions() {
  return new Map(
    Object.entries(ACTIONS).flatMap(([kind, files]) =>
      files.map((file) => [
        file,
        kind === 'REMOVE' ? 'D' : kind === 'ADD' ? 'A' : 'M',
      ]),
    ),
  );
}
const CI_RUNTIME_PATHS = Object.freeze([
  'artifacts/ci/plan/ci-plan.json',
  'artifacts/ci/evidence/runtime-governance-1-of-1.json',
  'artifacts/ci/minio-fixture/minio-image.tar',
]);
// These are outputs of the unchanged canonical CI workflow, never source ADDs.
// Dependency injection keeps negative coverage isolated from the real checkout.
function classifyCiRuntimeFiles({
  untracked,
  environment,
  headSha,
  trackedChanges,
  readJson,
  stat,
  createPlan,
  gitRunner = git,
  workflowIdentity = process.env,
}) {
  if (!untracked.some((file) => CI_RUNTIME_PATHS.includes(file))) return [];
  assert.equal(
    environment.CI,
    'true',
    'CI runtime data requires CI provenance',
  );
  assert.equal(
    environment.GITHUB_ACTIONS,
    'true',
    'CI runtime data requires GitHub Actions',
  );
  assert.equal(
    environment.GITHUB_REPOSITORY,
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend',
  );
  assert.equal(environment.GITHUB_REPOSITORY_ID, '1217512033');
  assert.equal(environment.GITHUB_WORKFLOW, 'CI');
  assert.equal(environment.GITHUB_JOB, 'regression');
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) {
    assert.match(environment[key] ?? '', /^[1-9][0-9]*$/u, key);
    assert.equal(
      environment[key],
      workflowIdentity[key],
      'foreign CI run/attempt: ' + key,
    );
  }
  assert.match(headSha, /^[a-f0-9]{40}$/u);
  assert.equal(
    environment.CI_CANDIDATE_SHA,
    headSha,
    'CI runtime candidate must be actual HEAD',
  );
  assert.match(
    environment.CI_BASE_SHA ?? '',
    /^[a-f0-9]{40}$/u,
    'exact CI base required',
  );
  const context = currentGitContext({ environment, headSha, gitRunner });
  assert.deepEqual(
    trackedChanges,
    [],
    'CI runtime classification requires an immutable tracked checkout',
  );
  assert.equal(
    new Set(untracked).size,
    untracked.length,
    'duplicate untracked runtime artifact',
  );
  for (const file of CI_RUNTIME_PATHS) {
    assert.ok(
      untracked.includes(file),
      'incomplete CI runtime outputs: ' + file,
    );
    const metadata = stat(file);
    assert.ok(
      metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 0,
      'invalid CI runtime file: ' + file,
    );
  }
  const plan = readJson(CI_RUNTIME_PATHS[0]);
  for (const key of ['candidateSha', 'baseSha', 'mergeBaseSha'])
    assert.equal(
      plan[key],
      context[key],
      'CI plan Git identity mismatch: ' + key,
    );
  assert.deepEqual(
    plan,
    createPlan({
      candidateSha: context.candidateSha,
      baseSha: context.baseSha,
    }),
    'CI plan must match canonical committed-source plan',
  );
  const shards = plan.shards.filter(
    (shard) => shard.id === 'runtime-governance-1-of-1',
  );
  assert.equal(shards.length, 1);
  const shard = shards[0];
  assert.equal(shard.profile, 'runtime-governance');
  assert.equal(shard.category, 'invariant');
  assert.ok(
    shard.files.includes('scripts/tests/staging-retirement-source.test.cjs'),
  );
  const assignments = plan.assignments.filter(
    (item) =>
      item.execution === 'pull-request' &&
      item.profile === 'runtime-governance',
  );
  assert.ok(
    assignments.every(
      (item) =>
        item.kind === 'node-tap' &&
        item.category === shard.category &&
        typeof item.owner === 'string' &&
        item.owner.length > 0,
    ),
    'invalid runtime ownership',
  );
  assert.deepEqual(
    assignments.map((item) => item.file).sort(),
    [...shard.files].sort(),
    'runtime ownership differs from shard',
  );
  assert.equal(
    new Set(shard.files).size,
    shard.files.length,
    'duplicate runtime assignment',
  );
  const evidence = readJson(CI_RUNTIME_PATHS[1]);
  for (const [key, value] of Object.entries({
    schemaVersion: 1,
    candidateSha: plan.candidateSha,
    baseSha: plan.baseSha,
    jobId: shard.id,
    category: shard.category,
    profile: shard.profile,
    shardIndex: shard.index,
    shardTotal: shard.total,
    testFileCount: shard.files.length,
    status: 'RUNNING',
    cleanupStatus: 'PENDING',
    classification: null,
    finishedAt: null,
    durationMs: null,
    testSuiteCount: null,
    testCount: null,
    skippedTestCount: null,
  }))
    assert.equal(evidence[key], value, 'CI runtime evidence ' + key);
  const evidenceKeys = [
    'schemaVersion',
    'candidateSha',
    'baseSha',
    'jobId',
    'category',
    'profile',
    'shardIndex',
    'shardTotal',
    'testFiles',
    'executedTestFiles',
    'testFileCount',
    'testSuiteCount',
    'testCount',
    'skippedTestCount',
    'startedAt',
    'finishedAt',
    'durationMs',
    'status',
    'classification',
    'cleanupStatus',
    'stages',
    'runtimeGovernanceDispatch',
  ];
  assert.deepEqual(
    Object.keys(evidence).sort(),
    evidenceKeys.sort(),
    'unexpected/missing runtime evidence fields',
  );
  assert.equal(
    new Date(evidence.startedAt).toISOString(),
    evidence.startedAt,
    'invalid runtime evidence start',
  );
  assert.deepEqual(evidence.testFiles, shard.files);
  assert.deepEqual(evidence.executedTestFiles, []);
  assert.deepEqual(
    evidence.runtimeGovernanceDispatch,
    {
      command: process.execPath,
      args: ['--require', 'ts-node/register', '--test', ...shard.files],
      submittedTestFiles: shard.files,
      status: 'SUBMITTED',
    },
    'actual runtime dispatch must own every assigned file',
  );
  assert.deepEqual(
    evidence.stages.map((stage) => [
      stage.id,
      stage.status,
      stage.classification,
    ]),
    [
      ['npm-ci', 'PASS', null],
      ['prisma-generate', 'PASS', null],
      ['node-tap', 'RUNNING', null],
    ],
    'runtime evidence must describe the active canonical process',
  );
  for (const stage of evidence.stages.slice(0, 2)) {
    assert.equal(stage.exitCode, 0);
    assert.equal(stage.timedOut, false);
  }
  assert.equal(evidence.stages.at(-1).finishedAt, null);
  // The opaque tar is already loaded/verified by CI; this guard reads no binary.
  return [...CI_RUNTIME_PATHS];
}
function currentChanges() {
  const context = currentGitContext();
  // Include staged/unstaged changes as well as the current PR range. Only the
  // independently validated canonical runtime outputs can be excluded below.
  const changes = parseChanges(
    git(['diff', '--name-status', '--no-renames', context.mergeBaseSha, '--']),
  );
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  let runtimeFiles = [];
  if (untracked.some((file) => CI_RUNTIME_PATHS.includes(file))) {
    runtimeFiles = classifyCiRuntimeFiles({
      untracked,
      environment: process.env,
      headSha: git(['rev-parse', 'HEAD']).trim(),
      trackedChanges: git(['diff', '--name-only', 'HEAD', '--'])
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean),
      stat: (file) => fs.lstatSync(path.join(REPOSITORY_ROOT, file)),
      readJson: (file) => JSON.parse(readCurrentSource(file)),
      createPlan: (options) =>
        require('../../ci/plan-ci.cjs').createCiPlan({
          repositoryRoot: REPOSITORY_ROOT,
          ...options,
        }),
    });
  }
  for (const file of untracked.filter((file) => !runtimeFiles.includes(file)))
    changes.push({ action: 'A', file });
  return changes;
}
function assertApprovedActions(
  changes = historicalChanges(),
  { complete = true } = {},
) {
  const expected = expectedActions();
  const seen = new Set();
  for (const { action, file } of changes) {
    assert.ok(!seen.has(file), 'duplicate candidate path: ' + file);
    seen.add(file);
    assert.equal(
      expected.get(file),
      action,
      'unapproved path/action: ' + action + ' ' + file,
    );
  }
  if (complete)
    assert.deepEqual(
      [...seen].sort(),
      [...expected.keys()].sort(),
      'candidate must contain every approved change',
    );
  verifyRetirementHistory();
  return true;
}
function isStagingRetirementScope(candidateFiles) {
  if (!Array.isArray(candidateFiles)) return false;
  const expected = [...expectedActions().keys()].sort();
  const normalized = [
    ...new Set(candidateFiles.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  if (
    normalized.length !== expected.length ||
    normalized.some((file, index) => file !== expected[index])
  )
    return false;
  // Exact action validation is mandatory; anchor names alone never grant scope.
  assertApprovedActions();
  for (const anchor of ACTIONS.ADD.slice(0, 4))
    git([
      'cat-file',
      '-e',
      RETIREMENT_CLOSEOUT_SHA + ':' + checkedPath(anchor),
    ]);
  return true;
}
function variableBlock(text, name) {
  const start = text.indexOf('variable "' + name + '" {');
  assert.ok(start >= 0, 'missing variable ' + name);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = text.indexOf('{', start); index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  throw new Error('unterminated variable ' + name);
}
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function prepareTerraformFixtures(outputDirectory) {
  const output = path.resolve(outputDirectory);
  assert.ok(
    path.isAbsolute(outputDirectory),
    'fixture output must be absolute',
  );
  assert.ok(
    !output
      .toLowerCase()
      .startsWith(REPOSITORY_ROOT.toLowerCase() + path.sep) &&
      output.toLowerCase() !== REPOSITORY_ROOT.toLowerCase(),
    'fixtures must be external',
  );
  assert.ok(!fs.existsSync(output), 'fixture directory must be new');
  fs.mkdirSync(output, { recursive: false });
  const baselineFiles = git([
    'ls-tree',
    '-r',
    '--name-only',
    BASELINE_SHA,
    '--',
    'infra/gcp',
  ])
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  const currentFiles = [
    ...new Set([
      ...baselineFiles.filter((file) => !ACTIONS.REMOVE.includes(file)),
      ...ACTIONS.ADD.filter((file) => file.startsWith('infra/gcp/')),
    ]),
  ];
  const manifest = {
    baselineSha: BASELINE_SHA,
    credentialsAllowed: false,
    roots: [],
    files: [],
  };
  const write = (relativePath, text) => {
    const target = path.join(output, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, { encoding: 'utf8', flag: 'wx' });
    manifest.files.push({
      path: relativePath.replace(/\\/gu, '/'),
      sha256: hash(text),
    });
  };
  for (const [tree, files] of [
    ['historical', baselineFiles],
    ['current', currentFiles],
  ]) {
    for (const file of files) {
      assert.ok(
        !/(?:^|\/)\.terraform(?:\/|$)|\.tfstate|\.tfplan$/u.test(file),
        'operational artifact forbidden',
      );
      write(
        tree + '/' + file,
        tree === 'historical'
          ? readHistoricalSource(file)
          : readCurrentSource(file),
      );
    }
  }
  const lockSource = readHistoricalSource(
    'infra/gcp/backend-runtime/environments/production/runtime/.terraform.lock.hcl',
  );
  const addRoot = (key, relativePath, mode, extra = {}) => {
    const absolute = path.join(output, relativePath);
    if (!fs.existsSync(path.join(absolute, '.terraform.lock.hcl')))
      write(relativePath + '/.terraform.lock.hcl', lockSource);
    manifest.roots.push({
      key,
      path: absolute,
      mode,
      providerMode: 'mock_google_only',
      ...extra,
    });
  };
  const productionRoots = baselineFiles
    .filter(
      (file) =>
        file.includes('/environments/production/') &&
        file.endsWith('/versions.tf'),
    )
    .map((file) => path.posix.dirname(file));
  assert.equal(productionRoots.length, 13);
  for (const root of productionRoots)
    addRoot(
      'validate-' + root.replaceAll('/', '-'),
      'current/' + root,
      'validation',
    );
  for (const selector of SELECTORS) {
    assert.equal(
      selector.productionCalls.length,
      1,
      'expected one Production caller per retired/shared selector',
    );
    const caller = selector.productionCalls[0];
    const root = path.posix.dirname(caller);
    const key =
      'missing-' + path.posix.basename(path.posix.dirname(selector.path));
    let main = readCurrentSource(caller);
    const selectorLine = new RegExp(
      '^  ' + selector.selector + '[ \t]*=.*\\r?\\n',
      'gmu',
    );
    assert.equal(
      [...main.matchAll(selectorLine)].length,
      1,
      'selector must be removed exactly once',
    );
    main = main.replace(selectorLine, '');
    const moduleDirectory = path
      .join(output, 'current', path.posix.dirname(selector.path))
      .replace(/\\/gu, '/');
    assert.equal([...main.matchAll(/source\s*=\s*"[^"\n]+"/gu)].length, 1);
    main = main.replace(
      /source\s*=\s*"[^"\n]+"/u,
      'source = ' + JSON.stringify(moduleDirectory),
    );
    write(key + '/main.tf', main);
    write(key + '/variables.tf', readCurrentSource(root + '/variables.tf'));
    write(
      key + '/versions.tf',
      'terraform {\n  required_providers {\n    google = {\n      source = "hashicorp/google"\n      version = ">= 7.40.0, < 8.0.0"\n    }\n  }\n}\n',
    );
    addRoot(key, key, 'missing-selector-validation', {
      requiredSelector: selector.selector,
    });
  }
  for (const [tree, root] of [
    ['historical', 'infra/gcp/backend-runtime/environments/nonprod/runtime'],
    ['historical', 'infra/gcp/edge/environments/nonprod'],
    ['current', 'infra/gcp/backend-runtime/modules/runtime-environment'],
    ['current', 'infra/gcp/edge/modules/edge-environment'],
  ])
    addRoot(
      'mock-' + tree + '-' + root.replaceAll('/', '-'),
      tree + '/' + root,
      'mock-test',
    );
  // nullable=false rejects null during binding; expect_failures only catches
  // checkable validation diagnostics, so each fatal null case has its own process.
  for (const [name, moduleRoot, suite] of [
    [
      'runtime',
      'infra/gcp/backend-runtime/modules/runtime-environment',
      'retirement-runtime.tftest.hcl',
    ],
    [
      'edge',
      'infra/gcp/edge/modules/edge-environment',
      'retirement-edge.tftest.hcl',
    ],
  ]) {
    const targetRoot = 'null-binding-' + name;
    for (const file of currentFiles.filter(
      (file) => path.posix.dirname(file) === moduleRoot && file.endsWith('.tf'),
    )) {
      write(
        targetRoot + '/' + path.posix.basename(file),
        readCurrentSource(file),
      );
    }
    const suiteSource = readCurrentSource(moduleRoot + '/tests/' + suite);
    const firstRun = /^run /mu.exec(suiteSource);
    assert.ok(firstRun, 'missing current mock fixture');
    const header = suiteSource.slice(0, firstRun.index);
    write(
      targetRoot + '/tests/null-selector.tftest.hcl',
      header +
        'run "null_selector_is_rejected" {\n  command = plan\n  variables {\n    environment = null\n  }\n}\n',
    );
    addRoot('null-binding-' + name, targetRoot, 'null-binding-mock-rejection', {
      requiredSelector: 'environment',
      expectedError: 'required variable may not be set to null',
    });
  }
  fs.writeFileSync(
    path.join(output, 'fixture-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { encoding: 'utf8', flag: 'wx' },
  );
  return manifest;
}
module.exports = Object.freeze({
  BASELINE_SHA,
  RETIREMENT_CLOSEOUT_SHA,
  REPOSITORY_ROOT,
  ACTIONS,
  SELECTORS,
  HISTORICAL_MODULES,
  readHistoricalSource,
  readRetirementCloseoutSource,
  readVerifiedHistoricalSourceAtCommit,
  readCurrentSource,
  loadHistoricalModule,
  expectedActions,
  CI_RUNTIME_PATHS,
  classifyCiRuntimeFiles,
  currentGitContext,
  historicalChanges,
  currentChanges,
  assertApprovedActions,
  isStagingRetirementScope,
  variableBlock,
  prepareTerraformFixtures,
});
if (require.main === module) {
  assert.deepEqual(process.argv.slice(2, 4), [
    'prepare-terraform-fixtures',
    '--output',
  ]);
  assert.equal(process.argv.length, 5);
  const result = prepareTerraformFixtures(process.argv[4]);
  console.log(
    JSON.stringify({
      baselineSha: result.baselineSha,
      roots: result.roots.length,
      credentialsAllowed: false,
    }),
  );
}
