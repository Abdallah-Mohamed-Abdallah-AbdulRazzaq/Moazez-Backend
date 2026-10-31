import {
  evaluateGradeObjectiveAnswer,
  gradeScoringKey,
  type GradeObjectiveQuestion,
} from '../domain/grade-objective-scoring';
import { gradeReviewFingerprint } from '../domain/grade-review-fingerprint';
import { effectiveGradeReviewLevel } from '../domain/grade-review-policy';
import type { GradeTypedAnswer } from '../domain/grade-question-interaction';

const empty = (): GradeTypedAnswer => ({
  answerText: null,
  answerJson: null,
  selectedOptionIds: [],
  answerJsonSqlNull: true,
});
const answer = (answerJson: unknown): GradeTypedAnswer => ({
  ...empty(),
  answerJson,
  answerJsonSqlNull: false,
});
const options = [
  { id: 'a', label: 'A', value: 'true', isCorrect: true },
  { id: 'b', label: 'B', value: 'false', isCorrect: false },
];
const choice = (type = 'MCQ_SINGLE'): GradeObjectiveQuestion => ({
  type,
  prompt: 'Choose',
  points: '5.00',
  options,
});
const fill: GradeObjectiveQuestion = {
  type: 'FILL_IN_BLANK',
  prompt: 'Fill',
  points: '5.00',
  metadata: {
    blanks: [{ id: 'blank', order: 1 }],
    segments: [{ blankId: 'blank' }],
  },
  answerKey: {
    keyVersion: 1,
    kind: 'fill',
    normalization: 'NFC_TRIM',
    blanks: [{ blankId: 'blank', acceptedTexts: ['Café', 'القاهرة'] }],
  },
};
const matching: GradeObjectiveQuestion = {
  type: 'MATCHING',
  prompt: 'Match',
  points: '5.00',
  metadata: {
    left: [
      { id: 'left', label: 'Left' },
      { id: 'left2', label: 'Left 2' },
    ],
    right: [
      { id: 'right', label: 'Right' },
      { id: 'right2', label: 'Right 2' },
    ],
  },
  answerKey: {
    pairs: [
      { leftId: 'left', rightId: 'right' },
      { leftId: 'left2', rightId: 'right2' },
    ],
  },
};
const ordering: GradeObjectiveQuestion = {
  type: 'ORDERING',
  prompt: 'Order',
  points: '5.00',
  metadata: {
    definitionVersion: 1,
    kind: 'ordering',
    items: [
      { id: 'a', displayOrder: 0, label: 'A' },
      { id: 'b', displayOrder: 1, label: 'B' },
    ],
  },
  answerKey: { keyVersion: 1, kind: 'ordering', expectedItemIds: ['b', 'a'] },
};
const numeric: GradeObjectiveQuestion = {
  type: 'NUMERIC',
  prompt: 'Number',
  points: '5.00',
  metadata: {
    definitionVersion: 1,
    kind: 'numeric',
    units: { required: false, allowedCodes: [], allowUnitless: true },
  },
  answerKey: {
    keyVersion: 1,
    kind: 'numeric',
    reference: { value: '9007199254740993.1', unitCode: null },
    policy: { policyVersion: 1, mode: 'EXACT' },
  },
};
const math: GradeObjectiveQuestion = {
  type: 'MATH_EXPRESSION',
  prompt: 'Expression',
  points: '5.00',
  metadata: { definitionVersion: 1, kind: 'math_expression', variables: [] },
  answerKey: { keyVersion: 1, kind: 'math_expression', expression: '5' },
};

