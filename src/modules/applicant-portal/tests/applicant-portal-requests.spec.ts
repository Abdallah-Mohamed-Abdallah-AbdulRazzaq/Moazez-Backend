import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
  ApplicantAdmissionRequestStatus,
  AuditOutcome,
  UserStatus,
  UserType,
} from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { ApplicantPortalAccessService } from '../application/applicant-portal-access.service';
import { CreateApplicantRequestUseCase } from '../application/create-applicant-request.use-case';
import { GetApplicantRequestUseCase } from '../application/get-applicant-request.use-case';
import { ListApplicantRequestsUseCase } from '../application/list-applicant-requests.use-case';
import { SubmitApplicantRequestUseCase } from '../application/submit-applicant-request.use-case';
import { normalizeCreateApplicantRequestInput } from '../domain/applicant-request.inputs';
import {
  ApplicantAdmissionRequestRecord,
  ApplicantPortalRepository,
} from '../infrastructure/applicant-portal.repository';
import { presentApplicantRequestDetail } from '../presenters/applicant-request.presenter';

const APPLICANT_USER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_APPLICANT_USER_ID = '00000000-0000-0000-0000-000000000099';
const APPLICANT_PROFILE_ID = '00000000-0000-0000-0000-000000000002';
const SCHOOL_ID = '00000000-0000-0000-0000-000000000101';
const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000102';
const REQUEST_ID = '00000000-0000-0000-0000-000000000201';
const APPLICATION_ID = '00000000-0000-0000-0000-000000000501';
const APPLICATION_DOCUMENT_ID = '00000000-0000-0000-0000-000000000502';
const APPLICANT_DOCUMENT_ID = '00000000-0000-0000-0000-000000000503';
const FILE_ID = '00000000-0000-0000-0000-000000000504';
const GRADE_ID = '00000000-0000-0000-0000-000000000301';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000401';

