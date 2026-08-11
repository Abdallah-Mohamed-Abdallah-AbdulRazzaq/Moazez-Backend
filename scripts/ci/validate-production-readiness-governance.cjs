'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  validateHistoricalPhase3Certification,
} = require('./prd3-g06-phase3-regression.cjs');

const ACTIVE_GATE_STATUSES = new Set([
  'BASELINE_ONLY',
  'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
  'IN_PROGRESS',
]);
const PREREQUISITE_ENFORCED_GATE_STATUSES = new Set([
  ...ACTIVE_GATE_STATUSES,
  'COMPLETE',
]);
const KNOWN_GATE_STATUSES = new Set([
  ...ACTIVE_GATE_STATUSES,
  'BLOCKED_BY_OWNER',
  'COMPLETE',
  'N/A_WITH_EVIDENCE',
  'NOT_STARTED',
]);
const PHASE_2_PREREQUISITES = Object.freeze({
  'PRD2-G01': 'PRD0B-G02, PRD1-G07',
  'PRD2-G02': 'PRD2-G01',
  'PRD2-G03': 'PRD2-G01',
  'PRD2-G04': 'PRD2-G02–PRD2-G03',
});
const PHASE_2_CLOSEOUT_TOKENS = Object.freeze([
  '- PRD2_G01: COMPLETE',
  '- PRD2_G02: COMPLETE',
  '- PRD2_G03: COMPLETE',
  '- PRD2_G04: COMPLETE',
  '- PHASE_2: COMPLETE',
  '- API consumers: 0',
  '- API repeat registrations: 0',
  '- Core Worker consumers: 6',
  '- Core Worker repeat registrations: 0',
  '- Media Worker consumers: 1',
  '- Media Worker repeat registrations: 0',
  '- Maintenance Scheduler consumers: 0',
  '- Maintenance Scheduler repeat registrations: 3',
  '- Implementation PR: #62',
  '- Final candidate: `36ec4fd7a2c9f82bacc9a8f5c5260ad7fa03988b`',
  '- Implementation merge: `e444cc629ff645a7aa0e688c36c4391275a4d654`',
  '- Successful Universal Regression confirmation run: `30820391152`',
  '- Learning Media completion remains HTTP 200.',
]);
const Q041_APPROVED_ANSWER =
  'PRD0-Q041: option=D; allowlist=HTTPS external URLs only, with all direct GCS/Google Cloud Storage/MinIO/S3-compatible provider URLs forbidden for new writes; compatibility_window=NONE; legacy_owner=Abdallah; approver=Abdallah';
const Q042_APPROVED_ANSWER =
  'PRD0-Q042: managed=ALLOW managed File-backed branding for new writes and reads; external_https=READ_ONLY compatibility only where an already-persisted safe HTTPS value exists, with no new legacy URL writes; provider_url=BLOCK_NEW and treat any discovered legacy provider URL as a cutover blocker requiring explicit inventory/review; unsafe=REJECT; null=ALLOW; approver=Abdallah';
const PHASE_3_GATE_IDS = Object.freeze([
  'PRD3-G01',
  'PRD3-G02',
  'PRD3-G03',
  'PRD3-G04',
  'PRD3-G05',
  'PRD3-G06',
]);

