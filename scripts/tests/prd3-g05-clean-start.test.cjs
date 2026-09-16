'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  BASE_SHA,
  CURRENT_CI_SKIPPED_TEST_COUNT,
  EXPECTED_CHANGED_PATHS,
  FOCUSED_TEST_COUNT,
  VERIFICATION_MODES,
  command,
  focusedTestEnvironment,
  governedMigrationFailure,
  governedMigrationFailureCode,
  inspectRepositoryState,
  resolveVerificationMode,
  runGovernedFreshMigration,
  validateCurrentProductionDataAuthority,
  validateRepositoryState,
} = require('../ci/prd3-g05-clean-start.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const historicalTest = process.env.PRD3_CURRENT_CI === '1' ? test.skip : test;
const MAINTENANCE_CHANGED_PATHS = Object.freeze([
  'scripts/ci/prd3-g01-c-database-privileges.cjs',
  'scripts/tests/prd3-g01-c-database-privileges.test.cjs',
  'scripts/ci/prd3-g04-governed-migration-job.cjs',
  'scripts/tests/prd3-g04-governed-migration-job.test.cjs',
  'scripts/ci/prd3-g05-clean-start.cjs',
  'scripts/tests/prd3-g05-clean-start.test.cjs',
]);

function repositoryPath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function read(relativePath) {
  return fs.readFileSync(repositoryPath(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function git(args, options = {}) {
  return spawnSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function repositoryState(overrides = {}) {
  return {
    branch: 'chore/production-readiness-3-cloud-sql',
    head: 'd5983578be2007b8378de4818a1f96446e9e9c1e',
    nodeVersion: 'v22.23.1',
    nodeDirectory:
      'C:\\Users\\Abdal\\AppData\\Local\\Moazez\\toolchains\\node-v22.23.1-win-x64',
    platform: 'win32',
    indexClean: true,
    changedPaths: [...MAINTENANCE_CHANGED_PATHS],
    historicalBaseIsAncestor: true,
    dependencyChanged: false,
    devDependencyChanged: false,
    ...overrides,
  };
}

historicalTest(
  'G05 historical candidate contract retains its exact baseline and ten paths',
  () => {
    assert.equal(BASE_SHA, '10be00c51eba72bbdfe9591eb0e00399402100ef');
    assert.deepEqual(EXPECTED_CHANGED_PATHS, [
      'adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md',
      'config/deployment/production-data-branch.contract.json',
      'config/deployment/production-seed-inventory.json',
      'docs/production-readiness/phase-0/02-production-decision-register.md',
      'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
      'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
      'docs/production-readiness/phase-3/08-clean-start-production-data-evidence.md',
      'package.json',
      'scripts/ci/prd3-g05-clean-start.cjs',
      'scripts/tests/prd3-g05-clean-start.test.cjs',
    ]);
    assert.equal(
      validateRepositoryState(
        repositoryState({
          head: BASE_SHA,
          changedPaths: [...EXPECTED_CHANGED_PATHS],
        }),
        VERIFICATION_MODES.CANDIDATE,
      ),
      true,
    );
    assert.throws(() =>
      validateRepositoryState(repositoryState(), VERIFICATION_MODES.CANDIDATE),
    );
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({
          head: BASE_SHA,
          changedPaths: EXPECTED_CHANGED_PATHS.slice(1),
        }),
        VERIFICATION_MODES.CANDIDATE,
      ),
    );
    for (const override of [
      {
        branch: 'main',
        head: BASE_SHA,
        changedPaths: [...EXPECTED_CHANGED_PATHS],
      },
      {
        nodeVersion: 'v22.22.0',
        head: BASE_SHA,
        changedPaths: [...EXPECTED_CHANGED_PATHS],
      },
      {
        nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
        head: BASE_SHA,
        changedPaths: [...EXPECTED_CHANGED_PATHS],
      },
    ]) {
      assert.throws(() =>
        validateRepositoryState(
          repositoryState(override),
          VERIFICATION_MODES.CANDIDATE,
        ),
      );
    }
  },
);

test('G05 verification mode parsing preserves historical modes and adds current CI', () => {
  assert.equal(resolveVerificationMode([]), VERIFICATION_MODES.CANDIDATE);
  assert.equal(
    resolveVerificationMode(['--regression']),
    VERIFICATION_MODES.REGRESSION,
  );
  assert.equal(
    resolveVerificationMode(['--current-ci']),
    VERIFICATION_MODES.CURRENT_CI,
  );
  for (const option of [
    '--skip-preflight',
    '--force',
    '--current',
    '--ignore-scope',
    '--anything-else',
  ]) {
    assert.throws(
      () => resolveVerificationMode([option]),
      /unknown verification mode/u,
    );
  }
  assert.throws(() => resolveVerificationMode(['--regression', '--force']));
});

test('G05 current CI mode runs disposable migration behavior without historical Git snapshots', () => {
  const harnessSource = read('scripts/ci/prd3-g05-clean-start.cjs');
  assert.equal(
    validateRepositoryState(
      repositoryState({
        branch: 'feature/current-ci',
        head: 'f'.repeat(40),
        nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
        platform: 'linux',
        changedPaths: [
          '.github/workflows/ci.yml',
          'adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md',
          'package.json',
        ],
        historicalBaseIsAncestor: false,
        dependencyChanged: true,
        devDependencyChanged: true,
      }),
      VERIFICATION_MODES.CURRENT_CI,
    ),
    true,
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ indexClean: false }),
      VERIFICATION_MODES.CURRENT_CI,
    ),
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ nodeVersion: 'v22.22.0' }),
      VERIFICATION_MODES.CURRENT_CI,
    ),
  );
  const environment = {
    SENTINEL: 'preserved',
    PRD3_CURRENT_CI: 'ambient-value',
  };
  assert.deepEqual(
    focusedTestEnvironment(VERIFICATION_MODES.CURRENT_CI, environment),
    {
      SENTINEL: 'preserved',
      PRD3_CURRENT_CI: '1',
    },
  );
  assert.deepEqual(
    focusedTestEnvironment(VERIFICATION_MODES.REGRESSION, environment),
    {
      SENTINEL: 'preserved',
    },
  );
  assert.deepEqual(
    Object.keys(inspectRepositoryState(VERIFICATION_MODES.CURRENT_CI)).sort(),
    ['indexClean', 'nodeDirectory', 'nodeVersion', 'platform'],
  );
  assert.equal(FOCUSED_TEST_COUNT, 22);
  assert.equal(CURRENT_CI_SKIPPED_TEST_COUNT, 8);
  assert.match(
    harnessSource,
    /resolveCiParentRunId\(\s*process\.env\.MOAZEZ_CI_PARENT_RUN_ID/u,
  );
  assert.match(
    harnessSource,
    /const RUN_LABEL = 'com\.moazez\.prd3-g05\.run'/u,
  );
});

