/* eslint-disable @typescript-eslint/unbound-method -- route metadata assertions intentionally inspect detached Nest controller methods. */
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { CreateStudentCredentialBatchUseCase } from '../application/create-student-credential-batch.use-case';
import { ExportStudentCredentialBatchUseCase } from '../application/export-student-credential-batch.use-case';
import { GetStudentCredentialBatchUseCase } from '../application/get-student-credential-batch.use-case';
import { PreviewStudentCredentialBatchUseCase } from '../application/preview-student-credential-batch.use-case';
import { StudentCredentialBatchController } from '../controller/student-credential-batch.controller';
import type { Response } from 'express';

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
    expect(Reflect.getMetadata(PATH_METADATA, prototype.export)).toBe(
      ':batchId/export',
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, prototype.export),
    ).toEqual(['students.records.view', 'settings.users.manage']);
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

  it('returns the sensitive CSV with exact non-cacheable response headers and no ETag', async () => {
    const body = Buffer.from('\uFEFF"student_id"\r\n', 'utf8');
    const exportUseCase = {
      execute: jest.fn().mockResolvedValue({
        body,
        filename: 'student-credentials-batch-1.csv',
      }),
    };
    const response = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      removeHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    };
    const controller = new StudentCredentialBatchController(
      {} as PreviewStudentCredentialBatchUseCase,
      {} as CreateStudentCredentialBatchUseCase,
      {} as GetStudentCredentialBatchUseCase,
      exportUseCase as unknown as ExportStudentCredentialBatchUseCase,
    );

    await controller.export('batch-1', response as unknown as Response);

    expect(exportUseCase.execute).toHaveBeenCalledWith('batch-1');
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        'attachment; filename="student-credentials-batch-1.csv"',
      'Cache-Control': 'no-store, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(body.byteLength),
    });
    expect(response.removeHeader).toHaveBeenCalledWith('ETag');
    expect(response.end).toHaveBeenCalledWith(body);
  });
});
