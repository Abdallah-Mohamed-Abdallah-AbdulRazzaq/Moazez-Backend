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
import { SaveStudentHomeworkAnswerUseCase } from '../../src/modules/homework/application/homework-answers.use-cases';
import { CreateStudentHomeworkSubmissionAttachmentUseCase } from '../../src/modules/homework/application/homework-submission-attachments.use-cases';
import { HomeworkSubmissionContentController } from '../../src/modules/homework/controller/homework-submission-content.controller';
import {
  presentHomeworkAnswersParent,
  presentHomeworkAnswersStudent,
} from '../../src/modules/homework/presenters/homework-answer.presenter';
import { presentHomeworkSubmissionAttachment } from '../../src/modules/homework/presenters/homework-submission-attachment.presenter';

describe('Homework answers and submission attachments tenancy/security contracts', () => {
  async function withSchoolAStudentScope<T>(
    testFn: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'student-user-a', userType: UserType.STUDENT });
      setActiveMembership({
        membershipId: 'membership-a',
        organizationId: 'org-a',
        schoolId: 'school-a',
        roleId: 'role-a',
        permissions: [],
      });

      return testFn();
    });
  }

  it('registers submission answer and attachment models for school isolation', () => {
    expect([...SCHOOL_SCOPED_MODELS]).toEqual(
      expect.arrayContaining([
        'HomeworkSubmissionAnswer',
        'HomeworkSubmissionAttachment',
      ]),
    );
  });

  it('keeps core submission content reads behind the submissions view permission', () => {
    expect(readPermissions('listAnswers')).toEqual([
      'homework.submissions.view',
    ]);
    expect(readPermissions('getAnswer')).toEqual(['homework.submissions.view']);
    expect(readPermissions('listAttachments')).toEqual([
      'homework.submissions.view',
    ]);
  });

  it('returns safe not-found scope errors for another student or school submission answers', async () => {
    const repository = {
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(null),
      resolveDraftSubmission: jest.fn(),
      upsertSubmissionAnswer: jest.fn(),
    };
    const useCase = new SaveStudentHomeworkAnswerUseCase(repository as any);

    await expect(
      withSchoolAStudentScope(() =>
        useCase.execute({
          homeworkId: 'school-b-homework',
          studentId: 'student-a',
          enrollmentId: 'enrollment-a',
          questionId: 'question-b',
          answer: { questionId: 'question-b', textAnswer: 'Hidden' },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer.invalid_submission_scope',
    });
    expect(repository.resolveDraftSubmission).not.toHaveBeenCalled();
    expect(repository.upsertSubmissionAnswer).not.toHaveBeenCalled();
  });

  it('prevents attaching a wrong-school file to a same-school homework submission', async () => {
    const repository = {
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(seedTarget()),
      resolveDraftSubmission: jest.fn().mockResolvedValue({
        outcome: 'saved',
        submission: seedSubmission(),
      }),
      findAttachmentFile: jest.fn().mockResolvedValue({
        id: 'file-b',
        schoolId: 'school-b',
        uploaderId: 'student-user-a',
        deletedAt: null,
      }),
      getNextSubmissionAttachmentSortOrder: jest.fn(),
      createSubmissionAttachment: jest.fn(),
    };
    const useCase = new CreateStudentHomeworkSubmissionAttachmentUseCase(
      repository as any,
      createAuthRepository(),
    );

    await expect(
      withSchoolAStudentScope(() =>
        useCase.execute(
          {
            homeworkId: 'homework-a',
            studentId: 'student-a',
            enrollmentId: 'enrollment-a',
          },
          { fileId: 'file-b' },
        ),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission_attachment.file_not_found',
    });
    expect(repository.createSubmissionAttachment).not.toHaveBeenCalled();
  });

  it('keeps student and parent answer payloads free of correct answers and tenant fields', () => {
    const student = presentHomeworkAnswersStudent([seedAnswer()]);
    const parent = presentHomeworkAnswersParent([seedAnswer()]);
    const attachment = presentHomeworkSubmissionAttachment(
      seedSubmissionAttachment() as any,
    );
    const serialized = JSON.stringify({ student, parent, attachment });

    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('expectedAnswer');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('raw-storage-key');
  });
});

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    HomeworkSubmissionContentController.prototype[methodName],
  );
}

function createAuthRepository(): any {
  return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
}

function seedTarget(): any {
  return {
    id: 'target-a',
    schoolId: 'school-a',
    homeworkAssignmentId: 'homework-a',
    studentId: 'student-a',
    enrollmentId: 'enrollment-a',
    status: HomeworkTargetStatus.ASSIGNED,
    homeworkAssignment: {
      id: 'homework-a',
      status: HomeworkAssignmentStatus.PUBLISHED,
      questions: [seedQuestion()],
    },
    submissions: [seedSubmission()],
  };
}

function seedSubmission(): any {
  return {
    id: 'submission-a',
    schoolId: 'school-a',
    homeworkAssignmentId: 'homework-a',
    homeworkTargetId: 'target-a',
    studentId: 'student-a',
    enrollmentId: 'enrollment-a',
    status: HomeworkSubmissionStatus.DRAFT,
    bodyText: null,
    answers: [],
    attachments: [],
  };
}

function seedQuestion(): any {
  return {
    id: 'question-a',
    type: HomeworkQuestionType.SINGLE_CHOICE,
    prompt: 'Choose one',
    points: { toNumber: () => 1 },
    isRequired: true,
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

function seedAnswer(): any {
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
    teacherComment: 'Hidden teacher note',
    awardedPoints: { toNumber: () => 1 },
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: now,
    updatedAt: now,
    homeworkQuestion: {
      ...seedQuestion(),
      expectedAnswer: 'Hidden expected answer',
    },
  };
}

function seedSubmissionAttachment(): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'submission-attachment-a',
    schoolId: 'school-a',
    organizationId: 'org-a',
    homeworkSubmissionId: 'submission-a',
    homeworkAssignmentId: 'homework-a',
    homeworkTargetId: 'target-a',
    fileId: 'file-a',
    title: null,
    description: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    file: {
      originalName: 'proof.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(2048),
      objectKey: 'raw-storage-key',
    },
  };
}
