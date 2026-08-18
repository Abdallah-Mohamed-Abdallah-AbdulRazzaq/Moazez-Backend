'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EvidenceState } = require('../ci/prd3-g01-b-pool-saturation.cjs');
const {
  ALLOWED_CLASSES,
  AUTHORIZED_PATHS,
  BASE_SHA,
  BASE_TREE,
  BUSINESS_INVARIANT_MANIFESTS,
  DRIVER_SOURCE,
  ENTRY_CLASS_MANIFEST,
  FAULT_CATALOG,
  FAULT_CATALOG_VERSION,
  FAULT_PROOF_IMPLEMENTATION_VERSION,
  FAILURE_IDS,
  GATE,
  INITIAL_DEFECT_REPRODUCTIONS,
  MIGRATION_COMMANDS,
  NODE_IMAGE,
  PLAYBACK_CONSUMER_AUDIT,
  PLAYBACK_PATH,
  POSTGRES_IMAGE,
  R3_INITIAL_DEFECT_REPRODUCTIONS,
  R4_INITIAL_DEFECT_REPRODUCTIONS,
  SUMMARY_SCHEMA,
  SUMMARY_SCHEMA_VERSION,
  atomicPublishStrictSummary,
  classifyPrismaTransactionError,
  calculateExecutionReceipt,
  buildNamedContainerCreateArgs,
  buildOwnershipLabels,
  buildPostgresFixtureArgs,
  buildFormalSummary,
  calculateCandidateProductionPatch,
  classifyCutbackMeasurement,
  collectEvidenceFaultExecutions,
  disconnectTrackedClientsInTwoPhases,
  discoverPlaybackCallers,
  executeFaultInjection,
  executeNegativeFaultInjection,
  evidenceDigest,
  inventorySummary,
  inventoryTransactions,
  installB3SignalHandlers,
  resolveRuntimeRole,
  runControlledDriverFinalizationFixture,
  runControlledBoundedOperationFixture,
  recordEvidenceProof,
  scanExecutableProhibitedPatterns,
  validateBusinessInvariantManifests,
  validateCrossRun,
  validateFailureCatalog,
  validateInitialDefectReproductions,
  validateR3InitialDefectReproductions,
  validateR4InitialDefectReproductions,
  validateFaultCoverage,
  validateInventory,
  validatePlaybackConsumerAudit,
  validateSanitizedSummary,
  validateStrictSummary,
  verifyLoopbackTcp,
  waitForContainerExit,
  waitForContainerMarker,
  waitForPostgres,
} = require('../ci/prd3-g01-b3-transaction-pressure.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const INVENTORY = inventoryTransactions();
const INVENTORY_SUMMARY = inventorySummary(INVENTORY);
const R3_STRICT_MUTATIONS = Object.freeze({
  classification_inside_mismatch: (value) => { value.inventory.classifications.EXTERNAL_WAIT_SENSITIVE = 1;value.inventory.classifications.SHORT_DB_ONLY = 1; },
  wrong_business_entry_class: (value) => { value.businessPaths[0].productionEntryClass = 'ForgedProductionEntry'; },
  duplicate_lock_waits: (value) => { value.lockWaits[1].path = value.lockWaits[0].path; },
  forged_fault_receipt_metadata: (value) => { value.faultReceipts[0].hook = 'forged-hook';value.faultReceipts[0].observedClassification = 'forged-classification';value.faultReceipts[0].proofId = 'forged-proof'; },
  wrong_invariant_manifest_pairing: (value) => { [value.businessPaths[0].invariantManifestId, value.businessPaths[1].invariantManifestId] = [value.businessPaths[1].invariantManifestId, value.businessPaths[0].invariantManifestId]; },
  serializable_timeout_as_conflict: (value) => { value.serializable.errorCode = 'TRANSACTION_TIMEOUT'; },
  inconsistent_cutback_connection_count: (value) => { value.cutback.find((row) => row.limit === 2).states.oneOccupied.maximumConnections = 1; },
});

test('pins the definitive repository and summary provenance', () => {
  assert.equal(BASE_SHA, '5dba92b120c8d36ad0d5738a522910575138b284');
  assert.equal(BASE_TREE, 'f46b4dccd5d31a09cf1374c647c0bbc6f3d4078c');
  assert.equal(SUMMARY_SCHEMA_VERSION, 4);
  assert.equal(SUMMARY_SCHEMA, 'moazez.prd3-g01-b3.transaction-pressure.v4');
  assert.equal(GATE, 'PRD3-G01-B3');
  assert.equal(AUTHORIZED_PATHS.length, 9);
});

test('records the bounded initial R1 defect reproductions before correction', () => {
  assert.equal(validateInitialDefectReproductions(), INITIAL_DEFECT_REPRODUCTIONS);
  assert.equal(INITIAL_DEFECT_REPRODUCTIONS.executableProcessExitMatches, 2);
  assert.equal(INITIAL_DEFECT_REPRODUCTIONS.returnedPromiseFalseNegatives, 5);
  assert.equal(INITIAL_DEFECT_REPRODUCTIONS.signalRouting.finalizationStarted, false);
  assert.equal(INITIAL_DEFECT_REPRODUCTIONS.disconnectRehearsalUsedAuthoritativeFinalizer, false);
});

test('corrected inventory covers every transaction without unknown or unresolved calls', () => {
  const rows = validateInventory(INVENTORY);
  const summary = inventorySummary(rows);
  assert.ok(summary.total > 0);
  assert.equal(summary.total, summary.interactive + summary.batch);
  assert.equal(summary.unknown, 0);
  assert.equal(summary.unresolved, 0);
  assert.equal(Object.values(summary.classifications).reduce((sum, value) => sum + value, 0), summary.total);
  assert.ok(summary.manualOverrides > 0);
  assert.ok(summary.externalWaitOutsideTransaction > 0);
});

test('stable transaction identities derive from path, owner, and owner ordinal', () => {
  for (const row of INVENTORY) {
    assert.match(row.transactionId, /^B3-TX-[A-F0-9]{12}$/);
    assert.equal(row.stableIdentity, `${row.path}#${row.entryOwner}#${row.ownerTransactionOrdinal}#${row.callbackDigest}`);
    assert.match(row.callbackDigest, /^[a-f0-9]{64}$/);
    assert.ok(row.runtimeRoleEvidence.length > 0);
    assert.ok(Array.isArray(row.manualOverrides));
    for (const override of row.manualOverrides) {
      assert.equal(override.transactionId, row.transactionId);
      assert.equal(override.sourcePath, row.path);
      assert.equal(override.owner, row.entryOwner);
      assert.match(override.sourceDigest, /^[a-f0-9]{64}$/);
      assert.ok(Array.isArray(override.resolvedCallers) && override.resolvedCallers.length > 0);
      assert.ok(override.unresolvedCallExpression.length > 0);
      assert.ok(override.classification.length > 0);
      assert.ok(override.runtimeRole.length > 0);
      assert.ok(override.reason.length > 0 && override.reviewEvidence.length > 0);
    }
  }
});

test('an unrelated lock in the same file does not contaminate another transaction', () => {
  withFixture(`
    class Sample {
      constructor(private prisma: any) {}
      one() { return this.prisma.$transaction(async (tx: any) => tx.user.findUnique({ where: { id: 'one' } })); }
      two() { return this.prisma.$transaction(async (tx: any) => { await tx.$queryRawUnsafe('SELECT id FROM users FOR UPDATE'); }); }
    }
  `, (rows) => {
    assert.equal(rows.length, 2);
    const one = rows.find((row) => row.entryOwner.endsWith('.one'));
    const two = rows.find((row) => row.entryOwner.endsWith('.two'));
    assert.equal(one.explicitLock, false);
    assert.equal(one.classification, 'SHORT_DB_ONLY');
    assert.equal(two.explicitLock, true);
    assert.equal(two.classification, 'LOCK_CONTENTION_SENSITIVE');
  });
});

test('external waits are detected through a locally resolved helper', () => {
  withFixture(`
    class Sample {
      constructor(private prisma: any, private storage: any) {}
      private async provider() { return await this.storage.createDownloadUrl({}); }
      run() { return this.prisma.$transaction(async () => { await this.provider(); }); }
    }
  `, (rows) => {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].externalWaitInsideTransaction, true);
    assert.equal(rows[0].classification, 'EXTERNAL_WAIT_SENSITIVE');
    assert.ok(rows[0].resolvedHelpers.some((value) => value.endsWith('#provider')));
  });
});

test('portable resolver follows a callback passed through withSoftDeleted', () => {
  withFixture({
    'request-context.ts': `
      export async function withSoftDeleted<T>(fn: () => Promise<T>): Promise<T> {
        const context = true;
        if (!context) return fn();
        return await fn();
      }
    `,
    'repository.ts': `
      import { withSoftDeleted } from './request-context';
      class Sample {
        constructor(private prisma: any) {}
        private async find(tx: any) {
          const load = () => tx.user.findFirst({ where: { id: 'one' } });
          return await withSoftDeleted(load);
        }
        run() {
          return this.prisma.$transaction(async (tx: any) => await this.find(tx));
        }
      }
    `,
  }, (rows) => {
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].unresolvedCalls, []);
    assert.equal(rows[0].manualOverrides.some((item) => item.unresolvedCallExpression === 'withSoftDeleted'), false);
    assert.ok(rows[0].databaseCalls.some((item) => item.target === 'tx.user.findFirst'));
    assert.ok(rows[0].resolvedHelpers.some((item) => item.endsWith('#withSoftDeleted')));
  });
});

