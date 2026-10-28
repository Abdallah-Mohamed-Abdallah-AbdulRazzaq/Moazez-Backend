import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GradeQuestionType } from '@prisma/client';
import {
  GRADE_RUNTIME_QUESTION_TYPES,
  assertGradeRuntimeQuestionType,
} from '../domain/grade-runtime-types';
import {
  CreateGradeAssessmentQuestionDto,
  UpdateGradeAssessmentQuestionDto,
} from '../dto/grade-assessment-question.dto';
import { normalizeQuestionType } from '../domain/grade-question-domain';
import { presentGradeQuestionContract } from '../../shared/presenters/grade-question-contract';

describe('ST10-A Grades persisted and active type separation', () => {
  it('retains exactly the eight established runtime types with eleven persisted representations', () => {
    expect(Object.values(GradeQuestionType)).toEqual([
      'MCQ_SINGLE',
      'MCQ_MULTI',
      'TRUE_FALSE',
      'SHORT_ANSWER',
      'ESSAY',
      'FILL_IN_BLANK',
      'MATCHING',
      'MEDIA',
      'ORDERING',
      'NUMERIC',
      'MATH_EXPRESSION',
    ]);
    expect(GRADE_RUNTIME_QUESTION_TYPES).toEqual([
      'MCQ_SINGLE',
      'MCQ_MULTI',
      'TRUE_FALSE',
      'SHORT_ANSWER',
      'ESSAY',
      'FILL_IN_BLANK',
      'MATCHING',
      'MEDIA',
    ]);
    for (const value of GRADE_RUNTIME_QUESTION_TYPES) {
      expect(() => assertGradeRuntimeQuestionType(value)).not.toThrow();
      expect(normalizeQuestionType(value)).toBe(value);
      expect(presentGradeQuestionContract(value).interaction.supported).toBe(
        true,
      );
    }
  });
  it.each(['ORDERING', 'NUMERIC', 'MATH_EXPRESSION'])(
    'rejects %s through both create/update aliases and domain normalization without a legacy fallback',
    (value) => {
      expect(() => assertGradeRuntimeQuestionType(value)).toThrow();
      expect(() => normalizeQuestionType(value)).toThrow();
      for (const Dto of [
        CreateGradeAssessmentQuestionDto,
        UpdateGradeAssessmentQuestionDto,
      ])
        for (const alias of ['type', 'questionType']) {
          const errors = validateSync(
            plainToInstance(Dto, {
              [alias]: value.toLowerCase(),
              prompt: 'Question',
              points: 1,
            }),
          );
          expect(errors.some((error) => error.property === alias)).toBe(true);
        }
      expect(presentGradeQuestionContract(value)).toMatchObject({
        canonicalType: null,
        type: value.toLowerCase(),
        interaction: { supported: false, kind: 'unsupported' },
      });
    },
  );
});
