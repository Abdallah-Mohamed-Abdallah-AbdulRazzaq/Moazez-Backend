'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const {
  assertCompleteParity,
  assignTests,
  calculateParity,
  classifyChangedPaths,
  classifyTestFile,
  createCiPlan,
  createShards,
  deriveRequiredDomains,
  discoverTestFiles,
  GITHUB_JOB_OVERHEAD_MINUTES,
  listRepositoryFiles,
  MEDIA_RUNTIME_JEST_FILES,
  resolveGitContext,
  roundRobin,
} = require('../ci/plan-ci.cjs');

const CANDIDATE_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);
const MERGE_BASE_SHA = 'c'.repeat(40);

test('repository inventory combines tracked and untracked nonignored files deterministically', () => {
  const responses = new Map([
    [
      'ls-files --cached -z',
      [
        'src/zeta.spec.ts',
        'README.md',
        'dist/copied.spec.ts',
        'scripts/storage/tests/gcs-batch2-proof-policy.test.cjs',
      ].join('\0') + '\0',
    ],
    [
      'ls-files --others --exclude-standard -z',
      [
        'src/alpha.spec.ts',
        'README.md',
        'node_modules/package/ignored.spec.ts',
      ].join('\0') + '\0',
    ],
  ]);
  const gitRunner = (args) => {
    const key = args.join(' ');
    assert.ok(responses.has(key), `unexpected git command: ${key}`);
    return responses.get(key);
  };

  const repositoryFiles = listRepositoryFiles({
    repositoryRoot: path.parse(process.cwd()).root,
    gitRunner,
  });

  assert.deepEqual(repositoryFiles, [
    'README.md',
    'scripts/storage/tests/gcs-batch2-proof-policy.test.cjs',
    'src/alpha.spec.ts',
    'src/zeta.spec.ts',
  ]);
  assert.deepEqual(discoverTestFiles(repositoryFiles), [
    'scripts/storage/tests/gcs-batch2-proof-policy.test.cjs',
    'src/alpha.spec.ts',
    'src/zeta.spec.ts',
  ]);
});

test('canonical routing preserves every dedicated service and invariant profile', () => {
  const expectedProfiles = new Map([
    ['src/modules/example/example.spec.ts', 'unit'],
    ['src/bootstrap/example.integration.spec.ts', 'source-integration'],
    ['test/security/tenancy.example.spec.ts', 'security'],
    [
      'test/security/tenancy.reinforcement-proof-mime.spec.ts',
      'g06-reinforcement-storage',
    ],
    ['test/app.e2e-spec.ts', 'e2e'],
    ['test/e2e/example.e2e-spec.ts', 'e2e'],
    ['test/integration/example.integration.spec.ts', 'integration-general'],
    [
      'test/integration/learning-media-storage.integration.spec.ts',
      'media-storage',
    ],
    [
      'test/integration/student-lesson-playback.integration.spec.ts',
      'media-storage',
    ],
    [
      'test/integration/reinforcement-proof-persistence.integration.spec.ts',
      'g06-reinforcement-storage',
    ],
    [
      'test/integration/teacher-lifecycle-closeout.integration.spec.ts',
      'teacher-closeout',
    ],
    [
      'test/integration/school-email-delivery-job-id.integration.spec.ts',
      'g05-email-redis',
    ],
    [
      'test/integration/prd3-g02-redis-topology-recovery.integration.spec.ts',
      'prd3-g02',
    ],
    [
      'test/integration/prd3-g03-critical-queue-recovery.integration.spec.ts',
      'prd3-g03',
    ],
    [
      'scripts/tests/check-migration-governance.test.cjs',
      'migration-governance',
    ],
    ['scripts/tests/verify-runtime-policy.test.cjs', 'runtime-governance'],
    ['scripts/tests/plan-ci.test.cjs', 'orchestrator'],
    ['scripts/tests/run-ci-shard.test.cjs', 'orchestrator'],
    ['scripts/tests/aggregate-ci.test.cjs', 'orchestrator'],
    ['scripts/tests/ci-fixture-contract.test.cjs', 'orchestrator'],
    ['scripts/tests/prd3-g01-b3-transaction-pressure.test.cjs', 'prd3-g01'],
    ['scripts/tests/prd3-g01-c-database-privileges.test.cjs', 'prd3-g01'],
    ['scripts/tests/prd3-g04-governed-migration-job.test.cjs', 'prd3-g04'],
    ['scripts/tests/prd3-g05-clean-start.test.cjs', 'prd3-g05'],
    [
      'scripts/tests/prd3-g01-b2-database-recovery.test.cjs',
      'historical-manual',
    ],
  ]);

  for (const [file, profile] of expectedProfiles) {
    assert.equal(classifyTestFile(file).profile, profile, file);
  }
  assert.equal(
    classifyTestFile('scripts/tests/prd3-g01-b2-database-recovery.test.cjs')
      .execution,
    'manual',
  );
});

