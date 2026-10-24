import { GradeQuestionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  normalizeQuestionPayload,
  validateQuestionOptionsForType,
} from '../domain/grade-question-domain';
import {
  gradeQuestionDefinition,
  normalizeTypedGradeAnswer,
  validateGradeQuestionDefinition,
  GRADE_TEXT_LIMITS,
} from '../domain/grade-question-interaction';
import {
  normalizeAnswerPayload,
  calculateSubmissionAnswerProgress,
  validateSelectedOptionsForQuestion,
} from '../domain/grade-submission-domain';
import { presentGradeQuestionContract } from '../../shared/presenters/grade-question-contract';
import {
  GRADE_EIGHT_TYPES,
  gradeEightAnswer,
  gradeEightAuthor,
} from '../../../../../test/fixtures/grades-eight-types.fixture';

function question(type: GradeQuestionType) {
  const payload = normalizeQuestionPayload(gradeEightAuthor(type), {
    requireType: true,
    requirePrompt: true,
    requirePoints: true,
  });
  const options = validateQuestionOptionsForType({
    type,
    options: payload.options ?? [],
    metadata: payload.metadata,
    answerKey: payload.answerKey,
  }).map((option) => ({ ...option, id: randomUUID(), questionId: 'question' }));
  return {
    ...payload,
    id: 'question',
    assessmentId: 'assessment',
    type,
    required: true,
    options,
  };
}

