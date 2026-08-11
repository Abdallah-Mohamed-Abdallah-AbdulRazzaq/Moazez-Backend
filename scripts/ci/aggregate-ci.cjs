'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  FAILURE_CLASSIFICATIONS,
  sanitizeEvidence,
} = require('./run-ci-shard.cjs');

const REQUIRED_JOB_IDS = Object.freeze(['plan', 'preflight', 'regression']);
const ACCEPTED_RESULTS = new Set([
  'success',
  'failure',
  'cancelled',
  'skipped',
]);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    const inline = separator === -1 ? undefined : argument.slice(separator + 1);
    const take = () => {
      if (inline !== undefined) return inline;
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }
      return argv[index];
    };
    if (flag === '--plan') result.planPath = take();
    else if (flag === '--evidence-dir') result.evidenceDirectory = take();
    else if (flag === '--output') result.outputPath = take();
    else if (flag === '--summary') result.summaryPath = take();
    else if (flag === '--needs-json') result.needsJson = take();
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function readJsonIfPresent(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return {
      __parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeNeeds(value) {
  if (!value) return {};
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('needs JSON must be an object');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([jobId, record]) => {
      const result = record?.result;
      if (!ACCEPTED_RESULTS.has(result)) {
        return [jobId, { result: 'missing' }];
      }
      return [jobId, { result }];
    }),
  );
}

function classifyJobResult(result, options = {}) {
  if (result === 'success') return null;
  if (result === 'cancelled') {
    return options.superseded === true
      ? 'CANCELLED_SUPERSEDED'
      : 'UNCLASSIFIED';
  }
  if (result === 'skipped' || result === 'missing')
    return 'WORKFLOW_CONFIGURATION_FAILURE';
  if (result === 'failure') return 'UNCLASSIFIED';
  return 'WORKFLOW_CONFIGURATION_FAILURE';
}

function validatePlan(plan) {
  if (!plan || plan.__parseError)
    throw new Error('CI plan artifact is missing or invalid');
  if (plan.schemaVersion !== 1) throw new Error('Unsupported CI plan schema');
  if (!/^[0-9a-f]{40}$/u.test(plan.candidateSha ?? '')) {
    throw new Error('CI plan candidate SHA is invalid');
  }
  if (!/^[0-9a-f]{40}$/u.test(plan.baseSha ?? '')) {
    throw new Error('CI plan base SHA is invalid');
  }
  if (!Array.isArray(plan.shards) || !Array.isArray(plan.assignments)) {
    throw new Error('CI plan does not contain shards and assignments');
  }
}

function validateExpectedPlanIdentity(plan, candidateSha, baseSha) {
  if (!/^[0-9a-f]{40}$/u.test(candidateSha ?? '')) {
    throw new Error('Independent expected candidate SHA is invalid');
  }
  if (!/^[0-9a-f]{40}$/u.test(baseSha ?? '')) {
    throw new Error('Independent expected base SHA is invalid');
  }
  if (plan.candidateSha !== candidateSha) {
    throw new Error('CI plan candidate SHA differs from the workflow identity');
  }
  if (plan.baseSha !== baseSha) {
    throw new Error('CI plan base SHA differs from the workflow identity');
  }
}

