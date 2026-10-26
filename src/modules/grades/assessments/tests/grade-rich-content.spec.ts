import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  normalizeQuestionPayload,
  buildQuestionOptionsPayload,
} from '../domain/grade-question-domain';
import { gradeRichChange } from '../domain/grade-rich-content';
import {
  CreateGradeAssessmentQuestionDto,
  UpdateGradeAssessmentQuestionDto,
} from '../dto/grade-assessment-question.dto';
import { presentGradeRichContent } from '../infrastructure/grade-rich-content.projection';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const rich = (text = 'Compare x < y') => ({
  contentVersion: 1,
  kind: 'question',
  stem: doc(text),
});

describe('ST08-B Grades rich display domain boundary', () => {
  it.each(['Compare x < y', 'قارن س < ص و ١٢٣', 'س = x + ١٢'])(
    'derives rich-only fallback: %s',
    (text) => {
      expect(
        normalizeQuestionPayload(
          { type: 'ESSAY', points: 1, richContent: rich(text) },
          { requirePrompt: true },
        ),
      ).toMatchObject({
        prompt: text,
        promptAr: null,
        richContent: rich(text),
      });
    },
  );
  it('derives the Arabic translation and accepts matching aliases', () => {
    const content = { ...rich(), stemAr: doc('قارن س < ص') };
    expect(
      normalizeQuestionPayload({
        richContent: content,
        questionTextEn: 'Compare x < y',
        questionTextAr: 'قارن س < ص',
      }),
    ).toMatchObject({ prompt: 'Compare x < y', promptAr: 'قارن س < ص' });
  });
  it.each([
    { richContent: { ...rich(), contentVersion: 2 } },
    { richContent: { ...rich(), instructions: doc('Unsupported here') } },
    { richContent: { ...rich(), answerKey: 'secret' } },
    { richContent: rich(), prompt: 'Contradiction' },
    { richContent: rich(), questionTextEn: 'Contradiction' },
    { richContent: rich(), questionTextAr: 'Stale translation' },
    { richContent: rich('x'.repeat(5001)) },
    { richContent: { ...rich(), stem: doc('<svg>') } },
  ])(
    'rejects malformed, incompatible and contradictory display input %#',
    (input) => {
      expect(() => normalizeQuestionPayload(input)).toThrow(
        ValidationDomainException,
      );
    },
  );
  it('preserves presence through DTO whitelist validation, including explicit clear', async () => {
    const created = plainToInstance(CreateGradeAssessmentQuestionDto, {
      type: 'ESSAY',
      points: 1,
      richContent: rich(),
    });
    expect(
      await validate(created, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(
      normalizeQuestionPayload(created, { requirePrompt: true }).prompt,
    ).toBe('Compare x < y');
    const omitted = plainToInstance(UpdateGradeAssessmentQuestionDto, {
      points: 2,
    });
    const clear = plainToInstance(UpdateGradeAssessmentQuestionDto, {
      richContent: null,
    });
    expect(normalizeQuestionPayload(omitted).richContent).toBeUndefined();
    expect(normalizeQuestionPayload(clear).richContent).toBeNull();
  });
  it('preserves unrelated and genuinely unchanged display updates', () => {
    const current = { prompt: 'Same', promptAr: 'نفس' };
    expect(gradeRichChange('gradeQuestion', {}, current)).toEqual({
      action: 'preserve',
    });
    expect(
      gradeRichChange('gradeQuestion', { prompt: 'Same' }, current),
    ).toEqual({ action: 'preserve' });
    expect(
      gradeRichChange('gradeQuestion', { prompt: 'Changed' }, current),
    ).toEqual({
      action: 'write',
      richContent: null,
      legacy: { prompt: 'Changed' },
    });
    expect(
      gradeRichChange('gradeQuestion', { richContent: null }, current),
    ).toEqual({ action: 'write', richContent: null, legacy: {} });
  });
  it('normalizes rich option labels independently from correctness, identity and order', () => {
    const content = {
      contentVersion: 1,
      kind: 'option',
      label: doc('A'),
      labelAr: doc('أ'),
    };
    const options = buildQuestionOptionsPayload([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        richContent: content,
        isCorrect: true,
        value: 'stable',
        sortOrder: 2,
      },
    ]);
    expect(options[0]).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      richContent: content,
      label: 'A',
      labelAr: 'أ',
      value: 'stable',
      isCorrect: true,
      sortOrder: 2,
    });
    expect(() =>
      buildQuestionOptionsPayload([{ richContent: content, textEn: 'B' }]),
    ).toThrow(ValidationDomainException);
  });
  it('records Arabic option omission independently of normalized legacy defaults', () => {
    expect(
      buildQuestionOptionsPayload([{ label: 'A' }])[0].displayPatch,
    ).toEqual({ label: 'A' });
    expect(
      buildQuestionOptionsPayload([{ label: 'A', textAr: null }])[0]
        .displayPatch,
    ).toEqual({ label: 'A', labelAr: null });
  });
  it('never echoes raw Prisma JSON without authorized repository evidence', () => {
    expect(presentGradeRichContent({ richContent: rich() })).toEqual({});
    expect(
      presentGradeRichContent({
        richContent: { ...rich(), answerKey: 'private' },
      }),
    ).toEqual({});
    expect(presentGradeRichContent({ richContent: null })).toEqual({});
  });
});
