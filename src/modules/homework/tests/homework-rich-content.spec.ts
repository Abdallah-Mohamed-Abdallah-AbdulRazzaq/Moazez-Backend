import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { normalizeRichContent } from '../../../common/rich-content/rich-content.validation';
import { gradeRichInput } from '../../grades/assessments/domain/grade-rich-content';
import {
  homeworkRichInput,
  homeworkRichChange,
} from '../domain/homework-rich-content';
import {
  CreateHomeworkQuestionDto,
  CreateHomeworkQuestionOptionDto,
  UpdateHomeworkQuestionDto,
} from '../dto/homework-question.dto';
import {
  projectHomeworkRichContent,
  presentHomeworkRichContent,
  homeworkRichState,
} from '../infrastructure/homework-rich-content.projection';
import {
  presentHomeworkAnswerStudent,
  presentHomeworkAnswerTeacher,
  presentHomeworkAnswerParent,
} from '../presenters/homework-answer.presenter';
import type { HomeworkQuestionAssetsRepository } from '../infrastructure/homework-question-assets.repository';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const question = (text = 'Question') => ({
  contentVersion: 1,
  kind: 'question',
  stem: doc(text),
});
const option = (text = 'Option') => ({
  contentVersion: 1,
  kind: 'option',
  label: doc(text),
});

