'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseAcceptanceMatrix,
  validateCurrentPhase3Governance,
  validateProductionReadinessGovernance,
  validateQ007Governance,
  validateStorageCutoverGovernance,
  validateRepository,
} = require('../ci/validate-production-readiness-governance.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const MATRIX_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'production-readiness',
  'phase-0',
  '03-acceptance-and-risk-matrix.md',
);
const PHASE_2_CLOSEOUT_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'production-readiness',
  'phase-2',
  '02-runtime-role-separation-closeout.md',
);
const PHASE_3_CLOSEOUT_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'production-readiness',
  'phase-3',
  '10-phase-3-closeout.md',
);
const PHASE_3_CERTIFICATION_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'production-readiness',
  'phase-3',
  'phase-3-certification.json',
);

test('current production-readiness governance reconciles Phase 2 completion', () => {
  const result = validateRepository(REPOSITORY_ROOT);
  assert.ok(result.gateCount > 0);
  assert.equal(result.phase3GateCount, 6);
  assert.equal(result.phase3State, 'COMPLETE');
  assert.equal(
    result.phase3ProviderCleanupDebtState,
    'DEFERRED_NON_BLOCKING_PROVIDER_DEBT',
  );
  assert.equal(
    result.phase3PostMergeUniversalVerificationClassification,
    'UNCLASSIFIED',
  );
  assert.ok(result.storageCutoverCheckCount > 0);
  assert.ok(result.q007GovernanceCheckCount > 0);
  assert.equal(result.lockedDecisionCount, 34);
  assert.equal(result.ownerDecisionRequiredCount, 19);
  assert.equal(result.approvedOwnerQuestionCount, 31);
  assert.equal(result.pendingOwnerQuestionCount, 17);
  assert.deepEqual(
    result.authoritativeCompleted.filter((gate) => gate.startsWith('PRD2-')),
    ['PRD2-G01', 'PRD2-G02', 'PRD2-G03', 'PRD2-G04'],
  );
});

test('storage-cutover governance rejects an altered owner answer', () => {
  const documents = storageGovernanceDocuments();
  documents.disposition = documents.disposition.replace(
    'compatibility_window=NONE',
    'compatibility_window=one-release',
  );
  assert.throws(
    () => validateStorageCutoverGovernance(documents),
    /Owner disposition register is missing: PRD0-Q041/u,
  );
});

test('storage-cutover governance rejects premature real-data authorization', () => {
  const documents = storageGovernanceDocuments();
  documents.batch3Inventory += '\nSTORAGE_CUTOVER_READY_FOR_REAL_DATA=YES\n';
  assert.throws(
    () => validateStorageCutoverGovernance(documents),
    /prematurely authorizes/u,
  );
});

test('storage-cutover governance rejects a claimed GitHub runtime pass', () => {
  const documents = storageGovernanceDocuments();
  documents.releaseDecision = documents.releaseDecision.replace(
    'GITHUB_CI_RUNTIME_PASS=NOT_CLAIMED',
    'GITHUB_CI_RUNTIME_PASS=PASS',
  );
  assert.throws(
    () => validateStorageCutoverGovernance(documents),
    /GITHUB_CI_RUNTIME_PASS=NOT_CLAIMED|prematurely authorizes/u,
  );
});

test('storage-cutover release decision remains discoverable from the matrix', () => {
  const documents = storageGovernanceDocuments();
  documents.matrix = documents.matrix.replace(
    'phase-5a/03-storage-cutover-release-decision.md',
    'phase-5a/storage-release-decision-missing.md',
  );
  assert.throws(
    () => validateStorageCutoverGovernance(documents),
    /Acceptance matrix is missing: phase-5a\/03-storage-cutover-release-decision\.md/u,
  );
});

test('Q007 governance rejects regression to pending', () => {
  const documents = q007GovernanceDocuments();
  documents.disposition = documents.disposition.replace(
    '| PRD0-Q007 | APPROVED |',
    '| PRD0-Q007 | PENDING |',
  );
  assert.throws(
    () => validateQ007Governance(documents),
    /PRD0-Q007 must be APPROVED/u,
  );
});

