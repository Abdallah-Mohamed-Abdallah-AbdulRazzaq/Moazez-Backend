import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { StudentLessonPlaybackController } from '../controller/student-lesson-playback.controller';
import { GetStudentLessonPlaybackUseCase } from '../application/get-student-lesson-playback.use-case';

describe('StudentLessonPlaybackController', () => {
  it('declares the exact nested playback path and delegates both UUIDs', async () => {
    const execute = jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/video',
      expiresAt: '2026-07-23T12:05:00.000Z',
      mimeType: 'video/mp4',
      sizeBytes: '1024',
      disposition: 'inline',
      renewable: true,
    });
    const useCase = {
      execute,
    } as unknown as GetStudentLessonPlaybackUseCase;
    const controller = new StudentLessonPlaybackController(useCase);

    await expect(
      controller.getPlayback(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toMatchObject({ disposition: 'inline' });

    expect(execute).toHaveBeenCalledWith({
      lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
      contentItemId: '22222222-2222-4222-8222-222222222222',
    });
    expect(
      Reflect.getMetadata(PATH_METADATA, StudentLessonPlaybackController),
    ).toBe('student/lessons/:lessonPlanItemId/content');
    const getPlaybackHandler = Object.getOwnPropertyDescriptor(
      StudentLessonPlaybackController.prototype,
      'getPlayback',
    )?.value as (...args: unknown[]) => unknown;

    expect(Reflect.getMetadata(PATH_METADATA, getPlaybackHandler)).toBe(
      ':contentItemId/playback',
    );
  });

  it('requires lesson-plan view permission and no generic file permission', () => {
    const reflector = new Reflector();
    const getPlaybackHandler = Object.getOwnPropertyDescriptor(
      StudentLessonPlaybackController.prototype,
      'getPlayback',
    )?.value as (...args: unknown[]) => unknown;
    const permissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_METADATA,
      getPlaybackHandler,
    );

    expect(permissions).toEqual(['academics.lesson_plans.view']);
    expect(permissions).not.toContain('files.downloads.view');
  });
});
