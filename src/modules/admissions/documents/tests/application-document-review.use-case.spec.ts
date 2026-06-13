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
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { ReviewApplicationDocumentUseCase } from '../application/review-application-document.use-case';
import { ApplicationDocumentsRepository } from '../infrastructure/application-documents.repository';

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
        overrides?.documentStatus ??
        AdmissionDocumentStatus.PENDING_REVIEW,
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
      applicantAdmissionRequestDocuments: [
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
    };

    const applicationsRepository = {
      findApplicationById: jest.fn().mockResolvedValue(application),
    } as unknown as ApplicationsRepository;
    const documentsRepository = {
      findApplicantBridgedApplicationDocument: jest
        .fn()
        .mockResolvedValue(overrides?.documentFound === false ? null : document),
      reviewApplicantApplicationDocument: jest
        .fn()
        .mockImplementation(async (params) => {
          if (overrides?.reviewResultStatus === 'not_found') {
            return { status: 'not_found' };
          }
          if (overrides?.reviewResultStatus === 'invalid_state') {
            return { status: 'invalid_state' };
          }

          return {
            status: 'reviewed',
            document: {
              ...updatedDocument,
              status: params.nextApplicationDocumentStatus,
              notes: params.note ?? null,
            },
            applicationStatusAfter: params.reopenApplicationDocuments
              ? AdmissionApplicationStatus.DOCUMENTS_PENDING
              : application.status,
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

    expect(result).toMatchObject({ status: 'missing', notes: 'Blurry scan' });
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
        useCase.reject(APPLICATION_ID, APPLICATION_DOCUMENT_ID, { note: '   ' }),
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
});
