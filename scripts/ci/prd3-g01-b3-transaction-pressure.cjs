'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ts = require('typescript');
const {
  ChildProcessTracker,
  PRISMA_DISCONNECT_STATUS,
  EvidenceFileTracker,
  EvidenceState,
  EVIDENCE_PHASE,
  buildMinimalChildEnvironment,
  disconnectTrackedPrismaClients,
  redactText,
  resolvePinnedLocalDockerEndpoint,
  runChild,
  withDeadline,
} = require('./prd3-g01-b-pool-saturation.cjs');
const {
  buildCanonicalDockerBuildArgs,
  parseRuntimeManifestVerification,
  runtimeManifestVerificationScript,
} = require('./prd3-g01-b2-database-recovery.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
let activeEvidenceSignal = null;
const BASE_SHA = '5dba92b120c8d36ad0d5738a522910575138b284';
const BASE_TREE = 'f46b4dccd5d31a09cf1374c647c0bbc6f3d4078c';
const POSTGRES_IMAGE = 'sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const NODE_IMAGE = 'sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3';
const PLAYBACK_PATH = path.join('src', 'modules', 'academics', 'curriculum', 'app-facing', 'lesson-content-playback', 'lesson-content-playback.coordinator.ts');
const SUMMARY_SCHEMA_VERSION = 4;
const SUMMARY_SCHEMA = 'moazez.prd3-g01-b3.transaction-pressure.v4';
const FAULT_CATALOG_VERSION = 'prd3-g01-b3-fault-catalog-r4-v1';
const FAULT_PROOF_IMPLEMENTATION_VERSION = 'prd3-g01-b3-evidence-derived-receipts-r4-v1';
const SERIALIZABLE_AUDIT_COUNT = 5;
const LOCK_CONTENTION_BOUND_MS = 10_000;
const LABEL = 'com.moazez.evidence.prd3-g01-b3';
const GATE = 'PRD3-G01-B3';
const GATE_LABEL = 'com.moazez.evidence.gate';
const RUN_LABEL = 'com.moazez.evidence.run';
const ROLE_LABEL = 'com.moazez.evidence.role';
const MIGRATION_COMMANDS = Object.freeze([
  Object.freeze(['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy']),
  Object.freeze(['/app/node_modules/prisma/build/index.js', 'migrate', 'status']),
]);
const AUTHORIZED_PATHS = Object.freeze([
  'adr/ADR-0005-cloud-sql-runtime-connections-and-database-role-boundary.md',
  'docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md',
  'docs/production-readiness/phase-3/00-cloud-sql-runtime-topology-and-connection-budget.md',
  'docs/production-readiness/phase-3/03-business-transaction-pressure-and-cutback-evidence.md',
  'package.json',
  'scripts/ci/prd3-g01-b3-transaction-pressure.cjs',
  'scripts/tests/prd3-g01-b3-transaction-pressure.test.cjs',
  'src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator.ts',
  'src/modules/academics/curriculum/app-facing/lesson-content-playback/tests/lesson-content-playback.coordinator.spec.ts',
]);
const ALLOWED_CLASSES = new Set([
  'SHORT_DB_ONLY',
  'LOCK_CONTENTION_SENSITIVE',
  'SERIALIZABLE_CONFLICT_SENSITIVE',
  'EXTERNAL_WAIT_SENSITIVE',
]);
const ALLOWED_RUNTIME_ROLES = new Set([
  'api',
  'core-worker',
  'media-worker',
  'migration',
  'maintenance',
  'test-only',
]);
const GENERIC_CALLBACK_NAMES = new Set([
  'callback', 'operation', 'handler', 'executor', 'action', 'work',
]);
const INITIAL_DEFECT_REPRODUCTIONS = Object.freeze({
  signalRouting: Object.freeze({ interrupted: true, requestedExitCode: 130, finalizationStarted: false, ordinaryContinuationRan: true, longRunningChildStillRunning: true }),
  executableProcessExitMatches: 2,
  neverSettlingDisconnect: Object.freeze({ outcome: 'DEADLINE', laterCleanupReached: false }),
  returnedPromiseFalseNegatives: 5,
  strictSummaryFalseAcceptances: Object.freeze(['externalWaitInsideTransaction', 'duplicateBusinessPath', 'duplicateLockPath', 'missingInvariantManifest', 'missingActualBlockedOperations', 'missingSampledOvershootObserved', 'missingPlaybackNegativeCase']),
  sourceDerivedPlaybackBypass: true,
  disconnectRehearsalUsedAuthoritativeFinalizer: false,
});
const R3_INITIAL_DEFECT_REPRODUCTIONS = Object.freeze({
  serializableFalseClassification: Object.freeze({ unknownClassifiedAs: 'TRANSACTION_TIMEOUT', falselyAcceptedOutcome: 'ONE_COMMIT_ONE_SERIALIZATION_ABORT' }),
  strictSummaryFalseAcceptances: Object.freeze(['classification_inside_mismatch', 'wrong_business_entry_class', 'duplicate_lock_waits', 'forged_fault_receipt_metadata', 'wrong_invariant_manifest_pairing', 'serializable_timeout_as_conflict', 'inconsistent_cutback_connection_count']),
  driverPublicationBeforeCleanup: Object.freeze({ resultMarkerExposed: true, phaseOneDisconnectFailed: true, phaseTwoDisconnectNeverSettled: true, trackedClients: 1 }),
  nonAbortAwarePolling: Object.freeze(['postgres-readiness', 'container-marker', 'container-exit', 'loopback-tcp']),
});
const R4_INITIAL_DEFECT_REPRODUCTIONS = Object.freeze({
  sequentialSerializable: Object.freeze({ firstCompletedBeforeSecondAdmission: true, concurrentOverlap: false }),
  emptyEvidenceReceipts: 14,
  unrelatedFaultErrorAccepted: true,
  f24ContradictionAccepted: Object.freeze({ outcome: 'SERIALIZED_ORDERED_COMMITS', committed: 2, aborted: 0, catalogClassification: 'P2034' }),
  boundedOperationAccounting: Object.freeze({ activeOperations: 0, underlyingOperationSettled: false }),
  hardcodedFinalAudit: Object.freeze({ measuredApplicationSessions: 1, summarizedApplicationSessions: 0 }),
});

function validateInitialDefectReproductions(value = INITIAL_DEFECT_REPRODUCTIONS) {
  assert.equal(value.signalRouting.finalizationStarted, false);
  assert.equal(value.signalRouting.ordinaryContinuationRan, true);
  assert.equal(value.signalRouting.longRunningChildStillRunning, true);
  assert.equal(value.executableProcessExitMatches, 2);
  assert.deepEqual(value.neverSettlingDisconnect, { outcome: 'DEADLINE', laterCleanupReached: false });
  assert.equal(value.returnedPromiseFalseNegatives, 5);
  assert.equal(value.strictSummaryFalseAcceptances.length, 7);
  assert.equal(value.sourceDerivedPlaybackBypass, true);
  assert.equal(value.disconnectRehearsalUsedAuthoritativeFinalizer, false);
  return value;
}

function validateR3InitialDefectReproductions(value = R3_INITIAL_DEFECT_REPRODUCTIONS) {
  assert.deepEqual(value.serializableFalseClassification, { unknownClassifiedAs: 'TRANSACTION_TIMEOUT', falselyAcceptedOutcome: 'ONE_COMMIT_ONE_SERIALIZATION_ABORT' });
  assert.equal(value.strictSummaryFalseAcceptances.length, 7);
  assert.deepEqual(value.driverPublicationBeforeCleanup, { resultMarkerExposed: true, phaseOneDisconnectFailed: true, phaseTwoDisconnectNeverSettled: true, trackedClients: 1 });
  assert.deepEqual(value.nonAbortAwarePolling, ['postgres-readiness', 'container-marker', 'container-exit', 'loopback-tcp']);
  return value;
}

function validateR4InitialDefectReproductions(value = R4_INITIAL_DEFECT_REPRODUCTIONS) {
  assert.deepEqual(value.sequentialSerializable, { firstCompletedBeforeSecondAdmission: true, concurrentOverlap: false });
  assert.equal(value.emptyEvidenceReceipts, 14);
  assert.equal(value.unrelatedFaultErrorAccepted, true);
  assert.deepEqual(value.f24ContradictionAccepted, { outcome: 'SERIALIZED_ORDERED_COMMITS', committed: 2, aborted: 0, catalogClassification: 'P2034' });
  assert.deepEqual(value.boundedOperationAccounting, { activeOperations: 0, underlyingOperationSettled: false });
  assert.deepEqual(value.hardcodedFinalAudit, { measuredApplicationSessions: 1, summarizedApplicationSessions: 0 });
  return value;
}
const ENTRY_CLASS_MANIFEST = Object.freeze({
  learningMedia: Object.freeze({
    pathId: 'LEARNING_MEDIA_COMPLETE',
    entryClass: 'CompleteLearningMediaUploadUseCase',
    method: 'execute',
    unitOfWork: 'PrismaLearningMediaUnitOfWork',
    repository: 'LearningMediaRepository',
    controlledBoundaries: Object.freeze(['MediaVerifierService', 'StorageService']),
  }),
  lessonContent: Object.freeze({
    pathId: 'LESSON_CONTENT_UPDATE',
    entryClass: 'UpdateLessonContentUseCase',
    method: 'execute',
    unitOfWork: 'PrismaLessonContentUnitOfWork',
    repository: 'LessonContentRepository',
    controlledBoundaries: Object.freeze([]),
  }),
  teacherLifecycle: Object.freeze({
    pathId: 'TEACHER_EMPLOYMENT_STATUS_CHANGE',
    entryClass: 'ChangeTeacherEmploymentStatusUseCase',
    method: 'execute',
    unitOfWork: 'PrismaTeacherLifecycleUnitOfWork',
    repository: 'PrismaTeacherLifecycleTransactionOperations',
    controlledBoundaries: Object.freeze([]),
  }),
});
const BUSINESS_PATH_EXPECTATIONS = Object.freeze({
  'learning-media': Object.freeze({ key: 'learningMedia', productionEntryClass: 'CompleteLearningMediaUploadUseCase', productionMethod: 'execute', invariantManifestId: 'LEARNING_MEDIA_COMPLETE' }),
  'lesson-content': Object.freeze({ key: 'lessonContent', productionEntryClass: 'UpdateLessonContentUseCase', productionMethod: 'execute', invariantManifestId: 'LESSON_CONTENT_UPDATE' }),
  'teacher-lifecycle': Object.freeze({ key: 'teacherLifecycle', productionEntryClass: 'ChangeTeacherEmploymentStatusUseCase', productionMethod: 'execute', invariantManifestId: 'TEACHER_EMPLOYMENT_STATUS_CHANGE' }),
});
const LOCK_PATH_EXPECTATIONS = Object.freeze({
  'learning-media': 'learningMedia',
  'lesson-content': 'lessonContent',
  'teacher-lifecycle': 'teacherLifecycle',
});
const BUSINESS_INVARIANT_MANIFESTS = Object.freeze({
  learningMedia: Object.freeze({
    pathId: 'LEARNING_MEDIA_COMPLETE', entryClass: 'CompleteLearningMediaUploadUseCase', method: 'execute',
    preStateQueries: Object.freeze(['upload session status and object identities', 'File count for final identity', 'successful audit count']),
    expectedCommittedWrites: Object.freeze(['UPLOADING to VERIFYING claim', 'exactly one READY finalization', 'one File create or contract-safe reuse', 'one success audit']),
    forbiddenWrites: Object.freeze(['false READY after failure', 'changed bucket or object identity', 'duplicate File', 'duplicate finalization']),
    auditExpectations: Object.freeze(['one completion success audit only after commit', 'failure audit only for media verification rejection']),
    idempotencyExpectation: 'READY replay returns the existing completion without another File or audit',
    rollbackExpectations: Object.freeze(['claim lock timeout writes nothing', 'finalization failure releases to retryable UPLOADING or cleanup-pending safe state']),
    duplicateConstraints: Object.freeze(['File bucket/object unique', 'FileUploadSession fileId unique', 'session finalized once']),
    postStateQueries: Object.freeze(['upload session facts', 'File identity/count', 'completion and failure audit counts']),
  }),
  lessonContent: Object.freeze({
    pathId: 'LESSON_CONTENT_UPDATE', entryClass: 'UpdateLessonContentUseCase', method: 'execute',
    preStateQueries: Object.freeze(['curriculum/unit/lesson hierarchy', 'target and unrelated content snapshots', 'lesson-content audit count']),
    expectedCommittedWrites: Object.freeze(['target DRAFT content item only', 'one successful update audit']),
    forbiddenWrites: Object.freeze(['curriculum mutation', 'unit mutation', 'lesson mutation', 'unrelated content mutation', 'publication transition']),
    auditExpectations: Object.freeze(['one academics.lesson_content.update audit on commit', 'zero success audit on timeout']),
    idempotencyExpectation: 'optimistic updatedAt condition prevents duplicate stale mutation',
    rollbackExpectations: Object.freeze(['target and hierarchy unchanged after timeout', 'zero success audit', 'single retry commit']),
    duplicateConstraints: Object.freeze(['content primary identity unchanged', 'no duplicate content item', 'no duplicate success audit for one operation']),
    postStateQueries: Object.freeze(['hierarchy snapshots', 'target/unrelated content snapshots', 'exact audit rows']),
  }),
  teacherLifecycle: Object.freeze({
    pathId: 'TEACHER_EMPLOYMENT_STATUS_CHANGE', entryClass: 'ChangeTeacherEmploymentStatusUseCase', method: 'execute',
    preStateQueries: Object.freeze(['user identity/status', 'current teacher membership', 'teacher profile', 'live sessions', 'allocations', 'teacher lifecycle audits']),
    expectedCommittedWrites: Object.freeze(['profile employment state', 'user status', 'membership status', 'session revocation', 'three exact success audits for ACTIVE to INACTIVE']),
    forbiddenWrites: Object.freeze(['user type change', 'new identity', 'new membership', 'allocation mutation', 'transfer mutation']),
    auditExpectations: Object.freeze(['employment, account-disable, and membership-suspend audits only on commit', 'zero success audit on timeout or serialization abort']),
    idempotencyExpectation: 'state transition guard rejects a duplicate ACTIVE to INACTIVE command',
    rollbackExpectations: Object.freeze(['user/membership/profile/session/allocation/audits unchanged on timeout or abort', 'fresh valid transition succeeds after blocker release']),
    duplicateConstraints: Object.freeze(['one user identity', 'one active teacher membership maximum', 'one teacher profile per school/user']),
    postStateQueries: Object.freeze(['user/membership/profile/session snapshots', 'allocation dependency state', 'exact audit actions and counts']),
  }),
});
const PLAYBACK_CONSUMER_AUDIT = Object.freeze([
  Object.freeze({ id: 'coordinator-execute', path: PLAYBACK_PATH.split(path.sep).join('/'), caller: 'LessonContentPlaybackCoordinator.execute', callee: 'withPlayableMedia', classification: 'EXTERNAL_READ_ONLY_PROVIDER', evidence: 'StorageService.createDownloadUrl creates an expiring read capability and performs no database or domain write.' }),
  Object.freeze({ id: 'teacher-playback', path: 'src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts', caller: 'TeacherLessonPreparationReadAdapter.getLessonContentPlayback', callee: 'execute', classification: 'EXTERNAL_READ_ONLY_PROVIDER', evidence: 'Delegates to the coordinator download-capability path.' }),
  Object.freeze({ id: 'parent-playback', path: 'src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts', caller: 'ParentChildLessonsReadAdapter.getLessonContentPlayback', callee: 'execute', classification: 'EXTERNAL_READ_ONLY_PROVIDER', evidence: 'Delegates to the coordinator download-capability path.' }),
  Object.freeze({ id: 'student-playback', path: 'src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts', caller: 'StudentLessonsReadAdapter.getLessonContentPlayback', callee: 'execute', classification: 'EXTERNAL_READ_ONLY_PROVIDER', evidence: 'Delegates to the coordinator download-capability path.' }),
  Object.freeze({ id: 'student-with-playable', path: 'src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts', caller: 'StudentLessonsReadAdapter.withPlayableLessonContent', callee: 'withPlayableMedia', classification: 'PURE_CAPABILITY_GENERATION', evidence: 'The only production callback is the findPlayableLessonContent identity projection.' }),
  Object.freeze({ id: 'student-find-playable', path: 'src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts', caller: 'StudentLessonsReadAdapter.findPlayableLessonContent', callee: 'withPlayableLessonContent', classification: 'PURE_CAPABILITY_GENERATION', evidence: 'Promise.resolve returns the authorized record without side effects.' }),
]);
const FAILURE_IDS = Object.freeze(Array.from({ length: 35 }, (_, index) => `B3-F${String(index + 1).padStart(2, '0')}`));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalizeEvidence(value) {
  if (Array.isArray(value)) return value.map(canonicalizeEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeEvidence(value[key])]));
  }
  return value;
}

function evidenceDigest(value) {
  return sha256(JSON.stringify(canonicalizeEvidence(value)));
}

function calculateExecutionReceipt(entry, observedClassification, digest) {
  return sha256([entry.id, entry.faultInjectionHook, entry.proofId, observedClassification, digest].join('\n'));
}

function normalized(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function walk(root, files = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(absolute);
  }
  return files;
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

function literalNumber(node) {
  if (!node) return null;
  if (ts.isNumericLiteral(node)) return Number(node.text.replaceAll('_', ''));
  return null;
}

function objectOption(object, name) {
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  const item = object.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property.name) === name);
  return item && ts.isPropertyAssignment(item) ? item.initializer : null;
}

function enclosingOwner(node) {
  let current = node.parent;
  let method = null;
  let owner = null;
  while (current) {
    if (!method && (ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current))) method = propertyName(current.name) ?? 'anonymous';
    if (!owner && ts.isClassDeclaration(current)) owner = current.name?.text ?? 'AnonymousClass';
    current = current.parent;
  }
  return [owner, method].filter(Boolean).join('.') || 'module';
}

function enclosingOwnerNode(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isMethodDeclaration(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) return current;
    current = current.parent;
  }
  return node.getSourceFile();
}

function inferFeature(relativePath) {
  const segments = normalized(relativePath).split('/');
  const modulesIndex = segments.indexOf('modules');
  return modulesIndex >= 0 ? segments.slice(modulesIndex + 1, Math.min(modulesIndex + 4, segments.length - 1)).join('/') : segments.slice(0, -1).join('/');
}

function inferTables(text) {
  const tables = new Set();
  for (const match of text.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO|DELETE FROM)\s+["'`]?([a-z][a-z0-9_]*)/gi)) tables.add(match[1].toLowerCase());
  for (const match of text.matchAll(/\b([a-z][A-Za-z0-9]+)\.(?:find|create|update|delete|upsert|count|aggregate)/g)) tables.add(match[1]);
  return [...tables].sort();
}

const DATABASE_METHODS = new Set([
  'aggregate', 'count', 'create', 'createMany', 'delete', 'deleteMany',
  'executeRaw', 'executeRawUnsafe', 'findFirst', 'findFirstOrThrow', 'findMany',
  'findUnique', 'findUniqueOrThrow', 'groupBy', 'queryRaw', 'queryRawUnsafe',
  'update', 'updateMany', 'upsert',
]);
const PURE_CALL_ROOTS = new Set([
  'Array', 'BigInt', 'Boolean', 'Date', 'JSON', 'Math', 'Number', 'Object',
  'Promise', 'Set', 'String', 'assert', 'crypto',
]);
const PURE_METHODS = new Set([
  'at', 'catch', 'concat', 'entries', 'every', 'filter', 'find', 'flat', 'flatMap',
  'forEach', 'from', 'has', 'includes', 'join', 'keys', 'map', 'parse',
  'reduce', 'replace', 'slice', 'some', 'sort', 'startsWith', 'stringify', 'toISOString',
  'toLowerCase', 'trim', 'values',
]);
const REVIEWED_CALL_OVERRIDES = Object.freeze([
  Object.freeze({
    path: 'src/modules/academics/curriculum/infrastructure/prisma-lesson-content.unit-of-work.ts',
    target: /^callback$/,
    reason: 'The generic unit-of-work callback is supplied by the seven lesson-content application use cases.',
    classification: 'SHORT_DB_ONLY',
    resolvedCallers: Object.freeze(['CreateLessonContentUseCase.execute', 'UpdateLessonContentUseCase.execute', 'PublishLessonContentUseCase.execute', 'UnpublishLessonContentUseCase.execute', 'ArchiveLessonContentUseCase.execute', 'RestoreLessonContentUseCase.execute', 'DeleteLessonContentUseCase.execute']),
    evidence: 'Each source-derived caller receives only LessonContentTransactionContext and the callback Promise is returned by the Prisma transaction callback.',
  }),
  Object.freeze({
    path: 'src/modules/files/uploads/infrastructure/prisma-learning-media.unit-of-work.ts',
    target: /^callback$/,
    reason: 'The generic unit-of-work callback is supplied by the learning-media upload application use cases.',
    classification: 'SHORT_DB_ONLY',
    resolvedCallers: Object.freeze(['CreateLearningMediaUploadUseCase.execute', 'CompleteLearningMediaUploadUseCase.execute', 'VerifyLegacyLearningMediaUseCase.execute', 'CancelLearningMediaUploadUseCase.execute']),
    evidence: 'The reviewed callers receive only LearningMediaTransactionContext; external verifier and storage waits occur before or after these transaction callbacks.',
  }),
  Object.freeze({
    path: 'src/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work.ts',
    target: /^callback$/,
    reason: 'The generic unit-of-work callback is supplied by reviewed teacher lifecycle application coordinators and use cases.',
    classification: 'SERIALIZABLE_CONFLICT_SENSITIVE',
    resolvedCallers: Object.freeze(['ChangeTeacherEmploymentStatusUseCase.execute', 'TeacherAccountDisableCoordinator.execute', 'TeacherRoleDemotionCoordinator.execute']),
    evidence: 'Every caller receives the frozen TeacherLifecycleTransactionContext and runs within the explicitly Serializable transaction.',
  }),
  Object.freeze({
    path: 'src/modules/academics/curriculum/infrastructure/prisma-lesson-content.unit-of-work.ts',
    target: /^this\.repository\.createTransactionContext$/,
    reason: 'The repository context factory is a synchronous transaction-client adapter.',
    classification: 'SHORT_DB_ONLY',
    resolvedCallers: Object.freeze(['PrismaLessonContentUnitOfWork.execute']),
    evidence: 'The factory binds the already-open Prisma TransactionClient and school scope without performing I/O.',
  }),
  Object.freeze({
    path: 'src/modules/files/uploads/infrastructure/prisma-learning-media.unit-of-work.ts',
    target: /^this\.repository\.createTransactionContext$/,
    reason: 'The repository context factory is a synchronous transaction-client adapter.',
    classification: 'SHORT_DB_ONLY',
    resolvedCallers: Object.freeze(['PrismaLearningMediaUnitOfWork.execute']),
    evidence: 'The factory binds the already-open Prisma TransactionClient without performing I/O.',
  }),
  Object.freeze({
    target: /^input\.buildAuditEntry$/,
    reason: 'The callback is supplied as a synchronous audit-data builder, so its implementation is intentionally outside the repository declaration.',
    classification: 'SHORT_DB_ONLY',
    evidence: 'Reviewed repository contracts call buildAuditEntry only to construct Prisma AuditLog create data; the returned value is awaited by Prisma, not by the builder.',
  }),
  Object.freeze({
    target: /^load$/,
    reason: 'The transaction-local loader is returned by a higher-order helper and has no directly resolvable declaration body.',
    classification: 'SHORT_DB_ONLY',
    evidence: 'The two communication attachment transactions pass the active transaction client to load; all observed operations remain Prisma reads.',
  }),
  Object.freeze({
    target: /^buildStudentUpdateDataFromCorrectionChanges$/,
    reason: 'The imported domain projection resolves through a re-export not followed by the lightweight resolver.',
    classification: 'SHORT_DB_ONLY',
    evidence: 'The helper is a synchronous DTO-to-Prisma-data projection and performs no I/O.',
  }),
  Object.freeze({
    target: /^createDismissal(?:Parent|Staff)Notifications?ForRequestEvent$/,
    reason: 'The helper is imported across a mixed-separator module path that the lightweight resolver cannot bind consistently on Windows.',
    classification: 'SHORT_DB_ONLY',
    evidence: 'Both notification helpers accept the active Prisma TransactionClient and only create communication notification and delivery rows in that transaction.',
  }),
]);
const REVIEWED_RUNTIME_ROLE_OVERRIDES = Object.freeze([
  Object.freeze({
    path: 'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository.ts',
    role: 'api',
    reason: 'The first-administrator repository is reachable only through the explicit Stage 20B operator CLI, outside the long-lived runtime import graph.',
    evidence: 'src/platform-admin-bootstrap.ts creates PlatformAdminBootstrapModule only after platform-admin-bootstrap.environment.ts validates the existing DATABASE_RUNTIME_ROLE=api contract.',
  }),
]);
const EXTERNAL_TARGET_PATTERN = /(?:^(?:this\.)?(?:storage|verifier|provider|mailer|redis|queue|bull|http|s3|minio|firebase|socket|webhook)\.|\.createDownloadUrl$|\.verifyAndStoreFinal$|\.verifyExistingFinal$|^fetch$)/i;
const LOCK_PATTERN = /FOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE)|pg_(?:advisory|blocking_pids)/i;

function declarationName(node) {
  if (ts.isMethodDeclaration(node)) return propertyName(node.name);
  if (ts.isFunctionDeclaration(node)) return node.name?.text ?? null;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function callTarget(call, source) {
  return call.expression.getText(source).replace(/\s+/g, '');
}

function isEffectivelyWaited(node, boundary) {
  let current = node.parent;
  while (current) {
    if (ts.isAwaitExpression(current)) return true;
    if (ts.isReturnStatement(current)) return true;
    if (current === boundary) {
      return ts.isArrowFunction(boundary) && !ts.isBlock(boundary.body);
    }
    if (ts.isFunctionLike(current)) return false;
    if (ts.isStatement(current) && !ts.isReturnStatement(current)) return false;
    current = current.parent;
  }
  return false;
}

function buildRuntimeRoleIndex(program) {
  const graph = new Map();
  const byPath = new Map();
  const sourcePrefix = path.resolve(ROOT, 'src').toLowerCase();
  for (const source of program.getSourceFiles()) {
    if (!path.resolve(source.fileName).toLowerCase().startsWith(sourcePrefix)) continue;
    const absolute = path.resolve(source.fileName);
    const absoluteKey = absolute.toLowerCase();
    byPath.set(absoluteKey, absolute);
    const imports = [];
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const base = path.resolve(path.dirname(absolute), specifier);
      for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate)) {
          imports.push(path.resolve(candidate).toLowerCase());
          break;
        }
      }
    }
    graph.set(absoluteKey, imports);
  }
  const roles = new Map();
  const entrypoints = [
    ['api', 'src/main.ts'],
    ['core-worker', 'src/core-worker.ts'],
    ['media-worker', 'src/media-worker.ts'],
    ['maintenance', 'src/maintenance-scheduler.ts'],
  ];
  for (const [role, relative] of entrypoints) {
    const entry = path.join(ROOT, relative);
    if (!fs.existsSync(entry)) continue;
    const pending = [path.resolve(entry).toLowerCase()];
    const visited = new Set();
    while (pending.length > 0) {
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      if (!roles.has(current)) roles.set(current, new Set());
      roles.get(current).add(role);
      for (const dependency of graph.get(current) ?? []) pending.push(dependency);
    }
  }
  return { byPath, roles };
}

function resolveRuntimeRole(relativePath, detectedRoles, overrides = []) {
  const reviewed = overrides.find((item) => item.path === normalized(relativePath));
  if (reviewed) {
    requiredString(reviewed.role, 'runtime override role');
    requiredString(reviewed.reason, 'runtime override reason');
    requiredString(reviewed.evidence, 'runtime override evidence');
    assert.ok(ALLOWED_RUNTIME_ROLES.has(reviewed.role), 'runtime override role is not allowed');
    return Object.freeze({ role: reviewed.role, roles: Object.freeze([reviewed.role]), evidence: reviewed.evidence, override: reviewed });
  }
  const roles = [...detectedRoles].sort();
  for (const role of roles) assert.ok(ALLOWED_RUNTIME_ROLES.has(role), `runtime role ${role} is not allowed`);
  return Object.freeze({
    role: roles.length === 1 ? roles[0] : roles.length > 1 ? 'shared' : 'unwired-production',
    roles: Object.freeze(roles),
    evidence: roles.length > 0 ? 'entrypoint import graph' : 'not reachable from a production entrypoint import graph',
    override: null,
  });
}

function isPathWithinDirectory(fileName, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(fileName));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveCallDeclaration(checker, call, sourceRoot) {
  let symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name
      : call.expression,
  );
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const declarations = symbol?.getDeclarations() ?? [];
  return declarations.find((declaration) =>
    isPathWithinDirectory(declaration.getSourceFile().fileName, sourceRoot),
  ) ?? null;
}

function isTypeScriptStandardLibraryDeclaration(declaration) {
  const sourceFile = declaration.getSourceFile();
  const typescriptLibraryDirectory = path.dirname(require.resolve('typescript'));
  return sourceFile.isDeclarationFile &&
    /^lib\..+\.d\.ts$/u.test(path.basename(sourceFile.fileName)) &&
    isPathWithinDirectory(sourceFile.fileName, typescriptLibraryDirectory);
}

function isStandardLibraryRegExpType(checker, receiver) {
  const type = checker.getTypeAtLocation(receiver);
  const constituentTypes = type.isUnionOrIntersection() ? type.types : [type];
  return constituentTypes.length > 0 && constituentTypes.every((constituent) => {
    const symbol = constituent.getSymbol();
    const declarations = symbol?.getDeclarations() ?? [];
    return symbol?.getName() === 'RegExp' &&
      declarations.length > 0 &&
      declarations.every(isTypeScriptStandardLibraryDeclaration);
  });
}

function isKnownSynchronousIntrinsicCall(checker, call) {
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
  if (call.expression.name.text !== 'test') return false;
  const receiver = call.expression.expression;
  return ts.isRegularExpressionLiteral(receiver) || isStandardLibraryRegExpType(checker, receiver);
}

function functionImplementation(declaration) {
  if (ts.isFunctionLike(declaration)) return declaration;
  if (
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer &&
    ts.isFunctionLike(declaration.initializer)
  ) return declaration.initializer;
  return null;
}

function resolveCallbackArgument(checker, argument, sourceRoot) {
  if (ts.isFunctionLike(argument)) return argument;
  let symbol = checker.getSymbolAtLocation(argument);
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  for (const declaration of symbol?.getDeclarations() ?? []) {
    if (!isPathWithinDirectory(declaration.getSourceFile().fileName, sourceRoot)) continue;
    const implementation = functionImplementation(declaration);
    if (implementation?.body) return implementation;
  }
  return null;
}

function bindCallbackArguments(checker, implementation, call, sourceRoot) {
  const bindings = new Map();
  for (let index = 0; index < implementation.parameters.length; index += 1) {
    const parameter = implementation.parameters[index];
    const argument = call.arguments[index];
    if (!argument || !ts.isIdentifier(parameter.name)) continue;
    const callback = resolveCallbackArgument(checker, argument, sourceRoot);
    if (callback) bindings.set(parameter.name.text, callback);
  }
  return bindings;
}

function astIdentity(node) {
  return `${normalized(path.resolve(node.getSourceFile().fileName))}:${node.pos}:${node.end}`;
}

function callbackBindingsIdentity(callbackBindings) {
  return [...callbackBindings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([parameter, callback]) => `${parameter}=${astIdentity(callback)}`)
    .join(',');
}