describe('ST12 deterministic Grades scoring evidence', () => {
  it.each([
    [choice(), { ...empty(), selectedOptionIds: ['a'] }],
    [choice('MCQ_MULTI'), { ...empty(), selectedOptionIds: ['a'] }],
    [choice('TRUE_FALSE'), { ...empty(), selectedOptionIds: ['a'] }],
    [fill, answer({ blanks: [{ blankId: 'blank', text: ' Cafe\u0301 ' }] })],
    [
      matching,
      answer({
        pairs: [
          { leftId: 'left', rightId: 'right' },
          { leftId: 'left2', rightId: 'right2' },
        ],
      }),
    ],
    [ordering, answer({ orderedItemIds: ['b', 'a'] })],
    [numeric, answer({ value: '9007199254740993.10', unitCode: null })],
    [math, answer({ expression: '2 + 3' })],
  ] satisfies [GradeObjectiveQuestion, GradeTypedAnswer][])(
    'suggests full points for a proved %s answer without mutating input',
    (question, submitted) => {
      const before = JSON.stringify({ question, submitted });
      expect(
        evaluateGradeObjectiveAnswer(question, submitted, true),
      ).toMatchObject({
        outcome: 'PROVED_EQUIVALENT',
        suggestedPoints: '5.00',
        manualReviewRequired: false,
      });
      expect(JSON.stringify({ question, submitted })).toBe(before);
    },
  );

  it('compares the complete MCQ_MULTI set with no partial credit', () => {
    const question = {
      ...choice('MCQ_MULTI'),
      options: [
        ...options,
        { id: 'c', label: 'C', value: 'c', isCorrect: true },
      ],
    };
    expect(
      evaluateGradeObjectiveAnswer(
        question,
        { ...empty(), selectedOptionIds: ['a'] },
        true,
      ).suggestedPoints,
    ).toBe('0.00');
    expect(
      evaluateGradeObjectiveAnswer(
        question,
        { ...empty(), selectedOptionIds: ['c', 'a'] },
        true,
      ).suggestedPoints,
    ).toBe('5.00');
  });

  it.each(['SHORT_ANSWER', 'ESSAY', 'MEDIA'])(
    '%s remains manual even with a key and approval',
    (type) => {
      expect(
        evaluateGradeObjectiveAnswer(
          { type, points: '5.00' },
          { ...empty(), answerText: 'Answer' },
          true,
        ),
      ).toMatchObject({
        suggestedPoints: null,
        reason: 'SUBJECTIVE_RESPONSE',
        manualReviewRequired: true,
      });
    },
  );

  it('requires separate key approval and treats absent optional answers as manual', () => {
    expect(
      evaluateGradeObjectiveAnswer(
        choice(),
        { ...empty(), selectedOptionIds: ['a'] },
        false,
      ).reason,
    ).toBe('KEY_NOT_APPROVED');
    expect(
      evaluateGradeObjectiveAnswer(
        { ...choice(), required: false },
        empty(),
        true,
      ).reason,
    ).toBe('ANSWER_ABSENT');
  });

  it.each([
    null,
    {},
    { pairs: [] },
    { keyVersion: 2, kind: 'fill' },
    { keyVersion: 1, kind: 'fill', normalization: 'casefold', blanks: [] },
  ])('fails closed for an invalid Fill key', (answerKey) => {
    expect(
      evaluateGradeObjectiveAnswer(
        { ...fill, answerKey },
        answer({ blanks: [{ blankId: 'blank', text: 'Café' }] }),
        true,
      ),
    ).toMatchObject({
      outcome: 'INVALID_INPUT',
      suggestedPoints: null,
      manualReviewRequired: true,
    });
  });

  it('does not invent case folding or numeric tolerance', () => {
    expect(
      evaluateGradeObjectiveAnswer(
        fill,
        answer({ blanks: [{ blankId: 'blank', text: 'CAFÉ' }] }),
        true,
      ).suggestedPoints,
    ).toBe('0.00');
    expect(
      evaluateGradeObjectiveAnswer(
        numeric,
        answer({ value: '9007199254740993.1000000001', unitCode: null }),
        true,
      ).suggestedPoints,
    ).toBe('0.00');
    expect(
      evaluateGradeObjectiveAnswer(
        {
          ...numeric,
          answerKey: {
            keyVersion: 1,
            kind: 'numeric',
            reference: { value: '1', unitCode: null },
          },
        },
        answer({ value: '1', unitCode: null }),
        true,
      ).suggestedPoints,
    ).toBeNull();
  });

  it.each([
    [math, { expression: '1 / 0' }, 'UNDEFINED_EXPRESSION'],
    [
      {
        ...math,
        metadata: {
          definitionVersion: 1,
          kind: 'math_expression',
          variables: ['x'],
        },
        answerKey: { keyVersion: 1, kind: 'math_expression', expression: 'x' },
      },
      { expression: 'x' },
      'UNKNOWN_REQUIRES_MANUAL_REVIEW',
    ],
    [math, { expression: '6' }, 'PROVED_DIFFERENT'],
  ])(
    'keeps mathematical proof outcomes distinct',
    (question, submitted, outcome) => {
      expect(
        evaluateGradeObjectiveAnswer(question, answer(submitted), true).outcome,
      ).toBe(outcome);
    },
  );

  it.each([
    { minSelections: 2, maxSelections: 2 },
    { minSelections: 1, maxSelections: 1 },
  ])('rejects an option key outside selection bounds', (bounds) => {
    const q = {
      ...choice('MCQ_MULTI'),
      metadata: bounds,
      options: options.map((o) => ({
        ...o,
        isCorrect: bounds.minSelections === 1,
      })),
    };
    expect(() => gradeScoringKey(q)).toThrow();
    expect(
      evaluateGradeObjectiveAnswer(
        q,
        { ...empty(), selectedOptionIds: ['a'] },
        true,
      ).suggestedPoints,
    ).toBeNull();
  });
  it.each([
    [{ leftId: 'left', rightId: 'right' }],
    [
      { leftId: 'left', rightId: 'right' },
      { leftId: 'left', rightId: 'right2' },
    ],
  ])('rejects incomplete or duplicate matching keys', (...pairs) => {
    expect(() =>
      gradeScoringKey({ ...matching, answerKey: { pairs } }),
    ).toThrow();
  });
  it('rejects an undefined key rather than approving a model answer', () => {
    expect(() =>
      gradeScoringKey({
        ...math,
        answerKey: {
          keyVersion: 1,
          kind: 'math_expression',
          expression: '1 / 0',
        },
      }),
    ).toThrow();
  });

  it.each([
    [choice(), { ...empty(), selectedOptionIds: ['foreign'] }],
    [ordering, answer({ orderedItemIds: ['a', 'a'] })],
    [fill, answer({ blanks: [{ blankId: 'foreign', text: 'Café' }] })],
    [matching, answer({ pairs: [{ leftId: 'left', rightId: 'foreign' }] })],
    [numeric, answer({ value: 'NaN', unitCode: null })],
  ] satisfies [GradeObjectiveQuestion, GradeTypedAnswer][])(
    'rejects an invalid submitted answer',
    (question, submitted) => {
      expect(
        evaluateGradeObjectiveAnswer(question, submitted, true),
      ).toMatchObject({ outcome: 'INVALID_INPUT', suggestedPoints: null });
    },
  );
});

