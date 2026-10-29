import { st10bCases } from '../../../../../test/fixtures/st10b-question-contracts.fixture';
import {
  gradeEvaluationDefinition,
  normalizeGradeEvaluationQuestion,
  normalizeGradeEvaluationAnswer,
} from '../domain/grade-question-evaluation';
import {
  normalizeStoredGradeAnswer,
  normalizeTypedGradeAnswer,
} from '../domain/grade-question-interaction';

describe('ST10-B Grades adapters preserve ST10-A contracts', () => {
  it.each([
    { policyVersion: 1, mode: 'EXACT' },
    { policyVersion: 1, mode: 'ABSOLUTE_TOLERANCE', tolerance: '0.25' },
    { policyVersion: 1, mode: 'RELATIVE_TOLERANCE', relativeTolerance: '0.01' },
    {
      policyVersion: 1,
      mode: 'EXPLICIT_ACCEPTED_RANGE',
      lower: '12',
      upper: '13',
      includeLower: true,
      includeUpper: false,
    },
  ])('preserves the explicitly configured Numeric $mode policy', (policy) => {
    const c = st10bCases[1];
    const result = normalizeGradeEvaluationQuestion(
      { type: c.type, metadata: c.definition, answerKey: { ...c.key, policy } },
      'draft',
    );
    expect(result.answerKey).toMatchObject({
      kind: 'numeric',
      policy: { mode: policy.mode },
    });
  });
  it.each(st10bCases)(
    '$type normalizes closed definitions and private keys without legacy metadata merging',
    (c) => {
      const normalized = normalizeGradeEvaluationQuestion(
        { type: c.type, metadata: c.definition, answerKey: c.key },
        'draft',
      );
      expect(normalized.metadata.kind).toBe(c.kind);
      expect(normalized.answerKey).toMatchObject({
        keyVersion: 1,
        kind: c.kind,
      });
      expect(() =>
        normalizeGradeEvaluationQuestion(
          { type: c.type, metadata: c.changed, answerKey: c.key },
          'draft',
        ),
      ).toThrow();
      expect(
        normalizeGradeEvaluationQuestion(
          { type: c.type, metadata: c.changed, answerKey: null },
          'draft',
        ).answerKey,
      ).toBeNull();
      expect(() =>
        gradeEvaluationDefinition(
          c.type,
          { ...c.definition, sampleAnswerEn: 'PRIVATE' },
          'draft',
        ),
      ).toThrow();
    },
  );
  it.each(st10bCases)(
    '$type uses typed draft/final validation and keeps optional absence separate from invalid supplied content',
    (c) => {
      const definition = gradeEvaluationDefinition(
        c.type,
        c.definition,
        'complete',
      );
      expect(
        normalizeGradeEvaluationAnswer(definition, c.partial, 'draft', true),
      ).not.toBeNull();
      expect(() =>
        normalizeGradeEvaluationAnswer(definition, c.partial, 'final', false),
      ).toThrow();
      expect(
        normalizeGradeEvaluationAnswer(definition, null, 'final', false),
      ).toBeNull();
      expect(() =>
        normalizeGradeEvaluationAnswer(definition, null, 'final', true),
      ).toThrow();
      const question = { type: c.type, metadata: c.definition, required: true };
      expect(
        normalizeTypedGradeAnswer(
          question,
          { answerText: null, answerJson: c.partial, selectedOptionIds: [] },
          'draft',
        ).answerJson,
      ).not.toBeNull();
      expect(() =>
        normalizeTypedGradeAnswer(
          question,
          { answerText: 'legacy', answerJson: c.answer, selectedOptionIds: [] },
          'draft',
        ),
      ).toThrow();
      expect(() =>
        normalizeTypedGradeAnswer(
          question,
          {
            answerText: null,
            answerJson: c.answer,
            selectedOptionIds: ['foreign'],
          },
          'draft',
        ),
      ).toThrow();
    },
  );
  it.each(st10bCases)(
    '$type rejects JSON null stored answers and accepts authoritative SQL NULL only for optional absence',
    (c) => {
      const question = {
        type: c.type,
        metadata: c.definition,
        required: false,
      };
      const payload = {
        answerText: null,
        answerJson: null,
        selectedOptionIds: [],
      };
      expect(() =>
        normalizeStoredGradeAnswer(question, {
          ...payload,
          answerJsonSqlNull: false,
        }),
      ).toThrow();
      expect(() => normalizeStoredGradeAnswer(question, payload)).toThrow();
      expect(
        normalizeStoredGradeAnswer(question, {
          ...payload,
          answerJsonSqlNull: true,
        }).answerJson,
      ).toBeNull();
    },
  );
  it('keeps unsafe and undefined private math keys rejected without disclosing expressions', () => {
    const c = st10bCases[2];
    for (const expression of [
      'x+1/0',
      'x/0',
      'x/(2-2)',
      'x+0^0',
      'globalThis.process.exit()',
    ]) {
      let caught: unknown;
      try {
        normalizeGradeEvaluationQuestion(
          {
            type: c.type,
            metadata: c.definition,
            answerKey: { keyVersion: 1, kind: c.kind, expression },
          },
          'draft',
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code: 'validation.failed',
        details: { field: 'answerKey' },
      });
      expect(JSON.stringify(caught)).not.toContain(expression);
    }
  });
});
