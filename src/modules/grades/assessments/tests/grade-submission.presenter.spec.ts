import {
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
  GradeScopeType,
  GradeSubmissionStatus,
  Prisma,
} from '@prisma/client';
import {
  presentGradeSubmissionAnswer,
  presentGradeSubmissionDetail,
  presentGradeSubmissionsList,
} from '../presenters/grade-submission.presenter';

const now = new Date('2026-09-10T08:00:00.000Z');

describe('grade submission presenter', () => {
  function assessment() {
    return {
      id: 'assessment-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      scopeType: GradeScopeType.GRADE,
      scopeKey: 'grade-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: null,
      classroomId: null,
      titleEn: 'Quiz 1',
      titleAr: 'Quiz 1 AR',
      deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: null,
      maxScore: new Prisma.Decimal(10),
      deletedAt: null,
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        startDate: now,
        endDate: now,
        isActive: true,
      },
    };
  }

  function enrollment() {
    return {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: 'ACTIVE',
      enrolledAt: now,
      endedAt: null,
      classroom: {
        id: 'classroom-1',
        nameAr: null,
        nameEn: 'Class A',
        sectionId: 'section-1',
        section: {
          id: 'section-1',
          nameAr: null,
          nameEn: 'Section A',
          gradeId: 'grade-1',
          grade: {
            id: 'grade-1',
            nameAr: null,
            nameEn: 'Grade 1',
            stageId: 'stage-1',
          },
        },
      },
    };
  }

  function question(id = 'question-1', type = GradeQuestionType.MCQ_SINGLE) {
    return {
      id,
      schoolId: 'school-1',
      assessmentId: 'assessment-1',
      type,
      prompt: 'Prompt',
      promptAr: null,
      points: new Prisma.Decimal(5),
      sortOrder: id === 'question-1' ? 1 : 2,
      required: true,
      deletedAt: null,
      options: [
        {
          id: 'option-1',
          questionId: id,
          label: 'A',
          labelAr: null,
          value: 'a',
          sortOrder: 1,
          deletedAt: null,
        },
      ],
    };
  }

  function answer() {
    return {
      id: 'answer-1',
      schoolId: 'school-1',
      submissionId: 'submission-1',
      assessmentId: 'assessment-1',
      questionId: 'question-1',
      studentId: 'student-1',
      answerText: null,
      answerJson: null,
      correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
      awardedPoints: new Prisma.Decimal(4),
      maxPoints: new Prisma.Decimal(5),
      reviewerComment: 'Good work',
      reviewerCommentAr: 'Good work AR',
      reviewedById: 'reviewer-1',
      reviewedAt: now,
      createdAt: now,
      updatedAt: now,
      question: {
        id: 'question-1',
        type: GradeQuestionType.MCQ_SINGLE,
        points: new Prisma.Decimal(5),
      },
      selectedOptions: [
        {
          schoolId: 'school-1',
          answerId: 'answer-1',
          optionId: 'option-1',
          createdAt: now,
          option: {
            id: 'option-1',
            questionId: 'question-1',
            label: 'A',
            labelAr: null,
            value: 'a',
            deletedAt: null,
          },
        },
      ],
    };
  }

  function submission() {
    return {
      id: 'submission-1',
      schoolId: 'school-1',
      assessmentId: 'assessment-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: GradeSubmissionStatus.CORRECTED,
      startedAt: now,
      submittedAt: null,
      correctedAt: now,
      reviewedById: 'reviewer-1',
      totalScore: new Prisma.Decimal(4),
      maxScore: new Prisma.Decimal(10),
      metadata: null,
      createdAt: now,
      updatedAt: now,
      assessment: assessment(),
      student: {
        id: 'student-1',
        firstName: 'Ahmed',
        lastName: 'Ali',
        status: 'ACTIVE',
      },
      enrollment: enrollment(),
      answers: [answer()],
    };
  }

  it('maps statuses and selected options correctly', () => {
    const result = presentGradeSubmissionAnswer(answer() as never);

    expect(result).toMatchObject({
      id: 'answer-1',
      questionId: 'question-1',
      type: 'mcq_single',
      correctionStatus: 'corrected',
      awardedPoints: 4,
      maxPoints: 5,
      reviewerComment: 'Good work',
      reviewerCommentAr: 'Good work AR',
      reviewedAt: now.toISOString(),
      reviewedById: 'reviewer-1',
      selectedOptions: [
        {
          optionId: 'option-1',
          label: 'A',
          value: 'a',
        },
      ],
    });
  });

  it('presents detail with progress and unanswered question rows', () => {
    const result = presentGradeSubmissionDetail({
      submission: submission() as never,
      questions: [
        question('question-1', GradeQuestionType.MCQ_SINGLE),
        question('question-2', GradeQuestionType.SHORT_ANSWER),
      ] as never,
    });

    expect(result).toMatchObject({
      id: 'submission-1',
      status: 'corrected',
      correctedAt: now.toISOString(),
      reviewedById: 'reviewer-1',
      totalScore: 4,
      assessment: {
        deliveryMode: 'question_based',
        approvalStatus: 'published',
      },
      student: {
        nameEn: 'Ahmed Ali',
        nameAr: null,
      },
      progress: {
        totalQuestions: 2,
        answeredCount: 1,
        pendingCorrectionCount: 0,
      },
    });
    expect(result.questions[1].answer).toBeNull();
  });

  it('presents list rows without exposing schoolId', () => {
    const result = presentGradeSubmissionsList({
      submissions: [submission() as never],
      questions: [question() as never],
    });

    expect(result.items[0]).toMatchObject({
      id: 'submission-1',
      status: 'corrected',
      progress: {
        totalQuestions: 1,
        answeredCount: 1,
      },
    });
    expect(result.items[0]).not.toHaveProperty('schoolId');
  });
});
