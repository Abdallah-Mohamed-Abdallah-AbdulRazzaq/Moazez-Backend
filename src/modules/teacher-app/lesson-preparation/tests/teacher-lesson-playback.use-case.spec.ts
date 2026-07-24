import { LessonContentPlaybackNotFoundException } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.errors';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { GetTeacherLessonPlaybackUseCase } from '../application/get-teacher-lesson-playback.use-case';
import { TeacherLessonPreparationReadAdapter } from '../infrastructure/teacher-lesson-preparation-read.adapter';

describe('GetTeacherLessonPlaybackUseCase', () => {
  it('returns the exact shared playback response for the owned plan', async () => {
    const { useCase, readAdapter } = createHarness();

    await expect(
      useCase.execute({
        lessonPlanItemId: 'item-1',
        contentItemId: 'content-1',
      }),
    ).resolves.toEqual(playbackResponse());
    expect(readAdapter.getLessonContentPlayback).toHaveBeenCalledWith({
      context: teacherContext(),
      lessonPlanItemId: 'item-1',
      contentItemId: 'content-1',
    });
  });

  it('returns the common safe 404 when authorization or media is absent', async () => {
    const { useCase, readAdapter } = createHarness();
    readAdapter.getLessonContentPlayback.mockResolvedValue(null);

    await expect(
      useCase.execute({
        lessonPlanItemId: 'item-1',
        contentItemId: 'content-1',
      }),
    ).rejects.toBeInstanceOf(LessonContentPlaybackNotFoundException);
    await expect(
      useCase.execute({
        lessonPlanItemId: 'item-1',
        contentItemId: 'content-1',
      }),
    ).rejects.toMatchObject({
      code: 'learning.content.playback_not_found',
      httpStatus: 404,
      details: undefined,
    });
  });
});

function createHarness() {
  const accessService = {
    getTeacherAppContext: jest.fn().mockReturnValue(teacherContext()),
  };
  const readAdapter = {
    getLessonContentPlayback: jest.fn().mockResolvedValue(playbackResponse()),
  };
  return {
    useCase: new GetTeacherLessonPlaybackUseCase(
      accessService as unknown as TeacherAppAccessService,
      readAdapter as unknown as TeacherLessonPreparationReadAdapter,
    ),
    readAdapter,
  };
}

function teacherContext() {
  return {
    teacherUserId: 'teacher-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [
      'teacher.lesson_preparation.view',
      'academics.lesson_plans.view',
      'academics.curriculum.view',
    ],
  };
}

function playbackResponse() {
  return {
    url: 'https://storage.invalid/video',
    expiresAt: '2026-07-24T12:05:00.000Z',
    mimeType: 'video/webm' as const,
    sizeBytes: '4096',
    disposition: 'inline' as const,
    renewable: true as const,
  };
}
