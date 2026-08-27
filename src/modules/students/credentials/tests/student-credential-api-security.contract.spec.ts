/* eslint-disable @typescript-eslint/unbound-method -- route metadata assertions intentionally inspect detached Nest controller methods. */
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { StudentCredentialBatchController } from '../controller/student-credential-batch.controller';

describe('student credential API and secret file boundary', () => {
  it('keeps the exact routes, status codes, and composed permissions', () => {
    const prototype = StudentCredentialBatchController.prototype;
    expect(
      Reflect.getMetadata(PATH_METADATA, StudentCredentialBatchController),
    ).toBe('students-guardians/credential-batches');
    expect(Reflect.getMetadata(PATH_METADATA, prototype.preview)).toBe(
      'preview',
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, prototype.preview)).toBe(
      HttpStatus.OK,
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, prototype.preview),
    ).toEqual(['students.records.view', 'settings.users.view']);
    expect(Reflect.getMetadata(PATH_METADATA, prototype.create)).toBe('/');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, prototype.create)).toBe(
      HttpStatus.ACCEPTED,
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, prototype.create),
    ).toEqual(['students.records.view', 'settings.users.manage']);
    expect(Reflect.getMetadata(PATH_METADATA, prototype.get)).toBe(':batchId');
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, prototype.get),
    ).toEqual(['students.records.view', 'settings.users.view']);
    expect(Object.getOwnPropertyNames(prototype)).not.toContain('export');
  });

  it('excludes credential secret artifacts from generic file lookup', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      scoped: { file: { findFirst } },
    } as unknown as PrismaService;
    const repository = new FilesRepository(prisma);

    await expect(
      repository.findScopedFileById('secret-file'),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'secret-file',
          studentCredentialSecretArtifacts: { none: {} },
        },
      }),
    );
  });
});
