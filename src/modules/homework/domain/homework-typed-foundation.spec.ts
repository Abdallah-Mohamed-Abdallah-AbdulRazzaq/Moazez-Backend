import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma, HomeworkQuestionType } from '@prisma/client';
import {
  CreateHomeworkQuestionDto,
  UpdateHomeworkQuestionDto,
} from '../dto/homework-question.dto';
import {
  HOMEWORK_RUNTIME_QUESTION_TYPES,
  assertHomeworkRuntimeQuestionType,
} from './homework-runtime-types';
import {
  HomeworkTypedContentError,
  HOMEWORK_TYPED_LIMITS,
} from './homework-typed-contract';
import {
  normalizeHomeworkDefinition as definition,
  normalizeHomeworkTypedAnswer as answer,
  normalizeHomeworkPrivateAnswerKey as key,
  projectHomeworkPublicDefinition as project,
  classifyStoredHomeworkDefinition as storedDefinition,
  classifyStoredHomeworkTypedAnswer as storedAnswer,
  classifyStoredHomeworkPrivateAnswerKey as storedKey,
} from './homework-typed-foundation';
import {
  homeworkAnswerJsonPersistence,
  homeworkAnswerKeyPersistence,
} from '../infrastructure/homework-typed-persistence';

const fillInput = {
  definitionVersion: 1,
  kind: 'fill',
  blanks: [
    { id: 'b', order: 2 },
    { id: 'a', order: 1 },
  ],
  segments: [
    { text: 'Complete ' },
    { blankId: 'a' },
    { text: ' and ' },
    { blankId: 'b' },
  ],
};
const matchingInput = {
  definitionVersion: 1,
  kind: 'matching',
  left: [
    { id: 'l2', order: 2, label: 'Two' },
    { id: 'l1', order: 1, label: 'One' },
  ],
  right: [
    { id: 'r2', order: 2, label: 'Deux' },
    { id: 'r1', order: 1, label: 'Un' },
  ],
};
const mediaInput = {
  definitionVersion: 1,
  kind: 'media',
  source: {
    kind: 'homeworkQuestionAsset',
    assetId: '01954f30-d231-4e14-8231-aea931470000',
  },
  answer: { kind: 'text', maxLength: 10000, multiline: true },
};
const fill = () => definition('FILL_IN_BLANK', fillInput);
const matching = () => definition('MATCHING', matchingInput);
const media = () => definition('MEDIA', mediaInput);
const invalid = (operation: () => unknown) =>
  expect(operation).toThrow(HomeworkTypedContentError);

