import 'reflect-metadata';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import {
  DomainException,
  NotFoundDomainException,
} from '../../src/common/exceptions/domain-exception';
import { SCHOOL_SCOPED_MODELS } from '../../src/infrastructure/database/school-scope.extension';
import {
  LinkHomeworkGradeAssessmentUseCase,
  SyncHomeworkSubmissionToGradesUseCase,
} from '../../src/modules/homework/application/homework-grade-sync.use-cases';
import { HomeworkGradeSyncController } from '../../src/modules/homework/controller/homework-grade-sync.controller';
import { HomeworkAssignmentNotFoundException } from '../../src/modules/homework/domain/homework.exceptions';
import { presentHomeworkGradeSyncStatus } from '../../src/modules/homework/presenters/homework-grade-sync.presenter';
import { ParentHomeworksController } from '../../src/modules/parent-app/homeworks/controller/parent-homeworks.controller';
import { StudentHomeworksController } from '../../src/modules/student-app/homeworks/controller/student-homeworks.controller';
import { SyncTeacherHomeworkSubmissionToGradesUseCase } from '../../src/modules/teacher-app/homeworks/application/teacher-homeworks.use-cases';
import { TeacherHomeworksController } from '../../src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller';

describe('Homework grade sync tenancy/security contracts', () => {
  async function withSchoolAScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'school-user-a', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-a',
        organizationId: 'org-a',
        schoolId: 'school-a',
        roleId: 'role-a',
        permissions: ['homework.assignments.manage', 'grades.items.manage'],
      });

      return testFn();
    });
  }

  it('keeps grade sync storage and routes school-scoped with combined permissions', () => {
    expect([...SCHOOL_SCOPED_MODELS]).toEqual(
      expect.arrayContaining([
        'HomeworkAssignment',
        'HomeworkSubmission',
        'HomeworkTarget',
        'GradeAssessment',
        'GradeItem',
      ]),
    );
    expect(readPermissions('getStatus')).toEqual([
      'homework.assignments.view',
      'grades.items.view',
    ]);
    expect(readPermissions('linkGradeAssessment')).toEqual([
      'homework.assignments.manage',
      'grades.assessments.manage',
    ]);
    expect(readPermissions('syncAssignment')).toEqual([
      'homework.assignments.manage',
      'grades.items.manage',
    ]);
    expect(readPermissions('syncSubmission')).toEqual([
      'homework.assignments.manage',
      'grades.items.manage',
    ]);
  });

  it('does not expose student, parent, or teacher grade-assessment link routes', () => {
    expect(controllerMethods(StudentHomeworksController)).not.toEqual(
      expect.arrayContaining(['getGradeSyncStatus', 'syncAssignmentToGrades']),
    );
    expect(controllerMethods(ParentHomeworksController)).toEqual([
      'listHomeworks',
      'getHomework',
    ]);
    expect(controllerMethods(TeacherHomeworksController)).not.toEqual(
      expect.arrayContaining(['linkGradeAssessment']),
    );
  });

  it('school A cannot link a school B grade assessment', async () => {
    const repository = {
      findAssignmentById: jest.fn().mockResolvedValue(seedAssignment()),
      updateAssignmentGradeAssessmentLink: jest.fn(),
    };
    const getGradeAssessment = {
      execute: jest.fn().mockRejectedValue(
        new NotFoundDomainException('Grade assessment not found', {
          assessmentId: 'school-b-assessment',
        }),
      ),
    };
    const useCase = new LinkHomeworkGradeAssessmentUseCase(
      repository as any,
      getGradeAssessment as any,
      { execute: jest.fn() } as any,
      createAuthRepository(),
    );

    await expect(
      withSchoolAScope(() =>
        useCase.execute('homework-a', {
          gradeAssessmentId: 'school-b-assessment',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(
      repository.updateAssignmentGradeAssessmentLink,
    ).not.toHaveBeenCalled();
  });

  it('school A cannot sync a school B homework submission', async () => {
    const repository = {
      findAssignmentById: jest.fn().mockResolvedValue(null),
    };
    const useCase = new SyncHomeworkSubmissionToGradesUseCase(
      repository as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any,
      createAuthRepository(),
    );

    await expect(
      withSchoolAScope(() =>
        useCase.execute({
          homeworkId: 'school-b-homework',
          submissionId: 'school-b-submission',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.not_found',
    });
  });

  it('prevents same-school unowned teachers from syncing another teacher homework', async () => {
    const ownershipError = new HomeworkAssignmentNotFoundException({
      homeworkId: 'homework-a',
    });
    const ownership = {
      resolveOwnedHomework: jest.fn().mockRejectedValue(ownershipError),
    };
    const coreSync = { execute: jest.fn() };
    const useCase = new SyncTeacherHomeworkSubmissionToGradesUseCase(
      ownership as any,
      coreSync as any,
    );

    await expect(
      useCase.execute('other-allocation', 'homework-a', 'submission-a'),
    ).rejects.toBe(ownershipError);
    expect(coreSync.execute).not.toHaveBeenCalled();
  });

  it('keeps app-facing grade sync status payloads free of tenant fields', () => {
    const payload = presentHomeworkGradeSyncStatus({
      assignment: seedAssignment(),
      gradeAssessment: seedGradeAssessment(),
      reviewedSubmissions: [seedSubmission()],
      gradeItems: [seedGradeItem()],
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('rawError');
  });
});

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    HomeworkGradeSyncController.prototype[methodName],
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

function seedAssignment(): any {
  return {
    id: 'homework-a',
    gradeAssessmentId: null,
    status: 'PUBLISHED',
    deletedAt: null,
    academicYearId: 'year-a',
    termId: 'term-a',
    subjectId: 'subject-a',
    classroomId: 'classroom-a',
    classroom: {
      id: 'classroom-a',
      section: {
        id: 'section-a',
        grade: {
          id: 'grade-a',
          stageId: 'stage-a',
        },
      },
    },
  };
}

function seedGradeAssessment(): any {
  return {
    id: 'assessment-a',
    title: 'Homework Grade',
    type: 'ASSIGNMENT',
    deliveryMode: 'SCORE_ONLY',
    approvalStatus: 'published',
    maxScore: 10,
    isLocked: false,
  };
}

function seedSubmission(): any {
  return {
    id: 'submission-a',
    studentId: 'student-a',
    enrollmentId: 'enrollment-a',
    awardedMarks: { toNumber: () => 8 },
  };
}

function seedGradeItem(): any {
  return {
    id: 'item-a',
    assessmentId: 'assessment-a',
    studentId: 'student-a',
    enrollmentId: 'enrollment-a',
    score: 8,
    status: 'entered',
    enteredAt: '2026-09-10T10:00:00.000Z',
    isVirtualMissing: false,
  };
}
