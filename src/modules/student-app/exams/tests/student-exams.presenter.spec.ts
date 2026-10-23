import { StudentExamsPresenter } from '../presenters/student-exams.presenter';
import type {
  StudentExamDetailReadResult,
  StudentExamSubmissionReadResult,
} from '../infrastructure/student-exams-read.adapter';

describe('StudentExamsPresenter', () => {
  it('presents safe exam detail without answer keys or correct options', () => {
    const result = StudentExamsPresenter.presentDetail(
      examDetailResultFixture(),
    );
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
      'metadata',
      'rawMetadata',
      'rawStorageMetadata',
      'storageMetadata',
      'fileMetadata',
      'rawAnswerMetadata',
      'answerMetadata',
      'metadata-object-key',
      'metadata-bucket',
      'metadata-storage-key',
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
            metadata: { objectKey: 'metadata-object-key' },
            rawMetadata: { bucket: 'metadata-bucket' },
            rawStorageMetadata: { signedUrl: 'https://storage.invalid/raw' },
            storageMetadata: { directUrl: 'https://storage.invalid/direct' },
            storage: { fileUrl: 'https://storage.invalid/file' },
            fileMetadata: { storageKey: 'metadata-storage-key' },
            rawAnswerMetadata: { answerKey: 'metadata-answer-key' },
            answerMetadata: { correctAnswer: 'metadata-correct-answer' },
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

describe('ST-02 canonical exams contract', () => {
  it.each([
    ['MCQ_SINGLE', 'multiple_choice', 'single'],
    ['MCQ_MULTI', 'multiple_choice', 'multiple'],
    ['TRUE_FALSE', 'true_false', 'single'],
    ['SHORT_ANSWER', 'essay', null],
    ['ESSAY', 'essay', null],
    ['FILL_IN_BLANK', 'fill_blanks', null],
    ['MATCHING', 'matching', null],
    ['MEDIA', 'media', null],
  ])(
    'preserves legacy %s and adds exact interaction',
    (canonicalType, type, selectionMode) => {
      const fixture = examDetailResultFixture();
      const assessment = fixture.exam;
      (assessment.questions[0] as { type: string }).type = canonicalType;
      const result = StudentExamsPresenter.presentDetail(fixture);
      const question = result.stages[0].questions[0];
      expect(question).toMatchObject({
        type,
        canonicalType,
        interaction: { selectionMode, supported: true },
      });
      expect(JSON.stringify(question)).not.toMatch(
        /answerKey|isCorrect|metadata/,
      );
    },
  );
  it('marks unknown types unsupported without inventing a canonical enum', () => {
    const fixture = examDetailResultFixture();
    const assessment = fixture.exam;
    (assessment.questions[0] as { type: string }).type = 'FUTURE_TYPE';
    const result = StudentExamsPresenter.presentDetail(fixture);
    expect(result.stages[0].questions[0]).toMatchObject({
      type: 'future_type',
      canonicalType: null,
      interaction: { supported: false, kind: 'unsupported' },
    });
  });
  it('does not advertise score-only assessments as supporting question submissions', () => {
    const fixture = examDetailResultFixture();
    (fixture.exam as { deliveryMode: string }).deliveryMode = 'SCORE_ONLY';
    const result = StudentExamsPresenter.presentDetail(fixture);
    expect(result).toMatchObject({
      deliveryMode: 'score_only',
      supportsQuestionSubmission: false,
    });
  });
});
