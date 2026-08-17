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
const Q007_APPROVED_ANSWER =
  'PRD0-Q007: rto=30m; rpo=15m; pitr=14d; backup_retention=30d; restore_drill=quarterly; cross_region=NO; approver=Abdallah; approval_date=2026-08-12; timezone=Africa/Cairo';
const Q020_APPROVED_ANSWER =
  'PRD0-Q020: option=A; cadence=90d; overlap=7d; emergency_owner=Abdallah; release_owner=Abdallah';
const Q021_APPROVED_ANSWER =
  'PRD0-Q021: option=A; envelope_version=v2; key_families=smtp-secret,app-device-token; rotation_cadence=90d; security_approver=Abdallah';
const Q023_STAGING_APPROVED_DISPOSITION =
  'PRD0-Q023-STAGING=APPROVED(scope=STAGING_ONLY,option=A,api_domain=staging-api.moazez.cloud,ingress=internal-and-cloud-load-balancing,cloud_armor=YES,trusted_proxies=GOOGLE_CLOUD_EXTERNAL_APPLICATION_LOAD_BALANCER_ONLY,direct_public_run_app=NO,approver=Abdallah,approved_at=2026-08-16T19:00:00+03:00)';
const Q023_PRODUCTION_PENDING_DISPOSITION =
  'PRD0-Q023-PRODUCTION=PENDING(owner=Abdallah,deadline=before production Phase 7/8,constraint=Production API hostname and edge disposition remain unapproved; silence authorizes no production implementation or cloud provisioning)';
const Q023_SCOPED_DISPOSITION = `${Q023_STAGING_APPROVED_DISPOSITION}; ${Q023_PRODUCTION_PENDING_DISPOSITION}`;
const STORAGE_RELEASE_DECISION_PATH =
  'docs/production-readiness/phase-5a/03-storage-cutover-release-decision.md';
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

function parseGovernanceRows(source, prefix) {
  return source
    .split(/\r?\n/gu)
    .filter((line) => line.startsWith(`| ${prefix}`))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter(([id]) => new RegExp(`^${prefix}\\d{3}$`, 'u').test(id));
}