describe('Applicant Portal request ownership foundation', () => {
  it('normalizes create input and derives child full name', () => {
    const normalized = normalizeCreateApplicantRequestInput({
      schoolId: SCHOOL_ID,
      requestedAcademicYearId: ACADEMIC_YEAR_ID,
      requestedGradeId: GRADE_ID,
      childFirstName: '  Layla ',
      childLastName: ' Hassan  ',
      childDateOfBirth: '2018-04-12',
      childGender: ' female ',
      childNationality: ' Egyptian ',
      previousSchool: ' ABC School ',
      notes: ' Needs bus route info. ',
    });

    expect(normalized).toMatchObject({
      childFirstName: 'Layla',
      childLastName: 'Hassan',
      childFullName: 'Layla Hassan',
      childGender: 'female',
      childNationality: 'Egyptian',
      previousSchool: 'ABC School',
      notes: 'Needs bus route info.',
    });
    expect(normalized.childDateOfBirth?.toISOString().slice(0, 10)).toBe(
      '2018-04-12',
    );
  });

  it('creates a draft request for a membershipless applicant using access context ownership', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolForRequest.mockResolvedValue({
      id: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
    });
    repository.findAcademicYearForSchool.mockResolvedValue({
      id: ACADEMIC_YEAR_ID,
    });
    repository.findGradeForSchool.mockResolvedValue({ id: GRADE_ID });
    repository.createApplicantAdmissionRequest.mockResolvedValue(
      requestRecordFixture(),
    );
    repository.countMandatoryRequiredDocumentsForSchool.mockResolvedValue(2);
    const authRepository = mockAuthRepository();
    const useCase = new CreateApplicantRequestUseCase(
      mockAccessService(),
      repository,
      authRepository,
    );

    const response = await useCase.execute({
      schoolId: SCHOOL_ID,
      childFirstName: 'Layla',
      childLastName: 'Hassan',
      childDateOfBirth: '2018-04-12',
      childGender: 'female',
      childNationality: 'Egyptian',
      requestedAcademicYearId: ACADEMIC_YEAR_ID,
      requestedGradeId: GRADE_ID,
      previousSchool: 'ABC School',
      notes: 'Needs bus route info.',
      applicantUserId: OTHER_APPLICANT_USER_ID,
      applicantProfileId: '00000000-0000-0000-0000-000000000098',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    } as never);

    expect(repository.findDiscoverableSchoolForRequest).toHaveBeenCalledWith(
      SCHOOL_ID,
    );
    expect(repository.findAcademicYearForSchool).toHaveBeenCalledWith(
      SCHOOL_ID,
      ACADEMIC_YEAR_ID,
    );
    expect(repository.findGradeForSchool).toHaveBeenCalledWith(
      SCHOOL_ID,
      GRADE_ID,
    );
    expect(repository.createApplicantAdmissionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantUserId: APPLICANT_USER_ID,
        applicantProfileId: APPLICANT_PROFILE_ID,
        schoolId: SCHOOL_ID,
        organizationId: ORGANIZATION_ID,
        childFullName: 'Layla Hassan',
      }),
    );
    expect(
      repository.createApplicantAdmissionRequest.mock.calls[0][0],
    ).not.toMatchObject({
      applicantUserId: OTHER_APPLICANT_USER_ID,
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: APPLICANT_USER_ID,
        userType: UserType.APPLICANT,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        module: 'applicant_portal',
        action: 'applicant.request.create',
        resourceType: 'applicant_admission_request',
        resourceId: REQUEST_ID,
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(response).toMatchObject({
      id: REQUEST_ID,
      status: 'draft',
      childFullName: 'Layla Hassan',
      missingItemsCount: 2,
      progressValue: 25,
    });
  });

  it('rejects unsafe schools before creating a request', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolForRequest.mockResolvedValue(null);
    const useCase = new CreateApplicantRequestUseCase(
      mockAccessService(),
      repository,
      mockAuthRepository(),
    );

    await expect(
      useCase.execute({
        schoolId: SCHOOL_ID,
        childFirstName: 'Layla',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.createApplicantAdmissionRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid requested academic year or cross-school grade', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolForRequest.mockResolvedValue({
      id: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
    });
    repository.findAcademicYearForSchool.mockResolvedValue(null);
    const useCase = new CreateApplicantRequestUseCase(
      mockAccessService(),
      repository,
      mockAuthRepository(),
    );

    await expect(
      useCase.execute({
        schoolId: SCHOOL_ID,
        childFirstName: 'Layla',
        requestedAcademicYearId: ACADEMIC_YEAR_ID,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.createApplicantAdmissionRequest).not.toHaveBeenCalled();

    repository.findAcademicYearForSchool.mockResolvedValue({
      id: ACADEMIC_YEAR_ID,
    });
    repository.findGradeForSchool.mockResolvedValue(null);

    await expect(
      useCase.execute({
        schoolId: SCHOOL_ID,
        childFirstName: 'Layla',
        requestedAcademicYearId: ACADEMIC_YEAR_ID,
        requestedGradeId: GRADE_ID,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.createApplicantAdmissionRequest).not.toHaveBeenCalled();
  });

  it('lists only current applicant requests and derives missing count per request', async () => {
    const repository = mockApplicantRepository();
    repository.listApplicantAdmissionRequestsForApplicant.mockResolvedValue({
      items: [
        requestRecordFixture(),
        requestRecordFixture({ id: `${REQUEST_ID.slice(0, -1)}2` }),
      ],
      page: 1,
      limit: 100,
      total: 2,
    });
    repository.countMandatoryRequiredDocumentsForSchool.mockResolvedValue(3);
    repository.countMissingMandatoryRequiredDocumentsForRequest
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const useCase = new ListApplicantRequestsUseCase(
      mockAccessService(),
      repository,
    );

    const response = await useCase.execute({ page: 1, limit: 500 });

    expect(
      repository.listApplicantAdmissionRequestsForApplicant,
    ).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      page: 1,
      limit: 100,
      status: undefined,
    });
    expect(
      repository.countMandatoryRequiredDocumentsForSchool,
    ).toHaveBeenCalledTimes(1);
    expect(
      repository.countMissingMandatoryRequiredDocumentsForRequest,
    ).toHaveBeenCalledTimes(2);
    expect(response.meta).toMatchObject({ page: 1, limit: 100, total: 2 });
    expect(response.data.map((item) => item.missingItemsCount)).toEqual([2, 1]);
  });

  it('reads only the current applicant request and returns not found on cross-applicant ids', async () => {
    const repository = mockApplicantRepository();
    repository.findApplicantAdmissionRequestForApplicant.mockResolvedValue(
      requestRecordFixture(),
    );
    repository.countMandatoryRequiredDocumentsForSchool.mockResolvedValue(1);
    repository.countMissingMandatoryRequiredDocumentsForRequest.mockResolvedValue(
      1,
    );
    const useCase = new GetApplicantRequestUseCase(
      mockAccessService(),
      repository,
    );

    await expect(useCase.execute(REQUEST_ID)).resolves.toMatchObject({
      id: REQUEST_ID,
      missingItemsCount: 1,
    });
    expect(
      repository.findApplicantAdmissionRequestForApplicant,
    ).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
    });

    repository.findApplicantAdmissionRequestForApplicant.mockResolvedValue(
      null,
    );
    await expect(useCase.execute(REQUEST_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('submits an own draft request and derives needs-action response status', async () => {
    const repository = mockApplicantRepository();
    repository.submitApplicantAdmissionRequest.mockResolvedValue({
      kind: 'submitted',
      request: requestRecordFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        application: { status: AdmissionApplicationStatus.DOCUMENTS_PENDING },
      }),
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      missingItemsCount: 2,
      createdApplication: true,
    });
    const authRepository = mockAuthRepository();
    const useCase = new SubmitApplicantRequestUseCase(
      mockAccessService(),
      repository,
      authRepository,
    );

    const response = await useCase.execute({
      requestId: REQUEST_ID,
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(repository.submitApplicantAdmissionRequest).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
      submittedAt: expect.any(Date),
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: APPLICANT_USER_ID,
        userType: UserType.APPLICANT,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        module: 'applicant_portal',
        action: 'applicant.request.submit',
        resourceType: 'applicant_admission_request',
        resourceId: REQUEST_ID,
        outcome: AuditOutcome.SUCCESS,
        after: {
          status: 'needs_action',
          missingItemsCount: 2,
          applicationCreated: true,
        },
      }),
    );
    expect(response).toMatchObject({
      id: REQUEST_ID,
      status: 'needs_action',
      missingItemsCount: 2,
      progressValue: 40,
    });
  });

  it('returns an already submitted request without duplicate submit audit work', async () => {
    const repository = mockApplicantRepository();
    repository.submitApplicantAdmissionRequest.mockResolvedValue({
      kind: 'submitted',
      request: requestRecordFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        application: { status: AdmissionApplicationStatus.SUBMITTED },
      }),
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      missingItemsCount: 0,
      createdApplication: false,
    });
    const authRepository = mockAuthRepository();
    const useCase = new SubmitApplicantRequestUseCase(
      mockAccessService(),
      repository,
      authRepository,
    );

    await expect(
      useCase.execute({ requestId: REQUEST_ID }),
    ).resolves.toMatchObject({
      id: REQUEST_ID,
      status: 'submitted',
      missingItemsCount: 0,
      progressValue: 50,
    });
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('keeps cross-applicant, unsafe-school, and non-draft submit failures safe', async () => {
    const repository = mockApplicantRepository();
    const useCase = new SubmitApplicantRequestUseCase(
      mockAccessService(),
      repository,
      mockAuthRepository(),
    );

    repository.submitApplicantAdmissionRequest.mockResolvedValueOnce({
      kind: 'not_found',
    });
    await expect(
      useCase.execute({ requestId: REQUEST_ID }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });

    repository.submitApplicantAdmissionRequest.mockResolvedValueOnce({
      kind: 'unsafe_school',
    });
    await expect(
      useCase.execute({ requestId: REQUEST_ID }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });

    repository.submitApplicantAdmissionRequest.mockResolvedValueOnce({
      kind: 'invalid_state',
    });
    await expect(
      useCase.execute({ requestId: REQUEST_ID }),
    ).rejects.toMatchObject({
      code: 'conflict',
      httpStatus: 409,
    });
  });

  it('presents request details without leaking internal tenant or applicant fields', () => {
    const response = presentApplicantRequestDetail(
      {
        ...requestRecordFixture(),
        applicantUserId: APPLICANT_USER_ID,
        applicantProfileId: APPLICANT_PROFILE_ID,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        applicationId: '00000000-0000-0000-0000-000000000501',
        submittedAt: null,
        deletedAt: null,
      } as unknown as ApplicantAdmissionRequestRecord,
      2,
    );

    expect(response).toEqual({
      id: REQUEST_ID,
      status: 'draft',
      school: {
        id: SCHOOL_ID,
        name: 'Public Moazez Academy',
        shortName: 'Moazez',
        city: 'Cairo',
        country: 'Egypt',
      },
      childFullName: 'Layla Hassan',
      requestedAcademicYear: {
        id: ACADEMIC_YEAR_ID,
        label: '2026/2027',
      },
      requestedGrade: {
        id: GRADE_ID,
        label: 'Grade 4',
      },
      missingItemsCount: 2,
      progressValue: 25,
      createdAt: '2026-06-10T10:00:00.000Z',
      updatedAt: '2026-06-10T10:05:00.000Z',
      child: {
        firstName: 'Layla',
        lastName: 'Hassan',
        fullName: 'Layla Hassan',
        dateOfBirth: '2018-04-12',
        gender: 'female',
        nationality: 'Egyptian',
      },
      previousSchool: 'ABC School',
      notes: 'Needs bus route info.',
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'organizationId',
      'applicantUserId',
      'applicantProfileId',
      'applicationId',
      'submittedAt',
      'deletedAt',
      'status":"DRAFT',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('maps linked Admissions statuses to applicant-facing request statuses', () => {
    const cases: Array<{
      applicationStatus: AdmissionApplicationStatus;
      expectedStatus: string;
      expectedProgress: number;
    }> = [
      {
        applicationStatus: AdmissionApplicationStatus.DOCUMENTS_PENDING,
        expectedStatus: 'needs_action',
        expectedProgress: 40,
      },
      {
        applicationStatus: AdmissionApplicationStatus.SUBMITTED,
        expectedStatus: 'submitted',
        expectedProgress: 50,
      },
      {
        applicationStatus: AdmissionApplicationStatus.UNDER_REVIEW,
        expectedStatus: 'under_review',
        expectedProgress: 70,
      },
      {
        applicationStatus: AdmissionApplicationStatus.WAITLISTED,
        expectedStatus: 'waitlisted',
        expectedProgress: 80,
      },
      {
        applicationStatus: AdmissionApplicationStatus.ACCEPTED,
        expectedStatus: 'accepted',
        expectedProgress: 100,
      },
      {
        applicationStatus: AdmissionApplicationStatus.REJECTED,
        expectedStatus: 'rejected',
        expectedProgress: 100,
      },
    ];

    for (const testCase of cases) {
      const response = presentApplicantRequestDetail(
        requestRecordFixture({
          status: ApplicantAdmissionRequestStatus.SUBMITTED,
          application: { status: testCase.applicationStatus },
        }),
        2,
      );

      expect(response.status).toBe(testCase.expectedStatus);
      expect(response.progressValue).toBe(testCase.expectedProgress);
    }
  });

  it('counts only active mandatory school-level required documents', async () => {
    const prisma = {
      admissionRequiredDocument: {
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await expect(
      repository.countMandatoryRequiredDocumentsForSchool(SCHOOL_ID),
    ).resolves.toBe(2);

    expect(prisma.admissionRequiredDocument.count).toHaveBeenCalledWith({
      where: {
        schoolId: SCHOOL_ID,
        gradeId: null,
        isMandatory: true,
        isActive: true,
        deletedAt: null,
      },
    });
  });

  it('creates only ApplicantAdmissionRequest rows in the repository path', async () => {
    const prisma = {
      applicantAdmissionRequest: {
        create: jest.fn().mockResolvedValue(requestRecordFixture()),
      },
      application: { create: jest.fn() },
      applicationDocument: { create: jest.fn() },
      student: { create: jest.fn() },
      guardian: { create: jest.fn() },
      studentGuardian: { create: jest.fn() },
      enrollment: { create: jest.fn() },
      membership: { create: jest.fn() },
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await repository.createApplicantAdmissionRequest({
      applicantUserId: APPLICANT_USER_ID,
      applicantProfileId: APPLICANT_PROFILE_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      requestedAcademicYearId: null,
      requestedGradeId: null,
      childFirstName: 'Layla',
      childLastName: null,
      childFullName: 'Layla',
      childDateOfBirth: null,
      childGender: null,
      childNationality: null,
      previousSchool: null,
      notes: null,
    });

    expect(prisma.applicantAdmissionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicantUserId: APPLICANT_USER_ID,
          applicantProfileId: APPLICANT_PROFILE_ID,
          status: ApplicantAdmissionRequestStatus.DRAFT,
          submittedAt: null,
        }),
      }),
    );
    expect(prisma.application.create).not.toHaveBeenCalled();
    expect(prisma.applicationDocument.create).not.toHaveBeenCalled();
    expect(prisma.student.create).not.toHaveBeenCalled();
    expect(prisma.guardian.create).not.toHaveBeenCalled();
    expect(prisma.studentGuardian.create).not.toHaveBeenCalled();
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  it('transactionally submits a draft by creating exactly one Admissions Application', async () => {
    const submittedAt = new Date('2026-06-10T11:00:00.000Z');
    const tx = mockSubmitTransactionClient({
      request: submitRequestRecordFixture(),
      detail: requestRecordFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        application: { status: AdmissionApplicationStatus.DOCUMENTS_PENDING },
      }),
      missingItemsCount: 2,
    });
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    const result = await repository.submitApplicantAdmissionRequest({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
      submittedAt,
    });

    expect(result).toMatchObject({
      kind: 'submitted',
      missingItemsCount: 2,
      createdApplication: true,
    });
    expect(tx.application.create).toHaveBeenCalledTimes(1);
    expect(tx.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: SCHOOL_ID,
          organizationId: ORGANIZATION_ID,
          studentName: 'Layla Hassan',
          requestedAcademicYearId: ACADEMIC_YEAR_ID,
          requestedGradeId: GRADE_ID,
          source: AdmissionApplicationSource.IN_APP,
          status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
          submittedAt,
        }),
      }),
    );
    expect(tx.applicantAdmissionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID },
        data: {
          status: ApplicantAdmissionRequestStatus.SUBMITTED,
          submittedAt,
          applicationId: APPLICATION_ID,
        },
      }),
    );
    expect(tx.applicationDocument.create).not.toHaveBeenCalled();
    expect(tx.file.create).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.guardian.create).not.toHaveBeenCalled();
    expect(tx.studentGuardian.create).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('bridges active draft applicant documents during submit with pending review status', async () => {
    const submittedAt = new Date('2026-06-10T11:00:00.000Z');
    const tx = mockSubmitTransactionClient({
      request: submitRequestRecordFixture(),
      detail: requestRecordFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        application: { status: AdmissionApplicationStatus.SUBMITTED },
      }),
      missingItemsCount: 0,
      bridgeableApplicantDocuments: [
        {
          id: APPLICANT_DOCUMENT_ID,
          fileId: FILE_ID,
          documentType: 'Birth certificate',
          status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
        },
      ],
    });
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await expect(
      repository.submitApplicantAdmissionRequest({
        applicantUserId: APPLICANT_USER_ID,
        requestId: REQUEST_ID,
        submittedAt,
      }),
    ).resolves.toMatchObject({
      kind: 'submitted',
      missingItemsCount: 0,
      createdApplication: true,
    });

    expect(tx.applicantAdmissionRequestDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requestId: REQUEST_ID,
          schoolId: SCHOOL_ID,
          deletedAt: null,
          applicationDocumentId: null,
          status: {
            in: [
              ApplicantAdmissionRequestDocumentStatus.UPLOADED,
              ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
            ],
          },
        }),
      }),
    );
    expect(tx.applicationDocument.create).toHaveBeenCalledTimes(1);
    expect(tx.applicationDocument.create).toHaveBeenCalledWith({
      data: {
        schoolId: SCHOOL_ID,
        applicationId: APPLICATION_ID,
        fileId: FILE_ID,
        documentType: 'Birth certificate',
        status: AdmissionDocumentStatus.PENDING_REVIEW,
        notes: null,
      },
      select: { id: true },
    });
    expect(
      tx.applicantAdmissionRequestDocument.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: APPLICANT_DOCUMENT_ID,
        deletedAt: null,
        applicationDocumentId: null,
      },
      data: { applicationDocumentId: APPLICATION_DOCUMENT_ID },
    });
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.guardian.create).not.toHaveBeenCalled();
    expect(tx.studentGuardian.create).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('keeps repeated submit idempotent without creating duplicate Applications', async () => {
    const tx = mockSubmitTransactionClient({
      request: submitRequestRecordFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        submittedAt: new Date('2026-06-10T11:00:00.000Z'),
        applicationId: APPLICATION_ID,
      }),
      detail: requestRecordFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        application: { status: AdmissionApplicationStatus.SUBMITTED },
      }),
      missingItemsCount: 0,
    });
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await expect(
      repository.submitApplicantAdmissionRequest({
        applicantUserId: APPLICANT_USER_ID,
        requestId: REQUEST_ID,
        submittedAt: new Date('2026-06-10T11:05:00.000Z'),
      }),
    ).resolves.toMatchObject({
      kind: 'submitted',
      missingItemsCount: 0,
      createdApplication: false,
    });

    expect(tx.application.create).not.toHaveBeenCalled();
    expect(tx.applicantAdmissionRequest.update).not.toHaveBeenCalled();
  });

  it('rejects unsafe school revalidation inside the submit transaction', async () => {
    const tx = mockSubmitTransactionClient({
      request: submitRequestRecordFixture(),
      school: null,
    });
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await expect(
      repository.submitApplicantAdmissionRequest({
        applicantUserId: APPLICANT_USER_ID,
        requestId: REQUEST_ID,
        submittedAt: new Date('2026-06-10T11:00:00.000Z'),
      }),
    ).resolves.toEqual({ kind: 'unsafe_school' });
    expect(tx.application.create).not.toHaveBeenCalled();
  });
});

