import { FileVisibility } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { StoredFileMetadata } from '../../uploads/domain/stored-file-metadata';
import { FilesRepository } from '../../uploads/infrastructure/files.repository';
import { LinkAttachmentUseCase } from '../application/link-attachment.use-case';
import { AttachmentLinkConflictException } from '../domain/attachment.exceptions';
import { AttachmentRecord } from '../domain/attachment-record';
import { AttachmentsRepository } from '../infrastructure/attachments.repository';

describe('LinkAttachmentUseCase', () => {
  let attachmentsRepository: jest.Mocked<
    Pick<AttachmentsRepository, 'createAttachment'>
  >;
  let filesRepository: jest.Mocked<Pick<FilesRepository, 'findScopedFileById'>>;
  let useCase: LinkAttachmentUseCase;

  beforeEach(() => {
    attachmentsRepository = {
      createAttachment: jest.fn(),
    };
    filesRepository = {
      findScopedFileById: jest.fn(),
    };

    useCase = new LinkAttachmentUseCase(
      attachmentsRepository as unknown as AttachmentsRepository,
      filesRepository as unknown as FilesRepository,
    );
  });

  async function runInAttachmentsScope<T>(fn: () => Promise<T>): Promise<T> {
    const context = createRequestContext('attachments-test');
    context.actor = {
      id: 'actor-1',
      userType: 'SCHOOL_USER',
    };
    context.activeMembership = {
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['admissions.applications.manage'],
    };

    return runWithRequestContext(context, fn);
  }

  function buildStoredFileMetadata(): StoredFileMetadata {
    return {
      id: 'file-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      uploaderId: 'actor-1',
      bucket: 'moazez-dev',
      objectKey: 'schools/school-1/files/file-1.pdf',
      originalName: 'application.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(4096),
      checksumSha256: null,
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      deletedAt: null,
    };
  }

  function buildAttachmentRecord(): AttachmentRecord {
    return {
      id: 'attachment-1',
      fileId: 'file-1',
      schoolId: 'school-1',
      resourceType: 'admissions.application',
      resourceId: '11111111-1111-1111-1111-111111111111',
      createdById: 'actor-1',
      createdAt: new Date('2026-04-20T10:05:00.000Z'),
      file: {
        id: 'file-1',
        originalName: 'application.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        visibility: FileVisibility.PRIVATE,
      },
    };
  }

  it('links an attachment preview for admissions.application', async () => {
    filesRepository.findScopedFileById.mockResolvedValue(buildStoredFileMetadata());
    attachmentsRepository.createAttachment.mockResolvedValue(
      buildAttachmentRecord(),
    );

    const response = await runInAttachmentsScope(() =>
      useCase.execute({
        fileId: 'file-1',
        resourceType: 'admissions.application',
        resourceId: '11111111-1111-1111-1111-111111111111',
      }),
    );

    expect(response).toEqual({
      id: 'attachment-1',
      fileId: 'file-1',
      resourceType: 'admissions.application',
      resourceId: '11111111-1111-1111-1111-111111111111',
      createdAt: '2026-04-20T10:05:00.000Z',
      file: {
        id: 'file-1',
        originalName: 'application.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '4096',
        visibility: FileVisibility.PRIVATE,
      },
    });
    expect(filesRepository.findScopedFileById).toHaveBeenCalledWith('file-1');
    expect(attachmentsRepository.createAttachment).toHaveBeenCalledWith({
      fileId: 'file-1',
      schoolId: 'school-1',
      resourceType: 'admissions.application',
      resourceId: '11111111-1111-1111-1111-111111111111',
      createdById: 'actor-1',
    });
  });

  it('rejects duplicate attachment preview links with conflict', async () => {
    filesRepository.findScopedFileById.mockResolvedValue(buildStoredFileMetadata());
    attachmentsRepository.createAttachment.mockRejectedValue({ code: 'P2002' });

    await expect(
      runInAttachmentsScope(() =>
        useCase.execute({
          fileId: 'file-1',
          resourceType: 'admissions.application',
          resourceId: '11111111-1111-1111-1111-111111111111',
        }),
      ),
    ).rejects.toBeInstanceOf(AttachmentLinkConflictException);
  });

  it('rejects unsupported preview resource types', async () => {
    filesRepository.findScopedFileById.mockResolvedValue(buildStoredFileMetadata());

    await expect(
      runInAttachmentsScope(() =>
        useCase.execute({
          fileId: 'file-1',
          resourceType: 'students.record',
          resourceId: '11111111-1111-1111-1111-111111111111',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    expect(attachmentsRepository.createAttachment).not.toHaveBeenCalled();
  });
});
