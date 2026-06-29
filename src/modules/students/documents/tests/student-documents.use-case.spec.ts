import {
  AuditOutcome,
  FileVisibility,
  StudentDocumentStatus,
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
import { UploadFileUseCase } from '../../../files/uploads/application/upload-file.use-case';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { CreateStudentDocumentUseCase } from '../application/create-student-document.use-case';
import { DeleteStudentDocumentUseCase } from '../application/delete-student-document.use-case';
import { ImportApplicationDocumentsUseCase } from '../application/import-application-documents.use-case';
import { StudentDocumentsRepository } from '../infrastructure/student-documents.repository';

describe('Student documents use cases', () => {
  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['students.documents.view', 'students.documents.manage'],
      });

      return fn();
    });
  }

  function createStudentRecord() {
    return {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      applicationId: null,
      firstName: 'Ahmed',
      lastName: 'Hassan',
      birthDate: null,
      status: StudentStatus.ACTIVE,
      createdAt: new Date('2026-04-22T09:00:00.000Z'),
      updatedAt: new Date('2026-04-22T09:00:00.000Z'),
      deletedAt: null,
    };
  }

  function createDocumentRecord(overrides?: Partial<{
    id: string;
    documentType: string;
    status: StudentDocumentStatus;
    notes: string | null;
  }>) {
    return {
      id: overrides?.id ?? 'document-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      fileId: 'file-1',
      documentType: overrides?.documentType ?? 'Birth Certificate',
      status: overrides?.status ?? StudentDocumentStatus.COMPLETE,
      notes: overrides?.notes ?? 'Verified copy',
      sourceApplicationId: null,
      sourceApplicationDocumentId: null,
      sourceApplicantRequestDocumentId: null,
      importedAt: null,
      importedBy: null,
      sourceDocumentType: null,
      sourceReviewStatus: null,
      sourceNotes: null,
      sourceFileId: null,
      createdAt: new Date('2026-04-22T10:00:00.000Z'),
      updatedAt: new Date('2026-04-22T10:05:00.000Z'),
      file: {
        id: 'file-1',
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        visibility: FileVisibility.PRIVATE,
      },
    };
  }

  it('adds or links a student document successfully', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentRecord()),
    } as unknown as StudentsRepository;
    const studentDocumentsRepository = {
      findStudentDocumentByType: jest.fn().mockResolvedValue(null),
      createStudentDocument: jest.fn().mockResolvedValue(createDocumentRecord()),
    } as unknown as StudentDocumentsRepository;
    const filesRepository = {
      findScopedFileById: jest.fn().mockResolvedValue({
        id: 'file-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        uploaderId: 'user-1',
        bucket: 'uploads',
        objectKey: 'school-1/file-1.pdf',
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        checksumSha256: 'checksum',
        visibility: FileVisibility.PRIVATE,
        createdAt: new Date('2026-04-22T09:59:00.000Z'),
        updatedAt: new Date('2026-04-22T09:59:00.000Z'),
        deletedAt: null,
      }),
    } as unknown as FilesRepository;
    const uploadFileUseCase = {
      execute: jest.fn(),
    } as unknown as UploadFileUseCase;

    const useCase = new CreateStudentDocumentUseCase(
      studentsRepository,
      studentDocumentsRepository,
      filesRepository,
      uploadFileUseCase,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        type: 'Birth Certificate',
        fileId: 'file-1',
        notes: ' Verified copy ',
      }),
    );

    expect(
      (studentDocumentsRepository.createStudentDocument as jest.Mock).mock.calls[0][0],
    ).toEqual({
      schoolId: 'school-1',
      studentId: 'student-1',
      fileId: 'file-1',
      documentType: 'Birth Certificate',
      status: StudentDocumentStatus.COMPLETE,
      notes: 'Verified copy',
    });
    expect(result).toEqual({
      id: 'document-1',
      studentId: 'student-1',
      fileId: 'file-1',
      type: 'Birth Certificate',
      name: 'birth-certificate.pdf',
      status: 'complete',
      uploadedDate: '2026-04-22T10:00:00.000Z',
      url: '/api/v1/files/file-1/download',
      fileType: 'pdf',
      notes: 'Verified copy',
    });
  });

  it('removes a student document link successfully', async () => {
    const repository = {
      deleteStudentDocument: jest.fn().mockResolvedValue({ status: 'deleted' }),
    } as unknown as StudentDocumentsRepository;

    const useCase = new DeleteStudentDocumentUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute('document-1'),
    );

    expect((repository.deleteStudentDocument as jest.Mock).mock.calls[0]).toEqual([
      'document-1',
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('imports selected admissions documents into student documents', async () => {
    const importedDocument = createDocumentRecord({
      id: 'student-document-1',
      documentType: 'Birth Certificate',
    });
    const studentDocumentsRepository = {
      importApplicationDocumentsFromApplication: jest.fn().mockResolvedValue({
        status: 'imported',
        imported: [
          {
            applicationDocumentId: 'application-document-1',
            studentDocument: importedDocument,
            source: {
              sourceApplicationId: 'application-1',
              sourceApplicationDocumentId: 'application-document-1',
              sourceApplicantRequestDocumentId: 'applicant-document-1',
            },
          },
        ],
        skipped: [],
      }),
    } as unknown as StudentDocumentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new ImportApplicationDocumentsUseCase(
      studentDocumentsRepository,
      authRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        applicationId: 'application-1',
        applicationDocumentIds: [
          'application-document-1',
          'application-document-1',
        ],
      }),
    );

    expect(
      (studentDocumentsRepository.importApplicationDocumentsFromApplication as jest.Mock)
        .mock.calls[0][0],
    ).toEqual({
      schoolId: 'school-1',
      actorId: 'user-1',
      studentId: 'student-1',
      applicationId: 'application-1',
      applicationDocumentIds: ['application-document-1'],
    });
    expect(result).toEqual({
      studentId: 'student-1',
      applicationId: 'application-1',
      imported: [
        {
          applicationDocumentId: 'application-document-1',
          studentDocument: {
            id: 'student-document-1',
            studentId: 'student-1',
            fileId: 'file-1',
            type: 'Birth Certificate',
            name: 'birth-certificate.pdf',
            status: 'complete',
            uploadedDate: '2026-04-22T10:00:00.000Z',
            url: '/api/v1/files/file-1/download',
            fileType: 'pdf',
            notes: 'Verified copy',
          },
          source: {
            sourceApplicationId: 'application-1',
            sourceApplicationDocumentId: 'application-document-1',
            sourceApplicantRequestDocumentId: 'applicant-document-1',
          },
        },
      ],
      skipped: [],
      warnings: [],
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      userType: UserType.SCHOOL_USER,
      organizationId: 'org-1',
      schoolId: 'school-1',
      module: 'students',
      action: 'students.document.import_from_admissions',
      resourceType: 'student_document',
      resourceId: 'student-1',
      outcome: AuditOutcome.SUCCESS,
      after: {
        studentId: 'student-1',
        applicationId: 'application-1',
        applicationDocumentIds: ['application-document-1'],
        studentDocumentIds: ['student-document-1'],
        importedCount: 1,
        skippedCount: 0,
        source: 'admissions_application',
      },
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('objectKey');
    expect(JSON.stringify(result)).not.toContain('bucket');
  });

  it('returns already imported source documents as skipped', async () => {
    const studentDocumentsRepository = {
      importApplicationDocumentsFromApplication: jest.fn().mockResolvedValue({
        status: 'imported',
        imported: [],
        skipped: [
          {
            applicationDocumentId: 'application-document-1',
            reason: 'already_imported',
            studentDocumentId: 'student-document-1',
          },
        ],
      }),
    } as unknown as StudentDocumentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new ImportApplicationDocumentsUseCase(
      studentDocumentsRepository,
      authRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        applicationId: 'application-1',
        applicationDocumentIds: ['application-document-1'],
      }),
    );

    expect(result.skipped).toEqual([
      {
        applicationDocumentId: 'application-document-1',
        reason: 'already_imported',
        studentDocumentId: 'student-document-1',
      },
    ]);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          importedCount: 0,
          skippedCount: 1,
        }),
      }),
    );
  });

  it('rejects import when the target student is not registered from the application', async () => {
    const studentDocumentsRepository = {
      importApplicationDocumentsFromApplication: jest
        .fn()
        .mockResolvedValue({ status: 'target_not_registered' }),
    } as unknown as StudentDocumentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new ImportApplicationDocumentsUseCase(
      studentDocumentsRepository,
      authRepository,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute('student-1', {
          applicationId: 'application-1',
          applicationDocumentIds: ['application-document-1'],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'students.document.import_target_not_registered',
    });
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects mismatched or missing source admissions documents safely', async () => {
    const studentDocumentsRepository = {
      importApplicationDocumentsFromApplication: jest.fn().mockResolvedValue({
        status: 'source_documents_not_found',
        missingDocumentIds: ['application-document-2'],
      }),
    } as unknown as StudentDocumentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new ImportApplicationDocumentsUseCase(
      studentDocumentsRepository,
      authRepository,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute('student-1', {
          applicationId: 'application-1',
          applicationDocumentIds: ['application-document-2'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects import when the source file is unavailable', async () => {
    const studentDocumentsRepository = {
      importApplicationDocumentsFromApplication: jest.fn().mockResolvedValue({
        status: 'source_file_unavailable',
        applicationDocumentId: 'application-document-1',
      }),
    } as unknown as StudentDocumentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new ImportApplicationDocumentsUseCase(
      studentDocumentsRepository,
      authRepository,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute('student-1', {
          applicationId: 'application-1',
          applicationDocumentIds: ['application-document-1'],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'students.document.import_file_unavailable',
    });
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });
});