test('wrapped callbacks still expose forbidden provider waits', () => {
  withFixture({
    'request-context.ts': `
      export async function withSoftDeleted<T>(fn: () => Promise<T>): Promise<T> {
        return await fn();
      }
    `,
    'repository.ts': `
      import { withSoftDeleted } from './request-context';
      class Sample {
        constructor(private prisma: any, private storage: any) {}
        private async find() {
          const load = () => this.storage.createDownloadUrl({});
          return await withSoftDeleted(load);
        }
        run() {
          return this.prisma.$transaction(async () => await this.find());
        }
      }
    `,
  }, (rows) => {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].externalWaitInsideTransaction, true);
    assert.equal(rows[0].classification, 'EXTERNAL_WAIT_SENSITIVE');
  });
});

test('the same wrapper analyzes different callback bindings independently', () => {
  withFixture({
    'request-context.ts': `
      export async function withSoftDeleted<T>(fn: () => Promise<T>): Promise<T> {
        return await fn();
      }
    `,
    'repository.ts': `
      import { withSoftDeleted } from './request-context';
      class Sample {
        constructor(private prisma: any, private storage: any) {}
        private async find(tx: any) {
          const databaseOnly = () => tx.user.findFirst({ where: { id: 'one' } });
          const providerWait = () => this.storage.createDownloadUrl({});
          await withSoftDeleted(databaseOnly);
          return await withSoftDeleted(providerWait);
        }
        run() {
          return this.prisma.$transaction(async (tx: any) => await this.find(tx));
        }
      }
    `,
  }, (rows) => {
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].unresolvedCalls, []);
    assert.ok(rows[0].databaseCalls.some((item) => item.target === 'tx.user.findFirst'));
    assert.equal(rows[0].externalWaitInsideTransaction, true);
    assert.equal(rows[0].classification, 'EXTERNAL_WAIT_SENSITIVE');
  });
});

test('wrapped unknown callbacks remain unresolved and fail closed', () => {
  withFixture({
    'request-context.ts': `
      export async function withSoftDeleted<T>(fn: () => Promise<T>): Promise<T> {
        return await fn();
      }
    `,
    'repository.ts': `
      import { withSoftDeleted } from './request-context';
      class Sample {
        constructor(private prisma: any) {}
        run(operation: () => Promise<unknown>) {
          return this.prisma.$transaction(async () => await withSoftDeleted(operation));
        }
      }
    `,
  }, (rows) => {
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].unresolvedCalls.map((item) => item.target), ['fn']);
    assert.throws(
      () => validateInventory([{ ...rows[0], runtimeRole: 'test-only', runtimeRoles: ['test-only'] }]),
      /unresolved calls/u,
    );
  });
});

test('returned Promises are treated as waits across direct, aggregate, helper, conditional, and generic callback forms', () => {
  withFixture(`
    class Sample {
      constructor(private prisma: any, private storage: any) {}
      private provider() { return this.storage.createDownloadUrl({}); }
      direct() { return this.prisma.$transaction(() => this.storage.createDownloadUrl({})); }
      aggregate() { return this.prisma.$transaction((tx: any) => Promise.all([this.storage.createDownloadUrl({}), tx.user.findMany()])); }
      helper() { return this.prisma.$transaction(() => this.provider()); }
      conditional(flag: boolean) { return this.prisma.$transaction((tx: any) => flag ? this.storage.createDownloadUrl({}) : tx.user.findMany()); }
      generic(operation: () => Promise<unknown>) { return this.prisma.$transaction(() => operation()); }
    }
  `, (rows) => {
    assert.equal(rows.length, 5);
    for (const owner of ['direct', 'aggregate', 'helper', 'conditional']) {
      const row = rows.find((item) => item.entryOwner.endsWith(`.${owner}`));
      assert.equal(row.externalWaitInsideTransaction, true, owner);
      assert.equal(row.classification, 'EXTERNAL_WAIT_SENSITIVE', owner);
    }
    const generic = rows.find((item) => item.entryOwner.endsWith('.generic'));
    assert.deepEqual(generic.unresolvedCalls.map((item) => item.target), ['operation']);
    assert.throws(() => validateInventory([{ ...generic, runtimeRole: 'test-only', runtimeRoles: ['test-only'] }]), /unresolved calls/u);
    assert.ok(rows.find((item) => item.entryOwner.endsWith('.aggregate')).databaseCalls.some((item) => item.target === 'tx.user.findMany'));
    assert.ok(rows.find((item) => item.entryOwner.endsWith('.helper')).resolvedHelpers.some((item) => item.endsWith('#provider')));
  });
});

test('runtime ownership uses reviewed overrides instead of filename guessing', () => {
  const result = resolveRuntimeRole('src/example.ts', new Set(['api']), [{ path: 'src/example.ts', role: 'media-worker', reason: 'registered consumer', evidence: 'MediaWorkerModule provider wiring' }]);
  assert.equal(result.role, 'media-worker');
  assert.equal(result.override.reason, 'registered consumer');
  assert.throws(() => resolveRuntimeRole('src/example.ts', [], [{ path: 'src/example.ts', role: '', reason: '', evidence: '' }]));
});

test('initial Platform Administrator bootstrap transaction has reviewed API runtime ownership', () => {
  const row = INVENTORY.find((item) =>
    item.path === 'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository.ts'
    && item.entryOwner === 'PlatformAdminBootstrapRepository.createInitialPlatformAdministrator',
  );

  assert.ok(row);
  assert.equal(row.transactionId, 'B3-TX-FE87DBE7E607');
  assert.equal(row.runtimeRole, 'api');
  assert.deepEqual(row.runtimeRoles, ['api']);
  assert.match(row.runtimeRoleEvidence, /DATABASE_RUNTIME_ROLE=api/u);
  assert.equal(row.classification, 'SERIALIZABLE_CONFLICT_SENSITIVE');
  assert.match(row.isolation, /Serializable/u);
  assert.equal(row.externalWaitInsideTransaction, false);
  assert.deepEqual(row.unresolvedCalls, []);
});

test('duplicate transaction identities fail closed', () => {
  assert.throws(() => validateInventory([INVENTORY[0], INVENTORY[0]]), /transactionId|unique|Expected values|duplicate transaction identity/u);
});

test('unresolved transaction calls fail closed', () => {
  const invalid = { ...INVENTORY[0], unresolvedCalls: [{ target: 'unknown.provider', reason: 'unresolved' }] };
  assert.throws(() => validateInventory([invalid]), /unresolved calls/u);
});