function validateEvidenceMetrics(record, expectedTestFileCount, source) {
  const issues = [];
  if (record.testFileCount !== expectedTestFileCount) {
    issues.push({
      source,
      message: 'testFileCount does not match the planned file count',
      classification: 'ARTIFACT_FAILURE',
    });
  }
  for (const field of ['testSuiteCount', 'testCount', 'skippedTestCount']) {
    const value = record[field];
    if (
      !Object.hasOwn(record, field) ||
      (value !== null && (!Number.isSafeInteger(value) || value < 0))
    ) {
      issues.push({
        source,
        message: `${field} must be present as null or a nonnegative integer`,
        classification: 'ARTIFACT_FAILURE',
      });
    }
  }
  if (
    Number.isSafeInteger(record.testCount) &&
    Number.isSafeInteger(record.skippedTestCount) &&
    record.skippedTestCount > record.testCount
  ) {
    issues.push({
      source,
      message: 'skippedTestCount cannot exceed testCount',
      classification: 'ARTIFACT_FAILURE',
    });
  }
  const startedMs = Date.parse(record.startedAt);
  const finishedMs = Date.parse(record.finishedAt);
  const canonicalStartedAt = Number.isFinite(startedMs)
    ? new Date(startedMs).toISOString()
    : null;
  const canonicalFinishedAt = Number.isFinite(finishedMs)
    ? new Date(finishedMs).toISOString()
    : null;
  if (
    canonicalStartedAt !== record.startedAt ||
    canonicalFinishedAt !== record.finishedAt ||
    finishedMs < startedMs ||
    !Number.isSafeInteger(record.durationMs) ||
    record.durationMs < 0 ||
    record.durationMs !== finishedMs - startedMs
  ) {
    issues.push({
      source,
      message: 'evidence timing fields are missing, invalid, or inconsistent',
      classification: 'ARTIFACT_FAILURE',
    });
  }
  return issues;
}

function validateResultSemantics(record, source) {
  if (record.status !== 'PASS') return [];
  const contradictoryFailureMetadata = [
    'failure',
    'primaryClassification',
    'cleanupFailures',
  ].some((field) => Object.hasOwn(record, field));
  if (
    record.classification !== null ||
    (Object.hasOwn(record, 'timedOut') && record.timedOut !== false) ||
    contradictoryFailureMetadata
  ) {
    return [
      {
        source,
        message: 'passing evidence contains contradictory failure metadata',
        classification: 'ARTIFACT_FAILURE',
      },
    ];
  }
  return [];
}

function validateShardEvidence(record, plan, shard) {
  const issues = [];
  if (!record || record.__parseError) {
    issues.push({
      source: shard.id,
      message: record?.__parseError ?? 'evidence artifact is missing',
      classification: 'ARTIFACT_FAILURE',
    });
    return issues;
  }
  const expected = {
    schemaVersion: 1,
    candidateSha: plan.candidateSha,
    baseSha: plan.baseSha,
    jobId: shard.id,
    category: shard.category,
    profile: shard.profile,
    shardIndex: shard.index,
    shardTotal: shard.total,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record[field] !== value) {
      issues.push({
        source: shard.id,
        message: `${field} mismatch`,
        classification: 'ARTIFACT_FAILURE',
      });
    }
  }
  issues.push(...validateEvidenceMetrics(record, shard.files.length, shard.id));
  issues.push(...validateResultSemantics(record, shard.id));
  if (
    !Array.isArray(record.testFiles) ||
    !Array.isArray(record.executedTestFiles)
  ) {
    issues.push({
      source: shard.id,
      message: 'test file evidence is missing',
      classification: 'ARTIFACT_FAILURE',
    });
  } else {
    const expectedFiles = [...shard.files].sort(compareText);
    const declaredFiles = [...record.testFiles].sort(compareText);
    const executedFiles = [...record.executedTestFiles].sort(compareText);
    if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles)) {
      issues.push({
        source: shard.id,
        message: 'declared test files differ from the plan',
        classification: 'CI_ORCHESTRATOR_FAILURE',
      });
    }
    const expectedFileSet = new Set(expectedFiles);
    const executedFileSet = new Set(executedFiles);
    const invalidExecutionEvidence =
      executedFileSet.size !== executedFiles.length ||
      executedFiles.some((file) => !expectedFileSet.has(file));
    if (
      invalidExecutionEvidence ||
      (record.status === 'PASS' &&
        JSON.stringify(executedFiles) !== JSON.stringify(expectedFiles))
    ) {
      issues.push({
        source: shard.id,
        message:
          record.status === 'PASS'
            ? 'passing shard execution differs from the plan'
            : 'failed shard execution contains invalid test ownership',
        classification: 'CI_ORCHESTRATOR_FAILURE',
      });
    }
  }
  if (record.status !== 'PASS') {
    issues.push({
      source: shard.id,
      message: `shard status is ${record.status ?? 'missing'}`,
      classification: FAILURE_CLASSIFICATIONS.includes(record.classification)
        ? record.classification
        : 'UNCLASSIFIED',
    });
  }
  if (record.cleanupStatus !== 'PASS') {
    issues.push({
      source: shard.id,
      message: `cleanup status is ${record.cleanupStatus ?? 'missing'}`,
      classification: 'TEARDOWN_FAILURE',
    });
  }
  return issues;
}