test('the exact legacy media-test runtime list has one canonical media-storage assignment each', () => {
  const expected = [
    'src/bootstrap/application-lifecycle.state.spec.ts',
    'src/bootstrap/application-startup.spec.ts',
    'src/bootstrap/graceful-shutdown.spec.ts',
    'src/bootstrap/graceful-shutdown.process.spec.ts',
    'src/bootstrap/management-probe.server.spec.ts',
    'src/bootstrap/management-probe.integration.spec.ts',
    'src/bootstrap/management-probe.process.spec.ts',
    'src/bootstrap/http-drain.middleware.spec.ts',
    'src/bootstrap/route-scoped-filter-lifecycle.integration.spec.ts',
    'src/bootstrap/shutdown-http.integration.spec.ts',
    'src/common/exceptions/global-exception.filter.spec.ts',
    'src/infrastructure/queue/bullmq.service.spec.ts',
    'src/infrastructure/storage/tests/minio.adapter.spec.ts',
    'src/infrastructure/storage/tests/storage.service.spec.ts',
    'src/modules/health/bounded-probe-executor.spec.ts',
    'src/modules/health/operational-probe.manifests.spec.ts',
    'src/modules/health/operational-probe.service.spec.ts',
    'src/infrastructure/realtime/tests/realtime-presence.service.spec.ts',
    'src/infrastructure/realtime/tests/realtime-publisher.service.spec.ts',
    'src/infrastructure/realtime/tests/realtime.gateway-redis-lifecycle.spec.ts',
    'src/infrastructure/realtime/tests/realtime-state-store.service.spec.ts',
    'src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts',
    'src/modules/settings/branding/tests/branding-logo-multipart-exception.filter.spec.ts',
    'src/modules/settings/branding/tests/public-school-branding-logo.spec.ts',
    'src/modules/settings/branding/tests/public-school-branding-lifecycle.integration.spec.ts',
    'test/integration/learning-media-verification.integration.spec.ts',
  ];
  const assignments = assignTests([...MEDIA_RUNTIME_JEST_FILES]);
  const plannedFiles = createShards(assignments)
    .filter((shard) => shard.profile === 'media-storage')
    .flatMap((shard) => shard.files);

  assert.deepEqual([...MEDIA_RUNTIME_JEST_FILES], expected);
  assert.equal(assignments.length, expected.length);
  assert.deepEqual([...plannedFiles].sort(), [...expected].sort());
  assert.deepEqual(calculateParity(expected, assignments), {
    missing: [],
    duplicateAssignments: [],
  });
  for (const file of expected) {
    const matches = assignments.filter(
      (assignment) => assignment.file === file,
    );
    assert.equal(matches.length, 1, file);
    assert.equal(matches[0].owner, 'media-storage', file);
    assert.equal(matches[0].profile, 'media-storage', file);
  }
});