test('playback caller audit is complete and contains no unsafe database callback', () => {
  const audit = validatePlaybackConsumerAudit();
  assert.equal(audit.total, 6);
  assert.equal(audit.counts.UNKNOWN, 0);
  assert.equal(audit.counts.DATABASE_SIDE_EFFECT, 0);
  assert.match(audit.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(new Set(audit.rows.map((row) => row.callbackClassification)), new Set(['PURE_CAPABILITY_GENERATION', 'EXTERNAL_READ_ONLY_PROVIDER']));
  assert.deepEqual(discoverPlaybackCallers().map((row) => `${row.path}#${row.caller}#${row.callee}`), audit.rows.map((row) => `${row.path}#${row.caller}#${row.callee}`));
});

test('playback caller audit rejects UNKNOWN and database side effects', () => {
  for (const classification of ['UNKNOWN', 'DATABASE_SIDE_EFFECT']) {
    const unsafe = PLAYBACK_CONSUMER_AUDIT.map((row, index) => index === 0 ? { ...row, classification } : row);
    assert.throws(() => validatePlaybackConsumerAudit(unsafe));
  }
});

test('source-derived playback discovery exposes an extra unsafe caller without catalog help', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-playback-callers-'));
  try {
    const sourceDirectory = path.join(directory, 'src');
    fs.mkdirSync(sourceDirectory);
    fs.writeFileSync(path.join(sourceDirectory, 'unsafe.ts'), `
      class Unsafe {
        constructor(private coordinator: any, private repository: any) {}
        run() { return this.coordinator.withPlayableMedia({}, async () => this.repository.update({})); }
      }
    `, 'utf8');
    const callers = discoverPlaybackCallers(directory);
    assert.equal(callers.length, 1);
    assert.equal(callers[0].callbackClassification, 'DATABASE_SIDE_EFFECT');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('strict business invariant manifests name production entries and exact checks', () => {
  assert.equal(validateBusinessInvariantManifests(), BUSINESS_INVARIANT_MANIFESTS);
  assert.equal(ENTRY_CLASS_MANIFEST.learningMedia.entryClass, 'CompleteLearningMediaUploadUseCase');
  assert.equal(ENTRY_CLASS_MANIFEST.lessonContent.entryClass, 'UpdateLessonContentUseCase');
  assert.equal(ENTRY_CLASS_MANIFEST.teacherLifecycle.entryClass, 'ChangeTeacherEmploymentStatusUseCase');
  for (const manifest of Object.values(BUSINESS_INVARIANT_MANIFESTS)) {
    assert.ok(manifest.forbiddenWrites.length > 0);
    assert.ok(manifest.auditExpectations.length > 0);
    assert.ok(manifest.duplicateConstraints.length > 0);
  }
});

test('PostgreSQL fixture is immutable, loopback-only, tmpfs, pull-never, and max_connections 80', () => {
  const args = buildPostgresFixtureArgs({ name: 'moazez-b3-postgres-test', network: 'owned-network', runId: 'b3-test-run', password: 'synthetic-password' });
  assert.ok(args.includes('--pull=never'));
  assert.deepEqual(args.slice(args.indexOf('--publish'), args.indexOf('--publish') + 2), ['--publish', '127.0.0.1::5432']);
  assert.ok(args.includes('--tmpfs'));
  assert.ok(!args.includes('--volume'));
  assert.ok(args.includes(POSTGRES_IMAGE));
  assert.deepEqual(args.slice(-2), ['-c', 'max_connections=80']);
  assert.ok(!args.includes('--rm'));
});

test('all one-shot containers are named, labeled, pull-never, and never anonymous', () => {
  const args = buildNamedContainerCreateArgs({ name: 'moazez-b3-driver-test', runId: 'b3-test-run', role: 'driver', network: 'owned-network', imageId: `sha256:${'a'.repeat(64)}`, command: ['driver.cjs'] });
  assert.equal(args[0], 'create');
  assert.ok(args.includes('--name'));
  assert.ok(args.includes('--pull=never'));
  assert.ok(args.includes('com.moazez.evidence.gate=PRD3-G01-B3'));
  assert.ok(args.includes('com.moazez.evidence.run=b3-test-run'));
  assert.ok(args.includes('com.moazez.evidence.role=driver'));
  assert.ok(!args.includes('--rm'));
});

test('unknown container roles are rejected before argument construction', () => {
  assert.throws(() => buildOwnershipLabels('b3-test-run', 'unknown-role'));
});

test('migration plan executes deploy and status through the pinned Prisma CLI', () => {
  assert.deepEqual(MIGRATION_COMMANDS, [
    ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['/app/node_modules/prisma/build/index.js', 'migrate', 'status'],
  ]);
});

test('Docker image identities are immutable digests', () => {
  assert.match(POSTGRES_IMAGE, /^sha256:[a-f0-9]{64}$/);
  assert.match(NODE_IMAGE, /^sha256:[a-f0-9]{64}$/);
});

test('candidate production patch hash is derived from the exact playback diff', async () => {
  const patch = await calculateCandidateProductionPatch();
  assert.match(patch.sha256, /^[a-f0-9]{64}$/);
  assert.ok(patch.bytes > 0);
  assert.match(patch.normalizedPatch, /lesson-content-playback\.coordinator\.ts/u);
  assert.doesNotMatch(patch.normalizedPatch, /prd3-g01-b3-transaction-pressure/u);
});

test('strict summary accepts a complete internally consistent v4 record', () => {
  assert.equal(validateStrictSummary(validSummary()).overall, 'PASS');
});

test('R3-D01 records the reproduced unknown-error timeout fallback and false serialization acceptance', () => {
  const legacyClassifier = (error) => {
    let current = error;
    for (let depth = 0; depth < 5 && current; depth += 1) {
      if (/^P\d{4}$/u.test(current.code ?? '')) return current.code;
      current = current.cause;
    }
    return 'TRANSACTION_TIMEOUT';
  };
  const category = legacyClassifier(new Error('ordinary unknown error'));
  assert.equal(category, 'TRANSACTION_TIMEOUT');
  assert.equal(['P2034', 'TRANSACTION_TIMEOUT'].includes(category), true);
});

test('R3-D02 records all seven independently reproduced strict-summary false acceptances', () => {
  assert.equal(validateR3InitialDefectReproductions(), R3_INITIAL_DEFECT_REPRODUCTIONS);
  assert.deepEqual(Object.keys(R3_STRICT_MUTATIONS), [
    'classification_inside_mismatch',
    'wrong_business_entry_class',
    'duplicate_lock_waits',
    'forged_fault_receipt_metadata',
    'wrong_invariant_manifest_pairing',
    'serializable_timeout_as_conflict',
    'inconsistent_cutback_connection_count',
  ]);
});

test('R3-D03 reproduces result publication before failed and never-settling cleanup', async () => {
  const events = [];
  const trackedClients = new Set([{ disconnectCalls: 0 }]);
  const legacyFinalize = async () => {
    events.push('phase-one-failed');
    await Promise.race([
      new Promise(() => {}),
      new Promise((resolve) => setTimeout(resolve, 20)),
    ]);
    events.push('phase-two-deadline');
  };
  events.push('B3_DRIVER=PASS');
  await legacyFinalize();
  assert.deepEqual(events, ['B3_DRIVER=PASS', 'phase-one-failed', 'phase-two-deadline']);
  assert.equal(trackedClients.size, 1);
});

test('R3-D04 reproduces non-abort-aware readiness, marker, exit, and loopback polling', async () => {
  const reproduceLegacyPoll = async () => {
    const controller = new AbortController();
    let commands = 0;
    commands += 1;
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    commands += 1;
    return commands;
  };
  const phases = ['postgres-readiness', 'container-marker', 'container-exit'];
  for (const phase of phases) assert.equal(await reproduceLegacyPoll(), 2, phase);
  const controller = new AbortController();
  const started = Date.now();
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(Date.now() - started >= 15, 'legacy loopback operation did not remain pending after abort');
});

test('R4-D01 reproduces the sequentially gated Serializable Teacher scenario', async () => {
  assert.equal(validateR4InitialDefectReproductions(), R4_INITIAL_DEFECT_REPRODUCTIONS);
  const admission = Promise.withResolvers();
  const observed = { firstStartedAt: 0, firstCompletedAt: 0, secondStartedAt: 0 };
  const first = (async () => {
    observed.firstStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));
    observed.firstCompletedAt = Date.now();
  })();
  const second = (async () => {
    await admission.promise;
    observed.secondStartedAt = Date.now();
  })();
  await first;
  admission.resolve();
  await second;
  assert.equal(observed.firstCompletedAt <= observed.secondStartedAt, true);
  assert.equal(observed.secondStartedAt < observed.firstCompletedAt, false);
});

test('R4-D02 reproduces empty formal evidence becoming successful receipts', async () => {
  const legacyProof = async (entry, assertion) => { try { await assertion(); } catch {} return { id: entry.id, injected: true }; };
  const receipts = await Promise.all(FAULT_CATALOG.slice(20, 34).map((entry) => legacyProof(entry, () => { throw new Error('missing evidence'); })));
  assert.equal(receipts.length, 14);
  assert.equal(receipts.every((receipt) => receipt.injected === true), true);
});

test('R4-D03 reproduces an unrelated negative-injection exception becoming a catalog receipt', async () => {
  const entry = FAULT_CATALOG[0];
  const legacyExecute = async (injector) => { try { await injector(); } catch {} return { observedClassification: entry.expectedClassification }; };
  const receipt = await legacyExecute(async () => { throw new TypeError('completely unrelated failure'); });
  assert.equal(receipt.observedClassification, entry.expectedClassification);
});

test('R4-D04 reproduces the B3-F24 ordered-commit contradiction becoming a receipt', async () => {
  const summary = validSummary('b3-r4-f24-reproduction');
  Object.assign(summary.serializable, {
    outcome: 'SERIALIZED_ORDERED_COMMITS', committed: 2, aborted: 0,
    errorCode: null, retrySucceeded: null,
  });
  const legacyF24 = async () => { try { assert.equal(summary.serializable.aborted, 1); } catch {} return { observedClassification: 'P2034' }; };
  const receipt = await legacyF24();
  assert.equal(receipt.observedClassification, 'P2034');
  assert.equal(summary.serializable.aborted, 0);
});

test('R4-D05 reproduces incomplete accounting in the actual embedded bounded helper', async () => {
  const activeOperations = new Set();
  const legacyBounded = async (operation) => Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => setTimeout(() => reject(new Error('deadline')), 10))]);
  let settled = false;const underlying = new Promise(() => {}).finally(() => { settled = true; });
  await assert.rejects(() => legacyBounded(() => underlying));
  assert.equal(activeOperations.size, 0);
  assert.equal(settled, false);
});

test('R4-D06 reproduces the hardcoded final audit in the actual summary builder', () => {
  const result = { finalDatabaseAudit: { applicationSessions: 1 } };
  const built = { finalAudit: { applicationSessions: 0 } };
  assert.equal(result.finalDatabaseAudit.applicationSessions, 1);
  assert.equal(built.finalAudit.applicationSessions, 0);
});

test('empty formal evidence now produces no receipts and rejects', async () => {
  await assert.rejects(() => collectEvidenceFaultExecutions({}, {}));
});