function validatePreflightEvidence(record, plan) {
  const issues = [];
  if (!record || record.__parseError) {
    return [
      {
        source: 'preflight',
        message:
          record?.__parseError ?? 'preflight evidence artifact is missing',
        classification: 'ARTIFACT_FAILURE',
      },
    ];
  }
  const expected = {
    schemaVersion: 1,
    candidateSha: plan.candidateSha,
    baseSha: plan.baseSha,
    jobId: 'preflight',
    category: 'preflight',
    profile: 'preflight',
    shardIndex: 1,
    shardTotal: 1,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record[field] !== value) {
      issues.push({
        source: 'preflight',
        message: `preflight ${field} does not match the plan`,
        classification: 'ARTIFACT_FAILURE',
      });
    }
  }
  issues.push(...validateEvidenceMetrics(record, 0, 'preflight'));
  issues.push(...validateResultSemantics(record, 'preflight'));
  if (
    !Array.isArray(record.testFiles) ||
    !Array.isArray(record.executedTestFiles) ||
    record.testFiles.length !== 0 ||
    record.executedTestFiles.length !== 0
  ) {
    issues.push({
      source: 'preflight',
      message: 'preflight must own and execute zero regression test files',
      classification: 'ARTIFACT_FAILURE',
    });
  }
  if (record.status !== 'PASS') {
    issues.push({
      source: 'preflight',
      message: `preflight status is ${record.status ?? 'missing'}`,
      classification: FAILURE_CLASSIFICATIONS.includes(record.classification)
        ? record.classification
        : 'UNCLASSIFIED',
    });
  }
  if (record.cleanupStatus !== 'PASS') {
    issues.push({
      source: 'preflight',
      message: `preflight cleanup status is ${record.cleanupStatus ?? 'missing'}`,
      classification: 'TEARDOWN_FAILURE',
    });
  }
  return issues;
}

function calculateExecutionParity(plan, records) {
  const expected = plan.assignments
    .filter((assignment) => assignment.execution === 'pull-request')
    .map((assignment) => assignment.file)
    .sort(compareText);
  const counts = new Map();
  for (const record of records) {
    if (!Array.isArray(record?.executedTestFiles)) continue;
    for (const file of record.executedTestFiles) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }
  const expectedSet = new Set(expected);
  return {
    expectedCount: expected.length,
    executedCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    missing: expected.filter((file) => !counts.has(file)),
    duplicateAssignments: [...counts.entries()]
      .filter(([file, count]) => expectedSet.has(file) && count > 1)
      .sort(([left], [right]) => compareText(left, right))
      .map(([file, count]) => ({ file, count })),
    unexpected: [...counts.keys()]
      .filter((file) => !expectedSet.has(file))
      .sort(compareText),
  };
}

function calculateWallClock(records) {
  const starts = records
    .map((record) => Date.parse(record?.startedAt))
    .filter(Number.isFinite);
  const finishes = records
    .map((record) => Date.parse(record?.finishedAt))
    .filter(Number.isFinite);
  if (starts.length === 0 || finishes.length === 0) return null;
  return Math.max(...finishes) - Math.min(...starts);
}

