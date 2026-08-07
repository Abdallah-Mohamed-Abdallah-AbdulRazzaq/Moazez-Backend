'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  BASE_SHA,
  EXPECTED_CHANGED_PATHS,
  VERIFICATION_MODES,
  resolveVerificationMode,
  validateRepositoryState,
} = require('../ci/prd3-g05-clean-start.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
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
    indexClean: true,
    changedPaths: [...MAINTENANCE_CHANGED_PATHS],
    historicalBaseIsAncestor: true,
    dependencyChanged: false,
    ...overrides,
  };
}

test('G05 historical candidate contract retains its exact baseline and ten paths', () => {
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

test('G05 verification mode parsing permits only candidate default or --regression', () => {
  assert.equal(resolveVerificationMode([]), VERIFICATION_MODES.CANDIDATE);
  assert.equal(resolveVerificationMode(['--regression']), VERIFICATION_MODES.REGRESSION);
  for (const option of [
    '--skip-preflight', '--force', '--current', '--ignore-scope', '--anything-else',
  ]) {
    assert.throws(() => resolveVerificationMode([option]), /unknown verification mode/u);
  }
  assert.throws(() => resolveVerificationMode(['--regression', '--force']));
});

test('G05 regression mode accepts a descendant and rejects non-descendant or staged state', () => {
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

test('G05 regression mode rejects protected source, schema, migration, seed, and release drift', () => {
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

test('G05 regression mode rejects dependency or devDependency drift', () => {
  assert.throws(() =>
    validateRepositoryState(
      repositoryState({ dependencyChanged: true }),
      VERIFICATION_MODES.REGRESSION,
    ),
  );
});

test('Q004 clean-start contract locks the exact approved decision', () => {
  const contract = readJson('config/deployment/production-data-branch.contract.json');
  assert.equal(contract.contractVersion, 1);
  assert.equal(contract.decision, 'PRD0-Q004');
  assert.equal(contract.decisionId, 'PRD0-D029');
  assert.equal(contract.branch, 'CLEAN_START');
  assert.equal(contract.postgresqlMigration, 'N/A_WITH_EVIDENCE');
  assert.equal(
    contract.objectMigration,
    'N/A_WITH_EVIDENCE_FOR_CURRENT_PRODUCTION_SOURCE',
  );
  assert.equal(contract.approver, 'Abdallah');
  assert.equal(contract.dataAuthority, 'Abdallah');
  assert.equal(contract.approvedAt, '2026-08-07T04:46:00+03:00');
});

test('zero-source counts are owner/data-authority attestation, not a cloud scan', () => {
  const contract = readJson('config/deployment/production-data-branch.contract.json');
  assert.equal(contract.authoritativePostgresqlSourceCount, 0);
  assert.equal(contract.authoritativeObjectSourceCount, 0);
  assert.equal(
    contract.sourceCountEvidence.classification,
    'OWNER_DATA_AUTHORITY_ATTESTATION',
  );
  assert.equal(contract.sourceCountEvidence.externalCloudAccountsScanned, false);
  assert.match(
    contract.sourceCountEvidence.statement,
    /no real authoritative Production PostgreSQL database/u,
  );
});

test('Redis copy is prohibited and later data discovery must reopen Q004/D029', () => {
  const contract = readJson('config/deployment/production-data-branch.contract.json');
  assert.equal(contract.redisCopyAllowed, false);
  assert.equal(contract.redisRecoveryPolicy, 'persisted-truth-reconciliation');
  assert.equal(contract.reopenOnDataDiscovery, true);
  assert.match(contract.reopenRule, /automatically reopens PRD0-Q004 \/ PRD0-D029/u);
});

test('exactly the two deterministic reference seed sources are approved', () => {
  const inventory = readJson('config/deployment/production-seed-inventory.json');
  assert.equal(inventory.approvedSeedSourceCount, 2);
  assert.deepEqual(
    inventory.approvedSeedSources.map((entry) => [entry.path, entry.export]),
    [
      ['prisma/seeds/01-permissions.seed.ts', 'seedPermissions'],
      ['prisma/seeds/02-system-roles.seed.ts', 'seedSystemRoles'],
    ],
  );
  assert.deepEqual(
    inventory.approvedSeedSources.flatMap((entry) => entry.allowedModels).sort(),
    ['Permission', 'Role', 'RolePermission'],
  );
});

test('platform-admin, demo seeds, generic index, and demo mode are prohibited', () => {
  const inventory = readJson('config/deployment/production-seed-inventory.json');
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
    ['npm run seed', 'prisma db seed', 'prisma/seeds/index.ts', 'SEED_DEMO_DATA=true'],
  );
  assert.deepEqual(inventory.mustNotCreateModels, ['User', 'Organization', 'School']);
  assert.match(inventory.initialProductionPlatformAdminProvisioning, /^PHASE_8_/u);
});

test('every current TypeScript seed file has an exact classification', () => {
  const inventory = readJson('config/deployment/production-seed-inventory.json');
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
      .filter((value) => value.startsWith('prisma/seeds/') && value.endsWith('.ts')),
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

test('ADR-0006 remains D029 owner while unrelated decisions stay pending', () => {
  const adr = read(
    'adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md',
  );
  assert.match(adr, /PRD0-D029=LOCKED_FROM_APPROVED_CONTEXT/u);
  assert.match(adr, /PRD0-Q004=APPROVED/u);
  assert.match(adr, /branch=CLEAN_START/u);
  assert.match(adr, /sole authoritative owner[\s\S]*PRD0-D029/u);
  for (const decision of ['D009', 'D019', 'D049', 'D050', 'D051', 'D052', 'D053']) {
    assert.match(adr, new RegExp(`PRD0-${decision}.*Pending`, 'u'));
  }
  assert.match(adr, /PRD0-D010.*Proposed recommendation, not accepted/u);
  const normalizedAdr = adr.replace(/\s+/gu, ' ');
  for (const nonAuthorization of [
    'GCS provider selection',
    'bucket topology',
    'object lifecycle',
    'signing IAM',
    'source deletion',
    'physical cleanup',
    'future real-data destruction',
  ]) {
    assert.ok(normalizedAdr.includes(nonAuthorization));
  }
});

test('live decision, acceptance, and disposition registers agree on G05', () => {
  const decision = read('docs/production-readiness/phase-0/02-production-decision-register.md');
  const matrix = read('docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md');
  const dispositions = read(
    'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  );
  assert.match(decision, /PRD0-D029.*LOCKED_FROM_APPROVED_CONTEXT/u);
  assert.match(matrix, /PRD3-G05.*IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE/u);
  assert.match(matrix, /PRD3-G06.*NOT_STARTED/u);
  assert.match(dispositions, /PRD0-Q004 \| APPROVED/u);
  assert.match(dispositions, /evidence_classification=OWNER_DATA_AUTHORITY_ATTESTATION/u);
  assert.match(dispositions, /snapshot was exactly 10 approved and 38 pending/u);
});

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

test('schema, migrations, seeds, dependencies, lockfile, and real index are unchanged', () => {
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
  const baselinePackage = JSON.parse(git(['show', 'HEAD:package.json']).stdout);
  const candidatePackage = readJson('package.json');
  assert.deepEqual(candidatePackage.dependencies, baselinePackage.dependencies);
  assert.deepEqual(candidatePackage.devDependencies, baselinePackage.devDependencies);
});

test('G05 evidence and repository scope are complete and bounded', () => {
  const evidence = read(
    'docs/production-readiness/phase-3/08-clean-start-production-data-evidence.md',
  );
  for (const required of [
    'No external production source was scanned',
    'No production or staging database was accessed',
    'No production object storage was accessed',
    'No cloud resources were accessed',
    'Q004/D029 reopens before cutover',
    'Phase 8 bootstrap concern',
    'PRD3-G05=IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
  ]) {
    assert.ok(evidence.includes(required));
  }
});

module.exports = {
  BASE_SHA,
  EXPECTED_CHANGED_PATHS,
};