test('Q007 governance rejects D028 returning to owner-decision-required', () => {
  const documents = q007GovernanceDocuments();
  documents.decisionRegister = documents.decisionRegister.replace(
    '| PRD0-D028 | Backups, PITR, RTO, RPO | LOCKED_FROM_APPROVED_CONTEXT |',
    '| PRD0-D028 | Backups, PITR, RTO, RPO | OWNER_DECISION_REQUIRED |',
  );
  assert.throws(
    () => validateQ007Governance(documents),
    /PRD0-D028 must be LOCKED_FROM_APPROVED_CONTEXT/u,
  );
});

test('Q007 governance rejects false backup or restore completion', () => {
  const documents = q007GovernanceDocuments();
  documents.matrix = documents.matrix
    .replace('BACKUPS_CONFIGURED=NO', 'BACKUPS_CONFIGURED=YES')
    .replace('RESTORE_DRILL_COMPLETE=NO', 'RESTORE_DRILL_COMPLETE=YES');
  assert.throws(
    () => validateQ007Governance(documents),
    /BACKUPS_CONFIGURED=YES|RESTORE_DRILL_COMPLETE=YES/u,
  );
});

test('Q007 governance rejects cross-region DR authorization', () => {
  const documents = q007GovernanceDocuments();
  documents.disposition = documents.disposition.replace(
    'cross_region=NO',
    'cross_region=YES',
  );
  assert.throws(
    () => validateQ007Governance(documents),
    /exact approved answer|cross_region=YES/u,
  );
});

test('Q007 governance rejects production launch authorization', () => {
  const documents = q007GovernanceDocuments();
  documents.releaseDecision = documents.releaseDecision.replace(
    'PRODUCTION_LAUNCH_AUTHORIZED=NO',
    'PRODUCTION_LAUNCH_AUTHORIZED=YES',
  );
  assert.throws(
    () => validateQ007Governance(documents),
    /PRODUCTION_LAUNCH_AUTHORIZED=YES/u,
  );
});

test('Q007 governance rejects disposition totals that do not match rows', () => {
  const documents = q007GovernanceDocuments();
  documents.disposition = documents.disposition.replace(
    '| APPROVED | 31 |',
    '| APPROVED | 30 |',
  );
  assert.throws(
    () => validateQ007Governance(documents),
    /Published owner disposition totals must match/u,
  );
});

test('current PRD3-G01 through PRD3-G06 lifecycle states are COMPLETE', () => {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
  const gates = parseAcceptanceMatrix(matrix);
  for (const gateId of [
    'PRD3-G01',
    'PRD3-G02',
    'PRD3-G03',
    'PRD3-G04',
    'PRD3-G05',
    'PRD3-G06',
  ]) {
    assert.equal(gates.get(gateId)?.status, 'COMPLETE', gateId);
  }
});

test('current Phase 3 governance rejects regression to an intermediate state', () => {
  const documents = phase3GovernanceDocuments();
  const phase2Closeout = fs.readFileSync(PHASE_2_CLOSEOUT_PATH, 'utf8');
  const regressed = documents.matrix.replace(
    /^(\| PRD3-G04 \|[^\r\n]*?)\| COMPLETE \|/mu,
    '$1| IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE |',
  );
  assert.notEqual(regressed, documents.matrix);
  assert.throws(
    () =>
      validateCurrentPhase3Governance(
        regressed,
        documents.closeout,
        documents.certification,
      ),
    /PRD3-G04 must remain COMPLETE/u,
  );
  assert.throws(
    () => validateProductionReadinessGovernance(regressed, phase2Closeout),
    /PRD3-G04 must be COMPLETE/u,
  );
});

test('current Phase 3 governance reconciles both preserved debts with closeout', () => {
  const documents = phase3GovernanceDocuments();
  const result = validateCurrentPhase3Governance(
    documents.matrix,
    documents.closeout,
    documents.certification,
  );
  assert.equal(
    result.phase3ProviderCleanupDebtState,
    'DEFERRED_NON_BLOCKING_PROVIDER_DEBT',
  );
  assert.equal(
    result.phase3PostMergeUniversalVerificationDebtState,
    'DEFERRED_NON_BLOCKING_UNCLASSIFIED_VERIFICATION_DEBT',
  );
  assert.equal(
    result.phase3PostMergeUniversalVerificationClassification,
    'UNCLASSIFIED',
  );

  const providerDebtAltered = documents.matrix.replace(
    'PRD3-G01-PROVIDER-CLEANUP=DEFERRED_NON_BLOCKING_PROVIDER_DEBT',
    'PRD3-G01-PROVIDER-CLEANUP=RESOLVED',
  );
  assert.throws(
    () =>
      validateCurrentPhase3Governance(
        providerDebtAltered,
        documents.closeout,
        documents.certification,
      ),
    /must preserve PRD3-G01-PROVIDER-CLEANUP/u,
  );
});

