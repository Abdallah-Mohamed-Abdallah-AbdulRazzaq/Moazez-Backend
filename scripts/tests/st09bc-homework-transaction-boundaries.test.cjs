'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { inventoryTransactions, validateInventory } = require('../ci/prd3-g01-b3-transaction-pressure.cjs');

test('ST09-B/C registers only the exact Homework allocation/URL/UTF-8 transaction edges and preserves strict global auditing', () => {
  const inventory = inventoryTransactions();
  validateInventory(inventory);
  const owners = [
    'HomeworkRepository.mutateTypedStudentSubmission',
    'HomeworkRepository.projectAuthorTypedQuestions',
    'HomeworkRepository.publishAssignmentWithTargets',
    'HomeworkRepository.replaceTargets',
    'HomeworkRepository.reviewSubmission',
    'HomeworkRepository.reviewSubmissionAnswers',
  ];
  const scoped = inventory.filter(row => row.manualOverrides.some(item => item.reason.startsWith('ST09-B/C')));
  assert.deepEqual(scoped.map(row => row.entryOwner).sort(), [...owners].sort());
  for (const row of scoped) {
    assert.equal(row.path, 'src/modules/homework/infrastructure/homework.repository.ts');
    assert.equal(row.classification, 'LOCK_CONTENTION_SENSITIVE');
    assert.equal(row.externalWaitInsideTransaction, false);
    assert.deepEqual(row.unresolvedCalls, []);
    const records = row.manualOverrides.filter(item => item.reason.startsWith('ST09-B/C'));
    const expected = ['gate.lock'];
    if (['HomeworkRepository.mutateTypedStudentSubmission', 'HomeworkRepository.publishAssignmentWithTargets'].includes(row.entryOwner)) expected.push('parsed.toString');
    if (row.entryOwner === 'HomeworkRepository.publishAssignmentWithTargets') expected.push('Buffer.byteLength');
    assert.deepEqual(records.map(item => item.unresolvedCallExpression).sort(), expected.sort());
    for (const record of records) {
      assert.equal(record.sourcePath, row.path);
      assert.equal(record.owner, row.entryOwner);
      assert.ok(record.reviewEvidence.length > 100);
      if (record.unresolvedCallExpression === 'gate.lock') assert.deepEqual(record.resolvedCallers, ['PrismaTeacherAllocationOperationalWriteGate.lock']);
      else if (record.unresolvedCallExpression === 'parsed.toString') assert.deepEqual(record.resolvedCallers, ['classifyPersistedUrl']);
      else assert.deepEqual(record.resolvedCallers, ['normalizeRichContent', 'stringBytes']);
    }
  }
  assert.equal(inventory.some(row => row.unresolvedCalls.length > 0), false);
  const st10bOwners = [
    'GradesAssessmentQuestionsRepository.createQuestionWithOptions',
    'GradesAssessmentQuestionsRepository.updateQuestionAndReplaceOptions',
    'GradesAssessmentsRepository.publishAssessment',
    'GradesSubmissionsRepository.bulkUpdateAnswerReviews',
    'GradesSubmissionsRepository.bulkUpsertAnswersWithSelectedOptions',
    'GradesSubmissionsRepository.finalizeSubmission',
    'GradesSubmissionsRepository.submitSubmission',
    'GradesSubmissionsRepository.updateAnswerReview',
    'GradesSubmissionsRepository.upsertAnswerWithSelectedOptions',
    'HomeworkRepository.mutateTypedStudentSubmission',
    'HomeworkRepository.projectAuthorTypedQuestions',
    'HomeworkRepository.publishAssignmentWithTargets',
    'HomeworkRepository.reviewSubmission',
    'HomeworkRepository.reviewSubmissionAnswers',
  ];
  const st10b = inventory.filter(row => row.manualOverrides.some(item => item.reason.startsWith('ST10-B')));
  assert.deepEqual(st10b.map(row => row.entryOwner).sort(), st10bOwners.sort());
  for (const row of st10b) {
    const records = row.manualOverrides.filter(item => item.reason.startsWith('ST10-B'));
    assert.equal(records.length, 1);
    assert.equal(records[0].unresolvedCallExpression, 'abs(n).toString');
    assert.equal(records[0].sourcePath, row.path);
    assert.equal(records[0].owner, row.entryOwner);
    assert.equal(row.classification, 'LOCK_CONTENTION_SENSITIVE');
    assert.equal(row.externalWaitInsideTransaction, false);
    assert.deepEqual(row.unresolvedCalls, []);
    assert.deepEqual(records[0].resolvedCallers, ['RationalBudget.check', 'RationalBudget.multiply', 'bits']);
    assert.ok(records[0].reviewEvidence.length > 100);
  }
});