test('unknown governed test locations and patterns fail closed', () => {
  assert.throws(
    () => discoverTestFiles(['test/experimental/example.test.ts']),
    /Unknown governed test pattern or location/u,
  );
  assert.throws(
    () => discoverTestFiles(['test/experimental/example.spec.ts']),
    /Test has no canonical owner/u,
  );
  assert.throws(
    () => discoverTestFiles(['scripts/tests/new-certification.test.cjs']),
    /TAP test has no explicit canonical owner/u,
  );
  assert.throws(
    () => discoverTestFiles(['apps/api/example.spec.ts']),
    /Unknown governed test pattern or location/u,
  );
  assert.throws(
    () => discoverTestFiles(['libs/domain/example.test.ts']),
    /Unknown governed test pattern or location/u,
  );
  assert.throws(
    () => discoverTestFiles(['root-level.spec.ts']),
    /Unknown governed test pattern or location/u,
  );
  for (const file of [
    'scripts/tests/new.test.mjs',
    'scripts/tests/new.test.mts',
    'apps/api/new.spec.cts',
    'libs/domain/new.spec.tsx',
    'root-level.test.jsx',
  ]) {
    assert.throws(
      () => discoverTestFiles([file]),
      /Unknown governed test pattern or location/u,
      file,
    );
  }
  assert.deepEqual(
    discoverTestFiles([
      'scripts/storage/tests/gcs-batch2-proof-policy.test.cjs',
    ]),
    ['scripts/storage/tests/gcs-batch2-proof-policy.test.cjs'],
  );
  assert.equal(
    classifyTestFile('scripts/storage/tests/gcs-batch2-proof-policy.test.cjs')
      .execution,
    'manual',
  );
});

test('the live repository test inventory has zero missing or duplicate assignments', () => {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const repositoryFiles = listRepositoryFiles({ repositoryRoot });
  const files = discoverTestFiles(repositoryFiles);
  const assignments = assignTests(files);
  const parity = calculateParity(files, assignments);

  assert.deepEqual(parity, { missing: [], duplicateAssignments: [] });
  assert.doesNotThrow(() => assertCompleteParity(parity));
  assert.ok(files.includes('scripts/tests/plan-ci.test.cjs'));
  assert.equal(assignments.length, files.length);
  assert.ok(
    assignments.some(
      (assignment) =>
        assignment.execution === 'manual' &&
        assignment.owner === 'historical-manual',
    ),
  );
});

test('parity enforcement rejects missing and duplicate canonical ownership', () => {
  const parity = calculateParity(
    ['src/a.spec.ts', 'src/b.spec.ts'],
    [{ file: 'src/a.spec.ts' }, { file: 'src/a.spec.ts' }],
  );

  assert.deepEqual(parity, {
    missing: ['src/b.spec.ts'],
    duplicateAssignments: [{ file: 'src/a.spec.ts', count: 2 }],
  });
  assert.throws(
    () => assertCompleteParity(parity),
    /assignment parity failed/u,
  );
});

test('round-robin sharding is sorted, stable, and independent of input order', () => {
  const files = [
    'src/e.spec.ts',
    'src/c.spec.ts',
    'src/a.spec.ts',
    'src/d.spec.ts',
    'src/b.spec.ts',
  ];
  const expected = [
    ['src/a.spec.ts', 'src/d.spec.ts'],
    ['src/b.spec.ts', 'src/e.spec.ts'],
    ['src/c.spec.ts'],
  ];

  assert.deepEqual(roundRobin(files, 3), expected);
  assert.deepEqual(roundRobin([...files].reverse(), 3), expected);
});

test('fixed regression shard counts and IDs remain stable', () => {
  const files = [
    ...numberedFiles('src/example/unit-', '.spec.ts', 8),
    ...numberedFiles('test/security/tenancy-', '.spec.ts', 6),
    ...numberedFiles('test/e2e/http-', '.e2e-spec.ts', 10),
    ...numberedFiles('test/integration/general-', '.integration.spec.ts', 4),
    'src/bootstrap/runtime.integration.spec.ts',
    'scripts/tests/plan-ci.test.cjs',
  ];
  const forward = createShards(assignTests(files));
  const reverse = createShards(assignTests([...files].reverse()));

  assert.deepEqual(forward, reverse);
  assert.deepEqual(
    forward
      .filter((shard) => shard.profile === 'unit')
      .map((shard) => shard.id),
    ['unit-1-of-4', 'unit-2-of-4', 'unit-3-of-4', 'unit-4-of-4'],
  );
  assert.deepEqual(
    forward
      .filter((shard) => shard.profile === 'security')
      .map((shard) => shard.id),
    ['security-1-of-3', 'security-2-of-3', 'security-3-of-3'],
  );
  assert.deepEqual(
    forward.filter((shard) => shard.profile === 'e2e').map((shard) => shard.id),
    ['e2e-1-of-5', 'e2e-2-of-5', 'e2e-3-of-5', 'e2e-4-of-5', 'e2e-5-of-5'],
  );
  assert.deepEqual(
    forward
      .filter((shard) => shard.profile === 'integration-general')
      .map((shard) => shard.id),
    ['integration-general-1-of-2', 'integration-general-2-of-2'],
  );
  assert.equal(GITHUB_JOB_OVERHEAD_MINUTES, 10);
  for (const shard of forward) {
    assert.equal(
      shard.jobTimeoutMinutes,
      shard.timeoutMinutes + GITHUB_JOB_OVERHEAD_MINUTES,
      shard.id,
    );
  }
});

