import {
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

  it('lists only current applicant requests and derives missing count once per school', async () => {
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
    expect(response.meta).toMatchObject({ page: 1, limit: 100, total: 2 });
    expect(response.data.map((item) => item.missingItemsCount)).toEqual([3, 3]);
  });

  it('reads only the current applicant request and returns not found on cross-applicant ids', async () => {
    const repository = mockApplicantRepository();
    repository.findApplicantAdmissionRequestForApplicant.mockResolvedValue(
      requestRecordFixture(),
    );
    repository.countMandatoryRequiredDocumentsForSchool.mockResolvedValue(1);
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
});

function requestRecordFixture(
  overrides?: Partial<ApplicantAdmissionRequestRecord>,
): ApplicantAdmissionRequestRecord {
  return {
    id: REQUEST_ID,
    status: ApplicantAdmissionRequestStatus.DRAFT,
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
    countMandatoryRequiredDocumentsForSchool: jest.fn(),
    listApplicantAdmissionRequestsForApplicant: jest.fn(),
    findApplicantAdmissionRequestForApplicant: jest.fn(),
  } as unknown as jest.Mocked<ApplicantPortalRepository>;
}

function mockAuthRepository(): jest.Mocked<AuthRepository> {
  return {
    createAuditLog: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;
}