describe('ST-04 existing eight typed definitions and answers', () => {
  it.each(GRADE_EIGHT_TYPES)(
    '%s has a private author definition, safe public definition and canonical answer',
    (type) => {
      const q = question(type);
      validateGradeQuestionDefinition(q, true);
      const publicContract = presentGradeQuestionContract(type, q);
      expect(publicContract.canonicalType).toBe(type);
      expect(publicContract.interaction.supported).toBe(true);
      expect(JSON.stringify(publicContract)).not.toMatch(
        /DO_NOT_RELEASE|answerKey|isCorrect|teacherOnly|privateGuidance|renamedPrivateGuidance/,
      );
      const payload = normalizeTypedGradeAnswer(
        q,
        normalizeAnswerPayload(
          gradeEightAnswer(
            type,
            q.options.map((option) => option.id),
          ),
        ),
      );
      expect(payload.answerText === null || payload.answerJson === null).toBe(
        true,
      );
      expect(
        calculateSubmissionAnswerProgress({
          questions: [q],
          answers: [
            {
              questionId: q.id,
              answerText: payload.answerText,
              answerJson: payload.answerJson,
              selectedOptions: payload.selectedOptionIds.map((optionId) => ({
                optionId,
              })),
            },
          ],
        }).requiredAnsweredCount,
      ).toBe(1);
    },
  );

  it.each(['SHORT_ANSWER', 'ESSAY', 'MEDIA'] as const)(
    '%s accepts its exact text boundary and rejects overflow, whitespace, controls and JSON',
    (type) => {
      const q = question(type),
        maximum = type === 'SHORT_ANSWER' ? GRADE_TEXT_LIMITS.short : 10000;
      expect(
        normalizeTypedGradeAnswer(
          q,
          normalizeAnswerPayload({ answerText: 'x'.repeat(maximum) }),
        ).answerText?.length,
      ).toBe(maximum);
      for (const input of [
        { answerText: 'x'.repeat(maximum + 1) },
        { answerText: ' \n\t ' },
        { answerText: '\u0000' },
        { answerJson: { text: 'bypass' } },
        { answerText: 'valid', answerJson: {} },
        { answerText: 'valid', selectedOptionIds: [randomUUID()] },
      ])
        expect(() =>
          normalizeTypedGradeAnswer(q, normalizeAnswerPayload(input)),
        ).toThrow();
      expect(
        normalizeTypedGradeAnswer(
          q,
          normalizeAnswerPayload({ answerText: ' e\u0301\r\nline ' }),
        ).answerText,
      ).toBe('é\nline');
    },
  );

  it.each(['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'] as const)(
    '%s rejects modality conflicts, duplicate and foreign IDs',
    (type) => {
      const q = question(type),
        good = gradeEightAnswer(
          type,
          q.options.map((option) => option.id),
        );
      for (const input of [
        { ...good, answerText: 'conflict' },
        { ...good, answerJson: {} },
        { selectedOptionIds: [q.options[0].id, q.options[0].id.toUpperCase()] },
      ])
        expect(() =>
          normalizeTypedGradeAnswer(q, normalizeAnswerPayload(input)),
        ).toThrow();
      expect(() =>
        validateSelectedOptionsForQuestion({
          question: q,
          selectedOptionIds: [randomUUID()],
          options: q.options,
        }),
      ).toThrow();
    },
  );

  it('enforces MCQ_MULTI bounds against active options', () => {
    const q = question('MCQ_MULTI');
    expect(() =>
      normalizeTypedGradeAnswer(
        q,
        normalizeAnswerPayload({ selectedOptionIds: [q.options[0].id] }),
      ),
    ).toThrow();
    expect(() =>
      gradeQuestionDefinition({
        ...q,
        metadata: { minSelections: 4, maxSelections: 4 },
      }),
    ).toThrow();
    expect(() =>
      gradeQuestionDefinition({
        ...q,
        metadata: { minSelections: 2, maxSelections: 1 },
      }),
    ).toThrow();
  });

  it('rejects ambiguous TRUE_FALSE semantics and contradictory legacy key aliases', () => {
    const q = question('TRUE_FALSE');
    expect(() =>
      validateGradeQuestionDefinition(
        {
          ...q,
          options: q.options.map((option) => ({ ...option, value: 'true' })),
        },
        true,
      ),
    ).toThrow();
    expect(() =>
      validateGradeQuestionDefinition(
        { ...q, answerKey: { value: true, answer: false } },
        true,
      ),
    ).toThrow();
  });

  it('validates exact Fill IDs, completeness, bounds and safe one-blank legacy text', () => {
    const q = question('FILL_IN_BLANK');
    for (const blanks of [
      [{ blankId: 'foreign', text: 'x' }],
      [{ blankId: 'capital', text: 'x' }],
      [
        { blankId: 'capital', text: 'x' },
        { blankId: 'capital', text: 'y' },
      ],
      [
        { blankId: 'capital', text: 'x'.repeat(1001) },
        { blankId: 'river', text: 'y' },
      ],
    ])
      expect(() =>
        normalizeTypedGradeAnswer(
          q,
          normalizeAnswerPayload({ answerJson: { blanks } }),
        ),
      ).toThrow();
    const single = {
      ...q,
      metadata: {
        blanks: [{ id: 'only', order: 1 }],
        segments: [{ blankId: 'only' }],
      },
    };
    expect(
      normalizeTypedGradeAnswer(
        single,
        normalizeAnswerPayload({ answerText: 'legacy' }),
      ).answerJson,
    ).toEqual({ blanks: [{ blankId: 'only', text: 'legacy' }] });
  });

  it('validates Matching references and one-to-one cardinality without accepting arbitrary maps', () => {
    const q = question('MATCHING');
    for (const pairs of [
      [{ leftId: 'unknown', rightId: 'r1' }],
      [{ leftId: 'l1', rightId: 'r1' }],
      [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l2', rightId: 'r1' },
      ],
      [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l1', rightId: 'r2' },
      ],
    ])
      expect(() =>
        normalizeTypedGradeAnswer(
          q,
          normalizeAnswerPayload({ answerJson: { pairs } }),
        ),
      ).toThrow();
    expect(() =>
      normalizeTypedGradeAnswer(
        q,
        normalizeAnswerPayload({ answerJson: { l1: 'r1' } }),
      ),
    ).toThrow();
  });

  it.each(['FILL_IN_BLANK', 'MATCHING', 'MEDIA'] as const)(
    'marks incomplete historical %s unavailable and excludes malformed answers from progress',
    (type) => {
      const q = {
        ...question(type),
        metadata: { arbitraryLegacyShape: { answerKey: 'private' } },
      };
      expect(presentGradeQuestionContract(type, q).interaction.supported).toBe(
        false,
      );
      expect(
        calculateSubmissionAnswerProgress({
          questions: [q],
          answers: [{ questionId: q.id, answerJson: { truthy: true } }],
        }).answeredCount,
      ).toBe(0);
    },
  );
});