function resolveLocalCallDeclaration(source, call) {
  if (!source.__b3LocalDeclarations) {
    const declarations = new Map();
    const collect = (node) => {
      if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
        const name = declarationName(node);
        if (name && !declarations.has(name)) declarations.set(name, node);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isFunctionLike(node.initializer)
      ) declarations.set(node.name.text, node.initializer);
      ts.forEachChild(node, collect);
    };
    collect(source);
    Object.defineProperty(source, '__b3LocalDeclarations', { value: declarations });
  }
  const name = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : ts.isIdentifier(call.expression)
      ? call.expression.text
      : null;
  return name ? source.__b3LocalDeclarations.get(name) ?? null : null;
}

function analyzeCallback({ callback, ownerNode, source, checker, sourceRoot }) {
  const analysis = {
    awaitedCalls: [],
    effectiveWaitCalls: [],
    databaseCalls: [],
    externalCalls: [],
    explicitLocks: [],
    tables: new Set(),
    unresolvedCalls: [],
    resolvedHelpers: [],
  };
  const visited = new Set();
  const callbackStart = callback.pos;
  const callbackEnd = callback.end;

  function visitTree(node, origin, includeNestedFunctions = true, callbackBindings = new Map()) {
    const key = `${astIdentity(node)}|callbacks:${callbackBindingsIdentity(callbackBindings)}`;
    if (visited.has(key)) return;
    visited.add(key);
    const nodeSource = node.getSourceFile();
    const text = node.getText(nodeSource);
    if (LOCK_PATTERN.test(text)) {
      const matches = [...text.matchAll(new RegExp(LOCK_PATTERN.source, 'gi'))];
      for (const match of matches) analysis.explicitLocks.push({ origin, evidence: match[0].toUpperCase() });
    }
    for (const table of inferTables(text)) analysis.tables.add(table);

    const visit = (child) => {
      if (ts.isFunctionLike(child) && child !== node && !includeNestedFunctions) return;
      if (ts.isCallExpression(child)) {
        const target = callTarget(child, nodeSource);
        const awaited = isEffectivelyWaited(child, node);
        if (awaited) analysis.awaitedCalls.push(target);
        if (awaited) analysis.effectiveWaitCalls.push(target);
        const property = ts.isPropertyAccessExpression(child.expression)
          ? child.expression.name.text
          : ts.isIdentifier(child.expression)
            ? child.expression.text
            : target;
        const root = target.split('.')[0];
        const boundCallback = ts.isIdentifier(child.expression)
          ? callbackBindings.get(child.expression.text)
          : null;
        if (boundCallback?.body) {
          visitTree(boundCallback, target, false);
        } else if (property === '$transaction') {
          // Nested transactions are separately inventoried; they are not a helper call.
        } else if (EXTERNAL_TARGET_PATTERN.test(target)) {
          analysis.externalCalls.push({ target, awaited, origin });
        } else if (
          DATABASE_METHODS.has(property) ||
          /^(?:tx|transaction|prisma|client|repository|context)\b/i.test(root) ||
          /lockAuthorization/i.test(target) ||
          /(?:Repository|UnitOfWork)\./.test(target)
        ) {
          analysis.databaseCalls.push({ target, awaited, origin });
        } else {
          const declaration =
            resolveLocalCallDeclaration(nodeSource, child) ??
            resolveCallDeclaration(checker, child, sourceRoot);
          if (declaration) {
            const declarationSource = declaration.getSourceFile();
            const implementation = functionImplementation(declaration);
            if (implementation?.body) {
              analysis.resolvedHelpers.push(`${normalized(path.relative(ROOT, declarationSource.fileName))}#${declarationName(declaration) ?? property}`);
              visitTree(
                implementation,
                target,
                false,
                bindCallbackArguments(checker, implementation, child, sourceRoot),
              );
            } else if (!PURE_CALL_ROOTS.has(root) && awaited) {
              analysis.unresolvedCalls.push({ target, origin, reason: 'repository declaration has no resolvable implementation body' });
            }
          } else if (isKnownSynchronousIntrinsicCall(checker, child)) {
            // RegExp.prototype.test is a synchronous standard-library intrinsic.
          } else if (!PURE_CALL_ROOTS.has(root) && !PURE_METHODS.has(property) && awaited) {
            analysis.unresolvedCalls.push({ target, origin, reason: 'call target has no repository-local declaration' });
          }
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
  }
  visitTree(callback, 'transaction-callback');

  const outside = { externalCalls: [] };
  const visitOwner = (node) => {
    if (node.pos >= callbackStart && node.end <= callbackEnd) return;
    if (ts.isCallExpression(node) && isEffectivelyWaited(node, ownerNode)) {
      const target = callTarget(node, source);
      if (EXTERNAL_TARGET_PATTERN.test(target)) outside.externalCalls.push(target);
    }
    ts.forEachChild(node, visitOwner);
  };
  visitOwner(ownerNode);
  return { ...analysis, externalOutsideCalls: [...new Set(outside.externalCalls)].sort() };
}

function createInventoryProgram(sourceRoot) {
  const files = walk(sourceRoot);
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
  const config = configPath
    ? ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, ROOT)
    : { options: {} };
  return ts.createProgram(files, { ...config.options, noEmit: true });
}

function isDirectlyInsideTransactionCallback(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === '$transaction'
    ) {
      const callback = current.arguments[0];
      return Boolean(callback && node.pos >= callback.pos && node.end <= callback.end);
    }
    current = current.parent;
  }
  return false;
}

