import {
  AdmissionDocumentStatus,
  FileVisibility,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { CreateApplicationDocumentUseCase } from '../application/create-application-document.use-case';
import { DeleteApplicationDocumentUseCase } from '../application/delete-application-document.use-case';
import { ListApplicationDocumentsUseCase } from '../application/list-application-documents.use-case';
import { ApplicationDocumentsRepository } from '../infrastructure/application-documents.repository';

type ApplicationDocumentStoreItem = {
  id: string;
  schoolId: string;
  applicationId: string;
  fileId: string;
  documentType: string;
  status: AdmissionDocumentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    visibility: FileVisibility;
  };
};

describe('Admissions application documents use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'admissions.documents.view',
          'admissions.documents.manage',
        ],
      });

      return fn();
    });
  }

  function createApplicationsRepository(): ApplicationsRepository {
    return {
      findApplicationById: jest.fn().mockResolvedValue({
        id: 'application-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        leadId: null,
        studentName: 'Youssef Ali',
        requestedAcademicYearId: null,
        requestedGradeId: null,
        source: 'IN_APP',
        status: 'DOCUMENTS_PENDING',
        submittedAt: null,
        createdAt: new Date('2026-04-21T09:00:00.000Z'),
        updatedAt: new Date('2026-04-21T09:00:00.000Z'),
        deletedAt: null,
      }),
    } as unknown as ApplicationsRepository;
  }

  function createFilesRepository(): FilesRepository {
    return {
      findScopedFileById: jest.fn().mockImplementation(async (fileId: string) => ({
        id: fileId,
        organizationId: 'org-1',
        schoolId: 'school-1',
        uploaderId: 'user-1',
        bucket: 'moazez-dev',
        objectKey: `schools/school-1/files/${fileId}.pdf`,
        originalName: `${fileId}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
        createdAt: new Date('2026-04-21T09:00:00.000Z'),
        updatedAt: new Date('2026-04-21T09:00:00.000Z'),
        deletedAt: null,
      })),
    } as unknown as FilesRepository;
  }

  function createDocumentsRepository(): {
    repository: ApplicationDocumentsRepository;
    store: ApplicationDocumentStoreItem[];
  } {
    const store: ApplicationDocumentStoreItem[] = [];

    const repository = {
      listApplicationDocuments: jest
        .fn()
        .mockImplementation(async (applicationId: string) =>
          store.filter((document) => document.applicationId === applicationId),
        ),
      findApplicationDocumentByType: jest
        .fn()
        .mockImplementation(async (params: { applicationId: string; documentType: string }) =>
          store.find(
            (document) =>
              document.applicationId === params.applicationId &&
              document.documentType === params.documentType,
          ) ?? null,
        ),
      createApplicationDocument: jest.fn().mockImplementation(async (data) => {
        const now = new Date('2026-04-21T10:00:00.000Z');
        const document: ApplicationDocumentStoreItem = {
          id: `document-${store.length + 1}`,
          schoolId: String(data.schoolId),
          applicationId: String(data.applicationId),
          fileId: String(data.fileId),
          documentType: String(data.documentType),
          status: data.status as AdmissionDocumentStatus,
          notes: (data.notes as string | null | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
          file: {
            id: String(data.fileId),
            originalName: `${String(data.fileId)}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: BigInt(4096),
            visibility: FileVisibility.PRIVATE,
          },
        };
        store.push(document);
        return document;
      }),
      updateApplicationDocument: jest.fn().mockImplementation(async (id: string, data) => {
        const document = store.find((item) => item.id === id);
        if (!document) {
          return null;
        }

        document.fileId = String(data.fileId ?? document.fileId);
        document.documentType = String(data.documentType ?? document.documentType);
        document.status =
          (data.status as AdmissionDocumentStatus | undefined) ?? document.status;
        document.notes = (data.notes as string | null | undefined) ?? null;
        document.updatedAt = new Date('2026-04-21T11:00:00.000Z');
        document.file = {
          ...document.file,
          id: document.fileId,
          originalName: `${document.fileId}.pdf`,
        };

        return document;
      }),
      deleteApplicationDocument: jest
        .fn()
        .mockImplementation(async (params: { applicationId: string; documentId: string }) => {
          const index = store.findIndex(
            (document) =>
              document.applicationId === params.applicationId &&
              document.id === params.documentId,
          );
          if (index === -1) {
            return { status: 'not_found' as const };
          }

          store.splice(index, 1);
          return { status: 'deleted' as const };
        }),
    } as unknown as ApplicationDocumentsRepository;

    return { repository, store };
  }

  it('lists documents with the expected presenter shape', async () => {
    const applicationsRepository = createApplicationsRepository();
    const { repository, store } = createDocumentsRepository();
    store.push({
      id: 'document-1',
      schoolId: 'school-1',
      applicationId: 'application-1',
      fileId: 'file-1',
      documentType: 'birth_certificate',
      status: AdmissionDocumentStatus.COMPLETE,
      notes: 'Verified',
      createdAt: new Date('2026-04-21T10:00:00.000Z'),
      updatedAt: new Date('2026-04-21T10:00:00.000Z'),
      file: {
        id: 'file-1',
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        visibility: FileVisibility.PRIVATE,
      },
    });

    const useCase = new ListApplicationDocumentsUseCase(
      applicationsRepository,
      repository,
    );

    const result = await withScope(() =>
      useCase.execute('application-1'),
    );

    expect(result).toEqual([
      {
        id: 'document-1',
        applicationId: 'application-1',
        fileId: 'file-1',
        documentType: 'birth_certificate',
        status: 'complete',
        notes: 'Verified',
        createdAt: '2026-04-21T10:00:00.000Z',
        updatedAt: '2026-04-21T10:00:00.000Z',
        file: {
          id: 'file-1',
          originalName: 'birth-certificate.pdf',
          mimeType: 'application/pdf',
          sizeBytes: '4096',
          visibility: FileVisibility.PRIVATE,
        },
      },
    ]);
  });

  it('links and removes an application document record without touching file storage', async () => {
    const applicationsRepository = createApplicationsRepository();
    const filesRepository = createFilesRepository();
    const { repository, store } = createDocumentsRepository();

    const createUseCase = new CreateApplicationDocumentUseCase(
      applicationsRepository,
      repository,
      filesRepository,
    );
    const deleteUseCase = new DeleteApplicationDocumentUseCase(
      applicationsRepository,
      repository,
    );

    const created = await withScope(() =>
      createUseCase.execute('application-1', {
        fileId: 'file-2',
        documentType: 'parent_id',
        notes: 'Front desk upload',
      }),
    );

    expect(created).toEqual({
      id: 'document-1',
      applicationId: 'application-1',
      fileId: 'file-2',
      documentType: 'parent_id',
      status: 'complete',
      notes: 'Front desk upload',
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
      file: {
        id: 'file-2',
        originalName: 'file-2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '4096',
        visibility: FileVisibility.PRIVATE,
      },
    });
    expect(store).toHaveLength(1);

    await expect(
      withScope(() => deleteUseCase.execute('application-1', created.id)),
    ).resolves.toEqual({ ok: true });
    expect(store).toHaveLength(0);
  });
});
