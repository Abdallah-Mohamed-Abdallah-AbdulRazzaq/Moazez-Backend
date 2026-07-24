import { LessonContentPlaybackNotFoundException } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.errors';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { GetParentChildLessonPlaybackUseCase } from '../application/get-parent-child-lesson-playback.use-case';
import { ParentChildLessonsReadAdapter } from '../infrastructure/parent-child-lessons-read.adapter';

describe('GetParentChildLessonPlaybackUseCase', () => {
  it('returns the exact shared playback response for the owned child', async () => {
    const { useCase, readAdapter } = createHarness();

    await expect(
      useCase.execute({
        studentId: 'student-1',
        lessonPlanItemId: 'item-1',
        contentItemId: 'content-1',
      }),
    ).resolves.toEqual(playbackResponse());
    expect(readAdapter.getLessonContentPlayback).toHaveBeenCalledWith({
      context: parentContext(),
      child: parentContext().children[0],
      lessonPlanItemId: 'item-1',
      contentItemId: 'content-1',
    });
  });

  it('collapses an unowned child and absent playable media to the safe 404', async () => {
    const { useCase, readAdapter } = createHarness();

    await expect(
      useCase.execute({
        studentId: 'other-student',
        lessonPlanItemId: 'item-1',
        contentItemId: 'content-1',
      }),
    ).rejects.toMatchObject({
      code: 'learning.content.playback_not_found',
      httpStatus: 404,
      details: undefined,
    });
    expect(readAdapter.getLessonContentPlayback).not.toHaveBeenCalled();

    readAdapter.getLessonContentPlayback.mockResolvedValue(null);
    await expect(
      useCase.execute({
        studentId: 'student-1',
        lessonPlanItemId: 'item-1',
        contentItemId: 'content-1',
      }),
    ).rejects.toBeInstanceOf(LessonContentPlaybackNotFoundException);
  });
});

function createHarness() {
  const accessService = {
    getParentAppContext: jest.fn().mockResolvedValue(parentContext()),
  };
  const readAdapter = {
    getLessonContentPlayback: jest.fn().mockResolvedValue(playbackResponse()),
  };
  return {
    useCase: new GetParentChildLessonPlaybackUseCase(
      accessService as unknown as ParentAppAccessService,
      readAdapter as unknown as ParentChildLessonsReadAdapter,
    ),
    readAdapter,
  };
}

function parentContext() {
  return {
    parentUserId: 'parent-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['academics.lesson_plans.view', 'academics.curriculum.view'],
    guardianIds: ['guardian-1'],
    children: [
      {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ],
  };
}

function playbackResponse() {
  return {
    url: 'https://storage.invalid/video',
    expiresAt: '2026-07-24T12:05:00.000Z',
    mimeType: 'video/mp4' as const,
    sizeBytes: '4096',
    disposition: 'inline' as const,
    renewable: true as const,
  };
}
