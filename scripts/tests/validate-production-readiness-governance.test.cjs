'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseAcceptanceMatrix,
  validateProductionReadinessGovernance,
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
  assert.deepEqual(
    result.authoritativeCompleted.filter((gate) => gate.startsWith('PRD2-')),
    ['PRD2-G01', 'PRD2-G02', 'PRD2-G03', 'PRD2-G04'],
  );
});

test('current PRD3-G01 lifecycle state is COMPLETE', () => {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
  assert.equal(parseAcceptanceMatrix(matrix).get('PRD3-G01')?.status, 'COMPLETE');
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