function requestRecordFixture(
  overrides?: Partial<ApplicantAdmissionRequestRecord>,
): ApplicantAdmissionRequestRecord {
  return {
    id: REQUEST_ID,
    status: ApplicantAdmissionRequestStatus.DRAFT,
    application: null,
    childFirstName: 'Layla',
    childLastName: 'Hassan',
    childFullName: 'Layla Hassan',
    childDateOfBirth: new Date('2018-04-12T00:00:00.000Z'),
    childGender: 'female',
    childNationality: 'Egyptian',
    previousSchool: 'ABC School',
    notes: 'Needs bus route info.',
    createdAt: new Date('2026-06-10T10:00:00.000Z'),
    updatedAt: new Date('2026-06-10T10:05:00.000Z'),
    school: {
      id: SCHOOL_ID,
      name: 'Moazez Academy',
      schoolProfile: {
        schoolName: ' Public Moazez Academy ',
        shortName: ' Moazez ',
        city: ' Cairo ',
        country: ' Egypt ',
      },
    },
    requestedAcademicYear: {
      id: ACADEMIC_YEAR_ID,
      nameEn: '2026/2027',
      nameAr: '٢٠٢٦/٢٠٢٧',
    },
    requestedGrade: {
      id: GRADE_ID,
      nameEn: 'Grade 4',
      nameAr: 'الصف الرابع',
    },
    ...overrides,
  } as ApplicantAdmissionRequestRecord;
}

