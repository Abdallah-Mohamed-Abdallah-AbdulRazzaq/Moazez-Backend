import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
  FileVisibility,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { CreateApplicationDocumentUseCase } from '../application/create-application-document.use-case';
import { ReviewApplicationDocumentUseCase } from '../application/review-application-document.use-case';
import { ApplicationDocumentsRepository } from '../infrastructure/application-documents.repository';
import { presentApplicationDocument } from '../presenters/application-document.presenter';

const APPLICATION_ID = 'application-1';
const APPLICATION_DOCUMENT_ID = 'application-document-1';
const APPLICANT_DOCUMENT_ID = 'applicant-document-1';
const FILE_ID = 'file-1';
const REQUIRED_DOCUMENT_ID = 'required-document-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('ReviewApplicationDocumentUseCase', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'reviewer-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['admissions.documents.manage'],
      });

      return fn();
    });
  }

  function createHarness(overrides?: {
    applicationStatus?: AdmissionApplicationStatus;
    documentStatus?: AdmissionDocumentStatus;
    applicantDocumentStatus?: ApplicantAdmissionRequestDocumentStatus;
    linkedApplicantDocument?: boolean;
    documentFound?: boolean;
    reviewResultStatus?: 'reviewed' | 'not_found' | 'invalid_state';
  }) {
    const application = {
      id: APPLICATION_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      leadId: null,
      studentName: 'Youssef Ali',
      requestedAcademicYearId: null,
      requestedGradeId: null,
      source: 'IN_APP',
      status:
        overrides?.applicationStatus ??
        AdmissionApplicationStatus.DOCUMENTS_PENDING,
      submittedAt: null,
      createdAt: new Date('2026-05-10T09:00:00.000Z'),
      updatedAt: new Date('2026-05-10T09:00:00.000Z'),
      deletedAt: null,
    };
    const document = {
      id: APPLICATION_DOCUMENT_ID,
      schoolId: SCHOOL_ID,
      applicationId: APPLICATION_ID,
      fileId: FILE_ID,
      documentType: 'birth_certificate',
      status:
        overrides?.documentStatus ?? AdmissionDocumentStatus.PENDING_REVIEW,
      notes: null,
      createdAt: new Date('2026-05-10T10:00:00.000Z'),
      updatedAt: new Date('2026-05-10T10:00:00.000Z'),
      file: {
        id: FILE_ID,
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        visibility: FileVisibility.PRIVATE,
      },
      application: {
        id: APPLICATION_ID,
        schoolId: SCHOOL_ID,
        organizationId: ORGANIZATION_ID,
        status:
          overrides?.applicationStatus ??
          AdmissionApplicationStatus.DOCUMENTS_PENDING,
        deletedAt: null,
      },
      applicantAdmissionRequestDocuments:
        overrides?.linkedApplicantDocument === false
          ? []
          : [
              {
                id: APPLICANT_DOCUMENT_ID,
                requestId: 'request-1',
                applicantUserId: 'applicant-1',
                schoolId: SCHOOL_ID,
                organizationId: ORGANIZATION_ID,
                requiredDocumentId: REQUIRED_DOCUMENT_ID,
                applicationDocumentId: APPLICATION_DOCUMENT_ID,
                fileId: FILE_ID,
                status:
                  overrides?.applicantDocumentStatus ??
                  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
                deletedAt: null,
              },
            ],
    };
    const updatedDocument = {
      id: APPLICATION_DOCUMENT_ID,
      schoolId: SCHOOL_ID,
      applicationId: APPLICATION_ID,
      fileId: FILE_ID,
      documentType: 'birth_certificate',
      status: AdmissionDocumentStatus.COMPLETE,
      notes: 'Reviewed',
      createdAt: new Date('2026-05-10T10:00:00.000Z'),
      updatedAt: new Date('2026-05-10T11:00:00.000Z'),
      file: document.file,
      application: {
        status: application.status,
      },
      applicantAdmissionRequestDocuments:
        overrides?.linkedApplicantDocument === false
          ? []
          : [
              {
                id: APPLICANT_DOCUMENT_ID,
                applicationDocumentId: APPLICATION_DOCUMENT_ID,
                status:
                  overrides?.applicantDocumentStatus ??
                  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
              },
            ],
    };

    const applicationsRepository = {
      findApplicationById: jest.fn().mockResolvedValue(application),
    } as unknown as ApplicationsRepository;
    const documentsRepository = {
      findApplicantBridgedApplicationDocument: jest
        .fn()
        .mockResolvedValue(
          overrides?.documentFound === false ? null : document,
        ),
      reviewApplicantApplicationDocument: jest
        .fn()
        .mockImplementation(async (params) => {
          if (overrides?.reviewResultStatus === 'not_found') {
            return { status: 'not_found' };
          }
          if (overrides?.reviewResultStatus === 'invalid_state') {
            return { status: 'invalid_state' };
          }

          const applicationStatusAfter = params.reopenApplicationDocuments
            ? AdmissionApplicationStatus.DOCUMENTS_PENDING
            : application.status;

          return {
            status: 'reviewed',
            document: {
              ...updatedDocument,
              status: params.nextApplicationDocumentStatus,
              notes: params.note ?? null,
              application: {
                status: applicationStatusAfter,
              },
              applicantAdmissionRequestDocuments:
                overrides?.linkedApplicantDocument === false
                  ? []
                  : [
                      {
                        id: APPLICANT_DOCUMENT_ID,
                        applicationDocumentId: APPLICATION_DOCUMENT_ID,
                        status: params.nextApplicantDocumentStatus,
                      },
                    ],
            },
            applicationStatusAfter,
          };
        }),
    } as unknown as ApplicationDocumentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new ReviewApplicationDocumentUseCase(
      applicationsRepository,
      documentsRepository,
      authRepository,
    );

    return {
      authRepository: authRepository as jest.Mocked<AuthRepository>,
      documentsRepository:
        documentsRepository as jest.Mocked<ApplicationDocumentsRepository>,
      useCase,
    };
  }

  function createPresenterDocument(overrides?: {
    applicationStatus?: AdmissionApplicationStatus;
    documentStatus?: AdmissionDocumentStatus;
    applicantDocumentStatus?: ApplicantAdmissionRequestDocumentStatus;
    linkedApplicantDocument?: boolean;
  }) {
    return {
      id: APPLICATION_DOCUMENT_ID,
      schoolId: SCHOOL_ID,
      applicationId: APPLICATION_ID,
      fileId: FILE_ID,
      documentType: 'birth_certificate',
      status:
        overrides?.documentStatus ?? AdmissionDocumentStatus.PENDING_REVIEW,
      notes: null,
      createdAt: new Date('2026-05-10T10:00:00.000Z'),
      updatedAt: new Date('2026-05-10T10:00:00.000Z'),
      file: {
        id: FILE_ID,
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        visibility: FileVisibility.PRIVATE,
      },
      application: {
        status:
          overrides?.applicationStatus ??
          AdmissionApplicationStatus.DOCUMENTS_PENDING,
      },
      applicantAdmissionRequestDocuments:
        overrides?.linkedApplicantDocument === false
          ? []
          : [
              {
                id: APPLICANT_DOCUMENT_ID,
                applicationDocumentId: APPLICATION_DOCUMENT_ID,
                status:
                  overrides?.applicantDocumentStatus ??
                  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
              },
            ],
    };
  }

  function createStaffUploadHarness() {
    const application = {
      id: APPLICATION_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      leadId: null,
      studentName: 'Youssef Ali',
      requestedAcademicYearId: null,
      requestedGradeId: null,
      source: 'IN_APP',
      status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
      submittedAt: null,
      createdAt: new Date('2026-05-10T09:00:00.000Z'),
      updatedAt: new Date('2026-05-10T09:00:00.000Z'),
      deletedAt: null,
    };
    const applicationsRepository = {
      findApplicationById: jest.fn().mockResolvedValue(application),
    } as unknown as ApplicationsRepository;
    const filesRepository = {
      findScopedFileById: jest.fn().mockResolvedValue({
        id: FILE_ID,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        uploaderId: 'reviewer-1',
        bucket: 'private',
        objectKey: 'schools/school-1/file.pdf',
        originalName: 'staff-upload.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
        createdAt: new Date('2026-05-10T09:00:00.000Z'),
        updatedAt: new Date('2026-05-10T09:00:00.000Z'),
        deletedAt: null,
      }),
    } as unknown as FilesRepository;
    const documentsRepository = {
      findApplicationDocumentByType: jest.fn().mockResolvedValue(null),
      createApplicationDocument: jest.fn().mockImplementation(async (data) => ({
        ...createPresenterDocument({
          documentStatus: data.status as AdmissionDocumentStatus,
          linkedApplicantDocument: false,
        }),
        id: 'staff-document-1',
        fileId: data.fileId,
        documentType: data.documentType,
        notes: data.notes,
      })),
      updateApplicationDocument: jest.fn(),
    } as unknown as ApplicationDocumentsRepository;
    const useCase = new CreateApplicationDocumentUseCase(
      applicationsRepository,
      documentsRepository,
      filesRepository,
    );

    return {
      documentsRepository:
        documentsRepository as jest.Mocked<ApplicationDocumentsRepository>,
      filesRepository: filesRepository as jest.Mocked<FilesRepository>,
      useCase,
    };
  }

  it('marks applicant-bridged uploaded pending review documents as reviewable', () => {
    const result = presentApplicationDocument(createPresenterDocument());

    expect(result).toMatchObject({
      source: 'applicant_portal',
      canReview: true,
      reviewEligibility: {
        canAccept: true,
        canReject: true,
        canRequestReplacement: true,
        reason: 'reviewable',
      },
      linkedApplicantDocument: {
        id: APPLICANT_DOCUMENT_ID,
        status: 'uploaded',
      },
    });
  });

  it('marks documents without an applicant bridge as staff uploads and not reviewable', () => {
    const result = presentApplicationDocument(
      createPresenterDocument({ linkedApplicantDocument: false }),
    );

    expect(result).toMatchObject({
      source: 'staff_upload',
      canReview: false,
      reviewEligibility: {
        canAccept: false,
        canReject: false,
        canRequestReplacement: false,
        reason: 'not_applicant_portal_document',
      },
      linkedApplicantDocument: null,
    });
  });

  it('reports applicant_document_not_uploaded for pending bridged stale applicant documents', () => {
    const result = presentApplicationDocument(
      createPresenterDocument({
        applicantDocumentStatus:
          ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
      }),
    );

    expect(result).toMatchObject({
      source: 'applicant_portal',
      canReview: false,
      linkedApplicantDocument: {
        id: APPLICANT_DOCUMENT_ID,
        status: 'accepted',
      },
      reviewEligibility: {
        reason: 'applicant_document_not_uploaded',
      },
    });
  });

  it('uses application_status_not_reviewable before other eligibility reasons', () => {
    const result = presentApplicationDocument(
      createPresenterDocument({
        applicationStatus: AdmissionApplicationStatus.ACCEPTED,
        documentStatus: AdmissionDocumentStatus.COMPLETE,
        linkedApplicantDocument: false,
      }),
    );

    expect(result.canReview).toBe(false);
    expect(result.reviewEligibility.reason).toBe(
      'application_status_not_reviewable',
    );
  });

  it('accept maps school document to complete and applicant document to accepted', async () => {
    const { authRepository, documentsRepository, useCase } = createHarness();

    const result = await withScope(() =>
      useCase.accept(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {
        note: ' Reviewed by admissions ',
      }),
    );

    expect(result).toMatchObject({
      id: APPLICATION_DOCUMENT_ID,
      status: 'complete',
      source: 'applicant_portal',
      canReview: false,
      reviewEligibility: {
        canAccept: false,
        canReject: false,
        canRequestReplacement: false,
        reason: 'document_not_pending_review',
      },
      linkedApplicantDocument: {
        id: APPLICANT_DOCUMENT_ID,
        status: 'accepted',
      },
      notes: 'Reviewed by admissions',
    });
    expect(
      documentsRepository.reviewApplicantApplicationDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        nextApplicationDocumentStatus: AdmissionDocumentStatus.COMPLETE,
        nextApplicantDocumentStatus:
          ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
        note: 'Reviewed by admissions',
        reopenApplicationDocuments: false,
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admissions.document.accept',
        before: expect.objectContaining({
          previousApplicationDocumentStatus: 'pending_review',
          previousApplicantDocumentStatus: 'uploaded',
        }),
        after: expect.objectContaining({
          nextApplicationDocumentStatus: 'complete',
          nextApplicantDocumentStatus: 'accepted',
          reasonProvided: true,
        }),
      }),
    );

    const auditPayload = JSON.stringify(
      (authRepository.createAuditLog as jest.Mock).mock.calls[0][0],
    );
    expect(auditPayload).not.toContain('Reviewed by admissions');
    expect(auditPayload).not.toContain('bucket');
    expect(auditPayload).not.toContain('objectKey');
    expect(auditPayload).not.toContain('signedUrl');
  });

  it('reject maps school document to missing and applicant document to rejected', async () => {
    const { authRepository, documentsRepository, useCase } = createHarness();

    const result = await withScope(() =>
      useCase.reject(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {
        note: 'Blurry scan',
      }),
    );

    expect(result).toMatchObject({
      status: 'missing',
      source: 'applicant_portal',
      canReview: false,
      reviewEligibility: {
        reason: 'document_not_pending_review',
      },
      linkedApplicantDocument: {
        id: APPLICANT_DOCUMENT_ID,
        status: 'rejected',
      },
      notes: 'Blurry scan',
    });
    expect(
      documentsRepository.reviewApplicantApplicationDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        nextApplicationDocumentStatus: AdmissionDocumentStatus.MISSING,
        nextApplicantDocumentStatus:
          ApplicantAdmissionRequestDocumentStatus.REJECTED,
        reopenApplicationDocuments: false,
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admissions.document.reject',
        after: expect.objectContaining({
          nextApplicationDocumentStatus: 'missing',
          nextApplicantDocumentStatus: 'rejected',
          reasonProvided: true,
        }),
      }),
    );
  });

  it('request replacement marks missing, needs replacement, and reopens documents pending', async () => {
    const { authRepository, documentsRepository, useCase } = createHarness({
      applicationStatus: AdmissionApplicationStatus.SUBMITTED,
    });

    const result = await withScope(() =>
      useCase.requestReplacement(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {
        note: 'Wrong document',
      }),
    );

    expect(result).toMatchObject({
      status: 'missing',
      source: 'applicant_portal',
      canReview: false,
      reviewEligibility: {
        reason: 'document_not_pending_review',
      },
      linkedApplicantDocument: {
        id: APPLICANT_DOCUMENT_ID,
        status: 'needs_replacement',
      },
      notes: 'Wrong document',
    });
    expect(
      documentsRepository.reviewApplicantApplicationDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        nextApplicationDocumentStatus: AdmissionDocumentStatus.MISSING,
        nextApplicantDocumentStatus:
          ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
        reopenApplicationDocuments: true,
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admissions.document.request_replacement',
        before: expect.objectContaining({
          applicationStatusBefore: 'submitted',
        }),
        after: expect.objectContaining({
          applicationStatusAfter: 'documents_pending',
          nextApplicantDocumentStatus: 'needs_replacement',
        }),
      }),
    );
  });

  it('requires a non-empty note for reject and request replacement', async () => {
    const { documentsRepository, useCase } = createHarness();

    await expect(
      withScope(() =>
        useCase.reject(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {
          note: '   ',
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withScope(() =>
        useCase.requestReplacement(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {
          note: '',
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(
      documentsRepository.reviewApplicantApplicationDocument,
    ).not.toHaveBeenCalled();
  });

  it('rejects invalid review transitions without mutating the bridge', async () => {
    const { documentsRepository, useCase } = createHarness({
      documentStatus: AdmissionDocumentStatus.COMPLETE,
    });

    await expect(
      withScope(() =>
        useCase.accept(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(
      documentsRepository.reviewApplicantApplicationDocument,
    ).not.toHaveBeenCalled();
  });

  it('returns not found for cross-application document ids', async () => {
    const { documentsRepository, useCase } = createHarness({
      documentFound: false,
    });

    await expect(
      withScope(() =>
        useCase.accept(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      documentsRepository.reviewApplicantApplicationDocument,
    ).not.toHaveBeenCalled();
  });

  it('rejects stale repository transitions as conflicts', async () => {
    const { useCase } = createHarness({ reviewResultStatus: 'invalid_state' });

    await expect(
      withScope(() =>
        useCase.accept(APPLICATION_ID, APPLICATION_DOCUMENT_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects staff uploads that try to create pending_review documents', async () => {
    const { documentsRepository, filesRepository, useCase } =
      createStaffUploadHarness();

    await expect(
      withScope(() =>
        useCase.execute(APPLICATION_ID, {
          fileId: FILE_ID,
          documentType: 'birth_certificate',
          status: 'pending_review',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: {
        field: 'status',
        reason: 'pending_review_reserved_for_applicant_portal',
      },
    });
    expect(filesRepository.findScopedFileById).not.toHaveBeenCalled();
    expect(
      documentsRepository.createApplicationDocument,
    ).not.toHaveBeenCalled();
    expect(
      documentsRepository.updateApplicationDocument,
    ).not.toHaveBeenCalled();
  });

  it('defaults staff uploads with omitted status to complete', async () => {
    const { documentsRepository, useCase } = createStaffUploadHarness();

    const result = await withScope(() =>
      useCase.execute(APPLICATION_ID, {
        fileId: FILE_ID,
        documentType: ' parent_id ',
        notes: ' Front desk upload ',
      }),
    );

    expect(result).toMatchObject({
      id: 'staff-document-1',
      documentType: 'parent_id',
      status: 'complete',
      source: 'staff_upload',
      canReview: false,
      reviewEligibility: {
        reason: 'document_not_pending_review',
      },
      linkedApplicantDocument: null,
      notes: 'Front desk upload',
    });
    expect(documentsRepository.createApplicationDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AdmissionDocumentStatus.COMPLETE,
        documentType: 'parent_id',
        notes: 'Front desk upload',
      }),
    );
  });
});