function parseAcceptanceMatrix(matrixText) {
  const gates = new Map();
  for (const line of matrixText.split(/\r?\n/u)) {
    if (!/^\| PRD\d+[A-Z]?-G\d{2} \|/u.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const id = cells[0];
    const statusIndex = cells.findIndex((cell) =>
      KNOWN_GATE_STATUSES.has(cell),
    );
    if (statusIndex < 0 || !cells[statusIndex + 1]) {
      throw new Error(
        `Governance gate ${id} has no parseable status/prerequisite`,
      );
    }
    if (gates.has(id)) {
      throw new Error(`Governance gate ${id} is duplicated`);
    }
    gates.set(id, {
      id,
      line,
      prerequisites: cells[statusIndex + 1],
      status: cells[statusIndex],
    });
  }
  return gates;
}

function parseAuthoritativeCompletedGates(closeoutText) {
  const completed = new Set();
  for (const match of closeoutText.matchAll(
    /^- (PRD\d+[A-Z]?)_G(\d{2}): COMPLETE$/gmu,
  )) {
    completed.add(`${match[1]}-G${match[2]}`);
  }
  return completed;
}

function prerequisiteGateIds(prerequisites) {
  return new Set(prerequisites.match(/PRD\d+[A-Z]?-G\d{2}/gu) ?? []);
}

function validateProductionReadinessGovernance(matrixText, phase2CloseoutText) {
  const problems = [];
  const gates = parseAcceptanceMatrix(matrixText);
  const authoritativeCompleted =
    parseAuthoritativeCompletedGates(phase2CloseoutText);

  for (const token of PHASE_2_CLOSEOUT_TOKENS) {
    if (!phase2CloseoutText.includes(token)) {
      problems.push(`Phase 2 closeout evidence is missing: ${token}`);
    }
  }

  for (const [gateId, prerequisites] of Object.entries(PHASE_2_PREREQUISITES)) {
    const gate = gates.get(gateId);
    if (!gate) {
      problems.push(`Acceptance matrix is missing ${gateId}`);
      continue;
    }
    if (!authoritativeCompleted.has(gateId)) {
      problems.push(`Phase 2 closeout does not mark ${gateId} COMPLETE`);
    }
    if (gate.status !== 'COMPLETE') {
      problems.push(
        `${gateId} is ${gate.status} in the acceptance matrix but authoritative Phase 2 evidence marks it COMPLETE`,
      );
    }
    if (gate.prerequisites !== prerequisites) {
      problems.push(
        `${gateId} prerequisites must remain exactly ${prerequisites}`,
      );
    }
  }

  for (const gate of gates.values()) {
    if (!PREREQUISITE_ENFORCED_GATE_STATUSES.has(gate.status)) continue;
    for (const prerequisiteId of prerequisiteGateIds(gate.prerequisites)) {
      if (!authoritativeCompleted.has(prerequisiteId)) continue;
      const prerequisite = gates.get(prerequisiteId);
      if (prerequisite?.status === 'NOT_STARTED') {
        problems.push(
          `${gate.id} is ${gate.status} while authoritative completed prerequisite ${prerequisiteId} is incorrectly NOT_STARTED`,
        );
      }
    }
  }

  for (const gateId of PHASE_3_GATE_IDS) {
    if (gates.get(gateId)?.status !== 'COMPLETE') {
      problems.push(`${gateId} must be COMPLETE`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Production-readiness governance validation failed:\n- ${problems.join('\n- ')}`,
    );
  }

  return Object.freeze({
    authoritativeCompleted: Object.freeze([...authoritativeCompleted].sort()),
    gateCount: gates.size,
  });
}

function countExactLine(source, expectedLine) {
  return source.split(/\r?\n/gu).filter((line) => line === expectedLine).length;
}

function validateCurrentPhase3Governance(
  matrixText,
  phase3CloseoutText,
  certification,
) {
  const historical = validateHistoricalPhase3Certification(
    certification,
    phase3CloseoutText,
  );
  const problems = [];
  const gates = parseAcceptanceMatrix(matrixText);

  for (const gateId of PHASE_3_GATE_IDS) {
    const gate = gates.get(gateId);
    if (!gate) {
      problems.push(`Acceptance matrix is missing ${gateId}`);
    } else if (gate.status !== 'COMPLETE') {
      problems.push(`${gateId} must remain COMPLETE, not ${gate.status}`);
    }
    const exactAssignment = `${gateId}=${certification.gateStatuses[gateId]}`;
    if (countExactLine(matrixText, exactAssignment) !== 1) {
      problems.push(
        `Acceptance matrix must contain exactly one ${exactAssignment}`,
      );
    }
  }

  const phaseAssignment = `PHASE_3=${certification.gateStatuses.PHASE_3}`;
  if (countExactLine(matrixText, phaseAssignment) !== 1) {
    problems.push(
      `Acceptance matrix must contain exactly one ${phaseAssignment}`,
    );
  }

  const providerDebt = certification.deferredDebts.providerCleanup;
  const providerDebtAssignment = `PRD3-G01-PROVIDER-CLEANUP=${providerDebt.status}`;
  if (countExactLine(matrixText, providerDebtAssignment) !== 1) {
    problems.push(`Acceptance matrix must preserve ${providerDebtAssignment}`);
  }

  const verificationDebt =
    certification.deferredDebts.postMergeUniversalVerification;
  const verificationDebtSentence =
    `Post-merge Universal run \`${verificationDebt.runId}\` ${verificationDebt.result} ` +
    `is separate Owner-accepted deferred, non-blocking, ${verificationDebt.classification} ` +
    'post-merge verification debt and is not a failure of the accepted exact-candidate G06 evidence.';
  if (matrixText.split(verificationDebtSentence).length - 1 !== 1) {
    problems.push(
      'Acceptance matrix must preserve the exact Owner-deferred, non-blocking, UNCLASSIFIED post-merge Universal debt',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Current Phase 3 governance validation failed:\n- ${problems.join('\n- ')}`,
    );
  }

  return Object.freeze({
    phase3Completed: Object.freeze([...PHASE_3_GATE_IDS]),
    phase3GateCount: PHASE_3_GATE_IDS.length,
    phase3State: historical.phase3State,
    phase3ProviderCleanupDebtState: providerDebt.status,
    phase3PostMergeUniversalVerificationDebtState: verificationDebt.status,
    phase3PostMergeUniversalVerificationClassification:
      verificationDebt.classification,
  });
}

function validateStorageCutoverGovernance(documents) {
  const problems = [];
  let checkCount = 0;
  const requireToken = (name, text, token) => {
    checkCount += 1;
    if (!text.includes(token)) problems.push(`${name} is missing: ${token}`);
  };

  requireToken(
    'Owner disposition register',
    documents.disposition,
    Q041_APPROVED_ANSWER,
  );
  requireToken(
    'Owner disposition register',
    documents.disposition,
    Q042_APPROVED_ANSWER,
  );
  requireToken(
    'Owner disposition register',
    documents.disposition,
    '| APPROVED | 30 |',
  );
  requireToken(
    'Owner disposition register',
    documents.disposition,
    '| PENDING | 18 |',
  );
  requireToken(
    'Owner disposition register',
    documents.disposition,
    'amendment added Q041 and Q042',
  );
  requireToken('Acceptance matrix', documents.matrix, '| PRD5A-G03 |');
  const gates = parseAcceptanceMatrix(documents.matrix);
  checkCount += 2;
  if (gates.get('PRD5A-G03')?.status !== 'COMPLETE') {
    problems.push('PRD5A-G03 must be COMPLETE after accepted Batch 2 closure');
  }
  if (gates.get('PRD5A-G07')?.status !== 'IN_PROGRESS') {
    problems.push(
      'PRD5A-G07 must remain IN_PROGRESS pending production audit evidence',
    );
  }

  for (const token of [
    'BATCH_2=CLOSED',
    'PRD5A-G03=COMPLETE',
    'NONPROD_GCS_OBJECT_CONTRACT_PROOF=PASS',
    'PRODUCTION_GCS_PROVISIONING=PASS',
    'PRODUCTION_GCS_READONLY_PROOF=PASS',
    'PRODUCTION_PRIVATE_LIVE=0',
    'PRODUCTION_PRIVATE_NONCURRENT=0',
    'PRODUCTION_PRIVATE_SOFT_DELETED=0',
    'PRODUCTION_PUBLISHED_LIVE=0',
    'PRODUCTION_PUBLISHED_NONCURRENT=0',
    'PRODUCTION_PUBLISHED_SOFT_DELETED=0',
    'PRODUCTION_OBJECT_WRITES_DURING_BATCH2=0',
    'PHASE_5A=NOT_COMPLETE',
    'REAL_DATA_ALLOWED=NO',
  ]) {
    requireToken('Phase 5A runbook', documents.runbook, token);
  }

  requireToken(
    'ADR-0013',
    documents.adr0013,
    '| PRD0-D046 | PRD0-Q041 | Accepted |',
  );
  requireToken(
    'ADR-0013',
    documents.adr0013,
    '| PRD0-D047 | PRD0-Q042 | Accepted |',
  );
  requireToken(
    'Decision register',
    documents.decisionRegister,
    '33\n`LOCKED_FROM_APPROVED_CONTEXT`, 20 `OWNER_DECISION_REQUIRED`',
  );
  requireToken(
    'Batch 3 inventory',
    documents.batch3Inventory,
    'Current count: **22 consumer classes across 21 files**.',
  );
  requireToken(
    'Batch 3 inventory',
    documents.batch3Inventory,
    'Current count: **16 functional families**',
  );
  requireToken(
    'Batch 3 inventory',
    documents.batch3Inventory,
    'UNRESOLVED_PROVIDER_URL_SURFACE=NONE',
  );

  checkCount += 1;
  const combined = Object.values(documents).join('\n');
  if (
    combined.includes('STORAGE_CUTOVER_READY_FOR_REAL_DATA=YES') ||
    documents.runbook.includes('PHASE_5A=COMPLETE') ||
    documents.runbook.includes('REAL_DATA_ALLOWED=YES')
  ) {
    problems.push(
      'Storage governance prematurely authorizes Phase 5A or real data',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Storage-cutover governance validation failed:\n- ${problems.join('\n- ')}`,
    );
  }
  return Object.freeze({ checkCount });
}

function validateRepository(repositoryRoot) {
  const matrixPath = path.join(
    repositoryRoot,
    'docs',
    'production-readiness',
    'phase-0',
    '03-acceptance-and-risk-matrix.md',
  );
  const closeoutPath = path.join(
    repositoryRoot,
    'docs',
    'production-readiness',
    'phase-2',
    '02-runtime-role-separation-closeout.md',
  );
  const governance = validateProductionReadinessGovernance(
    fs.readFileSync(matrixPath, 'utf8'),
    fs.readFileSync(closeoutPath, 'utf8'),
  );
  const read = (...segments) =>
    fs.readFileSync(path.join(repositoryRoot, ...segments), 'utf8');
  const phase3 = validateCurrentPhase3Governance(
    fs.readFileSync(matrixPath, 'utf8'),
    read('docs', 'production-readiness', 'phase-3', '10-phase-3-closeout.md'),
    JSON.parse(
      read(
        'docs',
        'production-readiness',
        'phase-3',
        'phase-3-certification.json',
      ),
    ),
  );
  const storageCutover = validateStorageCutoverGovernance({
    matrix: fs.readFileSync(matrixPath, 'utf8'),
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
  });
  return Object.freeze({
    ...governance,
    ...phase3,
    storageCutoverCheckCount: storageCutover.checkCount,
  });
}

if (require.main === module) {
  const result = validateRepository(path.resolve(__dirname, '..', '..'));
  process.stdout.write(
    `Production-readiness governance verified: gates=${result.gateCount} phase3Gates=${result.phase3GateCount} storageCutoverChecks=${result.storageCutoverCheckCount}\n`,
  );
}

module.exports = {
  parseAcceptanceMatrix,
  validateCurrentPhase3Governance,
  validateProductionReadinessGovernance,
  validateStorageCutoverGovernance,
  validateRepository,
};