function aggregateCi(options = {}) {
  const plan = options.plan;
  validatePlan(plan);
  const needs = normalizeNeeds(options.needs);
  const records = options.records ?? {};
  const issues = [];
  const notApplicableJobs = new Set(plan.notApplicableJobs ?? []);
  const planResult = needs.plan?.result ?? 'missing';
  const preflightResult = needs.preflight?.result ?? 'missing';
  const regressionResult = needs.regression?.result ?? 'missing';
  const preflightBlockedByPlan =
    planResult !== 'success' && preflightResult === 'skipped';
  const preflightStoppedBeforeEvidence =
    !records.preflight &&
    (preflightBlockedByPlan ||
      preflightResult === 'cancelled' ||
      preflightResult === 'skipped');
  const preflightIssues = preflightStoppedBeforeEvidence
    ? []
    : validatePreflightEvidence(records.preflight, plan);
  issues.push(...preflightIssues);

  if (planResult !== 'success') {
    issues.push({
      source: 'plan',
      message: `required upstream result is ${planResult}`,
      classification: classifyJobResult(planResult),
    });
  }
  if (
    preflightResult !== 'success' &&
    !preflightBlockedByPlan &&
    (preflightResult !== 'failure' || preflightIssues.length === 0)
  ) {
    issues.push({
      source: 'preflight',
      message: `required upstream result is ${preflightResult}`,
      classification: classifyJobResult(preflightResult),
    });
  }
  for (const [jobId, job] of Object.entries(needs)) {
    if (REQUIRED_JOB_IDS.includes(jobId)) continue;
    if (job.result === 'skipped' && notApplicableJobs.has(jobId)) continue;
    if (job.result !== 'success') {
      issues.push({
        source: jobId,
        message: `upstream result is ${job.result}`,
        classification: classifyJobResult(job.result),
      });
    }
  }

  const regressionBlockedByPrerequisite =
    regressionResult === 'skipped' &&
    (planResult !== 'success' || preflightResult !== 'success');
  const regressionStoppedBeforeAllEvidence =
    regressionResult === 'cancelled' || regressionResult === 'skipped';
  const shardRecords = [];
  const shardIssues = [];
  const blockedShardIds = [];
  const cleanupNotRequiredShardIds = [];
  for (const shard of plan.shards) {
    const record = records[shard.id];
    if (record) {
      shardRecords.push(record);
      shardIssues.push(...validateShardEvidence(record, plan, shard));
    } else if (regressionStoppedBeforeAllEvidence) {
      blockedShardIds.push(shard.id);
      if (regressionResult === 'skipped') {
        cleanupNotRequiredShardIds.push(shard.id);
      }
    } else {
      shardIssues.push(...validateShardEvidence(record, plan, shard));
    }
  }
  issues.push(...shardIssues);
  if (regressionResult !== 'success' && !regressionBlockedByPrerequisite) {
    const preciseFailureExists =
      regressionResult === 'failure' && shardIssues.length > 0;
    if (!preciseFailureExists) {
      issues.push({
        source: 'regression',
        message: `required upstream result is ${regressionResult}`,
        classification: classifyJobResult(regressionResult),
      });
    }
  }

  const parity = calculateExecutionParity(plan, shardRecords);
  const ownershipViolation =
    parity.duplicateAssignments.length > 0 || parity.unexpected.length > 0;
  const incompleteBecauseExecutionStopped =
    regressionStoppedBeforeAllEvidence ||
    regressionResult !== 'success' ||
    shardRecords.some((record) => record.status !== 'PASS');
  if (
    ownershipViolation ||
    (parity.missing.length > 0 && !incompleteBecauseExecutionStopped)
  ) {
    issues.push({
      source: 'execution-parity',
      message: 'executed tests do not exactly match active assignments',
      classification: 'CI_ORCHESTRATOR_FAILURE',
    });
  }
  parity.status =
    ownershipViolation ||
    (parity.missing.length > 0 && !incompleteBecauseExecutionStopped)
      ? 'FAIL'
      : parity.missing.length > 0
        ? 'BLOCKED'
        : 'PASS';

  const allRecords = [records.preflight, ...shardRecords].filter(Boolean);
  const classifications = [
    ...new Set(issues.map((issue) => issue.classification)),
  ].sort(compareText);
  const failedShardIds = [
    ...new Set(
      issues
        .map((issue) => issue.source)
        .filter((source) => plan.shards.some((shard) => shard.id === source)),
    ),
  ].sort(compareText);
  const hasCompleteEvidence =
    (Boolean(records.preflight) ||
      (preflightStoppedBeforeEvidence && preflightResult === 'skipped')) &&
    shardRecords.length + cleanupNotRequiredShardIds.length ===
      plan.shards.length;
  const cleanupStatus = allRecords.some(
    (record) => record.cleanupStatus !== 'PASS',
  )
    ? 'FAIL'
    : hasCompleteEvidence
      ? allRecords.length === 0
        ? 'NOT_REQUIRED'
        : 'PASS'
      : 'UNKNOWN';
  const status = issues.length === 0 ? 'PASS' : 'FAIL';
  return sanitizeEvidence({
    schemaVersion: 1,
    candidateSha: plan.candidateSha,
    baseSha: plan.baseSha,
    mergeBaseSha: plan.mergeBaseSha,
    changedCategories: plan.categories ?? [],
    requiredDomains: plan.requiredDomains ?? [],
    preflightStatus:
      records.preflight?.status ??
      (preflightStoppedBeforeEvidence ? 'BLOCKED' : 'MISSING'),
    domainStatus: Object.fromEntries(
      (plan.requiredDomains ?? []).map((domain) => [
        domain,
        regressionStoppedBeforeAllEvidence ? 'BLOCKED' : status,
      ]),
    ),
    shardCount: plan.shards.length,
    testsDiscovered: plan.inventory?.active ?? parity.expectedCount,
    testsExecuted: parity.executedCount,
    parity,
    status,
    failedShardIds,
    blockedShardIds: blockedShardIds.sort(compareText),
    shardStatus: Object.fromEntries(
      plan.shards.map((shard) => [
        shard.id,
        records[shard.id]?.status ??
          (blockedShardIds.includes(shard.id) ? 'BLOCKED' : 'MISSING'),
      ]),
    ),
    failureClassifications: classifications,
    cleanupStatus,
    wallClockMs: calculateWallClock(allRecords),
    upstreamResults: needs,
    issues,
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
  });
}

