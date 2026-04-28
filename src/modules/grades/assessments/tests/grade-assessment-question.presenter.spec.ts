import { GradeQuestionType, Prisma } from '@prisma/client';
import {
  presentGradeAssessmentQuestion,
  presentGradeAssessmentQuestions,
} from '../presenters/grade-assessment-question.presenter';
import {
  GradeAssessmentForQuestionManagementRecord,
  GradeAssessmentQuestionRecord,
} from '../infrastructure/grades-assessment-questions.repository';

describe('grade assessment question presenter', () => {
  function questionRecord(): GradeAssessmentQuestionRecord {
    return {
      id: 'question-1',
      schoolId: 'school-1',
      assessmentId: 'assessment-1',
      type: GradeQuestionType.MCQ_SINGLE,
      prompt: 'Choose one',
      promptAr: 'Prompt AR',
      explanation: 'Because it is correct',
      explanationAr: null,
      points: new Prisma.Decimal(5),
      sortOrder: 2,
      required: true,
      answerKey: { source: 'options' },
      metadata: { difficulty: 'easy' },
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:05:00.000Z'),
      deletedAt: null,
      options: [
        {
          id: 'option-1',
          schoolId: 'school-1',
          assessmentId: 'assessment-1',
          questionId: 'question-1',
          label: 'A',
          labelAr: null,
          value: 'a',
          isCorrect: true,
          sortOrder: 1,
          metadata: { key: 'value' },
          createdAt: new Date('2026-09-10T08:00:00.000Z'),
          updatedAt: new Date('2026-09-10T08:00:00.000Z'),
          deletedAt: null,
        },
      ],
    };
  }

  it('maps question shape and numeric values', () => {
    const result = presentGradeAssessmentQuestion(questionRecord());

    expect(result).toEqual({
      id: 'question-1',
      assessmentId: 'assessment-1',
      type: 'mcq_single',
      prompt: 'Choose one',
      promptAr: 'Prompt AR',
      explanation: 'Because it is correct',
      explanationAr: null,
      points: 5,
      sortOrder: 2,
      required: true,
      answerKey: { source: 'options' },
      metadata: { difficulty: 'easy' },
      options: [
        {
          id: 'option-1',
          label: 'A',
          labelAr: null,
          value: 'a',
          isCorrect: true,
          sortOrder: 1,
          metadata: { key: 'value' },
        },
      ],
      createdAt: '2026-09-10T08:00:00.000Z',
      updatedAt: '2026-09-10T08:05:00.000Z',
    });
  });

  it('maps list summary and pointsMatchMaxScore', () => {
    const assessment = {
      id: 'assessment-1',
      maxScore: new Prisma.Decimal(5),
    } as GradeAssessmentForQuestionManagementRecord;

    const result = presentGradeAssessmentQuestions({
      assessment,
      questions: [questionRecord()],
    });

    expect(result).toMatchObject({
      assessmentId: 'assessment-1',
      totalQuestions: 1,
      totalPoints: 5,
      pointsMatchMaxScore: true,
      questions: [expect.objectContaining({ id: 'question-1' })],
    });
  });
});