function submitRequestRecordFixture(
  overrides?: Partial<{
    id: string;
    applicantUserId: string;
    schoolId: string;
    organizationId: string;
    requestedAcademicYearId: string | null;
    requestedGradeId: string | null;
    childFullName: string;
    status: ApplicantAdmissionRequestStatus;
    submittedAt: Date | null;
    applicationId: string | null;
  }>,
) {
  return {
    id: REQUEST_ID,
    applicantUserId: APPLICANT_USER_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    requestedAcademicYearId: ACADEMIC_YEAR_ID,
    requestedGradeId: GRADE_ID,
    childFullName: 'Layla Hassan',
    status: ApplicantAdmissionRequestStatus.DRAFT,
    submittedAt: null,
    applicationId: null,
    ...overrides,
  };
}

function mockSubmitTransactionClient(input: {
  request: ReturnType<typeof submitRequestRecordFixture>;
  detail?: ApplicantAdmissionRequestRecord;
  school?: { id: string; organizationId: string } | null;
  missingItemsCount?: number;
  bridgeableApplicantDocuments?: Array<{
    id: string;
    fileId: string;
    documentType: string;
    status: ApplicantAdmissionRequestDocumentStatus;
  }>;
}) {
  return {
    $executeRaw: jest.fn(),
    applicantAdmissionRequest: {
      findFirst: jest.fn().mockResolvedValue(input.request),
      update: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
      findUnique: jest
        .fn()
        .mockResolvedValue(input.detail ?? requestRecordFixture()),
    },
    applicantAdmissionRequestDocument: {
      findMany: jest
        .fn()
        .mockResolvedValue(input.bridgeableApplicantDocuments ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    school: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          input.school === undefined
            ? { id: SCHOOL_ID, organizationId: ORGANIZATION_ID }
            : input.school,
        ),
    },
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({ id: ACADEMIC_YEAR_ID }),
    },
    grade: {
      findFirst: jest.fn().mockResolvedValue({ id: GRADE_ID }),
    },
    admissionRequiredDocument: {
      count: jest.fn().mockResolvedValue(input.missingItemsCount ?? 2),
    },
    application: {
      create: jest.fn().mockResolvedValue({ id: APPLICATION_ID }),
    },
    applicationDocument: {
      create: jest.fn().mockResolvedValue({ id: APPLICATION_DOCUMENT_ID }),
    },
    file: { create: jest.fn() },
    student: { create: jest.fn() },
    guardian: { create: jest.fn() },
    studentGuardian: { create: jest.fn() },
    enrollment: { create: jest.fn() },
    membership: { create: jest.fn() },
  };
}