test('bounded command retains child output on failure and preserves success results', () => {
  const success = command(process.execPath, [
    '-e',
    "process.stdout.write('success-out'); process.stderr.write('success-err');",
  ]);
  assert.deepEqual(success, {
    status: 0,
    stdout: 'success-out',
    stderr: 'success-err',
  });

  assert.throws(
    () =>
      command(process.execPath, [
        '-e',
        "process.stdout.write('failure-out'); process.stderr.write('failure-err'); process.exitCode = 7;",
      ]),
    (error) => {
      assert.equal(error.status, 7);
      assert.equal(error.stdout, 'failure-out');
      assert.equal(error.stderr, 'failure-err');
      return true;
    },
  );
});

test('structured governed migration failure exposes only its exact safe code', () => {
  const databaseUrl =
    'postgresql://moazez_migration:migration-credential@127.0.0.1:5432/moazez';
  const childError = Object.assign(new Error('child failed'), {
    stdout: `${databaseUrl}\n${JSON.stringify({
      event: 'migration.job.result',
      status: 'migration_failed',
      code: 'migration_deploy_failed',
    })}\n`,
    stderr: 'migration-credential',
  });

  assert.equal(
    governedMigrationFailureCode(childError),
    'migration_deploy_failed',
  );
  const failure = governedMigrationFailure(childError);
  assert.equal(failure.code, 'governed_fresh_migration_failed');
  assert.equal(failure.message, 'migration_deploy_failed');
  assert.doesNotMatch(
    `${failure.code}:${failure.message}`,
    /postgresql:|migration-credential/u,
  );
});