describe('ST08-C Homework V1 domain and validation boundaries', () => {
  it('accepts Rich-only question input through actual transformed DTO validation', () => {
    const dto = plainToInstance(CreateHomeworkQuestionDto, {
      type: 'SHORT_TEXT',
      richContent: question(),
    });
    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(homeworkRichInput(dto, 'homeworkQuestion')).toEqual({
      richContent: question(),
      display: { prompt: 'Question', instructions: null },
    });
  });
  it('accepts Rich-only nested and independent options through the existing DTOs', () => {
    const dto = plainToInstance(CreateHomeworkQuestionDto, {
      type: 'SINGLE_CHOICE',
      richContent: question(),
      options: [{ richContent: option(), isCorrect: true }],
    });
    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    const independent = plainToInstance(CreateHomeworkQuestionOptionDto, {
      richContent: option(),
    });
    expect(validateSync(independent)).toEqual([]);
    expect(homeworkRichInput(independent, 'homeworkOption').display).toEqual({
      text: 'Option',
    });
  });
  it.each([undefined, null])(
    'retains the required legacy prompt and text when Rich is %s',
    (richContent) => {
      expect(
        validateSync(
          plainToInstance(CreateHomeworkQuestionDto, {
            type: 'SHORT_TEXT',
            richContent,
          }),
        ).some((e) => e.property === 'prompt'),
      ).toBe(true);
      expect(
        validateSync(
          plainToInstance(CreateHomeworkQuestionOptionDto, { richContent }),
        ).some((e) => e.property === 'text'),
      ).toBe(true);
    },
  );
  it('retains legacy minimum and maximum field validation even with Rich supplied', () => {
    expect(
      validateSync(
        plainToInstance(CreateHomeworkQuestionDto, {
          type: 'SHORT_TEXT',
          prompt: '',
          richContent: question(),
        }),
      ).some((e) => e.property === 'prompt'),
    ).toBe(true);
    expect(
      validateSync(
        plainToInstance(CreateHomeworkQuestionOptionDto, {
          text: 'x'.repeat(1001),
          richContent: option(),
        }),
      ).some((e) => e.property === 'text'),
    ).toBe(true);
  });
  it('rejects contradictory display and unsupported Homework translation fields', () => {
    let contradiction: unknown;
    try {
      homeworkRichInput(
        { prompt: 'different', richContent: question() },
        'homeworkQuestion',
      );
    } catch (error) {
      contradiction = error;
    }
    expect(contradiction).toMatchObject({ code: 'validation.failed' });
    expect(() =>
      homeworkRichInput(
        { instructions: 'different', richContent: question() },
        'homeworkQuestion',
      ),
    ).toThrow();
    expect(() =>
      homeworkRichInput(
        { text: 'different', richContent: option() },
        'homeworkOption',
      ),
    ).toThrow();
    expect(() =>
      homeworkRichInput(
        { richContent: { ...question(), stemAr: doc('عربي') } },
        'homeworkQuestion',
      ),
    ).toThrow();
    expect(() =>
      homeworkRichInput(
        { richContent: { ...option(), labelAr: doc('عربي') } },
        'homeworkOption',
      ),
    ).toThrow();
  });
  it('distinguishes omission, explicit null, unchanged display, real edits and non-display updates', () => {
    const current = { prompt: 'Question', instructions: null };
    expect(
      homeworkRichChange(
        'homeworkQuestion',
        plainToInstance(UpdateHomeworkQuestionDto, {}),
        current,
      ),
    ).toEqual({ action: 'preserve' });
    expect(
      homeworkRichChange('homeworkQuestion', { richContent: null }, current),
    ).toEqual({ action: 'write', richContent: null, legacy: {} });
    expect(
      homeworkRichChange(
        'homeworkQuestion',
        { prompt: 'Question', instructions: null },
        current,
      ),
    ).toEqual({ action: 'preserve' });
    expect(
      homeworkRichChange(
        'homeworkQuestion',
        { points: 3, metadata: { kept: true } },
        current,
      ),
    ).toEqual({ action: 'preserve' });
    expect(
      homeworkRichChange('homeworkQuestion', { prompt: 'Edited' }, current),
    ).toEqual({
      action: 'write',
      richContent: null,
      legacy: { prompt: 'Edited' },
    });
    expect(
      homeworkRichChange(
        'homeworkOption',
        { text: 'Option' },
        { text: 'Option' },
      ),
    ).toEqual({ action: 'preserve' });
    expect(
      homeworkRichChange(
        'homeworkOption',
        { isCorrect: true, sortOrder: 9 },
        { text: 'Option' },
      ),
    ).toEqual({ action: 'preserve' });
  });
  it('uses separate Homework and Grades legacy limits without changing the shared grammar', () => {
    const common = question('x'.repeat(6000));
    expect(normalizeRichContent(common)).toEqual(common);
    expect(
      homeworkRichInput({ richContent: common }, 'homeworkQuestion').display
        .prompt,
    ).toHaveLength(6000);
    expect(() =>
      gradeRichInput({ richContent: common }, 'gradeQuestion'),
    ).toThrow();
    const instructions = { ...question(), instructions: doc('Read') };
    expect(
      homeworkRichInput({ richContent: instructions }, 'homeworkQuestion')
        .display.instructions,
    ).toBe('Read');
    expect(() =>
      gradeRichInput({ richContent: instructions }, 'gradeQuestion'),
    ).toThrow();
  });
  it('accepts mixed scientific fragments and preserves deterministic accessible fallback', () => {
    const rich = {
      ...question(),
      stem: {
        language: 'und',
        direction: 'auto',
        blocks: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'مسألة ',
                language: 'ar',
                direction: 'rtl',
              },
              {
                type: 'math',
                display: 'inline',
                children: [
                  {
                    type: 'fraction',
                    numerator: [{ type: 'text', text: '١٢' }],
                    denominator: [{ type: 'text', text: '3' }],
                  },
                  { type: 'radical', radicand: [{ type: 'text', text: '9' }] },
                  {
                    type: 'superscript',
                    children: [{ type: 'text', text: '۲' }],
                  },
                  {
                    type: 'subscript',
                    children: [{ type: 'text', text: '1' }],
                  },
                ],
                altText: 'Fraction and root',
              },
              {
                type: 'text',
                text: ' 6.02e23 mol; 12 / ١٢ / ۱۲ ',
                language: 'en',
                direction: 'ltr',
              },
              {
                type: 'chemistry',
                reactants: [
                  { coefficient: 2, elements: [{ element: 'H', count: 2 }] },
                  { coefficient: 1, elements: [{ element: 'O', count: 2 }] },
                ],
                products: [
                  {
                    coefficient: 2,
                    elements: [
                      { element: 'H', count: 2 },
                      { element: 'O', count: 1 },
                    ],
                    state: 'l',
                  },
                ],
                arrow: 'yields',
                altText: 'Water formation',
              },
            ],
          },
        ],
      },
    };
    const hw = homeworkRichInput({ richContent: rich }, 'homeworkQuestion');
    const grades = gradeRichInput({ richContent: rich }, 'gradeQuestion');
    expect(hw.richContent).toEqual(grades.richContent);
    expect(hw.display.prompt).toBe(
      'مسألة (١٢)/(3)sqrt(9)^(۲)_(1) 6.02e23 mol; 12 / ١٢ / ۱۲ 2H2 + O2 → 2H2O(l)',
    );
  });
  it.each([
    { ...question(), contentVersion: 2 },
    { ...question(), answerKey: 'private' },
    question('<script>alert(1)</script>'),
    question('<svg onload=alert(1)>'),
    question('<iframe src=x>'),
    question('&lt;script&gt;'),
    question('javascript:alert(1)'),
    question('unsafe\u202Etext'),
    { ...option(), isCorrect: true },
  ])(
    'rejects hostile/future display without exposing its body %#',
    (richContent) => {
      try {
        homeworkRichInput(
          { richContent },
          richContent.kind === 'option' ? 'homeworkOption' : 'homeworkQuestion',
        );
        throw new Error('Accepted hostile AST');
      } catch (error) {
        expect(error).toMatchObject({ code: 'validation.failed' });
        expect(JSON.stringify(error)).not.toContain('alert(1)');
      }
    },
  );
});