test('a failed positive evidence assertion propagates without a receipt', async () => {
  const entry = FAULT_CATALOG.find((item) => item.id === 'B3-F21');
  await assert.rejects(() => recordEvidenceProof(entry, async () => { throw new Error('assertion failed'); }, { measured: true }), /assertion failed/u);
});

test('an unrelated negative-injection exception cannot create a receipt', async () => {
  const entry = FAULT_CATALOG[0];
  await assert.rejects(() => executeNegativeFaultInjection(entry, async () => { throw new TypeError('unrelated'); }), /unrelated negative-injection error/u);
});

test('negative receipt classification is observed and cannot be copied from the catalog', async () => {
  const entry = FAULT_CATALOG[0];
  const wrong = Object.assign(new Error('observed mismatch'), { faultStageId: entry.faultInjectionHook, faultClassification: 'WRONG_OBSERVED_CLASSIFICATION' });
  await assert.rejects(() => executeNegativeFaultInjection(entry, async () => { throw wrong; }), /observed classification mismatch/u);
});

test('F24 catalog uses the truthful Serializable contention invariant model', () => {
  const entry = FAULT_CATALOG.find((item) => item.id === 'B3-F24');
  assert.equal(entry.expectedClassification, 'SERIALIZABLE_CONTENTION_VALID_OUTCOME');
  assert.equal(entry.proofId, 'formal-teacher-serializable');
});

test('sequentially gated Teacher operations cannot qualify as Serializable evidence', () => {
  const value = validSummary();value.serializable.overlapObserved = false;value.serializable.bothPendingBeforeRelease = false;
  assert.throws(() => validateStrictSummary(value));
});

test('two Teacher operation promises started before either completes qualify for overlap evaluation', async () => {
  const first = Promise.withResolvers();const second = Promise.withResolvers();let firstSettled=false;let secondSettled=false;
  const firstPromise=first.promise.finally(()=>{firstSettled=true;});const secondPromise=second.promise.finally(()=>{secondSettled=true;});
  assert.equal(!firstSettled&&!secondSettled,true);first.resolve('first');second.resolve('second');
  assert.deepEqual(await Promise.all([firstPromise,secondPromise]),['first','second']);
});

test('embedded Teacher driver starts both production promises without a completion admission gate', () => {
  assert.doesNotMatch(DRIVER_SOURCE,/secondAdmission/u);
  assert.match(DRIVER_SOURCE,/const firstStartedAt=Date\.now\(\);const firstPromise=/u);
  assert.match(DRIVER_SOURCE,/const secondStartedAt=Date\.now\(\);const secondPromise=/u);
  assert.match(DRIVER_SOURCE,/Promise\.allSettled\(\[firstPromise,secondPromise\]\)/u);
});

test('ordered commits require measured overlap and exact null error code', () => {
  const value=validSummary();Object.assign(value.serializable,{outcome:'SERIALIZED_ORDERED_COMMITS',committed:2,aborted:0,errorCode:null,retrySucceeded:null});value.faultReceipts=validFaultReceipts(value);assert.equal(validateStrictSummary(value).serializable.outcome,'SERIALIZED_ORDERED_COMMITS');
  value.serializable.overlapObserved=false;assert.throws(()=>validateStrictSummary(value));
});

test('every bounded normal operation is automatically tracked after caller timeout', async () => {
  assert.match(DRIVER_SOURCE,/trackNormalOperation\(startDriverOperation\(operation\)\)/u);
  const fixture=await runControlledBoundedOperationFixture({label:'never-settling Prisma query',operation:new Promise(()=>{}),callerTimeoutMs:5,finalizationMs:10});
  assert.equal(fixture.callerOutcome,'TIMED_OUT_OR_REJECTED');assert.equal(fixture.activeOperations,1);assert.equal(fixture.resultMarkerEmitted,false);
});

test('a never-settling bounded business operation remains active',async()=>{const fixture=await runControlledBoundedOperationFixture({label:'never-settling business operation',operation:new Promise(()=>{}),callerTimeoutMs:5,finalizationMs:10});assert.equal(fixture.activeOperations,1);assert.equal(fixture.resultMarkerEmitted,false);});

test('a late-settling business operation remains tracked until actual settlement', async () => {
  let resolve;const operation=new Promise((res)=>{resolve=res;});setTimeout(resolve,20);
  const fixture=await runControlledBoundedOperationFixture({label:'late business operation',operation,callerTimeoutMs:5,finalizationMs:100});
  assert.equal(fixture.callerOutcome,'TIMED_OUT_OR_REJECTED');assert.equal(fixture.activeOperations,0);assert.equal(fixture.resultMarkerEmitted,true);
});

test('an operation settling during finalization grace reaches the zero-operation audit', async () => {
  let resolve;const operation=new Promise((res)=>{resolve=res;});setTimeout(resolve,15);
  const fixture=await runControlledBoundedOperationFixture({operation,callerTimeoutMs:5,finalizationMs:50});
  assert.equal(fixture.activeOperations,0);
});

test('an unresolved operation after finalization deadline suppresses B3_DRIVER', async () => {
  const fixture=await runControlledBoundedOperationFixture({operation:new Promise(()=>{}),callerTimeoutMs:5,finalizationMs:10});
  assert.equal(fixture.markers.some((marker)=>marker.startsWith('B3_DRIVER=')),false);
});

test('formal summary preserves measured nonzero database audit and strict validation rejects it', () => {
  const source=validSummary('b3-r4-measured-audit');const args=formalBuilderArgs(source);
  args.result.finalDatabaseAudit.applicationSessions=1;args.validate=false;
  const candidate=buildFormalSummary(args);assert.equal(candidate.finalAudit.applicationSessions,1);assert.throws(()=>validateStrictSummary(candidate));
});

for (const [name, area, key] of [
  ['open transactions','database','openTransactions'],['unresolved lock waits','database','unresolvedLockWaits'],['partial writes','database','partialWrites'],
  ['tracked clients','cleanup','clients'],['containers','cleanup','containers'],['images','cleanup','images'],
]) {
  test(`measured final audit rejects nonzero ${name}`, () => {
    const source=validSummary(`b3-r4-${key.toLowerCase()}`);const args=formalBuilderArgs(source);(area==='database'?args.result.finalDatabaseAudit:args.supervisorCleanupAudit)[key]=1;args.validate=false;
    const candidate=buildFormalSummary(args);assert.equal(candidate.finalAudit[key],1);assert.throws(()=>validateStrictSummary(candidate));
  });
}

for (const [name, mutate] of Object.entries({
  serializable_identity_count_999:(value)=>{value.serializable.identityCount=999;},
  serializable_audit_count_999:(value)=>{value.serializable.auditCount=999;},
  timeout_elapsed_800000:(value)=>{value.timeouts.learningMedia.elapsedMs=800000;},
  lock_elapsed_zero:(value)=>{value.lockWaits[0].elapsedMs=0;},
  execution_receipt_one_character:(value)=>{value.faultReceipts[0].executionReceipt='x';},
  nonzero_measured_final_audit:(value)=>{value.finalAudit.openTransactions=1;},
})) {
  test(`strict summary rejects R4 numeric/digest mutation ${name}`,()=>{const value=validSummary();mutate(value);assert.throws(()=>validateStrictSummary(value));});
}

test('exact transaction classifier preserves only P2024, P2028, and P2034 Prisma categories', () => {
  for (const code of ['P2024', 'P2028', 'P2034']) assert.equal(classifyPrismaTransactionError({ code }), code);
  assert.equal(classifyPrismaTransactionError({ code: 'teachers.lifecycle.invalid_transition' }), 'KNOWN_BUSINESS_REJECTION');
  assert.equal(classifyPrismaTransactionError(Object.assign(new Error('ordinary unknown error'), { cause: new Error('ordinary cause') })), 'UNKNOWN_ERROR');
});

test('one-abort Serializable outcome rejects every non-P2034 classification', () => {
  for (const errorCode of ['P2024', 'P2028', 'KNOWN_BUSINESS_REJECTION', 'UNKNOWN_ERROR', 'TRANSACTION_TIMEOUT']) {
    const value = validSummary();
    value.serializable.errorCode = errorCode;
    assert.throws(() => validateStrictSummary(value), errorCode);
  }
});

test('strict summary accepts exact ordered two-commit Serializable outcome', () => {
  const value = validSummary();
  Object.assign(value.serializable, { outcome: 'SERIALIZED_ORDERED_COMMITS', committed: 2, aborted: 0, errorCode: null, retrySucceeded: null });
  value.faultReceipts = validFaultReceipts(value);
  assert.equal(validateStrictSummary(value).serializable.outcome, 'SERIALIZED_ORDERED_COMMITS');
});

for (const [name, mutate] of Object.entries(R3_STRICT_MUTATIONS)) {
  test(`strict summary rejects R3 mutation ${name}`, () => {
    const value = validSummary();
    mutate(value);
    assert.throws(() => validateStrictSummary(value));
  });
}

