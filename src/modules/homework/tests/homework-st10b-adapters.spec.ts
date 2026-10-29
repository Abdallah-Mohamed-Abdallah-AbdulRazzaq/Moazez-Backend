import { Prisma } from '@prisma/client';
import { st10bCases } from '../../../../test/fixtures/st10b-question-contracts.fixture';
import { normalizeHomeworkTypedQuestionMutation } from '../application/homework-typed-runtime';
import {
  normalizeHomeworkDefinition,
  normalizeHomeworkTypedAnswer,
  classifyStoredHomeworkTypedAnswer,
} from '../domain/homework-typed-foundation';
import { HomeworkTypedContentError } from '../domain/homework-typed-contract';
import { homeworkAnswerJsonPersistence } from '../infrastructure/homework-typed-persistence';

describe('ST10-B Homework adapters preserve ST10-A contracts', () => {
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
    const result = normalizeHomeworkTypedQuestionMutation({
      type: c.type,
      metadata: c.definition,
      expectedAnswer: null,
      optionCount: 0,
      keyWrite: { state: 'value', value: { ...c.key, policy } },
    });
    expect(result.answerKey).toMatchObject({
      kind: 'numeric',
      policy: { mode: policy.mode },
    });
  });
  it.each(st10bCases)(
    '$type canonical author definitions and explicit private key write/clear',
    (c) => {
      const normalized = normalizeHomeworkTypedQuestionMutation({
        type: c.type,
        metadata: c.definition,
        expectedAnswer: null,
        optionCount: 0,
        keyWrite: { state: 'value', value: c.key },
      });
      expect(normalized.definition.kind).toBe(c.kind);
      expect(normalized.answerKey).toMatchObject({
        keyVersion: 1,
        kind: c.kind,
      });
      expect(
        normalizeHomeworkTypedQuestionMutation({
          type: c.type,
          metadata: c.definition,
          expectedAnswer: null,
          optionCount: 0,
          keyWrite: { state: 'clear' },
        }).answerKey,
      ).toBe(Prisma.DbNull);
      expect(() =>
        normalizeHomeworkTypedQuestionMutation({
          type: c.type,
          metadata: c.definition,
          expectedAnswer: null,
          optionCount: 0,
          keyWrite: null,
        }),
      ).toThrow();
    },
  );
  it.each(st10bCases)(
    '$type refuses stale retained keys and accepts an atomic explicit clear',
    (c) => {
      const mutation = {
        type: c.type,
        metadata: c.changed,
        expectedAnswer: null,
        optionCount: 0,
        currentKey: { value: c.key, sqlNull: false },
      };
      expect(() => normalizeHomeworkTypedQuestionMutation(mutation)).toThrow();
      expect(
        normalizeHomeworkTypedQuestionMutation({
          ...mutation,
          keyWrite: { state: 'clear' },
        }).answerKey,
      ).toBe(Prisma.DbNull);
      expect(() =>
        normalizeHomeworkDefinition(
          c.type,
          { ...c.definition, privateReference: 'HIDDEN' },
          'draft',
        ),
      ).toThrow(HomeworkTypedContentError);
      expect(() =>
        normalizeHomeworkTypedQuestionMutation({
          ...mutation,
          metadata: c.definition,
          optionCount: 1,
        }),
      ).toThrow();
    },
  );
  it.each(st10bCases)(
    '$type permits partial drafts, requires complete supplied finals and preserves optional absence',
    (c) => {
      const definition = normalizeHomeworkDefinition(c.type, c.definition);
      expect(
        normalizeHomeworkTypedAnswer(definition, c.partial, 'draft', true)
          ?.type,
      ).toBe(c.type);
      expect(() =>
        normalizeHomeworkTypedAnswer(definition, c.partial, 'final', false),
      ).toThrow();
      expect(
        normalizeHomeworkTypedAnswer(definition, undefined, 'final', false),
      ).toBeNull();
      expect(() =>
        normalizeHomeworkTypedAnswer(definition, undefined, 'final', true),
      ).toThrow();
      expect(
        normalizeHomeworkTypedAnswer(definition, c.answer, 'final', true)?.type,
      ).toBe(c.type);
      expect(
        homeworkAnswerJsonPersistence(
          definition,
          { state: 'clear' },
          'draft',
          true,
        ),
      ).toBe(Prisma.DbNull);
    },
  );
  it.each(st10bCases)(
    '$type distinguishes SQL NULL from JSON null and withholds invalid persisted JSON',
    (c) => {
      const definition = normalizeHomeworkDefinition(c.type, c.definition);
      expect(
        classifyStoredHomeworkTypedAnswer(definition, null, true, 'draft'),
      ).toEqual({ state: 'absent' });
      expect(
        classifyStoredHomeworkTypedAnswer(definition, null, false, 'draft'),
      ).toEqual({ state: 'invalid' });
      expect(
        classifyStoredHomeworkTypedAnswer(
          definition,
          { futureVersion: 2 },
          false,
          'draft',
        ),
      ).toEqual({ state: 'invalid' });
    },
  );
  it('keeps undefined math keys invalid and diagnostics free of private expressions', () => {
    const c = st10bCases[2];
    for (const expression of ['x+1/0', 'x/0', 'x/(2-2)', 'x+0^0']) {
      let caught: unknown;
      try {
        normalizeHomeworkTypedQuestionMutation({
          type: c.type,
          metadata: c.definition,
          expectedAnswer: null,
          optionCount: 0,
          keyWrite: {
            state: 'value',
            value: { keyVersion: 1, kind: c.kind, expression },
          },
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code: 'homework.question.invalid_type_payload',
      });
      expect(JSON.stringify(caught)).not.toContain(expression);
    }
  });
});
