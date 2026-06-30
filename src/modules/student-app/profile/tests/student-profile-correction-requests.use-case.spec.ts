import {
  AuditOutcome,
  StudentProfileCorrectionRequestStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import type {
  ProfileCorrectionRequestRecord,
  ProfileCorrectionStudentRecord,
} from '../../../students/profile-correction-requests/infrastructure/profile-correction-requests.repository';
import { ProfileCorrectionRequestsRepository } from '../../../students/profile-correction-requests/infrastructure/profile-correction-requests.repository';
import { presentStudentProfileCorrectionRequest } from '../../../students/profile-correction-requests/presenters/profile-correction-request.presenter';
import { ApproveProfileCorrectionRequestUseCase } from '../../../students/profile-correction-requests/application/staff-profile-correction-requests.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import {
  CancelStudentProfileCorrectionRequestUseCase,
  SubmitStudentProfileCorrectionRequestUseCase,
} from '../application/student-profile-correction-requests.use-cases';

describe('Student profile correction request use cases', () => {
  it('submits a valid request without mutating Student and audits safe metadata', async () => {
    const deps = createStudentUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue({
      context: contextFixture(),
      student: {} as never,
      enrollment: {} as never,
    });
    deps.repository.findCurrentStudentForCorrection.mockResolvedValue(
      studentFixture(),
    );
    deps.repository.createStudentRequest.mockResolvedValue(
      requestFixture({
        requestedChanges: {
          firstName: 'Corrected',
          studentEmail: 'corrected@example.test',
        },
        currentSnapshot: {
          firstName: 'Sara',
          studentEmail: 'sara@example.test',
        },
      }),
    );

    const result = await deps.submitUseCase.execute({
      changes: {
        firstName: ' Corrected ',
        studentEmail: ' corrected@example.test ',
      },
      reason: ' Please correct this. ',
    });

    expect(deps.repository.createStudentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        context: contextFixture(),
        changes: {
          firstName: 'Corrected',
          studentEmail: 'corrected@example.test',
        },
        currentSnapshot: {
          firstName: 'Sara',
          studentEmail: 'sara@example.test',
        },
        reason: 'Please correct this.',
      }),
    );
    expect(deps.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'student-user-1',
        userType: UserType.STUDENT,
        module: 'student_app',
        action: 'student.profile.correction.requested',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          requestId: 'request-1',
          studentId: 'student-1',
          status: StudentProfileCorrectionRequestStatus.PENDING,
          changedFieldNames: ['firstName', 'studentEmail'],
          source: 'student_app',
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 'request-1',
      status: 'PENDING',
      requestedChanges: {
        firstName: 'Corrected',
        studentEmail: 'corrected@example.test',
      },
      submittedAt: '2026-06-30T10:00:00.000Z',
      resolvedAt: null,
      cancelledAt: null,
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('requestedByUserId');
    expect(JSON.stringify(result)).not.toContain('userId');
  });

  it('rejects empty and disallowed changes before creating a request', async () => {
    const deps = createStudentUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue({
      context: contextFixture(),
      student: {} as never,
      enrollment: {} as never,
    });
    deps.repository.findCurrentStudentForCorrection.mockResolvedValue(
      studentFixture(),
    );

    await expect(
      deps.submitUseCase.execute({ changes: {}, reason: null }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      deps.submitUseCase.execute({
        changes: { userId: 'student-user-1' },
        reason: null,
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    expect(deps.repository.createStudentRequest).not.toHaveBeenCalled();
  });

  it('prevents cancelling terminal requests', async () => {
    const deps = createStudentUseCases();
    deps.accessService.getStudentAppContext.mockResolvedValue(contextFixture());
    deps.repository.cancelStudentRequest.mockResolvedValue({
      status: 'not_pending',
      currentStatus: StudentProfileCorrectionRequestStatus.APPROVED,
      request: requestFixture({
        status: StudentProfileCorrectionRequestStatus.APPROVED,
      }),
    });

    await expect(
      deps.cancelUseCase.execute('request-1'),
    ).rejects.toMatchObject({
      code: 'students.profile_correction.not_pending',
    });

    expect(deps.authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('staff approval applies through repository and writes safe audit metadata', async () => {
    const repository = {
      approveStaffRequest: jest.fn().mockResolvedValue({
        status: 'approved',
        request: requestFixture({
          status: StudentProfileCorrectionRequestStatus.APPROVED,
          approvedAt: new Date('2026-06-30T10:05:00.000Z'),
        }),
      }),
    } as unknown as jest.Mocked<ProfileCorrectionRequestsRepository>;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthRepository>;
    const useCase = new ApproveProfileCorrectionRequestUseCase(
      repository,
      authRepository,
    );

    const result = await withStaffContext(() =>
      useCase.execute('request-1', { reviewerNote: ' Approved. ' }),
    );

    expect(repository.approveStaffRequest).toHaveBeenCalledWith({
      schoolId: 'school-1',
      actorId: 'staff-user-1',
      requestId: 'request-1',
      reviewerNote: 'Approved.',
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'staff-user-1',
        module: 'students',
        action: 'students.profile.correction.approved',
        resourceType: 'student_profile_correction_request',
        after: expect.objectContaining({
          requestId: 'request-1',
          studentId: 'student-1',
          changedFieldNames: ['firstName'],
          source: 'school_staff',
        }),
      }),
    );
    expect(result.student).toEqual({
      studentId: 'student-1',
      displayName: 'Sara Student',
      studentNumber: null,
      firstName: 'Sara',
      lastName: 'Student',
      status: 'active',
    });
    expect(JSON.stringify(result)).not.toContain('approvedBy');
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });

  it('student presenter hides tenant and actor internals', () => {
    const result = presentStudentProfileCorrectionRequest(requestFixture());
    const serialized = JSON.stringify(result);

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'requestedByUserId',
      'approvedBy',
      'rejectedBy',
      'cancelledBy',
      'userId',
      'applicationId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function createStudentUseCases(): {
  submitUseCase: SubmitStudentProfileCorrectionRequestUseCase;
  cancelUseCase: CancelStudentProfileCorrectionRequestUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  repository: jest.Mocked<ProfileCorrectionRequestsRepository>;
  authRepository: jest.Mocked<AuthRepository>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
    getStudentAppContext: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const repository = {
    findCurrentStudentForCorrection: jest.fn(),
    createStudentRequest: jest.fn(),
    cancelStudentRequest: jest.fn(),
  } as unknown as jest.Mocked<ProfileCorrectionRequestsRepository>;
  const authRepository = {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthRepository>;

  return {
    submitUseCase: new SubmitStudentProfileCorrectionRequestUseCase(
      accessService,
      repository,
      authRepository,
    ),
    cancelUseCase: new CancelStudentProfileCorrectionRequestUseCase(
      accessService,
      repository,
      authRepository,
    ),
    accessService,
    repository,
    authRepository,
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: null,
  };
}

function studentFixture(): ProfileCorrectionStudentRecord {
  return {
    id: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    userId: 'student-user-1',
    firstName: 'Sara',
    fatherNameEn: null,
    grandfatherNameEn: null,
    lastName: 'Student',
    firstNameAr: null,
    fatherNameAr: null,
    grandfatherNameAr: null,
    familyNameAr: null,
    birthDate: new Date('2010-01-01T00:00:00.000Z'),
    gender: 'FEMALE',
    nationality: 'Egyptian',
    addressLine: 'Old Street',
    city: 'Cairo',
    district: 'Nasr City',
    studentPhone: '+201000000000',
    studentEmail: 'sara@example.test',
    status: StudentStatus.ACTIVE,
    deletedAt: null,
  };
}

function requestFixture(
  overrides?: Partial<ProfileCorrectionRequestRecord>,
): ProfileCorrectionRequestRecord {
  return {
    id: 'request-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    studentId: 'student-1',
    status: StudentProfileCorrectionRequestStatus.PENDING,
    requestedChanges: { firstName: 'Corrected' },
    currentSnapshot: { firstName: 'Sara' },
    reason: 'Please correct this.',
    reviewerNote: null,
    approvedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-06-30T10:00:00.000Z'),
    updatedAt: new Date('2026-06-30T10:00:00.000Z'),
    deletedAt: null,
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
    },
    ...overrides,
  };
}

async function withStaffContext<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'staff-user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['students.records.view', 'students.records.manage'],
    });

    return fn();
  });
}