describe('ST08-C validated display privacy', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const optionId = '00000000-0000-4000-8000-000000000002';
  const q = () => ({
    id,
    type: 'SINGLE_CHOICE',
    prompt: 'Question',
    points: 1,
    isRequired: true,
    richContent: question(),
    options: [
      {
        id: optionId,
        homeworkQuestionId: id,
        text: 'Option',
        isCorrect: true,
        sortOrder: 0,
        richContent: option(),
      },
    ],
  });
  it('never treats a raw Prisma JSON value as authorized display', () =>
    expect(presentHomeworkRichContent(q())).toEqual({}));
  it('withholds invalid/future/JSON-null values and independently recognizes SQL NULL', async () => {
    for (const [value, sqlNull, state] of [
      [null, true, 'absent'],
      [null, false, 'invalid'],
      [{ ...question(), contentVersion: 2 }, false, 'unsupported'],
      [{ raw: '<script>' }, false, 'invalid'],
    ] as const) {
      const row = q();
      await scoped(() =>
        projectHomeworkRichContent(
          {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                id,
                questionId: id,
                optionId: null,
                value,
                sqlNull,
                legacy: { prompt: 'Question', instructions: null },
              },
            ]),
          } as unknown as Prisma.TransactionClient,
          id,
          [row],
          {} as HomeworkQuestionAssetsRepository,
          'review',
          { surface: 'core' },
        ),
      );
      expect(homeworkRichState(row)).toBe(state);
      expect(presentHomeworkRichContent(row)).toEqual({});
    }
  });
  it('withholds mismatched fallback even if the caller did not select instructions', async () => {
    const row = q();
    await scoped(() =>
      projectHomeworkRichContent(
        {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id,
              questionId: id,
              optionId: null,
              value: question(),
              sqlNull: false,
              legacy: { prompt: 'Question', instructions: 'Contradictory' },
            },
          ]),
        } as unknown as Prisma.TransactionClient,
        id,
        [row],
        {} as HomeworkQuestionAssetsRepository,
        'review',
        { surface: 'core' },
      ),
    );
    expect(presentHomeworkRichContent(row)).toEqual({});
  });
  it('includes safe question/selected option display for Teacher and Student but explicitly omits Parent Rich', async () => {
    const row = q();
    await scoped(() =>
      projectHomeworkRichContent(
        {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id,
              questionId: id,
              optionId: null,
              value: question(),
              sqlNull: false,
              legacy: { prompt: 'Question', instructions: null },
            },
            {
              id: optionId,
              questionId: id,
              optionId,
              value: option(),
              sqlNull: false,
              legacy: { text: 'Option' },
            },
          ]),
        } as unknown as Prisma.TransactionClient,
        id,
        [row],
        {} as HomeworkQuestionAssetsRepository,
        'review',
        { surface: 'core' },
      ),
    );
    const answer = {
      id,
      homeworkSubmissionId: id,
      homeworkAssignmentId: id,
      homeworkQuestionId: id,
      textAnswer: null,
      selectedOptionIds: [optionId],
      isDraft: false,
      teacherComment: null,
      awardedPoints: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      homeworkQuestion: row,
    };
    expect(presentHomeworkAnswerTeacher(answer).prompt?.richContent).toEqual(
      question(),
    );
    expect(
      presentHomeworkAnswerStudent(answer).selectedOptions[0].richContent,
    ).toEqual(option());
    expect(presentHomeworkAnswerStudent(answer)).not.toHaveProperty('prompt');
    expect(
      presentHomeworkAnswerStudent(answer).selectedOptions[0],
    ).not.toHaveProperty('isCorrect');
    expect(JSON.stringify(presentHomeworkAnswerParent(answer))).not.toContain(
      'richContent',
    );
  });
});

function scoped<T>(operation: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), () => {
    setActor({
      id: '00000000-0000-4000-8000-000000000003',
      userType: UserType.SCHOOL_USER,
    });
    setActiveMembership({
      membershipId: '00000000-0000-4000-8000-000000000004',
      organizationId: '00000000-0000-4000-8000-000000000005',
      schoolId: '00000000-0000-4000-8000-000000000006',
      roleId: '00000000-0000-4000-8000-000000000007',
      permissions: ['homework.assignments.view'],
    });
    return operation();
  });
}
