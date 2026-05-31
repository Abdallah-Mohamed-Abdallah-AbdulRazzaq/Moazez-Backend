import 'reflect-metadata';
import {
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { DomainException } from '../../src/common/exceptions/domain-exception';
import { SCHOOL_SCOPED_MODELS } from '../../src/infrastructure/database/school-scope.extension';
import {
  BulkReviewHomeworkSubmissionAnswersUseCase,
  ReviewHomeworkSubmissionAnswerUseCase,
} from '../../src/modules/homework/application/homework-answer-review.use-cases';
import { HomeworkSubmissionContentController } from '../../src/modules/homework/controller/homework-submission-content.controller';
import {
  presentHomeworkAnswersParent,
  presentHomeworkAnswersStudent,
  presentHomeworkAnswersTeacher,
} from '../../src/modules/homework/presenters/homework-answer.presenter';
import { ParentHomeworksController } from '../../src/modules/parent-app/homeworks/controller/parent-homeworks.controller';
import { StudentHomeworksController } from '../../src/modules/student-app/homeworks/controller/student-homeworks.controller';
import { ReviewTeacherHomeworkSubmissionAnswerUseCase } from '../../src/modules/teacher-app/homeworks/application/teacher-homeworks.use-cases';

describe('Homework answer review tenancy/security contracts', () => {
  async function withSchoolAScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'school-user-a', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-a',
        organizationId: 'org-a',
        schoolId: 'school-a',
        roleId: 'role-a',
        permissions: ['homework.assignments.manage'],
      });

      return testFn();
    });
  }

  it('keeps answer review storage and routes school-scoped and manager-only', () => {
    expect([...SCHOOL_SCOPED_MODELS]).toEqual(
      expect.arrayContaining(['HomeworkSubmissionAnswer']),
    );
    expect(readPermissions('reviewAnswer')).toEqual([
      'homework.assignments.manage',
    ]);
    expect(readPermissions('bulkReviewAnswers')).toEqual([
      'homework.assignments.manage',
    ]);
  });

  it('does not expose student or parent answer-review mutation routes', () => {
    expect(controllerMethods(StudentHomeworksController)).not.toEqual(
      expect.arrayContaining(['reviewAnswer', 'bulkReviewAnswers']),
    );
    expect(
      controllerMethods(StudentHomeworksController).filter((method) =>
        method.toLowerCase().includes('review'),
      ),
    ).toEqual([]);
    expect(controllerMethods(ParentHomeworksController)).toEqual([
      'listHomeworks',
      'getHomework',
    ]);
  });

  it('returns safe not-found scope errors when school A reviews a school B answer', async () => {
    const repository = {
      findSubmissionForAnswerReview: jest.fn().mockResolvedValue(null),
      reviewSubmissionAnswers: jest.fn(),
    };
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository as any,
      createAuthRepository(),
    );

    await expect(
      withSchoolAScope(() =>
        useCase.execute({
          homeworkId: 'school-b-homework',
          submissionId: 'school-b-submission',
          answerId: 'school-b-answer',
          review: { awardedPoints: 1 },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.not_found',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('prevents same-school unowned teachers from reviewing another teacher answer', async () => {
    const ownershipError = new Error('unowned homework');
    const ownership = {
      resolveOwnedHomework: jest.fn().mockRejectedValue(ownershipError),
    };
    const coreReview = { execute: jest.fn() };
    const useCase = new ReviewTeacherHomeworkSubmissionAnswerUseCase(
      ownership as any,
      coreReview as any,
    );

    await expect(
      useCase.execute(
        'other-allocation',
        'homework-a',
        'submission-a',
        'answer-a',
        { awardedPoints: 1 },
      ),
    ).rejects.toThrow(ownershipError);
    expect(coreReview.execute).not.toHaveBeenCalled();
  });

  it('keeps bulk answer review atomic for scoped answer mismatches', async () => {
    const repository = {
      findSubmissionForAnswerReview: jest
        .fn()
        .mockResolvedValue(seedReviewSubmission()),
      reviewSubmissionAnswers: jest.fn(),
    };
    const useCase = new BulkReviewHomeworkSubmissionAnswersUseCase(
      repository as any,
      createAuthRepository(),
    );

    await expect(
      withSchoolAScope(() =>
        useCase.execute({
          homeworkId: 'homework-a',
          submissionId: 'submission-a',
          reviews: [
            { answerId: 'answer-a', awardedPoints: 1 },
            { answerId: 'school-b-answer', awardedPoints: 1 },
          ],
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.invalid_scope',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('keeps student and parent answer payloads free of teacher-only fields unless reviewed policy allows scoring', () => {
    const answer = seedAnswer({
      teacherComment: 'Teacher-only feedback',
      awardedPoints: { toNumber: () => 1 },
      reviewedAt: new Date('2026-05-26T10:30:00.000Z'),
    });
    const student = presentHomeworkAnswersStudent([answer]);
    const parent = presentHomeworkAnswersParent([answer]);
    const reviewedStudent = presentHomeworkAnswersStudent([answer], {
      includeReviewFields: true,
    });
    const teacher = presentHomeworkAnswersTeacher([answer]);

    expect(JSON.stringify({ student, parent })).not.toContain('awardedPoints');
    expect(JSON.stringify({ student, parent })).not.toContain('teacherComment');
    expect(reviewedStudent.items[0]).toMatchObject({
      awardedPoints: 1,
      teacherComment: 'Teacher-only feedback',
    });
    expect(teacher.items[0]).toMatchObject({
      prompt: expect.objectContaining({ points: 2 }),
      selectedOptions: [
        expect.objectContaining({
          optionId: 'option-a',
          isCorrect: true,
        }),
      ],
    });

    const serialized = JSON.stringify({ student, parent, reviewedStudent });
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('expectedAnswer');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('reviewedByUserId');
  });
});

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    HomeworkSubmissionContentController.prototype[methodName],
  );
}

function controllerMethods(controller: Function): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (method) => method !== 'constructor',
  );
}

function createAuthRepository(): any {
  return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
}

function seedReviewSubmission(): any {
  return {
    id: 'submission-a',
    schoolId: 'school-a',
    homeworkAssignmentId: 'homework-a',
    homeworkTargetId: 'target-a',
    studentId: 'student-a',
    enrollmentId: 'enrollment-a',
    status: HomeworkSubmissionStatus.SUBMITTED,
    bodyText: null,
    submittedAt: new Date('2026-05-26T10:00:00.000Z'),
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    awardedMarks: null,
    answers: [seedAnswer()],
    attachments: [],
    student: {
      id: 'student-a',
      firstName: 'Student',
      lastName: 'A',
    },
    homeworkAssignment: {
      id: 'homework-a',
      status: HomeworkAssignmentStatus.PUBLISHED,
      totalMarks: { toNumber: () => 2 },
      questions: [seedQuestion()],
    },
    homeworkTarget: {
      id: 'target-a',
      status: HomeworkTargetStatus.SUBMITTED,
      submittedAt: new Date('2026-05-26T10:00:00.000Z'),
      reviewedAt: null,
    },
  };
}

function seedAnswer(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'answer-a',
    schoolId: 'school-a',
    organizationId: 'org-a',
    homeworkSubmissionId: 'submission-a',
    homeworkAssignmentId: 'homework-a',
    homeworkTargetId: 'target-a',
    homeworkQuestionId: 'question-a',
    textAnswer: null,
    selectedOptionIds: ['option-a'],
    isDraft: false,
    teacherComment: null,
    awardedPoints: null,
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: now,
    updatedAt: now,
    homeworkQuestion: seedQuestion(),
    ...overrides,
  };
}

function seedQuestion(): any {
  return {
    id: 'question-a',
    type: HomeworkQuestionType.SINGLE_CHOICE,
    prompt: 'Choose one',
    points: { toNumber: () => 2 },
    isRequired: true,
    expectedAnswer: 'Hidden expected answer',
    options: [
      {
        id: 'option-a',
        homeworkQuestionId: 'question-a',
        text: 'A',
        isCorrect: true,
        sortOrder: 0,
      },
    ],
  };
}
