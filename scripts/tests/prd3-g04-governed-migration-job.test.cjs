'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  buildManifest,
  MigrationManifestError,
  serializeManifest,
  verifyManifest,
} = require('../migrations/migration-artifact-manifest.cjs');
const {
  MigrationJobError,
  PRISMA_COMMANDS,
  TOTAL_TIMEOUT_MS,
  classifyCommandFailure,
  main: runnerMain,
  runGovernedMigrationJob,
  sanitizeCapturedOutput,
  validateEnvironment,
} = require('../migrations/run-governed-migration-job.cjs');
const {
  RELEASE_STAGE_IDS,
  runGovernedReleaseSequence,
} = require('../release/governed-release-gate.cjs');
const {
  BASE_SHA,
  EXPECTED_CHANGED_PATHS,
  VERIFICATION_MODES,
  resolveVerificationMode,
  validateRepositoryState,
} = require('../ci/prd3-g04-governed-migration-job.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(REPOSITORY_ROOT, ...relativePath.split('/')), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));
const runnerSource = read('scripts/migrations/run-governed-migration-job.cjs');
const manifestSource = read('scripts/migrations/migration-artifact-manifest.cjs');
const releaseGateSource = read('scripts/release/governed-release-gate.cjs');
const MAINTENANCE_CHANGED_PATHS = Object.freeze([
  'scripts/ci/prd3-g01-c-database-privileges.cjs',
  'scripts/tests/prd3-g01-c-database-privileges.test.cjs',
  'scripts/ci/prd3-g04-governed-migration-job.cjs',
  'scripts/tests/prd3-g04-governed-migration-job.test.cjs',
  'scripts/ci/prd3-g05-clean-start.cjs',
  'scripts/tests/prd3-g05-clean-start.test.cjs',
]);

function repositoryState(overrides = {}) {
  return {
    branch: 'chore/production-readiness-3-cloud-sql',
    head: 'd5983578be2007b8378de4818a1f96446e9e9c1e',
    nodeVersion: 'v22.23.1',
    nodeDirectory:
      'C:\\Users\\Abdal\\AppData\\Local\\Moazez\\toolchains\\node-v22.23.1-win-x64',
    indexClean: true,
    changedPaths: [...MAINTENANCE_CHANGED_PATHS],
    historicalBaseIsAncestor: true,
    dependencyChanged: false,
    ...overrides,
  };
}

function validEnvironment(overrides = {}) {
  const executionId = overrides.MIGRATION_JOB_EXECUTION_ID ?? 'g04-unit-001';
  return {
    DATABASE_URL:
      'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=public&connection_limit=2',
    MIGRATION_JOB_EXECUTION_ID: executionId,
    MIGRATION_JOB_ENVIRONMENT: 'disposable',
    MIGRATION_JOB_ARTIFACT_DIGEST: `sha256:${'a'.repeat(64)}`,
    MIGRATION_JOB_APPROVAL_REF: `SYNTHETIC_APPROVAL:${executionId}`,
    MIGRATION_JOB_BACKUP_CHECKPOINT: `DISPOSABLE_NA:${executionId}`,
    MIGRATION_JOB_DATA_AUTHORITY: `DISPOSABLE_NA:${executionId}`,
    ...overrides,
  };
}

function productionEnvironment(overrides = {}) {
  const executionId = overrides.MIGRATION_JOB_EXECUTION_ID ?? 'g04-production-001';
  return validEnvironment({
    MIGRATION_JOB_EXECUTION_ID: executionId,
    MIGRATION_JOB_ENVIRONMENT: 'production',
    MIGRATION_JOB_APPROVAL_REF: `APPROVED:${executionId}:approval-ticket`,
    MIGRATION_JOB_BACKUP_CHECKPOINT: `BACKUP:${executionId}:backup-ticket`,
    MIGRATION_JOB_DATA_AUTHORITY: `DATA_AUTHORITY:${executionId}:authority-ticket`,
    ...overrides,
  });
}

function fakeManifest() {
  return {
    migrations: [{ directory: '20260101000000_fixture' }],
    aggregateMigrationChainSha256: 'b'.repeat(64),
  };
}

async function runWithFakePrisma(resultForStage = () => ({ exitCode: 0, stdout: '', stderr: '' })) {
  const calls = [];
  const events = [];
  const result = await runGovernedMigrationJob({
    environment: validEnvironment(),
    installSignalHandlers: false,
    verifyManifest: () => fakeManifest(),
    logger: (event) => events.push(event),
    executePrisma: async (args, remainingMs) => {
      const stage = PRISMA_COMMANDS[calls.length].stage;
      calls.push({ stage, args, remainingMs });
      return resultForStage(stage, calls.length - 1);
    },
  });
  return { calls, events, result };
}

function withCopiedMigrationWorkspace(callback) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moazez-g04-manifest-'));
  try {
    fs.cpSync(path.join(REPOSITORY_ROOT, 'prisma'), path.join(temporaryRoot, 'prisma'), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(REPOSITORY_ROOT, 'prisma.config.ts'),
      path.join(temporaryRoot, 'prisma.config.ts'),
    );
    return callback(temporaryRoot);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function makeOperations(failureStage, calls) {
  return Object.fromEntries(
    RELEASE_STAGE_IDS.map((stage) => [
      stage,
      async () => {
        calls.push(stage);
        if (stage === failureStage) throw new Error('synthetic stage failure');
      },
    ]),
  );
}

test('G04 historical candidate contract retains its exact baseline and 16 paths', () => {
  assert.equal(BASE_SHA, '3c2f6ad6b31001b37aa6b2962767de163474856d');
  assert.deepEqual(EXPECTED_CHANGED_PATHS, [
    'Dockerfile',
    'MIGRATION_GOVERNANCE.md',
    'adr/ADR-0007-migration-job-and-deployment-ordering.md',
    'config/deployment/migration-artifact-manifest.json',
    'config/deployment/migration-job.contract.json',
    'config/deployment/release-sequence.contract.json',
    'docs/production-readiness/phase-0/02-production-decision-register.md',
    'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
    'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
    'docs/production-readiness/phase-3/07-governed-migration-job-evidence.md',
    'package.json',
    'scripts/ci/prd3-g04-governed-migration-job.cjs',
    'scripts/migrations/migration-artifact-manifest.cjs',
    'scripts/migrations/run-governed-migration-job.cjs',
    'scripts/release/governed-release-gate.cjs',
    'scripts/tests/prd3-g04-governed-migration-job.test.cjs',
  ]);
  assert.equal(
    validateRepositoryState(
      repositoryState({ head: BASE_SHA, changedPaths: [...EXPECTED_CHANGED_PATHS] }),
      VERIFICATION_MODES.CANDIDATE,
    ),
    true,
  );
  assert.throws(() =>
    validateRepositoryState(repositoryState(), VERIFICATION_MODES.CANDIDATE),
  );
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ head: BASE_SHA, changedPaths: EXPECTED_CHANGED_PATHS.slice(1) }),
      VERIFICATION_MODES.CANDIDATE,
    ),
  );
});

