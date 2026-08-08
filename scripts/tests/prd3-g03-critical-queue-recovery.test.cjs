'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');
const G03_TEST_PATH = 'scripts/tests/prd3-g03-critical-queue-recovery.test.cjs';
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Q017, D015, ADR-0009, and G03 governance are accepted consistently', () => {
  const adr = read('adr/ADR-0009-critical-job-recovery-and-reconciliation.md');
  const decisions = read(
    'docs/production-readiness/phase-0/02-production-decision-register.md',
  );
  const matrix = read(
    'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  );
  const dispositions = read(
    'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  );

  assert.match(adr, /## Status\s+Accepted/u);
  assert.match(adr, /Owner: Abdallah/u);
  assert.match(adr, /2026-08-06T10:30:34\+03:00/u);
  assert.match(adr, /PRD0-D015/u);
  assert.match(adr, /PRD0-Q017/u);
  assert.match(
    decisions,
    /PRD0-D015 \| Critical job recovery\/reconciliation \| LOCKED_FROM_APPROVED_CONTEXT/u,
  );
  assert.equal(questionDispositionStatus(dispositions, 'PRD0-Q017'), 'APPROVED');
  assertDispositionTotalsConsistent(dispositions);
  assert.match(
    matrix,
    /PRD3-G03=IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE/u,
  );
  assert.doesNotMatch(matrix, /PHASE_3=COMPLETE/u);
  for (const relativePath of [
    'docs/production-readiness/phase-0/02-production-decision-register.md',
    'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
    'docs/production-readiness/phase-0/05-owner-decision-disposition-register.md',
  ]) {
    const currentSeparators = markdownTableSeparators(read(relativePath));
    const baselineSeparators = markdownTableSeparators(
      command('git', ['show', `HEAD:${relativePath}`]).stdout,
    );
    assert.deepEqual(
      currentSeparators,
      baselineSeparators,
      `unrelated Markdown separator drift in ${relativePath}`,
    );
  }
});

test('G03 disposition totals are consistent without owning later approval counts', () => {
  const alternateApprovalSplit = [
    '| Disposition | Count |',
    '| --- | ---: |',
    '| Total | 48 |',
    '| APPROVED | 19 |',
    '| PENDING | 29 |',
    '| Omitted | 0 |',
    '| Duplicated | 0 |',
  ].join('\n');
  const totals = assertDispositionTotalsConsistent(alternateApprovalSplit);
  assert.equal(totals.APPROVED, 19);
  assert.equal(totals.PENDING, 29);

  assert.throws(() =>
    assertDispositionTotalsConsistent(
      alternateApprovalSplit.replace('| Total | 48 |', '| Total | 47 |'),
    ),
  );
  assert.throws(() =>
    assertDispositionTotalsConsistent(
      alternateApprovalSplit.replace('| Omitted | 0 |', '| Omitted | 1 |'),
    ),
  );
  assert.throws(() =>
    assertDispositionTotalsConsistent(
      alternateApprovalSplit.replace('| Duplicated | 0 |', '| Duplicated | 1 |'),
    ),
  );
});

test('timeless source discovery uses current tracked TypeScript source', () => {
  const sourcePaths = trackedSourcePaths();
  assert.ok(sourcePaths.length > 0);
  assert.ok(
    sourcePaths.every(
      (relativePath) =>
        relativePath.startsWith('src/') && relativePath.endsWith('.ts'),
    ),
  );
  assert.ok(allSourceText().length > 0);

  const testSource = read(G03_TEST_PATH);
  const discoverySource =
    /function trackedSourcePaths\(\)[\s\S]*?function markdownTableSeparators/u.exec(
      testSource,
    )?.[0] ?? '';
  assert.match(discoverySource, /\['ls-files', '--', 'src'\]/u);
  assert.doesNotMatch(
    discoverySource,
    /changedPaths|status --short|node_modules|dist|coverage|\.env/u,
  );
});

test('candidate scope and changed-file security checks remain diff-based', () => {
  const testSource = read(G03_TEST_PATH);
  assert.match(
    testSource,
    /test\('schema, migrations, dependencies, lockfile, and public API stay unchanged'[\s\S]*?const changed = changedPaths\(\);/u,
  );
  assert.match(
    testSource,
    /test\('changed paths stay inside the bounded G03 implementation'[\s\S]*?const unexpected = changedPaths\(\)\.filter/u,
  );
  assert.match(
    testSource,
    /test\('changed executable and evidence files contain no real secret or unsafe shell literal'[\s\S]*?const paths = changedPaths\(\)\.filter/u,
  );
});

test('the existing seven queues and seven consumers remain the complete inventory', () => {
  const manifest = read('src/modules/health/operational-probe.manifests.ts');
  const coreModule = read(
    'src/runtime/core-worker/core-worker-consumers.module.ts',
  );
  const mediaModule = read(
    'src/runtime/media-worker/media-worker-consumer.module.ts',
  );
  const queues = [
    'communication-notifications',
    'communication-notification-push',
    'school-email-delivery',
    'files-imports',
    'dismissal-request-expiry',
    'learning-media-cleanup',
    'settings-branding-logo-cleanup',
  ];
  for (const queue of queues) assert.match(manifest, new RegExp(queue, 'u'));
  const providerBlock =
    /CORE_WORKER_CONSUMER_PROVIDERS = Object\.freeze\(\[([\s\S]*?)\]\s+satisfies Provider\[\]\)/u.exec(
      coreModule,
    )?.[1];
  assert.ok(providerBlock);
  assert.equal((providerBlock.match(/Worker|Service/gu) || []).length, 6);
  assert.match(mediaModule, /LearningMediaCleanupService/u);
  assert.equal(queues.length, 7);
});

test('Maintenance Scheduler owns exactly seven current repeat definitions', () => {
  const schedules = read(
    'src/runtime/maintenance-scheduler/maintenance-schedules.module.ts',
  );
  const runtimeContract = read(
    'src/runtime/runtime-role.module-contract.spec.ts',
  );
  const manifest = read('src/modules/health/operational-probe.manifests.ts');

  assert.match(runtimeContract, /owns exactly seven registrations/u);
  assert.match(runtimeContract, /toHaveBeenCalledTimes\(7\)/u);
  assert.equal((schedules.match(/Schedule,/gu) || []).length, 7);
  assert.equal((manifest.match(/queueName:/gu) || []).length, 7);
  for (const jobName of [
    'communication.announcement.notifications.reconcile',
    'communication.notification.push.reconcile',
    'school.email.delivery.reconcile',
    'files.imports.reconcile',
  ]) {
    const source = allSourceText();
    assert.match(source, new RegExp(jobName.replaceAll('.', '\\.'), 'u'));
  }
});

test('the shared primitive locks finished replacement and preserves active work', () => {
  const source = read('src/infrastructure/queue/bullmq.service.ts');
  assert.match(source, /ensureJobFromPersistedTruth/u);
  assert.match(source, /queue_recovery_job_id_required/u);
  assert.match(source, /SET NX PX|client\.set\([\s\S]*?'PX'[\s\S]*?'NX'/u);
  assert.match(
    source,
    /FINISHED_JOB_STATES = new Set\(\['completed', 'failed'\]\)/u,
  );
  assert.match(source, /const current = await queue\.getJob/u);
  assert.match(source, /RELEASE_OWNED_LOCK_SCRIPT/u);
  assert.doesNotMatch(
    /ensureJobFromPersistedTruth[\s\S]*?async registerRepeatJob/u.exec(
      source,
    )?.[0] || '',
    /existing\.data/u,
  );
  assert.match(source, /desiredRepeatRegistrations/u);
  assert.match(source, /repeatRestorationFlight/u);
  assert.match(source, /haveAllDesiredRepeatRegistrations/u);
});

test('all queue-specific retry, terminal, ambiguity, and deterministic-ID policies exist', () => {
  const source = allSourceText();
  for (const value of [
    'communication_push_retryable_failure',
    'push/recovery-window-expired',
    'recovery_outcome_unknown',
    'school-email-delivery.',
    '@moazez.invalid',
    'import_recovery_storage_unavailable',
    'import_terminal_object_missing',
    'import_terminal_recovery_window_expired',
    'dismissal_expiry_batch_mutation_failed',
    'branding-logo-cleanup-${fileId}',
    'learning_media_cleanup_job_unknown',
  ]) {
    assert.ok(source.includes(value), `missing policy marker ${value}`);
  }
  assert.match(
    read('src/runtime/maintenance-scheduler/dismissal-expiry.schedule.ts'),
    /attempts: 3,[\s\S]*?type: 'exponential', delay: 1000/u,
  );
});

test('poison jobs receive stable handling without becoming persisted truth', () => {
  const sources = [
    'src/modules/communication/infrastructure/communication-notification-generation.worker.ts',
    'src/modules/communication/infrastructure/communication-notification-push.worker.ts',
    'src/modules/settings/email/delivery/infrastructure/school-email-delivery.worker.ts',
    'src/modules/files/imports/infrastructure/import-validation.worker.ts',
    'src/modules/dismissal/requests/worker/dismissal-request-expiry.worker.ts',
    'src/modules/files/uploads/application/learning-media-cleanup.service.ts',
    'src/modules/settings/branding/infrastructure/branding-logo-cleanup.worker.ts',
  ]
    .map(read)
    .join('\n');
  assert.equal((sources.match(/job_unknown/gu) || []).length >= 6, true);
  assert.match(sources, /learning_media_cleanup_job_invalid/u);
  assert.doesNotMatch(sources, /failedJob\.data|copy.*payload/iu);
});

test('real harness uses immutable local images, empty replacement, and exact cleanup', () => {
  const wrapper = read('scripts/ci/prd3-g03-critical-queue-recovery.cjs');
  const integration = read(
    'test/integration/prd3-g03-critical-queue-recovery.integration.spec.ts',
  );
  assert.match(wrapper, /--pull',\s*'never'/u);
  assert.match(wrapper, /127\.0\.0\.1:\$\{resource\.port\}/u);
  assert.match(wrapper, /--tmpfs/u);
  assert.match(wrapper, /container_ownership_mismatch/u);
  assert.match(wrapper, /network_ownership_mismatch/u);
  assert.match(wrapper, /owned_resource_cleanup_incomplete/u);
  assert.match(
    wrapper,
    /node_modules[\s\S]*?prisma[\s\S]*?build[\s\S]*?index\.js/u,
  );
  assert.match(
    wrapper,
    /spawnSync\(\s*process\.execPath,[\s\S]*?'generate'[\s\S]*?'--schema'[\s\S]*?schema\.prisma/u,
  );
  assert.match(wrapper, /timeout: PRISMA_GENERATE_TIMEOUT_MS/u);
  assert.match(wrapper, /maxBuffer: 8 \* 1024 \* 1024/u);
  assert.match(wrapper, /prd3_g03_prisma_client_generation_failed/u);
  assert.ok(
    wrapper.indexOf('generatePrismaClient(prismaCli, databaseUrl)') <
      wrapper.indexOf('const testRun = spawnSync'),
  );
  assert.doesNotMatch(wrapper, /--forceExit/u);
  assert.match(
    integration,
    /expect\(redisAdmin\(\['DBSIZE'\], true\)\)\.toBe\('0'\)/u,
  );
  assert.match(integration, /redisCopies: 0/u);
  assert.match(wrapper, /'migrate', 'deploy'/u);
  assert.match(integration, /productionModelSourceCount: 7/u);
  assert.match(integration, /productionStoragePathCount: 3/u);
  assert.match(integration, /productionWorkerDispatchCount: 7/u);
  assert.match(integration, /poisonRejectedCount/u);
  assert.match(integration, /actualUniqueScheduleRegistrations: 7/u);
  assert.match(
    integration,
    /expect\(dispatch\.pushKnownSuccessReplayCount\)\.toBe\(0\)/u,
  );
  assert.match(
    integration,
    /expect\(dispatch\.emailOutcomeUnknownReplayCount\)\.toBe\(0\)/u,
  );
  assert.equal(
    integration.includes(['g03', 'domain', 'truth'].join('_')),
    false,
  );
  assert.equal(
    integration.includes(['g03', 'poison', 'job', 'rejected'].join('_')),
    false,
  );
  assert.doesNotMatch(integration, /\bnew Worker\s*\(/u);
});

test('R1 terminal discovery and provider phases are explicit production contracts', () => {
  const pushRepository = read(
    'src/modules/communication/infrastructure/communication-notification-push.repository.ts',
  );
  const emailRepository = read(
    'src/modules/settings/email/delivery/infrastructure/email-delivery.repository.ts',
  );
  const importRepository = read(
    'src/modules/files/imports/infrastructure/import-jobs.repository.ts',
  );
  const emailTransport = read(
    'src/modules/settings/email/delivery/transport/email-transport.ts',
  );
  const emailProcessor = read(
    'src/modules/settings/email/delivery/application/process-email-delivery-recipient.use-case.ts',
  );
  for (const marker of [
    'push/tenant-ineligible',
    'push/recipient-ineligible',
    'recovery_terminal:tenant_ineligible',
    'recovery_terminal:source_ineligible',
    'import_terminal_tenant_ineligible',
    'import_terminal_source_ineligible',
  ]) {
    assert.ok(
      `${pushRepository}\n${emailRepository}\n${importRepository}`.includes(
        marker,
      ),
      `missing R1 marker ${marker}`,
    );
  }
  for (const phase of [
    'PRE_PROVIDER_ATTEMPT',
    'KNOWN_PROVIDER_REJECTION',
    'AMBIGUOUS_AFTER_PROVIDER_ATTEMPT',
  ]) {
    assert.ok(
      `${emailTransport}\n${emailProcessor}`.includes(phase),
      `missing provider phase ${phase}`,
    );
  }
  assert.doesNotMatch(
    `${emailRepository}\n${importRepository}`,
    /actorUserId\s*\?\?\s*(?:candidate|persisted)\.id/u,
  );
});

test('R2/R3 actorless recovery and type-safe primary generation are enforced', () => {
  const pushContract = read(
    'src/modules/communication/application/communication-notification-push-queue.service.ts',
  );
  const generationContract = read(
    'src/modules/communication/domain/communication-notification-generation-domain.ts',
  );
  const generationService = read(
    'src/modules/communication/application/communication-notification-generation.service.ts',
  );
  const pushWorker = read(
    'src/modules/communication/infrastructure/communication-notification-push.worker.ts',
  );
  const generationRepository = read(
    'src/modules/communication/infrastructure/communication-notification-generation.repository.ts',
  );
  const generationWorker = read(
    'src/modules/communication/infrastructure/communication-notification-generation.worker.ts',
  );
  const integration = read(
    'test/integration/prd3-g03-critical-queue-recovery.integration.spec.ts',
  );

  assert.match(pushContract, /actorUserId: string \| null;/u);
  assert.match(pushContract, /actorUserType: UserType \| null;/u);
  assert.match(generationContract, /actorUserId: string \| null;/u);
  assert.match(generationContract, /actorUserType: UserType \| null;/u);
  assert.match(
    generationWorker,
    /createWorker<\s*CommunicationAnnouncementNotificationGenerationJobData,\s*void\s*>/u,
  );
  assert.doesNotMatch(
    generationWorker,
    /CommunicationNotificationGenerationWorkerJobData|as unknown as CommunicationAnnouncementNotificationGenerationJobData/u,
  );
  assert.match(
    generationWorker,
    /generateForPublishedAnnouncement\(job\.data\)/u,
  );
  assert.match(generationService, /actorUserId: string \| null;/u);
  assert.doesNotMatch(generationService, /if \(!input\.actorUserId\) return;/u);
  assert.match(
    pushWorker,
    /if \(job\.data\.actorUserId && job\.data\.actorUserType\)/u,
  );
  assert.match(
    generationWorker,
    /if \(job\.data\.actorUserId && job\.data\.actorUserType\)/u,
  );
  assert.doesNotMatch(generationWorker, /UserType\.SERVICE_ACCOUNT/u);
  assert.match(
    generationRepository,
    /const actor = row\.publishedBy \?\? row\.createdBy \?\? null/u,
  );
  assert.doesNotMatch(
    generationRepository,
    /candidate\?\.status === UserStatus\.ACTIVE/u,
  );
  assert.match(integration, /new CommunicationNotificationGenerationService\(/u);
  assert.match(
    integration,
    /name: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME/u,
  );
  assert.match(integration, /createdCommunicationNotifications: 1/u);
  assert.match(integration, /duplicateNotificationRows: 0/u);
  assert.match(integration, /fabricatedActorCount: 0/u);
  assert.doesNotMatch(
    integration,
    /new CommunicationNotificationGenerationWorker\([\s\S]{0,120}\{\}\s+as\s+any/u,
  );
});

test('schema, migrations, dependencies, lockfile, and public API stay unchanged', () => {
  const changed = changedPaths();
  assert.equal(
    changed.some((entry) => entry.startsWith('prisma/')),
    false,
  );
  assert.equal(changed.includes('package-lock.json'), false);
  assert.equal(
    changed.some((entry) => /(?:controller|dto)\.ts$/u.test(entry)),
    false,
  );
  const baseline = JSON.parse(
    command('git', ['show', 'HEAD:package.json']).stdout,
  );
  const current = JSON.parse(read('package.json'));
  assert.deepEqual(current.dependencies, baseline.dependencies);
  assert.deepEqual(current.devDependencies, baseline.devDependencies);
});

test('changed paths stay inside the bounded G03 implementation', () => {
  const allowed = [
    '.github/workflows/learning-media-integrity.yml',
    'adr/ADR-0009-',
    'docs/production-readiness/phase-0/02-',
    'docs/production-readiness/phase-0/03-',
    'docs/production-readiness/phase-0/05-',
    'docs/production-readiness/phase-3/06-',
    'package.json',
    'scripts/ci/prd3-g02-redis-topology-recovery.cjs',
    'scripts/ci/prd3-g03-',
    'scripts/tests/prd3-g02-redis-topology-recovery.test.cjs',
    'scripts/tests/prd3-g03-',
    'src/infrastructure/queue/',
    'src/modules/communication/',
    'src/modules/dismissal/',
    'src/modules/files/imports/',
    'src/modules/files/uploads/application/learning-media-cleanup.service.ts',
    'src/modules/files/uploads/tests/file-upload-session.contract.spec.ts',
    'src/modules/settings/branding/',
    'src/modules/settings/email/',
    'src/modules/health/operational-probe.manifests.ts',
    'src/runtime/',
    'test/integration/prd3-g03-',
  ];
  const unexpected = changedPaths().filter(
    (entry) => !allowed.some((prefix) => entry.startsWith(prefix)),
  );
  assert.deepEqual(unexpected, []);
});

test('changed executable and evidence files contain no real secret or unsafe shell literal', () => {
  const paths = changedPaths().filter(
    (entry) =>
      /\.(?:ts|cjs|md|json)$/u.test(entry) &&
      entry !== 'scripts/tests/prd3-g03-critical-queue-recovery.test.cjs' &&
      entry !== 'scripts/ci/prd3-g02-redis-topology-recovery.cjs',
  );
  const forbidden = [
    /(?:redis|rediss|postgresql):\/\/[^\s'"`]+/iu,
    /shell:\s*true/iu,
    /tokenCiphertext\s*[:=]\s*['"][^'"]+/iu,
    /SMTP password/iu,
    /Firebase credential/iu,
    /private endpoint/iu,
    /provider secret/iu,
  ];
  const findings = [];
  for (const relativePath of paths) {
    const source = read(relativePath);
    for (const pattern of forbidden) {
      if (!pattern.test(source)) continue;
      const syntheticTestFixture =
        /(?:\.spec\.ts|test\/integration\/)/u.test(relativePath) &&
        (pattern.source.includes('tokenCiphertext') ||
          /(?:127\.0\.0\.1|test\.invalid|private\.internal)/u.test(source));
      if (!syntheticTestFixture) findings.push(`${relativePath}:${pattern}`);
    }
  }
  assert.deepEqual(findings, []);
});

function parseDispositionTotals(source) {
  const totals = Object.create(null);
  for (const line of source.split(/\r?\n/u)) {
    const match =
      /^\|\s*(Total|APPROVED|PENDING|Omitted|Duplicated)\s*\|\s*(\d+)\s*\|$/u.exec(
        line,
      );
    if (!match) continue;
    assert.equal(
      Object.hasOwn(totals, match[1]),
      false,
      `duplicate disposition total ${match[1]}`,
    );
    totals[match[1]] = Number(match[2]);
  }
  assert.deepEqual(Object.keys(totals).sort(), [
    'APPROVED',
    'Duplicated',
    'Omitted',
    'PENDING',
    'Total',
  ]);
  return totals;
}

function assertDispositionTotalsConsistent(source) {
  const totals = parseDispositionTotals(source);
  assert.equal(totals.Total, 48);
  assert.equal(totals.APPROVED + totals.PENDING, totals.Total);
  assert.equal(totals.Omitted, 0);
  assert.equal(totals.Duplicated, 0);
  return totals;
}

function questionDispositionStatus(source, questionId) {
  const rows = source
    .split(/\r?\n/u)
    .map((line) =>
      /^\|\s*(PRD0-Q\d{3})\s*\|\s*([A-Z_]+)\s*\|/u.exec(line),
    )
    .filter((match) => match?.[1] === questionId);
  assert.equal(rows.length, 1, `expected one disposition for ${questionId}`);
  return rows[0][2];
}

function trackedSourcePaths() {
  const sourcePaths = command('git', ['ls-files', '--', 'src'])
    .stdout.split(/\r?\n/u)
    .filter(Boolean)
    .map((relativePath) => relativePath.replaceAll('\\', '/'))
    .filter(
      (relativePath) =>
        relativePath.startsWith('src/') && relativePath.endsWith('.ts'),
    )
    .sort();
  assert.ok(sourcePaths.length > 0, 'tracked TypeScript source inventory is empty');
  return sourcePaths;
}

function allSourceText() {
  const source = trackedSourcePaths().map(read).join('\n');
  assert.ok(source.length > 0, 'tracked TypeScript source text is empty');
  return source;
}

function markdownTableSeparators(source) {
  return source
    .split(/\r?\n/u)
    .filter((line) => /^\|[ |:-]+\|$/u.test(line));
}

function changedPaths() {
  return command('git', ['status', '--short'])
    .stdout.split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'));
}

function command(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${executable}_failed`);
  }
  return result;
}
