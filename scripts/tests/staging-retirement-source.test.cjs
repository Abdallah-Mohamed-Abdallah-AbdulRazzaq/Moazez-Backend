'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { execFileSync, spawnSync } = require('node:child_process');
const policy = require('./helpers/staging-retirement-source-policy.cjs');
const planner = require('../ci/plan-ci.cjs');
const {
  BASELINE_SHA,
  RETIREMENT_CLOSEOUT_SHA,
  REPOSITORY_ROOT,
  ACTIONS,
  SELECTORS,
  readHistoricalSource,
  readRetirementCloseoutSource,
  readCurrentSource,
  variableBlock,
} = policy;
const AFFECTED_TEST_FILES = [
  'scripts/deployment-control/tests/runtime-capacity-control.test.cjs',
  'scripts/deployment-control/tests/runtime-release-control.test.cjs',
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
  'src/modules/platform-admin/bootstrap/tests/platform-admin-bootstrap.environment.spec.ts',
  'src/platform-admin-bootstrap.spec.ts',
  'src/reference-data-bootstrap.spec.ts',
];
function git(args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
}
function parsedTests(file, text) {
  const syntax = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result = [];
  function walk(node) {
    if (
      ts.isCallExpression(node) &&
      /^(test|it)(?:$|[.(])/u.test(node.expression.getText(syntax))
    ) {
      const name = node.arguments.find(
        (arg) =>
          ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg),
      );
      const body = node.arguments.find(
        (arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg),
      );
      if (name && body) {
        let assertions = 0;
        function count(child) {
          if (
            ts.isCallExpression(child) &&
            /^(?:assert(?:[A-Z]|[.])|expect\([\s\S]*\)[.])/u.test(
              child.expression.getText(syntax),
            )
          )
            assertions += 1;
          ts.forEachChild(child, count);
        }
        count(body);
        result.push({
          name: name.text,
          assertions,
          call: node.expression.getText(syntax),
        });
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(syntax);
  return result;
}
test('retirement has the exact approved paths and actions, with no implicit scope', () => {
  assert.equal(ACTIONS.REMOVE.length, 71);
  assert.equal(ACTIONS.MODIFY.length, 57);
  assert.equal(
    ACTIONS.MODIFY.filter((file) => file === 'scripts/ci/run-ci-shard.cjs')
      .length,
    1,
  );
  assert.equal(ACTIONS.ADD.length, 6);
  assert.equal(policy.assertApprovedActions(), true);
  assert.equal(
    policy.isStagingRetirementScope([...policy.expectedActions().keys()]),
    true,
  );
  assert.equal(
    policy.isStagingRetirementScope([
      ...policy.expectedActions().keys(),
      'src/main.ts',
    ]),
    false,
  );
  assert.equal(policy.isStagingRetirementScope(ACTIONS.ADD), false);
  for (const file of ACTIONS.REMOVE)
    assert.equal(fs.existsSync(path.join(REPOSITORY_ROOT, file)), false, file);
  assert.equal(
    git(['ls-tree', '-r', '--name-only', BASELINE_SHA]).trim().split(/\r?\n/u)
      .length,
    4098,
  );
});
let fixtureSnapshot;
function ciRuntimeFixture({
  synthetic = false,
  baseSha = RETIREMENT_CLOSEOUT_SHA,
  candidateSha,
  mergeBaseSha = baseSha,
} = {}) {
  if (!fixtureSnapshot) {
    const head = git(['rev-parse', 'HEAD']).trim();
    fixtureSnapshot = {
      head,
      plan: planner.createCiPlan({
        repositoryRoot: REPOSITORY_ROOT,
        candidateSha: head,
        baseSha: RETIREMENT_CLOSEOUT_SHA,
      }),
    };
  }
  const actualHead = fixtureSnapshot.head;
  const headSha = candidateSha ?? actualHead;
  const canonical = structuredClone(fixtureSnapshot.plan);
  Object.assign(canonical, { candidateSha: headSha, baseSha, mergeBaseSha });
  const shard = canonical.shards.find(
    (item) => item.id === 'runtime-governance-1-of-1',
  );
  const environment = {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend',
    GITHUB_REPOSITORY_ID: '1217512033',
    GITHUB_WORKFLOW: 'CI',
    GITHUB_JOB: 'regression',
    GITHUB_RUN_ID: '123456',
    GITHUB_RUN_ATTEMPT: '1',
    CI_CANDIDATE_SHA: headSha,
    CI_BASE_SHA: baseSha,
  };
  const gitCalls = [];
  const gitRunner = synthetic
    ? (args) => {
        gitCalls.push(args);
        if (args.join(' ') === 'rev-parse --verify HEAD^{commit}')
          return headSha;
        if (args[0] === 'rev-parse') {
          const sha = args[2].replace(/\^\{commit\}$/u, '');
          assert.ok(
            [RETIREMENT_CLOSEOUT_SHA, baseSha, headSha, mergeBaseSha].includes(
              sha,
            ),
            'unknown synthetic commit',
          );
          return sha;
        }
        if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
          assert.ok([RETIREMENT_CLOSEOUT_SHA, mergeBaseSha].includes(args[2]));
          assert.ok([baseSha, headSha].includes(args[3]));
          return '';
        }
        assert.deepEqual(args, ['merge-base', baseSha, headSha]);
        return mergeBaseSha;
      }
    : undefined;
  const startedAt = '2026-10-18T23:00:00.000Z';
  const documents = {
    [policy.CI_RUNTIME_PATHS[0]]: structuredClone(canonical),
    [policy.CI_RUNTIME_PATHS[1]]: {
      schemaVersion: 1,
      candidateSha: headSha,
      baseSha,
      jobId: shard.id,
      category: shard.category,
      profile: shard.profile,
      shardIndex: shard.index,
      shardTotal: shard.total,
      testFiles: [...shard.files],
      executedTestFiles: [],
      testFileCount: shard.files.length,
      status: 'RUNNING',
      cleanupStatus: 'PENDING',
      classification: null,
      finishedAt: null,
      testSuiteCount: null,
      testCount: null,
      skippedTestCount: null,
      durationMs: null,
      startedAt,
      stages: [
        {
          id: 'npm-ci',
          status: 'PASS',
          classification: null,
          exitCode: 0,
          timedOut: false,
        },
        {
          id: 'prisma-generate',
          status: 'PASS',
          classification: null,
          exitCode: 0,
          timedOut: false,
        },
        {
          id: 'node-tap',
          status: 'RUNNING',
          classification: null,
          finishedAt: null,
        },
      ],
      runtimeGovernanceDispatch: {
        command: process.execPath,
        args: ['--require', 'ts-node/register', '--test', ...shard.files],
        submittedTestFiles: [...shard.files],
        status: 'SUBMITTED',
      },
    },
  };
  const reads = [];
  return {
    documents,
    reads,
    canonical,
    gitCalls,
    options: {
      untracked: [...policy.CI_RUNTIME_PATHS],
      headSha,
      trackedChanges: [],
      environment,
      workflowIdentity: { ...environment },
      gitRunner,
      stat: () => ({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 100,
      }),
      readJson: (file) => {
        reads.push(file);
        assert.ok(
          Object.hasOwn(documents, file),
          'binary/unexpected file read',
        );
        return documents[file];
      },
      createPlan: (options) => {
        assert.deepEqual(options, { candidateSha: headSha, baseSha });
        return canonical;
      },
    },
  };
}
test('CI runtime ownership requires the canonical exact-head plan and never reads the fixture binary', () => {
  const fixture = ciRuntimeFixture();
  assert.deepEqual(
    policy.classifyCiRuntimeFiles(fixture.options),
    policy.CI_RUNTIME_PATHS,
  );
  assert.deepEqual(fixture.reads, policy.CI_RUNTIME_PATHS.slice(0, 2));
  assert.deepEqual(
    policy.classifyCiRuntimeFiles({ untracked: ACTIONS.ADD }),
    [],
  );
});
test('CI runtime ownership rejects omitted, forged or mismatched provenance before file access', () => {
  const fixture = ciRuntimeFixture();
  for (const key of Object.keys(fixture.options.environment)) {
    for (const value of [undefined, 'wrong']) {
      const options = {
        ...fixture.options,
        environment: { ...fixture.options.environment, [key]: value },
      };
      assert.throws(
        () => policy.classifyCiRuntimeFiles(options),
        undefined,
        key,
      );
    }
  }
  assert.throws(() =>
    policy.classifyCiRuntimeFiles({ ...fixture.options, headSha: 'wrong' }),
  );
  assert.throws(() =>
    policy.classifyCiRuntimeFiles({
      ...fixture.options,
      trackedChanges: ['src/main.ts'],
    }),
  );
  assert.deepEqual(fixture.reads, []);
});
test('CI runtime ownership rejects incomplete files, symlinks, malformed plans and foreign shard evidence', () => {
  const fixture = ciRuntimeFixture();
  for (const file of policy.CI_RUNTIME_PATHS) {
    assert.throws(() =>
      policy.classifyCiRuntimeFiles({
        ...fixture.options,
        untracked: policy.CI_RUNTIME_PATHS.filter((item) => item !== file),
      }),
    );
  }
  for (const stat of [
    () => ({ isFile: () => false, isSymbolicLink: () => false, size: 100 }),
    () => ({ isFile: () => true, isSymbolicLink: () => true, size: 100 }),
    () => ({ isFile: () => true, isSymbolicLink: () => false, size: 0 }),
  ])
    assert.throws(() =>
      policy.classifyCiRuntimeFiles({ ...fixture.options, stat }),
    );
  assert.throws(() =>
    policy.classifyCiRuntimeFiles({
      ...fixture.options,
      readJson: () => JSON.parse('{'),
    }),
  );
  fixture.documents[policy.CI_RUNTIME_PATHS[0]].inventory.active -= 1;
  assert.throws(
    () => policy.classifyCiRuntimeFiles(fixture.options),
    /canonical committed-source plan/u,
  );
  const evidenceFixture = ciRuntimeFixture();
  const evidence = evidenceFixture.documents[policy.CI_RUNTIME_PATHS[1]];
  for (const key of Object.keys(evidence)) {
    const original = evidence[key];
    evidence[key] =
      key === 'executedTestFiles' ? ['foreign.test.cjs'] : undefined;
    assert.throws(
      () => policy.classifyCiRuntimeFiles(evidenceFixture.options),
      undefined,
      key,
    );
    evidence[key] = original;
  }
});
test('CI runtime classification never authorizes tracked artifacts or any extra source path', () => {
  const fixture = ciRuntimeFixture();
  const unexpected = [
    'artifacts/ci/extra.json',
    'artifacts/ci/evidence/foreign.json',
    'artifacts/ci/hidden.test.cjs',
    'src/unapproved.ts',
  ];
  const untracked = [...policy.CI_RUNTIME_PATHS, ...unexpected];
  const runtime = policy.classifyCiRuntimeFiles({
    ...fixture.options,
    untracked,
  });
  assert.deepEqual(
    untracked.filter((file) => !runtime.includes(file)),
    unexpected,
  );
  for (const file of [...policy.CI_RUNTIME_PATHS, ...unexpected]) {
    assert.throws(
      () =>
        policy.assertApprovedActions([{ action: 'A', file }], {
          complete: false,
        }),
      /unapproved path\/action/u,
    );
    assert.throws(() =>
      policy.classifyCiRuntimeFiles({
        ...fixture.options,
        trackedChanges: [file],
      }),
    );
  }
});
test('historical retirement range resolves immutable commits and retains exactly 71/57/6 actions', () => {
  assert.equal(BASELINE_SHA, '8449769bcb453dd3ac8436d2b71c133e6369f6fa');
  assert.equal(
    RETIREMENT_CLOSEOUT_SHA,
    '35428c6c35d3035b7c410c4472de6a930d31f4f0',
  );
  for (const commit of [BASELINE_SHA, RETIREMENT_CLOSEOUT_SHA]) {
    assert.equal(
      git(['rev-parse', '--verify', commit + '^{commit}']).trim(),
      commit,
    );
  }
  git(['merge-base', '--is-ancestor', BASELINE_SHA, RETIREMENT_CLOSEOUT_SHA]);
  git(['merge-base', '--is-ancestor', RETIREMENT_CLOSEOUT_SHA, 'HEAD']);
  const changes = policy.historicalChanges();
  assert.deepEqual(
    changes.reduce(
      (counts, entry) => ({
        ...counts,
        [entry.action]: counts[entry.action] + 1,
      }),
      { D: 0, M: 0, A: 0 },
    ),
    { D: 71, M: 57, A: 6 },
  );
  assert.equal(policy.assertApprovedActions(changes), true);
});
test('historical retirement rejects every extra missing wrong-action and duplicate source path', () => {
  const changes = policy.historicalChanges();
  assert.throws(
    () =>
      policy.assertApprovedActions([
        ...changes,
        { action: 'A', file: 'src/unapproved.ts' },
      ]),
    /unapproved path\/action/u,
  );
  for (let index = 0; index < changes.length; index += 1) {
    assert.throws(
      () => policy.assertApprovedActions(changes.filter((_, i) => i !== index)),
      /every approved change/u,
    );
    const altered = changes.map((entry, i) =>
      i === index
        ? { ...entry, action: entry.action === 'D' ? 'A' : 'D' }
        : entry,
    );
    assert.throws(
      () => policy.assertApprovedActions(altered),
      /unapproved path\/action/u,
    );
    assert.throws(
      () => policy.assertApprovedActions([...changes, changes[index]]),
      /duplicate candidate path/u,
    );
  }
});
test('current changes expose the actual merge-base range without contaminating retirement history', () => {
  const context = policy.currentGitContext();
  const tracked = git([
    'diff',
    '--name-status',
    '--no-renames',
    context.mergeBaseSha,
    '--',
  ])
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [action, file] = line.split('\t');
      return { action, file };
    });
  const current = policy.currentChanges();
  assert.deepEqual(
    current.filter((entry) => tracked.some((item) => item.file === entry.file)),
    tracked,
  );
  const historicalBefore = policy.historicalChanges();
  const timetable = git([
    'diff',
    '--name-only',
    RETIREMENT_CLOSEOUT_SHA,
    '96e78c4bc48340a7a0521762534c258f8580a721',
    '--',
  ])
    .trim()
    .split(/\r?\n/u);
  assert.equal(timetable.length, 7);
  assert.ok(
    timetable.every(
      (file) => !historicalBefore.some((entry) => entry.file === file),
    ),
  );
  assert.equal(policy.isStagingRetirementScope(timetable), false);
  assert.equal(
    policy.isStagingRetirementScope([
      ...historicalBefore.map((entry) => entry.file),
      ...timetable,
    ]),
    false,
  );
  assert.deepEqual(policy.historicalChanges(), historicalBefore);
  for (const file of ['artifacts/ci/extra.json', 'src/unapproved.ts']) {
    assert.throws(
      () =>
        policy.assertApprovedActions([
          ...historicalBefore,
          { action: 'A', file },
        ]),
      /unapproved path\/action/u,
    );
  }
});
test('current CI supports the approved TT101 range and a later divergent base through verified Git context', () => {
  for (const options of [
    {
      synthetic: true,
      baseSha: RETIREMENT_CLOSEOUT_SHA,
      candidateSha: '96e78c4bc48340a7a0521762534c258f8580a721',
    },
    {
      synthetic: true,
      baseSha: 'b'.repeat(40),
      candidateSha: 'c'.repeat(40),
      mergeBaseSha: 'a'.repeat(40),
    },
  ]) {
    const fixture = ciRuntimeFixture(options);
    assert.deepEqual(
      policy.classifyCiRuntimeFiles(fixture.options),
      policy.CI_RUNTIME_PATHS,
    );
    assert.ok(
      fixture.gitCalls.some(
        (args) =>
          args.join(' ') ===
          'merge-base ' + options.baseSha + ' ' + options.candidateSha,
      ),
    );
    for (const sha of [
      options.baseSha,
      options.candidateSha,
      options.mergeBaseSha ?? options.baseSha,
    ]) {
      assert.ok(
        fixture.gitCalls.some(
          (args) =>
            args.join(' ') === 'rev-parse --verify ' + sha + '^{commit}',
        ),
      );
    }
  }
});
test('current CI rejects forged HEAD unresolved commit identities and invalid ancestry', () => {
  const fixture = ciRuntimeFixture({
    synthetic: true,
    baseSha: 'b'.repeat(40),
    candidateSha: 'c'.repeat(40),
    mergeBaseSha: 'a'.repeat(40),
  });
  const validGit = fixture.options.gitRunner;
  for (const gitRunner of [
    (args) =>
      args.join(' ') === 'rev-parse --verify HEAD^{commit}'
        ? 'd'.repeat(40)
        : validGit(args),
    (args) =>
      args.join(' ') === 'rev-parse --verify ' + 'b'.repeat(40) + '^{commit}'
        ? 'd'.repeat(40)
        : validGit(args),
    (args) => {
      if (args[0] === 'rev-parse' && args[2] !== 'HEAD^{commit}')
        throw new Error('unknown commit');
      return validGit(args);
    },
    (args) => {
      if (args[1] === '--is-ancestor') throw new Error('invalid ancestry');
      return validGit(args);
    },
    (args) =>
      args[0] === 'merge-base' && args[1] !== '--is-ancestor'
        ? 'bad-merge-base'
        : validGit(args),
  ])
    assert.throws(() =>
      policy.classifyCiRuntimeFiles({ ...fixture.options, gitRunner }),
    );
  assert.deepEqual(fixture.reads, []);
});
test('current CI rejects complete but foreign base candidate merge-base and run identities', () => {
  for (const field of ['baseSha', 'candidateSha', 'mergeBaseSha']) {
    const fixture = ciRuntimeFixture();
    fixture.documents[policy.CI_RUNTIME_PATHS[0]][field] = 'd'.repeat(40);
    assert.throws(
      () => policy.classifyCiRuntimeFiles(fixture.options),
      /Git identity mismatch/u,
    );
  }
  for (const field of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) {
    const fixture = ciRuntimeFixture();
    fixture.options.environment[field] = '999999';
    assert.throws(
      () => policy.classifyCiRuntimeFiles(fixture.options),
      /foreign CI run\/attempt/u,
    );
    assert.deepEqual(fixture.reads, []);
  }
  for (const field of ['CI_BASE_SHA', 'CI_CANDIDATE_SHA']) {
    for (const value of [
      undefined,
      '',
      'HEAD',
      'a'.repeat(39),
      'a'.repeat(41),
      'A'.repeat(40),
      'd'.repeat(40),
    ]) {
      const fixture = ciRuntimeFixture();
      fixture.options.environment[field] = value;
      assert.throws(
        () => policy.classifyCiRuntimeFiles(fixture.options),
        undefined,
        field + ':' + value,
      );
    }
  }
});
test('current CI rejects mutated canonical plans and missing duplicate or foreign ownership', () => {
  const mutations = [
    (plan) => {
      plan.inventory.active -= 1;
    },
    (plan) => {
      plan.changedPaths.push('src/forged.ts');
    },
    (plan) => {
      plan.shards = plan.shards.filter(
        (shard) => shard.profile !== 'runtime-governance',
      );
    },
    (plan) => {
      plan.shards
        .find((shard) => shard.profile === 'runtime-governance')
        .files.pop();
    },
    (plan) => {
      plan.assignments.find(
        (item) => item.profile === 'runtime-governance',
      ).owner = 'foreign';
    },
    (plan) => {
      plan.assignments.find(
        (item) => item.profile === 'runtime-governance',
      ).execution = 'manual';
    },
    (plan) => {
      const shard = plan.shards.find(
        (item) => item.profile === 'runtime-governance',
      );
      shard.files.push(shard.files[0]);
    },
  ];
  for (const mutate of mutations) {
    const fixture = ciRuntimeFixture();
    mutate(fixture.documents[policy.CI_RUNTIME_PATHS[0]]);
    assert.throws(
      () => policy.classifyCiRuntimeFiles(fixture.options),
      /canonical committed-source plan/u,
    );
  }
});
test('runtime evidence cannot assert PASS or forge run shard inventory counts or actual dispatch', () => {
  const mutations = [
    (e) => {
      e.baseSha = BASELINE_SHA;
    },
    (e) => {
      e.candidateSha = 'd'.repeat(40);
    },
    (e) => {
      e.runId = 'foreign';
    },
    (e) => {
      e.runAttempt = 2;
    },
    (e) => {
      e.jobId = 'foreign';
    },
    (e) => {
      e.shardIndex += 1;
    },
    (e) => {
      e.status = 'PASS';
    },
    (e) => {
      e.cleanupStatus = 'PASS';
    },
    (e) => {
      e.executedTestFiles = [...e.testFiles];
    },
    (e) => {
      e.testFiles.reverse();
    },
    (e) => {
      e.testFileCount -= 1;
    },
    (e) => {
      e.testCount = 1;
    },
    (e) => {
      e.stages = [];
    },
    (e) => {
      e.stages[0].exitCode = 1;
    },
    (e) => {
      e.stages[1].timedOut = true;
    },
    (e) => {
      e.stages[2].status = 'PASS';
    },
    (e) => {
      e.runtimeGovernanceDispatch.submittedTestFiles.pop();
    },
    (e) => {
      e.runtimeGovernanceDispatch.args.splice(0, 1);
    },
    (e) => {
      e.runtimeGovernanceDispatch.command = '/foreign/node';
    },
    (e) => {
      e.runtimeGovernanceDispatch.status = 'PASS';
    },
    (e) => {
      e.startedAt = 'invalid';
    },
  ];
  for (const mutate of mutations) {
    const fixture = ciRuntimeFixture();
    mutate(fixture.documents[policy.CI_RUNTIME_PATHS[1]]);
    assert.throws(() => policy.classifyCiRuntimeFiles(fixture.options));
  }
  const duplicate = ciRuntimeFixture();
  duplicate.options.untracked.push(policy.CI_RUNTIME_PATHS[0]);
  assert.throws(
    () => policy.classifyCiRuntimeFiles(duplicate.options),
    /duplicate untracked/u,
  );
});
test('current-source Production data protection remains active independently of historical parity', () => {
  const current = JSON.parse(
    readCurrentSource('config/deployment/production-data-branch.contract.json'),
  );
  assert.equal(current.branch, 'IN_PLACE_LIVE_PRODUCTION');
  assert.equal(current.preserveExistingPostgresqlData, true);
  assert.equal(current.preserveExistingObjectData, true);
  assert.equal(current.objectCopyOrReseed, false);
  assert.equal(current.plannedDestructiveCutover, false);
  for (const file of ACTIONS.REMOVE)
    assert.equal(fs.existsSync(path.join(REPOSITORY_ROOT, file)), false, file);
});
test('all eleven selectors fail closed and all other shared Terraform inputs remain equivalent', () => {
  assert.equal(SELECTORS.length, 11);
  for (const { path: file, selector } of SELECTORS) {
    const current = readCurrentSource(file);
    const baseline = readHistoricalSource(file);
    const selectorCurrent = variableBlock(current, selector);
    assert.match(selectorCurrent, /nullable\s*=\s*false/u);
    assert.doesNotMatch(selectorCurrent, /\bdefault\s*=/u);
    assert.match(
      selectorCurrent,
      new RegExp(
        'condition\\s*=\\s*var\\.' + selector + '\\s*==\\s*"production"',
        'u',
      ),
    );
    if (
      file !==
      'infra/gcp/backend-runtime/modules/runtime-environment/variables.tf'
    ) {
      assert.match(
        variableBlock(current, 'project_id'),
        /var\.project_id\s*!=\s*"moazez-nonprod-91001421934"/u,
      );
    } else {
      assert.doesNotMatch(current, /^variable\s+"project_id"/mu);
      const mainPath =
        'infra/gcp/backend-runtime/modules/runtime-environment/main.tf';
      const main = readCurrentSource(mainPath);
      assert.equal(main, readHistoricalSource(mainPath));
      assert.match(
        main,
        /selected\s*=\s*local\.approved_environment\[var\.environment\]/u,
      );
      assert.match(
        main,
        /production\s*=\s*\{\s*project_id\s*=\s*"moazez-production"/u,
      );
      assert.equal(
        [...main.matchAll(/project\s*=\s*local\.selected\.project_id/gu)]
          .length,
        4,
      );
      assert.match(
        readCurrentSource(
          'infra/gcp/backend-runtime/environments/production/runtime/main.tf',
        ),
        /environment\s*=\s*"production"/u,
      );
      assert.equal(
        readCurrentSource(
          'infra/gcp/backend-runtime/modules/runtime-environment/outputs.tf',
        ),
        readHistoricalSource(
          'infra/gcp/backend-runtime/modules/runtime-environment/outputs.tf',
        ),
      );
    }
    const removeApprovedGuards = (text, candidate) => {
      let normalized = text.replace(
        variableBlock(text, selector),
        'APPROVED_SELECTOR',
      );
      if (candidate)
        normalized = normalized.replace(
          /\s*validation\s*\{\s*condition\s*=\s*var\.project_id\s*!=\s*"moazez-nonprod-91001421934"\s*error_message\s*=\s*"[^"]*"\s*\}/u,
          '',
        );
      return normalized.replace(/\s/gu, '');
    };
    assert.equal(
      removeApprovedGuards(current, true),
      removeApprovedGuards(baseline, false),
      file,
    );
  }
});
test('Production roots, shared resource bodies, identities, locks, images, APIs and data contracts are unchanged', () => {
  const preservedChanges = policy
    .historicalChanges()
    .filter(
      ({ file }) => !Object.values(ACTIONS).some((list) => list.includes(file)),
    );
  assert.deepEqual(preservedChanges, []);
  const protectedFiles = git(['ls-tree', '-r', '--name-only', BASELINE_SHA])
    .trim()
    .split(/\r?\n/u)
    .filter(
      (file) =>
        file.includes('/environments/production/') ||
        /^infra\/gcp\/.+\/modules\/.+\/(?:main|locals|outputs|versions)\.tf$/u.test(
          file,
        ) ||
        file.startsWith('prisma/') ||
        [
          'adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md',
          'config/deployment/production-data-branch.contract.json',
          'config/deployment/release-sequence.contract.json',
          '.github/workflows/ci.yml',
          '.github/workflows/production-backend-image.yml',
          '.github/workflows/phase-3-production-readiness.yml',
          'src/config/env.validation.ts',
          'src/bootstrap/application-cors.policy.ts',
        ].includes(file),
    );
  assert.equal(
    protectedFiles.filter((file) => file.includes('/environments/production/'))
      .length,
    79,
  );
  assert.equal(
    protectedFiles.filter(
      (file) =>
        file.includes('/environments/production/') &&
        file.endsWith('.terraform.lock.hcl'),
    ).length,
    12,
  );
  for (const file of protectedFiles)
    assert.equal(
      readRetirementCloseoutSource(file),
      readHistoricalSource(file),
      file,
    );
  const contract = JSON.parse(
    readRetirementCloseoutSource(
      'config/deployment/production-data-branch.contract.json',
    ),
  );
  assert.equal(contract.branch, 'IN_PLACE_LIVE_PRODUCTION');
  assert.equal(contract.preserveExistingPostgresqlData, true);
  assert.equal(contract.preserveExistingObjectData, true);
  assert.equal(contract.objectCopyOrReseed, false);
  assert.equal(contract.plannedDestructiveCutover, false);
});
test('B001-C01 legacy path contains only explanatory comments and one literal terminating throw', () => {
  const file = 'scripts/storage/gcs-batch2-readonly-proof.ps1';
  const text = readCurrentSource(file);
  assert.doesNotMatch(text, /^\s*#requires\b/imu);
  assert.equal(
    text
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .join('\n')
      .trim(),
    "throw 'LEGACY_STORAGE_PROOF_RETIRED'",
  );
  const host = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const quoted = path.join(REPOSITORY_ROOT, file).replace(/'/gu, "''");
  const parse =
    String.raw`& { $tokens = $null; $errors = $null; $ast = [System.Management.Automation.Language.Parser]::ParseFile('__PATH__', [ref]$tokens, [ref]$errors); if ($errors.Count -or $null -ne $ast.ParamBlock -or $null -ne $ast.BeginBlock -or $null -ne $ast.ProcessBlock -or $ast.EndBlock.Statements.Count -ne 1 -or $ast.EndBlock.Statements[0] -isnot [System.Management.Automation.Language.ThrowStatementAst]) { throw 'legacy_refusal_ast_invalid' }; 'AST_PASS' }`.replace(
      '__PATH__',
      quoted,
    );
  const result = spawnSync(
    host,
    ['-NoProfile', '-NonInteractive', '-Command', parse],
    { encoding: 'utf8', timeout: 10000, windowsHide: true, input: '' },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(result.stdout.trim(), 'AST_PASS');
  const historical = readHistoricalSource(file);
  assert.match(historical, /production_bucket_not_clean_start/u);
  assert.match(historical, /productionZeroObjectEvidence/u);
});
test('all 401 reviewed baseline blocks and their assertion populations remain enforceable', () => {
  let total = 0;
  let assertions = 0;
  for (const file of AFFECTED_TEST_FILES) {
    const before = parsedTests(file, readHistoricalSource(file));
    const after = parsedTests(file, readCurrentSource(file));
    for (const old of before) {
      const matches = after.filter((entry) => entry.name === old.name);
      assert.equal(matches.length, 1, file + ': ' + old.name);
      assert.ok(
        matches[0].assertions >= old.assertions,
        'lost assertion obligation: ' + file + ': ' + old.name,
      );
      assert.doesNotMatch(matches[0].call, /\.(?:skip|todo|only)\b/u);
      total += 1;
      assertions += old.assertions;
    }
  }
  assert.equal(total, 401);
  assert.equal(assertions, 2373);
});
test('CI retains baseline retirement owners and includes the four ST-03 regression files', () => {
  const assignments = planner.assignTests(
    planner.discoverTestFiles(
      planner.listRepositoryFiles({ repositoryRoot: REPOSITORY_ROOT }),
    ),
  );
  const st08bFiles = [
    ['src/modules/grades/assessments/tests/grade-rich-content.spec.ts', 'unit'],
    [
      'test/integration/grade-rich-content.integration.spec.ts',
      'integration-general',
    ],
    ['test/e2e/grade-rich-content.e2e-spec.ts', 'e2e'],
  ];
  const st08cFiles = [
    ['src/modules/homework/tests/homework-rich-content.spec.ts', 'unit'],
    [
      'test/integration/homework-rich-content.integration.spec.ts',
      'integration-general',
    ],
    ['test/e2e/homework-rich-content.e2e-spec.ts', 'e2e'],
    ['test/security/tenancy.homework-rich-content.spec.ts', 'security'],
  ];
  // ST09-A adds foundation coverage without changing the canonical planner,
  // historical exclusions or any existing retirement-owner obligations.
  const st09aFiles = [
    ['src/modules/homework/domain/homework-typed-foundation.spec.ts', 'unit'],
    [
      'test/integration/homework-typed-foundation.integration.spec.ts',
      'integration-general',
    ],
    ['test/e2e/homework-typed-foundation.e2e-spec.ts', 'e2e'],
  ];
  const st09bcFiles = [
    ['src/modules/homework/tests/homework-typed-runtime.spec.ts', 'unit'],
    ['test/e2e/st09bc-homework-authoring.e2e-spec.ts', 'e2e'],
    ['test/e2e/homework-eight-type-runtime.e2e-spec.ts', 'e2e'],
    ['test/e2e/homework-eight-type-concurrency.e2e-spec.ts', 'e2e'],
    ['scripts/tests/st09bc-homework-transaction-boundaries.test.cjs', 'runtime-governance'],
  ];
  const st10aFiles = [
    ['src/common/question-evaluation/ordering.spec.ts', 'unit'],
    ['src/common/question-evaluation/numeric.spec.ts', 'unit'],
    ['src/common/question-evaluation/math-expression.spec.ts', 'unit'],
    ['src/common/question-evaluation/strict-data.spec.ts', 'unit'],
    ['src/modules/grades/assessments/tests/grade-runtime-types.spec.ts', 'unit'],
    ['test/integration/st10a-question-enum-boundary.integration.spec.ts', 'integration-general'],
    ['test/security/st10a-inactive-question-types.security.spec.ts', 'security'],
  ];
  const st10bFiles = [
    ['src/modules/homework/tests/homework-st10b-adapters.spec.ts', 'unit'],
    ['src/modules/grades/assessments/tests/grade-st10b-adapters.spec.ts', 'unit'],
    ['test/e2e/st10b-authoring-publication.e2e-spec.ts', 'e2e'],
    ['test/e2e/st10b-student-review.e2e-spec.ts', 'e2e'],
    ['test/e2e/st10b-concurrency.e2e-spec.ts', 'e2e'],
    ['test/e2e/st10b-eleven-type-runtime.e2e-spec.ts', 'e2e'],
  ];
  const st11aFiles = [
    ['src/common/assessment-answer/response-config.spec.ts','unit'],
    ['test/integration/learning-media-st11-answer-audio.integration.spec.ts','media-storage'],
    ['test/integration/st11-answer-media-integrity.integration.spec.ts','integration-general'],
    ['test/integration/st11-legacy-migration.integration.spec.ts','integration-general'],
    ['test/e2e/st11-answer-media.e2e-spec.ts','e2e'],
    ['test/e2e/st11-answer-media-security.e2e-spec.ts','e2e'],
    ['test/e2e/st11-response-authoring.e2e-spec.ts','e2e'],
    ['test/e2e/st11-response-modalities.e2e-spec.ts','e2e'],
    ['test/e2e/st11-answer-manual-review.e2e-spec.ts','e2e'],
  ];
  assert.equal(
    assignments.length,
    1019 + st08bFiles.length + st08cFiles.length + st09aFiles.length + st09bcFiles.length + st10aFiles.length + st10bFiles.length + st11aFiles.length,
  );
  assert.equal(
    assignments.filter((item) => item.execution === 'manual').length,
    10,
  );
  assert.equal(
    assignments.filter((item) => item.execution !== 'manual').length,
    1009 + st08bFiles.length + st08cFiles.length + st09aFiles.length + st09bcFiles.length + st10aFiles.length + st10bFiles.length + st11aFiles.length,
  );
  for (const [file, profile] of [
    ['src/common/rich-content/rich-content.spec.ts', 'unit'],
    [
      'test/integration/safe-rich-content-persistence.integration.spec.ts',
      'integration-general',
    ],
    ...st08bFiles,
    ...st08cFiles,
    ...st09aFiles,
    ...st09bcFiles,
    ...st10aFiles,
    ...st10bFiles,
    ...st11aFiles,
  ]) {
    const matches = assignments.filter((item) => item.file === file);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].profile, profile);
    assert.equal(matches[0].execution, 'pull-request');
  }
  assert.deepEqual(
    planner.ACTIVE_TAP_OWNERS[
      'scripts/tests/staging-retirement-source.test.cjs'
    ],
    {
      owner: 'staging-retirement-source-governance',
      profile: 'runtime-governance',
    },
  );
  assert.deepEqual(
    planner.ACTIVE_TAP_OWNERS[
      'scripts/deployment-control/tests/staging-retirement-control.test.cjs'
    ],
    {
      owner: 'staging-retirement-operational-governance',
      profile: 'runtime-governance',
    },
  );
  let restoredPlanner = readCurrentSource('scripts/ci/plan-ci.cjs');
  const st11AudioOwner = "  'test/integration/learning-media-st11-answer-audio.integration.spec.ts',\n";
  assert.equal(restoredPlanner.split(st11AudioOwner).length, 2);
  restoredPlanner = restoredPlanner.replace(st11AudioOwner, '');
  const st09bcOwner = "  'scripts/tests/st09bc-homework-transaction-boundaries.test.cjs': Object.freeze({\n" +
    "    owner: 'st09bc-homework-transaction-boundaries',\n" +
    "    profile: 'runtime-governance',\n" +
    "  }),\n";
  assert.equal(restoredPlanner.split(st09bcOwner).length, 2);
  assert.deepEqual(planner.ACTIVE_TAP_OWNERS['scripts/tests/st09bc-homework-transaction-boundaries.test.cjs'], {
    owner: 'st09bc-homework-transaction-boundaries', profile: 'runtime-governance',
  });
  restoredPlanner = restoredPlanner.replace(st09bcOwner, '');
  for (const file of ACTIONS.ADD.filter((item) => item.endsWith('.test.cjs'))) {
    const escaped = file.replace(/[.*+?^$(){}|[\]\\]/gu, '\\$&');
    restoredPlanner = restoredPlanner.replace(
      new RegExp(
        "  '" + escaped + "': Object\\.freeze\\(\\{[\\s\\S]*?\\}\\),\\n",
        'u',
      ),
      '',
    );
  }
  assert.equal(restoredPlanner, readHistoricalSource('scripts/ci/plan-ci.cjs'));
});
test('historical helpers never become an operational import or a current authority fallback', () => {
  const files = git(['ls-files'])
    .trim()
    .split(/\r?\n/u)
    .filter(
      (file) =>
        /\.(?:cjs|ts)$/u.test(file) &&
        !file.includes('/tests/') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('.test.cjs'),
    );
  for (const file of files)
    assert.doesNotMatch(
      readCurrentSource(file),
      /staging-retirement-source-policy/u,
      file,
    );
  for (const file of [
    'README.md',
    'infra/gcp/storage/README.md',
    'adr/ADR-0016-staging-retirement-and-production-preservation.md',
  ]) {
    const text = readCurrentSource(file);
    assert.match(text, /LEGACY_STORAGE_PROOF_RETIRED/u);
    assert.match(text, /IN_PLACE_LIVE_PRODUCTION/u);
    assert.match(text, /historical/iu);
    assert.match(text, /limited read-only/iu);
    assert.match(text, /IAM\/CORS/u);
  }
});