test('candidate and base must resolve to the exact injected commit SHAs', () => {
  const wrongCandidateRunner = (args) => {
    if (
      args[0] === 'rev-parse' &&
      args.at(-1) === `${CANDIDATE_SHA}^{commit}`
    ) {
      return `${'d'.repeat(40)}\n`;
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };
  assert.throws(
    () =>
      resolveGitContext({
        repositoryRoot: process.cwd(),
        gitRunner: wrongCandidateRunner,
        candidateSha: CANDIDATE_SHA,
        baseSha: BASE_SHA,
        environment: {},
      }),
    /candidateSha .* resolved to a different commit/u,
  );

  const wrongBaseRunner = (args) => {
    if (
      args[0] === 'rev-parse' &&
      args.at(-1) === `${CANDIDATE_SHA}^{commit}`
    ) {
      return `${CANDIDATE_SHA}\n`;
    }
    if (args[0] === 'rev-parse' && args.at(-1) === `${BASE_SHA}^{commit}`) {
      return `${'e'.repeat(40)}\n`;
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };
  assert.throws(
    () =>
      resolveGitContext({
        repositoryRoot: process.cwd(),
        gitRunner: wrongBaseRunner,
        candidateSha: CANDIDATE_SHA,
        baseSha: BASE_SHA,
        environment: {},
      }),
    /baseSha .* resolved to a different commit/u,
  );
});

test('git context records the verified merge-base and sorted changed paths', () => {
  const gitRunner = (args) => {
    if (
      args[0] === 'rev-parse' &&
      args.at(-1) === `${CANDIDATE_SHA}^{commit}`
    ) {
      return `${CANDIDATE_SHA}\n`;
    }
    if (args[0] === 'rev-parse' && args.at(-1) === `${BASE_SHA}^{commit}`) {
      return `${BASE_SHA}\n`;
    }
    if (args[0] === 'merge-base') return `${MERGE_BASE_SHA}\n`;
    if (args[0] === 'diff') {
      return 'src/z.ts\0prisma/schema.prisma\0src/a.ts\0src/z.ts\0';
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };

  assert.deepEqual(
    resolveGitContext({
      repositoryRoot: process.cwd(),
      gitRunner,
      candidateSha: CANDIDATE_SHA,
      baseSha: BASE_SHA,
      environment: {},
    }),
    {
      candidateSha: CANDIDATE_SHA,
      baseSha: BASE_SHA,
      mergeBaseSha: MERGE_BASE_SHA,
      changedPaths: ['prisma/schema.prisma', 'src/a.ts', 'src/z.ts'],
    },
  );
});

test('impact routing is deterministic while full PR regression shards never change', () => {
  const repositoryFiles = [
    ...numberedFiles('src/example/unit-', '.spec.ts', 8),
    ...numberedFiles('test/security/tenancy-', '.spec.ts', 6),
    ...numberedFiles('test/e2e/http-', '.e2e-spec.ts', 10),
    ...numberedFiles('test/integration/general-', '.integration.spec.ts', 4),
    'scripts/tests/plan-ci.test.cjs',
  ];
  const documentationPlan = createCiPlan({
    repositoryFiles,
    gitContext: contextWithChanges(['adr/ADR-9999-example.md']),
  });
  const migrationPlan = createCiPlan({
    repositoryFiles: [...repositoryFiles].reverse(),
    gitContext: contextWithChanges([
      'prisma/migrations/20260811_example/migration.sql',
    ]),
  });

  assert.deepEqual(documentationPlan.categories, ['documentation']);
  assert.deepEqual(documentationPlan.requiredDomains, []);
  assert.deepEqual(migrationPlan.categories, ['database-migration']);
  assert.deepEqual(migrationPlan.requiredDomains, ['migration-integrity']);
  assert.deepEqual(documentationPlan.shards, migrationPlan.shards);
  assert.deepEqual(documentationPlan.parity, {
    missing: [],
    duplicateAssignments: [],
  });
  assert.equal(documentationPlan.schemaVersion, 1);
  assert.deepEqual(Object.keys(documentationPlan.matrices), [
    'unit',
    'service',
    'invariant',
  ]);
});

test('change categories route the required domain checks without path-order effects', () => {
  const changedPaths = [
    'test/security/tenant.spec.ts',
    'src/modules/academics/lesson-content/publication.ts',
    'src/infrastructure/storage/gcs.adapter.ts',
    'src/modules/settings/school-email-delivery.service.ts',
    'prisma/schema.prisma',
  ];
  const categories = classifyChangedPaths([...changedPaths].reverse());

  assert.deepEqual(categories, [
    'database-migration',
    'learning-content',
    'media-storage',
    'school-email',
    'security',
  ]);
  assert.deepEqual(deriveRequiredDomains(categories), [
    'learning-content',
    'media-storage',
    'migration-integrity',
    'school-email-delivery',
    'security',
  ]);
  assert.deepEqual(
    deriveRequiredDomains(classifyChangedPaths(['.github/workflows/ci.yml'])),
    [
      'learning-content',
      'media-storage',
      'migration-integrity',
      'school-email-delivery',
      'security',
    ],
  );
});

test('CLI writes CI_PLAN_PATH and compact GitHub matrices plus counts', (t) => {
  const repository = createGitFixture(t);
  const outputPath = path.join(repository.root, 'artifacts', 'ci-plan.json');
  const githubOutputPath = path.join(
    repository.root,
    'artifacts',
    'github-output.txt',
  );
  const plannerPath = path.resolve(__dirname, '../ci/plan-ci.cjs');

  execFileSync(
    process.execPath,
    [
      plannerPath,
      '--repository-root',
      repository.root,
      '--candidate-sha',
      repository.candidateSha,
      '--base-sha',
      repository.baseSha,
    ],
    {
      cwd: repository.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_PLAN_PATH: outputPath,
        GITHUB_OUTPUT: githubOutputPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  const plan = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const githubOutput = fs.readFileSync(githubOutputPath, 'utf8');
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.candidateSha, repository.candidateSha);
  assert.equal(plan.baseSha, repository.baseSha);
  assert.deepEqual(plan.parity, { missing: [], duplicateAssignments: [] });
  assert.match(githubOutput, /^unit_matrix=\{"include":\[/mu);
  assert.match(githubOutput, /^regression_matrix=\{"include":\[/mu);
  assert.match(githubOutput, /^service_matrix=\{"include":\[/mu);
  assert.match(githubOutput, /^invariant_matrix=\{"include":\[/mu);
  assert.match(githubOutput, /^inventory_count=1$/mu);
  assert.match(githubOutput, /^assignment_count=1$/mu);
});

function numberedFiles(prefix, suffix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}${suffix}`,
  );
}

function contextWithChanges(changedPaths) {
  return {
    candidateSha: CANDIDATE_SHA,
    baseSha: BASE_SHA,
    mergeBaseSha: MERGE_BASE_SHA,
    changedPaths,
  };
}

function createGitFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moazez-ci-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'ci-plan@example.test');
  git(root, 'config', 'user.name', 'CI Plan Test');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n', 'utf8');
  git(root, 'add', 'README.md');
  git(root, 'commit', '--quiet', '-m', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(root, 'src', 'example'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'example', 'fixture.spec.ts'),
    'export {};\n',
    'utf8',
  );
  git(root, 'add', 'src/example/fixture.spec.ts');
  git(root, 'commit', '--quiet', '-m', 'candidate');
  return { root, baseSha, candidateSha: git(root, 'rev-parse', 'HEAD') };
}

function git(repositoryRoot, ...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}