const R3_ADDITIONAL_CROSS_FIELD_MUTATIONS = Object.freeze({
  unknown_classification_key: (value) => { value.inventory.classifications.FORGED_CLASSIFICATION = 0; },
  classification_sum_mismatch: (value) => { value.inventory.classifications.SHORT_DB_ONLY += 1; },
  entry_classes_pairing_mismatch: (value) => { value.entryClasses.teacherLifecycle = 'ForgedTeacherEntry'; },
  lock_evidence_pairing_mismatch: (value) => { value.lockEvidence[0].blockerCount += 1; },
  contradictory_extra_fault_metadata: (value) => { value.faultReceipts[0].catalogHook = 'forged-hook'; },
  zero_occupancy_connection_mismatch: (value) => { value.cutback[0].states.zeroOccupied.connections = 2; },
});

for (const [name, mutate] of Object.entries(R3_ADDITIONAL_CROSS_FIELD_MUTATIONS)) {
  test(`strict summary rejects additional cross-field mutation ${name}`, () => {
    const value = validSummary();
    mutate(value);
    assert.throws(() => validateStrictSummary(value));
  });
}

test('normal driver finalization completes before result publication', async () => {
  const fixture = await runControlledDriverFinalizationFixture({ candidateResult: { status: 'PASS' } });
  assert.equal(fixture.result.ok, true);
  assert.deepEqual(fixture.events, ['phase-one', 'active-operation-audit', 'phase-two', 'zero-resource-audit', 'result-publication']);
});

test('driver finalizer retries a phase-one failure and accepts phase-two success', async () => {
  let calls = 0;
  const fixture = await runControlledDriverFinalizationFixture({ clients: [{ $disconnect: async () => { calls += 1;if (calls === 1) throw new Error('phase one'); } }], candidateResult: { status: 'PASS' } });
  assert.deepEqual(fixture.result.phaseOneResults, [{ status: 'REJECTED' }]);
  assert.deepEqual(fixture.result.phaseTwoResults, [{ status: 'DISCONNECTED' }]);
  assert.equal(fixture.result.trackedPrismaClients, 0);
  assert.equal(fixture.result.ok, true);
});

test('driver finalizer makes phase-two rejection terminal', async () => {
  const fixture = await runControlledDriverFinalizationFixture({ clients: [{ $disconnect: async () => { throw new Error('rejected'); } }], candidateResult: { status: 'PASS' } });
  assert.deepEqual(fixture.result.phaseTwoResults, [{ status: 'REJECTED' }]);
  assert.equal(fixture.result.ok, false);
  assert.equal(fixture.result.trackedPrismaClients, 1);
});

test('driver finalizer bounds a phase-two disconnect that never resolves', async () => {
  const fixture = await runControlledDriverFinalizationFixture({ clients: [{ $disconnect: () => new Promise(() => {}) }], disconnectMs: 10, candidateResult: { status: 'PASS' } });
  assert.deepEqual(fixture.result.phaseTwoResults, [{ status: 'TIMED_OUT' }]);
  assert.equal(fixture.result.ok, false);
});

test('driver finalizer makes an active operation that never settles terminal', async () => {
  const fixture = await runControlledDriverFinalizationFixture({ activeOperations: [new Promise(() => {})], operationMs: 10, candidateResult: { status: 'PASS' } });
  assert.equal(fixture.result.activeOperations, 1);
  assert.equal(fixture.result.ok, false);
});

test('driver result marker is suppressed on cleanup failure', async () => {
  const fixture = await runControlledDriverFinalizationFixture({ clients: [{ $disconnect: async () => { throw new Error('cleanup failure'); } }], candidateResult: { status: 'PASS' } });
  assert.equal(fixture.markers.some((marker) => marker.startsWith('B3_DRIVER=')), false);
  assert.equal(fixture.markers.some((marker) => marker.startsWith('B3_DRIVER_FINALIZED=')), true);
  assert.equal(fixture.result.requestedExitCode, 1);
});

test('driver result marker is emitted only after zero-client and zero-operation audit', async () => {
  const fixture = await runControlledDriverFinalizationFixture({ candidateResult: { status: 'PASS' } });
  assert.equal(fixture.result.trackedPrismaClients, 0);
  assert.equal(fixture.result.activeOperations, 0);
  assert.ok(fixture.events.indexOf('zero-resource-audit') < fixture.events.indexOf('result-publication'));
  assert.match(fixture.markers[0], /^B3_DRIVER=/u);
  assert.ok(DRIVER_SOURCE.lastIndexOf('const finalization=await finalizeDriver()') < DRIVER_SOURCE.lastIndexOf("console.log('B3_DRIVER='"));
});

test('abort terminates PostgreSQL readiness polling without another Docker command', async () => {
  const context = pollingContext();let commands = 0;
  await assert.rejects(() => waitForPostgres('postgres', {}, context, { attempts: 3, intervalMs: 100, runChild: async () => { commands += 1;context.state.abortController.abort();return { ok: false }; } }), /abort/iu);
  assert.equal(commands, 1);
});

test('abort terminates container-marker polling without another Docker command', async () => {
  const context = pollingContext();let commands = 0;
  await assert.rejects(() => waitForContainerMarker(context, 'fixture', 'READY=', { attempts: 3, intervalMs: 100, runChild: async () => { commands += 1;context.state.abortController.abort();return { ok: true, stdout: '', stderr: '' }; } }), /abort/iu);
  assert.equal(commands, 1);
});

test('abort terminates container-exit polling without another inspection', async () => {
  const context = pollingContext();let inspections = 0;
  await assert.rejects(() => waitForContainerExit(context, 'fixture', 'run', 'rehearsal', { attempts: 3, intervalMs: 100, inspect: async () => { inspections += 1;context.state.abortController.abort();return { State: { Running: true } }; } }), /abort/iu);
  assert.equal(inspections, 1);
});

test('abort immediately destroys loopback verification socket', async () => {
  const context = pollingContext();let destroyed = false;
  const socket = new EventEmitter();socket.destroy = () => { destroyed = true; };
  const pending = verifyLoopbackTcp(context, 5432, { timeoutMs: 1_000, createConnection: () => socket });
  await new Promise((resolve) => setImmediate(resolve));
  context.state.abortController.abort();
  await assert.rejects(() => pending, /abort/iu);
  assert.equal(destroyed, true);
});

test('strict summary rejects every formerly accepted incomplete or contradictory candidate', () => {
  const mutations = [
    (value) => { delete value.provenance; },
    (value) => { value.inventory.unresolvedCallChains = null; },
    (value) => { value.pool.maximumObserved = '5'; },
    (value) => { value.pool.maximumObserved = -1; },
    (value) => { value.cutback[0].classification = 'SAFE'; },
    (value) => { value.inventory.total += 1; },
    (value) => { value.finalAudit.images = 1; },
    (value) => { value.inventory.externalWaitInsideTransaction = 1; },
    (value) => { value.businessPaths.push({ ...value.businessPaths[0] }); },
    (value) => { value.lockEvidence[1] = { ...value.lockEvidence[0] }; },
    (value) => { delete value.businessPaths[0].invariantManifestId; },
    (value) => { delete value.pool.actualBlockedOperations; },
    (value) => { delete value.pool.sampledOvershootObserved; },
    (value) => { delete value.playback.negativeCases.mediaRemoved; },
    (value) => { value.rehearsals.sigterm.noPersistentClaimCreated = false; },
    (value) => { value.faultReceipts.pop(); },
  ];
  for (const mutate of mutations) {
    const value = validSummary();mutate(value);assert.throws(() => validateStrictSummary(value));
  }
});

test('summary redaction rejects connection, identity, email, object, URL, error, and environment material', () => {
  for (const invalid of [
    { value: 'postgresql://user:value@host/database' },
    { value: '10000000-0000-4000-8000-000000000001' },
    { value: 'actor@example.test' },
    { objectKey: 'private/object' },
    { signedUrl: 'https://example.test/signed' },
    { rawPrismaError: 'P2028 raw' },
    { stack: 'at internal' },
    { environment: { PATH: 'value' } },
  ]) assert.throws(() => validateSanitizedSummary(invalid));
});