test('malformed or unsafe governed migration output remains fail-closed', () => {
  for (const childError of [
    { stdout: 'not-json', stderr: 'migration-credential' },
    {
      stdout: JSON.stringify({
        event: 'migration.job.result',
        status: 'migration_failed',
        code: 'postgresql://user:password@database.invalid/app',
      }),
      stderr: '',
    },
  ]) {
    assert.equal(
      governedMigrationFailureCode(childError),
      'migration_result_unavailable',
    );
    const failure = governedMigrationFailure(childError);
    assert.equal(failure.code, 'governed_fresh_migration_failed');
    assert.equal(failure.message, 'migration_result_unavailable');
    assert.doesNotMatch(
      `${failure.code}:${failure.message}`,
      /password|credential|postgresql:/u,
    );
  }
});

test('governed migration command remains single-attempt and bounded', () => {
  const commandSource = command.toString();
  assert.match(
    commandSource,
    /timeout:\s*options\.timeoutMs\s*\?\?\s*120_000/u,
  );
  assert.match(
    commandSource,
    /maxBuffer:\s*options\.maxBuffer\s*\?\?\s*32 \* 1024 \* 1024/u,
  );
  assert.match(commandSource, /shell:\s*false/u);

  const migrationSource = runGovernedFreshMigration.toString();
  assert.equal(migrationSource.match(/\bcommand\(/gu)?.length, 1);
  assert.match(migrationSource, /timeoutMs:\s*5 \* 60_000/u);
  assert.match(migrationSource, /maxBuffer:\s*8 \* 1024 \* 1024/u);
  assert.doesNotMatch(migrationSource, /retry|allowFailure/iu);
  assert.match(
    migrationSource,
    /catch \(error\) \{\s*throw governedMigrationFailure\(error\);/u,
  );
});

historicalTest(
  'G05 regression mode accepts a descendant and rejects non-descendant or staged state',
  () => {
    for (const branch of ['main', 'HEAD']) {
      assert.equal(
        validateRepositoryState(
          repositoryState({
            branch,
            nodeDirectory: '/opt/hostedtoolcache/node/22.23.1/x64/bin',
            platform: 'linux',
          }),
          VERIFICATION_MODES.REGRESSION,
        ),
        true,
      );
    }
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({ nodeVersion: 'v22.22.0' }),
        VERIFICATION_MODES.REGRESSION,
      ),
    );
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({ historicalBaseIsAncestor: false }),
        VERIFICATION_MODES.REGRESSION,
      ),
    );
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({ indexClean: false }),
        VERIFICATION_MODES.REGRESSION,
      ),
    );
  },
);

historicalTest(
  'G05 regression mode rejects protected source, schema, migration, seed, and release drift',
  () => {
    for (const changedPath of [
      'src/main.ts',
      'prisma/schema.prisma',
      'prisma/migrations/20260101000000_fixture/migration.sql',
      'prisma/seeds/01-permissions.seed.ts',
      'package-lock.json',
      'Dockerfile',
      '.github/workflows/fixture.yml',
      'config/deployment/fixture.json',
      'adr/ADR-9999-fixture.md',
      'scripts/database/fixture.sql',
      'scripts/migrations/fixture.cjs',
      'scripts/release/fixture.cjs',
      'terraform/main.tf',
    ]) {
      assert.throws(() =>
        validateRepositoryState(
          repositoryState({ changedPaths: [changedPath] }),
          VERIFICATION_MODES.REGRESSION,
        ),
      );
    }
  },
);

historicalTest(
  'G05 regression mode rejects dependency or devDependency drift',
  () => {
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({ dependencyChanged: true }),
        VERIFICATION_MODES.REGRESSION,
      ),
    );
    assert.throws(() =>
      validateRepositoryState(
        repositoryState({ devDependencyChanged: true }),
        VERIFICATION_MODES.REGRESSION,
      ),
    );
  },
);

