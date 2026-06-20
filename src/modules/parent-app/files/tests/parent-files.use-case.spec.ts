import { FileVisibility } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentAppChildNotFoundException,
  ParentAppRequiredParentException,
} from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildFileDownloadUrlUseCase } from '../application/get-parent-child-file-download-url.use-case';
import { ParentFilesReadAdapter } from '../infrastructure/parent-files-read.adapter';

describe('GetParentChildFileDownloadUrlUseCase', () => {
  it('allows a linked parent to download an owned child task proof file', async () => {
    const { useCase, accessService, readAdapter, storageService } =
      createUseCase();
    accessService.assertParentOwnsStudent.mockResolvedValue(childFixture());
    readAdapter.findTaskProofFileForDownload.mockResolvedValue(fileFixture());
    storageService.createDownloadUrl.mockResolvedValue(
      'https://storage.local/signed-download',
    );

    const result = await useCase.execute({
      studentId: 'student-1',
      fileId: 'file-1',
    });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.findTaskProofFileForDownload).toHaveBeenCalledWith({
      child: childFixture(),
      fileId: 'file-1',
    });
    expect(storageService.createDownloadUrl).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey: 'schools/school-1/files/proof.pdf',
      expiresInSeconds: 300,
      downloadFileName: 'proof.pdf',
    });
    expect(result).toBe('https://storage.local/signed-download');
  });

  it('blocks wrong role and non-parent actors before file lookup', async () => {
    const { useCase, accessService, readAdapter, storageService } =
      createUseCase();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(
      useCase.execute({ studentId: 'student-1', fileId: 'file-1' }),
    ).rejects.toMatchObject({ code: 'parent_app.actor.required_parent' });
    expect(readAdapter.findTaskProofFileForDownload).not.toHaveBeenCalled();
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('blocks same-school unlinked or cross-school children through Parent App ownership checks', async () => {
    const { useCase, accessService, readAdapter, storageService } =
      createUseCase();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppChildNotFoundException({ studentId: 'unlinked-child' }),
    );

    await expect(
      useCase.execute({ studentId: 'unlinked-child', fileId: 'file-1' }),
    ).rejects.toMatchObject({ code: 'parent_app.child.not_found' });
    expect(readAdapter.findTaskProofFileForDownload).not.toHaveBeenCalled();
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('blocks files that are not referenced by a visible child task proof', async () => {
    const { useCase, accessService, readAdapter, storageService } =
      createUseCase();
    accessService.assertParentOwnsStudent.mockResolvedValue(childFixture());
    readAdapter.findTaskProofFileForDownload.mockResolvedValue(null);

    await expect(
      useCase.execute({ studentId: 'student-1', fileId: 'random-file' }),
    ).rejects.toBeInstanceOf(FilesNotFoundException);
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('blocks another child proof file when requested under the wrong child route', async () => {
    const { useCase, accessService, readAdapter, storageService } =
      createUseCase();
    accessService.assertParentOwnsStudent.mockResolvedValue(childFixture());
    readAdapter.findTaskProofFileForDownload.mockResolvedValue(null);

    await expect(
      useCase.execute({ studentId: 'student-1', fileId: 'other-child-file' }),
    ).rejects.toMatchObject({ code: 'files.not_found' });
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('blocks arbitrary private files that are not learning proof files', async () => {
    const { useCase, accessService, readAdapter, storageService } =
      createUseCase();
    accessService.assertParentOwnsStudent.mockResolvedValue(childFixture());
    readAdapter.findTaskProofFileForDownload.mockResolvedValue(null);

    await expect(
      useCase.execute({ studentId: 'student-1', fileId: 'private-file' }),
    ).rejects.toMatchObject({ code: 'files.not_found' });
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });
});

function createUseCase(): {
  useCase: GetParentChildFileDownloadUrlUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentFilesReadAdapter>;
  storageService: jest.Mocked<StorageService>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    findTaskProofFileForDownload: jest.fn(),
  } as unknown as jest.Mocked<ParentFilesReadAdapter>;
  const storageService = {
    createDownloadUrl: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;

  return {
    useCase: new GetParentChildFileDownloadUrlUseCase(
      accessService,
      readAdapter,
      storageService,
    ),
    accessService,
    readAdapter,
    storageService,
  };
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function fileFixture() {
  return {
    id: 'file-1',
    bucket: 'private-bucket',
    objectKey: 'schools/school-1/files/proof.pdf',
    originalName: 'proof.pdf',
    visibility: FileVisibility.PRIVATE,
  };
}