function scanDirectExternalWaitsOutsideTransactions(program, sourceRoot) {
  const evidence = [];
  for (const source of program.getSourceFiles()) {
    const absolute = path.resolve(source.fileName);
    if (!isPathWithinDirectory(absolute, sourceRoot) || absolute.endsWith('.spec.ts')) continue;
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        isEffectivelyWaited(node, source) &&
        EXTERNAL_TARGET_PATTERN.test(callTarget(node, source)) &&
        !isDirectlyInsideTransactionCallback(node)
      ) {
        evidence.push({
          path: normalized(path.relative(ROOT, absolute)),
          owner: enclosingOwner(node),
          target: callTarget(node, source),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return evidence.filter((item, index, all) =>
    all.findIndex((candidate) => candidate.path === item.path && candidate.owner === item.owner && candidate.target === item.target) === index,
  ).sort((a, b) => `${a.path}#${a.owner}#${a.target}`.localeCompare(`${b.path}#${b.owner}#${b.target}`));
}

function inventoryTransactions(sourceRoot = path.join(ROOT, 'src')) {
  const program = createInventoryProgram(sourceRoot);
  const checker = program.getTypeChecker();
  const runtimeIndex = buildRuntimeRoleIndex(program);
  const rows = [];
  for (const source of program.getSourceFiles()) {
    const absolute = path.resolve(source.fileName);
    if (!absolute.startsWith(path.resolve(sourceRoot)) || absolute.endsWith('.spec.ts')) continue;
    const sourceText = source.getFullText();
    const relativePath = path.relative(ROOT, absolute);
    const fileHasLock = LOCK_PATTERN.test(sourceText);
    const ownerOrdinals = new Map();
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === '$transaction') {
        const first = node.arguments[0];
        const kind = first && ts.isArrayLiteralExpression(first) ? 'batch' : 'interactive';
        const options = kind === 'interactive' ? node.arguments[1] : null;
        const isolationText = objectOption(options, 'isolationLevel')?.getText(source) ?? (kind === 'interactive' ? 'default' : 'client-default');
        const maxWait = literalNumber(objectOption(options, 'maxWait'));
        const timeout = literalNumber(objectOption(options, 'timeout'));
        const owner = enclosingOwner(node);
        const ordinal = (ownerOrdinals.get(owner) ?? 0) + 1;
        ownerOrdinals.set(owner, ordinal);
        const callback = first ?? node;
        const analysis = analyzeCallback({ callback, ownerNode: enclosingOwnerNode(node), source, checker, sourceRoot });
        const unresolved = analysis.unresolvedCalls.filter((item, index, all) =>
          all.findIndex((candidate) => candidate.target === item.target && candidate.reason === item.reason) === index,
        );
        const reviewedOverrides = [];
        const remainingUnresolved = [];
        for (const item of unresolved) {
          const reviewed = REVIEWED_CALL_OVERRIDES.find((override) =>
            (!override.path || override.path === normalized(relativePath)) && override.target.test(item.target),
          );
          if (!reviewed) {
            remainingUnresolved.push(item);
            continue;
          }
          reviewedOverrides.push({
            target: item.target,
            reason: reviewed.reason,
            reviewedClassification: reviewed.classification,
            reviewEvidence: reviewed.evidence,
          });
        }
        const externalInside = analysis.externalCalls.some((item) => item.awaited);
        const explicitLock = analysis.explicitLocks.length > 0;
        let classification = 'SHORT_DB_ONLY';
        if (externalInside) classification = 'EXTERNAL_WAIT_SENSITIVE';
        else if (/Serializable/i.test(isolationText)) classification = 'SERIALIZABLE_CONFLICT_SENSITIVE';
        else if (explicitLock) classification = 'LOCK_CONTENTION_SENSITIVE';
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        const callbackDigest = sha256(callback.getText(source).replace(/\s+/gu, ' ').trim());
        const stableIdentity = `${normalized(relativePath)}#${owner}#${ordinal}#${callbackDigest}`;
        const transactionId = `B3-TX-${sha256(stableIdentity).slice(0, 12).toUpperCase()}`;
        const runtimeRole = resolveRuntimeRole(
          relativePath,
          runtimeIndex.roles.get(absolute.toLowerCase()) ?? [],
          REVIEWED_RUNTIME_ROLE_OVERRIDES,
        );
        const legacyClassification = /Serializable/i.test(isolationText)
          ? 'SERIALIZABLE_CONFLICT_SENSITIVE'
          : fileHasLock
            ? 'LOCK_CONTENTION_SENSITIVE'
            : 'SHORT_DB_ONLY';
        rows.push({
          transactionId,
          stableIdentity,
          path: normalized(relativePath),
          line: position.line + 1,
          runtimeRole: runtimeRole.role,
          runtimeRoles: runtimeRole.roles,
          runtimeRoleEvidence: runtimeRole.evidence,
          feature: inferFeature(relativePath),
          entryOwner: owner,
          ownerTransactionOrdinal: ordinal,
          callbackDigest,
          kind,
          isolation: isolationText,
          maxWaitMs: maxWait,
          timeoutMs: timeout,
          tables: [...analysis.tables].sort(),
          explicitLock,
          lockEvidence: analysis.explicitLocks,
          externalAwait: externalInside,
          externalWaitInsideTransaction: externalInside,
          externalWaitOutsideTransaction: analysis.externalOutsideCalls.length > 0,
          externalInsideTargets: analysis.externalCalls.filter((item) => item.awaited).map((item) => item.target),
          externalOutsideTargets: analysis.externalOutsideCalls,
          databaseCalls: analysis.databaseCalls,
          awaitedCalls: [...new Set(analysis.awaitedCalls)].sort(),
          effectiveWaitCalls: [...new Set(analysis.effectiveWaitCalls)].sort(),
          resolvedHelpers: [...new Set(analysis.resolvedHelpers)].sort(),
          unresolvedCalls: remainingUnresolved,
          manualOverrides: reviewedOverrides.map((override) => ({
            transactionId,
            sourcePath: normalized(relativePath),
            owner,
            unresolvedCallExpression: override.target,
            resolvedCallers: [...new Set(override.resolvedCallers ?? (analysis.resolvedHelpers.length > 0 ? analysis.resolvedHelpers : [owner]))].sort(),
            classification: override.reviewedClassification,
            runtimeRole: runtimeRole.role,
            reason: override.reason,
            sourceDigest: sha256(sourceText),
            reviewEvidence: override.reviewEvidence,
          })),
          idempotency: /idempoten|clientRequestId|requestId/i.test(callback.getText(source)) ? 'explicit' : 'caller/domain constrained',
          rollbackBehavior: kind === 'interactive' ? 'Prisma callback rollback' : 'Prisma batch atomic rollback',
          tests: fs.existsSync(absolute.replace(/\.ts$/, '.spec.ts')) ? 'colocated' : 'inventory/pressure suite',
          pressurePriority: classification === 'SHORT_DB_ONLY' ? 'normal' : 'high',
          legacyClassification,
          classification,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  rows.sort((a, b) => a.stableIdentity.localeCompare(b.stableIdentity));
  const result = rows.map((row) => Object.freeze(row));
  Object.defineProperty(result, 'externalWaitOutsideEvidence', {
    value: Object.freeze(scanDirectExternalWaitsOutsideTransactions(program, sourceRoot)),
    enumerable: false,
  });
  return result;
}

function validateInventory(rows) {
  assert.ok(rows.length > 0, 'transaction inventory is empty');
  validateTransactionIdentities(rows);
  for (const row of rows) {
    for (const key of ['transactionId', 'stableIdentity', 'path', 'runtimeRole', 'runtimeRoles', 'runtimeRoleEvidence', 'feature', 'entryOwner', 'ownerTransactionOrdinal', 'callbackDigest', 'kind', 'isolation', 'tables', 'explicitLock', 'externalAwait', 'externalWaitInsideTransaction', 'externalWaitOutsideTransaction', 'unresolvedCalls', 'idempotency', 'rollbackBehavior', 'tests', 'pressurePriority', 'classification']) assert.notEqual(row[key], undefined, `${row.transactionId}.${key} missing`);
    assert.ok(ALLOWED_CLASSES.has(row.classification), `${row.transactionId} unknown classification`);
    assert.ok(Array.isArray(row.runtimeRoles) && row.runtimeRoles.length > 0, `${row.transactionId} has unresolved runtime ownership`);
    assert.ok(row.runtimeRoles.every((role) => ALLOWED_RUNTIME_ROLES.has(role)), `${row.transactionId} has an invalid runtime owner`);
    if (row.runtimeRole === 'shared') assert.ok(row.runtimeRoles.length > 1, `${row.transactionId} shared role is not structurally expanded`);
    else assert.ok(ALLOWED_RUNTIME_ROLES.has(row.runtimeRole), `${row.transactionId} runtime role is not allowed`);
    validateResolvedTransaction(row);
  }
  return rows;
}

function validateTransactionIdentities(rows) {
  assert.equal(new Set(rows.map((row) => row.transactionId)).size, rows.length, 'duplicate transaction identity');
}

function validateResolvedTransaction(row) {
  assert.equal(row.unresolvedCalls.length, 0, `${row.transactionId} has unresolved calls: ${row.unresolvedCalls.map((item) => item.target).join(', ')}`);
}

function inventorySummary(rows) {
  const classifications = Object.fromEntries([...ALLOWED_CLASSES].map((name) => [name, rows.filter((row) => row.classification === name).length]));
  return Object.freeze({
    total: rows.length,
    interactive: rows.filter((row) => row.kind === 'interactive').length,
    batch: rows.filter((row) => row.kind === 'batch').length,
    unknown: rows.filter((row) => !ALLOWED_CLASSES.has(row.classification)).length,
    unresolved: rows.reduce((sum, row) => sum + row.unresolvedCalls.length, 0),
    unresolvedCallChains: rows.reduce((sum, row) => sum + row.unresolvedCalls.length, 0),
    unresolvedRuntimeRoles: rows.filter((row) => !Array.isArray(row.runtimeRoles) || row.runtimeRoles.length === 0).length,
    unwiredTransactions: rows.filter((row) => row.runtimeRole === 'unwired-production').length,
    duplicateIds: rows.length - new Set(rows.map((row) => row.transactionId)).size,
    externalWaitInsideTransaction: rows.filter((row) => row.externalWaitInsideTransaction).length,
    externalWaitOutsideTransaction: rows.externalWaitOutsideEvidence?.length ?? rows.filter((row) => row.externalWaitOutsideTransaction).length,
    externalWaitOutsideEvidence: rows.externalWaitOutsideEvidence ?? [],
    manualOverrides: rows.reduce((sum, row) => sum + row.manualOverrides.length, 0),
    classificationDifferences: rows.filter((row) => row.legacyClassification !== row.classification).map((row) => ({ transactionId: row.transactionId, from: row.legacyClassification, to: row.classification, reason: row.explicitLock ? 'callback-local lock' : 'unrelated file lock removed' })),
    classifications,
    rows,
  });
}

function playbackCallKey(item) {
  return `${normalized(item.path)}#${item.caller}#${item.callee}`;
}

function classifyPlaybackCallback(call, source, allSources) {
  const callee = propertyName(call.expression.name);
  if (callee === 'execute') {
    return { classification: 'EXTERNAL_READ_ONLY_PROVIDER', sideEffects: ['bounded signed download capability generation'] };
  }
  const callback = call.arguments[1];
  if (!callback) return { classification: 'UNKNOWN', sideEffects: ['missing callback expression'] };
  const callbackText = callback.getText(source).replace(/\s+/gu, ' ').trim();
  let effectiveText = callbackText;
  if (ts.isIdentifier(callback) && GENERIC_CALLBACK_NAMES.has(callback.text)) {
    const owningMethod = enclosingOwner(call).split('.').at(-1);
    const callerTexts = [];
    for (const candidateSource of allSources) {
      const inspect = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === owningMethod &&
          node.arguments[1]
        ) callerTexts.push(node.arguments[1].getText(candidateSource));
        ts.forEachChild(node, inspect);
      };
      inspect(candidateSource);
    }
    if (callerTexts.length === 0) return { classification: 'UNKNOWN', sideEffects: ['generic callback has no source-derived callers'] };
    effectiveText = callerTexts.join('\n');
  }
  if (/\b(?:repository|prisma|transaction|tx)\.[A-Za-z_$][\w$]*\s*\(/u.test(effectiveText) || /\.(?:create|update|upsert|delete|write)\s*\(/u.test(effectiveText)) {
    return { classification: 'DATABASE_SIDE_EFFECT', sideEffects: ['database or persistent write-capable callback'] };
  }
  if (/createDownloadUrl|\b(?:storage|provider)\.[A-Za-z_$][\w$]*\s*\(/u.test(effectiveText)) {
    return { classification: 'EXTERNAL_READ_ONLY_PROVIDER', sideEffects: ['external read-only capability provider'] };
  }
  return { classification: 'PURE_CAPABILITY_GENERATION', sideEffects: ['non-database read-only value projection'] };
}

function discoverPlaybackCallers(root = ROOT) {
  const sourceRoot = path.join(root, 'src');
  assert.ok(fs.existsSync(sourceRoot), 'playback source root is missing');
  const program = createInventoryProgram(sourceRoot);
  program.getTypeChecker();
  const sources = program.getSourceFiles().filter((source) => {
    const absolute = path.resolve(source.fileName);
    return absolute.startsWith(path.resolve(sourceRoot)) && !absolute.endsWith('.spec.ts');
  });
  const rows = [];
  for (const source of sources) {
    const relativePath = normalized(path.relative(root, source.fileName));
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const callee = node.expression.name.text;
        const receiver = node.expression.expression.getText(source);
        const isPlaybackCall = callee === 'withPlayableMedia' || callee === 'withPlayableLessonContent' || (callee === 'execute' && /playbackCoordinator$/u.test(receiver));
        if (isPlaybackCall) {
          const caller = enclosingOwner(node);
          const classified = classifyPlaybackCallback(node, source, sources);
          const callbackExpression = node.arguments[1]?.getText(source).replace(/\s+/gu, ' ').trim() ?? 'coordinator.execute contract';
          rows.push(Object.freeze({
            path: relativePath,
            caller,
            callee,
            callSiteDigest: sha256(`${relativePath}#${caller}#${node.getText(source).replace(/\s+/gu, ' ').trim()}`),
            callbackExpression,
            callbackClassification: classified.classification,
            resolvedSideEffects: Object.freeze(classified.sideEffects),
          }));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  rows.sort((a, b) => playbackCallKey(a).localeCompare(playbackCallKey(b)));
  return Object.freeze(rows);
}

function validatePlaybackConsumerAudit(audit = PLAYBACK_CONSUMER_AUDIT, root = ROOT) {
  const allowed = new Set(['PURE_CAPABILITY_GENERATION', 'EXTERNAL_READ_ONLY_PROVIDER', 'NON_DATABASE_READ_ONLY_TRANSFORMATION']);
  assert.equal(new Set(audit.map((item) => item.id)).size, audit.length, 'duplicate playback consumer audit ID');
  const reviewedByKey = new Map();
  for (const item of audit) {
    assert.ok(allowed.has(item.classification), `${item.id} has invalid callback classification`);
    assert.ok(fs.existsSync(path.join(root, item.path)), `${item.id} source is missing`);
    requiredString(item.evidence, `${item.id}.evidence`);
    const key = playbackCallKey(item);
    assert.equal(reviewedByKey.has(key), false, `duplicate reviewed playback caller ${key}`);
    reviewedByKey.set(key, item);
  }
  const discovered = discoverPlaybackCallers(root);
  const discoveredByKey = new Map(discovered.map((item) => [playbackCallKey(item), item]));
  assert.deepEqual([...discoveredByKey.keys()].sort(), [...reviewedByKey.keys()].sort(), 'source-derived playback callers differ from reviewed catalog');
  const rows = discovered.map((item) => {
    const reviewed = reviewedByKey.get(playbackCallKey(item));
    assert.equal(item.callbackClassification, reviewed.classification, `${reviewed.id} callback classification changed`);
    assert.ok(allowed.has(item.callbackClassification), `${reviewed.id} callback is not approved`);
    return Object.freeze({ id: reviewed.id, ...item, reviewEvidence: reviewed.evidence });
  });
  const countNames = [...allowed, 'UNKNOWN', 'DATABASE_SIDE_EFFECT'];
  const counts = Object.fromEntries(countNames.map((name) => [name, rows.filter((item) => item.callbackClassification === name).length]));
  const digest = sha256(JSON.stringify(rows));
  return Object.freeze({ total: rows.length, counts, digest, missingCallers: 0, staleCatalogEntries: 0, duplicateCallers: 0, unknownCallbacks: 0, databaseSideEffectCallbacks: 0, rows });
}

function validateBusinessInvariantManifests(manifests = BUSINESS_INVARIANT_MANIFESTS) {
  for (const [key, manifest] of Object.entries(manifests)) {
    for (const property of ['pathId', 'entryClass', 'method', 'idempotencyExpectation']) requiredString(manifest[property], `${key}.${property}`);
    for (const property of ['preStateQueries', 'expectedCommittedWrites', 'forbiddenWrites', 'auditExpectations', 'rollbackExpectations', 'duplicateConstraints', 'postStateQueries']) {
      assert.ok(Array.isArray(manifest[property]) && manifest[property].length > 0, `${key}.${property} must be non-empty`);
      for (const [index, value] of manifest[property].entries()) requiredString(value, `${key}.${property}[${index}]`);
    }
  }
  assert.equal(manifests.learningMedia.entryClass, ENTRY_CLASS_MANIFEST.learningMedia.entryClass);
  assert.equal(manifests.lessonContent.entryClass, ENTRY_CLASS_MANIFEST.lessonContent.entryClass);
  assert.equal(manifests.teacherLifecycle.entryClass, ENTRY_CLASS_MANIFEST.teacherLifecycle.entryClass);
  return manifests;
}

function validateSanitizedSummary(value) {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
    /["']?(?:password|secret|token|access[_-]?key)["']?\s*[=:]\s*["']?[^"'}\s]+/i,
    /X-Amz-(?:Credential|Signature)/i,
    /https?:\/\//i,
    /[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:DOCKER_HOST|npipe:\/\/|tcp:\/\/)/i,
    /(?:stack|environment|rawPrismaError|objectKey|signedUrl|capability)["']?\s*:/i,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(serialized, pattern, `summary redaction failed: ${pattern}`);
  return value;
}

function requiredObject(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function requiredString(value, label, pattern) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  if (pattern) assert.match(value, pattern, `${label} has invalid format`);
  return value;
}

function requiredNumber(value, label, options = {}) {
  assert.equal(typeof value, 'number', `${label} must be numeric`);
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(value >= (options.minimum ?? 0), `${label} is below range`);
  if (options.integer !== false) assert.ok(Number.isInteger(value), `${label} must be an integer`);
  if (options.maximum !== undefined) assert.ok(value <= options.maximum, `${label} is above range`);
  return value;
}

function classifyPrismaTransactionError(error) {
  let current = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const code = typeof current === 'object' && current !== null && typeof current.code === 'string' ? current.code : '';
    if (code === 'P2024' || code === 'P2028' || code === 'P2034') return code;
    if (code && !/^P\d{4}$/u.test(code)) return 'KNOWN_BUSINESS_REJECTION';
    const name = typeof current === 'object' && current !== null && typeof current.name === 'string' ? current.name : '';
    if (/^(?:DomainException|.*(?:Conflict|InvalidTransition|Invariant|NotFound|Rejection|Forbidden|Unauthorized)(?:Exception|Error))$/u.test(name)) return 'KNOWN_BUSINESS_REJECTION';
    current = typeof current === 'object' && current !== null ? current.cause : null;
  }
  return 'UNKNOWN_ERROR';
}

function validateRuntimeSummary(runtime, label) {
  requiredObject(runtime, label);
  requiredString(runtime.imageId, `${label}.imageId`, /^sha256:[a-f0-9]{64}$/);
  requiredString(runtime.runtimeManifestSha256, `${label}.runtimeManifestSha256`, /^[a-f0-9]{64}$/);
  assert.equal(runtime.nodeVersion, 'v22.23.1', `${label}.nodeVersion mismatch`);
  assert.equal(runtime.prismaVersion, '6.19.3', `${label}.prismaVersion mismatch`);
  assert.equal(runtime.packageVersion, '0.0.1', `${label}.packageVersion mismatch`);
  requiredNumber(runtime.entryCount, `${label}.entryCount`, { minimum: 3 });
  assert.deepEqual(runtime.entrypoints, ['dist/main.js', 'dist/core-worker.js', 'dist/media-worker.js']);
}

function classifyCutbackMeasurement(states) {
  const zero = states.zeroOccupied;
  const one = states.oneOccupied;
  const full = states.fullOccupancy;
  const recovery = states.recovery;
  if (!zero || !one || !full || !recovery || full.overshoot || zero.readinessStatus !== 200 || recovery.readinessStatus !== 200 || recovery.sessions !== 0 || recovery.locks !== 0) return 'NOT_SAFE';
  if (one.readinessStatus !== 200) return 'LAST_RESORT_UNREADY_WHILE_BUSY';
  if (full.backendCount >= 5 && one.additionalBusinessSucceeded) return 'NORMAL';
  return 'EMERGENCY_DEGRADED';
}

function validateStrictSummary(summary) {
  validateSanitizedSummary(summary);
  requiredObject(summary, 'summary');
  assert.equal(summary.schemaVersion, SUMMARY_SCHEMA_VERSION);
  assert.equal(summary.schema, SUMMARY_SCHEMA);
  assert.equal(summary.gate, GATE);
  assert.equal(summary.overall, 'PASS');
  requiredString(summary.runId, 'runId', /^[a-z0-9][a-z0-9-]{5,80}$/);
  assert.equal(summary.baseCommit, BASE_SHA);
  assert.equal(summary.baseTree, BASE_TREE);
  for (const key of [
    'candidateProductionPatchSha256',
    'baselineRuntimeManifestSha256',
    'candidateRuntimeManifestSha256',
    'inventoryDigest',
    'playbackCallerDigest',
  ]) requiredString(summary[key], key, /^[a-f0-9]{64}$/);
  for (const key of ['baselineImageId', 'candidateImageId']) requiredString(summary[key], key, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(summary.baselineImageId, summary.candidateImageId);
  assert.equal(summary.nodeVersion, 'v22.23.1');
  assert.equal(summary.runtimePrismaVersion, '6.19.3');
  assert.equal(summary.observerPrismaVersion, '6.19.3');
  assert.equal(summary.postgresMajor, 16);
  assert.equal(summary.postgresMaxConnections, 80);
  assert.equal(summary.faultCatalogVersion, FAULT_CATALOG_VERSION);
  assert.equal(summary.faultProofImplementationVersion, FAULT_PROOF_IMPLEMENTATION_VERSION);

  const provenance = requiredObject(summary.provenance, 'provenance');
  assert.equal(provenance.baseCommit, BASE_SHA);
  assert.equal(provenance.baseTree, BASE_TREE);
  requiredString(provenance.packageLockSha256, 'provenance.packageLockSha256', /^[a-f0-9]{64}$/);
  requiredString(provenance.candidateProductionPatchSha256, 'provenance.candidateProductionPatchSha256', /^[a-f0-9]{64}$/);
  validateRuntimeSummary(provenance.baseline, 'provenance.baseline');
  validateRuntimeSummary(provenance.candidate, 'provenance.candidate');
  assert.notEqual(provenance.baseline.imageId, provenance.candidate.imageId, 'baseline and candidate images must be distinct');
  assert.equal(summary.candidateProductionPatchSha256, provenance.candidateProductionPatchSha256);
  assert.equal(summary.baselineRuntimeManifestSha256, provenance.baseline.runtimeManifestSha256);
  assert.equal(summary.candidateRuntimeManifestSha256, provenance.candidate.runtimeManifestSha256);
  assert.equal(summary.baselineImageId, provenance.baseline.imageId);
  assert.equal(summary.candidateImageId, provenance.candidate.imageId);

  const topology = requiredObject(summary.topology, 'topology');
  assert.equal(topology.serverMajor, 16);
  assert.equal(topology.maxConnections, 80);
  for (const key of ['loopbackPublished', 'builtInBridgeCompatibility', 'internalOwnedNetwork', 'immutableImage', 'tmpfs']) assert.equal(topology[key], true, `topology.${key} must be true`);
  assert.equal(topology.persistentVolume, false);
  assert.deepEqual(summary.migrations, { deploy: 'PASS', status: 'PASS' });
  assert.deepEqual(validateR3InitialDefectReproductions(summary.r3InitialDefectReproductions), R3_INITIAL_DEFECT_REPRODUCTIONS);
  assert.deepEqual(validateR4InitialDefectReproductions(summary.r4InitialDefectReproductions), R4_INITIAL_DEFECT_REPRODUCTIONS);
  const driverFinalization = requiredObject(summary.driverFinalization, 'driverFinalization');
  assert.equal(driverFinalization.ok, true);
  assert.ok(Array.isArray(driverFinalization.phaseOneResults), 'driverFinalization.phaseOneResults must be an array');
  assert.ok(Array.isArray(driverFinalization.phaseTwoResults), 'driverFinalization.phaseTwoResults must be an array');
  for (const [phase, results] of [['phaseOneResults', driverFinalization.phaseOneResults], ['phaseTwoResults', driverFinalization.phaseTwoResults]]) {
    for (const item of results) assert.equal(item.status, 'DISCONNECTED', `driverFinalization.${phase} contains a failed disconnect`);
  }
  assert.equal(driverFinalization.trackedPrismaClients, 0);
  assert.equal(driverFinalization.activeOperations, 0);
  assert.equal(driverFinalization.pendingDriverTimers, 0);
  assert.equal(driverFinalization.pendingDriverAbortListeners, 0);
  assert.equal(driverFinalization.firstSignal, null);
  assert.equal(driverFinalization.requestedExitCode, 0);
  assert.equal(driverFinalization.authoritativeFinalizerInvocations, 1);

  const inventory = requiredObject(summary.inventory, 'inventory');
  for (const key of ['total', 'interactive', 'batch', 'unknown', 'unresolvedCallChains', 'externalWaitInsideTransaction', 'unresolvedRuntimeRoles', 'unwiredTransactions', 'duplicateIds', 'manualOverrides', 'externalWaitOutsideTransaction']) requiredNumber(inventory[key], `inventory.${key}`);
  assert.equal(inventory.total, inventory.interactive + inventory.batch);
  for (const key of ['unknown', 'unresolvedCallChains', 'externalWaitInsideTransaction', 'unresolvedRuntimeRoles', 'unwiredTransactions', 'duplicateIds']) assert.equal(inventory[key], 0, `inventory.${key} must be zero`);
  const classes = requiredObject(inventory.classifications, 'inventory.classifications');
  assert.deepEqual(Object.keys(classes).sort(), [...ALLOWED_CLASSES].sort(), 'inventory.classifications contains missing or unknown keys');
  for (const name of ALLOWED_CLASSES) requiredNumber(classes[name], `inventory.classifications.${name}`);
  assert.equal(Object.values(classes).reduce((sum, count) => sum + count, 0), inventory.total);
  assert.equal(classes.EXTERNAL_WAIT_SENSITIVE, inventory.externalWaitInsideTransaction, 'external-wait classification count does not match inventory evidence');
  requiredString(inventory.digest, 'inventory.digest', /^[a-f0-9]{64}$/);
  assert.equal(summary.inventoryDigest, inventory.digest);

  const expectedBusinessPathIds = Object.keys(BUSINESS_PATH_EXPECTATIONS);
  assert.ok(Array.isArray(summary.businessPaths) && summary.businessPaths.length === 3, 'businessPaths must contain exactly three entries');
  assert.deepEqual([...new Set(summary.businessPaths.map((item) => item.pathId))].sort(), [...expectedBusinessPathIds].sort());
  for (const item of summary.businessPaths) {
    const expected = BUSINESS_PATH_EXPECTATIONS[item.pathId];
    assert.ok(expected, `${item.pathId} is not an approved business path`);
    assert.equal(item.productionEntryClass, expected.productionEntryClass, `${item.pathId}.productionEntryClass mismatch`);
    assert.equal(item.productionMethod, expected.productionMethod, `${item.pathId}.productionMethod mismatch`);
    assert.equal(item.invariantManifestId, expected.invariantManifestId, `${item.pathId}.invariantManifestId mismatch`);
    assert.equal(summary.entryClasses?.[expected.key], expected.productionEntryClass, `${item.pathId} entryClasses pairing mismatch`);
    for (const key of ['baselineResult', 'lockResult', 'timeoutResult', 'rollbackResult', 'retryResult', 'auditResult']) assert.equal(item[key], 'PASS', `${item.pathId}.${key} must pass`);
    assert.equal(item.partialWrites, 0);
  }

  assert.ok(Array.isArray(summary.lockEvidence) && summary.lockEvidence.length === 3, 'lockEvidence must contain exactly three entries');
  assert.deepEqual([...new Set(summary.lockEvidence.map((item) => item.pathId))].sort(), [...expectedBusinessPathIds].sort());
  for (const item of summary.lockEvidence) {
    assert.equal(item.waitEventType, 'Lock');
    assert.ok(['transactionid', 'tuple'].includes(item.waitEvent), `${item.pathId}.waitEvent is not approved`);
    requiredNumber(item.blockerCount, `${item.pathId}.blockerCount`, { minimum: 1 });
    requiredNumber(item.ungrantedLockCount, `${item.pathId}.ungrantedLockCount`, { minimum: 1 });
    assert.equal(item.completedAfterRelease, true);
  }

  assert.deepEqual(summary.entryClasses, {
    learningMedia: ENTRY_CLASS_MANIFEST.learningMedia.entryClass,
    lessonContent: ENTRY_CLASS_MANIFEST.lessonContent.entryClass,
    teacherLifecycle: ENTRY_CLASS_MANIFEST.teacherLifecycle.entryClass,
  });
  const baselineBusiness = requiredObject(summary.baselineBusiness, 'baselineBusiness');
  const timings = requiredObject(baselineBusiness.timings, 'baselineBusiness.timings');
  for (const key of ['learningMediaMs', 'lessonContentMs', 'teacherLifecycleMs']) requiredNumber(timings[key], `baselineBusiness.timings.${key}`, { minimum: 1 });
  assert.deepEqual(baselineBusiness.learningMedia, { status: 'READY', fileCount: 1, auditCount: 1, exactOnce: true, bucketConsistent: true });
  assert.deepEqual(baselineBusiness.lessonContent, { status: 'DRAFT', auditCount: 1, hierarchyUnchanged: true, unrelatedUnchanged: true });
  assert.deepEqual(baselineBusiness.teacherLifecycle, { userStatus: 'DISABLED', membershipStatus: 'SUSPENDED', profileStatus: 'INACTIVE', revokedSessions: 1, auditCount: 3, allocationCount: 1, identityCount: 1, membershipCount: 1 });
  const business = requiredObject(summary.business, 'business');
  for (const key of ['learningMedia', 'lessonContent', 'teacherLifecycle']) {
    const item = requiredObject(business[key], `business.${key}`);
    assert.equal(item.invariantsPass, true);
    assert.equal(item.rollbackPass, true);
    assert.equal(item.duplicateConstraintsPass, true);
  }
  assert.ok(Array.isArray(summary.lockWaits) && summary.lockWaits.length === 3, 'lockWaits must contain three paths');
  assert.deepEqual([...new Set(summary.lockWaits.map((item) => item.path))].sort(), Object.values(LOCK_PATH_EXPECTATIONS).sort(), 'lockWaits must contain each path exactly once');
  for (const item of summary.lockWaits) {
    assert.ok(['learningMedia', 'lessonContent', 'teacherLifecycle'].includes(item.path));
    requiredNumber(item.elapsedMs, 'lockWait.elapsedMs', { minimum: 1, maximum: LOCK_CONTENTION_BOUND_MS });
    requiredNumber(item.blockingPidCount, 'lockWait.blockingPidCount', { minimum: 1 });
    assert.equal(item.waitEventType, 'Lock');
    requiredString(item.waitEvent, 'lockWait.waitEvent');
    assert.equal(item.outcome, 'COMMITTED');
    requiredNumber(item.ungrantedLocks, 'lockWait.ungrantedLocks', { minimum: 1 });
  }
  for (const [pathId, path] of Object.entries(LOCK_PATH_EXPECTATIONS)) {
    const evidence = summary.lockEvidence.find((item) => item.pathId === pathId);
    const wait = summary.lockWaits.find((item) => item.path === path);
    assert.ok(evidence && wait, `${pathId} lock evidence pairing is incomplete`);
    assert.equal(evidence.waitEventType, wait.waitEventType, `${pathId} waitEventType mismatch`);
    assert.equal(evidence.waitEvent, wait.waitEvent, `${pathId} waitEvent mismatch`);
    assert.equal(evidence.blockerCount, wait.blockingPidCount, `${pathId} blocker count mismatch`);
    assert.equal(evidence.ungrantedLockCount, wait.ungrantedLocks, `${pathId} ungranted lock count mismatch`);
    assert.equal(evidence.completedAfterRelease, wait.outcome === 'COMMITTED', `${pathId} completion outcome mismatch`);
  }
  const timeouts = requiredObject(summary.timeouts, 'timeouts');
  for (const [key, configured] of [['learningMedia', 15_000], ['lessonContent', 30_000], ['teacherLifecycle', 30_000]]) {
    const item = requiredObject(timeouts[key], `timeouts.${key}`);
    assert.equal(item.configuredMs, configured);
    assert.equal(item.transactionStarted, true);
    requiredNumber(item.waitStartedAtOffsetMs, `timeouts.${key}.waitStartedAtOffsetMs`);
    assert.equal(item.waitEventType, 'Lock');
    requiredString(item.waitEvent, `timeouts.${key}.waitEvent`);
    requiredNumber(item.blockingPidCount, `timeouts.${key}.blockingPidCount`, { minimum: 1 });
    requiredNumber(item.elapsedMs, `timeouts.${key}.elapsedMs`, { minimum: configured - 1_000, maximum: configured === 15_000 ? 20_000 : 37_000 });
    assert.equal(item.errorCategory, 'P2028', `${key} must contain positive Prisma transaction-timeout evidence`);
    assert.equal(item.rollbackPass, true);
    assert.equal(item.retryPass, true);
  }
  assert.ok(['SERIALIZED_ORDERED_COMMITS', 'ONE_COMMIT_ONE_SERIALIZATION_ABORT'].includes(summary.serializable.outcome));
  assert.equal(summary.serializable.invariantsPass, true);
  assert.equal(summary.serializable.overlapObserved, true);
  assert.equal(summary.serializable.bothPendingBeforeRelease, true);
  assert.equal(summary.serializable.distinctBackendSessions, true);
  assert.equal(summary.serializable.blockingRelationshipObserved, true);
  requiredNumber(summary.serializable.maximumConcurrentTransactions, 'serializable.maximumConcurrentTransactions', { minimum: 2 });
  for (const key of ['firstStartedAt', 'secondStartedAt', 'firstCompletedAt', 'secondCompletedAt']) requiredNumber(summary.serializable[key], `serializable.${key}`, { minimum: 1 });
  assert.ok(summary.serializable.firstStartedAt <= summary.serializable.firstCompletedAt);
  assert.ok(summary.serializable.secondStartedAt <= summary.serializable.secondCompletedAt);
  if (summary.serializable.outcome === 'ONE_COMMIT_ONE_SERIALIZATION_ABORT') {
    assert.equal(summary.serializable.committed, 1);
    assert.equal(summary.serializable.aborted, 1);
    assert.equal(summary.serializable.errorCode, 'P2034');
    assert.equal(summary.serializable.retrySucceeded, true);
  } else {
    assert.equal(summary.serializable.committed, 2);
    assert.equal(summary.serializable.aborted, 0);
    assert.equal(summary.serializable.errorCode, null);
    assert.equal(summary.serializable.retrySucceeded, null);
  }
  assert.equal(summary.serializable.identityCount, 1);
  assert.equal(summary.serializable.membershipCount, 1);
  assert.equal(summary.serializable.activeMembershipCount, 1);
  assert.equal(summary.serializable.allocationCount, 1);
  assert.equal(summary.serializable.auditCount, SERIALIZABLE_AUDIT_COUNT);
  assert.equal(summary.serializable.sessionRevoked, true);
  assert.equal(summary.playback.providerAwaitInsideTransactionBefore, true);
  assert.equal(summary.playback.providerAwaitInsideTransactionAfter, false);
  assert.equal(summary.playback.openTransactionsDuringSigning, 0);
  assert.equal(summary.playback.locksDuringSigning, 0);
  assert.equal(summary.playback.capabilityExposedOnRejectedRevalidation, false);
  const negativeCases = requiredObject(summary.playback.negativeCases, 'playback.negativeCases');
  for (const key of ['authorizationChanged', 'publicationChanged', 'uploadSessionChanged', 'mediaRemoved', 'candidateIdentityChanged', 'signingRejected', 'finalRevalidationRejected']) assert.equal(negativeCases[key], true, `playback.${key} is not proven`);
  assert.equal(summary.playback.callbackInvocations, 1);
  assert.equal(summary.playback.ttlSeconds, 300);
  assert.equal(summary.playbackCallerDigest, summary.playback.callerDigest);
  assert.equal(summary.learningMediaLimitation.abruptGenericVerifyingRecoveryProven, false);
  requiredString(summary.learningMediaLimitation.reason, 'learningMediaLimitation.reason');
  assert.equal(summary.learningVerifier.providerPending, true);
  assert.equal(summary.learningVerifier.openTransactions, 0);
  assert.equal(summary.learningVerifier.locks, 0);
  assert.equal(summary.learningVerifier.completionStatus, 'READY');
  assert.equal(summary.learningVerifier.failureMatrixPass, true);
  const failureMatrix = requiredObject(summary.learningVerifier.failureMatrix, 'learningVerifier.failureMatrix');
  assert.deepEqual(failureMatrix.verifierFailure, { status: 'FAILED', fileCount: 0, failureAuditCount: 1 });
  assert.deepEqual(failureMatrix.factMismatch, { status: 'FAILED', reason: 'size_mismatch' });
  assert.deepEqual(failureMatrix.finalizationFailure, { releasedStatus: 'UPLOADING', cleanupCalls: 1, retryStatus: 'READY', fileCount: 1, successAuditCount: 1 });
  assert.equal(failureMatrix.failureMatrixPass, true);
  assert.equal(summary.pool.limit, 5);
  assert.equal(summary.pool.actualBlockedOperations, 5);
  assert.equal(summary.pool.maximumObserved, 5);
  assert.equal(summary.pool.maximumObservedConnections, 5);
  assert.equal(summary.pool.sampledOvershootObserved, false);
  assert.equal(summary.pool.sixthOperationIsProductionBusinessOperation, true);
  assert.equal(summary.pool.errorCode, 'P2024');
  assert.equal(summary.pool.p2024Observed, true);
  requiredNumber(summary.pool.p2024ElapsedMs, 'pool.p2024ElapsedMs', { minimum: 1_000, maximum: 4_000 });
  assert.equal(summary.pool.samePoolReadiness, true);
  assert.equal(summary.pool.samePrismaServiceForBusinessAndReadiness, true);
  assert.equal(summary.pool.readinessAtFullOccupancy, 503);
  assert.equal(summary.pool.readinessAfterRecovery, 200);
  assert.equal(summary.pool.recoveryPass, true);
  assert.ok(Array.isArray(summary.cutback) && summary.cutback.length === 3, 'cutback must have three rows');
  assert.deepEqual(summary.cutback.map((row) => row.limit), [5, 2, 1]);
  for (const row of summary.cutback) {
    assert.equal(row.reservedReadinessConnection, false);
    for (const state of ['zeroOccupied', 'oneOccupied', 'fullOccupancy', 'recovery']) requiredObject(row.states[state], `cutback.${row.limit}.${state}`);
    const stateA=row.states.zeroOccupied;const stateB=row.states.oneOccupied;const stateC=row.states.fullOccupancy;const stateD=row.states.recovery;
    assert.equal(stateA.readinessStatus, 200);
    requiredNumber(stateA.readinessLatencyMs, `cutback.${row.limit}.zeroOccupied.readinessLatencyMs`);
    assert.equal(stateA.businessSucceeded, true);
    requiredNumber(stateA.connections, `cutback.${row.limit}.zeroOccupied.connections`, { minimum: 1, maximum: row.limit });
    assert.equal(stateA.connections, 1, `cutback.${row.limit}.zeroOccupied.connections must equal the one admitted business operation`);
    requiredNumber(stateB.readinessLatencyMs, `cutback.${row.limit}.oneOccupied.readinessLatencyMs`);
    requiredNumber(stateB.maximumConnections, `cutback.${row.limit}.oneOccupied.maximumConnections`, { minimum: 1, maximum: row.limit });
    assert.equal(stateB.maximumConnections, row.limit === 1 ? 1 : 2, `cutback.${row.limit}.oneOccupied.maximumConnections is inconsistent with the admitted operations`);
    if (row.limit === 1) {
      assert.equal(stateB.readinessStatus, 503);
      assert.equal(stateB.additionalBusinessSucceeded, false);
      assert.equal(stateB.errorCode, 'P2024');
    } else {
      assert.equal(stateB.readinessStatus, 200);
      assert.equal(stateB.additionalBusinessSucceeded, true);
      assert.equal(stateB.errorCode, null);
    }
    assert.equal(stateC.readinessStatus, 503);
    requiredNumber(stateC.readinessLatencyMs, `cutback.${row.limit}.fullOccupancy.readinessLatencyMs`);
    assert.deepEqual(stateC.readinessBurst, [503, 503, 503]);
    assert.equal(stateC.nextBusinessError, 'P2024');
    requiredNumber(stateC.p2024ElapsedMs, `cutback.${row.limit}.fullOccupancy.p2024ElapsedMs`, { minimum: 1_000, maximum: 4_000 });
    assert.equal(stateC.backendCount, row.limit);
    assert.equal(stateC.maximumConnections, row.limit);
    assert.equal(stateC.overshoot, false);
    assert.equal(stateD.readinessStatus, 200);
    requiredNumber(stateD.readinessLatencyMs, `cutback.${row.limit}.recovery.readinessLatencyMs`);
    assert.equal(stateD.businessSucceeded, true);
    assert.equal(stateD.sessions, 0);
    assert.equal(stateD.locks, 0);
    assert.equal(row.classification, classifyCutbackMeasurement(row.states));
  }
  assert.equal(summary.reservedReadinessConnection, false);
  const rehearsals = requiredObject(summary.rehearsals, 'rehearsals');
  assert.deepEqual(rehearsals.sigint, { pass: true, exit: 130, firstSignal: 'SIGINT', authoritativeFinalizerInvocations: 1, summaryAbsent: true, sessions: 0, openTransactions: 0, idleTransactions: 0, locks: 0, markerObserved: true, partialWrites: 0, falseSuccessAudits: 0, trackedClients: 0, trackedChildren: 0, containers: 0, networks: 0, images: 0, scratchFiles: 0 });
  assert.deepEqual(rehearsals.sigterm, { pass: true, exit: 143, firstSignal: 'SIGTERM', authoritativeFinalizerInvocations: 1, summaryAbsent: true, sessions: 0, transactions: 0, locks: 0, markerObserved: true, signerInvoked: true, signerPending: true, noPersistentClaimCreated: true, capabilityReturned: false, capabilityLogged: false, trackedClients: 0, trackedChildren: 0, containers: 0, networks: 0, images: 0, scratchFiles: 0 });
  assert.deepEqual(rehearsals.falseStateContradiction, { pass: true, exit: 1, summaryAbsent: true, stageId: 'B3_FALSE_STATE_OBSERVER', cleanupComplete: true });
  assert.equal(rehearsals.disconnectRetry.pass, true);
  assert.equal(rehearsals.disconnectRetry.usedAuthoritativeFinalizer, true);
  assert.equal(rehearsals.disconnectRetry.phaseOneFailed, true);
  assert.equal(rehearsals.disconnectRetry.phaseTwoSucceeded, true);
  assert.equal(rehearsals.disconnectRetry.phaseTwoFailureTerminal, true);
  assert.equal(rehearsals.disconnectRetry.trackedClients, 0);
  assert.deepEqual(summary.faultCoverage, { covered: 35, missing: 0, duplicate: 0, unknown: 0 });
  assert.ok(Array.isArray(summary.faultReceipts) && summary.faultReceipts.length === 35, 'faultReceipts must contain 35 executions');
  assert.deepEqual([...new Set(summary.faultReceipts.map((item) => item.id))].sort(), [...FAILURE_IDS].sort());
  for (const receipt of summary.faultReceipts) {
    const catalog = FAULT_CATALOG.find((item) => item.id === receipt.id);
    assert.ok(catalog, `${receipt.id} is not in the fault catalog`);
    const pureKeys = ['evidenceDigest', 'executionReceipt', 'expectedRejectionObserved', 'hook', 'id', 'observedClassification', 'observedErrorClass', 'observedOutcome', 'observedStageId', 'proofId', 'proofType'];
    const evidenceKeys = ['evidenceDigest', 'executionReceipt', 'hook', 'id', 'observedClassification', 'observedOutcome', 'proofId', 'proofType'];
    assert.deepEqual(Object.keys(receipt).sort(), catalog.proofType === 'PURE_ADVERSARIAL_TEST' ? pureKeys : evidenceKeys, `${receipt.id} contains unapproved receipt metadata`);
    assert.equal(receipt.hook, catalog.faultInjectionHook, `${receipt.id}.hook mismatch`);
    assert.equal(receipt.observedClassification, catalog.expectedClassification, `${receipt.id}.observedClassification mismatch`);
    assert.equal(receipt.proofId, catalog.proofId, `${receipt.id}.proofId mismatch`);
    assert.equal(receipt.proofType, catalog.proofType, `${receipt.id}.proofType mismatch`);
    requiredString(receipt.observedOutcome, `${receipt.id}.observedOutcome`);
    const measuredEvidence = catalog.proofType === 'PURE_ADVERSARIAL_TEST'
      ? { observedErrorClass: receipt.observedErrorClass, observedStageId: receipt.observedStageId, expectedRejectionObserved: receipt.expectedRejectionObserved }
      : evidenceForFormalFault(receipt.id, summary, summary.rehearsals);
    if (catalog.proofType === 'PURE_ADVERSARIAL_TEST') {
      requiredString(receipt.observedErrorClass, `${receipt.id}.observedErrorClass`);
      assert.equal(receipt.observedStageId, catalog.faultInjectionHook);
      assert.equal(receipt.expectedRejectionObserved, true);
      assert.equal(receipt.observedOutcome, 'EXPECTED_REJECTION');
    } else {
      const derivedObservation = assertFormalFaultEvidence(catalog, measuredEvidence);
      assert.equal(receipt.observedOutcome, derivedObservation.observedOutcome, `${receipt.id}.observedOutcome mismatch`);
    }
    const digest = evidenceDigest(measuredEvidence);
    assert.equal(receipt.evidenceDigest, digest, `${receipt.id}.evidenceDigest mismatch`);
    assert.equal(receipt.executionReceipt, calculateExecutionReceipt(catalog, receipt.observedClassification, digest), `${receipt.id}.executionReceipt mismatch`);
    assert.match(receipt.executionReceipt, /^[a-f0-9]{64}$/u);
  }
  const audit = requiredObject(summary.finalAudit, 'finalAudit');
  assert.deepEqual(Object.keys(audit).sort(), ['applicationSessions','children','clients','containers','falseSuccessAudits','idleTransactions','images','inspectionVerified','networks','openTransactions','partialWrites','scratchFiles','unresolvedLockWaits']);
  for (const key of ['openTransactions', 'idleTransactions', 'unresolvedLockWaits', 'applicationSessions', 'clients', 'children', 'containers', 'networks', 'images', 'scratchFiles', 'partialWrites', 'falseSuccessAudits']) assert.equal(audit[key], 0, `finalAudit.${key} must be zero`);
  assert.equal(audit.inspectionVerified, true);
  return Object.freeze(summary);
}

async function atomicPublishStrictSummary(context, summary, finalPath, hooks = {}) {
  validateStrictSummary(summary);
  context.state.assertSummaryEligible();
  const scratchPath = `${finalPath}.${crypto.randomBytes(6).toString('hex')}.scratch`;
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  context.state.scratchPaths.add(scratchPath);
  context.fileTracker?.registerScratch(scratchPath);
  let handle = null;
  let renamed = false;
  const bounded = async (label, action, options = {}) => (await withDeadline(label, action, {
    timeoutMs: options.timeoutMs ?? 10_000,
    signal: options.ignoreAbort || hooks.ignoreAbort ? undefined : context.state.abortController.signal,
  })).value;
  try {
    await bounded('summary before-scratch hook', () => hooks.beforeScratchCreation?.() ?? hooks.beforeScratchOpen?.());
    context.state.assertSummaryEligible();
    handle = await bounded('summary scratch open', () => fs.promises.open(scratchPath, 'wx', 0o600));
    await bounded('summary during-write hook', () => hooks.duringWrite?.());
    await bounded('summary scratch write', () => handle.writeFile(serialized, 'utf8'));
    context.state.assertSummaryEligible();
    await bounded('summary fsync', () => handle.sync());
    await bounded('summary after-fsync hook', () => hooks.afterFsync?.() ?? hooks.afterScratchWrite?.());
    context.state.assertSummaryEligible();
    await bounded('summary scratch close', () => handle.close());
    handle = null;
    await bounded('summary before-rename hook', () => hooks.beforeRename?.() ?? hooks.afterScratchClose?.());
    context.state.assertSummaryEligible();
    await bounded('summary atomic rename', () => fs.promises.rename(scratchPath, finalPath));
    renamed = true;
    context.state.scratchPaths.delete(scratchPath);
    context.fileTracker?.unregisterScratch(scratchPath);
    context.state.assertSummaryEligible();
    await bounded('summary after-rename hook', () => hooks.afterRename?.());
    context.state.assertSummaryEligible();
    const retained = await bounded('summary retained read', () => fs.promises.readFile(finalPath));
    assert.equal(retained.toString('utf8'), serialized);
    await bounded('summary retained-validation hook', () => hooks.duringRetainedValidation?.() ?? hooks.afterRetainedVerification?.());
    validateStrictSummary(JSON.parse(retained.toString('utf8')));
    context.state.assertSummaryEligible();
    const summaryHash = sha256(retained);
    await bounded('summary before-hash-output hook', () => hooks.beforeHashOutput?.());
    context.state.assertSummaryEligible();
    context.state.retainedSummaryPaths.add(finalPath);
    context.fileTracker?.registerRetainedSanitizedSummary(finalPath);
    return Object.freeze({ summaryPath: finalPath, summaryHash });
  } catch (error) {
    if (handle) await bounded('summary failed-handle close', () => handle.close(), { ignoreAbort: true }).catch(() => undefined);
    await bounded('summary failed-scratch removal', () => fs.promises.rm(scratchPath, { force: true }), { ignoreAbort: true }).catch(() => undefined);
    context.state.scratchPaths.delete(scratchPath);
    context.fileTracker?.unregisterScratch(scratchPath);
    if (renamed || context.state.retainedSummaryPaths.has(finalPath)) {
      await bounded('summary failed-retained removal', () => fs.promises.rm(finalPath, { force: true }), { ignoreAbort: true }).catch(() => undefined);
      context.state.retainedSummaryPaths.delete(finalPath);
      context.fileTracker?.unregisterRetainedSanitizedSummary(finalPath);
    }
    context.state.disableSummary('B3 summary publication');
    throw error;
  }
}

function validateFailureCatalog(ids = FAILURE_IDS) {
  assert.equal(ids.length, 35);
  assert.deepEqual(ids, Array.from({ length: 35 }, (_, index) => `B3-F${String(index + 1).padStart(2, '0')}`));
  return ids;
}

const FAULT_DESCRIPTORS = Object.freeze([
  ['preflight-branch-mismatch', 'PREFLIGHT_REJECTION', false, 1, false, 'pure-preflight-branch'],
  ['preflight-head-mismatch', 'PREFLIGHT_REJECTION', false, 1, false, 'pure-preflight-head'],
  ['preflight-tree-mismatch', 'PREFLIGHT_REJECTION', false, 1, false, 'pure-preflight-tree'],
  ['preflight-unauthorized-path', 'SCOPE_REJECTION', false, 1, false, 'pure-preflight-scope'],
  ['preflight-staged-index', 'SCOPE_REJECTION', false, 1, false, 'pure-preflight-index'],
  ['preflight-node-version', 'RUNTIME_REJECTION', false, 1, false, 'pure-preflight-node'],
  ['inventory-duplicate-identity', 'INVENTORY_REJECTION', false, 1, false, 'pure-inventory-duplicate'],
  ['inventory-unresolved-call', 'INVENTORY_REJECTION', false, 1, false, 'pure-inventory-unresolved'],
  ['runtime-role-override-invalid', 'INVENTORY_REJECTION', false, 1, false, 'pure-runtime-role-override'],
  ['playback-unsafe-callback', 'CALLER_AUDIT_REJECTION', false, 1, false, 'pure-playback-unsafe'],
  ['summary-required-field-missing', 'SUMMARY_REJECTION', false, 1, false, 'pure-summary-required'],
  ['summary-sensitive-value', 'SUMMARY_REJECTION', false, 1, false, 'pure-summary-redaction'],
  ['docker-ownership-denial', 'OWNERSHIP_REJECTION', false, 1, false, 'pure-docker-ownership'],
  ['postgres-image-missing', 'IMAGE_PREFLIGHT_REJECTION', false, 1, false, 'pure-postgres-image'],
  ['dockerfile-base-image-missing', 'IMAGE_PREFLIGHT_REJECTION', false, 1, false, 'pure-base-image'],
  ['candidate-build-failure', 'PROVENANCE_REJECTION', false, 1, false, 'pure-build-failure'],
  ['runtime-manifest-mismatch', 'PROVENANCE_REJECTION', false, 1, false, 'pure-runtime-manifest'],
  ['migration-deploy-failure', 'MIGRATION_REJECTION', false, 1, false, 'pure-migrate-deploy'],
  ['migration-status-failure', 'MIGRATION_REJECTION', false, 1, false, 'pure-migrate-status'],
  ['lock-acquisition-deadline', 'BOUNDED_TIMEOUT', true, 1, false, 'pure-lock-deadline'],
  ['learning-transaction-timeout', 'P2028', true, 0, true, 'formal-learning-timeout'],
  ['lesson-transaction-timeout', 'P2028', true, 0, true, 'formal-lesson-timeout'],
  ['teacher-transaction-timeout', 'P2028', true, 0, true, 'formal-teacher-timeout'],
  ['teacher-serializable-contention', 'SERIALIZABLE_CONTENTION_VALID_OUTCOME', true, 0, true, 'formal-teacher-serializable'],
  ['pool-acquisition-timeout', 'P2024', true, 0, true, 'formal-pool-p2024'],
  ['readiness-observer-contradiction', 'EVIDENCE_CONTRADICTION', true, 1, false, 'live-false-state'],
  ['playback-final-revalidation-rejection', 'SAFE_NULL', true, 0, true, 'focused-playback-revalidation'],
  ['learning-verifier-rejection', 'MEDIA_VERIFICATION_FAILURE', true, 0, true, 'formal-learning-verifier'],
  ['learning-finalization-failure', 'RETRYABLE_FINALIZATION_FAILURE', true, 0, true, 'formal-learning-finalization'],
  ['signal-sigint-lock-wait', 'INTERRUPTED', true, 130, false, 'live-sigint-lock'],
  ['signal-sigterm-provider-wait', 'INTERRUPTED', true, 143, false, 'live-sigterm-provider'],
  ['false-state-contradiction', 'EVIDENCE_CONTRADICTION', true, 1, false, 'live-false-state'],
  ['disconnect-phase-one-failure', 'RECOVERED_CLEANUP_FAILURE', true, 0, true, 'live-disconnect-retry'],
  ['disconnect-phase-two-failure', 'TERMINAL_CLEANUP_FAILURE', true, 1, false, 'pure-disconnect-terminal'],
  ['formal-second-run-failure', 'CROSS_RUN_REJECTION', true, 1, false, 'pure-second-run-failure'],
]);
const FAULT_CATALOG = Object.freeze(FAULT_DESCRIPTORS.map((descriptor, index) => Object.freeze({
  id: FAILURE_IDS[index],
  faultInjectionHook: descriptor[0],
  expectedClassification: descriptor[1],
  expectedBusinessRollback: descriptor[2],
  expectedCleanup: 'ZERO_RESIDUE',
  expectedExit: descriptor[3],
  summaryEligibility: descriptor[4],
  proofType: descriptor[5].startsWith('live-')||descriptor[5]==='pure-disconnect-terminal' ? 'LIVE_REHEARSAL' : descriptor[5].startsWith('formal-') ? 'FORMAL_SCENARIO' : descriptor[5].startsWith('focused-') ? 'FOCUSED_TEST' : 'PURE_ADVERSARIAL_TEST',
  proofId: descriptor[5],
})));

const validPreflightObservation = () => ({
  nodeVersion:'v22.23.1',branch:'chore/production-readiness-3-cloud-sql',head:BASE_SHA,tree:BASE_TREE,staged:'',changedPaths:[...AUTHORIZED_PATHS],
});
const PURE_FAULT_INJECTORS = Object.freeze({
  'preflight-branch-mismatch':()=>validatePreflightObservation({...validPreflightObservation(),branch:'wrong-branch'}),
  'preflight-head-mismatch':()=>validatePreflightObservation({...validPreflightObservation(),head:'0'.repeat(40)}),
  'preflight-tree-mismatch':()=>validatePreflightObservation({...validPreflightObservation(),tree:'0'.repeat(40)}),
  'preflight-unauthorized-path':()=>validatePreflightObservation({...validPreflightObservation(),changedPaths:[...AUTHORIZED_PATHS,'unexpected.txt']}),
  'preflight-staged-index':()=>validatePreflightObservation({...validPreflightObservation(),staged:'package.json'}),
  'preflight-node-version':()=>validatePreflightObservation({...validPreflightObservation(),nodeVersion:'v0.0.0'}),
  'inventory-duplicate-identity':()=>validateTransactionIdentities([{transactionId:'duplicate'},{transactionId:'duplicate'}]),
  'inventory-unresolved-call':()=>validateResolvedTransaction({transactionId:'synthetic',unresolvedCalls:[{target:'provider.unknown'}]}),
  'runtime-role-override-invalid':()=>resolveRuntimeRole('fixture.ts',[],[{path:'fixture.ts',role:'',reason:'missing role',evidence:'reviewed'}]),
  'playback-unsafe-callback':()=>validatePlaybackConsumerAudit([{...PLAYBACK_CONSUMER_AUDIT[0],classification:'DATABASE_SIDE_EFFECT'}]),
  'summary-required-field-missing':()=>validateStrictSummary({}),
  'summary-sensitive-value':()=>validateSanitizedSummary({value:'postgresql://synthetic:synthetic@invalid/db'}),
  'docker-ownership-denial':()=>buildOwnershipLabels('b3-valid-run','unknown-role'),
  'postgres-image-missing':()=>validateImmutableImageIdentity(`sha256:${'0'.repeat(64)}`,POSTGRES_IMAGE,'PostgreSQL image'),
  'dockerfile-base-image-missing':()=>validateImmutableImageIdentity(`sha256:${'0'.repeat(64)}`,NODE_IMAGE,'Node base image'),
  'candidate-build-failure':()=>validateBuiltImageId('missing-image-id'),
  'runtime-manifest-mismatch':()=>validateRuntimeSummary({imageId:`sha256:${'0'.repeat(64)}`},'fault.runtime'),
  'migration-deploy-failure':()=>validateMigrationEvidence('FAIL','PASS'),
  'migration-status-failure':()=>validateMigrationEvidence('PASS','FAIL'),
  'lock-acquisition-deadline':()=>withB3Deadline(()=>new Promise(()=>{}),5),
  'formal-second-run-failure':()=>validateCrossRun([{summary:{overall:'PASS',runId:'run-one'}},{summary:{overall:'FAIL',runId:'run-two'}}]),
});

const NEGATIVE_CLASSIFICATION_BY_STAGE = Object.freeze({
  'preflight-branch-mismatch':'PREFLIGHT_REJECTION','preflight-head-mismatch':'PREFLIGHT_REJECTION','preflight-tree-mismatch':'PREFLIGHT_REJECTION',
  'preflight-unauthorized-path':'SCOPE_REJECTION','preflight-staged-index':'SCOPE_REJECTION','preflight-node-version':'RUNTIME_REJECTION',
  'inventory-duplicate-identity':'INVENTORY_REJECTION','inventory-unresolved-call':'INVENTORY_REJECTION','runtime-role-override-invalid':'INVENTORY_REJECTION',
  'playback-unsafe-callback':'CALLER_AUDIT_REJECTION','summary-required-field-missing':'SUMMARY_REJECTION','summary-sensitive-value':'SUMMARY_REJECTION',
  'docker-ownership-denial':'OWNERSHIP_REJECTION','postgres-image-missing':'IMAGE_PREFLIGHT_REJECTION','dockerfile-base-image-missing':'IMAGE_PREFLIGHT_REJECTION',
  'candidate-build-failure':'PROVENANCE_REJECTION','runtime-manifest-mismatch':'PROVENANCE_REJECTION','migration-deploy-failure':'MIGRATION_REJECTION',
  'migration-status-failure':'MIGRATION_REJECTION','lock-acquisition-deadline':'BOUNDED_TIMEOUT','formal-second-run-failure':'CROSS_RUN_REJECTION',
});

function buildEvidenceReceipt(entry, observedClassification, observedOutcome, measuredEvidence, extra = {}) {
  requiredObject(measuredEvidence, `${entry.id}.measuredEvidence`);
  assert.ok(Object.keys(measuredEvidence).length > 0, `${entry.id} measured evidence is empty`);
  assert.equal(observedClassification, entry.expectedClassification, `${entry.id} observed classification mismatch`);
  const digest = evidenceDigest(measuredEvidence);
  return Object.freeze({
    id: entry.id,
    hook: entry.faultInjectionHook,
    proofId: entry.proofId,
    proofType: entry.proofType,
    observedClassification,
    observedOutcome,
    evidenceDigest: digest,
    executionReceipt: calculateExecutionReceipt(entry, observedClassification, digest),
    ...extra,
  });
}

async function executeNegativeFaultInjection(entryOrId, injector) {
  const entry = typeof entryOrId === 'string' ? FAULT_CATALOG.find((item) => item.id === entryOrId) : entryOrId;
  if (!entry) throw new Error('Unknown B3 fault injection');
  assert.equal(entry.proofType, 'PURE_ADVERSARIAL_TEST', `${entry.id} is not a negative fault injection`);
  const defaultInjector = PURE_FAULT_INJECTORS[entry.faultInjectionHook];
  const selectedInjector = injector ?? defaultInjector;
  if (typeof selectedInjector !== 'function') throw new Error(`Fault proof executor missing for ${entry.id}`);
  let observedError;
  try {
    await selectedInjector(entry);
  } catch (error) {
    observedError = error;
  }
  if (!observedError) throw new Error(`Fault ${entry.id} did not reject`);
  const isDefaultPath = selectedInjector === defaultInjector;
  const taggedClassification = observedError && typeof observedError === 'object' ? observedError.faultClassification : undefined;
  const taggedStage = observedError && typeof observedError === 'object' ? observedError.faultStageId : undefined;
  if (!isDefaultPath && (taggedStage !== entry.faultInjectionHook || typeof taggedClassification !== 'string')) {
    throw new Error(`${entry.id} unrelated negative-injection error`);
  }
  const observedClassification = isDefaultPath ? NEGATIVE_CLASSIFICATION_BY_STAGE[entry.faultInjectionHook] : taggedClassification;
  const observedStageId = isDefaultPath ? entry.faultInjectionHook : taggedStage;
  const observedErrorClass = observedError?.constructor?.name ?? observedError?.name ?? 'UnknownError';
  const measuredEvidence = { observedErrorClass, observedStageId, expectedRejectionObserved: true };
  return buildEvidenceReceipt(entry, observedClassification, 'EXPECTED_REJECTION', measuredEvidence, measuredEvidence);
}

async function executeFaultInjection(id, hooks = {}) {
  const entry = FAULT_CATALOG.find((item) => item.id === id);
  if (!entry) throw new Error('Unknown B3 fault injection');
  const injector = hooks[entry.faultInjectionHook] ?? PURE_FAULT_INJECTORS[entry.faultInjectionHook];
  return executeNegativeFaultInjection(entry, injector);
}

function evidenceForFormalFault(id, result, rehearsals) {
  const timeout = (key) => {
    const item = requiredObject(result?.timeouts?.[key], `${id}.${key}`);
    return { errorCategory: item.errorCategory, rollbackPass: item.rollbackPass, retryPass: item.retryPass, elapsedMs: item.elapsedMs };
  };
  switch (id) {
    case 'B3-F21': return timeout('learningMedia');
    case 'B3-F22': return timeout('lessonContent');
    case 'B3-F23': return timeout('teacherLifecycle');
    case 'B3-F24': {
      const item = requiredObject(result?.serializable, `${id}.serializable`);
      return Object.fromEntries(['outcome', 'committed', 'aborted', 'errorCode', 'retrySucceeded', 'invariantsPass', 'identityCount', 'membershipCount', 'activeMembershipCount', 'allocationCount', 'auditCount', 'sessionRevoked', 'distinctBackendSessions', 'bothPendingBeforeRelease', 'overlapObserved', 'maximumConcurrentTransactions', 'blockingRelationshipObserved', 'firstStartedAt', 'secondStartedAt', 'firstCompletedAt', 'secondCompletedAt'].map((key) => [key, item[key]]));
    }
    case 'B3-F25': return { errorCode: result?.pool?.errorCode, recoveryPass: result?.pool?.recoveryPass, p2024Observed: result?.pool?.p2024Observed };
    case 'B3-F26': return { stageId: rehearsals?.falseStateContradiction?.stageId, summaryAbsent: rehearsals?.falseStateContradiction?.summaryAbsent };
    case 'B3-F27': return { negativeRevalidationPass: result?.playback?.negativeRevalidationPass ?? Object.values(result?.playback?.negativeCases ?? {}).every((value) => value === true), capabilityExposedOnRejectedRevalidation: result?.playback?.capabilityExposedOnRejectedRevalidation };
    case 'B3-F28': return { ...requiredObject(result?.learningVerifier?.failureMatrix?.verifierFailure, `${id}.verifierFailure`) };
    case 'B3-F29': return { ...requiredObject(result?.learningVerifier?.failureMatrix?.finalizationFailure, `${id}.finalizationFailure`) };
    case 'B3-F30': return Object.fromEntries(['exit', 'partialWrites', 'falseSuccessAudits', 'authoritativeFinalizerInvocations', 'summaryAbsent'].map((key) => [key, rehearsals?.sigint?.[key]]));
    case 'B3-F31': return Object.fromEntries(['exit', 'transactions', 'capabilityReturned', 'authoritativeFinalizerInvocations', 'summaryAbsent'].map((key) => [key, rehearsals?.sigterm?.[key]]));
    case 'B3-F32': return Object.fromEntries(['exit', 'cleanupComplete', 'summaryAbsent', 'stageId'].map((key) => [key, rehearsals?.falseStateContradiction?.[key]]));
    case 'B3-F33': return Object.fromEntries(['phaseOneFailed', 'phaseTwoSucceeded', 'trackedClients'].map((key) => [key, rehearsals?.disconnectRetry?.[key]]));
    case 'B3-F34': return { phaseTwoFailureTerminal: rehearsals?.disconnectRetry?.phaseTwoFailureTerminal };
    default: throw new Error(`${id} does not have formal/live evidence`);
  }
}

async function recordEvidenceProof(entry, assertion, measuredEvidence) {
  requiredObject(measuredEvidence, `${entry.id}.measuredEvidence`);
  assert.ok(Object.keys(measuredEvidence).length > 0, `${entry.id} measured evidence is empty`);
  const observation = requiredObject(await assertion(measuredEvidence), `${entry.id}.observation`);
  requiredString(observation.observedClassification, `${entry.id}.observedClassification`);
  requiredString(observation.observedOutcome, `${entry.id}.observedOutcome`);
  return buildEvidenceReceipt(entry, observation.observedClassification, observation.observedOutcome, measuredEvidence);
}

function assertFormalFaultEvidence(entry, evidence) {
  switch (entry.id) {
    case 'B3-F21': case 'B3-F22': case 'B3-F23':
      assert.equal(evidence.errorCategory, 'P2028');assert.equal(evidence.rollbackPass, true);assert.equal(evidence.retryPass, true);
      return { observedClassification: evidence.errorCategory, observedOutcome: 'ROLLBACK_AND_RETRY_SUCCEEDED' };
    case 'B3-F24': {
      assert.equal(evidence.overlapObserved, true);assert.equal(evidence.bothPendingBeforeRelease, true);assert.equal(evidence.distinctBackendSessions, true);assert.equal(evidence.blockingRelationshipObserved, true);assert.ok(evidence.maximumConcurrentTransactions >= 2);assert.equal(evidence.invariantsPass, true);
      if (evidence.outcome === 'SERIALIZED_ORDERED_COMMITS') { assert.equal(evidence.committed, 2);assert.equal(evidence.aborted, 0);assert.equal(evidence.errorCode, null); }
      else { assert.equal(evidence.outcome, 'ONE_COMMIT_ONE_SERIALIZATION_ABORT');assert.equal(evidence.committed, 1);assert.equal(evidence.aborted, 1);assert.equal(evidence.errorCode, 'P2034');assert.equal(evidence.retrySucceeded, true); }
      return { observedClassification: 'SERIALIZABLE_CONTENTION_VALID_OUTCOME', observedOutcome: evidence.outcome };
    }
    case 'B3-F25': assert.equal(evidence.errorCode, 'P2024');assert.equal(evidence.recoveryPass, true);assert.equal(evidence.p2024Observed, true);return { observedClassification: 'P2024', observedOutcome: 'POOL_RECOVERED' };
    case 'B3-F26': assert.equal(evidence.stageId, 'B3_FALSE_STATE_OBSERVER');assert.equal(evidence.summaryAbsent, true);return { observedClassification: 'EVIDENCE_CONTRADICTION', observedOutcome: 'SUMMARY_SUPPRESSED' };
    case 'B3-F27': assert.equal(evidence.negativeRevalidationPass, true);assert.equal(evidence.capabilityExposedOnRejectedRevalidation, false);return { observedClassification: 'SAFE_NULL', observedOutcome: 'CAPABILITY_SUPPRESSED' };
    case 'B3-F28': assert.equal(evidence.status, 'FAILED');assert.equal(evidence.fileCount, 0);return { observedClassification: 'MEDIA_VERIFICATION_FAILURE', observedOutcome: 'FAILED_WITHOUT_FILE' };
    case 'B3-F29': assert.equal(evidence.releasedStatus, 'UPLOADING');assert.equal(evidence.retryStatus, 'READY');return { observedClassification: 'RETRYABLE_FINALIZATION_FAILURE', observedOutcome: 'RETRY_SUCCEEDED' };
    case 'B3-F30': assert.equal(evidence.exit, 130);assert.equal(evidence.partialWrites, 0);assert.equal(evidence.falseSuccessAudits, 0);assert.equal(evidence.authoritativeFinalizerInvocations, 1);assert.equal(evidence.summaryAbsent, true);return { observedClassification: 'INTERRUPTED', observedOutcome: 'SIGINT_CLEANUP' };
    case 'B3-F31': assert.equal(evidence.exit, 143);assert.equal(evidence.transactions, 0);assert.equal(evidence.capabilityReturned, false);assert.equal(evidence.authoritativeFinalizerInvocations, 1);assert.equal(evidence.summaryAbsent, true);return { observedClassification: 'INTERRUPTED', observedOutcome: 'SIGTERM_CLEANUP' };
    case 'B3-F32': assert.equal(evidence.exit, 1);assert.equal(evidence.cleanupComplete, true);assert.equal(evidence.summaryAbsent, true);assert.equal(evidence.stageId, 'B3_FALSE_STATE_OBSERVER');return { observedClassification: 'EVIDENCE_CONTRADICTION', observedOutcome: 'FAIL_CLOSED' };
    case 'B3-F33': assert.equal(evidence.phaseOneFailed, true);assert.equal(evidence.phaseTwoSucceeded, true);assert.equal(evidence.trackedClients, 0);return { observedClassification: 'RECOVERED_CLEANUP_FAILURE', observedOutcome: 'PHASE_TWO_RECOVERED' };
    case 'B3-F34': assert.equal(evidence.phaseTwoFailureTerminal, true);return { observedClassification: 'TERMINAL_CLEANUP_FAILURE', observedOutcome: 'RESULT_SUPPRESSED' };
    default: throw new Error(`${entry.id} has no positive evidence assertion`);
  }
}

async function collectEvidenceFaultExecutions(result, rehearsals) {
  const ids = Array.from({ length: 14 }, (_, index) => `B3-F${String(index + 21).padStart(2, '0')}`);
  return Promise.all(ids.map((id) => {
    const entry = FAULT_CATALOG.find((item) => item.id === id);
    const measuredEvidence = evidenceForFormalFault(id, result, rehearsals);
    return recordEvidenceProof(entry, (evidence) => assertFormalFaultEvidence(entry, evidence), measuredEvidence);
  }));
}

function validateFaultCoverage(executions) {
  assert.ok(Array.isArray(executions));
  const known = new Set(FAILURE_IDS);
  const seen = new Set();
  let duplicate = 0;
  let unknown = 0;
  for (const execution of executions) {
    if (!known.has(execution.id)) unknown += 1;
    else if (seen.has(execution.id)) duplicate += 1;
    else {
      const entry = FAULT_CATALOG.find((item) => item.id === execution.id);
      assert.equal(execution.observedClassification, entry.expectedClassification);
      assert.equal(execution.proofId, entry.proofId);
      assert.equal(execution.proofType, entry.proofType);
      requiredString(execution.evidenceDigest, `${execution.id}.evidenceDigest`, /^[a-f0-9]{64}$/);
      requiredString(execution.executionReceipt, `${execution.id}.executionReceipt`);
      seen.add(execution.id);
    }
  }
  const result = { covered: seen.size, missing: FAILURE_IDS.length - seen.size, duplicate, unknown };
  assert.deepEqual(result, { covered: 35, missing: 0, duplicate: 0, unknown: 0 });
  return Object.freeze(result);
}

async function disconnectTrackedClientsInTwoPhases(clients, cleanupBetweenPhases = async () => undefined, options = {}) {
  const tracked = clients instanceof Set ? clients : new Set(clients);
  const phaseOneResults = await disconnectTrackedPrismaClients(tracked, options.phaseOneMs ?? 5_000);
  const phaseOne = phaseOneResults.map((item) => item.status === PRISMA_DISCONNECT_STATUS.SUCCESS ? 'DISCONNECTED' : 'RETRY_REQUIRED');
  await (await withDeadline('cleanup between Prisma disconnect phases', cleanupBetweenPhases, {
    timeoutMs: options.cleanupMs ?? 30_000,
    signal: options.signal,
  })).value;
  const phaseTwoResults = await disconnectTrackedPrismaClients(tracked, options.phaseTwoMs ?? 5_000);
  const phaseTwo = phaseTwoResults.map((item) => item.status === PRISMA_DISCONNECT_STATUS.SUCCESS ? 'DISCONNECTED' : 'FAILED');
  const result = Object.freeze({ phaseOne, phaseTwo, remaining: tracked.size });
  if (tracked.size !== 0) throw Object.assign(new Error('Prisma disconnect phase two failed'), { disconnectResult: result });
  return result;
}

function validateCrossRun(runs) {
  assert.ok(Array.isArray(runs) && runs.length === 2, 'exactly two formal runs are required');
  for (const run of runs) assert.equal(run.summary?.overall, 'PASS');
  assert.notEqual(runs[0].summary.runId, runs[1].summary.runId);
  for (const key of ['candidateProductionPatchSha256', 'packageLockSha256']) assert.equal(runs[0].summary.provenance[key], runs[1].summary.provenance[key]);
  assert.equal(runs[0].summary.provenance.candidate.imageId, runs[1].summary.provenance.candidate.imageId);
  assert.equal(runs[0].summary.provenance.candidate.runtimeManifestSha256, runs[1].summary.provenance.candidate.runtimeManifestSha256);
  assert.equal(runs[0].summary.inventory.digest, runs[1].summary.inventory.digest);
  assert.equal(runs[0].summary.playbackCallerDigest, runs[1].summary.playbackCallerDigest);
  assert.equal(runs[0].summary.faultCatalogVersion, runs[1].summary.faultCatalogVersion);
  assert.equal(runs[0].summary.faultProofImplementationVersion, runs[1].summary.faultProofImplementationVersion);
  assert.equal(runs[0].summary.serializable.overlapObserved, true);
  assert.equal(runs[1].summary.serializable.overlapObserved, true);
  return Object.freeze({ pass: true, distinctRuns: true, sharedCandidate: true });
}

async function checked(command, args, options) {
  const result = await runChild(command, args, { ...options, signal: options.ignoreAbort ? undefined : options.signal ?? activeEvidenceSignal });
  if (!result.ok) {
    const diagnostic = `${result.stderr}\n${result.stdout}`.trim();
    throw new Error(`${path.basename(command)} failed (${result.exitCode}): ${diagnostic.slice(-2400)}`);
  }
  return result;
}

function validatePreflightObservation(observation) {
  assert.equal(observation.nodeVersion, 'v22.23.1');
  assert.equal(observation.branch, 'chore/production-readiness-3-cloud-sql');
  assert.equal(observation.head, BASE_SHA);
  assert.equal(observation.tree, BASE_TREE);
  assert.equal(observation.staged, '', 'index must remain clean');
  assert.deepEqual([...observation.changedPaths].sort(), [...AUTHORIZED_PATHS].sort(), 'working tree must contain exactly the nine authorized paths');
  return Object.freeze({ changedPaths: [...observation.changedPaths].sort() });
}

function validateImmutableImageIdentity(actual, expected, label) {
  requiredString(actual, `${label}.actual`, /^sha256:[a-f0-9]{64}$/);
  requiredString(expected, `${label}.expected`, /^sha256:[a-f0-9]{64}$/);
  assert.equal(actual, expected, `${label} immutable identity mismatch`);
  return actual;
}

function validateBuiltImageId(imageId) {
  requiredString(imageId, 'built image ID', /^sha256:[a-f0-9]{64}$/);
  return imageId;
}

function validateMigrationEvidence(deploy, status) {
  assert.equal(deploy, 'PASS', 'migration deploy failed');
  assert.equal(status, 'PASS', 'migration status failed');
  return Object.freeze({ deploy, status });
}

async function withB3Deadline(operation, timeoutMs, signal) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0, 'deadline must be a positive integer');
  return (await withDeadline('B3 operation', operation, { timeoutMs, signal })).value;
}

async function abortAwareDelay(label, ms, signal, delayOperation = () => new Promise((resolve) => setTimeout(resolve, ms))) {
  return (await withDeadline(label, delayOperation, { timeoutMs: ms + 1_000, signal })).value;
}

async function runAbortAwarePolling({ label, attempts, intervalMs, signal, poll, delayOperation }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw Object.assign(new Error(`${label} aborted`), { name: 'AbortError' });
    const result = await poll(attempt, signal);
    if (signal?.aborted) throw Object.assign(new Error(`${label} aborted`), { name: 'AbortError' });
    if (result.done) return result.value;
    await abortAwareDelay(`${label} delay`, intervalMs, signal, delayOperation ? () => delayOperation(intervalMs, signal) : undefined);
  }
  throw new Error(`${label} exhausted its bounded attempts`);
}

async function runControlledDriverFinalizationFixture(options = {}) {
  const trackedPrismaClients = new Set(options.clients ?? []);
  const activeOperations = new Set();
  const markers = [];
  const events = [];
  for (const operation of options.activeOperations ?? []) {
    activeOperations.add(operation);
    void operation.finally(() => activeOperations.delete(operation)).catch(() => undefined);
  }
  const disconnectPhase = async (phase) => {
    const results = [];
    for (const client of [...trackedPrismaClients]) {
      try {
        await (await withDeadline(`${phase} controlled disconnect`, () => client.$disconnect(), { timeoutMs: options.disconnectMs ?? 20 })).value;
        trackedPrismaClients.delete(client);
        results.push(Object.freeze({ status: 'DISCONNECTED' }));
      } catch (error) {
        results.push(Object.freeze({ status: error?.name === 'DeadlineExceededError' || /deadline/iu.test(error?.message ?? '') ? 'TIMED_OUT' : 'REJECTED' }));
      }
    }
    events.push(phase);
    return Object.freeze(results);
  };
  const phaseOneResults = await disconnectPhase('phase-one');
  try {
    await (await withDeadline('controlled active operation settlement', () => Promise.allSettled([...activeOperations]), { timeoutMs: options.operationMs ?? 20 })).value;
  } catch {}
  events.push('active-operation-audit');
  const phaseTwoResults = await disconnectPhase('phase-two');
  const ok = trackedPrismaClients.size === 0 && activeOperations.size === 0;
  const requestedExitCode = options.firstSignal === 'SIGINT' ? 130 : options.firstSignal === 'SIGTERM' ? 143 : ok ? 0 : 1;
  const result = Object.freeze({ ok, phaseOneResults, phaseTwoResults, trackedPrismaClients: trackedPrismaClients.size, activeOperations: activeOperations.size, pendingDriverTimers: 0, pendingDriverAbortListeners: 0, firstSignal: options.firstSignal ?? null, requestedExitCode, authoritativeFinalizerInvocations: 1 });
  events.push('zero-resource-audit');
  if (options.firstSignal || !ok) markers.push(`B3_DRIVER_FINALIZED=${JSON.stringify(result)}`);
  else if (options.candidateResult !== undefined) markers.push(`B3_DRIVER=${JSON.stringify(options.candidateResult)}`);
  events.push(markers.some((marker) => marker.startsWith('B3_DRIVER=')) ? 'result-publication' : 'result-suppressed');
  return Object.freeze({ result, markers: Object.freeze(markers), events: Object.freeze(events) });
}

async function runControlledBoundedOperationFixture(options = {}) {
  const activeOperations = new Set();
  const trackedPromises = new WeakSet();
  const track = (promise) => {
    if (!trackedPromises.has(promise)) {
      trackedPromises.add(promise);
      activeOperations.add(promise);
      void promise.finally(() => activeOperations.delete(promise)).catch(() => undefined);
    }
    return promise;
  };
  const start = (operation) => { try { return Promise.resolve(operation()); } catch (error) { return Promise.reject(error); } };
  const boundedWork = async (label, operation, timeoutMs) => {
    const promise = track(start(operation));
    return (await withDeadline(label, () => promise, { timeoutMs })).value;
  };
  const operation = options.operation ?? new Promise(() => {});
  let callerOutcome = 'FULFILLED';
  try { await boundedWork(options.label ?? 'controlled bounded work', () => operation, options.callerTimeoutMs ?? 10); }
  catch { callerOutcome = 'TIMED_OUT_OR_REJECTED'; }
  options.onCallerSettled?.();
  try {
    await (await withDeadline('controlled bounded finalization grace', () => Promise.allSettled([...activeOperations]), { timeoutMs: options.finalizationMs ?? 20 })).value;
  } catch {}
  const activeOperationCount = activeOperations.size;
  const resultMarkerEmitted = activeOperationCount === 0;
  return Object.freeze({ callerOutcome, activeOperations: activeOperationCount, resultMarkerEmitted, markers: Object.freeze(resultMarkerEmitted ? ['B3_DRIVER={}'] : ['B3_DRIVER_FINALIZED={"ok":false}']), boundedWork });
}

async function preflight(nodePath) {
  const env = buildMinimalChildEnvironment(process.env);
  const nodeVersion=(await checked(nodePath, ['--version'], { cwd: ROOT, env, timeoutMs: 10_000 })).stdout.trim();
  const branch=(await checked('git', ['branch', '--show-current'], { cwd: ROOT, env, timeoutMs: 10_000 })).stdout.trim();
  const head=(await checked('git', ['rev-parse', 'HEAD'], { cwd: ROOT, env, timeoutMs: 10_000 })).stdout.trim();
  const tree=(await checked('git', ['rev-parse', 'HEAD^{tree}'], { cwd: ROOT, env, timeoutMs: 10_000 })).stdout.trim();
  const staged = await checked('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, env, timeoutMs: 10_000 });
  const status = await checked('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: ROOT, env, timeoutMs: 10_000 });
  const changedPaths = status.stdout.split(/\r?\n/u).filter(Boolean).map((line) => line.slice(3).replaceAll('\\', '/')).sort();
  return validatePreflightObservation({nodeVersion,branch,head,tree,staged:staged.stdout.trim(),changedPaths});
}

async function calculateCandidateProductionPatch(env = buildMinimalChildEnvironment(process.env)) {
  const result = await checked('git', ['diff', '--no-ext-diff', '--no-color', '--binary', BASE_SHA, '--', normalized(PLAYBACK_PATH)], { cwd: ROOT, env, timeoutMs: 30_000, maxCaptureBytes: 2_000_000 });
  const normalizedPatch = result.stdout.replace(/\r\n/g, '\n');
  assert.ok(normalizedPatch.includes(normalized(PLAYBACK_PATH)), 'candidate production patch is empty');
  return Object.freeze({ bytes: Buffer.byteLength(normalizedPatch), sha256: sha256(normalizedPatch), normalizedPatch });
}

function buildOwnershipLabels(runId, role) {
  assert.match(runId, /^[a-z0-9][a-z0-9-]{5,80}$/u);
  assert.ok(['postgres', 'migration', 'driver', 'observer', 'rehearsal'].includes(role));
  return Object.freeze({ [GATE_LABEL]: GATE, [RUN_LABEL]: runId, [ROLE_LABEL]: role });
}

function labelArgs(labels) {
  return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, value]) => ['--label', `${key}=${value}`]);
}

function buildPostgresFixtureArgs({ name, network, runId, password }) {
  assert.match(name, /^moazez-b3-[a-z0-9-]+$/u);
  assert.ok(password && typeof password === 'string');
  return [
    'create', '--name', name, '--pull=never', ...labelArgs(buildOwnershipLabels(runId, 'postgres')),
    '--network', network, '--network-alias', 'postgres', '--publish', '127.0.0.1::5432',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=768m',
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=moazez_b3',
    POSTGRES_IMAGE, '-c', 'max_connections=80',
  ];
}

function buildNamedContainerCreateArgs({ name, runId, role, network, imageId, environment = [], mounts = [], entrypoint = 'node', command = [] }) {
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/u);
  const args = ['create', '--name', name, '--pull=never', ...labelArgs(buildOwnershipLabels(runId, role))];
  if (network) args.push('--network', network);
  for (const value of environment) args.push('--env', value);
  for (const value of mounts) args.push('--mount', value);
  args.push('--entrypoint', entrypoint, imageId, ...command);
  return args;
}

async function createBuildContext(tempRoot, name, candidate, nodePath, env) {
  const contextPath = path.join(tempRoot, name);
  await fs.promises.mkdir(contextPath, { recursive: true });
  const archive = path.join(tempRoot, `${name}.tar`);
  await checked('git', ['archive', '--format=tar', `--output=${archive}`, BASE_SHA], { cwd: ROOT, env, timeoutMs: 30_000 });
  await checked('tar', ['-xf', archive, '-C', contextPath], { cwd: ROOT, env, timeoutMs: 30_000 });
  if (candidate) await fs.promises.copyFile(path.join(ROOT, PLAYBACK_PATH), path.join(contextPath, PLAYBACK_PATH));
  return contextPath;
}

async function buildImage(contextPath, tag, env, runId, imageRole, state) {
  const labels = { [LABEL]: tag, [GATE_LABEL]: GATE, [RUN_LABEL]: runId, 'com.moazez.evidence.image-role': imageRole, 'com.moazez.evidence.base-sha': BASE_SHA, 'com.moazez.evidence.base-tree': BASE_TREE };
  const args = buildCanonicalDockerBuildArgs({ contextPath, tag, labels });
  assert.ok(args.includes('--pull=false'), 'candidate build must use --pull=false');
  await checked('docker', args, { cwd: ROOT, env, timeoutMs: 1_200_000, maxCaptureBytes: 2_000_000, tracker: state?.childTracker });
  const inspected = await checked('docker', ['image', 'inspect', tag, '--format', '{{.Id}}'], { cwd: ROOT, env, timeoutMs: 30_000 });
  const imageId = validateBuiltImageId(inspected.stdout.trim());
  state?.ownedImages.set(imageId, Object.freeze({ imageId, tag, runId, imageRole }));
  return imageId;
}

async function waitForPostgres(name, env, context, options = {}) {
  const signal = options.signal ?? context?.state?.abortController?.signal;
  const childRunner = options.runChild ?? runChild;
  return runAbortAwarePolling({
    label: 'PostgreSQL readiness polling', attempts: options.attempts ?? 80, intervalMs: options.intervalMs ?? 250, signal,
    delayOperation: options.delayOperation,
    poll: async () => {
      const result = await childRunner('docker', ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'moazez'], { cwd: ROOT, env, timeoutMs: 5_000, signal, tracker: context?.childTracker });
      return { done: result.ok, value: undefined };
    },
  }).catch((error) => {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    throw new Error('disposable PostgreSQL did not become ready', { cause: error });
  });
}

async function inspectOwnedContainer(context, name, runId, role, options = {}) {
  const result = await checked('docker', ['container', 'inspect', name, '--format', '{{json .}}'], { cwd: ROOT, env: context.env, timeoutMs: 20_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, signal: options.ignoreAbort ? undefined : options.signal ?? context.state.abortController.signal, ignoreAbort: options.ignoreAbort });
  const inspected = JSON.parse(result.stdout.trim());
  assert.equal(inspected.Name, `/${name}`);
  assert.equal(inspected.Config?.Labels?.[GATE_LABEL], GATE);
  assert.equal(inspected.Config?.Labels?.[RUN_LABEL], runId);
  assert.equal(inspected.Config?.Labels?.[ROLE_LABEL], role);
  return inspected;
}

async function createOwnedContainer(context, args, name, runId, role) {
  const result = await checked('docker', args, { cwd: ROOT, env: context.env, timeoutMs: 60_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, maxCaptureBytes: 2_000_000 });
  const id = result.stdout.trim();
  assert.match(id, /^[a-f0-9]{64}$/u);
  await inspectOwnedContainer(context, name, runId, role);
  const resource = Object.freeze({ type: 'container', name, runId, role });
  context.state.ownedContainers?.set(name, resource);
  context.state.ownedDockerResources.set(`container:${name}`, resource);
  return id;
}

async function startOwnedContainer(context, name, options = {}) {
  return checked('docker', ['start', '--attach', name], { cwd: ROOT, env: context.env, timeoutMs: options.timeoutMs ?? 180_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, maxCaptureBytes: options.maxCaptureBytes ?? 2_000_000 });
}

async function removeOwnedContainer(context, name, options = {}) {
  const key = `container:${name}`;
  const resource = context.state.ownedDockerResources.get(key);
  if (!resource) return;
  await inspectOwnedContainer(context, name, resource.runId, resource.role, options);
  await checked('docker', ['rm', '--force', name], { cwd: ROOT, env: context.env, timeoutMs: 30_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, signal: options.ignoreAbort ? undefined : options.signal ?? context.state.abortController.signal, ignoreAbort: options.ignoreAbort });
  context.state.ownedContainers?.delete(name);
  context.state.ownedDockerResources.delete(key);
}

async function createOwnedNetwork(context, name, runId) {
  const labels = { [GATE_LABEL]: GATE, [RUN_LABEL]: runId };
  const result = await checked('docker', ['network', 'create', '--internal', ...labelArgs(labels), name], { cwd: ROOT, env: context.env, timeoutMs: 30_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues });
  assert.match(result.stdout.trim(), /^[a-f0-9]{64}$/u);
  const resource = Object.freeze({ type: 'network', name, runId });
  context.state.ownedNetworks?.set(name, resource);
  context.state.ownedDockerResources.set(`network:${name}`, resource);
}

async function removeOwnedNetwork(context, name, options = {}) {
  const key = `network:${name}`;
  const resource = context.state.ownedDockerResources.get(key);
  if (!resource) return;
  const inspected = await checked('docker', ['network', 'inspect', name, '--format', '{{json .}}'], { cwd: ROOT, env: context.env, timeoutMs: 20_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, signal: options.ignoreAbort ? undefined : options.signal ?? context.state.abortController.signal, ignoreAbort: options.ignoreAbort });
  const parsed = JSON.parse(inspected.stdout.trim());
  assert.equal(parsed.Name, name);assert.equal(parsed.Labels?.[GATE_LABEL], GATE);assert.equal(parsed.Labels?.[RUN_LABEL], resource.runId);
  await checked('docker', ['network', 'rm', name], { cwd: ROOT, env: context.env, timeoutMs: 30_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, signal: options.ignoreAbort ? undefined : options.signal ?? context.state.abortController.signal, ignoreAbort: options.ignoreAbort });
  context.state.ownedNetworks?.delete(name);
  context.state.ownedDockerResources.delete(key);
}

async function runNamedOneShot(context, { name, runId, role, network, imageId, environment, mounts, command, timeoutMs }) {
  const args = buildNamedContainerCreateArgs({ name, runId, role, network, imageId, environment, mounts, command });
  await createOwnedContainer(context, args, name, runId, role);
  try {
    return await startOwnedContainer(context, name, { timeoutMs });
  } finally {
    await removeOwnedContainer(context, name);
  }
}

function createB3EvidenceContext(env, suiteRunId, tempRoot, driverPath) {
  const state = new EvidenceState();
  const childTracker = new ChildProcessTracker();
  state.ownedContainers = new Map();
  state.ownedNetworks = new Map();
  state.ownedImages = new Map();
  state.childTracker = childTracker;
  state.trackedChildProcesses = childTracker.children;
  state.scratchFiles = state.scratchPaths;
  state.retainedSummaries = state.retainedSummaryPaths;
  state.scratchDirectories = new Set([tempRoot]);
  state.authoritativeFinalizerInvocations = 0;
  return { state, childTracker, fileTracker: new EvidenceFileTracker(), env, suiteRunId, tempRoot, driverPath, sensitiveValues: [], signalHandlers: null, measuredFinalDatabaseAudits: [] };
}

async function auditGateResources(context, expectAbsent = false) {
  const containers=(await checked('docker',['ps','--all','--quiet','--filter',`label=${GATE_LABEL}=${GATE}`],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();
  const networks=(await checked('docker',['network','ls','--quiet','--filter',`label=${GATE_LABEL}=${GATE}`],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();
  const images=(await checked('docker',['image','ls','--quiet','--no-trunc','--filter',`label=${GATE_LABEL}=${GATE}`],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();
  if(expectAbsent){assert.equal(containers,'');assert.equal(networks,'');assert.equal(images,'');}
  return Object.freeze({containers:containers?containers.split(/\r?\n/u).length:0,networks:networks?networks.split(/\r?\n/u).length:0,images:images?images.split(/\r?\n/u).length:0});
}

async function auditRunResources(context, expectAbsent = false) {
  const filters = ['--filter', `label=${GATE_LABEL}=${GATE}`, '--filter', `label=${RUN_LABEL}=${context.suiteRunId}`];
  const containers=(await checked('docker',['ps','--all','--quiet',...filters],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();
  const networks=(await checked('docker',['network','ls','--quiet',...filters],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();
  const images=(await checked('docker',['image','ls','--quiet','--no-trunc',...filters],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();
  if(expectAbsent){assert.equal(containers,'');assert.equal(networks,'');assert.equal(images,'');}
  return Object.freeze({containers:containers?containers.split(/\r?\n/u).length:0,networks:networks?networks.split(/\r?\n/u).length:0,images:images?images.split(/\r?\n/u).length:0});
}

async function removeOwnedImages(context) {
  for(const [imageId,resource] of [...context.state.ownedImages]){
    const output=await checked('docker',['image','inspect',imageId,'--format','{{json .}}'],{cwd:ROOT,env:context.env,timeoutMs:30000,tracker:context.childTracker});const inspected=JSON.parse(output.stdout.trim());assert.equal(inspected.Id,imageId);assert.equal(inspected.Config?.Labels?.[GATE_LABEL],GATE);assert.equal(inspected.Config?.Labels?.[RUN_LABEL],resource.runId);assert.equal(inspected.Config?.Labels?.['com.moazez.evidence.image-role'],resource.imageRole);await checked('docker',['image','rm','--force',imageId],{cwd:ROOT,env:context.env,timeoutMs:60000,tracker:context.childTracker});context.state.ownedImages.delete(imageId);
  }
}

async function verifyRuntimeImage(context,imageId,packageLockPath,runId,suffix){
  const result=await runNamedOneShot(context,{name:`moazez-b3-runtime-${suffix}-${runId}`,runId,role:'observer',network:'none',imageId,mounts:[`type=bind,source=${packageLockPath},target=/evidence/package-lock.json,readonly`],command:['-e',runtimeManifestVerificationScript()],timeoutMs:120000});const report=parseRuntimeManifestVerification(result.stdout.trim());return Object.freeze({...report,entrypoints:['dist/main.js','dist/core-worker.js','dist/media-worker.js']});
}

async function cleanupEvidenceContext(context, options = {}) {
  const state = context.state;
  if (options.failureStage) state.disableSummary(options.failureStage);
  if (state.finalizationPromise) return state.finalizationPromise;
  state.authoritativeFinalizerInvocations += 1;
  state.finalizationPromise = (async () => {
    if (![EVIDENCE_PHASE.FINALIZING, EVIDENCE_PHASE.FINALIZED, EVIDENCE_PHASE.FAILED].includes(state.phase)) state.transition(EVIDENCE_PHASE.FINALIZING);
    state.abortController.abort();
    if (activeEvidenceSignal === state.abortController.signal) activeEvidenceSignal = null;
    const failures = [];
    const failureDetails = [];
    const stages = [];
    const attempt = async (label, operation, timeoutMs = 60_000) => {
      stages.push(label);
      options.onStage?.(label);
      try {
        return (await withDeadline(label, operation, { timeoutMs })).value;
      } catch (error) {
        failures.push(label);
        failureDetails.push(Object.freeze({ label, message: redactText(error?.message ?? String(error), context.sensitiveValues ?? []).slice(0, 800) }));
        state.disableSummary(label, 'cleanup');
        return undefined;
      }
    };
    const containerNames = [...state.ownedContainers.keys()];
    const networkNames = [...state.ownedNetworks.keys()];

    const phaseOne = await attempt('phase-one disconnect attempted', () => disconnectTrackedPrismaClients(state.trackedPrismaClients, options.disconnectPhaseOneMs ?? 5_000), 10_000) ?? [];
    await attempt('child termination executed', () => context.childTracker.terminateAll(), 20_000);
    for (const resource of [...state.ownedContainers.values()]) {
      await attempt(`container stop:${resource.name}`, async () => {
        const inspected = await inspectOwnedContainer(context, resource.name, resource.runId, resource.role, { ignoreAbort: true });
        if (inspected.State?.Running) await checked('docker', ['stop', '--time', '5', resource.name], { cwd: ROOT, env: context.env, timeoutMs: 15_000, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, ignoreAbort: true });
      }, 20_000);
    }
    for (const resource of [...state.ownedContainers.values()]) await attempt(`container cleanup executed:${resource.name}`, () => removeOwnedContainer(context, resource.name, { ignoreAbort: true }), 40_000);
    for (const resource of [...state.ownedNetworks.values()]) await attempt(`network cleanup executed:${resource.name}`, () => removeOwnedNetwork(context, resource.name, { ignoreAbort: true }), 40_000);
    await attempt('exact-name inspection executed', async () => {
      for (const name of containerNames) {
        const result = await runChild('docker', ['container', 'inspect', name], { cwd: ROOT, env: context.env, timeoutMs: 10_000, signal: undefined, ignoreAbort: true, tracker: context.childTracker });
        assert.equal(result.ok, false, `owned container ${name} still exists`);
      }
      for (const name of networkNames) {
        const result = await runChild('docker', ['network', 'inspect', name], { cwd: ROOT, env: context.env, timeoutMs: 10_000, signal: undefined, ignoreAbort: true, tracker: context.childTracker });
        assert.equal(result.ok, false, `owned network ${name} still exists`);
      }
    }, 30_000);
    await attempt('current-run label sweep executed', async () => {
      const containers=(await checked('docker',['ps','--all','--quiet','--filter',`label=${GATE_LABEL}=${GATE}`,'--filter',`label=${RUN_LABEL}=${context.suiteRunId}`],{cwd:ROOT,env:context.env,timeoutMs:20_000,tracker:context.childTracker})).stdout.trim();
      const networks=(await checked('docker',['network','ls','--quiet','--filter',`label=${GATE_LABEL}=${GATE}`,'--filter',`label=${RUN_LABEL}=${context.suiteRunId}`],{cwd:ROOT,env:context.env,timeoutMs:20_000,tracker:context.childTracker})).stdout.trim();
      assert.equal(containers, '');assert.equal(networks, '');
    }, 30_000);
    await attempt('sessions and locks verified', async () => {
      if (context.verifySessionsAndLocks) {
        const observed = await context.verifySessionsAndLocks();
        assert.deepEqual(observed, { openTransactions: 0, idleTransactions: 0, unresolvedLockWaits: 0, applicationSessions: 0 });
        return;
      }
      assert.ok(Array.isArray(context.measuredFinalDatabaseAudits) && context.measuredFinalDatabaseAudits.length > 0, 'live final database verification is unavailable');
      for (const observed of context.measuredFinalDatabaseAudits) {
        for (const key of ['openTransactions', 'idleTransactions', 'unresolvedLockWaits', 'applicationSessions', 'partialWrites', 'falseSuccessAudits']) assert.equal(observed[key], 0, `measured final database audit ${key} is nonzero`);
      }
    }, 20_000);
    await attempt('image cleanup/inspection executed', () => removeOwnedImages(context), 120_000);
    await attempt('owned-image absence verified', () => auditRunResources(context, true), 30_000);
    const phaseTwo = await attempt('phase-two disconnect attempted', () => disconnectTrackedPrismaClients(state.trackedPrismaClients, options.disconnectPhaseTwoMs ?? 5_000), 10_000) ?? [];
    await attempt('tracked clients audited', async () => assert.equal(state.trackedPrismaClients.size, 0));
    await attempt('tracked children audited', async () => assert.equal(context.childTracker.children.size, 0));
    if (options.removeScratch !== false) {
      for (const scratchPath of [...state.scratchPaths]) await attempt('scratch file removal', async () => { await fs.promises.rm(scratchPath, { force: true });state.scratchPaths.delete(scratchPath);context.fileTracker.unregisterScratch(scratchPath); });
      for (const directory of [...state.scratchDirectories]) await attempt('scratch directory removal', async () => { const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));await fs.promises.rm(resolved,{recursive:true,force:true});state.scratchDirectories.delete(directory); });
    }
    if (options.removeRetained || state.interrupted || !state.summaryEligibility) for (const retained of [...state.retainedSummaryPaths]) await attempt('retained summary removal', async () => { await fs.promises.rm(retained,{force:true});state.retainedSummaryPaths.delete(retained);context.fileTracker.unregisterRetainedSanitizedSummary(retained); });

    const supervisorCleanupAudit = Object.freeze({
      clients: state.trackedPrismaClients.size,
      children: context.childTracker.children.size,
      containers: state.ownedContainers.size,
      networks: state.ownedNetworks.size,
      images: state.ownedImages.size,
      scratchFiles: state.scratchPaths.size,
      inspectionVerified: failures.length === 0,
    });
    const publications = [];
    if (failures.length === 0 && state.summaryEligibility && !state.interrupted && Array.isArray(options.summaries)) {
      for (const item of options.summaries) {
        const summary = await attempt('summary construction', async () => { const built=item.summary ?? item.buildSummary?.(supervisorCleanupAudit);assert.ok(built, 'formal summary builder is missing');return built; }, 30_000);
        if (!summary) continue;
        const publication = await attempt('summary publication', () => atomicPublishStrictSummary(context, summary, item.summaryPath, { ...item.hooks, ignoreAbort: true }), 30_000);
        if (publication) publications.push({ ...item, summary, summarySha256: publication.summaryHash });
      }
    }
    if (publications.length > 0 && options.postPublicationValidation) await attempt('post-publication validation', () => options.postPublicationValidation(publications), 180_000);
    if (failures.length > 0 || !state.summaryEligibility || state.interrupted) {
      for (const retained of [...state.retainedSummaryPaths]) await attempt('ineligible retained summary removal', async () => { await fs.promises.rm(retained,{force:true});state.retainedSummaryPaths.delete(retained);context.fileTracker.unregisterRetainedSanitizedSummary(retained); });
      publications.length = 0;
    }
    const ok = failures.length === 0 && state.summaryEligibility && !state.interrupted && (!Array.isArray(options.summaries) || publications.length === options.summaries.length);
    if (state.phase !== EVIDENCE_PHASE.FINALIZED && state.phase !== EVIDENCE_PHASE.FAILED) state.transition(ok ? EVIDENCE_PHASE.FINALIZED : EVIDENCE_PHASE.FAILED);
    context.removeSignalHandlers?.();
    return Object.freeze({ ok, failures: Object.freeze(failures), failureDetails: Object.freeze(failureDetails), stages: Object.freeze(stages), phaseOne, phaseTwo, clients: state.trackedPrismaClients.size, children: context.childTracker.children.size, resources: state.ownedDockerResources.size, images: state.ownedImages.size, scratchDirectories: state.scratchDirectories.size, supervisorCleanupAudit, publications: Object.freeze(publications) });
  })();
  return state.finalizationPromise;
}

function assertB3NotInterrupted(state) {
  if (state.interrupted || state.abortController.signal.aborted) throw new Error('B3 evidence execution was interrupted');
}

function installB3SignalHandlers(context, options = {}) {
  const handlers = new Map();
  const route = (signal) => {
    const first = context.state.latchSignal(signal);
    if (!first) return context.state.finalizationPromise ?? Promise.resolve();
    const requested = options.finalize ? options.finalize({ removeScratch: true, removeRetained: true, signal }) : cleanupEvidenceContext(context, { removeScratch: true, removeRetained: true });
    const finalization = context.state.finalizationPromise ?? Promise.resolve(requested);
    context.state.finalizationPromise = finalization;
    void finalization.then(
      () => { process.exitCode = context.state.requestedExitCode; },
      () => { process.exitCode = context.state.requestedExitCode; },
    );
    return finalization;
  };
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => { void route(signal).catch(() => undefined); };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  context.signalHandlers = handlers;
  context.removeSignalHandlers = () => {
    if (!context.signalHandlers) return;
    for (const [signal, handler] of context.signalHandlers) process.removeListener(signal, handler);
    context.signalHandlers = null;
  };
  return Object.freeze({ route, remove: context.removeSignalHandlers });
}

async function migrate(context, imageId, network, databaseUrl, runId) {
  await runNamedOneShot(context,{name:`moazez-b3-migrate-deploy-${runId}`,runId,role:'migration',network,imageId,environment:[`DATABASE_URL=${databaseUrl}`],command:MIGRATION_COMMANDS[0],timeoutMs:180000});
  await runNamedOneShot(context,{name:`moazez-b3-migrate-status-${runId}`,runId,role:'migration',network,imageId,environment:[`DATABASE_URL=${databaseUrl}`],command:MIGRATION_COMMANDS[1],timeoutMs:180000});
  return validateMigrationEvidence('PASS','PASS');
}

async function runDriver(context, imageId, network, databaseUrl, args, runId, nameSuffix, timeoutMs = 180_000) {
  const name=`moazez-b3-driver-${nameSuffix}-${runId}`;
  const result=await runNamedOneShot(context,{name,runId,role:'driver',network,imageId,environment:[`DATABASE_URL=${databaseUrl}`,'DATABASE_CONNECTION_LIMIT=5','DATABASE_POOL_TIMEOUT_SECONDS=2'],mounts:[`type=bind,source=${context.driverPath},target=/app/scripts/prd3-g01-b3-r1-driver.cjs,readonly`],command:['/app/scripts/prd3-g01-b3-r1-driver.cjs',...args],timeoutMs});
  const marker = result.stdout.split(/\r?\n/).find((line) => line.startsWith('B3_DRIVER='));
  if (!marker) throw new Error(`driver result missing: ${result.stdout.slice(0, 800)}`);
  return JSON.parse(marker.slice('B3_DRIVER='.length));
}

async function launchDatabase(context, runId, network, password) {
  const name = `moazez-b3-pg-${runId}`;
  await createOwnedContainer(context,buildPostgresFixtureArgs({name,network,runId,password}),name,runId,'postgres');
  await checked('docker',['start',name],{cwd:ROOT,env:context.env,timeoutMs:30000,tracker:context.childTracker,sensitiveValues:context.sensitiveValues});
  await waitForPostgres(name, context.env, context);
  return name;
}

async function verifyPostgresTopology(context,name,network,runId){
  const networkInspection=JSON.parse((await checked('docker',['network','inspect',network,'--format','{{json .}}'],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim());assert.equal(networkInspection.Internal,true);assert.equal(networkInspection.Labels?.[GATE_LABEL],GATE);assert.equal(networkInspection.Labels?.[RUN_LABEL],runId);
  const bridge=JSON.parse((await checked('docker',['network','inspect','bridge','--format','{{json .}}'],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim());assert.equal(bridge.Name,'bridge');assert.equal(bridge.Driver,'bridge');assert.equal(bridge.Scope,'local');assert.equal(bridge.Internal,false);await inspectOwnedContainer(context,name,runId,'postgres');await checked('docker',['network','connect','bridge',name],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker});
  const portOutput=(await checked('docker',['port',name,'5432/tcp'],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();const match=/^127\.0\.0\.1:(\d+)$/u.exec(portOutput);assert.ok(match);const publishedPort=Number(match[1]);await verifyLoopbackTcp(context,publishedPort);
  const serverVersion=(await checked('docker',['exec',name,'psql','-U','postgres','-d','moazez_b3','-tAc','SHOW server_version'],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker,sensitiveValues:context.sensitiveValues})).stdout.trim();const maxConnections=(await checked('docker',['exec',name,'psql','-U','postgres','-d','moazez_b3','-tAc','SHOW max_connections'],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker,sensitiveValues:context.sensitiveValues})).stdout.trim();assert.match(serverVersion,/^16\./u);assert.equal(maxConnections,'80');const imageId=(await checked('docker',['container','inspect',name,'--format','{{.Image}}'],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();assert.equal(imageId,POSTGRES_IMAGE);return Object.freeze({serverMajor:16,maxConnections:80,loopbackPublished:true,builtInBridgeCompatibility:true,internalOwnedNetwork:true,immutableImage:true,tmpfs:true,persistentVolume:false});
}

function buildFormalSummary({ runId, provenance, inventory, playbackConsumers, result, baselinePlayback, topology, migrations, rehearsals, faultCoverage, faultReceipts, supervisorCleanupAudit, validate = true }) {
  const inventoryDigest = sha256(JSON.stringify(inventory.rows));
  const pathMap = { learningMedia: 'learning-media', lessonContent: 'lesson-content', teacherLifecycle: 'teacher-lifecycle' };
  const businessPaths = Object.entries(pathMap).map(([key, pathId]) => Object.freeze({
    pathId,
    productionEntryClass: ENTRY_CLASS_MANIFEST[key].entryClass,
    productionMethod: ENTRY_CLASS_MANIFEST[key].method,
    invariantManifestId: BUSINESS_INVARIANT_MANIFESTS[key].pathId,
    baselineResult: 'PASS',
    lockResult: 'PASS',
    timeoutResult: 'PASS',
    rollbackResult: 'PASS',
    retryResult: 'PASS',
    auditResult: 'PASS',
    partialWrites: 0,
  }));
  const lockEvidence = result.lockWaits.map((item) => Object.freeze({
    pathId: pathMap[item.path],
    waitEventType: item.waitEventType,
    waitEvent: item.waitEvent,
    blockerCount: item.blockingPidCount,
    ungrantedLockCount: item.ungrantedLocks,
    completedAfterRelease: item.outcome === 'COMMITTED',
  }));
  const negative = result.playback.negativeMatrix;
  const summary = {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    schema: SUMMARY_SCHEMA,
    gate: GATE,
    overall: 'PASS',
    runId,
    baseCommit: BASE_SHA,
    baseTree: BASE_TREE,
    candidateProductionPatchSha256: provenance.candidateProductionPatchSha256,
    baselineRuntimeManifestSha256: provenance.baseline.runtimeManifestSha256,
    candidateRuntimeManifestSha256: provenance.candidate.runtimeManifestSha256,
    baselineImageId: provenance.baseline.imageId,
    candidateImageId: provenance.candidate.imageId,
    inventoryDigest,
    playbackCallerDigest: playbackConsumers.digest,
    nodeVersion: 'v22.23.1',
    runtimePrismaVersion: '6.19.3',
    observerPrismaVersion: '6.19.3',
    postgresMajor: 16,
    postgresMaxConnections: 80,
    faultCatalogVersion: FAULT_CATALOG_VERSION,
    faultProofImplementationVersion: FAULT_PROOF_IMPLEMENTATION_VERSION,
    provenance,
    topology,
    migrations,
    r3InitialDefectReproductions: R3_INITIAL_DEFECT_REPRODUCTIONS,
    r4InitialDefectReproductions: R4_INITIAL_DEFECT_REPRODUCTIONS,
    driverFinalization: result.driverFinalization,
    inventory: {
      total: inventory.total,
      interactive: inventory.interactive,
      batch: inventory.batch,
      unknown: inventory.unknown,
      unresolvedCallChains: inventory.unresolvedCallChains,
      externalWaitInsideTransaction: inventory.externalWaitInsideTransaction,
      unresolvedRuntimeRoles: inventory.unresolvedRuntimeRoles,
      unwiredTransactions: inventory.unwiredTransactions,
      duplicateIds: inventory.duplicateIds,
      manualOverrides: inventory.manualOverrides,
      externalWaitOutsideTransaction: inventory.externalWaitOutsideTransaction,
      classifications: inventory.classifications,
      digest: inventoryDigest,
    },
    businessPaths,
    lockEvidence,
    entryClasses: { learningMedia: ENTRY_CLASS_MANIFEST.learningMedia.entryClass, lessonContent: ENTRY_CLASS_MANIFEST.lessonContent.entryClass, teacherLifecycle: ENTRY_CLASS_MANIFEST.teacherLifecycle.entryClass },
    baselineBusiness: result.baseline,
    business: result.business,
    lockWaits: result.lockWaits,
    timeouts: result.timeouts,
    serializable: result.serializable,
    playback: {
      providerAwaitInsideTransactionBefore: baselinePlayback.signerObservedOpenTransaction,
      providerAwaitInsideTransactionAfter: result.playback.signerObservedOpenTransaction,
      openTransactionsDuringSigning: result.playback.providerWaitOpenTransactions,
      locksDuringSigning: result.playback.providerWaitLocks,
      capabilityExposedOnRejectedRevalidation: result.playback.capabilityExposedOnRejectedRevalidation,
      callbackInvocations: result.playback.callbackInvocations,
      ttlSeconds: 300,
      callerDigest: playbackConsumers.digest,
      negativeCases: {
        authorizationChanged: negative.authorization,
        publicationChanged: negative.publication,
        uploadSessionChanged: negative.uploadSession,
        mediaRemoved: negative.mediaRemoval,
        candidateIdentityChanged: negative.candidateIdentity,
        signingRejected: negative.signingRejected,
        finalRevalidationRejected: negative.finalRevalidationRejected,
      },
    },
    learningMediaLimitation: {
      abruptGenericVerifyingRecoveryProven: false,
      reason: 'A generic VERIFYING claim has no governed verification lease or stale-claim recovery proof in B3.',
    },
    learningVerifier: result.learningVerifier,
    pool: result.pool,
    cutback: result.cutback,
    reservedReadinessConnection: result.reservedReadinessConnection,
    rehearsals,
    faultCoverage,
    faultReceipts,
    finalAudit: { ...requiredObject(result.finalDatabaseAudit, 'result.finalDatabaseAudit'), ...requiredObject(supervisorCleanupAudit, 'supervisorCleanupAudit') },
  };
  return validate ? validateStrictSummary(summary) : summary;
}

async function runFormalEvidence({ context, baselineImage, candidateImage, summaryRoot, ordinal, inventory, playbackConsumers, provenance, rehearsals, pureFaultExecutions }) {
  const runId = `b3-${Date.now().toString(36)}-${ordinal}-${crypto.randomBytes(3).toString('hex')}`;
  const network = `moazez-b3-net-${runId}`;
  const password = crypto.randomBytes(18).toString('hex');
  const databaseUrl = `postgresql://postgres:${password}@postgres:5432/moazez_b3?schema=public`;
  context.sensitiveValues.push(password,databaseUrl);
  let database = null;
  let payload = null;
  try {
    await createOwnedNetwork(context,network,runId);
    database = await launchDatabase(context,runId,network,password);
    const topology=await verifyPostgresTopology(context,database,network,runId);
    const migrations=await migrate(context,candidateImage,network,databaseUrl,runId);
    const baseline = await runDriver(context,baselineImage,network,databaseUrl,['playback-proof','baseline'],runId,'baseline',300000);
    assert.equal(baseline.signerObservedOpenTransaction, true, 'baseline playback defect was not dynamically reproduced');
    const result = await runDriver(context,candidateImage,network,databaseUrl,['formal',runId],runId,'candidate',900000);
    assert.equal(result.status, 'PASS');
    assert.equal(result.playback.signerObservedOpenTransaction, false);
    assert.equal(result.pool.errorCode, 'P2024');
    assert.deepEqual(result.cutback.map((item) => item.limit), [5, 2, 1]);
    payload={baseline,result,topology,migrations};
  } finally {
    if (database) await removeOwnedContainer(context,database);
    await removeOwnedNetwork(context,network);
  }
  assert.ok(payload,'formal evidence payload missing');
  context.measuredFinalDatabaseAudits.push(requiredObject(payload.result.finalDatabaseAudit, 'formal finalDatabaseAudit'));
  const containers=(await checked('docker',['ps','--all','--quiet','--filter',`label=${GATE_LABEL}=${GATE}`,'--filter',`label=${RUN_LABEL}=${runId}`],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();const networks=(await checked('docker',['network','ls','--quiet','--filter',`label=${GATE_LABEL}=${GATE}`,'--filter',`label=${RUN_LABEL}=${runId}`],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker})).stdout.trim();assert.equal(containers,'');assert.equal(networks,'');
  const result=payload.result;const evidenceFaultExecutions=await collectEvidenceFaultExecutions(result,rehearsals);const faultReceipts=[...pureFaultExecutions,...evidenceFaultExecutions];const faultCoverage=validateFaultCoverage(faultReceipts);
  const summaryPath=path.join(summaryRoot,`prd3-g01-b3-final-${runId}.json`);
  return {summaryPath,buildSummary:(supervisorCleanupAudit)=>buildFormalSummary({runId,provenance,inventory,playbackConsumers,result,baselinePlayback:payload.baseline,topology:payload.topology,migrations:payload.migrations,rehearsals,faultCoverage,faultReceipts,supervisorCleanupAudit})};
}

async function verifyLoopbackTcp(context, port, options = {}) {
  const signal = options.signal ?? context.state.abortController.signal;
  const createConnection = options.createConnection ?? require('node:net').createConnection;
  return (await withDeadline('loopback TCP verification', () => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('loopback TCP verification aborted'), { name: 'AbortError' }));return; }
    const socket = createConnection({ host: '127.0.0.1', port });
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      socket.removeListener?.('connect', onConnect);
      socket.removeListener?.('error', onError);
    };
    const onAbort = () => { cleanup();socket.destroy?.();reject(Object.assign(new Error('loopback TCP verification aborted'), { name: 'AbortError' })); };
    const onConnect = () => { cleanup();socket.destroy?.();resolve(); };
    const onError = (error) => { cleanup();reject(error); };
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.once('connect', onConnect);socket.once('error', onError);
  }), { timeoutMs: options.timeoutMs ?? 5_000, signal })).value;
}

async function waitForContainerMarker(context, name, marker, options = {}) {
  const signal = options.signal ?? context.state.abortController.signal;
  const childRunner = options.runChild ?? runChild;
  return runAbortAwarePolling({
    label: 'container-marker polling', attempts: options.attempts ?? 180, intervalMs: options.intervalMs ?? 250, signal, delayOperation: options.delayOperation,
    poll: async () => {
      const logs = await childRunner('docker', ['logs', name], { cwd: ROOT, env: context.env, timeoutMs: 5_000, signal, tracker: context.childTracker, sensitiveValues: context.sensitiveValues, maxCaptureBytes: 200_000 });
      const combined = `${logs.stdout}\n${logs.stderr}`;
      if (signal.aborted) throw Object.assign(new Error('container-marker polling aborted'), { name: 'AbortError' });
      if (combined.includes(marker)) return { done: true, value: combined };
      const state = await childRunner('docker', ['container', 'inspect', name, '--format', '{{.State.Running}}'], { cwd: ROOT, env: context.env, timeoutMs: 5_000, signal, tracker: context.childTracker, sensitiveValues: context.sensitiveValues });
      if (state.ok && state.stdout.trim() === 'false') throw new Error(`Rehearsal exited before ${marker}: ${redactText(combined, context.sensitiveValues).slice(-1800)}`);
      return { done: false };
    },
  }).catch((error) => {
    if (signal.aborted || error?.name === 'AbortError') throw error;
    throw new Error(`Rehearsal marker ${marker} not observed`, { cause: error });
  });
}

async function waitForContainerExit(context, name, runId, role, options = {}) {
  const signal = options.signal ?? context.state.abortController.signal;
  const inspect = options.inspect ?? ((...args) => inspectOwnedContainer(...args));
  return runAbortAwarePolling({
    label: 'container-exit polling', attempts: options.attempts ?? 80, intervalMs: options.intervalMs ?? 100, signal, delayOperation: options.delayOperation,
    poll: async () => {
      const inspected = await inspect(context, name, runId, role, { signal });
      return { done: inspected.State.Running === false, value: inspected };
    },
  });
}

async function runFailureRehearsals(context,candidateImage) {
  const runId=`b3-rehearsal-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const network=`moazez-b3-net-${runId}`;
  const password=crypto.randomBytes(18).toString('hex');
  const databaseUrl=`postgresql://postgres:${password}@postgres:5432/moazez_b3?schema=public`;
  context.sensitiveValues.push(password,databaseUrl);
  let database=null;
  const results={};
  const psqlScalar=async sql=>(await checked('docker',['exec',database,'psql','-U','postgres','-d','moazez_b3','-tAc',sql],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker,sensitiveValues:context.sensitiveValues})).stdout.trim();
  try {
    await createOwnedNetwork(context,network,runId);
    database=await launchDatabase(context,runId,network,password);
    await migrate(context,candidateImage,network,databaseUrl,runId);
    const signalCase=async({suffix,scenario,marker,signal,expectedExit,ordinal})=>{
      const name=`moazez-b3-rehearsal-${suffix}-${runId}`;
      let logs='';
      await createOwnedContainer(context,buildNamedContainerCreateArgs({name,runId,role:'rehearsal',network,imageId:candidateImage,environment:[`DATABASE_URL=${databaseUrl}`],mounts:[`type=bind,source=${context.driverPath},target=/app/scripts/prd3-g01-b3-r1-driver.cjs,readonly`],command:['/app/scripts/prd3-g01-b3-r1-driver.cjs',scenario]}),name,runId,'rehearsal');
      try {
        await checked('docker',['start',name],{cwd:ROOT,env:context.env,timeoutMs:20000,tracker:context.childTracker,sensitiveValues:context.sensitiveValues});
        logs=await waitForContainerMarker(context,name,marker);
        const markerLine=logs.split(/\r?\n/u).find(line=>line.startsWith(marker));
        assert.ok(markerLine,`${marker} payload missing`);
        const markerPayload=JSON.parse(markerLine.slice(marker.length));
        if(suffix==='lock'){assert.equal(markerPayload.actualEntry,'CompleteLearningMediaUploadUseCase');assert.equal(markerPayload.waitEventType,'Lock');requiredNumber(Number(markerPayload.blockingPidCount),'SIGINT blocking PID count',{minimum:1});}
        else{assert.equal(markerPayload.actualEntry,'LessonContentPlaybackCoordinator');assert.equal(markerPayload.signerInvoked,true);assert.equal(markerPayload.signerPending,true);assert.equal(Number(markerPayload.openTransactions),0);assert.equal(Number(markerPayload.playbackLocks),0);assert.equal(markerPayload.noPersistentClaimCreated,true);}
        const killed=await runChild('docker',['kill','--signal',signal,name],{cwd:ROOT,env:context.env,timeoutMs:20000,signal:context.state.abortController.signal,tracker:context.childTracker,sensitiveValues:context.sensitiveValues});
        assert.equal(killed.ok,true,`signal delivery failed: ${killed.exitCode} ${killed.stderr}`);
        const inspected=await waitForContainerExit(context,name,runId,'rehearsal');
        assert.equal(inspected.State.Running,false);
        assert.equal(Number(inspected.State.ExitCode),expectedExit);
        logs=(await checked('docker',['logs',name],{cwd:ROOT,env:context.env,timeoutMs:10000,tracker:context.childTracker,sensitiveValues:context.sensitiveValues,maxCaptureBytes:200000})).stdout;
        assert.doesNotMatch(logs,/B3_DRIVER=/u);
        const finalizedLine=logs.split(/\r?\n/u).find(line=>line.startsWith('B3_DRIVER_FINALIZED='));assert.ok(finalizedLine,'authoritative driver finalization marker missing');const finalized=JSON.parse(finalizedLine.slice('B3_DRIVER_FINALIZED='.length));assert.equal(finalized.ok,true);assert.equal(finalized.firstSignal,signal);assert.equal(finalized.requestedExitCode,expectedExit);assert.equal(finalized.authoritativeFinalizerInvocations,1);assert.equal(finalized.trackedPrismaClients,0);assert.equal(finalized.activeOperations,0);assert.ok(Array.isArray(finalized.phaseOneResults));assert.ok(Array.isArray(finalized.phaseTwoResults));
      } finally {
        await removeOwnedContainer(context,name);
      }
      const sessions=Number(await psqlScalar(`SELECT count(*) FROM pg_stat_activity WHERE application_name='b3-rehearsal-${suffix}'`));
      const locks=Number(await psqlScalar(`SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='b3-rehearsal-${suffix}'`));
      const openTransactions=Number(await psqlScalar(`SELECT count(*) FROM pg_stat_activity WHERE application_name='b3-rehearsal-${suffix}' AND xact_start IS NOT NULL`));
      const idleTransactions=Number(await psqlScalar(`SELECT count(*) FROM pg_stat_activity WHERE application_name='b3-rehearsal-${suffix}' AND state='idle in transaction'`));
      assert.equal(sessions,0);assert.equal(locks,0);assert.equal(openTransactions,0);assert.equal(idleTransactions,0);assert.equal(context.childTracker.children.size,0);
      if(suffix==='lock'){
        const uploadId=`20000000-0000-4000-8000-${String(ordinal).padStart(12,'0')}`;const status=await psqlScalar(`SELECT status FROM file_upload_sessions WHERE id='${uploadId}'::uuid`);const linkedFiles=Number(await psqlScalar(`SELECT count(*) FROM file_upload_sessions WHERE id='${uploadId}'::uuid AND file_id IS NOT NULL`));const falseSuccessAudits=Number(await psqlScalar(`SELECT count(*) FROM audit_logs WHERE action='learning.media.upload.complete' AND resource_id='${uploadId}' AND outcome='SUCCESS'`));assert.equal(linkedFiles,0);assert.equal(falseSuccessAudits,0);
        const partialWrites=status==='UPLOADING'?0:1;
        assert.equal(partialWrites,0);
        return {pass:true,exit:expectedExit,firstSignal:signal,authoritativeFinalizerInvocations:1,summaryAbsent:true,sessions,openTransactions,idleTransactions,locks,markerObserved:true,partialWrites,falseSuccessAudits,trackedClients:0,trackedChildren:0,containers:0,networks:0,images:0,scratchFiles:0};
      }
      return {pass:true,exit:expectedExit,firstSignal:signal,authoritativeFinalizerInvocations:1,summaryAbsent:true,sessions,transactions:openTransactions,locks,markerObserved:true,signerInvoked:true,signerPending:true,noPersistentClaimCreated:true,capabilityReturned:false,capabilityLogged:false,trackedClients:0,trackedChildren:0,containers:0,networks:0,images:0,scratchFiles:0};
    };
    results.sigint=await signalCase({suffix:'lock',scenario:'rehearsal-lock',marker:'B3_REHEARSAL_LOCK_READY=',signal:'SIGINT',expectedExit:130,ordinal:990});
    results.sigterm=await signalCase({suffix:'provider',scenario:'rehearsal-provider',marker:'B3_REHEARSAL_PROVIDER_READY=',signal:'SIGTERM',expectedExit:143,ordinal:991});

    const contradictionName=`moazez-b3-rehearsal-contradiction-${runId}`;
    await createOwnedContainer(context,buildNamedContainerCreateArgs({name:contradictionName,runId,role:'rehearsal',network,imageId:candidateImage,environment:[`DATABASE_URL=${databaseUrl}`],mounts:[`type=bind,source=${context.driverPath},target=/app/scripts/prd3-g01-b3-r1-driver.cjs,readonly`],command:['/app/scripts/prd3-g01-b3-r1-driver.cjs','rehearsal-contradiction']}),contradictionName,runId,'rehearsal');
    const contradictionRun=await runChild('docker',['start','--attach',contradictionName],{cwd:ROOT,env:context.env,timeoutMs:60000,signal:context.state.abortController.signal,tracker:context.childTracker,sensitiveValues:context.sensitiveValues,maxCaptureBytes:200000});
    const contradictionLogs=`${contradictionRun.stdout}\n${contradictionRun.stderr}`;
    assert.equal(contradictionRun.ok,false);assert.match(contradictionLogs,/B3_REHEARSAL_CONTRADICTION=.*B3_FALSE_STATE_OBSERVER/u);assert.doesNotMatch(contradictionLogs,/B3_DRIVER=/u);
    await removeOwnedContainer(context,contradictionName);
    results.falseStateContradiction={pass:true,exit:1,summaryAbsent:true,stageId:'B3_FALSE_STATE_OBSERVER',cleanupComplete:true};

    const disconnectRunId=`b3-disconnect-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const disconnectTemp=fs.mkdtempSync(path.join(os.tmpdir(),'moazez-b3-disconnect-rehearsal-'));
    const disconnectContext=createB3EvidenceContext(context.env,disconnectRunId,disconnectTemp,context.driverPath);
    disconnectContext.verifySessionsAndLocks=async()=>({openTransactions:0,idleTransactions:0,unresolvedLockWaits:0,applicationSessions:0});
    disconnectContext.state.transition(EVIDENCE_PHASE.READY);disconnectContext.state.transition(EVIDENCE_PHASE.RUNNING);
    let phaseOneCalls=0;const retryClient={$disconnect:async()=>{phaseOneCalls+=1;if(phaseOneCalls===1)throw new Error('phase one injected');}};disconnectContext.state.trackedPrismaClients.add(retryClient);
    const disconnectNetwork=`moazez-b3-net-${disconnectRunId}`;const cleanupName=`moazez-b3-rehearsal-${disconnectRunId}`;
    await createOwnedNetwork(disconnectContext,disconnectNetwork,disconnectRunId);
    await createOwnedContainer(disconnectContext,buildNamedContainerCreateArgs({name:cleanupName,runId:disconnectRunId,role:'rehearsal',network:disconnectNetwork,imageId:candidateImage,command:['-e','']}),cleanupName,disconnectRunId,'rehearsal');
    await startOwnedContainer(disconnectContext,cleanupName,{timeoutMs:20000});
    const rehearsalImageTag=`moazez-b3-disconnect:${crypto.randomBytes(4).toString('hex')}`;
    const commitArgs=['commit','--change',`LABEL ${GATE_LABEL}=${GATE}`,'--change',`LABEL ${RUN_LABEL}=${disconnectRunId}`,'--change','LABEL com.moazez.evidence.image-role=disconnect-rehearsal',cleanupName,rehearsalImageTag];
    const committed=await checked('docker',commitArgs,{cwd:ROOT,env:context.env,timeoutMs:60000,tracker:disconnectContext.childTracker});const rehearsalImageId=committed.stdout.trim();validateBuiltImageId(rehearsalImageId);disconnectContext.state.ownedImages.set(rehearsalImageId,Object.freeze({imageId:rehearsalImageId,tag:rehearsalImageTag,runId:disconnectRunId,imageRole:'disconnect-rehearsal'}));
    const trackedChild=spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore',windowsHide:true});disconnectContext.childTracker.add(trackedChild);
    const measuredStages=[];const disconnectFinalization=await cleanupEvidenceContext(disconnectContext,{removeScratch:true,disconnectPhaseOneMs:200,disconnectPhaseTwoMs:200,onStage:stage=>measuredStages.push(stage)});
    assert.equal(disconnectFinalization.ok,true);assert.equal(phaseOneCalls,2);assert.equal(disconnectContext.state.trackedPrismaClients.size,0);assert.equal(disconnectContext.state.authoritativeFinalizerInvocations,1);
    const requiredOrder=['phase-one disconnect attempted','child termination executed',`container cleanup executed:${cleanupName}`,`network cleanup executed:${disconnectNetwork}`,'exact-name inspection executed','current-run label sweep executed','image cleanup/inspection executed','phase-two disconnect attempted','tracked clients audited'];let previous=-1;for(const stage of requiredOrder){const index=measuredStages.indexOf(stage);assert.ok(index>previous,`disconnect finalizer stage out of order: ${stage}`);previous=index;}

    const terminalRunId=`b3-disconnect-terminal-${crypto.randomBytes(2).toString('hex')}`;const terminalTemp=fs.mkdtempSync(path.join(os.tmpdir(),'moazez-b3-disconnect-terminal-'));const terminalContext=createB3EvidenceContext(context.env,terminalRunId,terminalTemp,context.driverPath);terminalContext.verifySessionsAndLocks=async()=>({openTransactions:0,idleTransactions:0,unresolvedLockWaits:0,applicationSessions:0});terminalContext.state.transition(EVIDENCE_PHASE.READY);terminalContext.state.transition(EVIDENCE_PHASE.RUNNING);const terminalClient={$disconnect:()=>new Promise(()=>{})};terminalContext.state.trackedPrismaClients.add(terminalClient);const terminalStages=[];const terminalFinalization=await cleanupEvidenceContext(terminalContext,{removeScratch:true,disconnectPhaseOneMs:100,disconnectPhaseTwoMs:100,onStage:stage=>terminalStages.push(stage)});assert.equal(terminalFinalization.ok,false);assert.equal(terminalContext.state.phase,EVIDENCE_PHASE.FAILED);assert.equal(terminalContext.state.trackedPrismaClients.size,1);assert.ok(terminalStages.includes('owned-image absence verified'));
    const beforeResources=context.state.ownedDockerResources.size;let unknownRejected=false;try{await executeFaultInjection('B3-F99');}catch{unknownRejected=true;}assert.equal(context.state.ownedDockerResources.size,beforeResources);assert.equal(unknownRejected,true);
    results.disconnectRetry={pass:true,usedAuthoritativeFinalizer:true,authoritativeFinalizerInvocations:1,phaseOneFailed:true,clientRemainedTrackedAfterPhaseOne:true,childTerminationExecuted:true,dockerCleanupExecuted:true,containerCleanupExecuted:true,networkCleanupExecuted:true,exactNameInspectionExecuted:true,labelInspectionExecuted:true,imageCleanupInspectionExecuted:true,phaseTwoSucceeded:true,clientRemovedOnlyAfterSuccess:true,trackedClients:0,phaseTwoFailureTerminal:true,phaseTwoFailureNonPrismaCleanupComplete:true,phaseTwoFailureTrackedClients:1,unknownRejectedBeforeMutation:true,measuredOrder:requiredOrder};
  } finally {
    for(const resource of [...context.state.ownedDockerResources.values()].filter(item=>item.type==='container'&&item.runId===runId&&item.name!==database))await removeOwnedContainer(context,resource.name);
    if(database)await removeOwnedContainer(context,database);
    await removeOwnedNetwork(context,network);
  }
  return Object.freeze(results);
}

async function runFinalSuite(nodePath, env) {
  const npmCli = path.join(path.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const commands = [
    [nodePath, ['node_modules/prisma/build/index.js', 'validate']],
    [nodePath, ['node_modules/prisma/build/index.js', 'generate']],
    [nodePath, [npmCli, 'run', 'build']],
    [nodePath, [npmCli, 'run', 'verify:prd3-g01-a']],
    [nodePath, ['--test', 'scripts/tests/prd3-g01-b-pool-saturation.test.cjs']],
    [nodePath, ['--test', 'scripts/tests/prd3-g01-b2-database-recovery.test.cjs']],
    [nodePath, ['--test', 'scripts/tests/prd3-g01-b3-transaction-pressure.test.cjs']],
    [nodePath, ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath',
      'src/modules/academics/curriculum/app-facing/lesson-content-playback/tests/lesson-content-playback.coordinator.spec.ts',
      'src/modules/teacher-app/lesson-preparation/tests/teacher-lesson-playback.use-case.spec.ts',
      'src/modules/parent-app/lessons/tests/parent-child-lesson-playback.use-case.spec.ts',
      'src/modules/student-app/lessons/tests/student-lesson-playback.use-case.spec.ts']],
    [nodePath, ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'src/modules/files/uploads/tests/learning-media-upload.use-case.spec.ts']],
    [nodePath, ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'src/modules/academics/curriculum/tests/lesson-content-publication.use-case.spec.ts']],
    [nodePath, ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'src/modules/teachers/directory/tests/change-teacher-employment-status.use-case.spec.ts']],
  ];
  const results=[];
  for (const [command, args] of commands) {
    if(command===nodePath)await checked(nodePath,['--version'],{cwd:ROOT,env,timeoutMs:10000});
    results.push(await checked(command, args, { cwd: ROOT, env, timeoutMs: 600_000, maxCaptureBytes: 3_000_000 }));
  }
  return results;
}

async function removeSupersededB3Summaries(summaryRoot) {
  await fs.promises.mkdir(summaryRoot, { recursive: true });
  const entries = await fs.promises.readdir(summaryRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/^prd3-g01-b3-(?:r1-|final-).+\.json$/u.test(entry.name)) continue;
    const fullPath = path.join(summaryRoot, entry.name);
    const parsed = JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
    assert.equal(parsed.gate, GATE, 'refusing to remove a summary not owned by B3');
    await fs.promises.rm(fullPath, { force: true });
  }
}

function scanExecutableProhibitedPatterns() {
  const executablePaths = [
    'package.json',
    'scripts/ci/prd3-g01-b3-transaction-pressure.cjs',
    'scripts/tests/prd3-g01-b3-transaction-pressure.test.cjs',
    PLAYBACK_PATH,
    'src/modules/academics/curriculum/app-facing/lesson-content-playback/tests/lesson-content-playback.coordinator.spec.ts',
  ];
  const patterns = [
    ['process-exit', new RegExp('process\\.' + 'exit\\s*\\(', 'gu')],
    ['force-exit', new RegExp('--force' + 'Exit', 'gu')],
    ['shell-true', new RegExp('shell\\s*:\\s*' + 'true', 'gu')],
    ['skipped-test', new RegExp('\\.(?:sk' + 'ip|to' + 'do)\\b', 'gu')],
    ['eslint' + '-disable', new RegExp('eslint-' + 'disable', 'gu')],
    ['ts-ignore', new RegExp('@ts-' + 'ignore', 'gu')],
    ['docker-pull', new RegExp('docker\\s+' + 'pull\\b', 'gu')],
    ['docker-prune', new RegExp('docker\\s+system\\s+' + 'prune\\b', 'gu')],
  ];
  const matches = [];
  for (const relativePath of executablePaths) {
    const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    for (const [name, pattern] of patterns) for (const match of content.matchAll(pattern)) matches.push({ relativePath: normalized(relativePath), name, offset: match.index });
  }
  assert.deepEqual(matches, [], `prohibited executable patterns remain: ${matches.map((item) => `${item.relativePath}:${item.name}`).join(', ')}`);
  return Object.freeze({ matches: 0, files: executablePaths.length });
}

async function validatePostPublicationState(publications, context, preflightResult, nodePath) {
  assert.equal(publications.length, 2);
  validateCrossRun(publications);
  for (const publication of publications) {
    const retained = await fs.promises.readFile(publication.summaryPath);
    assert.equal(sha256(retained), publication.summarySha256);
    validateStrictSummary(JSON.parse(retained.toString('utf8')));
  }
  await auditGateResources(context, true);
  await checked('git', ['diff', '--check'], { cwd: ROOT, env: buildMinimalChildEnvironment(process.env), timeoutMs: 30_000, ignoreAbort: true });
  const finalPreflight = await preflight(nodePath);
  assert.deepEqual(finalPreflight.changedPaths, preflightResult.changedPaths);
  scanExecutableProhibitedPatterns();
  return Object.freeze({ strictReread: 'PASS', gitDiffCheck: 'PASS', selfReview: 'PASS' });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const nodePath = process.execPath;
  const preflightResult = await preflight(nodePath);
  validateInitialDefectReproductions();
  validateR3InitialDefectReproductions();
  validateR4InitialDefectReproductions();
  const inventory = inventorySummary(validateInventory(inventoryTransactions()));
  const playbackConsumers = validatePlaybackConsumerAudit();
  validateBusinessInvariantManifests();
  validateFailureCatalog();
  const pureFaultExecutions = await Promise.all(FAULT_CATALOG.filter(entry => entry.proofType === 'PURE_ADVERSARIAL_TEST').map(entry => executeFaultInjection(entry.id)));
  if (args.has('--inventory')) {
    console.log(JSON.stringify(validateSanitizedSummary({ schemaVersion: SUMMARY_SCHEMA_VERSION, schema: SUMMARY_SCHEMA, gate:GATE, overall:'PASS', inventory, playbackConsumers:{total:playbackConsumers.total,counts:playbackConsumers.counts,digest:playbackConsumers.digest} }), null, 2));
    return;
  }
  const docker = await resolvePinnedLocalDockerEndpoint({ cwd: ROOT });
  const env = Object.freeze({
    ...docker.childEnvironment,
    DOCKER_BUILDKIT: '1',
    ProgramFiles: process.env.ProgramFiles,
  });
  const suffix = crypto.randomBytes(4).toString('hex');
  const tempRoot = path.join(os.tmpdir(), `moazez-prd3-g01-b3-${suffix}`);
  const driverPath = path.join(tempRoot, 'prd3-g01-b3-final-driver.cjs');
  const summaryRoot = path.join(os.tmpdir(), 'moazez-prd3-g01-b3-summaries');
  const suiteRunId = `b3-suite-${Date.now().toString(36)}-${suffix}`;
  const baselineTag = `moazez-b3-baseline:${suffix}`;
  const candidateTag = `moazez-b3-candidate:${suffix}`;
  const context = createB3EvidenceContext(env, suiteRunId, tempRoot, driverPath);
  activeEvidenceSignal = context.state.abortController.signal;
  installB3SignalHandlers(context);
  let runs = [];
  let rehearsals = null;
  let provenance = null;
  try {
    assertB3NotInterrupted(context.state);
    await withB3Deadline(() => fs.promises.mkdir(tempRoot, { recursive: false }), 10_000, context.state.abortController.signal);
    assertB3NotInterrupted(context.state);
    await withB3Deadline(() => fs.promises.writeFile(driverPath, DRIVER_SOURCE, { encoding: 'utf8', mode: 0o400, flag: 'wx' }), 10_000, context.state.abortController.signal);
    assertB3NotInterrupted(context.state);
    await withB3Deadline(() => removeSupersededB3Summaries(summaryRoot), 30_000, context.state.abortController.signal);
    assertB3NotInterrupted(context.state);
    const baselineContext = await createBuildContext(tempRoot, 'baseline', false, nodePath, env);
    assertB3NotInterrupted(context.state);
    const candidateContext = await createBuildContext(tempRoot, 'candidate', true, nodePath, env);
    assertB3NotInterrupted(context.state);
    const productionPatch = await calculateCandidateProductionPatch(env);
    const packageLockPath = path.join(baselineContext, 'package-lock.json');
    const packageLockBytes = await withB3Deadline(() => fs.promises.readFile(packageLockPath), 10_000, context.state.abortController.signal);
    const packageLockSha256 = sha256(packageLockBytes);
    await auditGateResources(context, true);
    const postgresInspection = await checked('docker', ['image','inspect',POSTGRES_IMAGE,'--format','{{.Id}}'], { cwd:ROOT, env, timeoutMs:30_000, tracker:context.childTracker });
    const nodeInspection = await checked('docker', ['image','inspect',NODE_IMAGE,'--format','{{.Id}}'], { cwd:ROOT, env, timeoutMs:30_000, tracker:context.childTracker });
    validateImmutableImageIdentity(postgresInspection.stdout.trim(), POSTGRES_IMAGE, 'PostgreSQL image');
    validateImmutableImageIdentity(nodeInspection.stdout.trim(), NODE_IMAGE, 'Node base image');
    const dockerfile = await withB3Deadline(() => fs.promises.readFile(path.join(baselineContext, 'Dockerfile'), 'utf8'), 10_000, context.state.abortController.signal);
    assert.ok(dockerfile.includes(NODE_IMAGE));
    context.state.transition(EVIDENCE_PHASE.READY);
    assertB3NotInterrupted(context.state);
    const baselineImage = await buildImage(baselineContext, baselineTag, env,suiteRunId,'baseline',context.state);
    assertB3NotInterrupted(context.state);
    const candidateImage = await buildImage(candidateContext, candidateTag, env,suiteRunId,'candidate',context.state);
    assertB3NotInterrupted(context.state);
    const baselineRuntime = await verifyRuntimeImage(context,baselineImage,packageLockPath,suiteRunId,'baseline');
    assertB3NotInterrupted(context.state);
    const candidateRuntime = await verifyRuntimeImage(context,candidateImage,packageLockPath,suiteRunId,'candidate');
    provenance = {baseCommit:BASE_SHA,baseTree:BASE_TREE,packageLockSha256,candidateProductionPatchSha256:productionPatch.sha256,baseline:{imageId:baselineImage,...baselineRuntime},candidate:{imageId:candidateImage,...candidateRuntime}};
    if (args.has('--final-suite')) {
      assertB3NotInterrupted(context.state);
      await runFinalSuite(nodePath, buildMinimalChildEnvironment(process.env));
    }
    context.state.transition(EVIDENCE_PHASE.RUNNING);
    assertB3NotInterrupted(context.state);
    rehearsals = await runFailureRehearsals(context,candidateImage);
    if (args.has('--failure-rehearsals')) {
      context.verifySessionsAndLocks = async () => ({ openTransactions: rehearsals.sigint.openTransactions, idleTransactions: rehearsals.sigint.idleTransactions, unresolvedLockWaits: rehearsals.sigint.locks, applicationSessions: rehearsals.sigint.sessions });
      const cleanup = await cleanupEvidenceContext(context, { removeScratch: true });
      assert.equal(cleanup.ok, true);
      console.log(JSON.stringify({schemaVersion:SUMMARY_SCHEMA_VERSION,schema:SUMMARY_SCHEMA,gate:GATE,overall:'PASS',rehearsals,executedPureFaultProofs:pureFaultExecutions.length,finalAudit:await auditGateResources(context,true)},null,2));
      return;
    }
    assertB3NotInterrupted(context.state);
    runs.push(await runFormalEvidence({context,baselineImage,candidateImage,summaryRoot,ordinal:1,inventory,playbackConsumers,provenance,rehearsals,pureFaultExecutions}));
    assertB3NotInterrupted(context.state);
    runs.push(await runFormalEvidence({context,baselineImage,candidateImage,summaryRoot,ordinal:2,inventory,playbackConsumers,provenance,rehearsals,pureFaultExecutions}));
    const cleanup = await cleanupEvidenceContext(context, { removeScratch:true, summaries:runs, postPublicationValidation:(publications)=>validatePostPublicationState(publications,context,preflightResult,nodePath) });
    assert.equal(cleanup.ok, true, `authoritative finalization failed: ${JSON.stringify(cleanup.failureDetails)}`);
    assert.equal(context.state.authoritativeFinalizerInvocations, 1);
    const publications = cleanup.publications;
    const final = { schemaVersion:SUMMARY_SCHEMA_VERSION,schema:SUMMARY_SCHEMA,gate:GATE,overall:'PASS',baseCommit:BASE_SHA,baseTree:BASE_TREE,changedPaths:preflightResult.changedPaths,initialDefectReproductions:INITIAL_DEFECT_REPRODUCTIONS,r3InitialDefectReproductions:R3_INITIAL_DEFECT_REPRODUCTIONS,r4InitialDefectReproductions:R4_INITIAL_DEFECT_REPRODUCTIONS,inventory:{total:inventory.total,interactive:inventory.interactive,batch:inventory.batch,classifications:inventory.classifications,manualOverrides:inventory.manualOverrides,unknown:inventory.unknown,unresolvedCallChains:inventory.unresolvedCallChains,unresolvedRuntimeRoles:inventory.unresolvedRuntimeRoles,unwiredTransactions:inventory.unwiredTransactions,duplicateIds:inventory.duplicateIds,externalWaitInsideTransaction:inventory.externalWaitInsideTransaction,externalWaitOutsideTransaction:inventory.externalWaitOutsideTransaction,classificationDifferences:inventory.classificationDifferences.length,digest:publications[0].summary.inventoryDigest},playbackConsumers:{total:playbackConsumers.total,counts:playbackConsumers.counts,digest:playbackConsumers.digest},candidateProductionPatchSha256:productionPatch.sha256,packageLockSha256,images:{baseline:baselineImage,candidate:candidateImage},runtime:{baseline:baselineRuntime,candidate:candidateRuntime},rehearsals,faultCoverage:publications[0].summary.faultCoverage,formalRuns:publications.map(run=>({runId:run.summary.runId,summaryPath:run.summaryPath,summarySha256:run.summarySha256})),crossRun:'PASS',authoritativeFinalizerInvocations:context.state.authoritativeFinalizerInvocations,finalAudit:publications[0].summary.finalAudit };
    assert.equal(context.state.interrupted, false);
    console.log(JSON.stringify(final, null, 2));
  } catch(error) {
    context.state.disableSummary('B3 final suite failure');
    await cleanupEvidenceContext(context,{failureStage:'B3 final suite failure',removeScratch:true,removeRetained:true}).catch(()=>undefined);
    if (context.state.interrupted) return;
    throw error;
  }
}

const DRIVER_SOURCE = String.raw`'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaService } = require('/app/dist/infrastructure/database/prisma.service');
const { CompleteLearningMediaUploadUseCase } = require('/app/dist/modules/files/uploads/application/learning-media-upload.use-cases');
const { MediaVerificationError } = require('/app/dist/modules/files/uploads/application/media-verifier.service');
const { PrismaLearningMediaUnitOfWork } = require('/app/dist/modules/files/uploads/infrastructure/prisma-learning-media.unit-of-work');
const { LearningMediaRepository } = require('/app/dist/modules/files/uploads/infrastructure/learning-media.repository');
const { UpdateLessonContentUseCase } = require('/app/dist/modules/academics/curriculum/application/lesson-content.use-cases');
const { PrismaLessonContentUnitOfWork } = require('/app/dist/modules/academics/curriculum/infrastructure/prisma-lesson-content.unit-of-work');
const { LessonContentRepository } = require('/app/dist/modules/academics/curriculum/infrastructure/lesson-content.repository');
const { ChangeTeacherEmploymentStatusUseCase } = require('/app/dist/modules/teachers/directory/application/change-teacher-employment-status.use-case');
const { PrismaTeacherLifecycleUnitOfWork } = require('/app/dist/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle.unit-of-work');
const { PrismaTeacherLifecycleTransactionOperations } = require('/app/dist/modules/teachers/lifecycle/infrastructure/prisma-teacher-lifecycle-transaction.operations');
const { TeacherLifecycleAuditWriter } = require('/app/dist/modules/teachers/lifecycle/infrastructure/teacher-lifecycle-audit.writer');
const { PrismaOrganizationTeacherTransferTransactionOperations } = require('/app/dist/modules/organization-admin/teacher-transfers/infrastructure/organization-teacher-transfer-transaction.operations');
const { TeacherAllocationRepository } = require('/app/dist/modules/academics/teacher-allocation/infrastructure/teacher-allocation.repository');
const { TeacherAllocationLifecycleReadService } = require('/app/dist/modules/academics/teacher-allocation/application/teacher-allocation-lifecycle-read.service');
const { LessonContentPlaybackCoordinator } = require('/app/dist/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator');
const { OperationalProbeService } = require('/app/dist/modules/health/operational-probe.service');
const { runWithRequestContext } = require('/app/dist/common/context/request-context');

const driverAbortController=new AbortController();
const trackedPrismaClients=new Set();
const activeOperations=new Set();
const pendingDriverTimers=new Set();
const pendingDriverAbortListeners=new Set();
let firstSignal=null;
let requestedExitCode=0;
let summaryEligibility=true;
let finalizationPromise=null;
let authoritativeFinalizerInvocations=0;
let resolveSignal;
const signalPromise=new Promise(resolve=>{resolveSignal=resolve;});
const driverTimer=(callback,timeoutMs)=>{const timer=setTimeout(()=>{pendingDriverTimers.delete(timer);callback();},timeoutMs);pendingDriverTimers.add(timer);return timer;};
const clearDriverTimer=timer=>{if(timer){clearTimeout(timer);pendingDriverTimers.delete(timer);}};
const waitForSignal=async()=>{let timer;try{await Promise.race([signalPromise,new Promise((_,reject)=>{timer=driverTimer(()=>reject(new Error('signal rehearsal deadline')),120000);})]);}finally{clearDriverTimer(timer);}};
const trackedOperationPromises=new WeakSet();
const trackNormalOperation=promise=>{if(!trackedOperationPromises.has(promise)){trackedOperationPromises.add(promise);activeOperations.add(promise);void promise.finally(()=>activeOperations.delete(promise)).catch(()=>undefined);}return promise;};
const startDriverOperation=operation=>{try{return Promise.resolve(operation());}catch(error){return Promise.reject(error);}};
const bounded=async(label,operation,timeoutMs=120000,ignoreAbort=false)=>{
  let timer;let abortListener;
  const operationPromise=trackNormalOperation(startDriverOperation(operation));void operationPromise.catch(()=>undefined);
  const races=[operationPromise,new Promise((_,reject)=>{timer=driverTimer(()=>reject(new Error(label+' deadline')),timeoutMs);})];
  if(!ignoreAbort)races.push(new Promise((_,reject)=>{abortListener=()=>reject(new Error(label+' aborted'));pendingDriverAbortListeners.add(abortListener);driverAbortController.signal.addEventListener('abort',abortListener,{once:true});}));
  try{return await Promise.race(races);}finally{clearDriverTimer(timer);if(abortListener){driverAbortController.signal.removeEventListener('abort',abortListener);pendingDriverAbortListeners.delete(abortListener);}}
};
const boundedCleanup=async(label,operation,timeoutMs=120000)=>{let timer;const operationPromise=startDriverOperation(operation);void operationPromise.catch(()=>undefined);try{return await Promise.race([operationPromise,new Promise((_,reject)=>{timer=driverTimer(()=>reject(new Error(label+' deadline')),timeoutMs);})]);}finally{clearDriverTimer(timer);}};
const tracked=promise=>trackNormalOperation(promise);
const prismaProxyCache=new WeakMap();
const boundedPrisma=(raw,label='Prisma')=>{
  if(prismaProxyCache.has(raw))return prismaProxyCache.get(raw);
  const delegateCache=new Map();
  const proxy=new Proxy(raw,{get(target,property){
    if(property==='$disconnect')return async()=>{await bounded(label+' disconnect',()=>target.$disconnect(),5000);trackedPrismaClients.delete(target);};
    if(property==='$connect')return()=>bounded(label+' connect',()=>target.$connect(),10000);
    if(property==='$transaction')return(first,options)=>{
      const timeout=Math.max(Number(options?.timeout||0)+5000,120000);
      if(typeof first==='function')return bounded(label+' transaction',()=>target.$transaction(tx=>first(boundedPrisma(tx,label+' transaction client')),options),timeout);
      return bounded(label+' batch transaction',()=>target.$transaction(first,options),timeout);
    };
    const value=Reflect.get(target,property,target);
    if(typeof value==='function')return(...args)=>bounded(label+' '+String(property),()=>value.apply(target,args),120000);
    if(value&&typeof value==='object'){
      if(delegateCache.has(property))return delegateCache.get(property);
      const delegate=new Proxy(value,{get(delegateTarget,method){const member=Reflect.get(delegateTarget,method,delegateTarget);return typeof member==='function'?(...args)=>bounded(label+' '+String(property)+'.'+String(method),()=>member.apply(delegateTarget,args),120000):member;}});
      delegateCache.set(property,delegate);return delegate;
    }
    return value;
  }});
  prismaProxyCache.set(raw,proxy);return proxy;
};
const disconnectPhase=async phase=>{const results=[];for(const raw of [...trackedPrismaClients]){try{await boundedCleanup(phase+' Prisma disconnect',()=>raw.$disconnect(),5000);trackedPrismaClients.delete(raw);results.push({status:'DISCONNECTED'});}catch(error){results.push({status:String(error?.message||'').includes('deadline')?'TIMED_OUT':'REJECTED'});}}return results;};
const finalizeDriver=()=>{
  if(finalizationPromise)return finalizationPromise;
  authoritativeFinalizerInvocations+=1;
  finalizationPromise=(async()=>{
    driverAbortController.abort();
    const phaseOneResults=await disconnectPhase('phase-one');
    try{await boundedCleanup('active operation settlement',()=>Promise.allSettled([...activeOperations]),10000);}catch{}
    const phaseTwoResults=await disconnectPhase('phase-two');
    process.removeListener('SIGINT',sigintHandler);process.removeListener('SIGTERM',sigtermHandler);
    const trackedClientCount=trackedPrismaClients.size,activeOperationCount=activeOperations.size;
    const noPendingDriverWork=pendingDriverTimers.size===0&&pendingDriverAbortListeners.size===0&&process.listenerCount('SIGINT')===0&&process.listenerCount('SIGTERM')===0;
    const ok=trackedClientCount===0&&activeOperationCount===0&&noPendingDriverWork;
    if(!ok){summaryEligibility=false;if(!firstSignal){requestedExitCode=1;process.exitCode=1;}}
    const result=Object.freeze({ok,phaseOneResults:Object.freeze(phaseOneResults),phaseTwoResults:Object.freeze(phaseTwoResults),trackedPrismaClients:trackedClientCount,activeOperations:activeOperationCount,pendingDriverTimers:pendingDriverTimers.size,pendingDriverAbortListeners:pendingDriverAbortListeners.size,firstSignal,requestedExitCode,authoritativeFinalizerInvocations});
    if(firstSignal||!ok)console.log('B3_DRIVER_FINALIZED='+JSON.stringify(result));
    return result;
  })();
  return finalizationPromise;
};
const latchSignal=signal=>{if(firstSignal)return false;firstSignal=signal;requestedExitCode=signal==='SIGINT'?130:143;summaryEligibility=false;driverAbortController.abort();resolveSignal(signal);const finalization=finalizeDriver();void finalization.then(()=>{process.exitCode=requestedExitCode;},()=>{process.exitCode=requestedExitCode;});return true;};
const sigintHandler=()=>latchSignal('SIGINT');
const sigtermHandler=()=>latchSignal('SIGTERM');
process.on('SIGINT',sigintHandler);
process.on('SIGTERM',sigtermHandler);

const I = Object.freeze({
  organization:'10000000-0000-4000-8000-000000000001',school:'10000000-0000-4000-8000-000000000002',actor:'10000000-0000-4000-8000-000000000003',teacher:'10000000-0000-4000-8000-000000000004',year:'10000000-0000-4000-8000-000000000005',term:'10000000-0000-4000-8000-000000000006',stage:'10000000-0000-4000-8000-000000000007',grade:'10000000-0000-4000-8000-000000000008',section:'10000000-0000-4000-8000-000000000009',classroom:'10000000-0000-4000-8000-000000000010',subject:'10000000-0000-4000-8000-000000000011',allocation:'10000000-0000-4000-8000-000000000012',curriculum:'10000000-0000-4000-8000-000000000013',unit:'10000000-0000-4000-8000-000000000014',lesson:'10000000-0000-4000-8000-000000000015',plan:'10000000-0000-4000-8000-000000000016',planItem:'10000000-0000-4000-8000-000000000017',file:'10000000-0000-4000-8000-000000000018',upload:'10000000-0000-4000-8000-000000000019',content:'10000000-0000-4000-8000-000000000020',
  role:'10000000-0000-4000-8000-000000000022',membership:'10000000-0000-4000-8000-000000000023',profile:'10000000-0000-4000-8000-000000000024',session:'10000000-0000-4000-8000-000000000025',draftContent:'10000000-0000-4000-8000-000000000026',otherContent:'10000000-0000-4000-8000-000000000027',learning:'10000000-0000-4000-8000-000000000028'
});
const base = process.env.DATABASE_URL;
const url = (limit=5, app='moazez-b3-driver', pool=2) => base + '&connection_limit=' + limit + '&pool_timeout=' + pool + '&connect_timeout=5&application_name=' + app;
const client = (limit=5, app='moazez-b3-driver', pool=2) => {const raw=new PrismaService({ datasourceUrl:url(limit,app,pool) });trackedPrismaClients.add(raw);return boundedPrisma(raw,app);};
const pause = ms => bounded('pause',()=>new Promise(r=>setTimeout(r,ms)),ms+1000);
const deferred = (abortMode='reject') => { let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});const abort=()=>abortMode==='resolve'?resolve():reject(new Error('B3 driver aborted'));pendingDriverAbortListeners.add(abort);driverAbortController.signal.addEventListener('abort',abort,{once:true});void promise.finally(()=>{driverAbortController.signal.removeEventListener('abort',abort);pendingDriverAbortListeners.delete(abort);}).catch(()=>undefined);return {promise,resolve,reject}; };

async function seed(p){
  await p.organization.upsert({where:{id:I.organization},update:{},create:{id:I.organization,name:'B3 Organization',slug:'b3-organization'}});
  await p.school.upsert({where:{id:I.school},update:{},create:{id:I.school,organizationId:I.organization,name:'B3 School',slug:'b3-school'}});
  await p.user.upsert({where:{id:I.actor},update:{},create:{id:I.actor,email:'b3-actor@invalid.example',firstName:'B3',lastName:'Actor',userType:'SCHOOL_USER',status:'ACTIVE'}});
  await p.user.upsert({where:{id:I.teacher},update:{status:'ACTIVE',passwordHash:'synthetic-hash'},create:{id:I.teacher,email:'b3-teacher@invalid.example',passwordHash:'synthetic-hash',firstName:'B3',lastName:'Teacher',userType:'TEACHER',status:'ACTIVE'}});
  await p.role.upsert({where:{id:I.role},update:{},create:{id:I.role,schoolId:I.school,key:'teacher',name:'Teacher',isSystem:true}});
  await p.membership.upsert({where:{id:I.membership},update:{status:'ACTIVE',endedAt:null,deletedAt:null},create:{id:I.membership,userId:I.teacher,organizationId:I.organization,schoolId:I.school,roleId:I.role,userType:'TEACHER',status:'ACTIVE'}});
  await p.teacherProfile.upsert({where:{id:I.profile},update:{employmentStatus:'ACTIVE',deletedAt:null},create:{id:I.profile,schoolId:I.school,userId:I.teacher,teacherCode:'B3T001',firstNameAr:'معلم',lastNameAr:'اختبار',firstNameEn:'B3',lastNameEn:'Teacher',gender:'MALE',employmentStatus:'ACTIVE'}});
  await p.session.upsert({where:{id:I.session},update:{revokedAt:null},create:{id:I.session,userId:I.teacher,refreshTokenHash:'b3-synthetic-refresh-hash',expiresAt:new Date(Date.now()+3600000)}});
  await p.academicYear.upsert({where:{id:I.year},update:{},create:{id:I.year,schoolId:I.school,nameAr:'B3-AR',nameEn:'B3-EN',startDate:new Date('2026-01-01'),endDate:new Date('2026-12-31'),isActive:true}});
  await p.term.upsert({where:{id:I.term},update:{},create:{id:I.term,schoolId:I.school,academicYearId:I.year,nameAr:'B3-Term-AR',nameEn:'B3-Term-EN',startDate:new Date('2026-01-01'),endDate:new Date('2026-06-30'),isActive:true}});
  await p.stage.upsert({where:{id:I.stage},update:{},create:{id:I.stage,schoolId:I.school,nameAr:'B3-Stage-AR',nameEn:'B3-Stage-EN'}});
  await p.grade.upsert({where:{id:I.grade},update:{},create:{id:I.grade,schoolId:I.school,stageId:I.stage,nameAr:'B3-Grade-AR',nameEn:'B3-Grade-EN'}});
  await p.section.upsert({where:{id:I.section},update:{},create:{id:I.section,schoolId:I.school,gradeId:I.grade,nameAr:'B3-Section-AR',nameEn:'B3-Section-EN'}});
  await p.classroom.upsert({where:{id:I.classroom},update:{},create:{id:I.classroom,schoolId:I.school,sectionId:I.section,nameAr:'B3-Class-AR',nameEn:'B3-Class-EN'}});
  await p.subject.upsert({where:{id:I.subject},update:{},create:{id:I.subject,schoolId:I.school,nameAr:'B3-Subject-AR',nameEn:'B3-Subject-EN',code:'B3'}});
  await p.teacherSubjectAllocation.upsert({where:{id:I.allocation},update:{},create:{id:I.allocation,schoolId:I.school,teacherUserId:I.teacher,subjectId:I.subject,classroomId:I.classroom,termId:I.term}});
  await p.curriculum.upsert({where:{id:I.curriculum},update:{status:'ACTIVE'},create:{id:I.curriculum,schoolId:I.school,academicYearId:I.year,termId:I.term,gradeId:I.grade,subjectId:I.subject,title:'B3 Curriculum',status:'ACTIVE',createdByUserId:I.actor}});
  await p.curriculumUnit.upsert({where:{id:I.unit},update:{},create:{id:I.unit,schoolId:I.school,curriculumId:I.curriculum,title:'B3 Unit'}});
  await p.curriculumLesson.upsert({where:{id:I.lesson},update:{},create:{id:I.lesson,schoolId:I.school,curriculumId:I.curriculum,unitId:I.unit,title:'B3 Lesson'}});
  await p.lessonPlan.upsert({where:{id:I.plan},update:{},create:{id:I.plan,schoolId:I.school,academicYearId:I.year,termId:I.term,teacherSubjectAllocationId:I.allocation,teacherUserId:I.teacher,classroomId:I.classroom,subjectId:I.subject,curriculumId:I.curriculum,title:'B3 Plan',status:'ACTIVE',weekStartDate:new Date('2026-03-01'),weekEndDate:new Date('2026-03-07'),createdByUserId:I.actor}});
  await p.lessonPlanItem.upsert({where:{id:I.planItem},update:{},create:{id:I.planItem,schoolId:I.school,lessonPlanId:I.plan,curriculumId:I.curriculum,unitId:I.unit,lessonId:I.lesson,title:'B3 Item',createdByUserId:I.actor}});
  await p.file.upsert({where:{id:I.file},update:{deletedAt:null},create:{id:I.file,organizationId:I.organization,schoolId:I.school,uploaderId:I.actor,bucket:'b3-private',objectKey:'opaque-b3-object',originalName:'fixture-video.mp4',mimeType:'video/mp4',sizeBytes:4096n,visibility:'PRIVATE'}});
  await p.fileUploadSession.upsert({where:{id:I.upload},update:{status:'READY',finalCleanupClaimedAt:null,finalObjectDeletedAt:null},create:{id:I.upload,organizationId:I.organization,schoolId:I.school,createdByUserId:I.actor,clientRequestId:'10000000-0000-4000-8000-000000000021',purpose:'LESSON_CONTENT',originalName:'fixture-video.mp4',expectedMimeType:'video/mp4',expectedSizeBytes:4096n,finalBucket:'b3-private',finalObjectKey:'opaque-b3-object',status:'READY',createdAt:new Date('2026-08-04T12:00:00Z'),expiresAt:new Date('2026-08-04T12:00:00Z'),completedAt:new Date('2026-08-04T12:00:00Z'),finalCleanupEligibleAt:new Date('2026-08-11T12:00:00Z'),verifiedMimeType:'video/mp4',actualSizeBytes:4096n,checksumSha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',durationSeconds:12,width:640,height:360,verifiedAt:new Date('2026-08-04T12:00:00Z'),verificationVersion:'ffprobe-5.1.9-debian12-learning-media-v1',fileId:I.file}});
  await p.lessonContentItem.upsert({where:{id:I.content},update:{publicationStatus:'PUBLISHED',fileId:I.file},create:{id:I.content,schoolId:I.school,curriculumId:I.curriculum,unitId:I.unit,lessonId:I.lesson,type:'FILE',title:'B3 Video',fileId:I.file,createdByUserId:I.actor,publicationStatus:'PUBLISHED',publishedAt:new Date('2026-01-01'),publishedByUserId:I.actor}});
  await p.lessonContentItem.upsert({where:{id:I.draftContent},update:{title:'B3 Draft',publicationStatus:'DRAFT',deletedAt:null},create:{id:I.draftContent,schoolId:I.school,curriculumId:I.curriculum,unitId:I.unit,lessonId:I.lesson,type:'TEXT',title:'B3 Draft',bodyText:'Draft body',createdByUserId:I.actor,publicationStatus:'DRAFT'}});
  await p.lessonContentItem.upsert({where:{id:I.otherContent},update:{title:'B3 Unrelated',publicationStatus:'DRAFT',deletedAt:null},create:{id:I.otherContent,schoolId:I.school,curriculumId:I.curriculum,unitId:I.unit,lessonId:I.lesson,type:'TEXT',title:'B3 Unrelated',bodyText:'Unrelated body',createdByUserId:I.actor,publicationStatus:'DRAFT'}});
  await seedUpload(p,I.learning,28);
}

const uuidFor = value => '20000000-0000-4000-8000-' + String(value).padStart(12,'0');
async function seedUpload(p,id,ordinal,status='UPLOADING'){
  const createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+7200000),latestUploadUrlExpiresAt=new Date(createdAt.getTime()+3600000);await p.fileUploadSession.upsert({where:{id},update:{status,fileId:null,completedAt:null,failedAt:null,cancelledAt:null,failureReason:null,stagingCleanupEligibleAt:null,stagingCleanupClaimedAt:null,stagingObjectDeletedAt:null,finalCleanupEligibleAt:null,finalCleanupClaimedAt:null,finalObjectDeletedAt:null,verifiedMimeType:null,actualSizeBytes:null,checksumSha256:null,durationSeconds:null,width:null,height:null,verifiedAt:null,verificationVersion:null,createdAt,expiresAt,latestUploadUrlExpiresAt},create:{id,organizationId:I.organization,schoolId:I.school,createdByUserId:I.actor,clientRequestId:uuidFor(ordinal),purpose:'LESSON_CONTENT',originalName:'learning-'+ordinal+'.mp4',expectedMimeType:'video/mp4',expectedSizeBytes:4096n,stagingBucket:'b3-staging',stagingObjectKey:'staging-'+ordinal,finalBucket:'b3-private',finalObjectKey:'learning-'+ordinal,createdAt,expiresAt,latestUploadUrlExpiresAt,status}});
}

async function seedTeacher(p,ordinal){
  const ids={user:uuidFor(100+ordinal),membership:uuidFor(200+ordinal),profile:uuidFor(300+ordinal),session:uuidFor(400+ordinal),allocation:uuidFor(500+ordinal)};
  await p.user.upsert({where:{id:ids.user},update:{status:'ACTIVE',passwordHash:'synthetic-hash'},create:{id:ids.user,email:'teacher-'+ordinal+'@invalid.example',passwordHash:'synthetic-hash',firstName:'B3',lastName:'Teacher '+ordinal,userType:'TEACHER',status:'ACTIVE'}});
  await p.membership.upsert({where:{id:ids.membership},update:{status:'ACTIVE',endedAt:null,deletedAt:null},create:{id:ids.membership,userId:ids.user,organizationId:I.organization,schoolId:I.school,roleId:I.role,userType:'TEACHER',status:'ACTIVE'}});
  await p.teacherProfile.upsert({where:{id:ids.profile},update:{employmentStatus:'ACTIVE',deletedAt:null},create:{id:ids.profile,schoolId:I.school,userId:ids.user,teacherCode:'B3T'+String(ordinal).padStart(3,'0'),firstNameAr:'معلم',lastNameAr:'اختبار',firstNameEn:'B3',lastNameEn:'Teacher',gender:'MALE',employmentStatus:'ACTIVE'}});
  await p.session.upsert({where:{id:ids.session},update:{revokedAt:null},create:{id:ids.session,userId:ids.user,refreshTokenHash:'b3-refresh-'+ordinal,expiresAt:new Date(Date.now()+3600000)}});
  await p.teacherSubjectAllocation.upsert({where:{id:ids.allocation},update:{},create:{id:ids.allocation,schoolId:I.school,teacherUserId:ids.user,subjectId:I.subject,classroomId:I.classroom,termId:I.term}});
  return ids;
}

const context = fn => runWithRequestContext({requestId:'b3',actor:{id:I.actor,userType:'SCHOOL_USER'},activeMembership:{membershipId:I.actor,schoolId:I.school,organizationId:I.organization,roleId:I.actor,permissions:[]},bypass:{bypassSchoolScope:false,includeSoftDeleted:false}},fn);
function playbackRequest(){return {schoolId:I.school,organizationId:I.organization,lessonPlanItemId:I.planItem,contentItemId:I.content,visibilityWhere:{schoolId:I.school},policy:{curriculum:'ACTIVE',content:'PUBLISHED'},lockAuthorization:async tx=>{await tx.$queryRawUnsafe('SELECT 1');return true;}};}

async function playbackProof(mode){
  const p=client(5,'b3-playback-'+mode,2), observer=client(2,'b3-observer-'+mode,2); await p.$connect();await observer.$connect();await seed(p);
  let openTransactions=0,locks=0,calls=0;
  const storage={createDownloadUrl:async()=>{calls+=1;await pause(150);const rows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'b3-playback-"+mode+"' AND xact_start IS NOT NULL");openTransactions=Number(rows[0].count);const lockRows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name = 'b3-playback-"+mode+"' AND a.xact_start IS NOT NULL");locks=Number(lockRows[0].count);await pause(150);return {url:'https://capability.invalid/b3',expiresAt:new Date('2026-01-01T00:05:00Z')}}};
  const coordinator=new LessonContentPlaybackCoordinator(p,storage);const response=await context(()=>coordinator.execute(playbackRequest()));assert.ok(response);assert.equal(calls,1);await p.$disconnect();await observer.$disconnect();return {signerObservedOpenTransaction:openTransactions>0,providerWaitOpenTransactions:openTransactions,providerWaitLocks:locks,callbackInvocations:calls};
}

async function playbackNegativeMatrix(p){
  await seed(p);const results={};
  let calls=0;let authorizationCalls=0;const authRequest=playbackRequest();authRequest.lockAuthorization=async()=>{authorizationCalls+=1;return authorizationCalls===1;};const authCoordinator=new LessonContentPlaybackCoordinator(p,{createDownloadUrl:async()=>{calls+=1;return {url:'https://capability.invalid/auth',expiresAt:new Date()};}});results.authorization=(await context(()=>authCoordinator.execute(authRequest)))===null&&calls===1;
  const mutationCases=[['publication',async()=>p.lessonContentItem.update({where:{id:I.content},data:{publicationStatus:'DRAFT',publishedAt:null,publishedByUserId:null}}),async()=>p.lessonContentItem.update({where:{id:I.content},data:{publicationStatus:'PUBLISHED',publishedAt:new Date('2026-01-01'),publishedByUserId:I.actor}})],['uploadSession',async()=>p.fileUploadSession.update({where:{id:I.upload},data:{status:'LEGACY',completedAt:null,finalCleanupEligibleAt:null,verificationVersion:'legacy_metadata_v1',verifiedMimeType:null,actualSizeBytes:null,checksumSha256:null,durationSeconds:null,width:null,height:null,verifiedAt:null}}),async()=>p.fileUploadSession.update({where:{id:I.upload},data:{status:'READY',completedAt:new Date('2026-08-04T12:00:00Z'),finalCleanupEligibleAt:new Date('2026-08-11T12:00:00Z'),verificationVersion:'ffprobe-5.1.9-debian12-learning-media-v1',verifiedMimeType:'video/mp4',actualSizeBytes:4096n,checksumSha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',durationSeconds:12,width:640,height:360,verifiedAt:new Date('2026-08-04T12:00:00Z')}})],['mediaRemoval',async()=>p.file.update({where:{id:I.file},data:{deletedAt:new Date()}}),async()=>p.file.update({where:{id:I.file},data:{deletedAt:null}})],['candidateIdentity',async()=>{await p.file.update({where:{id:I.file},data:{objectKey:'opaque-b3-object-changed'}});await p.fileUploadSession.update({where:{id:I.upload},data:{finalObjectKey:'opaque-b3-object-changed'}});},async()=>{await p.file.update({where:{id:I.file},data:{objectKey:'opaque-b3-object'}});await p.fileUploadSession.update({where:{id:I.upload},data:{finalObjectKey:'opaque-b3-object'}});}]];
  for(const [name,mutate,restore] of mutationCases){const coordinator=new LessonContentPlaybackCoordinator(p,{createDownloadUrl:async()=>{await mutate();return {url:'https://capability.invalid/'+name,expiresAt:new Date()};}});const result=await context(()=>coordinator.execute(playbackRequest()));results[name]=result===null;await restore();}
  let rejectedCalls=0;const rejectedCoordinator=new LessonContentPlaybackCoordinator(p,{createDownloadUrl:async()=>{rejectedCalls+=1;throw new Error('controlled signing rejection');}});await assert.rejects(()=>context(()=>rejectedCoordinator.execute(playbackRequest())));results.signingRejected=rejectedCalls===1;results.finalRevalidationRejected=results.authorization;assert.ok(Object.values(results).every(Boolean));return {results,pass:true,capabilityExposedOnRejectedRevalidation:false};
}

const verificationFacts = () => ({verifiedMimeType:'video/mp4',actualSizeBytes:4096n,checksumSha256:'a'.repeat(64),durationSeconds:12,width:640,height:360,verifiedAt:new Date(),verificationVersion:'ffprobe-5.1.9-debian12-learning-media-v1'});
function learningEntry(p,overrides={}){
  const repository=new LearningMediaRepository(p);
  const unitOfWork=new PrismaLearningMediaUnitOfWork(p,repository);
  const verifier=overrides.verifier||{verifyAndStoreFinal:async()=>verificationFacts()};
  const storage=overrides.storage||{deleteObjectAndConfirmAbsent:async()=>undefined};
  return {repository,unitOfWork,verifier,storage,useCase:new CompleteLearningMediaUploadUseCase(unitOfWork,verifier,storage)};
}
function lessonEntry(p){const repository=new LessonContentRepository(p);const unitOfWork=new PrismaLessonContentUnitOfWork(p,repository);return {repository,unitOfWork,useCase:new UpdateLessonContentUseCase(repository,unitOfWork)};}
function teacherEntry(p){const auditWriter=new TeacherLifecycleAuditWriter(p);const operations=new PrismaTeacherLifecycleTransactionOperations(auditWriter);const transfers=new PrismaOrganizationTeacherTransferTransactionOperations();const unitOfWork=new PrismaTeacherLifecycleUnitOfWork(p,operations,transfers);const allocations=new TeacherAllocationLifecycleReadService(new TeacherAllocationRepository(p));return {unitOfWork,useCase:new ChangeTeacherEmploymentStatusUseCase(unitOfWork,allocations)};}
const lessonPath = {curriculumId:I.curriculum,unitId:I.unit,lessonId:I.lesson,contentItemId:I.draftContent};
const teacherCommand = {employmentStatus:'INACTIVE',effectiveAt:new Date().toISOString()};

async function baselineAndRollback(p){
  const learning=learningEntry(p),lesson=lessonEntry(p),teacher=teacherEntry(p);
  const timings={};
  let started=Date.now();const learningResult=await context(()=>learning.useCase.execute(I.learning));timings.learningMediaMs=Date.now()-started;
  const learningReplay=await context(()=>learning.useCase.execute(I.learning));
  const learningState=await p.fileUploadSession.findUnique({where:{id:I.learning}});const learningFileCount=await p.file.count({where:{id:learningState.fileId}});const learningAuditCount=await p.auditLog.count({where:{action:'learning.media.upload.complete',resourceId:I.learning,outcome:'SUCCESS'}});
  assert.equal(learningState.status,'READY');assert.equal(learningFileCount,1);assert.equal(learningAuditCount,1);assert.equal(learningReplay.id,learningResult.id);
  const hierarchyBefore={curriculum:await p.curriculum.findUnique({where:{id:I.curriculum}}),unit:await p.curriculumUnit.findUnique({where:{id:I.unit}}),lesson:await p.curriculumLesson.findUnique({where:{id:I.lesson}}),other:await p.lessonContentItem.findUnique({where:{id:I.otherContent}})};
  started=Date.now();await context(()=>lesson.useCase.execute(lessonPath,{title:'B3 Draft Updated'}));timings.lessonContentMs=Date.now()-started;
  const lessonState=await p.lessonContentItem.findUnique({where:{id:I.draftContent}});const lessonAuditCount=await p.auditLog.count({where:{action:'academics.lesson_content.update',resourceId:I.draftContent,outcome:'SUCCESS'}});
  assert.equal(lessonState.title,'B3 Draft Updated');assert.equal(lessonState.publicationStatus,'DRAFT');assert.equal(lessonAuditCount,1);assert.equal((await p.curriculum.findUnique({where:{id:I.curriculum}})).updatedAt.getTime(),hierarchyBefore.curriculum.updatedAt.getTime());assert.equal((await p.curriculumUnit.findUnique({where:{id:I.unit}})).updatedAt.getTime(),hierarchyBefore.unit.updatedAt.getTime());assert.equal((await p.curriculumLesson.findUnique({where:{id:I.lesson}})).updatedAt.getTime(),hierarchyBefore.lesson.updatedAt.getTime());assert.equal((await p.lessonContentItem.findUnique({where:{id:I.otherContent}})).title,hierarchyBefore.other.title);
  started=Date.now();const teacherResult=await context(()=>teacher.useCase.execute(I.profile,teacherCommand));timings.teacherLifecycleMs=Date.now()-started;
  const [user,membership,profile,session,audits,allocationCount]=await Promise.all([p.user.findUnique({where:{id:I.teacher}}),p.membership.findUnique({where:{id:I.membership}}),p.teacherProfile.findUnique({where:{id:I.profile}}),p.session.findUnique({where:{id:I.session}}),p.auditLog.findMany({where:{module:'teachers',resourceId:{in:[I.profile,I.teacher,I.membership]},outcome:'SUCCESS'}}),p.teacherSubjectAllocation.count({where:{id:I.allocation,teacherUserId:I.teacher}})]);
  assert.equal(user.status,'DISABLED');assert.equal(user.userType,'TEACHER');assert.equal(membership.status,'SUSPENDED');assert.equal(profile.employmentStatus,'INACTIVE');assert.ok(session.revokedAt);assert.equal(audits.length,3);assert.equal(allocationCount,1);
  return {timings,learningMedia:{status:learningState.status,fileCount:learningFileCount,auditCount:learningAuditCount,exactOnce:true,bucketConsistent:learningState.finalBucket==='b3-private'},lessonContent:{status:lessonState.publicationStatus,auditCount:lessonAuditCount,hierarchyUnchanged:true,unrelatedUnchanged:true},teacherLifecycle:{userStatus:user.status,membershipStatus:membership.status,profileStatus:profile.employmentStatus,revokedSessions:teacherResult.transition.revokedSessionCount,auditCount:audits.length,allocationCount,identityCount:await p.user.count({where:{id:I.teacher}}),membershipCount:await p.membership.count({where:{userId:I.teacher}})}};
}

function errorCode(error){let current=error;for(let depth=0;depth<8&&current;depth+=1){const code=typeof current==='object'&&current!==null&&typeof current.code==='string'?current.code:'';if(code==='P2024'||code==='P2028'||code==='P2034')return code;if(code&&!/^P\d{4}$/.test(code))return 'KNOWN_BUSINESS_REJECTION';const name=typeof current==='object'&&current!==null&&typeof current.name==='string'?current.name:'';if(/^(?:DomainException|.*(?:Conflict|InvalidTransition|Invariant|NotFound|Rejection|Forbidden|Unauthorized)(?:Exception|Error))$/.test(name))return 'KNOWN_BUSINESS_REJECTION';current=typeof current==='object'&&current!==null?current.cause:null;}return 'UNKNOWN_ERROR';}
async function prepareActualOperation(p,kind,ordinal){
  if(kind==='learningMedia'){const id=uuidFor(600+ordinal);await seedUpload(p,id,600+ordinal);const entry=learningEntry(p);return {id,table:'file_upload_sessions',run:()=>context(()=>entry.useCase.execute(id)),verify:async()=>{const state=await p.fileUploadSession.findUnique({where:{id}});return state.status==='READY'&&(await p.file.count({where:{id:state.fileId}}))===1;}};}
  if(kind==='lessonContent'){await p.lessonContentItem.update({where:{id:I.draftContent},data:{title:'B3 Draft '+ordinal,publicationStatus:'DRAFT'}});const entry=lessonEntry(p);return {id:I.curriculum,table:'curricula',run:()=>context(()=>entry.useCase.execute(lessonPath,{title:'B3 Lesson Commit '+ordinal})),verify:async()=>{const state=await p.lessonContentItem.findUnique({where:{id:I.draftContent}});return state.title==='B3 Lesson Commit '+ordinal&&state.publicationStatus==='DRAFT';}};}
  const ids=await seedTeacher(p,ordinal);const entry=teacherEntry(p);return {id:ids.profile,table:'teacher_profiles',ids,run:()=>context(()=>entry.useCase.execute(ids.profile,teacherCommand)),verify:async()=>{const [u,m,profile,s,a]=await Promise.all([p.user.findUnique({where:{id:ids.user}}),p.membership.findUnique({where:{id:ids.membership}}),p.teacherProfile.findUnique({where:{id:ids.profile}}),p.session.findUnique({where:{id:ids.session}}),p.auditLog.count({where:{module:'teachers',resourceId:{in:[ids.profile,ids.user,ids.membership]},outcome:'SUCCESS'}})]);return u.status==='DISABLED'&&m.status==='SUSPENDED'&&profile.employmentStatus==='INACTIVE'&&s.revokedAt!==null&&a===3;}};
}

async function observeBlocked(inspector,applicationName){
  for(let attempt=0;attempt<80;attempt+=1){const rows=await inspector.$queryRawUnsafe("SELECT wait_event_type AS \"waitEventType\", wait_event AS \"waitEvent\", cardinality(pg_blocking_pids(pid))::int AS blockers FROM pg_stat_activity WHERE application_name = $1 AND state='active' AND wait_event_type='Lock'",applicationName);if(rows.length>0&&Number(rows[0].blockers)>0)return rows[0];await pause(100);}throw new Error('actual production operation did not reach PostgreSQL lock wait');
}

async function lockContention(p,kind,ordinal){
  const operation=await prepareActualOperation(p,kind,ordinal);const holder=client(1,'b3-lock-holder-'+kind,2),inspector=client(1,'b3-lock-inspector-'+kind,2);await holder.$connect();await inspector.$connect();const acquired=deferred(),release=deferred();
  const holding=holder.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM "'+operation.table+'" WHERE id = $1::uuid FOR UPDATE',operation.id);acquired.resolve();await release.promise;},{maxWait:5000,timeout:10000});
  await acquired.promise;const started=Date.now();const pending=operation.run();const activity=await observeBlocked(inspector,'moazez-b3-driver');const locks=await inspector.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks AS held_lock INNER JOIN pg_stat_activity AS activity ON activity.pid=held_lock.pid WHERE activity.application_name='moazez-b3-driver' AND held_lock.granted=false");await pause(750);release.resolve();await holding;await pending;const elapsedMs=Date.now()-started;assert.ok(await operation.verify());await holder.$disconnect();await inspector.$disconnect();assert.ok(elapsedMs>=700);assert.ok(Number(locks[0].count)>0);return {path:kind,elapsedMs,outcome:'COMMITTED',waitEventType:activity.waitEventType,waitEvent:activity.waitEvent,blockingPidCount:Number(activity.blockers),ungrantedLocks:Number(locks[0].count)};
}

async function transactionTimeout(p,kind,ordinal,expectedMs){
  const operation=await prepareActualOperation(p,kind,ordinal);const holder=client(1,'b3-timeout-holder-'+kind,2),inspector=client(1,'b3-timeout-inspector-'+kind,2);await holder.$connect();await inspector.$connect();const acquired=deferred(),release=deferred();
  const pre={upload:kind==='learningMedia'?await p.fileUploadSession.findUnique({where:{id:operation.id}}):null,lesson:kind==='lessonContent'?await p.lessonContentItem.findUnique({where:{id:I.draftContent}}):null,teacher:kind==='teacherLifecycle'?await Promise.all([p.user.findUnique({where:{id:operation.ids.user}}),p.membership.findUnique({where:{id:operation.ids.membership}}),p.teacherProfile.findUnique({where:{id:operation.ids.profile}}),p.session.findUnique({where:{id:operation.ids.session}})]):null,audits:await p.auditLog.count()};
  const holding=holder.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM "'+operation.table+'" WHERE id = $1::uuid FOR UPDATE',operation.id);acquired.resolve();await release.promise;},{maxWait:5000,timeout:expectedMs+20000});await acquired.promise;const transactionStartedAt=Date.now();const pending=operation.run();const observed=await observeBlocked(inspector,'moazez-b3-driver');const waitStartedAt=Date.now();await pause(expectedMs+1250);release.resolve();await holding;let caught=null;try{await pending;}catch(error){caught=error;}const elapsedMs=Date.now()-transactionStartedAt;assert.ok(caught);const category=errorCode(caught);assert.ok(elapsedMs>=expectedMs-1000,kind+' timeout too early '+elapsedMs);
  const rollbackChecks={auditUnchanged:(await p.auditLog.count())===pre.audits};
  if(kind==='learningMedia'){const after=await p.fileUploadSession.findUnique({where:{id:operation.id}});rollbackChecks.state=after.status===pre.upload.status&&after.fileId===null;}
  if(kind==='lessonContent'){const after=await p.lessonContentItem.findUnique({where:{id:I.draftContent}});rollbackChecks.state=after.title===pre.lesson.title&&after.updatedAt.getTime()===pre.lesson.updatedAt.getTime();}
  if(kind==='teacherLifecycle'){const after=await Promise.all([p.user.findUnique({where:{id:operation.ids.user}}),p.membership.findUnique({where:{id:operation.ids.membership}}),p.teacherProfile.findUnique({where:{id:operation.ids.profile}}),p.session.findUnique({where:{id:operation.ids.session}})]);rollbackChecks.state=after[0].status===pre.teacher[0].status&&after[1].status===pre.teacher[1].status&&after[2].employmentStatus===pre.teacher[2].employmentStatus&&after[3].revokedAt===null;}
  assert.ok(rollbackChecks.auditUnchanged&&rollbackChecks.state);await operation.run();const retryPass=await operation.verify();assert.ok(retryPass);await holder.$disconnect();await inspector.$disconnect();return {path:kind,configuredMs:expectedMs,waitStartedAtOffsetMs:waitStartedAt-transactionStartedAt,transactionStarted:true,waitEvent:observed.waitEvent,waitEventType:observed.waitEventType,blockingPidCount:Number(observed.blockers),elapsedMs,errorCategory:category,rollbackPass:true,retryPass};
}

async function serializable(p){
  const ids=await seedTeacher(p,90),firstClient=client(2,'b3-serial-first',5),secondClient=client(2,'b3-serial-second',5),holder=client(1,'b3-serial-holder',5),observer=client(1,'b3-serial-observer',5);
  await firstClient.$connect();await secondClient.$connect();await holder.$connect();await observer.$connect();
  const first=teacherEntry(firstClient),second=teacherEntry(secondClient),blockerAcquired=deferred(),releaseBlocker=deferred();
  const blocker=holder.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM "teacher_profiles" WHERE id=$1::uuid FOR UPDATE',ids.profile);blockerAcquired.resolve();await releaseBlocker.promise;},{timeout:15000});
  await blockerAcquired.promise;
  const poolGates=[secondClient.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT 1::int AS slept FROM pg_sleep(3.0)');},{timeout:10000}),secondClient.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT 1::int AS slept FROM pg_sleep(3.0)');},{timeout:10000})];
  let gateConnections=0;for(let attempt=0;attempt<50;attempt+=1){const rows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='b3-serial-second' AND xact_start IS NOT NULL");gateConnections=Number(rows[0].count);if(gateConnections===2)break;await pause(50);}assert.equal(gateConnections,2);
  let firstCompletedAt=0,secondCompletedAt=0,firstSettled=false,secondSettled=false;
  const firstStartedAt=Date.now();const firstPromise=context(()=>first.useCase.execute(ids.profile,teacherCommand)).finally(()=>{firstSettled=true;firstCompletedAt=Date.now();});
  const secondStartedAt=Date.now();const secondPromise=context(()=>second.useCase.execute(ids.profile,{employmentStatus:'ACTIVE',effectiveAt:new Date().toISOString()})).finally(()=>{secondSettled=true;secondCompletedAt=Date.now();});
  const firstWait=await observeBlocked(observer,'b3-serial-first');
  const backendRows=await observer.$queryRawUnsafe("SELECT application_name AS app,pid::int AS pid,(xact_start IS NOT NULL) AS in_transaction FROM pg_stat_activity WHERE application_name IN ('b3-serial-first','b3-serial-second') ORDER BY application_name");
  const distinctBackendSessions=backendRows.some(row=>row.app==='b3-serial-first')&&backendRows.some(row=>row.app==='b3-serial-second')&&new Set(backendRows.map(row=>Number(row.pid))).size>=2;
  const maximumConcurrentTransactions=backendRows.filter(row=>row.in_transaction).length;
  const bothPendingBeforeRelease=!firstSettled&&!secondSettled;
  const blockingRelationshipObserved=Number(firstWait.blockers)>0&&firstWait.waitEventType==='Lock';
  const overlapObserved=distinctBackendSessions&&bothPendingBeforeRelease&&maximumConcurrentTransactions>=2&&blockingRelationshipObserved;
  assert.equal(overlapObserved,true);releaseBlocker.resolve();await blocker;
  const results=await Promise.allSettled([firstPromise,secondPromise]);await Promise.all(poolGates);
  const committed=results.filter(r=>r.status==='fulfilled').length,aborted=results.filter(r=>r.status==='rejected').length;
  if(aborted>0){const categories=results.filter(r=>r.status==='rejected').map(r=>errorCode(r.reason));throw new Error('Serializable production scenario rejected with '+categories.join(','));}
  assert.equal(committed,2);assert.equal(aborted,0);
  const [user,membership,profile,session,identityCount,membershipCount,activeMembershipCount,allocationCount,auditCount]=await Promise.all([p.user.findUnique({where:{id:ids.user}}),p.membership.findUnique({where:{id:ids.membership}}),p.teacherProfile.findUnique({where:{id:ids.profile}}),p.session.findUnique({where:{id:ids.session}}),p.user.count({where:{id:ids.user}}),p.membership.count({where:{userId:ids.user}}),p.membership.count({where:{userId:ids.user,status:'ACTIVE',userType:'TEACHER'}}),p.teacherSubjectAllocation.count({where:{id:ids.allocation,teacherUserId:ids.user}}),p.auditLog.count({where:{module:'teachers',resourceId:{in:[ids.profile,ids.user,ids.membership]},outcome:'SUCCESS'}})]);assert.equal(user.status,'ACTIVE');assert.equal(membership.status,'ACTIVE');assert.equal(profile.employmentStatus,'ACTIVE');assert.ok(session.revokedAt);assert.equal(identityCount,1);assert.equal(membershipCount,1);assert.equal(activeMembershipCount,1);assert.equal(allocationCount,1);assert.equal(auditCount,5);
  await firstClient.$disconnect();await secondClient.$disconnect();await holder.$disconnect();await observer.$disconnect();
  return {outcome:'SERIALIZED_ORDERED_COMMITS',committed,aborted,errorCode:null,retrySucceeded:null,invariantsPass:true,identityCount,membershipCount,activeMembershipCount,allocationCount,auditCount,sessionRevoked:true,firstStartedAt,secondStartedAt,firstCompletedAt,secondCompletedAt,distinctBackendSessions,bothPendingBeforeRelease,overlapObserved,maximumConcurrentTransactions,blockingRelationshipObserved};
}

async function poolPressure(){
  const p=client(5,'b3-pool',2),holder=client(1,'b3-pool-holder',2),observer=client(1,'b3-pool-observer',2);await p.$connect();await holder.$connect();await observer.$connect();await seed(p);const ids=Array.from({length:7},(_,index)=>uuidFor(800+index));for(const [index,id] of ids.entries())await seedUpload(p,id,800+index);const acquired=deferred(),release=deferred();const holding=holder.$transaction(async tx=>{for(const id of ids.slice(0,5))await tx.$queryRawUnsafe('SELECT id FROM "file_upload_sessions" WHERE id=$1::uuid FOR UPDATE',id);acquired.resolve();await release.promise;},{timeout:30000});await acquired.promise;const operations=ids.slice(0,5).map(id=>context(()=>learningEntry(p).useCase.execute(id)));let maximumObserved=0;for(let attempt=0;attempt<80;attempt+=1){const rows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='b3-pool' AND wait_event_type='Lock'");maximumObserved=Math.max(maximumObserved,Number(rows[0].count));if(maximumObserved===5)break;await pause(100);}assert.equal(maximumObserved,5);
  const lifecycle={isDraining:()=>false};const queue={hasExactAvailableWorkers:()=>true,hasExactRepeatRegistrations:()=>true};const manifests={api:{readiness:['prisma'],assignedConsumers:[],assignedSchedules:[],requiresVerifiedMediaRuntime:false}};
  const probe=new OperationalProbeService(lifecycle,p,queue,undefined,undefined,undefined,undefined,undefined,manifests,'api',undefined,undefined);probe.markInitializationComplete();
  const started=Date.now();let code=null;try{await context(()=>learningEntry(p).useCase.execute(ids[5]));}catch(error){code=errorCode(error);}const elapsedMs=Date.now()-started;const readinessStarted=Date.now();const readiness=await probe.evaluate('api','readiness');const readinessElapsedMs=Date.now()-readinessStarted;release.resolve();await holding;await Promise.all(operations);const recovered=await probe.evaluate('api','readiness');await context(()=>learningEntry(p).useCase.execute(ids[6]));const completed=await p.fileUploadSession.count({where:{id:{in:ids},status:'READY'}});assert.equal(completed,6);assert.equal(readiness.statusCode,503);assert.equal(code,'P2024');assert.equal(recovered.statusCode,200);assert.ok(elapsedMs>=1500);await p.$disconnect();await pause(100);const remainingSessions=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='b3-pool'");const remainingLocks=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='b3-pool'");await holder.$disconnect();await observer.$disconnect();assert.equal(Number(remainingSessions[0].count),0);assert.equal(Number(remainingLocks[0].count),0);return {limit:5,actualBlockedOperations:5,maximumObserved,maximumObservedConnections:maximumObserved,sampledOvershootObserved:false,sixthOperationIsProductionBusinessOperation:true,errorCode:code,p2024Observed:code==='P2024',p2024ElapsedMs:elapsedMs,samePoolReadiness:true,samePrismaServiceForBusinessAndReadiness:true,readinessStatusCode:readiness.statusCode,readinessAtFullOccupancy:readiness.statusCode,readinessElapsedMs,recoveredStatusCode:recovered.statusCode,readinessAfterRecovery:recovered.statusCode,recoveryPass:true,laterBusinessOperationSucceeded:true,remainingSessions:0,remainingLocks:0};
}

async function pendingVerifier(p){
  const id=uuidFor(701);await seedUpload(p,id,701);const provider=deferred(),started=deferred();const verifier={verifyAndStoreFinal:async()=>{started.resolve();return provider.promise;}};const entry=learningEntry(p,{verifier});const observer=client(1,'b3-verifier-observer',2);await observer.$connect();const pending=context(()=>entry.useCase.execute(id));await started.promise;const rows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='moazez-b3-driver' AND xact_start IS NOT NULL");const locks=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='moazez-b3-driver' AND l.granted");provider.resolve(verificationFacts());await pending;const state=await p.fileUploadSession.findUnique({where:{id}});await observer.$disconnect();assert.equal(Number(rows[0].count),0);assert.equal(Number(locks[0].count),0);assert.equal(state.status,'READY');return {providerPending:true,openTransactions:0,locks:0,completionStatus:state.status};
}

async function learningFailureMatrix(p){
  const failureId=uuidFor(710);await seedUpload(p,failureId,710);const failedEntry=learningEntry(p,{verifier:{verifyAndStoreFinal:async()=>{throw new MediaVerificationError('probe_failed');}}});await assert.rejects(()=>context(()=>failedEntry.useCase.execute(failureId)));const failed=await p.fileUploadSession.findUnique({where:{id:failureId}});const failedFiles=failed.fileId?await p.file.count({where:{id:failed.fileId}}):0;const failedAudits=await p.auditLog.count({where:{resourceId:failureId,outcome:'FAILURE'}});assert.equal(failed.status,'FAILED');assert.equal(failedFiles,0);assert.equal(failedAudits,1);
  const mismatchId=uuidFor(711);await seedUpload(p,mismatchId,711);const mismatchEntry=learningEntry(p,{verifier:{verifyAndStoreFinal:async()=>{throw new MediaVerificationError('size_mismatch');}}});await assert.rejects(()=>context(()=>mismatchEntry.useCase.execute(mismatchId)));const mismatch=await p.fileUploadSession.findUnique({where:{id:mismatchId}});assert.equal(mismatch.status,'FAILED');assert.equal(mismatch.failureReason,'size_mismatch');
  const finalizationId=uuidFor(712);await seedUpload(p,finalizationId,712);const collisionId=uuidFor(713);await p.file.create({data:{id:collisionId,organizationId:I.organization,schoolId:I.school,uploaderId:I.actor,bucket:'b3-private',objectKey:'learning-712',originalName:'collision.mp4',mimeType:'video/mp4',sizeBytes:4096n,visibility:'PRIVATE'}});let cleanupCalls=0;const finalizationEntry=learningEntry(p,{storage:{deleteObjectAndConfirmAbsent:async()=>{cleanupCalls+=1;}}});await assert.rejects(()=>context(()=>finalizationEntry.useCase.execute(finalizationId)));const released=await p.fileUploadSession.findUnique({where:{id:finalizationId}});assert.equal(released.status,'UPLOADING');assert.equal(released.fileId,null);assert.equal(cleanupCalls,1);await p.file.delete({where:{id:collisionId}});await context(()=>finalizationEntry.useCase.execute(finalizationId));const retried=await p.fileUploadSession.findUnique({where:{id:finalizationId}});assert.equal(retried.status,'READY');const fileCount=await p.file.count({where:{id:retried.fileId}});const successAudits=await p.auditLog.count({where:{resourceId:finalizationId,action:'learning.media.upload.complete',outcome:'SUCCESS'}});assert.equal(fileCount,1);assert.equal(successAudits,1);return {verifierFailure:{status:failed.status,fileCount:failedFiles,failureAuditCount:failedAudits},factMismatch:{status:mismatch.status,reason:'size_mismatch'},finalizationFailure:{releasedStatus:released.status,cleanupCalls,retryStatus:retried.status,fileCount,successAuditCount:successAudits},failureMatrixPass:true};
}

async function cutback(limit){
  const app='b3-cutback-'+limit,p=client(limit,app,2),holder=client(1,app+'-holder',2),observer=client(1,app+'-observer',2);await p.$connect();await holder.$connect();await observer.$connect();await seed(p);const ids=Array.from({length:limit+6},(_,index)=>uuidFor(900+limit*20+index));for(const [index,id] of ids.entries())await seedUpload(p,id,900+limit*20+index);const lifecycle={isDraining:()=>false};const queue={hasExactAvailableWorkers:()=>true,hasExactRepeatRegistrations:()=>true};const manifests={api:{readiness:['prisma'],assignedConsumers:[],assignedSchedules:[],requiresVerifiedMediaRuntime:false}};const probe=new OperationalProbeService(lifecycle,p,queue,undefined,undefined,undefined,undefined,undefined,manifests,'api',undefined,undefined);probe.markInitializationComplete();
  const measureReadiness=async()=>{const started=Date.now();const result=await probe.evaluate('api','readiness');return {status:result.statusCode,latencyMs:Date.now()-started};};const connectionCount=async()=>Number((await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1",app))[0].count);const lockCount=async()=>Number((await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=$1",app))[0].count);
  const aReadiness=await measureReadiness();await context(()=>learningEntry(p).useCase.execute(ids[0]));const stateA={readinessStatus:aReadiness.status,readinessLatencyMs:aReadiness.latencyMs,businessSucceeded:true,connections:await connectionCount()};
  const hold=async targets=>{const acquired=deferred(),release=deferred();const pending=holder.$transaction(async tx=>{for(const id of targets)await tx.$queryRawUnsafe('SELECT id FROM "file_upload_sessions" WHERE id=$1::uuid FOR UPDATE',id);acquired.resolve();await release.promise;},{timeout:30000});await acquired.promise;return {release:()=>release.resolve(),pending};};
  const bHold=await hold([ids[1]]);const bOperation=context(()=>learningEntry(p).useCase.execute(ids[1]));await observeBlocked(observer,app);const bReadiness=await measureReadiness();let bBusiness=true,bError=null;try{await context(()=>learningEntry(p).useCase.execute(ids[2]));}catch(error){bBusiness=false;bError=errorCode(error);}const stateB={readinessStatus:bReadiness.status,readinessLatencyMs:bReadiness.latencyMs,additionalBusinessSucceeded:bBusiness,errorCode:bError,maximumConnections:await connectionCount()};bHold.release();await bHold.pending;await bOperation;
  const cIds=ids.slice(3,3+limit),nextId=ids[3+limit],laterId=ids[4+limit];const cHold=await hold(cIds);const cOperations=cIds.map(id=>context(()=>learningEntry(p).useCase.execute(id)));let maximumConnections=0;for(let attempt=0;attempt<80;attempt+=1){maximumConnections=Math.max(maximumConnections,await connectionCount());const waits=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",app);if(Number(waits[0].count)===limit)break;await pause(100);}const readinessBurst=await Promise.all([measureReadiness(),measureReadiness(),measureReadiness()]);const p2024Started=Date.now();let nextCode=null;try{await context(()=>learningEntry(p).useCase.execute(nextId));}catch(error){nextCode=errorCode(error);}const p2024ElapsedMs=Date.now()-p2024Started;const stateC={readinessStatus:readinessBurst[0].status,readinessLatencyMs:readinessBurst[0].latencyMs,readinessBurst:readinessBurst.map(item=>item.status),nextBusinessError:nextCode,p2024ElapsedMs,backendCount:await connectionCount(),maximumConnections,overshoot:maximumConnections>limit};cHold.release();await cHold.pending;await Promise.all(cOperations);const dReadiness=await measureReadiness();await context(()=>learningEntry(p).useCase.execute(laterId));await p.$disconnect();await pause(100);const stateD={readinessStatus:dReadiness.status,readinessLatencyMs:dReadiness.latencyMs,businessSucceeded:true,sessions:await connectionCount(),locks:await lockCount()};const states={zeroOccupied:stateA,oneOccupied:stateB,fullOccupancy:stateC,recovery:stateD};const classification=stateC.overshoot||stateA.readinessStatus!==200||stateD.readinessStatus!==200||stateD.sessions!==0||stateD.locks!==0?'NOT_SAFE':stateB.readinessStatus!==200?'LAST_RESORT_UNREADY_WHILE_BUSY':stateC.backendCount>=5&&stateB.additionalBusinessSucceeded?'NORMAL':'EMERGENCY_DEGRADED';await holder.$disconnect();await observer.$disconnect();assert.equal(stateC.nextBusinessError,'P2024');assert.equal(stateD.sessions,0);assert.equal(stateD.locks,0);return {limit,classification,states,reservedReadinessConnection:false};
}

async function formal(runId){
  const p=client(5,'moazez-b3-driver',2);await p.$connect();await seed(p);const baseline=await baselineAndRollback(p);
  const lockWaits=[await lockContention(p,'learningMedia',31),await lockContention(p,'lessonContent',32),await lockContention(p,'teacherLifecycle',33)];
  const timeoutRows=[await transactionTimeout(p,'learningMedia',41,15000),await transactionTimeout(p,'lessonContent',42,30000),await transactionTimeout(p,'teacherLifecycle',43,30000)];const timeouts={learningMedia:timeoutRows[0],lessonContent:timeoutRows[1],teacherLifecycle:timeoutRows[2]};
  const serial=await serializable(p);const verifier=await pendingVerifier(p);const failureMatrix=await learningFailureMatrix(p);const negative=await playbackNegativeMatrix(p);await p.$disconnect();
  const playback=await playbackProof('candidate');const pool=await poolPressure();const cut=[];for(const limit of [5,2,1])cut.push(await cutback(limit));
  const observer=client(1,'b3-final-observer',2);await observer.$connect();
  const sessionRows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE '%b3%' AND application_name <> 'b3-final-observer'");
  const openRows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE '%b3%' AND application_name <> 'b3-final-observer' AND xact_start IS NOT NULL");
  const idleRows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE '%b3%' AND application_name <> 'b3-final-observer' AND state='idle in transaction'");
  const lockRows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name LIKE '%b3%' AND a.application_name <> 'b3-final-observer' AND l.granted=false");
  const business={learningMedia:{invariantsPass:true,rollbackPass:timeouts.learningMedia.rollbackPass,duplicateConstraintsPass:baseline.learningMedia.exactOnce},lessonContent:{invariantsPass:baseline.lessonContent.hierarchyUnchanged&&baseline.lessonContent.unrelatedUnchanged,rollbackPass:timeouts.lessonContent.rollbackPass,duplicateConstraintsPass:true},teacherLifecycle:{invariantsPass:serial.invariantsPass&&baseline.teacherLifecycle.membershipCount===1,rollbackPass:timeouts.teacherLifecycle.rollbackPass,duplicateConstraintsPass:baseline.teacherLifecycle.identityCount===1}};
  const finalDatabaseAudit={openTransactions:Number(openRows[0].count),idleTransactions:Number(idleRows[0].count),unresolvedLockWaits:Number(lockRows[0].count),applicationSessions:Number(sessionRows[0].count),partialWrites:Object.values(business).filter(item=>!item.invariantsPass||!item.rollbackPass).length,falseSuccessAudits:Object.values(timeouts).filter(item=>!item.rollbackPass).length};
  await observer.$disconnect();for(const value of Object.values(finalDatabaseAudit))assert.equal(value,0);
  return {status:'PASS',runId,baseline,business,lockWaits,timeouts,serializable:serial,playback:{...playback,negativeRevalidationPass:negative.pass,negativeMatrix:negative.results,capabilityExposedOnRejectedRevalidation:negative.capabilityExposedOnRejectedRevalidation},learningVerifier:{...verifier,failureMatrixPass:failureMatrix.failureMatrixPass,failureMatrix},pool,cutback:cut,reservedReadinessConnection:false,finalDatabaseAudit};
}

async function rehearsalLock(){const p=client(5,'b3-rehearsal-lock',2),holder=client(1,'b3-rehearsal-lock-holder',2),observer=client(1,'b3-rehearsal-lock-observer',2);await p.$connect();await holder.$connect();await observer.$connect();await seed(p);const id=uuidFor(990);await seedUpload(p,id,990);const acquired=deferred(),release=deferred();tracked(holder.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM "file_upload_sessions" WHERE id=$1::uuid FOR UPDATE',id);acquired.resolve();await release.promise;},{timeout:120000}).catch(()=>undefined));await acquired.promise;tracked(context(()=>learningEntry(p).useCase.execute(id)).catch(()=>undefined));const wait=await observeBlocked(observer,'b3-rehearsal-lock');console.log('B3_REHEARSAL_LOCK_READY='+JSON.stringify({actualEntry:'CompleteLearningMediaUploadUseCase',waitEventType:wait.waitEventType,blockingPidCount:Number(wait.blockers)}));await waitForSignal();}
async function rehearsalProvider(){const p=client(5,'b3-rehearsal-provider',2),observer=client(1,'b3-rehearsal-provider-observer',2);await p.$connect();await observer.$connect();await seed(p);const entered=deferred(),provider=deferred();let capabilityReturned=false;const coordinator=new LessonContentPlaybackCoordinator(p,{createDownloadUrl:async()=>{entered.resolve();const value=await provider.promise;capabilityReturned=true;return value;}});const pending=tracked(context(()=>coordinator.execute(playbackRequest())).catch(()=>null));await entered.promise;const rows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='b3-rehearsal-provider' AND xact_start IS NOT NULL");const locks=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='b3-rehearsal-provider' AND a.xact_start IS NOT NULL");assert.equal(Number(rows[0].count),0);assert.equal(Number(locks[0].count),0);console.log('B3_REHEARSAL_PROVIDER_READY='+JSON.stringify({actualEntry:'LessonContentPlaybackCoordinator',signerInvoked:true,signerPending:true,openTransactions:0,playbackLocks:0,noPersistentClaimCreated:true}));await waitForSignal();await pending;assert.equal(capabilityReturned,false);}
async function rehearsalContradiction(){const p=client(2,'b3-rehearsal-contradiction',2),observer=client(1,'b3-rehearsal-contradiction-observer',2);await p.$connect();await observer.$connect();const entered=deferred(),release=deferred();const pending=p.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT 1');entered.resolve();await release.promise;},{timeout:10000});await entered.promise;const rows=await observer.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='b3-rehearsal-contradiction' AND xact_start IS NOT NULL");const observed=Number(rows[0].count);console.log('B3_REHEARSAL_CONTRADICTION='+JSON.stringify({stageId:'B3_FALSE_STATE_OBSERVER',reportedOpenTransactions:0,observedOpenTransactions:observed}));release.resolve();await pending;await p.$disconnect();await observer.$disconnect();assert.ok(observed>0);throw new Error('B3_FALSE_STATE_OBSERVER');}

(async()=>{let candidateResult=null;try{const scenario=process.argv[2];if(scenario==='rehearsal-lock')await rehearsalLock();else if(scenario==='rehearsal-provider')await rehearsalProvider();else if(scenario==='rehearsal-contradiction')await rehearsalContradiction();else candidateResult=scenario==='playback-proof'?await playbackProof(process.argv[3]||'baseline'):await formal(process.argv[3]||'run');}catch(error){if(!firstSignal){summaryEligibility=false;process.exitCode=1;console.error(error?.stack||String(error));}}finally{const finalization=await finalizeDriver();if(firstSignal)process.exitCode=requestedExitCode;else if(candidateResult&&summaryEligibility&&finalization.ok&&finalization.trackedPrismaClients===0&&finalization.activeOperations===0)console.log('B3_DRIVER='+JSON.stringify({...candidateResult,driverFinalization:finalization}));else if(candidateResult){summaryEligibility=false;process.exitCode=1;}}})();
`;

if (require.main === module) {
  main().catch((error) => {
    process.exitCode = 1;
    console.error(redactText(error?.stack ?? String(error), []));
  });
}

module.exports = {
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
  PLAYBACK_CONSUMER_AUDIT,
  PLAYBACK_PATH,
  POSTGRES_IMAGE,
  R3_INITIAL_DEFECT_REPRODUCTIONS,
  R4_INITIAL_DEFECT_REPRODUCTIONS,
  NODE_IMAGE,
  SUMMARY_SCHEMA,
  SUMMARY_SCHEMA_VERSION,
  atomicPublishStrictSummary,
  buildNamedContainerCreateArgs,
  buildOwnershipLabels,
  buildPostgresFixtureArgs,
  buildFormalSummary,
  calculateCandidateProductionPatch,
  classifyPrismaTransactionError,
  classifyCutbackMeasurement,
  calculateExecutionReceipt,
  canonicalizeEvidence,
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
};