function readEvidenceDirectory(plan, evidenceDirectory) {
  const directory = path.resolve(evidenceDirectory);
  const records = {
    preflight: readJsonIfPresent(path.join(directory, 'preflight.json')),
  };
  for (const shard of plan.shards) {
    records[shard.id] = readJsonIfPresent(
      path.join(directory, `${shard.id}.json`),
    );
  }
  return records;
}

function buildSummaryMarkdown(summary) {
  const failed =
    summary.failedShardIds.length > 0
      ? summary.failedShardIds.join(', ')
      : 'none';
  const classifications =
    summary.failureClassifications.length > 0
      ? summary.failureClassifications.join(', ')
      : 'none';
  const blocked =
    summary.blockedShardIds.length > 0
      ? summary.blockedShardIds.join(', ')
      : 'none';
  const shardOutcomeCounts = Object.values(summary.shardStatus).reduce(
    (counts, status) => {
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const categories =
    summary.changedCategories.length > 0
      ? summary.changedCategories.join(', ')
      : 'none';
  const domains =
    summary.requiredDomains.length > 0
      ? summary.requiredDomains.join(', ')
      : 'none';
  return [
    '# CI / Required',
    '',
    `- Result: **${summary.status}**`,
    `- Candidate SHA: \`${summary.candidateSha}\``,
    `- Base SHA: \`${summary.baseSha}\``,
    `- Changed categories: ${categories}`,
    `- Routed domains: ${domains}`,
    `- Preflight: ${summary.preflightStatus}`,
    `- Shards: ${summary.shardCount}`,
    `- Tests discovered/executed: ${summary.testsDiscovered}/${summary.testsExecuted}`,
    `- Execution parity: ${summary.parity.status} (missing=${summary.parity.missing.length}, duplicate=${summary.parity.duplicateAssignments.length}, unexpected=${summary.parity.unexpected.length})`,
    `- Shard outcomes: PASS=${shardOutcomeCounts.PASS ?? 0}, FAIL=${shardOutcomeCounts.FAIL ?? 0}, BLOCKED=${shardOutcomeCounts.BLOCKED ?? 0}, MISSING=${shardOutcomeCounts.MISSING ?? 0}`,
    `- Failed shards: ${failed}`,
    `- Blocked shards: ${blocked}`,
    `- Failure classifications: ${classifications}`,
    `- Cleanup: ${summary.cleanupStatus}`,
    `- Observed shard wall-clock span: ${summary.wallClockMs ?? 'unavailable'} ms`,
    '',
  ].join('\n');
}

function writeOutput(file, content) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
}

function createFallbackSummary(error, options = {}) {
  return {
    schemaVersion: 1,
    candidateSha: options.candidateSha ?? null,
    baseSha: options.baseSha ?? null,
    status: 'FAIL',
    failureClassifications: ['ARTIFACT_FAILURE'],
    cleanupStatus: 'UNKNOWN',
    failedShardIds: [],
    blockedShardIds: [],
    shardStatus: {},
    changedCategories: [],
    requiredDomains: [],
    testsDiscovered: 0,
    testsExecuted: 0,
    shardCount: 0,
    preflightStatus: 'MISSING',
    parity: {
      status: 'FAIL',
      missing: [],
      duplicateAssignments: [],
      unexpected: [],
    },
    issues: [
      {
        source: 'aggregate',
        message: error instanceof Error ? error.message : String(error),
        classification: 'ARTIFACT_FAILURE',
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

function main(argv = process.argv.slice(2), environment = process.env) {
  const cli = parseCliArgs(argv);
  if (cli.help) {
    process.stdout.write(
      'Usage: node scripts/ci/aggregate-ci.cjs --plan <file> --evidence-dir <dir> --output <file> [--summary <file>]\n',
    );
    return null;
  }
  const planPath = cli.planPath ?? environment.CI_PLAN_PATH;
  const evidenceDirectory =
    cli.evidenceDirectory ?? environment.CI_EVIDENCE_DIR;
  const outputPath = cli.outputPath ?? environment.CI_AGGREGATE_PATH;
  const summaryPath = cli.summaryPath ?? environment.GITHUB_STEP_SUMMARY;
  if (!outputPath) throw new Error('Aggregate output path is required');
  let summary;
  try {
    const plan = readJsonIfPresent(
      path.resolve(planPath ?? 'missing-plan.json'),
    );
    validatePlan(plan);
    validateExpectedPlanIdentity(
      plan,
      environment.CI_CANDIDATE_SHA,
      environment.CI_BASE_SHA,
    );
    const records = readEvidenceDirectory(plan, evidenceDirectory ?? '.');
    summary = aggregateCi({
      plan,
      records,
      needs: cli.needsJson ?? environment.CI_NEEDS_JSON,
    });
  } catch (error) {
    summary = createFallbackSummary(error, {
      candidateSha: environment.CI_CANDIDATE_SHA,
      baseSha: environment.CI_BASE_SHA,
    });
  }
  writeOutput(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  const markdown = buildSummaryMarkdown(summary);
  if (summaryPath) {
    fs.mkdirSync(path.dirname(path.resolve(summaryPath)), { recursive: true });
    fs.appendFileSync(path.resolve(summaryPath), markdown, 'utf8');
  } else {
    process.stdout.write(markdown);
  }
  if (summary.status !== 'PASS') process.exitCode = 1;
  return summary;
}

if (require.main === module) main();

module.exports = {
  ACCEPTED_RESULTS,
  REQUIRED_JOB_IDS,
  aggregateCi,
  buildSummaryMarkdown,
  calculateExecutionParity,
  classifyJobResult,
  createFallbackSummary,
  main,
  normalizeNeeds,
  parseCliArgs,
  readEvidenceDirectory,
  validatePlan,
  validateExpectedPlanIdentity,
  validateEvidenceMetrics,
  validateResultSemantics,
  validatePreflightEvidence,
  validateShardEvidence,
};
