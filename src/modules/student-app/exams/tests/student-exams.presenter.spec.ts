import { StudentExamsPresenter } from '../presenters/student-exams.presenter';
import type {
  StudentExamDetailReadResult,
  StudentExamSubmissionReadResult,
} from '../infrastructure/student-exams-read.adapter';

describe('StudentExamsPresenter', () => {
  it('presents safe exam detail without answer keys or correct options', () => {
    const result = StudentExamsPresenter.presentDetail(examDetailResultFixture());
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      assessmentId: 'assessment-1',
      subjectName: 'Math',
      status: 'completed',
      question_count: 1,
      stages: [
        expect.objectContaining({
          question_count: 1,
          questions: [
            expect.objectContaining({
              answer: null,
              options: [
                {
                  optionId: 'option-1',
                  label: 'Visible option',
                  labelAr: null,
                  value: 'A',
                },
              ],
            }),
          ],
        }),
      ],
    });
    expect(serialized).not.toContain('answerKey');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });

  it('sanitizes existing student submissions without creating state', () => {
    const result = StudentExamsPresenter.presentSubmissionState(
      submissionResultFixture(),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      assessmentId: 'assessment-1',
      status: 'completed',
      submission: {
        submissionId: 'submission-1',
        answers: [
          expect.objectContaining({
            answerJson: { selected: 'A', nested: { kept: true } },
            selectedOptions: [
              {
                optionId: 'option-1',
                label: 'Visible option',
                labelAr: null,
                value: 'A',
              },
            ],
          }),
        ],
      },
    });
    for (const forbidden of [
      'answerKey',
      'correctAnswer',
      'correctAnswers',
      'isCorrect',
      'bucket',
      'objectKey',
      'storageKey',
      'directUrl',
      'signedUrl',
      'fileUrl',
      'raw-storage-key',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('presents null submission state safely', () => {
    expect(
      StudentExamsPresenter.presentSubmissionState({
        exam: examFixture(),
        submission: null,
      } as unknown as StudentExamSubmissionReadResult),
    ).toEqual({
      assessmentId: 'assessment-1',
      status: 'not_started',
      submission: null,
    });
  });
});

function examDetailResultFixture(): StudentExamDetailReadResult {
  return {
    exam: examFixture(),
    submission: {
      id: 'submission-1',
      assessmentId: 'assessment-1',
      status: 'SUBMITTED',
    },
  } as unknown as StudentExamDetailReadResult;
}

function submissionResultFixture(): StudentExamSubmissionReadResult {
  return {
    exam: examFixture(),
    submission: {
      id: 'submission-1',
      assessmentId: 'assessment-1',
      status: 'SUBMITTED',
      startedAt: new Date('2026-10-04T08:00:00.000Z'),
      submittedAt: new Date('2026-10-04T08:30:00.000Z'),
      correctedAt: new Date('2026-10-05T08:00:00.000Z'),
      totalScore: 8,
      maxScore: 10,
      answers: [
        {
          id: 'answer-1',
          questionId: 'question-1',
          answerText: 'A',
          answerJson: {
            selected: 'A',
            answerKey: 'hidden',
            correctAnswer: 'A',
            correctAnswers: ['A'],
            isCorrect: true,
            storageKey: 'raw-storage-key',
            bucket: 'raw-bucket',
            objectKey: 'raw-object-key',
            nested: {
              kept: true,
              signedUrl: 'https://storage.invalid/signed',
            },
          },
          correctionStatus: 'CORRECTED',
          awardedPoints: 8,
          maxPoints: 10,
          reviewerComment: 'Visible feedback',
          reviewerCommentAr: null,
          reviewedAt: new Date('2026-10-05T08:00:00.000Z'),
          question: {
            id: 'question-1',
            type: 'MCQ_SINGLE',
          },
          selectedOptions: [
            {
              optionId: 'option-1',
              option: {
                id: 'option-1',
                label: 'Visible option',
                labelAr: null,
                value: 'A',
              },
            },
          ],
        },
      ],
    },
  } as unknown as StudentExamSubmissionReadResult;
}

function examFixture() {
  return {
    id: 'assessment-1',
    subjectId: 'subject-1',
    titleEn: 'Quiz 1',
    titleAr: null,
    type: 'QUIZ',
    deliveryMode: 'QUESTION_BASED',
    date: new Date('2026-10-01T00:00:00.000Z'),
    maxScore: 10,
    expectedTimeMinutes: 30,
    approvalStatus: 'PUBLISHED',
    lockedAt: null,
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
    },
    questions: [
      {
        id: 'question-1',
        type: 'MCQ_SINGLE',
        prompt: 'Choose one.',
        promptAr: null,
        points: 10,
        sortOrder: 1,
        required: true,
        options: [
          {
            id: 'option-1',
            label: 'Visible option',
            labelAr: null,
            value: 'A',
            sortOrder: 1,
          },
        ],
      },
    ],
  };
}