test('G04 verification mode parsing permits only candidate default or --regression', () => {
  assert.equal(resolveVerificationMode([]), VERIFICATION_MODES.CANDIDATE);
  assert.equal(resolveVerificationMode(['--regression']), VERIFICATION_MODES.REGRESSION);
  for (const option of [
    '--skip-preflight', '--force', '--current', '--ignore-scope', '--anything-else',
  ]) {
    assert.throws(() => resolveVerificationMode([option]), /unknown verification mode/u);
  }
  assert.throws(() => resolveVerificationMode(['--regression', '--force']));
});

test('G04 regression mode accepts a descendant and rejects non-descendant or staged state', () => {
  assert.equal(
    validateRepositoryState(repositoryState(), VERIFICATION_MODES.REGRESSION),
    true,
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
});

test('G04 regression mode rejects protected source, schema, migration, and release drift', () => {
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
});

test('G04 regression mode rejects dependency or devDependency drift', () => {
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ dependencyChanged: true }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
});

test('records the exact approved PRD0-Q026 owner decision', () => {
  const disposition = read(
    'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  );
  assert.match(
    disposition,
    /PRD0-Q026 \| APPROVED \| `PRD0-Q026: option=A; approver=Abdallah; migration_approver=Abdallah; rollback_authority=Abdallah; approval_timestamp=2026-08-07T00:22:00\+03:00`/u,
  );
});

test('accepts ADR-0007 with D026-D027 ownership and preserves ADR-0010 health ownership', () => {
  const adr = read('adr/ADR-0007-migration-job-and-deployment-ordering.md');
  assert.match(adr, /## Status\s+Accepted/u);
  assert.match(adr, /Owner: Abdallah/u);
  assert.match(adr, /ApprovedAt: `2026-08-07T00:22:00\+03:00`/u);
  assert.match(adr, /Owned decisions: PRD0-D026 and PRD0-D027/u);
  assert.match(adr, /PRD0-Q026/u);
  assert.match(adr, /PRD3-G04/u);

  const healthAdr = read('adr/ADR-0010-production-health-and-observability-contract.md');
  assert.match(healthAdr, /^# ADR-0010: Production Health and Observability Contract$/mu);
  assert.doesNotMatch(healthAdr, /Migration Job|PRD0-D026|PRD0-D027/u);
});

test('has one unique file for every ADR numeric prefix and no duplicate G04 ADR-0010', () => {
  const adrNames = fs
    .readdirSync(path.join(REPOSITORY_ROOT, 'adr'))
    .filter((name) => /^ADR-\d{4}.*\.md$/u.test(name));
  const prefixes = adrNames.map((name) => name.match(/^ADR-(\d{4})/u)[1]);
  assert.equal(new Set(prefixes).size, prefixes.length);
  assert.deepEqual(
    adrNames.filter((name) => name.startsWith('ADR-0010')),
    ['ADR-0010-production-health-and-observability-contract.md'],
  );
});

test('references ADR-0007 consistently in every G04 governance document', () => {
  for (const documentPath of [
    'MIGRATION_GOVERNANCE.md',
    'docs/production-readiness/phase-0/02-production-decision-register.md',
    'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
    'docs/production-readiness/phase-3/07-governed-migration-job-evidence.md',
  ]) {
    const document = read(documentPath);
    assert.match(document, /ADR-0007/u, documentPath);
  }
});

test('locks every approved Migration Job contract value', () => {
  assert.deepEqual(json('config/deployment/migration-job.contract.json'), {
    contractVersion: 1,
    runtimeContract: 'cloud-run-job-or-approved-equivalent',
    artifactPolicy: 'same-immutable-application-image',
    artifactDigestAuthority: 'release-orchestrator',
    manualRerunRequiresNewExecutionId: true,
    manualRerunRequiresNewApprovalReference: true,
    governanceReferencesBindExecutionId: true,
    executionIdUniquenessAuthority: 'release-orchestrator',
    command: ['node', 'scripts/migrations/run-governed-migration-job.cjs'],
    databaseIdentity: 'moazez_migration',
    databaseSchema: 'public',
    databaseConnectionAllowance: 2,
    tasks: 1,
    parallelism: 1,
    maxRetries: 0,
    timeoutSeconds: 1200,
    seedsAllowed: false,
    applicationBootstrapAllowed: false,
  });
  assert.equal(TOTAL_TIMEOUT_MS, 1_200_000);
});

test('encodes the exact blocking release sequence', () => {
  const contract = json('config/deployment/release-sequence.contract.json');
  assert.deepEqual(
    contract.stages.map((stage) => stage.id),
    RELEASE_STAGE_IDS,
  );
  assert.ok(contract.stages.every((stage) => stage.blocking === true));
  assert.equal(contract.automaticRetryAllowed, false);
});

test('builds a deterministic manifest without timestamps, machine paths, URLs, or credentials', () => {
  const first = serializeManifest(buildManifest());
  const second = serializeManifest(buildManifest());
  assert.equal(first, second);
  assert.doesNotMatch(first, /createdAt|generatedAt|E:\\|C:\\|postgres(?:ql)?:\/\/|DATABASE_URL|credential/iu);
});

test('orders and hashes all seven canonical migrations', () => {
  const manifest = buildManifest();
  assert.equal(manifest.migrations.length, 7);
  assert.deepEqual(
    manifest.migrationDirectories,
    [...manifest.migrationDirectories].sort(),
  );
  assert.match(manifest.aggregateMigrationChainSha256, /^[a-f0-9]{64}$/u);
  assert.ok(manifest.migrations.every((migration) => /^[a-f0-9]{64}$/u.test(migration.sha256)));
});

test('rejects an unexpected file in a migration directory', () => {
  withCopiedMigrationWorkspace((workspace) => {
    const directory = path.join(
      workspace,
      'prisma',
      'migrations',
      buildManifest(workspace).migrationDirectories[0],
    );
    fs.writeFileSync(path.join(directory, 'unexpected.txt'), 'synthetic');
    assert.throws(() => buildManifest(workspace), MigrationManifestError);
  });
});

test('rejects a missing or renamed migration.sql', () => {
  withCopiedMigrationWorkspace((workspace) => {
    const directory = path.join(
      workspace,
      'prisma',
      'migrations',
      buildManifest(workspace).migrationDirectories[0],
    );
    fs.renameSync(
      path.join(directory, 'migration.sql'),
      path.join(directory, 'renamed.sql'),
    );
    assert.throws(() => buildManifest(workspace), MigrationManifestError);
  });
});

test('detects a one-byte migration artifact tamper', () => {
  withCopiedMigrationWorkspace((workspace) => {
    const manifest = buildManifest(workspace);
    const manifestPath = path.join(workspace, 'manifest.json');
    fs.writeFileSync(manifestPath, serializeManifest(manifest));
    fs.appendFileSync(
      path.join(workspace, ...manifest.migrations[0].path.split('/')),
      ' ',
    );
    assert.throws(() => verifyManifest(manifestPath, workspace), MigrationManifestError);
  });
});

test('verifies the manifest before the first Prisma command', async () => {
  const order = [];
  await runGovernedMigrationJob({
    environment: validEnvironment(),
    installSignalHandlers: false,
    logger: () => {},
    verifyManifest: () => {
      order.push('manifest');
      return fakeManifest();
    },
    executePrisma: async () => {
      order.push('prisma');
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(order[0], 'manifest');
});

test('requires every environment-contract field', () => {
  for (const key of Object.keys(validEnvironment())) {
    const environment = validEnvironment();
    delete environment[key];
    assert.throws(() => validateEnvironment(environment), MigrationJobError, key);
  }
});

test('accepts only the migration identity, public schema, connection allowance two, and approved artifact format', () => {
  assert.equal(validateEnvironment(validEnvironment()).databaseIdentity, 'moazez_migration');
  assert.throws(() =>
    validateEnvironment(
      validEnvironment({
        DATABASE_URL:
          'postgresql://moazez_api:synthetic@127.0.0.1:5432/g04?schema=public&connection_limit=2',
      }),
    ),
  );
  assert.throws(() =>
    validateEnvironment(
      validEnvironment({
        DATABASE_URL:
          'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=public&connection_limit=3',
      }),
    ),
  );
  assert.throws(() =>
    validateEnvironment(validEnvironment({ MIGRATION_JOB_ARTIFACT_DIGEST: 'latest' })),
  );
});

test('rejects missing, empty, wrong, duplicate, and overridden public schemas', async () => {
  const invalidUrls = [
    'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?connection_limit=2',
    'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=&connection_limit=2',
    'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=private&connection_limit=2',
    'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=public&schema=public&connection_limit=2',
    'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=public&connection_limit=2&options=-csearch_path%3Dprivate',
    'postgresql://moazez_migration:synthetic@127.0.0.1:5432/g04?schema=public&connection_limit=2&search_path=private',
  ];
  let manifestCalls = 0;
  let databaseCalls = 0;
  for (const databaseUrl of invalidUrls) {
    await assert.rejects(() => runGovernedMigrationJob({
      environment: validEnvironment({ DATABASE_URL: databaseUrl }),
      installSignalHandlers: false,
      logger: () => {},
      verifyManifest: () => {
        manifestCalls += 1;
      },
      executePrisma: async () => {
        databaseCalls += 1;
      },
    }), { code: 'migration_environment_contract_invalid' });
  }
  assert.equal(manifestCalls, 0);
  assert.equal(databaseCalls, 0);
});

test('requires every disposable governance reference to bind the execution id', () => {
  assert.equal(validateEnvironment(validEnvironment()).environment, 'disposable');
  assert.throws(() =>
    validateEnvironment(
      validEnvironment({ MIGRATION_JOB_APPROVAL_REF: 'SYNTHETIC_APPROVAL:other' }),
    ),
  );
  assert.throws(() =>
    validateEnvironment(
      validEnvironment({ MIGRATION_JOB_BACKUP_CHECKPOINT: 'DISPOSABLE_NA:other' }),
    ),
  );
  assert.throws(() =>
    validateEnvironment(
      validEnvironment({ MIGRATION_JOB_DATA_AUTHORITY: 'DISPOSABLE_NA:other' }),
    ),
  );
});

test('requires staging and production governance references to bind the execution id', () => {
  assert.equal(validateEnvironment(productionEnvironment()).environment, 'production');
  assert.equal(
    validateEnvironment(productionEnvironment({ MIGRATION_JOB_ENVIRONMENT: 'staging' })).environment,
    'staging',
  );
  for (const [key, value] of [
    ['MIGRATION_JOB_APPROVAL_REF', 'APPROVED:other:approval-ticket'],
    ['MIGRATION_JOB_BACKUP_CHECKPOINT', 'BACKUP:other:backup-ticket'],
    ['MIGRATION_JOB_DATA_AUTHORITY', 'DATA_AUTHORITY:other:authority-ticket'],
  ]) {
    assert.throws(() => validateEnvironment(productionEnvironment({ [key]: value })));
  }
});

test('rejects stale, cross-mode, empty, URL, credential, and connection-material references', () => {
  const firstExecution = productionEnvironment({
    MIGRATION_JOB_EXECUTION_ID: 'g04-execution-1',
  });
  assert.throws(() =>
    validateEnvironment({
      ...productionEnvironment({ MIGRATION_JOB_EXECUTION_ID: 'g04-execution-2' }),
      MIGRATION_JOB_APPROVAL_REF: firstExecution.MIGRATION_JOB_APPROVAL_REF,
    }),
  );
  assert.throws(() => validateEnvironment(productionEnvironment({
    MIGRATION_JOB_APPROVAL_REF: 'SYNTHETIC_APPROVAL:g04-production-001',
  })));
  assert.throws(() => validateEnvironment(validEnvironment({
    MIGRATION_JOB_APPROVAL_REF: 'APPROVED:g04-unit-001:approval-ticket',
  })));
  for (const invalidOpaque of ['', 'https://approval.example/ref', 'user@host', 'DATABASE_URL=value']) {
    assert.throws(() => validateEnvironment(productionEnvironment({
      MIGRATION_JOB_APPROVAL_REF: `APPROVED:g04-production-001:${invalidOpaque}`,
    })));
  }
});

test('rejects every mismatched governance reference before manifest or database access', async () => {
  const mismatches = [
    validEnvironment({ MIGRATION_JOB_APPROVAL_REF: 'SYNTHETIC_APPROVAL:other' }),
    validEnvironment({ MIGRATION_JOB_BACKUP_CHECKPOINT: 'DISPOSABLE_NA:other' }),
    validEnvironment({ MIGRATION_JOB_DATA_AUTHORITY: 'DISPOSABLE_NA:other' }),
    productionEnvironment({ MIGRATION_JOB_APPROVAL_REF: 'APPROVED:other:approval' }),
    productionEnvironment({ MIGRATION_JOB_BACKUP_CHECKPOINT: 'BACKUP:other:backup' }),
    productionEnvironment({ MIGRATION_JOB_DATA_AUTHORITY: 'DATA_AUTHORITY:other:data' }),
  ];
  let manifestCalls = 0;
  let databaseCalls = 0;
  for (const environment of mismatches) {
    await assert.rejects(() => runGovernedMigrationJob({
      environment,
      installSignalHandlers: false,
      logger: () => {},
      verifyManifest: () => {
        manifestCalls += 1;
      },
      executePrisma: async () => {
        databaseCalls += 1;
      },
    }), { code: 'migration_environment_contract_invalid' });
  }
  assert.equal(manifestCalls, 0);
  assert.equal(databaseCalls, 0);
});

test('uses the fixed Prisma 6 command allowlist and datasource/datamodel drift flags', () => {
  assert.deepEqual(
    PRISMA_COMMANDS.map((command) => command.args),
    [
      ['validate'],
      ['migrate', 'deploy'],
      ['migrate', 'status'],
      [
        'migrate',
        'diff',
        '--from-schema-datasource',
        'prisma/schema.prisma',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
      ],
    ],
  );
});

test('audits command-line argument rejection with one sanitized final event', async () => {
  const events = [];
  let manifestCalls = 0;
  let databaseCalls = 0;
  const rejectedArgument = 'anything-sensitive-cli-argument';
  await assert.rejects(() => runnerMain([rejectedArgument], {
    environment: validEnvironment(),
    installSignalHandlers: false,
    logger: (event) => events.push(event),
    verifyManifest: () => {
      manifestCalls += 1;
    },
    executePrisma: async () => {
      databaseCalls += 1;
    },
  }), {
    code: 'migration_environment_contract_invalid',
  });
  assert.equal(manifestCalls, 0);
  assert.equal(databaseCalls, 0);
  assert.deepEqual(events, [{
    event: 'migration.job.result',
    status: 'migration_failed',
    code: 'migration_environment_contract_invalid',
  }]);

  const processResult = spawnSync(
    process.execPath,
    [path.join(REPOSITORY_ROOT, 'scripts/migrations/run-governed-migration-job.cjs'), rejectedArgument],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...validEnvironment() },
      windowsHide: true,
    },
  );
  assert.notEqual(processResult.status, 0);
  const output = `${processResult.stdout}\n${processResult.stderr}`;
  const outputEvents = processResult.stdout.trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
  assert.deepEqual(outputEvents, events);
  assert.ok(!output.includes(rejectedArgument));
  for (const sensitive of [
    'DATABASE_URL',
    'moazez_migration',
    '127.0.0.1',
    'synthetic',
    'SYNTHETIC_APPROVAL',
    'DISPOSABLE_NA',
  ]) {
    assert.ok(!output.includes(sensitive), sensitive);
  }
});

test('emits exactly one final result event on normal success and failure', async () => {
  const successful = await runWithFakePrisma();
  assert.equal(successful.events.filter((event) => event.event === 'migration.job.result').length, 1);

  const failedEvents = [];
  await assert.rejects(() => runGovernedMigrationJob({
    environment: validEnvironment(),
    installSignalHandlers: false,
    logger: (event) => failedEvents.push(event),
    verifyManifest: () => fakeManifest(),
    executePrisma: async () => ({ exitCode: 1, stdout: '', stderr: 'synthetic' }),
  }));
  assert.equal(failedEvents.filter((event) => event.event === 'migration.job.result').length, 1);
});

test('uses direct child execution with shell disabled', () => {
  assert.match(runnerSource, /spawnProcess\(process\.execPath, \[prismaCliPath, \.\.\.args\]/u);
  assert.match(runnerSource, /shell: false/u);
  assert.doesNotMatch(runnerSource, /execSync|execFileSync|shell:\s*true/iu);
});

test('contains no Nest bootstrap, seed, or forbidden schema-bypass command', () => {
  for (const forbidden of [
    'NestFactory',
    'dist/main.js',
    'dist/core-worker.js',
    'dist/media-worker.js',
    'dist/maintenance-scheduler.js',
    'migrate dev',
    'db push',
    'db execute',
    'migrate reset',
    'migrate resolve',
    'db seed',
  ]) {
    assert.ok(!runnerSource.includes(forbidden), forbidden);
  }
});

test('reports a fresh fake deploy as migration_applied', async () => {
  const { result, calls } = await runWithFakePrisma();
  assert.equal(result.status, 'migration_applied');
  assert.equal(calls.length, 4);
});

test('reports the second fake deploy as migration_noop', async () => {
  const { result } = await runWithFakePrisma((stage) => ({
    exitCode: 0,
    stdout: stage === 'migrate-deploy' ? 'No pending migrations to apply.' : '',
    stderr: '',
  }));
  assert.equal(result.status, 'migration_noop');
});

test('classifies validation failure stably', () => {
  assert.equal(
    classifyCommandFailure('prisma-validate', { exitCode: 1, stderr: 'synthetic' }),
    'migration_validation_failed',
  );
});

test('classifies an ordinary deploy failure stably', () => {
  assert.equal(
    classifyCommandFailure('migrate-deploy', { exitCode: 1, stderr: 'synthetic' }),
    'migration_deploy_failed',
  );
});

test('classifies P3009 as a hard stop', () => {
  assert.equal(
    classifyCommandFailure('migrate-deploy', { exitCode: 1, stderr: 'Error: P3009' }),
    'migration_p3009_detected',
  );
});

test('classifies equivalent failed migration history as a hard stop', () => {
  assert.equal(
    classifyCommandFailure('migrate-deploy', {
      exitCode: 1,
      stderr: 'found failed migrations in the target database',
    }),
    'migration_failed_history_detected',
  );
});

test('classifies ordinary migration status failure stably', () => {
  assert.equal(
    classifyCommandFailure('migrate-status', { exitCode: 1, stderr: 'synthetic' }),
    'migration_status_failed',
  );
});

test('classifies migration-history divergence stably', () => {
  assert.equal(
    classifyCommandFailure('migrate-status', {
      exitCode: 1,
      stderr: 'The migration histories diverge.',
    }),
    'migration_history_diverged',
  );
  assert.equal(
    classifyCommandFailure('migrate-deploy', {
      exitCode: 1,
      stderr: 'Error: P3018 synthetic replay collision',
    }),
    'migration_history_diverged',
  );
});

test('maps post-deploy diff exit code two to migration_drift_detected', async () => {
  await assert.rejects(
    () =>
      runWithFakePrisma((stage) => ({
        exitCode: stage === 'migrate-diff' ? 2 : 0,
        stdout: '',
        stderr: '',
      })),
    { code: 'migration_drift_detected' },
  );
});

test('maps a child timeout to migration_timeout', async () => {
  await assert.rejects(
    () =>
      runWithFakePrisma(() => ({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true,
      })),
    { code: 'migration_timeout' },
  );
});

test('SIGTERM stops the active child and maps to migration_interrupted', async () => {
  const signalState = { interrupted: false, activeChild: null };
  let killSignal;
  let commandCalls = 0;
  const execution = runGovernedMigrationJob({
    environment: validEnvironment(),
    signalState,
    logger: () => {},
    verifyManifest: () => fakeManifest(),
    executePrisma: async () => {
      commandCalls += 1;
      return new Promise((resolve) => {
        signalState.activeChild = {
          exitCode: null,
          killed: false,
          kill(signal) {
            killSignal = signal;
            this.killed = true;
            this.exitCode = 143;
            resolve({
              exitCode: 143,
              stdout: '',
              stderr: '',
              interrupted: true,
            });
          },
        };
        setImmediate(() => process.emit('SIGTERM'));
      });
    },
  });
  await assert.rejects(() => execution, { code: 'migration_interrupted' });
  assert.equal(killSignal, 'SIGTERM');
  assert.equal(commandCalls, 1);
});

test('runs no later Prisma command after the first failure', async () => {
  let calls = 0;
  await assert.rejects(() =>
    runGovernedMigrationJob({
      environment: validEnvironment(),
      installSignalHandlers: false,
      logger: () => {},
      verifyManifest: () => fakeManifest(),
      executePrisma: async () => {
        calls += 1;
        return { exitCode: 1, stdout: '', stderr: 'synthetic' };
      },
    }),
  );
  assert.equal(calls, 1);
});

test('serializes every runner event without raw database identity or governance material', async () => {
  const { events } = await runWithFakePrisma();
  const serialized = JSON.stringify(events);
  assert.match(serialized, /approvalRefHash/u);
  assert.match(serialized, /backupCheckpointHash/u);
  assert.match(serialized, /dataAuthorityHash/u);
  assert.match(serialized, /databaseIdentityPolicy.*dedicated-migration-role/u);
  for (const sensitive of [
    'moazez_migration',
    'postgresql://',
    'postgres://',
    'DATABASE_URL',
    '127.0.0.1',
    'synthetic',
    'SYNTHETIC_APPROVAL:g04-unit-001',
    'DISPOSABLE_NA:g04-unit-001',
  ]) {
    assert.ok(!serialized.includes(sensitive), sensitive);
  }
  assert.equal(events.at(-1).status, 'migration_applied');
});

test('redacts database URLs, user info, query strings, and control bytes', () => {
  const sanitized = sanitizeCapturedOutput(
    'DATABASE_URL=postgresql://user:secret@private.example/db?token=raw\u0000',
  );
  assert.doesNotMatch(sanitized, /user|secret|private\.example|token=raw/u);
  assert.match(sanitized, /redacted/u);
});

test('executes successful release operations serially in exact order', async () => {
  const calls = [];
  const result = await runGovernedReleaseSequence(makeOperations(undefined, calls));
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls, RELEASE_STAGE_IDS);
  assert.equal(result.events.length, RELEASE_STAGE_IDS.length * 2);
});

test('migration-job failure executes zero runtime-promotion callbacks', async () => {
  const calls = [];
  await assert.rejects(() =>
    runGovernedReleaseSequence(makeOperations('migration-job', calls)),
  );
  assert.deepEqual(calls, RELEASE_STAGE_IDS.slice(0, 3));
  assert.equal(calls.filter((stage) => stage.endsWith('-promotion')).length, 0);
});

test('migration-verification failure executes zero runtime-promotion callbacks', async () => {
  const calls = [];
  await assert.rejects(() =>
    runGovernedReleaseSequence(
      makeOperations('migration-status-and-drift-verification', calls),
    ),
  );
  assert.deepEqual(calls, RELEASE_STAGE_IDS.slice(0, 4));
  assert.equal(calls.filter((stage) => stage.endsWith('-promotion')).length, 0);
});

test('Core Worker failure prevents every later role and traffic callback', async () => {
  const calls = [];
  await assert.rejects(() =>
    runGovernedReleaseSequence(makeOperations('core-worker-promotion', calls)),
  );
  assert.deepEqual(calls, RELEASE_STAGE_IDS.slice(0, 5));
  assert.ok(!calls.includes('media-worker-promotion'));
  assert.ok(!calls.includes('traffic-promotion'));
});

test('API no-traffic success does not promote traffic before smoke succeeds', async () => {
  const calls = [];
  await assert.rejects(() =>
    runGovernedReleaseSequence(makeOperations('protected-readiness-and-smoke', calls)),
  );
  assert.ok(calls.includes('api-no-traffic-promotion'));
  assert.ok(!calls.includes('traffic-promotion'));
});

test('Docker retains one final image, API default command, migration override, and non-root user', () => {
  const dockerfile = read('Dockerfile');
  assert.equal((dockerfile.match(/^FROM runtime AS final$/gmu) ?? []).length, 1);
  assert.match(dockerfile, /^USER node$/mu);
  assert.match(dockerfile, /^CMD \["node", "dist\/main\.js"\]$/mu);
  assert.match(dockerfile, /\/app\/scripts\/migrations \.\/scripts\/migrations/u);
  assert.match(dockerfile, /\/app\/config\/deployment \.\/config\/deployment/u);
  assert.doesNotMatch(dockerfile, /AS migration|migration-image/iu);
});

test('retains the accepted G01 DML-only runtime role policy and migration allowance', () => {
  const bootstrap = read('scripts/database/prd3-g01-c-role-bootstrap.sql');
  const grants = read('scripts/database/prd3-g01-c-runtime-grants.sql');
  assert.match(bootstrap, /GRANT CONNECT, CREATE ON DATABASE .* TO moazez_migration/u);
  assert.match(grants, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/u);
  assert.match(grants, /REVOKE ALL PRIVILEGES ON TABLE public\._prisma_migrations/u);
  assert.doesNotMatch(grants, /GRANT\s+(?:CREATE|TRUNCATE|REFERENCES|TRIGGER|OWNERSHIP)/iu);
});

test('protects schema, migrations, dependencies, lockfile, APIs, and runtime ownership while covering final evidence', () => {
  const protectedDiff = spawnSync(
    'git',
    [
      'diff',
      '--quiet',
      'HEAD',
      '--',
      'prisma/schema.prisma',
      'prisma/migrations',
      'package-lock.json',
      'src',
    ],
    { cwd: REPOSITORY_ROOT, windowsHide: true },
  );
  assert.equal(protectedDiff.status, 0);
  const baselinePackage = JSON.parse(
    spawnSync('git', ['show', 'HEAD:package.json'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).stdout,
  );
  const candidatePackage = json('package.json');
  assert.deepEqual(candidatePackage.dependencies, baselinePackage.dependencies);
  assert.deepEqual(candidatePackage.devDependencies, baselinePackage.devDependencies);
  assert.match(manifestSource, /fs\.lstatSync/u);
  assert.match(releaseGateSource, /for \(const stage of RELEASE_STAGE_IDS\)/u);
  assert.ok(fs.existsSync(path.join(REPOSITORY_ROOT, 'scripts/ci/prd3-g04-governed-migration-job.cjs')));
});