test('Q004 contract v2 locks the exact current in-place Production authority', () => {
  const contract = readJson(
    'config/deployment/production-data-branch.contract.json',
  );
  const validated = validateCurrentProductionDataAuthority(contract);
  assert.equal(validated.currentProductionDataAuthority.contractVersion, 2);
  assert.equal(
    validated.currentProductionDataAuthority.reopenedDecision,
    'PRD0-Q004-REOPEN-20260916',
  );
  assert.equal(
    validated.currentProductionDataAuthority.branch,
    'IN_PLACE_LIVE_PRODUCTION',
  );
  assert.equal(
    validated.currentProductionDataAuthority.authoritativePostgresqlSource,
    'moazez-production-postgres-me-central2',
  );
  assert.deepEqual(
    validated.currentProductionDataAuthority.authoritativeObjectSources,
    [
      'moazez-production-91001421934-private',
      'moazez-production-91001421934-published',
    ],
  );
  assert.equal(
    validated.objectDataDiscoverySnapshot.evidenceSemantics,
    'DATED_DISCOVERY_EVIDENCE',
  );
  assert.equal(
    validated.objectDataDiscoverySnapshot.treatedAsPermanentLiveInvariant,
    false,
  );
  for (const obsoleteField of [
    'approvedAt',
    'migrationCutback',
    'objectMigration',
    'reopenOnDataDiscovery',
    'reopenRule',
    'sourceCountEvidence',
    'sourceRetention',
  ]) {
    assert.equal(Object.hasOwn(contract, obsoleteField), false, obsoleteField);
  }
});

test('current authority validator rejects unsafe or incomplete v2 semantics', () => {
  const baseline = readJson(
    'config/deployment/production-data-branch.contract.json',
  );
  const cases = [
    ['contractVersion', (value) => (value.contractVersion = 1)],
    ['missing reopenedDecision', (value) => delete value.reopenedDecision],
    ['wrong reopenedDecision', (value) => (value.reopenedDecision = 'WRONG')],
    ['clean-start branch', (value) => (value.branch = 'CLEAN_START')],
    [
      'PostgreSQL source count',
      (value) => (value.authoritativePostgresqlSourceCount = 0),
    ],
    [
      'missing PostgreSQL source',
      (value) => delete value.authoritativePostgresqlSource,
    ],
    [
      'wrong PostgreSQL source',
      (value) => (value.authoritativePostgresqlSource = 'wrong-source'),
    ],
    [
      'object source count',
      (value) => (value.authoritativeObjectSourceCount = 1),
    ],
    [
      'wrong approved bucket',
      (value) => (value.authoritativeObjectSources[1] = 'wrong-bucket'),
    ],
    [
      'missing approved bucket',
      (value) => value.authoritativeObjectSources.pop(),
    ],
    [
      'duplicate approved bucket',
      (value) =>
        (value.authoritativeObjectSources[1] =
          value.authoritativeObjectSources[0]),
    ],
    [
      'PostgreSQL preservation',
      (value) => (value.preserveExistingPostgresqlData = false),
    ],
    [
      'object preservation',
      (value) => (value.preserveExistingObjectData = false),
    ],
    [
      'external source migration',
      (value) => (value.externalSourceMigration = true),
    ],
    ['object copy or reseed', (value) => (value.objectCopyOrReseed = true)],
    ['Redis copy', (value) => (value.redisCopyAllowed = true)],
    [
      'planned destructive cutover',
      (value) => (value.plannedDestructiveCutover = true),
    ],
    ['approver', (value) => (value.approver = 'wrong')],
    ['data authority', (value) => (value.dataAuthority = 'wrong')],
    ['approved date', (value) => (value.approvedDate = '2026-09-15')],
    ['timezone', (value) => (value.timezone = 'UTC')],
  ];
  for (const [label, mutate] of cases) {
    const candidate = JSON.parse(JSON.stringify(baseline));
    mutate(candidate);
    assert.throws(
      () => validateCurrentProductionDataAuthority(candidate),
      /current Production data authority/u,
      label,
    );
  }
});

test('snapshot tampering is rejected as historical evidence integrity, not live occupancy', () => {
  const baseline = readJson(
    'config/deployment/production-data-branch.contract.json',
  );
  for (const [label, mutate] of [
    [
      'wrong observed date',
      (value) =>
        (value.objectDataDiscoverySnapshot.observedDate = '2026-09-15'),
    ],
    [
      'wrong evidence classification',
      (value) =>
        (value.objectDataDiscoverySnapshot.evidenceClassification =
          'CURRENT_LIVE_BUCKET_OCCUPANCY_REQUIREMENT'),
    ],
    [
      'tampered private discovery value',
      (value) =>
        (value.objectDataDiscoverySnapshot.privateBucketDataPresent = false),
    ],
    [
      'tampered published discovery value',
      (value) =>
        (value.objectDataDiscoverySnapshot.publishedBucketDataPresent = true),
    ],
  ]) {
    const candidate = JSON.parse(JSON.stringify(baseline));
    mutate(candidate);
    assert.throws(
      () => validateCurrentProductionDataAuthority(candidate),
      (error) => {
        assert.match(error.message, /DATED_DISCOVERY_EVIDENCE/u, label);
        assert.match(
          error.message,
          /historical evidence integrity, not live bucket occupancy/u,
          label,
        );
        return true;
      },
    );
  }
});

