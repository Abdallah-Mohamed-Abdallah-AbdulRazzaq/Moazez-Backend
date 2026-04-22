import { FileVisibility, StudentDocumentStatus, StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { UploadFileUseCase } from '../../../files/uploads/application/upload-file.use-case';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { CreateStudentDocumentUseCase } from '../application/create-student-document.use-case';
import { DeleteStudentDocumentUseCase } from '../application/delete-student-document.use-case';
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
});
