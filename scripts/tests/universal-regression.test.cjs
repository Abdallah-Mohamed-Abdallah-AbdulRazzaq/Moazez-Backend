'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  ALLOWED_SCOPE_PATHS,
  BASELINE_SHA,
  EXPECTED_BRANCH,
  createFixture,
  deriveExitCode,
  runScopeCheck,
  STATUSES,
} = require('../prd1-g07-universal-regression.cjs');
const {
  createCurrentGateOptions,
  resolveCurrentBase,
} = require('../universal-regression.cjs');

test('historical G07 mode retains its frozen identity and allowlist', () => {
  assert.equal(BASELINE_SHA, 'd9cb589a49dfc920e2118feb618b2b9edac732b9');
  assert.equal(
    EXPECTED_BRANCH,
    'chore/production-readiness-g07-universal-regression',
  );
  assert.ok(ALLOWED_SCOPE_PATHS instanceof Set);
  assert.equal(
    ALLOWED_SCOPE_PATHS.has(
      'src/runtime/core-worker/core-worker-runtime.module.ts',
    ),
    false,
  );
});

test('current mode accepts Phase 2 paths without a historical allowlist', () => {
  const options = createCurrentGateOptions({
    base: 'a'.repeat(40),
    source: 'test',
    event: 'pull_request',
  });

  assert.equal(options.mode, 'current');
  assert.equal(options.expectedBranch, null);
  assert.equal(options.allowedScopePaths, null);
  assert.equal(options.forbidHistoricalSchemaAndLockfileScope, false);
});

test('current mode rejects an invalid comparison base', async () => {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const context = scopeContext(repositoryRoot, 'f'.repeat(40));

  const result = await runScopeCheck(context);

  assert.equal(result.ok, false);
  assert.notEqual(result.exitCode, 0);
});

test('current mode rejects tracked env files without reading their contents', async (t) => {
  const repository = createGitRepository(t);
  fs.writeFileSync(
    path.join(repository.root, '.env.production'),
    'DO_NOT_READ=1\n',
  );
  git(repository.root, 'add', '.env.production');
  git(repository.root, 'commit', '-m', 'track env fixture');

  const result = await runScopeCheck(
    scopeContext(repository.root, repository.base),
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /Tracked env files: \.env\.production/u);
  assert.doesNotMatch(result.error, /DO_NOT_READ/u);
});

test('current mode records changed paths without a phase allowlist', async (t) => {
  const repository = createGitRepository(t);
  const relativePath = 'src/runtime/core-worker/core-worker-runtime.module.ts';
  const absolutePath = path.join(repository.root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, 'export class CoreWorkerRuntimeModule {}\n');
  git(repository.root, 'add', relativePath);
  git(repository.root, 'commit', '-m', 'phase 2 runtime');
  const context = scopeContext(repository.root, repository.base);

  const result = await runScopeCheck(context);

  assert.equal(result.ok, true);
  assert.deepEqual(context.comparison.changedPaths, [relativePath]);
  assert.equal(context.comparison.base, repository.base);
  assert.equal(
    context.comparison.head,
    git(repository.root, 'rev-parse', 'HEAD'),
  );
  assert.equal(context.comparison.event, 'pull_request');
});

test('current base resolution follows GitHub event priority and handles all-zero push bases', (t) => {
  assert.deepEqual(
    resolveCurrentBase({
      environment: {
        GITHUB_EVENT_NAME: 'pull_request',
        REGRESSION_BASE_SHA: '1'.repeat(40),
        REGRESSION_BASE_SOURCE: 'workflow-derived',
      },
      eventPayload: { pull_request: { base: { sha: '2'.repeat(40) } } },
    }),
    {
      base: '1'.repeat(40),
      source: 'workflow-derived',
      event: 'pull_request',
    },
  );

  const repository = createGitRepository(t);
  fs.writeFileSync(path.join(repository.root, 'second.txt'), 'second\n');
  git(repository.root, 'add', 'second.txt');
  git(repository.root, 'commit', '-m', 'second');
  assert.deepEqual(
    resolveCurrentBase({
      environment: { GITHUB_EVENT_NAME: 'push' },
      eventPayload: { before: '0'.repeat(40) },
      repositoryRoot: repository.root,
    }),
    {
      base: repository.base,
      source: 'github.event.before:all-zero-head-parent-fallback',
      event: 'push',
    },
  );
});

test('required current FAIL or BLOCKED results produce non-zero summary semantics', () => {
  assert.equal(
    deriveExitCode([
      { status: STATUSES.PASS, required: true },
      { status: STATUSES.BLOCKED, required: true },
    ]),
    1,
  );
});

test('central CI preserves the blocking identity and runs the current aggregate', () => {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const workflow = fs.readFileSync(
    path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'),
    'utf8',
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );

  assert.match(workflow, /name: Blocking aggregate gate/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /node-version: '22\.23\.1'/u);
  assert.match(workflow, /regression_matrix:/u);
  assert.match(workflow, /node scripts\/ci\/run-ci-shard\.cjs/u);
  assert.match(workflow, /node scripts\/ci\/aggregate-ci\.cjs/u);
  assert.match(workflow, /ci-required-\$\{\{ github\.run_id \}\}/u);
  assert.doesNotMatch(workflow, /run: npm run test:g07/u);
  assert.doesNotMatch(workflow, /run: npm run test:regression/u);
  assert.equal(
    packageJson.scripts['test:g07'],
    'node scripts/prd1-g07-universal-regression.cjs',
  );
  assert.equal(
    packageJson.scripts['test:regression'],
    'node scripts/universal-regression.cjs',
  );
});

function scopeContext(repositoryRoot, base) {
  return {
    repositoryRoot,
    hostEnvironment: process.env,
    fixture: createFixture('current-contract'),
    gate: createCurrentGateOptions({
      base,
      source: 'contract-test',
      event: 'pull_request',
    }),
    comparison: null,
  };
}

function createGitRepository(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'moazez-regression-contract-'),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  git(root, 'config', 'user.email', 'contract@example.test');
  git(root, 'config', 'user.name', 'Regression Contract');
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'baseline');
  return { root, base: git(root, 'rev-parse', 'HEAD') };
}

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