test('exactly the two deterministic reference seed sources are approved', () => {
  const inventory = readJson(
    'config/deployment/production-seed-inventory.json',
  );
  assert.equal(inventory.approvedSeedSourceCount, 2);
  assert.deepEqual(
    inventory.approvedSeedSources.map((entry) => [entry.path, entry.export]),
    [
      ['prisma/seeds/01-permissions.seed.ts', 'seedPermissions'],
      ['prisma/seeds/02-system-roles.seed.ts', 'seedSystemRoles'],
    ],
  );
  assert.deepEqual(
    inventory.approvedSeedSources
      .flatMap((entry) => entry.allowedModels)
      .sort(),
    ['Permission', 'Role', 'RolePermission'],
  );
});

test('platform-admin, demo seeds, generic index, and demo mode are prohibited', () => {
  const inventory = readJson(
    'config/deployment/production-seed-inventory.json',
  );
  assert.deepEqual(
    inventory.prohibitedSeedSources.map((entry) => entry.path),
    [
      'prisma/seeds/03-platform-admin.seed.ts',
      'prisma/seeds/04-demo-org.seed.ts',
      'prisma/seeds/05-demo-academics.seed.ts',
    ],
  );
  assert.deepEqual(
    inventory.prohibitedProductionExecutionPaths.map((entry) => entry.value),
    [
      'npm run seed',
      'prisma db seed',
      'prisma/seeds/index.ts',
      'SEED_DEMO_DATA=true',
    ],
  );
  assert.deepEqual(inventory.mustNotCreateModels, [
    'User',
    'Organization',
    'School',
  ]);
  assert.match(
    inventory.initialProductionPlatformAdminProvisioning,
    /^PHASE_8_/u,
  );
});