function mockAccessService(): jest.Mocked<ApplicantPortalAccessService> {
  return {
    getApplicantContext: jest.fn().mockResolvedValue({
      applicantUserId: APPLICANT_USER_ID,
      applicantProfileId: APPLICANT_PROFILE_ID,
      profile: {
        id: APPLICANT_PROFILE_ID,
        userId: APPLICANT_USER_ID,
        fullName: 'Nour Ali',
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: APPLICANT_USER_ID,
          email: 'applicant@example.test',
          contactEmail: 'applicant@example.test',
          userType: UserType.APPLICANT,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
    }),
  } as unknown as jest.Mocked<ApplicantPortalAccessService>;
}

function mockApplicantRepository(): jest.Mocked<ApplicantPortalRepository> {
  return {
    findDiscoverableSchoolForRequest: jest.fn(),
    findAcademicYearForSchool: jest.fn(),
    findGradeForSchool: jest.fn(),
    createApplicantAdmissionRequest: jest.fn(),
    submitApplicantAdmissionRequest: jest.fn(),
    countMandatoryRequiredDocumentsForSchool: jest.fn(),
    countMissingMandatoryRequiredDocumentsForRequest: jest.fn(),
    listApplicantAdmissionRequestsForApplicant: jest.fn(),
    findApplicantAdmissionRequestForApplicant: jest.fn(),
  } as unknown as jest.Mocked<ApplicantPortalRepository>;
}

function mockAuthRepository(): jest.Mocked<AuthRepository> {
  return {
    createAuditLog: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;
}
