'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const TEST_LIKE_PATTERN =
  /(?:^|[.-])(?:spec|test)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu;
const EXCLUDED_DIRECTORY_PATTERN = /(?:^|\/)(?:dist|node_modules)(?:\/|$)/u;
const GITHUB_JOB_OVERHEAD_MINUTES = 10;
const ALL_REQUIRED_DOMAINS = Object.freeze([
  'learning-content',
  'media-storage',
  'migration-integrity',
  'school-email-delivery',
  'security',
]);

const MEDIA_RUNTIME_JEST_FILES = new Set([
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
]);

const ACTIVE_TAP_OWNERS = Object.freeze({
  'scripts/tests/aggregate-ci.test.cjs': Object.freeze({
    owner: 'ci-orchestrator',
    profile: 'orchestrator',
  }),
  'scripts/tests/check-migration-governance.test.cjs': Object.freeze({
    owner: 'migration-governance',
    profile: 'migration-governance',
  }),
  'scripts/tests/ci-fixture-contract.test.cjs': Object.freeze({
    owner: 'ci-orchestrator',
    profile: 'orchestrator',
  }),
  'scripts/tests/health-probe-database-runtime-contract.test.cjs':
    Object.freeze({
      owner: 'runtime-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/migration-rebaseline-authorization.test.cjs': Object.freeze({
    owner: 'migration-governance',
    profile: 'migration-governance',
  }),
  'scripts/tests/plan-ci.test.cjs': Object.freeze({
    owner: 'ci-orchestrator',
    profile: 'orchestrator',
  }),
  'scripts/tests/prd1-g07-universal-regression.test.cjs': Object.freeze({
    owner: 'ci-orchestrator',
    profile: 'orchestrator',
  }),
  'scripts/tests/prd3-g01-b3-transaction-pressure.test.cjs': Object.freeze({
    owner: 'prd3-g01',
    profile: 'prd3-g01',
  }),
  'scripts/tests/prd3-g01-c-database-privileges.test.cjs': Object.freeze({
    owner: 'prd3-g01',
    profile: 'prd3-g01',
  }),
  'scripts/tests/prd3-g02-redis-topology-recovery.test.cjs': Object.freeze({
    owner: 'prd3-g02',
    profile: 'prd3-g02',
  }),
  'scripts/tests/prd3-g03-critical-queue-recovery.test.cjs': Object.freeze({
    owner: 'prd3-g03',
    profile: 'prd3-g03',
  }),
  'scripts/tests/prd3-g04-governed-migration-job.test.cjs': Object.freeze({
    owner: 'prd3-g04',
    profile: 'prd3-g04',
  }),
  'scripts/tests/prd3-g05-clean-start.test.cjs': Object.freeze({
    owner: 'prd3-g05',
    profile: 'prd3-g05',
  }),
  'scripts/tests/run-ci-shard.test.cjs': Object.freeze({
    owner: 'ci-orchestrator',
    profile: 'orchestrator',
  }),
  'scripts/tests/stage-24a-production-cloud-sql-source.test.cjs':
    Object.freeze({
      owner: 'sql-source-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/stage-25b-production-redis-source.test.cjs':
    Object.freeze({
      owner: 'redis-source-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/stage-26c-production-foundation-source.test.cjs':
    Object.freeze({
      owner: 'production-foundation-source-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/stage-27a-production-backend-image-workflow.test.cjs':
    Object.freeze({
      owner: 'production-artifact-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/stage-28a-production-migration-job-source.test.cjs':
    Object.freeze({
      owner: 'production-migration-source-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/universal-regression.test.cjs': Object.freeze({
    owner: 'ci-orchestrator',
    profile: 'orchestrator',
  }),
  'scripts/tests/validate-production-readiness-governance.test.cjs':
    Object.freeze({
      owner: 'runtime-governance',
      profile: 'runtime-governance',
    }),
  'scripts/tests/verify-runtime-policy.test.cjs': Object.freeze({
    owner: 'runtime-governance',
    profile: 'runtime-governance',
  }),
});

const HISTORICAL_MANUAL_TAP_FILES = new Set([
  'scripts/storage/tests/gcs-batch2-operator-scripts.test.cjs',
  'scripts/storage/tests/gcs-batch2-proof-policy.test.cjs',
  'scripts/storage/tests/gcs-batch2-terraform-policy.test.cjs',
  'scripts/tests/backfill-teacher-profiles-1a.test.cjs',
  'scripts/tests/classify-teacher-directory-reality-0a.test.cjs',
  'scripts/tests/classify-teacher-identity-remediation-1b-0r.test.cjs',
  'scripts/tests/prd3-g01-b2-database-recovery.test.cjs',
  'scripts/tests/prd3-g01-b-pool-saturation.test.cjs',
  'scripts/tests/prd3-g06-phase3-regression.test.cjs',
  'scripts/tests/remediate-orphan-teacher-identities-1b-0r.test.cjs',
]);

const PROFILE_DEFINITIONS = Object.freeze([
  Object.freeze({
    profile: 'media-storage',
    label: 'Media and storage',
    category: 'service',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'security',
    label: 'Security',
    category: 'service',
    total: 3,
    timeoutMinutes: 35,
  }),
  Object.freeze({
    profile: 'e2e',
    label: 'E2E',
    category: 'service',
    total: 5,
    timeoutMinutes: 40,
  }),
  Object.freeze({
    profile: 'prd3-g01',
    label: 'PRD3-G01 database runtime invariants',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'prd3-g02',
    label: 'PRD3-G02 Redis recovery',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'prd3-g03',
    label: 'PRD3-G03 queue recovery',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'prd3-g04',
    label: 'PRD3-G04 governed migration job',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'prd3-g05',
    label: 'PRD3-G05 clean start',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'g06-reinforcement-storage',
    label: 'G06 reinforcement and storage',
    category: 'service',
    total: 1,
    timeoutMinutes: 40,
  }),
  Object.freeze({
    profile: 'integration-general',
    label: 'General integration',
    category: 'service',
    total: 2,
    timeoutMinutes: 35,
  }),
  Object.freeze({
    profile: 'source-integration',
    label: 'Source integration',
    category: 'service',
    total: 1,
    timeoutMinutes: 30,
  }),
  Object.freeze({
    profile: 'teacher-closeout',
    label: 'Teacher closeout',
    category: 'service',
    total: 1,
    timeoutMinutes: 35,
  }),
  Object.freeze({
    profile: 'migration-governance',
    label: 'Migration governance',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 45,
  }),
  Object.freeze({
    profile: 'g05-email-redis',
    label: 'G05 email Redis',
    category: 'service',
    total: 1,
    timeoutMinutes: 30,
  }),
  Object.freeze({
    profile: 'unit',
    label: 'Unit',
    category: 'unit',
    total: 4,
    timeoutMinutes: 30,
  }),
  Object.freeze({
    profile: 'runtime-governance',
    label: 'Runtime governance',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 35,
  }),
  Object.freeze({
    profile: 'orchestrator',
    label: 'CI orchestrator contracts',
    category: 'invariant',
    total: 1,
    timeoutMinutes: 35,
  }),
]);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeRepositoryPath(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Repository paths must be strings');
  }
  const normalized = value.replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (
    normalized.length === 0 ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function parseNullSeparated(output) {
  if (!output) return [];
  return output.split('\0').filter(Boolean).map(normalizeRepositoryPath);
}

function defaultGitRunner(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function coerceGitOutput(result) {
  if (Buffer.isBuffer(result)) return result.toString('utf8');
  if (typeof result === 'string') return result;
  if (result && typeof result.stdout === 'string') return result.stdout;
  if (result && Buffer.isBuffer(result.stdout))
    return result.stdout.toString('utf8');
  throw new TypeError(
    'The git runner must return stdout as a string or Buffer',
  );
}

function runGit(gitRunner, repositoryRoot, args, description) {
  try {
    return coerceGitOutput(gitRunner(args, { cwd: repositoryRoot }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to ${description}: ${detail}`, { cause: error });
  }
}

function listRepositoryFiles(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? defaultGitRunner;
  const tracked = parseNullSeparated(
    runGit(
      gitRunner,
      repositoryRoot,
      ['ls-files', '--cached', '-z'],
      'list tracked repository files',
    ),
  );
  const untracked = parseNullSeparated(
    runGit(
      gitRunner,
      repositoryRoot,
      ['ls-files', '--others', '--exclude-standard', '-z'],
      'list untracked nonignored repository files',
    ),
  );

  return [...new Set([...tracked, ...untracked])]
    .filter((file) => !EXCLUDED_DIRECTORY_PATTERN.test(file))
    .sort(compareText);
}

function isDiscoverableTest(file) {
  return (
    /^src\/.+\.spec\.ts$/u.test(file) ||
    /^test\/.+(?:\.spec\.ts|\.e2e-spec\.ts)$/u.test(file) ||
    /^scripts\/tests\/[^/]+\.test\.cjs$/u.test(file) ||
    HISTORICAL_MANUAL_TAP_FILES.has(file)
  );
}

function isUnknownGovernedTest(file) {
  return TEST_LIKE_PATTERN.test(file);
}

function discoverTestFiles(repositoryFiles) {
  const discovered = new Set();
  for (const rawFile of repositoryFiles) {
    const file = normalizeRepositoryPath(rawFile);
    if (EXCLUDED_DIRECTORY_PATTERN.test(file)) continue;
    if (isDiscoverableTest(file)) {
      classifyTestFile(file);
      discovered.add(file);
      continue;
    }
    if (isUnknownGovernedTest(file)) {
      throw new Error(`Unknown governed test pattern or location: ${file}`);
    }
  }
  return [...discovered].sort(compareText);
}

function createAssignment(
  file,
  owner,
  category,
  profile,
  execution = 'pull-request',
) {
  return {
    file,
    kind: file.endsWith('.test.cjs') ? 'node-tap' : 'jest',
    owner,
    category,
    profile,
    execution,
  };
}

function classifyIntegrationFile(file) {
  if (
    file ===
    'test/integration/prd3-g02-redis-topology-recovery.integration.spec.ts'
  ) {
    return createAssignment(file, 'prd3-g02', 'invariant', 'prd3-g02');
  }
  if (
    file ===
    'test/integration/prd3-g03-critical-queue-recovery.integration.spec.ts'
  ) {
    return createAssignment(file, 'prd3-g03', 'invariant', 'prd3-g03');
  }
  if (
    file === 'test/integration/school-email-delivery-job-id.integration.spec.ts'
  ) {
    return createAssignment(
      file,
      'g05-email-redis',
      'service',
      'g05-email-redis',
    );
  }
  if (
    /^test\/integration\/teacher-(?:lifecycle|reality-classifier)-closeout\.integration\.spec\.ts$/u.test(
      file,
    ) ||
    file ===
      'test/integration/membership-ended-at-constraint.integration.spec.ts'
  ) {
    return createAssignment(
      file,
      'teacher-closeout',
      'service',
      'teacher-closeout',
    );
  }
  if (
    /^test\/integration\/reinforcement-proof-(?:content-verifier|file\.repository|persistence)\.integration\.spec\.ts$/u.test(
      file,
    )
  ) {
    return createAssignment(
      file,
      'g06-reinforcement-storage',
      'service',
      'g06-reinforcement-storage',
    );
  }
  if (
    /^test\/integration\/learning-media-.+\.integration\.spec\.ts$/u.test(
      file,
    ) ||
    /^test\/integration\/(?:parent-child|student|teacher)-lesson-playback\.integration\.spec\.ts$/u.test(
      file,
    )
  ) {
    return createAssignment(file, 'media-storage', 'service', 'media-storage');
  }
  return createAssignment(
    file,
    'integration-general',
    'service',
    'integration-general',
  );
}

function classifyTapFile(file) {
  const active = ACTIVE_TAP_OWNERS[file];
  if (active) {
    return createAssignment(file, active.owner, 'invariant', active.profile);
  }
  if (HISTORICAL_MANUAL_TAP_FILES.has(file)) {
    return createAssignment(
      file,
      'historical-manual',
      'historical',
      'historical-manual',
      'manual',
    );
  }
  throw new Error(`TAP test has no explicit canonical owner: ${file}`);
}

function classifyTestFile(rawFile) {
  const file = normalizeRepositoryPath(rawFile);
  if (/^src\/.+\.spec\.ts$/u.test(file)) {
    if (MEDIA_RUNTIME_JEST_FILES.has(file)) {
      return createAssignment(
        file,
        'media-storage',
        'service',
        'media-storage',
      );
    }
    if (file.endsWith('.integration.spec.ts')) {
      return createAssignment(
        file,
        'source-integration',
        'service',
        'source-integration',
      );
    }
    return createAssignment(file, 'source-unit', 'unit', 'unit');
  }
  if (/^test\/security\/.+(?:\.spec\.ts|\.e2e-spec\.ts)$/u.test(file)) {
    if (file === 'test/security/tenancy.reinforcement-proof-mime.spec.ts') {
      return createAssignment(
        file,
        'g06-reinforcement-storage',
        'service',
        'g06-reinforcement-storage',
      );
    }
    return createAssignment(file, 'security', 'service', 'security');
  }
  if (/^test\/e2e\/.+(?:\.spec\.ts|\.e2e-spec\.ts)$/u.test(file)) {
    return createAssignment(file, 'e2e', 'service', 'e2e');
  }
  if (file === 'test/app.e2e-spec.ts') {
    return createAssignment(file, 'e2e', 'service', 'e2e');
  }
  if (/^test\/integration\/.+(?:\.spec\.ts|\.e2e-spec\.ts)$/u.test(file)) {
    return classifyIntegrationFile(file);
  }
  if (
    /^scripts\/tests\/[^/]+\.test\.cjs$/u.test(file) ||
    HISTORICAL_MANUAL_TAP_FILES.has(file)
  ) {
    return classifyTapFile(file);
  }
  throw new Error(`Test has no canonical owner: ${file}`);
}

function assignTests(testFiles) {
  return [...testFiles]
    .map(normalizeRepositoryPath)
    .sort(compareText)
    .map(classifyTestFile);
}

function calculateParity(inventoryFiles, assignments) {
  const inventory = [
    ...new Set(inventoryFiles.map(normalizeRepositoryPath)),
  ].sort(compareText);
  const assignmentCounts = new Map();
  for (const assignment of assignments) {
    const file = normalizeRepositoryPath(assignment.file);
    assignmentCounts.set(file, (assignmentCounts.get(file) ?? 0) + 1);
  }
  return {
    missing: inventory.filter((file) => !assignmentCounts.has(file)),
    duplicateAssignments: [...assignmentCounts.entries()]
      .filter(([file, count]) => count > 1 && inventory.includes(file))
      .sort(([left], [right]) => compareText(left, right))
      .map(([file, count]) => ({ file, count })),
  };
}

function assertCompleteParity(parity) {
  if (parity.missing.length > 0 || parity.duplicateAssignments.length > 0) {
    throw new Error(`Test assignment parity failed: ${JSON.stringify(parity)}`);
  }
}

function roundRobin(files, total) {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error('Round-robin shard total must be a positive integer');
  }
  const shards = Array.from({ length: total }, () => []);
  [...files]
    .map(normalizeRepositoryPath)
    .sort(compareText)
    .forEach((file, index) => {
      shards[index % total].push(file);
    });
  return shards;
}

function createShards(assignments) {
  const activeAssignments = assignments.filter(
    (assignment) => assignment.execution === 'pull-request',
  );
  const knownProfiles = new Set(
    PROFILE_DEFINITIONS.map((definition) => definition.profile),
  );
  const unknownProfiles = [
    ...new Set(activeAssignments.map((assignment) => assignment.profile)),
  ]
    .filter((profile) => !knownProfiles.has(profile))
    .sort(compareText);
  if (unknownProfiles.length > 0) {
    throw new Error(
      `Active tests use unknown profiles: ${unknownProfiles.join(', ')}`,
    );
  }

  const shards = [];
  for (const definition of PROFILE_DEFINITIONS) {
    const files = activeAssignments
      .filter((assignment) => assignment.profile === definition.profile)
      .map((assignment) => assignment.file);
    if (files.length === 0) continue;
    roundRobin(files, definition.total).forEach((shardFiles, offset) => {
      const index = offset + 1;
      shards.push({
        id: `${definition.profile}-${index}-of-${definition.total}`,
        label: `${definition.label} ${index}/${definition.total}`,
        category: definition.category,
        profile: definition.profile,
        index,
        total: definition.total,
        files: shardFiles,
        timeoutMinutes: definition.timeoutMinutes,
        jobTimeoutMinutes:
          definition.timeoutMinutes + GITHUB_JOB_OVERHEAD_MINUTES,
      });
    });
  }
  return shards;
}

function categorizeChangedPath(rawFile) {
  const file = normalizeRepositoryPath(rawFile);
  if (/^(?:\.github\/workflows\/|scripts\/ci\/|scripts\/tests\/)/u.test(file)) {
    return 'ci';
  }
  if (
    /^(?:package(?:-lock)?\.json|\.nvmrc|nest-cli\.json|tsconfig(?:\.[^.]+)?\.json)$/u.test(
      file,
    )
  ) {
    return 'dependencies';
  }
  if (
    /^(?:prisma\/migrations\/|prisma\/schema\.prisma$|prisma\.config\.ts$)/u.test(
      file,
    )
  ) {
    return 'database-migration';
  }
  if (/^prisma\/seeds\//u.test(file)) return 'seed';
  if (
    /(?:^|\/)(?:learning-media|media-storage|storage)(?:\/|-|\.)/u.test(file) ||
    /^src\/modules\/files\//u.test(file) ||
    /(?:parent-child|student|teacher)-lesson-playback/u.test(file)
  ) {
    return 'media-storage';
  }
  if (/lesson-content|publication|curriculum/u.test(file))
    return 'learning-content';
  if (/school-email|email-delivery/u.test(file)) return 'school-email';
  if (
    /^(?:src\/infrastructure\/(?:queue|realtime)\/|scripts\/ci\/prd3-g0[23]-)/u.test(
      file,
    )
  ) {
    return 'runtime-recovery';
  }
  if (
    /^(?:test\/security\/|src\/modules\/iam\/|src\/common\/guards\/)/u.test(
      file,
    )
  ) {
    return 'security';
  }
  if (/^test\//u.test(file)) return 'tests';
  if (/^src\//u.test(file)) return 'application';
  if (/^(?:adr\/|docs\/|.*\.md$)/u.test(file)) return 'documentation';
  return 'repository';
}

function classifyChangedPaths(changedPaths) {
  return [...new Set(changedPaths.map(categorizeChangedPath))].sort(
    compareText,
  );
}

function deriveRequiredDomains(categories) {
  const required = new Set();
  for (const category of categories) {
    switch (category) {
      case 'ci':
      case 'dependencies':
      case 'application':
      case 'tests':
      case 'repository':
        ALL_REQUIRED_DOMAINS.forEach((domain) => required.add(domain));
        break;
      case 'database-migration':
      case 'seed':
        required.add('migration-integrity');
        break;
      case 'media-storage':
        required.add('media-storage');
        break;
      case 'learning-content':
        required.add('learning-content');
        break;
      case 'school-email':
      case 'runtime-recovery':
        required.add('school-email-delivery');
        break;
      case 'security':
        required.add('security');
        break;
      case 'documentation':
        break;
      default:
        throw new Error(`Unknown change category: ${category}`);
    }
  }
  return [...required].sort(compareText);
}

function requireExactSha(value, label) {
  const sha = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!EXACT_SHA_PATTERN.test(sha)) {
    throw new Error(`${label} must be an exact 40-character commit SHA`);
  }
  return sha;
}

function verifyCommitSha(gitRunner, repositoryRoot, value, label) {
  const sha = requireExactSha(value, label);
  const resolved = requireExactSha(
    runGit(
      gitRunner,
      repositoryRoot,
      ['rev-parse', '--verify', `${sha}^{commit}`],
      `verify ${label}`,
    ).trim(),
    `resolved ${label}`,
  );
  if (resolved !== sha) {
    throw new Error(
      `${label} ${sha} resolved to a different commit ${resolved}`,
    );
  }
  return resolved;
}

function resolveGitContext(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? defaultGitRunner;
  const environment = options.environment ?? process.env;

  const candidateInput =
    options.candidateSha ??
    environment.CI_CANDIDATE_SHA ??
    runGit(
      gitRunner,
      repositoryRoot,
      ['rev-parse', '--verify', 'HEAD'],
      'resolve candidate HEAD',
    ).trim();
  const candidateSha = verifyCommitSha(
    gitRunner,
    repositoryRoot,
    candidateInput,
    'candidateSha',
  );

  const baseInput =
    options.baseSha ??
    environment.CI_BASE_SHA ??
    environment.GITHUB_BASE_SHA ??
    runGit(
      gitRunner,
      repositoryRoot,
      ['rev-parse', '--verify', `${candidateSha}^`],
      'resolve candidate parent as local base',
    ).trim();
  const baseSha = verifyCommitSha(
    gitRunner,
    repositoryRoot,
    baseInput,
    'baseSha',
  );
  const mergeBaseSha = requireExactSha(
    runGit(
      gitRunner,
      repositoryRoot,
      ['merge-base', baseSha, candidateSha],
      'calculate candidate/base merge-base',
    ).trim(),
    'mergeBaseSha',
  );
  const changedPaths = [
    ...new Set(
      parseNullSeparated(
        runGit(
          gitRunner,
          repositoryRoot,
          ['diff', '--name-only', '-z', `${mergeBaseSha}..${candidateSha}`],
          'calculate changed paths',
        ),
      ),
    ),
  ].sort(compareText);

  return { candidateSha, baseSha, mergeBaseSha, changedPaths };
}

function normalizeGitContext(gitContext) {
  return {
    candidateSha: requireExactSha(gitContext.candidateSha, 'candidateSha'),
    baseSha: requireExactSha(gitContext.baseSha, 'baseSha'),
    mergeBaseSha: requireExactSha(gitContext.mergeBaseSha, 'mergeBaseSha'),
    changedPaths: [
      ...new Set((gitContext.changedPaths ?? []).map(normalizeRepositoryPath)),
    ].sort(compareText),
  };
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => compareText(left, right)),
  );
}

function buildInventory(files, assignments) {
  return {
    total: files.length,
    active: assignments.filter(
      (assignment) => assignment.execution === 'pull-request',
    ).length,
    historicalManual: assignments.filter(
      (assignment) => assignment.execution === 'manual',
    ).length,
    files,
    byKind: countBy(assignments, (assignment) => assignment.kind),
    byOwner: countBy(assignments, (assignment) => assignment.owner),
    byProfile: countBy(assignments, (assignment) => assignment.profile),
  };
}

function createCiPlan(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const repositoryFiles = options.repositoryFiles
    ? [...options.repositoryFiles]
        .map(normalizeRepositoryPath)
        .sort(compareText)
    : listRepositoryFiles({ repositoryRoot, gitRunner: options.gitRunner });
  const gitContext = options.gitContext
    ? normalizeGitContext(options.gitContext)
    : resolveGitContext({
        repositoryRoot,
        gitRunner: options.gitRunner,
        environment: options.environment,
        candidateSha: options.candidateSha,
        baseSha: options.baseSha,
      });
  const files = discoverTestFiles(repositoryFiles);
  const assignments = assignTests(files);
  const parity = calculateParity(files, assignments);
  assertCompleteParity(parity);
  const shards = createShards(assignments);
  const categories = classifyChangedPaths(gitContext.changedPaths);

  return {
    schemaVersion: 1,
    candidateSha: gitContext.candidateSha,
    baseSha: gitContext.baseSha,
    mergeBaseSha: gitContext.mergeBaseSha,
    changedPaths: gitContext.changedPaths,
    categories,
    requiredDomains: deriveRequiredDomains(categories),
    inventory: buildInventory(files, assignments),
    assignments,
    parity,
    shards,
    matrices: {
      unit: shards.filter((shard) => shard.category === 'unit'),
      service: shards.filter((shard) => shard.category === 'service'),
      invariant: shards.filter((shard) => shard.category === 'invariant'),
    },
  };
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    const inlineValue =
      separator === -1 ? undefined : argument.slice(separator + 1);
    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }
      return argv[index];
    };
    switch (flag) {
      case '--output':
        options.output = takeValue();
        break;
      case '--candidate':
      case '--candidate-sha':
        options.candidateSha = takeValue();
        break;
      case '--base':
      case '--base-sha':
        options.baseSha = takeValue();
        break;
      case '--repository-root':
        options.repositoryRoot = takeValue();
        break;
      case '--github-output':
        options.githubOutput = takeValue();
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function writePlan(plan, outputPath) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return absolutePath;
}

function writeGithubOutputs(plan, outputPath) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const outputs = {
    regression_matrix: JSON.stringify({ include: plan.shards }),
    unit_matrix: JSON.stringify({ include: plan.matrices.unit }),
    service_matrix: JSON.stringify({ include: plan.matrices.service }),
    invariant_matrix: JSON.stringify({ include: plan.matrices.invariant }),
    inventory_count: String(plan.inventory.total),
    active_test_count: String(plan.inventory.active),
    historical_manual_count: String(plan.inventory.historicalManual),
    assignment_count: String(plan.assignments.length),
    shard_count: String(plan.shards.length),
    changed_path_count: String(plan.changedPaths.length),
    candidate_sha: plan.candidateSha,
    base_sha: plan.baseSha,
    merge_base_sha: plan.mergeBaseSha,
  };
  const content = Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
  fs.appendFileSync(absolutePath, `${content}\n`, 'utf8');
  return absolutePath;
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/ci/plan-ci.cjs [options]',
      '',
      '  --output <path>            Write schemaVersion 1 JSON (or use CI_PLAN_PATH)',
      '  --candidate-sha <sha>      Exact candidate commit SHA (or CI_CANDIDATE_SHA)',
      '  --base-sha <sha>           Exact base commit SHA (or CI_BASE_SHA)',
      '  --repository-root <path>   Repository root (defaults to this repository)',
      '  --github-output <path>     Append compact matrices and counts',
      '',
    ].join('\n'),
  );
}

function main(argv = process.argv.slice(2), environment = process.env) {
  const cli = parseCliArgs(argv);
  if (cli.help) {
    printUsage();
    return null;
  }
  const repositoryRoot = path.resolve(
    cli.repositoryRoot ?? path.resolve(__dirname, '../..'),
  );
  const plan = createCiPlan({
    repositoryRoot,
    environment,
    candidateSha: cli.candidateSha,
    baseSha: cli.baseSha,
  });
  const outputPath = cli.output ?? environment.CI_PLAN_PATH;
  const githubOutputPath = cli.githubOutput ?? environment.GITHUB_OUTPUT;
  if (outputPath) writePlan(plan, outputPath);
  if (githubOutputPath) writeGithubOutputs(plan, githubOutputPath);
  if (outputPath) {
    process.stdout.write(
      `CI plan: ${plan.inventory.total} tests, ${plan.shards.length} shards, ${plan.changedPaths.length} changed paths\n`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  }
  return plan;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  ACTIVE_TAP_OWNERS,
  ALL_REQUIRED_DOMAINS,
  HISTORICAL_MANUAL_TAP_FILES,
  GITHUB_JOB_OVERHEAD_MINUTES,
  MEDIA_RUNTIME_JEST_FILES,
  PROFILE_DEFINITIONS,
  assertCompleteParity,
  assignTests,
  calculateParity,
  categorizeChangedPath,
  classifyChangedPaths,
  classifyTestFile,
  createCiPlan,
  createShards,
  deriveRequiredDomains,
  discoverTestFiles,
  listRepositoryFiles,
  main,
  normalizeRepositoryPath,
  parseCliArgs,
  requireExactSha,
  resolveGitContext,
  roundRobin,
  writeGithubOutputs,
  writePlan,
};