test('current deferred Universal debt cannot be reclassified or resolved', () => {
  const documents = phase3GovernanceDocuments();
  for (const replacement of [
    'FLAKE',
    'PRODUCT_DEFECT',
    'TEST_DEFECT',
    'RESOLVED',
  ]) {
    const altered = documents.matrix.replace(
      'UNCLASSIFIED post-merge verification debt',
      `${replacement} post-merge verification debt`,
    );
    assert.notEqual(altered, documents.matrix);
    assert.throws(
      () =>
        validateCurrentPhase3Governance(
          altered,
          documents.closeout,
          documents.certification,
        ),
      /must preserve the exact Owner-deferred/u,
    );
  }
});

test('completed gate fails when its completed prerequisite regresses to NOT_STARTED', () => {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
  const closeout = fs.readFileSync(PHASE_2_CLOSEOUT_PATH, 'utf8');
  const regressed = matrix.replace(
    /^(\| PRD2-G04 \|[^\r\n]*?)\| COMPLETE \|/mu,
    '$1| NOT_STARTED |',
  );
  assert.notEqual(regressed, matrix);
  assert.throws(
    () => validateProductionReadinessGovernance(regressed, closeout),
    (error) => {
      assert.match(error.message, /PRD3-G01/u);
      assert.match(error.message, /PRD2-G04/u);
      assert.match(error.message, /NOT_STARTED/u);
      return true;
    },
  );
});

test('unknown gate status remains rejected', () => {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
  const closeout = fs.readFileSync(PHASE_2_CLOSEOUT_PATH, 'utf8');
  const invalid = matrix.replace(
    /^(\| PRD3-G01 \|[^\r\n]*?)\| COMPLETE \|/mu,
    '$1| UNKNOWN_LIFECYCLE_STATE |',
  );
  assert.notEqual(invalid, matrix);
  assert.throws(
    () => validateProductionReadinessGovernance(invalid, closeout),
    /Governance gate PRD3-G01 has no parseable status\/prerequisite/u,
  );
});

function phase3GovernanceDocuments() {
  return {
    matrix: fs.readFileSync(MATRIX_PATH, 'utf8'),
    closeout: fs.readFileSync(PHASE_3_CLOSEOUT_PATH, 'utf8'),
    certification: JSON.parse(
      fs.readFileSync(PHASE_3_CERTIFICATION_PATH, 'utf8'),
    ),
  };
}

function storageGovernanceDocuments() {
  const read = (...segments) =>
    fs.readFileSync(path.join(REPOSITORY_ROOT, ...segments), 'utf8');
  return {
    matrix: read(
      'docs',
      'production-readiness',
      'phase-0',
      '03-acceptance-and-risk-matrix.md',
    ),
    disposition: read(
      'docs',
      'production-readiness',
      'phase-0',
      '05-owner-decision-disposition-register.md',
    ),
    runbook: read(
      'docs',
      'production-readiness',
      'phase-5a',
      '01-gcs-iac-and-real-proof-runbook.md',
    ),
    adr0013: read(
      'adr',
      'ADR-0013-file-security-retention-and-reference-aware-lifecycle.md',
    ),
    decisionRegister: read(
      'docs',
      'production-readiness',
      'phase-0',
      '02-production-decision-register.md',
    ),
    batch3Inventory: read(
      'docs',
      'production-readiness',
      'phase-5a',
      '02-storage-batch-3-source-cutover.md',
    ),
    releaseDecision: read(
      'docs',
      'production-readiness',
      'phase-5a',
      '03-storage-cutover-release-decision.md',
    ),
  };
}

function q007GovernanceDocuments() {
  const documents = storageGovernanceDocuments();
  return {
    decisionRegister: documents.decisionRegister,
    disposition: documents.disposition,
    matrix: documents.matrix,
    releaseDecision: documents.releaseDecision,
    runbook: documents.runbook,
  };
}