function validateQ007Governance(documents) {
  const problems = [];
  let checkCount = 0;
  const normalizedDecisionRegister = documents.decisionRegister.replace(
    /\r\n/gu,
    '\n',
  );
  const requireToken = (name, text, token) => {
    checkCount += 1;
    if (!text.includes(token)) problems.push(`${name} is missing: ${token}`);
  };
  const dispositionRows = parseGovernanceRows(documents.disposition, 'PRD0-Q');
  const q007 = dispositionRows.find(([id]) => id === 'PRD0-Q007');
  const approvedCount = dispositionRows.filter(
    ([, status]) => status === 'APPROVED',
  ).length;
  const pendingCount = dispositionRows.filter(
    ([, status]) => status === 'PENDING',
  ).length;
  const dispositionIdCount = new Set(dispositionRows.map(([id]) => id)).size;

  checkCount += 4;
  if (q007?.[1] !== 'APPROVED') {
    problems.push('PRD0-Q007 must be APPROVED');
  }
  if (q007?.[2] !== `\`${Q007_APPROVED_ANSWER}\``) {
    problems.push('PRD0-Q007 must preserve the exact approved answer');
  }
  if (q007?.[2]?.includes('approved_at=')) {
    problems.push('PRD0-Q007 must not invent an approved_at timestamp');
  }
  if (
    dispositionRows.length !== 48 ||
    dispositionIdCount !== 48 ||
    approvedCount !== 33 ||
    pendingCount !== 15
  ) {
    problems.push(
      'Owner disposition rows must total 48 with 33 APPROVED and 15 PENDING',
    );
  }
  for (const token of [
    `| Total | ${dispositionRows.length} |`,
    `| APPROVED | ${approvedCount} |`,
    `| PENDING | ${pendingCount} |`,
    '| Omitted | 0 |',
    '| Duplicated | 0 |',
  ]) {
    requireToken(
      'Published owner disposition totals must match rows',
      documents.disposition,
      token,
    );
  }

  const decisionRows = parseGovernanceRows(
    documents.decisionRegister,
    'PRD0-D',
  );
  const d028 = decisionRows.find(([id]) => id === 'PRD0-D028');
  const lockedCount = decisionRows.filter(
    ([, , status]) => status === 'LOCKED_FROM_APPROVED_CONTEXT',
  ).length;
  const ownerRequiredCount = decisionRows.filter(
    ([, , status]) => status === 'OWNER_DECISION_REQUIRED',
  ).length;
  const decisionIdCount = new Set(decisionRows.map(([id]) => id)).size;

  checkCount += 3;
  if (d028?.[2] !== 'LOCKED_FROM_APPROVED_CONTEXT') {
    problems.push('PRD0-D028 must be LOCKED_FROM_APPROVED_CONTEXT');
  }
  if (!d028?.[4]?.includes('PRD0-Q007')) {
    problems.push('PRD0-D028 must be explicitly bound to PRD0-Q007');
  }
  if (
    decisionRows.length !== 53 ||
    decisionIdCount !== 53 ||
    lockedCount !== 36 ||
    ownerRequiredCount !== 17
  ) {
    problems.push(
      'Decision rows must total 53 with 36 LOCKED_FROM_APPROVED_CONTEXT and 17 OWNER_DECISION_REQUIRED',
    );
  }
  requireToken(
    'Published decision totals must match rows',
    normalizedDecisionRegister,
    `${lockedCount}\n\`LOCKED_FROM_APPROVED_CONTEXT\`, ${ownerRequiredCount} \`OWNER_DECISION_REQUIRED\`, 0\n\`PROPOSED_RECOMMENDATION\`, 0\n\`DEFERRED_WITH_CONSTRAINT\`, and 0 \`REJECTED\``,
  );

  requireToken(
    'Decision register',
    normalizedDecisionRegister,
    'PRD0-Q007 was\n  approved by Abdallah on 2026-08-12 in Africa/Cairo',
  );
  requireToken(
    'Decision register',
    normalizedDecisionRegister,
    '`cross_region=NO`',
  );
  for (const token of [
    'RECOVERY_POLICY_APPROVED=YES',
    'RECOVERY_IMPLEMENTATION_COMPLETE=NO',
    'PRODUCTION_CLOUD_SQL_EXISTS=NO',
    'STAGING_CLOUD_SQL_EXISTS=NO',
    'BACKUPS_CONFIGURED=NO',
    'PITR_CONFIGURED=NO',
    'RESTORE_DRILL_COMPLETE=NO',
    'RTO_PROVEN=NO',
    'RPO_PROVEN=NO',
    'HA_FAILOVER_PROVEN_FOR_FINAL_PRODUCTION=NO',
    'CROSS_REGION_DR_AUTHORIZED=NO',
    'PRODUCTION_DATA_ALLOWED=NO',
  ]) {
    requireToken('Acceptance matrix', documents.matrix, token);
  }
  for (const token of [
    'STORAGE_CUTOVER_READY_FOR_REAL_DATA=NO',
    'REAL_DATA=FORBIDDEN',
    'PRODUCTION_UPLOADS_ALLOWED=NO',
    'PRODUCTION_TRAFFIC_ALLOWED=NO',
    'PRODUCTION_LAUNCH_AUTHORIZED=NO',
  ]) {
    requireToken('Storage release decision', documents.releaseDecision, token);
  }
  requireToken(
    'Phase 5A runbook',
    documents.runbook,
    'PRODUCTION_DATA_ALLOWED=NO',
  );

  checkCount += 1;
  const combined = Object.values(documents).join('\n');
  for (const forbidden of [
    'RECOVERY_IMPLEMENTATION_COMPLETE=YES',
    'PRODUCTION_CLOUD_SQL_EXISTS=YES',
    'STAGING_CLOUD_SQL_EXISTS=YES',
    'BACKUPS_CONFIGURED=YES',
    'PITR_CONFIGURED=YES',
    'RESTORE_DRILL_COMPLETE=YES',
    'RTO_PROVEN=YES',
    'RPO_PROVEN=YES',
    'HA_FAILOVER_PROVEN_FOR_FINAL_PRODUCTION=YES',
    'CROSS_REGION_DR_AUTHORIZED=YES',
    'cross_region=YES',
    'PRODUCTION_DATA_ALLOWED=YES',
    'STORAGE_CUTOVER_READY_FOR_REAL_DATA=YES',
    'PRODUCTION_UPLOADS_ALLOWED=YES',
    'PRODUCTION_TRAFFIC_ALLOWED=YES',
    'PRODUCTION_LAUNCH_AUTHORIZED=YES',
  ]) {
    if (combined.includes(forbidden)) {
      problems.push(
        `Q007 governance must not claim or authorize: ${forbidden}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `PRD0-Q007 governance validation failed:\n- ${problems.join('\n- ')}`,
    );
  }
  return Object.freeze({
    approvedOwnerQuestionCount: approvedCount,
    checkCount,
    lockedDecisionCount: lockedCount,
    ownerDecisionRequiredCount: ownerRequiredCount,
    pendingOwnerQuestionCount: pendingCount,
  });
}

function validateQ020Q021Governance(documents) {
  const problems = [];
  let checkCount = 0;
  const requireToken = (name, text, token) => {
    checkCount += 1;
    if (!text.includes(token)) problems.push(`${name} is missing: ${token}`);
  };

  const dispositionRows = parseGovernanceRows(documents.disposition, 'PRD0-Q');
  const questionById = new Map(dispositionRows.map((row) => [row[0], row]));
  const approvedCount = dispositionRows.filter(
    ([, status]) => status === 'APPROVED',
  ).length;
  const pendingCount = dispositionRows.filter(
    ([, status]) => status === 'PENDING',
  ).length;
  const dispositionIdCount = new Set(dispositionRows.map(([id]) => id)).size;

  for (const [questionId, approvedAnswer] of [
    ['PRD0-Q020', Q020_APPROVED_ANSWER],
    ['PRD0-Q021', Q021_APPROVED_ANSWER],
  ]) {
    checkCount += 2;
    const row = questionById.get(questionId);
    if (row?.[1] !== 'APPROVED') {
      problems.push(`${questionId} must be APPROVED`);
    }
    if (row?.[2] !== `\`${approvedAnswer}\``) {
      problems.push(`${questionId} must preserve the exact approved answer`);
    }
    requireToken(
      'Owner questionnaire',
      documents.questionnaire,
      approvedAnswer,
    );
  }

  const q023 = questionById.get('PRD0-Q023');
  checkCount += 3;
  if (q023?.[1] !== 'PENDING') {
    problems.push('PRD0-Q023 must remain PENDING');
  }
  if (q023?.[2] !== `\`${Q023_SCOPED_DISPOSITION}\``) {
    problems.push(
      'PRD0-Q023 must preserve the exact staging-approved and production-pending scoped disposition',
    );
  }
  requireToken(
    'Owner questionnaire',
    documents.questionnaire,
    Q023_SCOPED_DISPOSITION,
  );
  if (
    dispositionRows.length !== 48 ||
    dispositionIdCount !== 48 ||
    approvedCount !== 33 ||
    pendingCount !== 15
  ) {
    problems.push(
      'Owner disposition rows must total 48 with 33 APPROVED and 15 PENDING',
    );
  }
  for (const token of [
    '| Total | 48 |',
    '| APPROVED | 33 |',
    '| PENDING | 15 |',
    '| Omitted | 0 |',
    '| Duplicated | 0 |',
  ]) {
    requireToken('Owner disposition totals', documents.disposition, token);
  }

  const decisionRows = parseGovernanceRows(
    documents.decisionRegister,
    'PRD0-D',
  );
  const decisionById = new Map(decisionRows.map((row) => [row[0], row]));
  const lockedCount = decisionRows.filter(
    ([, , status]) => status === 'LOCKED_FROM_APPROVED_CONTEXT',
  ).length;
  const ownerRequiredCount = decisionRows.filter(
    ([, , status]) => status === 'OWNER_DECISION_REQUIRED',
  ).length;
  const decisionIdCount = new Set(decisionRows.map(([id]) => id)).size;

  for (const decisionId of ['PRD0-D020', 'PRD0-D021']) {
    checkCount += 1;
    if (decisionById.get(decisionId)?.[2] !== 'LOCKED_FROM_APPROVED_CONTEXT') {
      problems.push(`${decisionId} must be LOCKED_FROM_APPROVED_CONTEXT`);
    }
  }
  checkCount += 2;
  if (decisionById.get('PRD0-D023')?.[2] !== 'OWNER_DECISION_REQUIRED') {
    problems.push('PRD0-D023 must remain OWNER_DECISION_REQUIRED');
  }
  if (
    decisionRows.length !== 53 ||
    decisionIdCount !== 53 ||
    lockedCount !== 36 ||
    ownerRequiredCount !== 17
  ) {
    problems.push(
      'Decision rows must total 53 with 36 LOCKED_FROM_APPROVED_CONTEXT and 17 OWNER_DECISION_REQUIRED',
    );
  }
  requireToken(
    'Published decision totals',
    documents.decisionRegister.replace(/\r\n/gu, '\n'),
    '36\n`LOCKED_FROM_APPROVED_CONTEXT`, 17 `OWNER_DECISION_REQUIRED`, 0\n`PROPOSED_RECOMMENDATION`, 0\n`DEFERRED_WITH_CONSTRAINT`, and 0 `REJECTED`',
  );
  for (const token of [
    Q023_STAGING_APPROVED_DISPOSITION,
    Q023_PRODUCTION_PENDING_DISPOSITION,
  ]) {
    requireToken('Decision register', documents.decisionRegister, token);
  }

  const gates = parseAcceptanceMatrix(documents.matrix);
  checkCount += 3;
  for (const gateId of ['PRD4-G02', 'PRD4-G03']) {
    if (gates.get(gateId)?.status !== 'BASELINE_ONLY') {
      problems.push(`${gateId} must be BASELINE_ONLY`);
    }
  }
  if (gates.get('PRD4-G04')?.status === 'COMPLETE') {
    problems.push('PRD4-G04 and Phase 4 must not be marked COMPLETE');
  }

  for (const token of [
    '2026-08-14T06:37:00+03:00',
    '2026-08-16T19:00:00+03:00',
    'Q023_STATUS=PENDING',
    'Q023_STAGING_STATUS=APPROVED',
    'Q023_STAGING_SCOPE=STAGING_ONLY',
    'Q023_STAGING_OPTION=A',
    'Q023_STAGING_API_DOMAIN=staging-api.moazez.cloud',
    'Q023_STAGING_INGRESS=internal-and-cloud-load-balancing',
    'Q023_STAGING_CLOUD_ARMOR=YES',
    'Q023_STAGING_TRUSTED_PROXIES=GOOGLE_CLOUD_EXTERNAL_APPLICATION_LOAD_BALANCER_ONLY',
    'Q023_STAGING_DIRECT_PUBLIC_RUN_APP=NO',
    'Q023_PRODUCTION_STATUS=PENDING',
    'Q023_PRODUCTION_API_DOMAIN=UNAPPROVED',
    'Q023_PRODUCTION_EDGE_DISPOSITION=PENDING',
    'D023_STATUS=OWNER_DECISION_REQUIRED',
    'GCP_SECRET_MANAGER_SECRET_EXISTS=NO',
    'SECRET_MANAGER_VERSIONS_PROVISIONED=NO',
    'IAM_SECRET_ACCESS_CREATED=NO',
    'ROTATION_REHEARSAL_COMPLETE=NO',
    'RUNTIME_DEPLOYMENT_COMPLETE=NO',
    'PRODUCTION_TRAFFIC_AUTHORIZED=NO',
    'PHASE_4=NOT_COMPLETE',
  ]) {
    requireToken('Acceptance matrix', documents.matrix, token);
  }
  for (const token of [
    '| PRD0-D020 | PRD0-Q020 | Accepted |',
    '| PRD0-D021 | PRD0-Q021 | Accepted |',
    '| PRD0-D023 | PRD0-Q023 | Pending overall; staging-only sub-disposition accepted, production pending |',
    Q023_SCOPED_DISPOSITION,
    'GCP_SECRET_MANAGER_SECRET_EXISTS=NO',
    'SECRET_MANAGER_VERSIONS_PROVISIONED=NO',
    'RUNTIME_DEPLOYMENT_COMPLETE=NO',
    'PHASE_4=NOT_COMPLETE',
  ]) {
    requireToken('ADR-0015', documents.adr0015, token);
  }

  checkCount += 1;
  const combined = Object.values(documents).join('\n');
  for (const forbidden of [
    'GCP_SECRET_MANAGER_SECRET_EXISTS=YES',
    'SECRET_MANAGER_VERSIONS_PROVISIONED=YES',
    'IAM_SECRET_ACCESS_CREATED=YES',
    'ROTATION_REHEARSAL_COMPLETE=YES',
    'RUNTIME_DEPLOYMENT_COMPLETE=YES',
    'PRODUCTION_TRAFFIC_AUTHORIZED=YES',
    'PHASE_4=COMPLETE',
    'PRD0-Q023-PRODUCTION=APPROVED',
    'Q023_STATUS=APPROVED',
    'Q023_PRODUCTION_STATUS=APPROVED',
  ]) {
    if (combined.includes(forbidden)) {
      problems.push(
        `Q020/Q021/Q023 governance must not claim implementation or authorization: ${forbidden}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `PRD0-Q020/Q021/Q023 governance validation failed:\n- ${problems.join('\n- ')}`,
    );
  }
  return Object.freeze({
    approvedOwnerQuestionCount: approvedCount,
    checkCount,
    lockedDecisionCount: lockedCount,
    ownerDecisionRequiredCount: ownerRequiredCount,
    pendingOwnerQuestionCount: pendingCount,
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
    '| APPROVED | 33 |',
  );
  requireToken(
    'Owner disposition register',
    documents.disposition,
    '| PENDING | 15 |',
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
    '36\n`LOCKED_FROM_APPROVED_CONTEXT`, 17 `OWNER_DECISION_REQUIRED`',
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
  requireToken(
    'Acceptance matrix',
    documents.matrix,
    STORAGE_RELEASE_DECISION_PATH.replace('docs/production-readiness/', ''),
  );
  requireToken(
    'Batch 3 inventory',
    documents.batch3Inventory,
    STORAGE_RELEASE_DECISION_PATH,
  );

  for (const token of [
    'approval_date=2026-08-11',
    'timezone=Africa/Cairo',
    'approver=Abdallah',
    'GITHUB_CI_RUNTIME_VALIDATION=DEFERRED_NON_BLOCKING_OWNER_DECISION',
    'GITHUB_CI_RUNTIME_DEFERRAL_REASON=GITHUB_ACTIONS_BILLING_LIMIT_EXHAUSTED',
    'GITHUB_CI_RUN_RESULT=BLOCKED_BY_BILLING_BEFORE_RUNNER_ALLOCATION',
    'GITHUB_CI_RUNTIME_PASS=NOT_CLAIMED',
    'CI_ARCHITECTURE_SOURCE_REVIEW=PASS',
    'GITHUB_CI_RUNTIME_FAILURE_CAUSED_BY_PRODUCT=NO',
    'GITHUB_CI_RUNTIME_FAILURE_CAUSED_BY_TESTS=NO',
    'GITHUB_CI_RUNTIME_FAILURE_CAUSED_BY_WORKFLOW=NOT_PROVEN',
    'MANUAL_RELEASE_VERIFICATION_REQUIRED=YES',
    'STORAGE_CUTOVER_READY_FOR_REAL_DATA=NO',
    'REAL_DATA=FORBIDDEN',
    'PRODUCTION_UPLOADS_ALLOWED=NO',
    'PRODUCTION_TRAFFIC_ALLOWED=NO',
    'PRODUCTION_LAUNCH_AUTHORIZED=NO',
    '648af406a1e9ba1f36493df2e9abe67d6189d0a7',
    'e49aacdb22986916ec83ca55008597883d4b4fbd',
    '31480247411',
  ]) {
    requireToken('Storage release decision', documents.releaseDecision, token);
  }

  checkCount += 1;
  const combined = Object.values(documents).join('\n');
  if (
    combined.includes('STORAGE_CUTOVER_READY_FOR_REAL_DATA=YES') ||
    combined.includes('GITHUB_CI_RUNTIME_PASS=PASS') ||
    combined.includes('PRODUCTION_UPLOADS_ALLOWED=YES') ||
    combined.includes('PRODUCTION_TRAFFIC_ALLOWED=YES') ||
    combined.includes('PRODUCTION_LAUNCH_AUTHORIZED=YES') ||
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
  const read = (...segments) =>
    fs.readFileSync(path.join(repositoryRoot, ...segments), 'utf8');
  const matrix = fs.readFileSync(matrixPath, 'utf8');
  const governance = validateProductionReadinessGovernance(
    matrix,
    fs.readFileSync(closeoutPath, 'utf8'),
  );
  const phase3 = validateCurrentPhase3Governance(
    matrix,
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
  const documents = {
    matrix,
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
    questionnaire: read(
      'docs',
      'production-readiness',
      'phase-0',
      '04-owner-decision-questionnaire.md',
    ),
    adr0015: read(
      'adr',
      'ADR-0015-gcp-environment-workload-identity-secrets-and-crypto.md',
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
  const storageCutover = validateStorageCutoverGovernance(documents);
  const q007 = validateQ007Governance(documents);
  const q020Q021 = validateQ020Q021Governance(documents);
  return Object.freeze({
    ...governance,
    ...phase3,
    ...q007,
    ...q020Q021,
    q007GovernanceCheckCount: q007.checkCount,
    q020Q021GovernanceCheckCount: q020Q021.checkCount,
    storageCutoverCheckCount: storageCutover.checkCount,
  });
}

if (require.main === module) {
  const result = validateRepository(path.resolve(__dirname, '..', '..'));
  process.stdout.write(
    `Production-readiness governance verified: gates=${result.gateCount} phase3Gates=${result.phase3GateCount} storageCutoverChecks=${result.storageCutoverCheckCount} q007Checks=${result.q007GovernanceCheckCount} q020Q021Checks=${result.q020Q021GovernanceCheckCount}\n`,
  );
}

module.exports = {
  parseAcceptanceMatrix,
  validateCurrentPhase3Governance,
  validateProductionReadinessGovernance,
  validateQ007Governance,
  validateQ020Q021Governance,
  validateStorageCutoverGovernance,
  validateRepository,
};
