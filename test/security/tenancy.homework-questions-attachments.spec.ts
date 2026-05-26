import 'reflect-metadata';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkTargetMode,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import {
  REQUIRED_PERMISSIONS_METADATA,
} from '../../src/common/decorators/required-permissions.decorator';
import { DomainException } from '../../src/common/exceptions/domain-exception';
import { SCHOOL_SCOPED_MODELS } from '../../src/infrastructure/database/school-scope.extension';
import {
  CreateHomeworkAttachmentUseCase,
} from '../../src/modules/homework/application/homework-attachments.use-cases';
import {
  CreateHomeworkQuestionUseCase,
  ListHomeworkQuestionsUseCase,
} from '../../src/modules/homework/application/homework-questions.use-cases';
import { HomeworkAttachmentsController } from '../../src/modules/homework/controller/homework-attachments.controller';
import { HomeworkQuestionsController } from '../../src/modules/homework/controller/homework-questions.controller';
import { presentHomeworkAttachment } from '../../src/modules/homework/presenters/homework-attachment.presenter';
import {
  presentHomeworkQuestionAdmin,
  presentHomeworkQuestionSafe,
} from '../../src/modules/homework/presenters/homework-question.presenter';

describe('Homework questions and attachments tenancy/security contracts', () => {
  async function withSchoolAScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-a', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-a',
        organizationId: 'org-a',
        schoolId: 'school-a',
        roleId: 'role-a',
        permissions: [
          'homework.assignments.view',
          'homework.assignments.manage',
        ],
      });

      return testFn();
    });
  }

  it('registers new tenant-scoped models for automatic school isolation', () => {
    expect([...SCHOOL_SCOPED_MODELS]).toEqual(
      expect.arrayContaining([
        'HomeworkQuestion',
        'HomeworkQuestionOption',
        'HomeworkAssignmentAttachment',
      ]),
    );
  });

  it('prevents school A from reading or mutating school B homework questions', async () => {
    const hiddenAssignmentRepository = {
      findAssignmentById: jest.fn().mockResolvedValue(null),
      listQuestions: jest.fn(),
      createQuestionWithOptions: jest.fn(),
    };

    await expect(
      withSchoolAScope(() =>
        new ListHomeworkQuestionsUseCase(
          hiddenAssignmentRepository as any,
        ).execute('school-b-homework'),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.not_found',
    });

    await expect(
      withSchoolAScope(() =>
        new CreateHomeworkQuestionUseCase(
          hiddenAssignmentRepository as any,
          createAuthRepository(),
        ).execute('school-b-homework', {
          type: HomeworkQuestionType.SHORT_TEXT,
          prompt: 'Cross-school question',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.not_found',
    });

    expect(hiddenAssignmentRepository.listQuestions).not.toHaveBeenCalled();
    expect(
      hiddenAssignmentRepository.createQuestionWithOptions,
    ).not.toHaveBeenCalled();
  });

  it('prevents attaching a school B file to a school A homework assignment', async () => {
    const repository = {
      findAssignmentById: jest.fn().mockResolvedValue(seedAssignment()),
      findAttachmentFile: jest.fn().mockResolvedValue({
        id: 'file-b',
        schoolId: 'school-b',
        deletedAt: null,
      }),
      getNextAttachmentSortOrder: jest.fn(),
      createAttachment: jest.fn(),
    };

    await expect(
      withSchoolAScope(() =>
        new CreateHomeworkAttachmentUseCase(
          repository as any,
          createAuthRepository(),
        ).execute('homework-a', { fileId: 'file-b' }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.attachment.file_not_found',
    });

    expect(repository.createAttachment).not.toHaveBeenCalled();
  });

  it('keeps management routes behind homework manage permissions', () => {
    expect(readPermissions(HomeworkQuestionsController, 'listQuestions')).toEqual([
      'homework.assignments.view',
    ]);
    expect(readPermissions(HomeworkQuestionsController, 'createQuestion')).toEqual(
      ['homework.assignments.manage'],
    );
    expect(readPermissions(HomeworkQuestionsController, 'createOption')).toEqual([
      'homework.assignments.manage',
    ]);
    expect(
      readPermissions(HomeworkAttachmentsController, 'listAttachments'),
    ).toEqual(['homework.assignments.view']);
    expect(
      readPermissions(HomeworkAttachmentsController, 'createAttachment'),
    ).toEqual(['homework.assignments.manage']);
  });

  it('hides correct answers, expected answers, and tenant fields from safe presenters', () => {
    const question = seedQuestion();
    const safeQuestion = presentHomeworkQuestionSafe(question);
    const adminQuestion = presentHomeworkQuestionAdmin(question);
    const attachment = presentHomeworkAttachment(seedAttachment());

    expect(adminQuestion.expectedAnswer).toBe('Teacher-only answer');
    expect(adminQuestion.options[0].isCorrect).toBe(true);
    expect(JSON.stringify(safeQuestion)).not.toContain('expectedAnswer');
    expect(JSON.stringify(safeQuestion)).not.toContain('isCorrect');
    expect(JSON.stringify(safeQuestion)).not.toContain('schoolId');
    expect(JSON.stringify(safeQuestion)).not.toContain('organizationId');
    expect(JSON.stringify(attachment)).not.toContain('schoolId');
    expect(JSON.stringify(attachment)).not.toContain('organizationId');
    expect(JSON.stringify(attachment)).not.toContain('storage-key');
  });
});

function readPermissions(
  controller: Function,
  methodName: string,
): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    controller.prototype[methodName],
  );
}

function createAuthRepository(): any {
  return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
}

function seedAssignment(): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'homework-a',
    schoolId: 'school-a',
    mode: HomeworkAssignmentMode.HOMEWORK,
    status: HomeworkAssignmentStatus.DRAFT,
    targetMode: HomeworkTargetMode.CLASSROOM,
    title: 'Homework A',
    description: null,
    dueAt: new Date('2030-05-26T10:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
  };
}

function seedQuestion(): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'question-a',
    schoolId: 'school-a',
    organizationId: 'org-a',
    homeworkAssignmentId: 'homework-a',
    type: HomeworkQuestionType.SINGLE_CHOICE,
    prompt: 'Choose the correct answer',
    instructions: null,
    points: { toNumber: () => 2 },
    sortOrder: 0,
    isRequired: true,
    expectedAnswer: 'Teacher-only answer',
    createdAt: now,
    updatedAt: now,
    options: [
      {
        id: 'option-a',
        schoolId: 'school-a',
        homeworkQuestionId: 'question-a',
        text: 'Correct',
        isCorrect: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function seedAttachment(): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'attachment-a',
    schoolId: 'school-a',
    organizationId: 'org-a',
    homeworkAssignmentId: 'homework-a',
    fileId: 'file-a',
    title: null,
    description: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    file: {
      id: 'file-a',
      originalName: 'worksheet.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(1024),
      objectKey: 'raw-storage-key',
    },
  };
}
