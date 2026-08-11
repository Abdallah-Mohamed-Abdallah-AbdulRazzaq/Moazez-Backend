'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseAcceptanceMatrix,
  validateProductionReadinessGovernance,
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

test('current production-readiness governance reconciles Phase 2 completion', () => {
  const result = validateRepository(REPOSITORY_ROOT);
  assert.ok(result.gateCount > 0);
  assert.ok(result.storageCutoverCheckCount > 0);
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

test('current PRD3-G01 lifecycle state is COMPLETE', () => {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
  assert.equal(
    parseAcceptanceMatrix(matrix).get('PRD3-G01')?.status,
    'COMPLETE',
  );
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
  };
}