describe('ST09-A pure Homework typed foundation (runtime inactive)', () => {
  it('declares eight DB types while every new/unknown DTO type stays inactive', () => {
    expect(Object.values(HomeworkQuestionType)).toEqual([
      'SHORT_TEXT',
      'LONG_TEXT',
      'SINGLE_CHOICE',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'FILL_IN_BLANK',
      'MATCHING',
      'MEDIA',
    ]);
    expect(HOMEWORK_RUNTIME_QUESTION_TYPES).toHaveLength(5);
    for (const type of ['fill_in_blank', 'MATCHING', 'media', 'FUTURE_TYPE']) {
      for (const dto of [
        CreateHomeworkQuestionDto,
        UpdateHomeworkQuestionDto,
      ]) {
        const errors = validateSync(
          plainToInstance(dto, { type, prompt: 'Question' }),
        );
        expect(errors.some((e) => e.property === 'type')).toBe(true);
      }
      expect(() => assertHomeworkRuntimeQuestionType(type)).toThrow();
    }
    for (const type of HOMEWORK_RUNTIME_QUESTION_TYPES)
      expect(() => assertHomeworkRuntimeQuestionType(type)).not.toThrow();
  });

  it('normalizes stable IDs, canonical order, NFC text and independent public copies', () => {
    const f = fill();
    expect(f.kind).toBe('fill');
    if (f.kind !== 'fill') throw Error('fixture');
    expect(f.blanks.map((b) => b.id)).toEqual(['a', 'b']);
    const value = answer(
      f,
      {
        blanks: [
          { blankId: 'b', text: ' ثانٍ ' },
          { blankId: 'a', text: ' e\u0301 ' },
        ],
      },
      'final',
      true,
    );
    expect(value).toEqual({
      type: 'FILL_IN_BLANK',
      textAnswer: null,
      answerJson: {
        blanks: [
          { blankId: 'a', text: 'é' },
          { blankId: 'b', text: 'ثانٍ' },
        ],
      },
    });
    const copy = project(f);
    expect(copy).toEqual(f);
    expect(copy).not.toBe(f);
    const result = answer(
      matching(),
      {
        pairs: [
          { leftId: 'l2', rightId: 'r1' },
          { leftId: 'l1', rightId: 'r2' },
        ],
      },
      'final',
      true,
    );
    expect(result?.type).toBe('MATCHING');
    expect(
      answer(media(), { textAnswer: '  Reviewed\r\ntext  ' }, 'final', true),
    ).toEqual({
      type: 'MEDIA',
      textAnswer: 'Reviewed\ntext',
      answerJson: null,
    });
  });

  it('defines structurally empty drafts without treating them as publishable', () => {
    for (const [type, input] of [
      ['FILL_IN_BLANK', { definitionVersion: 1, kind: 'fill' }],
      ['MATCHING', { definitionVersion: 1, kind: 'matching' }],
      ['MEDIA', { ...mediaInput, source: null }],
    ] as const) {
      expect(definition(type, input, 'draft')).toBeDefined();
      invalid(() => definition(type, input));
    }
    invalid(() =>
      definition('FILL_IN_BLANK', { ...fillInput, blanks: null }, 'draft'),
    );
    invalid(() =>
      definition('MATCHING', { ...matchingInput, left: null }, 'draft'),
    );
  });

  it('separates absence, draft subsets and final completeness even for optional answers', () => {
    expect(answer(fill(), undefined, 'draft', true)).toBeNull();
    expect(answer(fill(), undefined, 'final', false)).toBeNull();
    invalid(() => answer(fill(), undefined, 'final', true));
    expect(answer(fill(), { blanks: [] }, 'draft', true)?.type).toBe(
      'FILL_IN_BLANK',
    );
    for (const required of [true, false]) {
      invalid(() =>
        answer(
          fill(),
          { blanks: [{ blankId: 'a', text: 'A' }] },
          'final',
          required,
        ),
      );
      invalid(() => answer(matching(), { pairs: [] }, 'final', required));
    }
    for (const input of [
      null,
      {},
      [],
      { blanks: [{ blankId: 'foreign', text: 'x' }] },
      {
        blanks: [
          { blankId: 'a', text: 'x' },
          { blankId: 'a', text: 'y' },
        ],
      },
      { blanks: [{ blankId: 'a', text: ' ' }] },
      { blanks: [], expectedAnswer: 'secret' },
    ])
      invalid(() => answer(fill(), input, 'draft', false));
    invalid(() =>
      answer(
        matching(),
        {
          pairs: [
            { leftId: 'l1', rightId: 'r1' },
            { leftId: 'l2', rightId: 'r1' },
          ],
        },
        'final',
        true,
      ),
    );
    invalid(() =>
      answer(
        matching(),
        { pairs: [{ leftId: 'l1', rightId: 'foreign' }] },
        'draft',
        true,
      ),
    );
  });

  it('keeps private keys complete and disjoint from public definitions', () => {
    const k = {
      keyVersion: 1,
      kind: 'fill',
      blanks: [
        { blankId: 'b', acceptedAnswers: [' B '] },
        { blankId: 'a', acceptedAnswers: [' A '] },
      ],
    };
    expect(key(fill(), k)?.kind).toBe('fill');
    expect(key(fill(), undefined)).toBeNull();
    for (const input of [
      null,
      { ...k, keyVersion: 2 },
      { ...k, blanks: [] },
      { ...k, blanks: [{ blankId: 'foreign', acceptedAnswers: ['A'] }] },
      { ...k, correctness: true },
    ])
      invalid(() => key(fill(), input));
    invalid(() => definition('FILL_IN_BLANK', { ...fillInput, answerKey: k }));
    invalid(() =>
      project({ ...fill(), answerKey: k } as ReturnType<typeof fill>),
    );
    expect(JSON.stringify(project(fill()))).not.toContain('acceptedAnswers');
    invalid(() => key(media(), k));
    expect(
      key(matching(), {
        keyVersion: 1,
        kind: 'matching',
        pairs: [
          { leftId: 'l1', rightId: 'r1' },
          { leftId: 'l2', rightId: 'r2' },
        ],
      })?.kind,
    ).toBe('matching');
  });

  it.each(['file', 'audio', 'json', 'choice'])(
    'rejects unapproved MEDIA %s responses and arbitrary sources',
    (kind) => {
      invalid(() => definition('MEDIA', { ...mediaInput, answer: { kind } }));
      invalid(() => answer(media(), { [kind]: 'value' }, 'final', true));
      for (const source of [
        { kind: 'gradeQuestionAsset', assetId: mediaInput.source.assetId },
        { kind: 'file', fileId: mediaInput.source.assetId },
        { kind: 'url', url: 'https://example.org' },
        { ...mediaInput.source, bucket: 'private' },
      ])
        invalid(() => definition('MEDIA', { ...mediaInput, source }));
    },
  );

  it('rejects malicious/oversized/nonplain/deep JSON without executing getters', () => {
    let executed = false;
    const getter = Object.defineProperty({}, 'definitionVersion', {
      enumerable: true,
      get() {
        executed = true;
        return 1;
      },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = new Array<unknown>(2);
    sparse[1] = { id: 'b', order: 2 };
    let deep: unknown = {};
    for (let i = 0; i < 15; i++) deep = { nested: deep };
    for (const input of [
      getter,
      cyclic,
      deep,
      new Date(),
      { ...fillInput, blanks: sparse },
      JSON.parse('{"__proto__":{}}'),
      {
        ...fillInput,
        toJSON() {
          executed = true;
          return {};
        },
      },
      { ...fillInput, extra: 'x'.repeat(65537) },
    ])
      invalid(() => definition('FILL_IN_BLANK', input));
    expect(executed).toBe(false);
    for (const label of [
      '<script>x</script>',
      'javascript:alert(1)',
      '\ud800',
      'x\u202ey',
      'x'.repeat(1001),
    ])
      invalid(() =>
        answer(
          fill(),
          { blanks: [{ blankId: 'a', text: label }] },
          'draft',
          false,
        ),
      );
    invalid(() =>
      definition('FILL_IN_BLANK', { ...fillInput, definitionVersion: 2 }),
    );
    invalid(() =>
      definition('MATCHING', { ...matchingInput, reuseRight: true }),
    );
    invalid(() =>
      definition('FILL_IN_BLANK', {
        ...fillInput,
        blanks: [
          { id: 'a', order: 1 },
          { id: 'a', order: 2 },
        ],
      }),
    );
    expect(HOMEWORK_TYPED_LIMITS.jsonBytes).toBe(65536);
  });

  it('enforces collection, label, key and MEDIA text ceilings at their boundaries', () => {
    const f = definition('FILL_IN_BLANK', {
      definitionVersion: 1,
      kind: 'fill',
      blanks: [{ id: 'a', order: 1 }],
      segments: [{ blankId: 'a' }],
    });
    expect(
      answer(
        f,
        { blanks: [{ blankId: 'a', text: '😀'.repeat(1000) }] },
        'final',
        true,
      ),
    ).toBeDefined();
    invalid(() =>
      answer(
        f,
        { blanks: [{ blankId: 'a', text: '😀'.repeat(1001) }] },
        'final',
        true,
      ),
    );
    expect(
      answer(media(), { textAnswer: 'x'.repeat(10000) }, 'final', true),
    ).toBeDefined();
    invalid(() =>
      answer(media(), { textAnswer: 'x'.repeat(10001) }, 'final', true),
    );
    invalid(() =>
      definition('MATCHING', {
        ...matchingInput,
        left: [
          { id: 'l1', order: 1, label: 'x'.repeat(1001) },
          matchingInput.left[0],
        ],
      }),
    );
    invalid(() =>
      definition('MATCHING', {
        ...matchingInput,
        right: Array.from({ length: 51 }, (_, i) => ({
          id: 'r' + i,
          order: i + 1,
          label: 'Right',
        })),
      }),
    );
    invalid(() =>
      key(f, {
        keyVersion: 1,
        kind: 'fill',
        blanks: [{ blankId: 'a', acceptedAnswers: ['e\u0301', 'é'] }],
      }),
    );
    invalid(() =>
      key(f, {
        keyVersion: 1,
        kind: 'fill',
        blanks: [
          {
            blankId: 'a',
            acceptedAnswers: Array.from({ length: 51 }, (_, i) => 'A' + i),
          },
        ],
      }),
    );
  });

  it('requires explicit SQL-null evidence and explicit clearing; no raw JSON null promotion', () => {
    for (const sqlNull of [true, false]) {
      expect(storedAnswer(fill(), null, sqlNull, 'final').state).toBe(
        sqlNull ? 'absent' : 'invalid',
      );
      expect(storedKey(fill(), null, sqlNull).state).toBe(
        sqlNull ? 'absent' : 'invalid',
      );
      expect(storedDefinition('FILL_IN_BLANK', null, sqlNull).state).toBe(
        sqlNull ? 'absent' : 'invalid',
      );
    }
    expect(
      storedDefinition(
        'FILL_IN_BLANK',
        { ...fillInput, definitionVersion: 99 },
        false,
      ).state,
    ).toBe('invalid');
    expect(storedAnswer(fill(), { blanks: [] }, false, 'final').state).toBe(
      'invalid',
    );
    expect(
      homeworkAnswerJsonPersistence(fill(), { state: 'clear' }, 'draft', false),
    ).toBe(Prisma.DbNull);
    expect(
      homeworkAnswerJsonPersistence(fill(), { state: 'clear' }, 'final', false),
    ).toBe(Prisma.DbNull);
    invalid(() =>
      homeworkAnswerJsonPersistence(fill(), { state: 'clear' }, 'final', true),
    );
    expect(homeworkAnswerKeyPersistence(fill(), { state: 'clear' })).toBe(
      Prisma.DbNull,
    );
    invalid(() =>
      homeworkAnswerJsonPersistence(
        fill(),
        { state: 'value', value: null },
        'draft',
        false,
      ),
    );
    invalid(() =>
      homeworkAnswerKeyPersistence(fill(), { state: 'value', value: null }),
    );
    invalid(() =>
      homeworkAnswerJsonPersistence(
        media(),
        { state: 'value', value: { textAnswer: 'Review' } },
        'final',
        true,
      ),
    );
  });
});
