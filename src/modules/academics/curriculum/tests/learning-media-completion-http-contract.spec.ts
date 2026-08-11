import { readFileSync } from 'node:fs';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { LearningMediaController } from '../controller/learning-media.controller';
import {
  CancelLearningMediaUploadUseCase,
  CompleteLearningMediaUploadUseCase,
  CreateLearningMediaUploadUseCase,
  VerifyLegacyLearningMediaUseCase,
} from '../../../files/uploads/application/learning-media-upload.use-cases';

describe('Learning Media completion HTTP compatibility', () => {
  it('keeps POST /api/v1/academics/learning-media/uploads/:uploadId/complete synchronous HTTP 200', async () => {
    const completion = {
      id: 'upload-1',
      status: 'READY',
      fileId: 'file-1',
      retryable: false,
    };
    const completeUpload = {
      execute: jest.fn().mockResolvedValue(completion),
    } as unknown as CompleteLearningMediaUploadUseCase;
    const controller = new LearningMediaController(
      { execute: jest.fn() } as unknown as CreateLearningMediaUploadUseCase,
      completeUpload,
      { execute: jest.fn() } as unknown as CancelLearningMediaUploadUseCase,
      { execute: jest.fn() } as unknown as VerifyLegacyLearningMediaUseCase,
    );
    const handler = LearningMediaController.prototype.complete;

    expect(Reflect.getMetadata(PATH_METADATA, LearningMediaController)).toBe(
      'academics/learning-media/uploads',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':uploadId/complete',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.OK,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).not.toBe(
      HttpStatus.ACCEPTED,
    );
    expect(
      `/api/v1/${Reflect.getMetadata(PATH_METADATA, LearningMediaController)}/${Reflect.getMetadata(PATH_METADATA, handler)}`,
    ).toBe('/api/v1/academics/learning-media/uploads/:uploadId/complete');

    await expect(controller.complete('upload-1', {})).resolves.toBe(completion);
    expect(completeUpload.execute).toHaveBeenCalledWith('upload-1');
  });

  it('does not substitute a queue or polling contract into completion', () => {
    const controllerSource = readFileSync(
      require.resolve('../controller/learning-media.controller'),
      'utf8',
    );
    const useCaseSource = readFileSync(
      require.resolve('../../../files/uploads/application/learning-media-upload.use-cases'),
      'utf8',
    );

    expect(controllerSource).not.toMatch(/Bullmq|Queue|Accepted|poll/i);
    expect(useCaseSource).not.toMatch(/Bullmq|enqueue|polling/i);
  });
});