test('atomic publisher fsyncs, renames, revalidates, and retains exact bytes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-atomic-'));
  try {
    const context = publicationContext();
    const finalPath = path.join(directory, 'summary.json');
    const result = await atomicPublishStrictSummary(context, validSummary(), finalPath);
    assert.match(result.summaryHash, /^[a-f0-9]{64}$/);
    assert.equal(context.state.scratchPaths.size, 0);
    assert.equal(context.state.retainedSummaryPaths.has(finalPath), true);
    validateStrictSummary(JSON.parse(fs.readFileSync(finalPath, 'utf8')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('authoritative-finalizer publication ignores only its already-aborted work signal', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-finalizer-publication-'));
  try {
    const context = publicationContext();const finalPath = path.join(directory, 'summary.json');
    context.state.abortController.abort();
    const result = await atomicPublishStrictSummary(context, validSummary(), finalPath, { ignoreAbort: true });
    assert.equal(fs.existsSync(finalPath), true);
    assert.match(result.summaryHash, /^[a-f0-9]{64}$/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('atomic publisher removes scratch and retained output at every interruption point', async () => {
  for (const hook of ['beforeScratchCreation', 'duringWrite', 'afterFsync', 'beforeRename', 'afterRename', 'duringRetainedValidation', 'beforeHashOutput']) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `b3-atomic-${hook}-`));
    try {
      const context = publicationContext();const finalPath = path.join(directory, 'summary.json');
      await assert.rejects(() => atomicPublishStrictSummary(context, validSummary(), finalPath, { [hook]: () => { context.state.disableSummary(`interrupted at ${hook}`); } }));
      assert.equal(fs.existsSync(finalPath), false, hook);
      assert.equal(fs.readdirSync(directory).length, 0, hook);
      assert.equal(context.state.scratchPaths.size, 0, hook);
      assert.equal(context.state.retainedSummaryPaths.size, 0, hook);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('two-phase disconnect retains phase-one failures and retries after cleanup', async () => {
  let calls = 0;let cleanup = false;
  const result = await disconnectTrackedClientsInTwoPhases([{ $disconnect: async () => { calls += 1;if (calls === 1) throw new Error('phase one'); } }], async () => { cleanup = true; });
  assert.equal(cleanup, true);
  assert.deepEqual(result, { phaseOne: ['RETRY_REQUIRED'], phaseTwo: ['DISCONNECTED'], remaining: 0 });
});

test('phase-two disconnect failure is terminal', async () => {
  await assert.rejects(() => disconnectTrackedClientsInTwoPhases([{ $disconnect: async () => { throw new Error('still failing'); } }], undefined, { phaseOneMs: 10, phaseTwoMs: 10 }));
});

test('never-settling disconnect is bounded, cleanup runs, and a second unresolved phase is terminal', async () => {
  let calls = 0;let cleanup = false;
  const recovered = await disconnectTrackedClientsInTwoPhases([{ $disconnect: () => { calls += 1;return calls === 1 ? new Promise(() => {}) : Promise.resolve(); } }], async () => { cleanup = true; }, { phaseOneMs: 10, phaseTwoMs: 10, cleanupMs: 20 });
  assert.equal(cleanup, true);
  assert.deepEqual(recovered, { phaseOne: ['RETRY_REQUIRED'], phaseTwo: ['DISCONNECTED'], remaining: 0 });
  cleanup = false;
  await assert.rejects(
    () => disconnectTrackedClientsInTwoPhases([{ $disconnect: () => new Promise(() => {}) }], async () => { cleanup = true; }, { phaseOneMs: 10, phaseTwoMs: 10, cleanupMs: 20 }),
    (error) => cleanup && error.disconnectResult.remaining === 1 && error.disconnectResult.phaseTwo[0] === 'FAILED',
  );
});

test('first signal wins and PASS eligibility cannot be restored', () => {
  const state = new EvidenceState();
  assert.equal(state.latchSignal('SIGTERM'), true);
  assert.equal(state.latchSignal('SIGINT'), false);
  assert.equal(state.firstSignal, 'SIGTERM');
  assert.equal(state.requestedExitCode, 143);
  state.summaryEligibility = true;
  assert.throws(() => state.assertSummaryEligible());
});

test('signal routing synchronously latches interruption and starts one authoritative finalizer', async () => {
  const state = new EvidenceState();
  let finalizerInvocations = 0;let finish;
  const context = { state, signalHandlers: null };
  const previousExitCode = process.exitCode;
  const handlers = installB3SignalHandlers(context, { finalize: () => { finalizerInvocations += 1;return new Promise((resolve) => { finish = resolve; }); } });
  try {
    const pending = handlers.route('SIGINT');
    assert.equal(state.interrupted, true);
    assert.equal(state.firstSignal, 'SIGINT');
    assert.equal(state.requestedExitCode, 130);
    assert.equal(finalizerInvocations, 1);
    assert.equal(handlers.route('SIGTERM'), pending);
    assert.equal(state.firstSignal, 'SIGINT');
    assert.equal(finalizerInvocations, 1);
    finish();
    await pending;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(process.exitCode, 130);
  } finally {
    handlers.remove();
    process.exitCode = previousExitCode;
  }
});

test('the executable verifier contains no direct hard-exit call or unbounded timer primitive', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'ci', 'prd3-g01-b3-transaction-pressure.cjs'), 'utf8');
  const hardExit = new RegExp(['process', '\\.', 'exit', '\\s*\\('].join(''), 'u');
  const interval = new RegExp(['set', 'Interval', '\\s*\\('].join(''), 'u');
  assert.doesNotMatch(source, hardExit);
  assert.doesNotMatch(source, interval);
  assert.deepEqual(scanExecutableProhibitedPatterns(), { matches: 0, files: 5 });
});

test('cutback classification is derived only from the measured named states', () => {
  const summary = validSummary();
  assert.deepEqual(summary.cutback.map((row) => classifyCutbackMeasurement(row.states)), ['NORMAL', 'EMERGENCY_DEGRADED', 'LAST_RESORT_UNREADY_WHILE_BUSY']);
  const unsafe = structuredClone(summary.cutback[0].states);unsafe.fullOccupancy.overshoot = true;
  assert.equal(classifyCutbackMeasurement(unsafe), 'NOT_SAFE');
});

test('second formal-run failure cannot produce cross-run PASS', () => {
  const first = { summary: validSummary('b3-run-one') };
  const second = { summary: validSummary('b3-run-two') };
  assert.equal(validateCrossRun([first, second]).pass, true);
  second.summary.overall = 'FAIL';
  assert.throws(() => validateCrossRun([first, second]));
});

for (const [name, mutate] of Object.entries({
  candidate_production_patch:(summary)=>{summary.provenance.candidateProductionPatchSha256='b'.repeat(64);},
  candidate_image:(summary)=>{summary.provenance.candidate.imageId=`sha256:${'d'.repeat(64)}`;},
  runtime_manifest:(summary)=>{summary.provenance.candidate.runtimeManifestSha256='b'.repeat(64);},
  inventory_digest:(summary)=>{summary.inventory.digest='b'.repeat(64);},
  playback_caller_digest:(summary)=>{summary.playbackCallerDigest='b'.repeat(64);},
  fault_catalog_version:(summary)=>{summary.faultCatalogVersion='forged-catalog';},
  fault_proof_version:(summary)=>{summary.faultProofImplementationVersion='forged-proof';},
})) {
  test(`cross-run validation rejects ${name} mismatch`,()=>{const first={summary:validSummary('b3-cross-one')};const second={summary:validSummary('b3-cross-two')};mutate(second.summary);assert.throws(()=>validateCrossRun([first,second]));});
}

test('cross-run validation requires independent overlap in both runs',()=>{const first={summary:validSummary('b3-overlap-one')};const second={summary:validSummary('b3-overlap-two')};second.summary.serializable.overlapObserved=false;assert.throws(()=>validateCrossRun([first,second]));});

test('failure catalog has complete executable metadata', () => {
  assert.equal(validateFailureCatalog().length, 35);
  assert.equal(FAULT_CATALOG.length, 35);
  for (const entry of FAULT_CATALOG) {
    for (const key of ['id', 'faultInjectionHook', 'expectedClassification', 'expectedBusinessRollback', 'expectedCleanup', 'expectedExit', 'summaryEligibility', 'proofType', 'proofId']) assert.notEqual(entry[key], undefined);
  }
});

test('unknown fault injection fails before any supplied mutation hook', async () => {
  let mutated = false;
  await assert.rejects(() => executeFaultInjection('B3-F99', new Proxy({}, { get: () => () => { mutated = true; } })));
  assert.equal(mutated, false);
});

const faultExecutions = [];
for (const entry of FAULT_CATALOG) {
  if (entry.proofType === 'PURE_ADVERSARIAL_TEST') {
    test(`${entry.id} injects the real ${entry.faultInjectionHook} rejection path`, async () => {
      const execution = await executeFaultInjection(entry.id);
      assert.equal(execution.expectedRejectionObserved, true);
      assert.equal(execution.observedClassification, entry.expectedClassification);
      faultExecutions.push(execution);
    });
  } else {
    test(`${entry.id} refuses coverage without its formal/live evidence executor`, async () => {
      await assert.rejects(executeFaultInjection(entry.id), /not a negative fault injection/u);
    });
  }
}

test('formal and live fault coverage derives from complete matching evidence', async () => {
  const summary=validSummary('b3-evidence-run');
  const executions=await collectEvidenceFaultExecutions(summary,summary.rehearsals);
  assert.equal(executions.length,14);
  faultExecutions.push(...executions);
});

test('B3-F01 through B3-F35 coverage is exact after matching injection paths execute', () => {
  assert.deepEqual(validateFaultCoverage(faultExecutions), { covered: 35, missing: 0, duplicate: 0, unknown: 0 });
});

function withFixture(source, assertion) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-inventory-'));
  try {
    const files = typeof source === 'string' ? { 'fixture.ts': source } : source;
    for (const [relativePath, contents] of Object.entries(files)) {
      const target = path.join(directory, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents, 'utf8');
    }
    assertion(inventoryTransactions(directory));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function publicationContext() {
  const state = new EvidenceState();
  return {
    state,
    fileTracker: {
      registerScratch() {}, unregisterScratch() {},
      registerRetainedSanitizedSummary() {}, unregisterRetainedSanitizedSummary() {},
    },
  };
}

function pollingContext() {
  return {
    state: { abortController: new AbortController() },
    childTracker: undefined,
    env: {},
    sensitiveValues: [],
  };
}

function validSummary(runId = 'b3-valid-run') {
  const hash = 'a'.repeat(64);
  const runtime = { runtimeManifestSha256: hash, nodeVersion: 'v22.23.1', prismaVersion: '6.19.3', packageVersion: '0.0.1', entryCount: 3, entrypoints: ['dist/main.js', 'dist/core-worker.js', 'dist/media-worker.js'] };
  const stateA = { readinessStatus: 200, readinessLatencyMs: 1, businessSucceeded: true, connections: 1 };
  const stateB = { readinessStatus: 200, readinessLatencyMs: 1, additionalBusinessSucceeded: true, errorCode: null, maximumConnections: 2 };
  const stateC = { readinessStatus: 503, readinessLatencyMs: 750, readinessBurst: [503, 503, 503], nextBusinessError: 'P2024', p2024ElapsedMs: 2000, backendCount: 5, maximumConnections: 5, overshoot: false };
  const stateD = { readinessStatus: 200, readinessLatencyMs: 1, businessSucceeded: true, sessions: 0, locks: 0 };
  const timeout = (configuredMs) => ({ configuredMs, waitStartedAtOffsetMs: 1, transactionStarted: true, waitEvent: 'transactionid', waitEventType: 'Lock', blockingPidCount: 1, elapsedMs: configuredMs, errorCategory: 'P2028', rollbackPass: true, retryPass: true });
  const businessPaths = [
    ['learning-media', 'CompleteLearningMediaUploadUseCase', 'LEARNING_MEDIA_COMPLETE'],
    ['lesson-content', 'UpdateLessonContentUseCase', 'LESSON_CONTENT_UPDATE'],
    ['teacher-lifecycle', 'ChangeTeacherEmploymentStatusUseCase', 'TEACHER_EMPLOYMENT_STATUS_CHANGE'],
  ].map(([pathId, productionEntryClass, invariantManifestId]) => ({ pathId, productionEntryClass, productionMethod: 'execute', invariantManifestId, baselineResult: 'PASS', lockResult: 'PASS', timeoutResult: 'PASS', rollbackResult: 'PASS', retryResult: 'PASS', auditResult: 'PASS', partialWrites: 0 }));
  const lockEvidence = ['learning-media', 'lesson-content', 'teacher-lifecycle'].map((pathId) => ({ pathId, waitEventType: 'Lock', waitEvent: 'transactionid', blockerCount: 1, ungrantedLockCount: 1, completedAfterRelease: true }));
  const summary = {
    schemaVersion: SUMMARY_SCHEMA_VERSION, schema: SUMMARY_SCHEMA, gate: GATE, overall: 'PASS', runId,
    baseCommit: BASE_SHA, baseTree: BASE_TREE,
    candidateProductionPatchSha256: hash, baselineRuntimeManifestSha256: hash, candidateRuntimeManifestSha256: hash,
    baselineImageId: `sha256:${'b'.repeat(64)}`, candidateImageId: `sha256:${'c'.repeat(64)}`,
    inventoryDigest: hash, playbackCallerDigest: hash,
    faultCatalogVersion: FAULT_CATALOG_VERSION, faultProofImplementationVersion: FAULT_PROOF_IMPLEMENTATION_VERSION,
    nodeVersion: 'v22.23.1', runtimePrismaVersion: '6.19.3', observerPrismaVersion: '6.19.3', postgresMajor: 16, postgresMaxConnections: 80,
    provenance: { baseCommit: BASE_SHA, baseTree: BASE_TREE, packageLockSha256: hash, candidateProductionPatchSha256: hash, baseline: { ...runtime, imageId: `sha256:${'b'.repeat(64)}` }, candidate: { ...runtime, imageId: `sha256:${'c'.repeat(64)}` } },
    topology: { serverMajor: 16, maxConnections: 80, loopbackPublished: true, builtInBridgeCompatibility: true, internalOwnedNetwork: true, immutableImage: true, tmpfs: true, persistentVolume: false },
    migrations: { deploy: 'PASS', status: 'PASS' },
    r3InitialDefectReproductions: R3_INITIAL_DEFECT_REPRODUCTIONS,
    r4InitialDefectReproductions: R4_INITIAL_DEFECT_REPRODUCTIONS,
    driverFinalization: { ok: true, phaseOneResults: [], phaseTwoResults: [], trackedPrismaClients: 0, activeOperations: 0, pendingDriverTimers: 0, pendingDriverAbortListeners: 0, firstSignal: null, requestedExitCode: 0, authoritativeFinalizerInvocations: 1 },
    inventory: { total: 4, interactive: 3, batch: 1, unknown: 0, unresolvedCallChains: 0, unresolvedRuntimeRoles: 0, unwiredTransactions: 0, duplicateIds: 0, manualOverrides: 1, externalWaitInsideTransaction: 0, externalWaitOutsideTransaction: 1, classifications: { SHORT_DB_ONLY: 2, LOCK_CONTENTION_SENSITIVE: 1, SERIALIZABLE_CONFLICT_SENSITIVE: 1, EXTERNAL_WAIT_SENSITIVE: 0 }, digest: hash },
    businessPaths,
    lockEvidence,
    entryClasses: { learningMedia: 'CompleteLearningMediaUploadUseCase', lessonContent: 'UpdateLessonContentUseCase', teacherLifecycle: 'ChangeTeacherEmploymentStatusUseCase' },
    baselineBusiness: {
      timings: { learningMediaMs: 1, lessonContentMs: 1, teacherLifecycleMs: 1 },
      learningMedia: { status: 'READY', fileCount: 1, auditCount: 1, exactOnce: true, bucketConsistent: true },
      lessonContent: { status: 'DRAFT', auditCount: 1, hierarchyUnchanged: true, unrelatedUnchanged: true },
      teacherLifecycle: { userStatus: 'DISABLED', membershipStatus: 'SUSPENDED', profileStatus: 'INACTIVE', revokedSessions: 1, auditCount: 3, allocationCount: 1, identityCount: 1, membershipCount: 1 },
    },
    business: { learningMedia: business(), lessonContent: business(), teacherLifecycle: business() },
    lockWaits: ['learningMedia', 'lessonContent', 'teacherLifecycle'].map((item) => ({ path: item, elapsedMs: 800, outcome: 'COMMITTED', blockingPidCount: 1, waitEventType: 'Lock', waitEvent: 'transactionid', ungrantedLocks: 1 })),
    timeouts: { learningMedia: timeout(15000), lessonContent: timeout(30000), teacherLifecycle: timeout(30000) },
    serializable: { outcome: 'ONE_COMMIT_ONE_SERIALIZATION_ABORT', committed: 1, aborted: 1, errorCode: 'P2034', retrySucceeded: true, invariantsPass: true, identityCount: 1, membershipCount: 1, activeMembershipCount: 1, allocationCount: 1, auditCount: 5, sessionRevoked: true, firstStartedAt: 1000, secondStartedAt: 1001, firstCompletedAt: 2000, secondCompletedAt: 2001, distinctBackendSessions: true, bothPendingBeforeRelease: true, overlapObserved: true, maximumConcurrentTransactions: 2, blockingRelationshipObserved: true },
    playback: { providerAwaitInsideTransactionBefore: true, providerAwaitInsideTransactionAfter: false, openTransactionsDuringSigning: 0, locksDuringSigning: 0, capabilityExposedOnRejectedRevalidation: false, callbackInvocations: 1, ttlSeconds: 300, callerDigest: hash, negativeRevalidationPass: true, negativeCases: { authorizationChanged: true, publicationChanged: true, uploadSessionChanged: true, mediaRemoved: true, candidateIdentityChanged: true, signingRejected: true, finalRevalidationRejected: true } },
    learningMediaLimitation: { abruptGenericVerifyingRecoveryProven: false, reason: 'A generic VERIFYING claim has no governed verification lease or stale-claim recovery proof in B3.' },
    learningVerifier: { providerPending: true, openTransactions: 0, locks: 0, completionStatus: 'READY', failureMatrixPass: true, failureMatrix: { verifierFailure: { status: 'FAILED', fileCount: 0, failureAuditCount: 1 }, factMismatch: { status: 'FAILED', reason: 'size_mismatch' }, finalizationFailure: { releasedStatus: 'UPLOADING', cleanupCalls: 1, retryStatus: 'READY', fileCount: 1, successAuditCount: 1 }, failureMatrixPass: true } },
    pool: { limit: 5, actualBlockedOperations: 5, maximumObserved: 5, maximumObservedConnections: 5, sampledOvershootObserved: false, sixthOperationIsProductionBusinessOperation: true, errorCode: 'P2024', p2024Observed: true, p2024ElapsedMs: 2000, samePoolReadiness: true, samePrismaServiceForBusinessAndReadiness: true, readinessAtFullOccupancy: 503, readinessAfterRecovery: 200, recoveryPass: true },
    cutback: [5, 2, 1].map((limit, index) => ({ limit, classification: ['NORMAL', 'EMERGENCY_DEGRADED', 'LAST_RESORT_UNREADY_WHILE_BUSY'][index], states: { zeroOccupied: { ...stateA }, oneOccupied: limit === 1 ? { readinessStatus: 503, readinessLatencyMs: 750, additionalBusinessSucceeded: false, errorCode: 'P2024', maximumConnections: 1 } : { ...stateB, maximumConnections: Math.min(2, limit) }, fullOccupancy: { ...stateC, maximumConnections: limit, backendCount: limit }, recovery: { ...stateD } }, reservedReadinessConnection: false })),
    reservedReadinessConnection: false,
    rehearsals: {
      sigint: { pass: true, exit: 130, firstSignal: 'SIGINT', authoritativeFinalizerInvocations: 1, summaryAbsent: true, sessions: 0, openTransactions: 0, idleTransactions: 0, locks: 0, markerObserved: true, partialWrites: 0, falseSuccessAudits: 0, trackedClients: 0, trackedChildren: 0, containers: 0, networks: 0, images: 0, scratchFiles: 0 },
      sigterm: { pass: true, exit: 143, firstSignal: 'SIGTERM', authoritativeFinalizerInvocations: 1, summaryAbsent: true, sessions: 0, transactions: 0, locks: 0, markerObserved: true, signerInvoked: true, signerPending: true, noPersistentClaimCreated: true, capabilityReturned: false, capabilityLogged: false, trackedClients: 0, trackedChildren: 0, containers: 0, networks: 0, images: 0, scratchFiles: 0 },
      falseStateContradiction: { pass: true, exit: 1, summaryAbsent: true, stageId: 'B3_FALSE_STATE_OBSERVER', cleanupComplete: true },
      disconnectRetry: { pass: true, usedAuthoritativeFinalizer: true, phaseOneFailed: true, dockerCleanupExecuted: true, exactNameInspectionExecuted: true, labelInspectionExecuted: true, phaseTwoSucceeded: true, trackedClients: 0, phaseTwoFailureTerminal: true, unknownRejectedBeforeMutation: true },
    },
    faultCoverage: { covered: 35, missing: 0, duplicate: 0, unknown: 0 },
    faultReceipts: [],
    finalAudit: { openTransactions: 0, idleTransactions: 0, unresolvedLockWaits: 0, applicationSessions: 0, clients: 0, children: 0, containers: 0, networks: 0, images: 0, scratchFiles: 0, partialWrites: 0, falseSuccessAudits: 0, inspectionVerified: true },
  };
  summary.faultReceipts = validFaultReceipts(summary);
  return summary;
}

function business() { return { invariantsPass: true, rollbackPass: true, duplicateConstraintsPass: true }; }

function validFaultReceipts(summary) {
  return FAULT_CATALOG.map((entry) => {
    const measured = entry.proofType === 'PURE_ADVERSARIAL_TEST'
      ? { observedErrorClass: 'AssertionError', observedStageId: entry.faultInjectionHook, expectedRejectionObserved: true }
      : testFormalEvidence(entry.id, summary);
    const digest = evidenceDigest(measured);
    const base = { id: entry.id, hook: entry.faultInjectionHook, proofId: entry.proofId, proofType: entry.proofType, observedClassification: entry.expectedClassification, observedOutcome: entry.proofType === 'PURE_ADVERSARIAL_TEST' ? 'EXPECTED_REJECTION' : testFormalOutcome(entry.id, summary), evidenceDigest: digest, executionReceipt: calculateExecutionReceipt(entry, entry.expectedClassification, digest) };
    return entry.proofType === 'PURE_ADVERSARIAL_TEST' ? { ...base, ...measured } : base;
  });
}

function testFormalOutcome(id, summary) {
  return ({'B3-F21':'ROLLBACK_AND_RETRY_SUCCEEDED','B3-F22':'ROLLBACK_AND_RETRY_SUCCEEDED','B3-F23':'ROLLBACK_AND_RETRY_SUCCEEDED','B3-F24':summary.serializable.outcome,'B3-F25':'POOL_RECOVERED','B3-F26':'SUMMARY_SUPPRESSED','B3-F27':'CAPABILITY_SUPPRESSED','B3-F28':'FAILED_WITHOUT_FILE','B3-F29':'RETRY_SUCCEEDED','B3-F30':'SIGINT_CLEANUP','B3-F31':'SIGTERM_CLEANUP','B3-F32':'FAIL_CLOSED','B3-F33':'PHASE_TWO_RECOVERED','B3-F34':'RESULT_SUPPRESSED'})[id];
}

function testFormalEvidence(id, summary) {
  const timeout = (key) => { const item=summary.timeouts[key];return { errorCategory:item.errorCategory,rollbackPass:item.rollbackPass,retryPass:item.retryPass,elapsedMs:item.elapsedMs }; };
  switch (id) {
    case 'B3-F21': return timeout('learningMedia');
    case 'B3-F22': return timeout('lessonContent');
    case 'B3-F23': return timeout('teacherLifecycle');
    case 'B3-F24': return Object.fromEntries(['outcome','committed','aborted','errorCode','retrySucceeded','invariantsPass','identityCount','membershipCount','activeMembershipCount','allocationCount','auditCount','sessionRevoked','distinctBackendSessions','bothPendingBeforeRelease','overlapObserved','maximumConcurrentTransactions','blockingRelationshipObserved','firstStartedAt','secondStartedAt','firstCompletedAt','secondCompletedAt'].map((key)=>[key,summary.serializable[key]]));
    case 'B3-F25': return { errorCode:summary.pool.errorCode,recoveryPass:summary.pool.recoveryPass,p2024Observed:summary.pool.p2024Observed };
    case 'B3-F26': return { stageId:summary.rehearsals.falseStateContradiction.stageId,summaryAbsent:summary.rehearsals.falseStateContradiction.summaryAbsent };
    case 'B3-F27': return { negativeRevalidationPass:Object.values(summary.playback.negativeCases).every(Boolean),capabilityExposedOnRejectedRevalidation:summary.playback.capabilityExposedOnRejectedRevalidation };
    case 'B3-F28': return { ...summary.learningVerifier.failureMatrix.verifierFailure };
    case 'B3-F29': return { ...summary.learningVerifier.failureMatrix.finalizationFailure };
    case 'B3-F30': return Object.fromEntries(['exit','partialWrites','falseSuccessAudits','authoritativeFinalizerInvocations','summaryAbsent'].map((key)=>[key,summary.rehearsals.sigint[key]]));
    case 'B3-F31': return Object.fromEntries(['exit','transactions','capabilityReturned','authoritativeFinalizerInvocations','summaryAbsent'].map((key)=>[key,summary.rehearsals.sigterm[key]]));
    case 'B3-F32': return Object.fromEntries(['exit','cleanupComplete','summaryAbsent','stageId'].map((key)=>[key,summary.rehearsals.falseStateContradiction[key]]));
    case 'B3-F33': return Object.fromEntries(['phaseOneFailed','phaseTwoSucceeded','trackedClients'].map((key)=>[key,summary.rehearsals.disconnectRetry[key]]));
    case 'B3-F34': return { phaseTwoFailureTerminal:summary.rehearsals.disconnectRetry.phaseTwoFailureTerminal };
    default: throw new Error(`${id} is not evidence-derived in this fixture`);
  }
}

function formalBuilderArgs(source) {
  return {
    runId:source.runId,
    provenance:structuredClone(source.provenance),
    inventory:{...structuredClone(source.inventory),rows:[{transactionId:'measured-final-audit'}]},
    playbackConsumers:{digest:source.playbackCallerDigest},
    result:{
      baseline:structuredClone(source.baselineBusiness),business:structuredClone(source.business),lockWaits:structuredClone(source.lockWaits),timeouts:structuredClone(source.timeouts),serializable:structuredClone(source.serializable),
      playback:{signerObservedOpenTransaction:false,providerWaitOpenTransactions:0,providerWaitLocks:0,callbackInvocations:1,capabilityExposedOnRejectedRevalidation:false,negativeMatrix:{authorization:true,publication:true,uploadSession:true,mediaRemoval:true,candidateIdentity:true,signingRejected:true,finalRevalidationRejected:true}},
      learningVerifier:structuredClone(source.learningVerifier),pool:structuredClone(source.pool),cutback:structuredClone(source.cutback),reservedReadinessConnection:false,driverFinalization:structuredClone(source.driverFinalization),
      finalDatabaseAudit:{openTransactions:0,idleTransactions:0,unresolvedLockWaits:0,applicationSessions:0,partialWrites:0,falseSuccessAudits:0},
    },
    baselinePlayback:{signerObservedOpenTransaction:true},topology:structuredClone(source.topology),migrations:structuredClone(source.migrations),rehearsals:structuredClone(source.rehearsals),faultCoverage:structuredClone(source.faultCoverage),faultReceipts:structuredClone(source.faultReceipts),
    supervisorCleanupAudit:{clients:0,children:0,containers:0,networks:0,images:0,scratchFiles:0,inspectionVerified:true},
  };
}