describe('ST12 private review evidence and disclosure', () => {
  const approved = { approvalStatus: 'APPROVED', approvedAt: new Date() };
  const finalized = {
    status: 'CORRECTED',
    correctedAt: new Date(),
    reviewedById: 'reviewer',
  };
  it('defaults missing, SQL NULL and unknown levels to no disclosure', () => {
    for (const policy of [
      null,
      { studentLevel: null, parentLevel: null },
      { studentLevel: 'future', parentLevel: 'future' },
    ])
      expect(
        effectiveGradeReviewLevel({
          audience: 'STUDENT',
          assessment: approved,
          submission: finalized,
          policy,
        }),
      ).toBe('NONE');
  });
  it('keeps Parent and Student release independent and requires finalization and approval', () => {
    const policy = { studentLevel: 'KEYS', parentLevel: 'DETAILS' };
    expect(
      effectiveGradeReviewLevel({
        audience: 'STUDENT',
        assessment: approved,
        submission: finalized,
        policy,
      }),
    ).toBe('KEYS');
    expect(
      effectiveGradeReviewLevel({
        audience: 'PARENT',
        assessment: approved,
        submission: finalized,
        policy,
      }),
    ).toBe('DETAILS');
    expect(
      effectiveGradeReviewLevel({
        audience: 'STUDENT',
        assessment: { ...approved, approvalStatus: 'PUBLISHED' },
        submission: finalized,
        policy,
      }),
    ).toBe('NONE');
    expect(
      effectiveGradeReviewLevel({
        audience: 'STUDENT',
        assessment: approved,
        submission: { ...finalized, status: 'IN_PROGRESS' },
        policy,
      }),
    ).toBe('NONE');
    expect(
      effectiveGradeReviewLevel({
        audience: 'STUDENT',
        assessment: approved,
        submission: finalized,
        policy: { studentLevel: 'NONE', parentLevel: 'DETAILS' },
      }),
    ).toBe('NONE');
  });
  it('fingerprints exact revisions deterministically without exposing values', () => {
    expect(gradeReviewFingerprint({ a: 1, b: ['key'] })).toBe(
      gradeReviewFingerprint({ b: ['key'], a: 1 }),
    );
    expect(gradeReviewFingerprint({ revision: 1 })).not.toBe(
      gradeReviewFingerprint({ revision: 2 }),
    );
  });
  it('does not invoke accessors, proxies, cycles or unbounded evidence', () => {
    const getter = jest.fn(() => 'PRIVATE');
    const array = [1];
    Object.defineProperty(array, '0', { get: getter });
    expect(() => gradeReviewFingerprint(array)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => gradeReviewFingerprint(new Proxy({}, {}))).toThrow();
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => gradeReviewFingerprint(cycle)).toThrow();
    expect(() => gradeReviewFingerprint('x'.repeat(256 * 1024 + 1))).toThrow();
    expect(() =>
      gradeReviewFingerprint({ ['x'.repeat(256 * 1024 + 1)]: 1 }),
    ).toThrow();
  });
});