test('every current TypeScript seed file has an exact classification', () => {
  const inventory = readJson(
    'config/deployment/production-seed-inventory.json',
  );
  const discovered = fs
    .readdirSync(repositoryPath('prisma/seeds'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => `prisma/seeds/${entry.name}`)
    .sort();
  const classified = [
    ...inventory.approvedSeedSources.map((entry) => entry.path),
    ...inventory.prohibitedSeedSources.map((entry) => entry.path),
    ...inventory.prohibitedProductionExecutionPaths
      .map((entry) => entry.value)
      .filter(
        (value) => value.startsWith('prisma/seeds/') && value.endsWith('.ts'),
      ),
  ].sort();
  assert.deepEqual(classified, discovered);
  assert.equal(new Set(classified).size, classified.length);
});

test('approved seed modules export only the approved entrypoints and no business-model writes', () => {
  const permissions = read('prisma/seeds/01-permissions.seed.ts');
  const roles = read('prisma/seeds/02-system-roles.seed.ts');
  const approved = `${permissions}\n${roles}`;
  assert.match(permissions, /export async function seedPermissions/u);
  assert.match(roles, /export async function seedSystemRoles/u);
  assert.doesNotMatch(
    approved,
    /prisma\.(?:user|organization|school|student|guardian|enrollment|conversation|message|file|academicYear|term|stage|grade|section|classroom)\.(?:create|createMany|upsert)/u,
  );

  const genericIndex = read('prisma/seeds/index.ts');
  const platformAdmin = read('prisma/seeds/03-platform-admin.seed.ts');
  assert.match(genericIndex, /await seedPlatformAdmin\(prisma\)/u);
  assert.match(platformAdmin, /export async function seedPlatformAdmin/u);
  assert.match(platformAdmin, /password/iu);
  assert.match(platformAdmin, /development|dev/iu);
});

historicalTest(
  'ADR-0006 preserves historical clean start while current authority is in place',
  () => {
    const adr = read(
      'adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md',
    );
    assert.match(adr, /PRD0-Q004 production-data-authority reopening/u);
    assert.match(adr, /`IN_PLACE_LIVE_PRODUCTION`/u);
    assert.match(adr, /moazez-production-postgres-me-central2/u);
    assert.match(adr, /Historical clean-start object branch/u);
    assert.match(adr, /PRD0-Q044=APPROVED_OPTION_A/u);
    assert.match(adr, /PRD0-D029[\s\S]*sole authoritative owner/u);
    for (const decision of ['D049', 'D050', 'D051']) {
      assert.match(
        adr,
        new RegExp(
          `PRD0-${decision}.*OWNER_DECISION_REQUIRED.*REOPENED_PENDING_OWNER_DISPOSITION`,
          'u',
        ),
      );
    }
    const normalizedAdr = adr.replace(/\s+/gu, ' ');
    for (const nonAuthorization of [
      'external source migration',
      'object copy or reseed',
      'Redis copy',
      'planned destructive cutover',
    ]) {
      assert.ok(normalizedAdr.includes(nonAuthorization));
    }
  },
);

historicalTest(
  'current registers preserve completed historical G05 and reopened authority',
  () => {
    const decision = read(
      'docs/production-readiness/phase-0/02-production-decision-register.md',
    );
    const matrix = read(
      'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
    );
    const dispositions = read(
      'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
    );
    assert.match(decision, /PRD0-D029.*LOCKED_FROM_APPROVED_CONTEXT/u);
    assert.match(matrix, /PRD3-G05.*COMPLETE/u);
    assert.match(matrix, /Q004_CURRENT_AUTHORITY=PRD0-Q004-REOPEN-20260916/u);
    assert.match(dispositions, /PRD0-Q004 \| APPROVED/u);
    assert.match(
      dispositions,
      /ORIGINAL_BRANCH=CLEAN_START|production_data_branch=CLEAN_START/u,
    );
    assert.match(dispositions, /PRD0-Q044 \| PENDING/u);
    assert.match(
      dispositions,
      /snapshot was\s+exactly 10 approved and 38 pending/u,
    );
  },
);

test('package exposes only the two focused G05 verification scripts', () => {
  const packageJson = readJson('package.json');
  assert.equal(
    packageJson.scripts['verify:prd3-g05-tests'],
    'node --test scripts/tests/prd3-g05-clean-start.test.cjs',
  );
  assert.equal(
    packageJson.scripts['verify:prd3-g05-final'],
    'node scripts/ci/prd3-g05-clean-start.cjs',
  );
});

historicalTest(
  'schema, migrations, seeds, dependencies, lockfile, and real index are unchanged',
  () => {
    const protectedDiff = git([
      'diff',
      '--quiet',
      'HEAD',
      '--',
      'prisma/schema.prisma',
      'prisma/migrations',
      'prisma/seeds',
      'package-lock.json',
      'src',
      'Dockerfile',
      '.github',
    ]);
    assert.equal(protectedDiff.status, 0);
    assert.equal(git(['diff', '--cached', '--quiet']).status, 0);
    const baselinePackage = JSON.parse(
      git(['show', 'HEAD:package.json']).stdout,
    );
    const candidatePackage = readJson('package.json');
    assert.deepEqual(
      candidatePackage.dependencies,
      baselinePackage.dependencies,
    );
    assert.deepEqual(
      candidatePackage.devDependencies,
      baselinePackage.devDependencies,
    );
  },
);

historicalTest(
  'G05 evidence and repository scope are complete and bounded',
  () => {
    const evidence = read(
      'docs/production-readiness/phase-3/08-clean-start-production-data-evidence.md',
    );
    for (const required of [
      'No external production source was scanned',
      'No production or staging database was accessed',
      'No production object storage was accessed',
      'No cloud resources were accessed',
      'CURRENT_REOPEN_DECISION=PRD0-Q004-REOPEN-20260916',
      'CURRENT_BRANCH=IN_PLACE_LIVE_PRODUCTION',
      'Authoritative PostgreSQL source count | `0`',
      'Authoritative object source count | `0`',
      'Phase 8 bootstrap concern',
      'PRD3-G05=IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
      'PRD3-G05=COMPLETE',
      'PHASE_3=COMPLETE',
    ]) {
      assert.ok(evidence.includes(required));
    }
  },
);

module.exports = {
  BASE_SHA,
  EXPECTED_CHANGED_PATHS,
};
