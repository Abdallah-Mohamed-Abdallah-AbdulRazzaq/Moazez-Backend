import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FileVisibility } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RequestContextMiddleware } from '../../../../common/context/context.middleware';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../../../common/decorators/school-management-only.decorator';
import { GetFileDownloadUrlUseCase } from '../application/get-file-download-url.use-case';
import { UploadFileUseCase } from '../application/upload-file.use-case';
import { UploadsController } from '../controller/uploads.controller';
import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../domain/file-upload.constraints';
import { UploadedMultipartFile } from '../domain/uploaded-file';

type UploadFileExecuteMock = jest.Mock<
  ReturnType<UploadFileUseCase['execute']>,
  [UploadedMultipartFile | undefined]
>;

type GetFileDownloadUrlExecuteMock = jest.Mock<
  ReturnType<GetFileDownloadUrlUseCase['execute']>,
  [string]
>;

describe('UploadsController contract', () => {
  describe('authorization metadata', () => {
    it('marks only generic download as school-management-only while retaining both permissions', () => {
      const downloadHandler = getControllerHandler('downloadFile');
      const uploadHandler = getControllerHandler('uploadFile');

      expect(
        Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, downloadHandler),
      ).toBe(true);
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, downloadHandler),
      ).toEqual(['files.downloads.view']);
      expect(
        Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, uploadHandler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, uploadHandler),
      ).toEqual(['files.uploads.manage']);
    });
  });

  describe('multipart boundary', () => {
    let app: INestApplication<App>;
    let uploadFileUseCase: { execute: UploadFileExecuteMock };
    let getFileDownloadUrlUseCase: {
      execute: GetFileDownloadUrlExecuteMock;
    };

    const successResponse = {
      id: 'file-1',
      originalName: 'bounded.txt',
      mimeType: 'text/plain',
      sizeBytes: '7',
      visibility: FileVisibility.PRIVATE,
      createdAt: '2026-07-21T00:00:00.000Z',
    };

    beforeAll(async () => {
      uploadFileUseCase = {
        execute: jest
          .fn<
            ReturnType<UploadFileUseCase['execute']>,
            [UploadedMultipartFile | undefined]
          >()
          .mockResolvedValue(successResponse),
      };
      getFileDownloadUrlUseCase = {
        execute: jest.fn<
          ReturnType<GetFileDownloadUrlUseCase['execute']>,
          [string]
        >(),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [UploadsController],
        providers: [
          { provide: UploadFileUseCase, useValue: uploadFileUseCase },
          {
            provide: GetFileDownloadUrlUseCase,
            useValue: getFileDownloadUrlUseCase,
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      const requestContextMiddleware = new RequestContextMiddleware();
      app.use((request, response, next) =>
        requestContextMiddleware.use(request, response, next),
      );
      await app.init();
    });

    beforeEach(() => {
      uploadFileUseCase.execute.mockClear();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects max plus one byte before the use case with the stable envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.alloc(FILES_UPLOAD_MAX_SIZE_BYTES + 1, 65), {
          filename: 'oversized.txt',
          contentType: 'text/plain',
        })
        .expect(413);

      const body = response.body as {
        error: {
          code: string;
          message: string;
          details: { maxSizeBytes: number };
          traceId: string;
        };
      };
      expect(body).toEqual({
        error: {
          code: 'files.upload.size_exceeded',
          message: 'File size exceeds allowed limit',
          details: { maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES },
          traceId: body.error.traceId,
        },
      });
      expect(typeof body.error.traceId).toBe('string');
      expect(body.error.traceId).not.toHaveLength(0);
      expect(uploadFileUseCase.execute).not.toHaveBeenCalled();
    });

    it('preserves a supplied request ID for an oversized request', async () => {
      const requestId = 'files-1a-multipart-request';

      const response = await request(app.getHttpServer())
        .post('/files')
        .set('x-request-id', requestId)
        .set('x-trace-id', 'must-not-be-authoritative')
        .attach('file', Buffer.alloc(FILES_UPLOAD_MAX_SIZE_BYTES + 1, 65), {
          filename: 'oversized.txt',
          contentType: 'text/plain',
        })
        .expect(413);

      const body = response.body as { error: { traceId: string } };
      expect(body.error.traceId).toBe(requestId);
      expect(response.headers['x-request-id']).toBe(requestId);
      expect(uploadFileUseCase.execute).not.toHaveBeenCalled();
    });

    it('passes a file below the maximum to the use case without changing success behavior', async () => {
      const allowedSizeBytes = FILES_UPLOAD_MAX_SIZE_BYTES - 1;
      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.alloc(allowedSizeBytes, 65), {
          filename: 'bounded.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      expect(response.body as unknown).toEqual(successResponse);
      expect(uploadFileUseCase.execute).toHaveBeenCalledTimes(1);
      const receivedFile = uploadFileUseCase.execute.mock.calls[0][0];
      expect(receivedFile).toBeDefined();
      if (!receivedFile) throw new Error('Expected a multipart file');
      expect(receivedFile.originalname).toBe('bounded.txt');
      expect(receivedFile.mimetype).toBe('text/plain');
      expect(Buffer.isBuffer(receivedFile.buffer)).toBe(true);
      expect(receivedFile.buffer.byteLength).toBe(allowedSizeBytes);
    });

    it('accepts a file exactly at the maximum and calls the use case once', async () => {
      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.alloc(FILES_UPLOAD_MAX_SIZE_BYTES, 65), {
          filename: 'exact-maximum.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      expect(response.body as unknown).toEqual(successResponse);
      expect(uploadFileUseCase.execute).toHaveBeenCalledTimes(1);
      const receivedFile = uploadFileUseCase.execute.mock.calls[0][0];
      expect(receivedFile).toBeDefined();
      if (!receivedFile) throw new Error('Expected a multipart file');
      expect(receivedFile.buffer.byteLength).toBe(FILES_UPLOAD_MAX_SIZE_BYTES);
    });
  });

  function getControllerHandler(
    methodName: 'downloadFile' | 'uploadFile',
  ): object {
    const handler = Object.getOwnPropertyDescriptor(
      UploadsController.prototype,
      methodName,
    )?.value as unknown;

    if (typeof handler !== 'function') {
      throw new Error(`Missing controller handler: ${methodName}`);
    }

    return handler;
  }
});
