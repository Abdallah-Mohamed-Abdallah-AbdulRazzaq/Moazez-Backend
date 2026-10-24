import { GradeQuestionType } from '@prisma/client';
import type { QuestionCommandLike } from '../../src/modules/grades/assessments/domain/grade-question-domain';

/** Fixed contract examples; no generated answers or implementation-derived assertions. */
export const GRADE_EIGHT_TYPES = [
  'MCQ_SINGLE',
  'MCQ_MULTI',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'ESSAY',
  'FILL_IN_BLANK',
  'MATCHING',
  'MEDIA',
] as const satisfies readonly GradeQuestionType[];
export function gradeEightAuthor(type: GradeQuestionType) {
  const common = { type, prompt: `Explain ${type}`, points: 2, required: true };
  switch (type) {
    case 'MCQ_SINGLE':
      return {
        ...common,
        options: [
          { label: 'Alpha', value: 'a', isCorrect: true },
          { label: 'Beta', value: 'b', isCorrect: false },
        ],
      };
    case 'MCQ_MULTI':
      return {
        ...common,
        metadata: { minSelections: 2, maxSelections: 2 },
        options: [
          { label: 'Alpha', value: 'a', isCorrect: true },
          { label: 'Beta', value: 'b', isCorrect: true },
          { label: 'Gamma', value: 'c', isCorrect: false },
        ],
      };
    case 'TRUE_FALSE':
      return { ...common, answerKey: true };
    case 'FILL_IN_BLANK':
      return {
        ...common,
        metadata: {
          blanks: [
            { id: 'capital', order: 1 },
            { id: 'river', order: 2 },
          ],
          segments: [
            { text: 'Capital:' },
            { blankId: 'capital' },
            { text: 'River:' },
            { blankId: 'river' },
          ],
          renamedPrivateGuidance: { teacherOnly: 'DO_NOT_RELEASE' },
        },
        answerKey: { capital: 'Paris', river: 'Seine' },
      };
    case 'MATCHING':
      return {
        ...common,
        metadata: {
          left: [
            { id: 'l1', label: 'France' },
            { id: 'l2', label: 'Egypt' },
          ],
          right: [
            { id: 'r1', label: 'Cairo' },
            { id: 'r2', label: 'Paris' },
          ],
          reuseRight: false,
          renamedPrivateGuidance: { teacherOnly: 'DO_NOT_RELEASE' },
        },
        answerKey: {
          pairs: [
            { leftId: 'l1', rightId: 'r2' },
            { leftId: 'l2', rightId: 'r1' },
          ],
        },
      };
    case 'MEDIA':
      return {
        ...common,
        mediaUrl: 'https://media.example.org/lesson.mp4',
        mediaMode: 'video',
        mediaTitle: 'External stimulus',
        answerKey: { privateGuidance: 'DO_NOT_RELEASE' },
      };
    default:
      return { ...common, answerKey: { privateGuidance: 'DO_NOT_RELEASE' } };
  }
}
export function gradeEightAnswer(
  type: GradeQuestionType,
  optionIds: string[] = [],
) {
  switch (type) {
    case 'MCQ_SINGLE':
    case 'TRUE_FALSE':
      return { selectedOptionIds: optionIds.slice(0, 1) };
    case 'MCQ_MULTI':
      return { selectedOptionIds: optionIds.slice(0, 2) };
    case 'FILL_IN_BLANK':
      return {
        answerJson: {
          blanks: [
            { blankId: 'capital', text: 'Paris' },
            { blankId: 'river', text: 'Seine' },
          ],
        },
      };
    case 'MATCHING':
      return {
        answerJson: {
          pairs: [
            { leftId: 'l1', rightId: 'r2' },
            { leftId: 'l2', rightId: 'r1' },
          ],
        },
      };
    default:
      return { answerText: 'A manually reviewed response' };
  }
}

export function gradeEightReadDefinition(type: GradeQuestionType) {
  const author: QuestionCommandLike = gradeEightAuthor(type);
  const options =
    type === 'TRUE_FALSE'
      ? [
          { label: 'True', value: 'true' },
          { label: 'False', value: 'false' },
        ]
      : (author.options ?? []);
  return {
    type,
    metadata:
      type === 'MEDIA'
        ? {
            mediaUrl: author.mediaUrl,
            mediaTitle: author.mediaTitle,
            mediaMode: author.mediaMode,
          }
        : (author.metadata ?? null),
    options: options.map((option, index) => ({
      id: `option-${index + 1}`,
      label: option.label ?? '',
      labelAr: null,
      value: option.value ?? null,
      sortOrder: index + 1,
    })),
  };
}
