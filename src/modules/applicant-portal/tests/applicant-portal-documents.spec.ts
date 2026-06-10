import {
  AdmissionApplicationStatus,
  ApplicantAdmissionRequestDocumentStatus,
  ApplicantAdmissionRequestStatus,
  AuditOutcome,
  FileVisibility,
  OrganizationStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { ApplicantPortalAccessService } from '../application/applicant-portal-access.service';
import { GetApplicantDocumentDownloadUrlUseCase } from '../application/get-applicant-document-download-url.use-case';
import { GetApplicantDocumentUseCase } from '../application/get-applicant-document.use-case';
import { ListApplicantDocumentsUseCase } from '../application/list-applicant-documents.use-case';
import { UploadApplicantDocumentUseCase } from '../application/upload-applicant-document.use-case';
import {
  ApplicantAdmissionRequestDocumentDownloadRecord,
  ApplicantAdmissionRequestDocumentRecord,
  ApplicantAdmissionRequestForDocumentAccessRecord,
  ApplicantPortalRepository,
} from '../infrastructure/applicant-portal.repository';
import { presentApplicantDocument } from '../presenters/applicant-document.presenter';

const APPLICANT_USER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_APPLICANT_USER_ID = '00000000-0000-0000-0000-000000000099';
const APPLICANT_PROFILE_ID = '00000000-0000-0000-0000-000000000002';
const SCHOOL_ID = '00000000-0000-0000-0000-000000000101';
const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000102';
const REQUEST_ID = '00000000-0000-0000-0000-000000000201';
const DOCUMENT_ID = '00000000-0000-0000-0000-000000000301';
const REQUIRED_DOCUMENT_ID = '00000000-0000-0000-0000-000000000401';
const FILE_ID = '00000000-0000-0000-0000-000000000501';

describe('Applicant Portal documents', () => {
  it('uploads a required-document-linked file using request-derived ownership and private file metadata', async () => {
    const repository = mockApplicantRepository();
    const storageService = mockStorageService();
    const authRepository = mockAuthRepository();
    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValue(
      requestForDocumentFixture(),
    );
    repository.findActiveSchoolLevelRequiredDocumentForUpload.mockResolvedValue(
      requiredDocumentFixture(),
    );
    repository.createApplicantAdmissionRequestDocument.mockResolvedValue(
      documentRecordFixture(),
    );
    const useCase = new UploadApplicantDocumentUseCase(
      mockAccessService(),
      repository,
      storageService,
      authRepository,
    );

    const response = await useCase.execute({
      requestId: REQUEST_ID,
      requiredDocumentId: REQUIRED_DOCUMENT_ID,
      title: 'Ignored applicant override',
      documentType: 'ignored_override',
      file: multipartFileFixture(),
      applicantUserId: OTHER_APPLICANT_USER_ID,
      schoolId: '00000000-0000-0000-0000-000000000999',
      organizationId: '00000000-0000-0000-0000-000000000998',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    } as never);

    expect(
      repository.findApplicantAdmissionRequestForDocumentAccess,
    ).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
    });
    expect(storageService.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: expect.stringMatching(
          /^schools\/00000000-0000-0000-0000-000000000101\/applicant-requests\/00000000-0000-0000-0000-000000000201\/documents\/[0-9a-f-]+\.pdf$/,
        ),
        visibility: FileVisibility.PRIVATE,
        contentType: 'application/pdf',
      }),
    );
    expect(
      repository.createApplicantAdmissionRequestDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: REQUEST_ID,
        applicantUserId: APPLICANT_USER_ID,
        schoolId: SCHOOL_ID,
        organizationId: ORGANIZATION_ID,
        requiredDocumentId: REQUIRED_DOCUMENT_ID,
        applicationDocumentId: null,
        title: 'Birth certificate',
        documentType: 'Birth certificate',
        notes: null,
        file: expect.objectContaining({
          bucket: 'private-files',
          originalName: 'birth-certificate.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(11),
          visibility: FileVisibility.PRIVATE,
        }),
      }),
    );
    expect(
      repository.createApplicantAdmissionRequestDocument.mock.calls[0][0],
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
        action: 'applicant.document.upload',
        resourceType: 'applicant_admission_request_document',
        resourceId: DOCUMENT_ID,
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(response).toMatchObject({
      id: DOCUMENT_ID,
      requestId: REQUEST_ID,
      status: 'uploaded',
      title: 'Birth certificate',
      documentType: 'Birth certificate',
      requiredDocument: {
        id: REQUIRED_DOCUMENT_ID,
        title: 'Birth certificate',
        isMandatory: true,
      },
      file: {
        id: FILE_ID,
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11,
      },
    });
    expectSafeDocumentResponse(response);
  });

  it('requires title or documentType for optional extra uploads', async () => {
    const repository = mockApplicantRepository();
    const storageService = mockStorageService();
    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValue(
      requestForDocumentFixture(),
    );
    const useCase = new UploadApplicantDocumentUseCase(
      mockAccessService(),
      repository,
      storageService,
      mockAuthRepository(),
    );

    await expect(
      useCase.execute({
        requestId: REQUEST_ID,
        file: multipartFileFixture(),
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(storageService.saveObject).not.toHaveBeenCalled();

    repository.createApplicantAdmissionRequestDocument.mockResolvedValue(
      documentRecordFixture({
        requiredDocument: null,
        title: 'Extra document',
        documentType: 'Extra document',
      }),
    );

    await expect(
      useCase.execute({
        requestId: REQUEST_ID,
        title: ' Extra document ',
        file: multipartFileFixture(),
      }),
    ).resolves.toMatchObject({
      title: 'Extra document',
      documentType: 'Extra document',
      requiredDocument: null,
    });
  });

  it('rejects cross-applicant requests, unsafe schools, inactive required documents, and invalid MIME types before storage', async () => {
    const repository = mockApplicantRepository();
    const storageService = mockStorageService();
    const useCase = new UploadApplicantDocumentUseCase(
      mockAccessService(),
      repository,
      storageService,
      mockAuthRepository(),
    );

    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValueOnce(
      null,
    );
    await expect(
      useCase.execute({ requestId: REQUEST_ID, file: multipartFileFixture() }),
    ).rejects.toMatchObject({ code: 'not_found' });

    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValueOnce(
      requestForDocumentFixture({ schoolStatus: SchoolStatus.SUSPENDED }),
    );
    await expect(
      useCase.execute({ requestId: REQUEST_ID, file: multipartFileFixture() }),
    ).rejects.toMatchObject({ code: 'not_found' });

    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValueOnce(
      requestForDocumentFixture(),
    );
    repository.findActiveSchoolLevelRequiredDocumentForUpload.mockResolvedValueOnce(
      null,
    );
    await expect(
      useCase.execute({
        requestId: REQUEST_ID,
        requiredDocumentId: REQUIRED_DOCUMENT_ID,
        file: multipartFileFixture(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValueOnce(
      requestForDocumentFixture(),
    );
    repository.findActiveSchoolLevelRequiredDocumentForUpload.mockResolvedValueOnce(
      requiredDocumentFixture({ acceptedFileTypes: ['application/pdf'] }),
    );
    await expect(
      useCase.execute({
        requestId: REQUEST_ID,
        requiredDocumentId: REQUIRED_DOCUMENT_ID,
        file: multipartFileFixture({ mimetype: 'image/png' }),
      }),
    ).rejects.toMatchObject({ code: 'files.upload.mime_not_allowed' });

    expect(storageService.saveObject).not.toHaveBeenCalled();
  });

  it('rejects submitted requests unless linked Admissions status is documents_pending', async () => {
    const repository = mockApplicantRepository();
    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValue(
      requestForDocumentFixture({
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        applicationStatus: AdmissionApplicationStatus.UNDER_REVIEW,
      }),
    );
    const useCase = new UploadApplicantDocumentUseCase(
      mockAccessService(),
      repository,
      mockStorageService(),
      mockAuthRepository(),
    );

    await expect(
      useCase.execute({
        requestId: REQUEST_ID,
        title: 'Extra',
        file: multipartFileFixture(),
      }),
    ).rejects.toMatchObject({ code: 'conflict', httpStatus: 409 });
  });

  it('lists and reads only the current applicant document', async () => {
    const repository = mockApplicantRepository();
    repository.findApplicantAdmissionRequestForDocumentAccess.mockResolvedValue(
      requestForDocumentFixture(),
    );
    repository.listApplicantAdmissionRequestDocuments.mockResolvedValue([
      documentRecordFixture(),
    ]);
    const listUseCase = new ListApplicantDocumentsUseCase(
      mockAccessService(),
      repository,
    );

    await expect(listUseCase.execute(REQUEST_ID)).resolves.toMatchObject({
      data: [expect.objectContaining({ id: DOCUMENT_ID })],
    });
    expect(
      repository.listApplicantAdmissionRequestDocuments,
    ).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
    });

    repository.findApplicantAdmissionRequestDocumentForApplicant.mockResolvedValue(
      documentRecordFixture(),
    );
    const getUseCase = new GetApplicantDocumentUseCase(
      mockAccessService(),
      repository,
    );
    await expect(
      getUseCase.execute({ requestId: REQUEST_ID, documentId: DOCUMENT_ID }),
    ).resolves.toMatchObject({ id: DOCUMENT_ID });
    expect(
      repository.findApplicantAdmissionRequestDocumentForApplicant,
    ).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
      documentId: DOCUMENT_ID,
    });

    repository.findApplicantAdmissionRequestDocumentForApplicant.mockResolvedValue(
      null,
    );
    await expect(
      getUseCase.execute({ requestId: REQUEST_ID, documentId: DOCUMENT_ID }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('creates a short-lived signed URL for the current applicant document after ownership authorization', async () => {
    const repository = mockApplicantRepository();
    const storageService = mockStorageService();
    const authRepository = mockAuthRepository();
    repository.findApplicantAdmissionRequestDocumentForDownload.mockResolvedValue(
      documentDownloadRecordFixture(),
    );
    storageService.createDownloadUrl.mockResolvedValue(
      'https://storage.example.test/private-files/signed?X-Amz-Expires=300',
    );
    const useCase = new GetApplicantDocumentDownloadUrlUseCase(
      mockAccessService(),
      repository,
      storageService,
      authRepository,
    );

    const url = await useCase.execute({
      requestId: REQUEST_ID,
      documentId: DOCUMENT_ID,
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(
      repository.findApplicantAdmissionRequestDocumentForDownload,
    ).toHaveBeenCalledWith({
      applicantUserId: APPLICANT_USER_ID,
      requestId: REQUEST_ID,
      documentId: DOCUMENT_ID,
    });
    expect(
      repository.findApplicantAdmissionRequestDocumentForDownload.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      storageService.createDownloadUrl.mock.invocationCallOrder[0],
    );
    expect(storageService.createDownloadUrl).toHaveBeenCalledWith({
      bucket: 'private-files',
      objectKey:
        'schools/00000000-0000-0000-0000-000000000101/applicant-requests/00000000-0000-0000-0000-000000000201/documents/birth-certificate.pdf',
      expiresInSeconds: 5 * 60,
      downloadFileName: 'birth-certificate.pdf',
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: APPLICANT_USER_ID,
        userType: UserType.APPLICANT,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        module: 'applicant_portal',
        action: 'applicant.document.download',
        resourceType: 'applicant_admission_request_document',
        resourceId: DOCUMENT_ID,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        after: {
          requestId: REQUEST_ID,
          fileId: FILE_ID,
          status: 'signed_url_created',
        },
      }),
    );
    expect(
      JSON.stringify(authRepository.createAuditLog.mock.calls[0][0]),
    ).not.toContain('objectKey');
    expect(
      JSON.stringify(authRepository.createAuditLog.mock.calls[0][0]),
    ).not.toContain('https://');
    expect(
      JSON.stringify(authRepository.createAuditLog.mock.calls[0][0]),
    ).not.toContain('X-Amz');
    expect(url).toBe(
      'https://storage.example.test/private-files/signed?X-Amz-Expires=300',
    );
  });

  it('allows accepted applicant documents to be downloaded', async () => {
    const repository = mockApplicantRepository();
    const storageService = mockStorageService();
    repository.findApplicantAdmissionRequestDocumentForDownload.mockResolvedValue(
      documentDownloadRecordFixture({
        status: ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
      }),
    );
    storageService.createDownloadUrl.mockResolvedValue(
      'https://storage.example.test/private-files/accepted?X-Amz-Expires=300',
    );
    const useCase = new GetApplicantDocumentDownloadUrlUseCase(
      mockAccessService(),
      repository,
      storageService,
      mockAuthRepository(),
    );

    await expect(
      useCase.execute({ requestId: REQUEST_ID, documentId: DOCUMENT_ID }),
    ).resolves.toBe(
      'https://storage.example.test/private-files/accepted?X-Amz-Expires=300',
    );
  });

  it('does not sign cross-applicant, deleted, or inactive-lifecycle applicant documents', async () => {
    const repository = mockApplicantRepository();
    const storageService = mockStorageService();
    const authRepository = mockAuthRepository();
    const useCase = new GetApplicantDocumentDownloadUrlUseCase(
      mockAccessService(),
      repository,
      storageService,
      authRepository,
    );

    repository.findApplicantAdmissionRequestDocumentForDownload.mockResolvedValueOnce(
      null,
    );
    await expect(
      useCase.execute({ requestId: REQUEST_ID, documentId: DOCUMENT_ID }),
    ).rejects.toMatchObject({ code: 'not_found' });

    for (const status of [
      ApplicantAdmissionRequestDocumentStatus.SUPERSEDED,
      ApplicantAdmissionRequestDocumentStatus.REJECTED,
      ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
    ]) {
      repository.findApplicantAdmissionRequestDocumentForDownload.mockResolvedValueOnce(
        documentDownloadRecordFixture({ status }),
      );
      await expect(
        useCase.execute({ requestId: REQUEST_ID, documentId: DOCUMENT_ID }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }

    repository.findApplicantAdmissionRequestDocumentForDownload.mockResolvedValueOnce(
      documentDownloadRecordFixture({
        file: {
          ...documentDownloadRecordFixture().file,
          deletedAt: new Date('2026-06-10T13:00:00.000Z'),
        },
      }),
    );
    await expect(
      useCase.execute({ requestId: REQUEST_ID, documentId: DOCUMENT_ID }),
    ).rejects.toMatchObject({ code: 'files.not_found' });

    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('presents safe document details without leaking storage, applicant, tenant, bridge, or raw enum fields', () => {
    const response = presentApplicantDocument({
      ...documentRecordFixture(),
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      applicantUserId: APPLICANT_USER_ID,
      applicationDocumentId: '00000000-0000-0000-0000-000000000999',
      bucket: 'private-files',
      objectKey: 'schools/pii/object.pdf',
    } as unknown as ApplicantAdmissionRequestDocumentRecord);

    expect(response).toEqual({
      id: DOCUMENT_ID,
      requestId: REQUEST_ID,
      status: 'uploaded',
      title: 'Birth certificate',
      documentType: 'Birth certificate',
      requiredDocument: {
        id: REQUIRED_DOCUMENT_ID,
        title: 'Birth certificate',
        isMandatory: true,
      },
      file: {
        id: FILE_ID,
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11,
        checksumSha256:
          'b94d27b9934d3e08a52e52d7da7dabfadead24dc4ca17775d057269514afee',
      },
      notes: 'Scanned copy.',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:05:00.000Z',
    });
    expectSafeDocumentResponse(response);
  });

  it('counts missing mandatory documents by excluding only uploaded or accepted active applicant documents', async () => {
    const prisma = {
      admissionRequiredDocument: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await expect(
      repository.countMissingMandatoryRequiredDocumentsForRequest({
        schoolId: SCHOOL_ID,
        requestId: REQUEST_ID,
      }),
    ).resolves.toBe(1);

    expect(prisma.admissionRequiredDocument.count).toHaveBeenCalledWith({
      where: {
        schoolId: SCHOOL_ID,
        gradeId: null,
        isMandatory: true,
        isActive: true,
        deletedAt: null,
        NOT: {
          applicantAdmissionRequestDocuments: {
            some: {
              requestId: REQUEST_ID,
              deletedAt: null,
              status: {
                in: [
                  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
                  ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
                ],
              },
            },
          },
        },
      },
    });
  });

  it('persists File metadata and ApplicantAdmissionRequestDocument without bridge or lifecycle side effects', async () => {
    const tx = {
      file: { create: jest.fn().mockResolvedValue({ id: FILE_ID }) },
      applicantAdmissionRequestDocument: {
        create: jest.fn().mockResolvedValue(documentRecordFixture()),
      },
      applicationDocument: { create: jest.fn() },
      student: { create: jest.fn() },
      guardian: { create: jest.fn() },
      studentGuardian: { create: jest.fn() },
      enrollment: { create: jest.fn() },
      membership: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await repository.createApplicantAdmissionRequestDocument({
      requestId: REQUEST_ID,
      applicantUserId: APPLICANT_USER_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      requiredDocumentId: REQUIRED_DOCUMENT_ID,
      applicationDocumentId: null,
      title: 'Birth certificate',
      documentType: 'Birth certificate',
      notes: null,
      file: {
        bucket: 'private-files',
        objectKey: 'schools/s/applicant-requests/r/documents/f.pdf',
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(11),
        checksumSha256: 'hash',
        visibility: FileVisibility.PRIVATE,
      },
    });

    expect(tx.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          schoolId: SCHOOL_ID,
          uploaderId: APPLICANT_USER_ID,
          visibility: FileVisibility.PRIVATE,
        }),
      }),
    );
    expect(tx.applicantAdmissionRequestDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: REQUEST_ID,
          applicantUserId: APPLICANT_USER_ID,
          schoolId: SCHOOL_ID,
          organizationId: ORGANIZATION_ID,
          applicationDocumentId: null,
          fileId: FILE_ID,
          status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
        }),
      }),
    );
    expect(tx.applicationDocument.create).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.guardian.create).not.toHaveBeenCalled();
    expect(tx.studentGuardian.create).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });
});

function requestForDocumentFixture(overrides?: {
  status?: ApplicantAdmissionRequestStatus;
  applicationStatus?: AdmissionApplicationStatus | null;
  schoolStatus?: SchoolStatus;
  organizationStatus?: OrganizationStatus;
  organizationDeletedAt?: Date | null;
}): ApplicantAdmissionRequestForDocumentAccessRecord {
  const applicationStatus =
    overrides?.applicationStatus === undefined
      ? null
      : overrides.applicationStatus;

  return {
    id: REQUEST_ID,
    applicantUserId: APPLICANT_USER_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    status: overrides?.status ?? ApplicantAdmissionRequestStatus.DRAFT,
    application:
      applicationStatus === null
        ? null
        : {
            status: applicationStatus,
            deletedAt: null,
          },
    school: {
      id: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      status: overrides?.schoolStatus ?? SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: {
        id: ORGANIZATION_ID,
        status: overrides?.organizationStatus ?? OrganizationStatus.ACTIVE,
        deletedAt: overrides?.organizationDeletedAt ?? null,
      },
    },
  };
}

function requiredDocumentFixture(overrides?: { acceptedFileTypes?: string[] }) {
  return {
    id: REQUIRED_DOCUMENT_ID,
    schoolId: SCHOOL_ID,
    title: 'Birth certificate',
    isMandatory: true,
    acceptedFileTypes: overrides?.acceptedFileTypes ?? ['application/pdf'],
  };
}

function documentRecordFixture(
  overrides?: Partial<ApplicantAdmissionRequestDocumentRecord>,
): ApplicantAdmissionRequestDocumentRecord {
  return {
    id: DOCUMENT_ID,
    requestId: REQUEST_ID,
    title: 'Birth certificate',
    documentType: 'Birth certificate',
    status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
    notes: ' Scanned copy. ',
    createdAt: new Date('2026-06-10T12:00:00.000Z'),
    updatedAt: new Date('2026-06-10T12:05:00.000Z'),
    requiredDocument: {
      id: REQUIRED_DOCUMENT_ID,
      title: 'Birth certificate',
      isMandatory: true,
      sortOrder: 10,
    },
    file: {
      id: FILE_ID,
      originalName: 'birth-certificate.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(11),
      checksumSha256:
        'b94d27b9934d3e08a52e52d7da7dabfadead24dc4ca17775d057269514afee',
    },
    ...overrides,
  } as ApplicantAdmissionRequestDocumentRecord;
}

function documentDownloadRecordFixture(
  overrides?: Partial<ApplicantAdmissionRequestDocumentDownloadRecord>,
): ApplicantAdmissionRequestDocumentDownloadRecord {
  return {
    id: DOCUMENT_ID,
    requestId: REQUEST_ID,
    applicantUserId: APPLICANT_USER_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
    file: {
      id: FILE_ID,
      bucket: 'private-files',
      objectKey:
        'schools/00000000-0000-0000-0000-000000000101/applicant-requests/00000000-0000-0000-0000-000000000201/documents/birth-certificate.pdf',
      originalName: 'birth-certificate.pdf',
      deletedAt: null,
    },
    ...overrides,
  } as ApplicantAdmissionRequestDocumentDownloadRecord;
}

function multipartFileFixture(overrides?: {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
}) {
  return {
    originalname: overrides?.originalname ?? '..\\birth-certificate.pdf',
    mimetype: overrides?.mimetype ?? 'application/pdf',
    size: overrides?.buffer?.byteLength ?? 11,
    buffer: overrides?.buffer ?? Buffer.from('hello world'),
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
    findApplicantAdmissionRequestForDocumentAccess: jest.fn(),
    findActiveSchoolLevelRequiredDocumentForUpload: jest.fn(),
    createApplicantAdmissionRequestDocument: jest.fn(),
    listApplicantAdmissionRequestDocuments: jest.fn(),
    findApplicantAdmissionRequestDocumentForApplicant: jest.fn(),
    findApplicantAdmissionRequestDocumentForDownload: jest.fn(),
  } as unknown as jest.Mocked<ApplicantPortalRepository>;
}

function mockStorageService(): jest.Mocked<StorageService> {
  return {
    saveObject: jest.fn().mockResolvedValue({
      bucket: 'private-files',
      etag: 'etag',
    }),
    deleteObject: jest.fn(),
    createDownloadUrl: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;
}

function mockAuthRepository(): jest.Mocked<AuthRepository> {
  return {
    createAuditLog: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;
}

function expectSafeDocumentResponse(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'organizationId',
    'schoolId',
    'applicantUserId',
    'applicantProfileId',
    'applicationId',
    'applicationDocumentId',
    'bucket',
    'objectKey',
    'signedUrl',
    'downloadUrl',
    'storage',
    'deletedAt',
    'UPLOADED',
    'ACCEPTED',
    'REJECTED',
    'NEEDS_REPLACEMENT',
    'SUPERSEDED',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
