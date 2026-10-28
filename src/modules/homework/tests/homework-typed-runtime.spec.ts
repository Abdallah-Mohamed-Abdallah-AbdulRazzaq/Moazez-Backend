import { Prisma, UserType } from '@prisma/client';
import { HomeworkRepository } from '../infrastructure/homework.repository';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import {
  HOMEWORK_RUNTIME_QUESTION_TYPES,
  assertHomeworkRuntimeQuestionType,
} from '../domain/homework-runtime-types';
import {
  normalizeHomeworkTypedQuestionMutation,
  presentHomeworkAuthorKey,
  attachHomeworkAuthorKey,
  presentHomeworkTypedDefinition,
} from '../application/homework-typed-runtime';

const fill = {
  definitionVersion: 1,
  kind: 'fill',
  blanks: [{ id: 'b', order: 1 }],
  segments: [{ text: 'Capital ' }, { blankId: 'b' }],
  maxAnswerLength: 1000,
};
const key = {
  keyVersion: 1,
  kind: 'fill',
  blanks: [{ blankId: 'b', acceptedAnswers: ['PRIVATE_SENTINEL'] }],
};
describe('ST09-B/C explicit runtime and atomic definition/key planning', () => {
  it.each(['FILL_IN_BLANK', 'MATCHING', 'MEDIA'] as const)(
    'rejects non-Rich option create, update/reorder and delete for a locked current %s repository parent',
    async (type) => {
      const tx = {
        $queryRaw: jest.fn((query: TemplateStringsArray) =>
          Promise.resolve(
            query.join('').includes('FROM homework_assignments')
              ? [{ id: 'homework', status: 'DRAFT' }]
              : [{ id: 'question', type }],
          ),
        ),
        homeworkQuestion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'question', type }),
        },
        homeworkQuestionOption: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'option',
            text: 'Existing option',
            richContent: null,
          }),
          create: jest.fn(),
          updateMany: jest.fn(),
        },
      };
      const scoped = {
        $transaction: jest.fn(
          (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      const rich = { assertWrite: jest.fn().mockResolvedValue(undefined) };
      const repository = new HomeworkRepository(
        { scoped } as never,
        { lock: jest.fn() } as never,
        rich as never,
      );
      const resource = {
        homeworkId: 'homework',
        questionId: 'question',
        optionId: 'option',
        actor: { surface: 'teacher' as const, classId: 'allocation' },
      };
      await runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'teacher', userType: UserType.TEACHER });
        setActiveMembership({
          membershipId: 'membership',
          organizationId: 'organization',
          schoolId: 'school',
          roleId: 'role',
          permissions: ['homework.questions.manage'],
        });
        const writes = [
          () =>
            repository.createQuestionOption({
              homeworkId: resource.homeworkId,
              actor: resource.actor,
              data: {
                id: 'option',
                schoolId: 'school',
                homeworkQuestionId: 'question',
                text: 'New',
                sortOrder: 0,
                isCorrect: false,
              },
            }),
          () =>
            repository.updateQuestionOption({
              ...resource,
              data: { text: 'Changed' },
            }),
          () =>
            repository.updateQuestionOption({
              ...resource,
              data: { sortOrder: 2 },
            }),
          () => repository.softDeleteQuestionOption(resource),
        ];
        for (const write of writes) {
          await expect(write()).rejects.toMatchObject({
            code: 'homework.question.invalid_type_payload',
          });
          expect(tx.homeworkQuestionOption.create).not.toHaveBeenCalled();
          expect(tx.homeworkQuestionOption.updateMany).not.toHaveBeenCalled();
        }
      });
      expect(rich.assertWrite).toHaveBeenCalledTimes(4);
      expect(tx.homeworkQuestion.findFirst).toHaveBeenCalled();
    },
  );
  it('dispatches exactly eight declared types and rejects future types', () => {
    expect(HOMEWORK_RUNTIME_QUESTION_TYPES).toEqual([
      'SHORT_TEXT',
      'LONG_TEXT',
      'SINGLE_CHOICE',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'FILL_IN_BLANK',
      'MATCHING',
      'MEDIA',
    ]);
    expect(() => assertHomeworkRuntimeQuestionType('FUTURE')).toThrow();
  });
  it('normalizes a public definition independently from its private key', () => {
    const result = normalizeHomeworkTypedQuestionMutation({
      type: 'FILL_IN_BLANK',
      metadata: fill,
      expectedAnswer: null,
      optionCount: 0,
      keyWrite: { state: 'value', value: key },
    });
    expect(result.metadata).toEqual(fill);
    expect(result.answerKey).toEqual(key);
    expect(JSON.stringify(result.metadata)).not.toContain('PRIVATE_SENTINEL');
  });
  it('preserves compatible omitted keys and rejects a structural change with stale identities', () => {
    expect(
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: fill,
        expectedAnswer: null,
        optionCount: 0,
        currentKey: { value: key, sqlNull: false },
      }).answerKey,
    ).toEqual(key);
    const changed = {
      ...fill,
      blanks: [{ id: 'other', order: 1 }],
      segments: [{ blankId: 'other' }],
    };
    expect(() =>
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: changed,
        expectedAnswer: null,
        optionCount: 0,
        currentKey: { value: key, sqlNull: false },
      }),
    ).toThrow();
    expect(
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: changed,
        expectedAnswer: null,
        optionCount: 0,
        currentKey: { value: key, sqlNull: false },
        keyWrite: { state: 'clear' },
      }).answerKey,
    ).toBe(Prisma.DbNull);
  });
  it.each([
    null,
    { state: 'clear', value: key },
    { state: 'value' },
    { keyVersion: 1 },
  ])('rejects ambiguous key write %p', (keyWrite) => {
    expect(() =>
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: fill,
        expectedAnswer: null,
        optionCount: 0,
        keyWrite,
      }),
    ).toThrow();
  });
  it('distinguishes SQL NULL from JSON null and never promotes malformed keys', () => {
    expect(
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: fill,
        expectedAnswer: null,
        optionCount: 0,
        currentKey: { value: null, sqlNull: true },
      }).answerKey,
    ).toBe(Prisma.DbNull);
    expect(() =>
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: fill,
        expectedAnswer: null,
        optionCount: 0,
        currentKey: { value: null, sqlNull: false },
      }),
    ).toThrow();
  });
  it('rejects contradictory legacy fields and preserves incomplete structural drafts', () => {
    expect(() =>
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: fill,
        expectedAnswer: 'stale',
        optionCount: 0,
      }),
    ).toThrow();
    expect(() =>
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: fill,
        expectedAnswer: null,
        optionCount: 1,
      }),
    ).toThrow();
    expect(
      normalizeHomeworkTypedQuestionMutation({
        type: 'FILL_IN_BLANK',
        metadata: { definitionVersion: 1, kind: 'fill' },
        expectedAnswer: null,
        optionCount: 0,
      }).definition,
    ).toMatchObject({ blanks: [], segments: [] });
  });
  it('returns private keys only through explicit audience-bound reconstruction', () => {
    const question = { type: 'FILL_IN_BLANK', metadata: fill, answerKey: key };
    expect(presentHomeworkAuthorKey(question)).toEqual({});
    const normalized = normalizeHomeworkTypedQuestionMutation({
      type: 'FILL_IN_BLANK',
      metadata: fill,
      expectedAnswer: null,
      optionCount: 0,
    });
    attachHomeworkAuthorKey(question, normalized.definition, key, false);
    expect(presentHomeworkAuthorKey(question)).toEqual({ answerKey: key });
    expect(presentHomeworkTypedDefinition(question)).toEqual({
      metadata: fill,
    });
  });
});
