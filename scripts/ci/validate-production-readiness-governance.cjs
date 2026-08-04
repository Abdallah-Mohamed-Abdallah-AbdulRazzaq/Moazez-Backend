'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ACTIVE_GATE_STATUSES = new Set([
  'BASELINE_ONLY',
  'IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE',
  'IN_PROGRESS',
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
    if (!ACTIVE_GATE_STATUSES.has(gate.status)) continue;
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

  const phase3DatabaseGate = gates.get('PRD3-G01');
  if (phase3DatabaseGate?.status !== 'BASELINE_ONLY') {
    problems.push('PRD3-G01 must remain BASELINE_ONLY');
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
  return validateProductionReadinessGovernance(
    fs.readFileSync(matrixPath, 'utf8'),
    fs.readFileSync(closeoutPath, 'utf8'),
  );
}

if (require.main === module) {
  const result = validateRepository(path.resolve(__dirname, '..', '..'));
  process.stdout.write(
    `Production-readiness governance verified: gates=${result.gateCount}\n`,
  );
}

module.exports = {
  parseAcceptanceMatrix,
  validateProductionReadinessGovernance,
  validateRepository,
};
