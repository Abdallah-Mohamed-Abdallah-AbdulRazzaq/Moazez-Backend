import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppCurrentStudentWithEnrollment } from '../../shared/student-app.types';
import { GetStudentLessonPlaybackUseCase } from '../application/get-student-lesson-playback.use-case';
import { StudentLessonPlaybackNotFoundException } from '../domain/student-lesson-playback.errors';
import { StudentLessonsReadAdapter } from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonPlaybackPresenter } from '../presenters/student-lesson-playback.presenter';

describe('GetStudentLessonPlaybackUseCase', () => {
  it('returns the exact inline 300-second playback response', async () => {
    const { useCase, lessonsReadAdapter } = createHarness();

    await expect(
      useCase.execute({
        lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
        contentItemId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toEqual({
      url: 'https://storage.invalid/video',
      expiresAt: '2026-07-23T12:05:00.000Z',
      mimeType: 'video/mp4',
      sizeBytes: '209715200',
      disposition: 'inline',
      renewable: true,
    });

    expect(lessonsReadAdapter.getLessonContentPlayback).toHaveBeenCalledWith({
      context: currentStudent().context,
      lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
      contentItemId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('does not sign when playback eligibility is absent', async () => {
    const { useCase, lessonsReadAdapter } = createHarness();
    lessonsReadAdapter.getLessonContentPlayback.mockResolvedValue(null);

    await expect(
      useCase.execute({
        lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
        contentItemId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toBeInstanceOf(StudentLessonPlaybackNotFoundException);

    await expect(
      useCase.execute({
        lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
        contentItemId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toMatchObject({
      code: 'learning.content.playback_not_found',
      httpStatus: 404,
      details: undefined,
    });
  });
});

describe('StudentLessonPlaybackPresenter', () => {
  it('leaks no internal file, upload, tenant, storage, or verification fields', () => {
    const result = StudentLessonPlaybackPresenter.present({
      url: 'https://storage.invalid/video',
      expiresAt: new Date('2026-07-23T12:05:00.000Z'),
      mimeType: 'video/webm',
      sizeBytes: BigInt(1024),
    });

    expect(Object.keys(result).sort()).toEqual([
      'disposition',
      'expiresAt',
      'mimeType',
      'renewable',
      'sizeBytes',
      'url',
    ]);
    expect(result.sizeBytes).toBe('1024');
    const json = JSON.stringify(result);
    for (const forbidden of [
      'fileId',
      'uploadId',
      'sessionId',
      'schoolId',
      'organizationId',
      'bucket',
      'objectKey',
      'checksum',
      'verificationVersion',
      'filename',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

function createHarness(): {
  useCase: GetStudentLessonPlaybackUseCase;
  lessonsReadAdapter: jest.Mocked<
    Pick<StudentLessonsReadAdapter, 'getLessonContentPlayback'>
  >;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest
      .fn()
      .mockResolvedValue(currentStudent()),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const lessonsReadAdapter = {
    getLessonContentPlayback: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/video',
      expiresAt: '2026-07-23T12:05:00.000Z',
      mimeType: 'video/mp4',
      sizeBytes: '209715200',
      disposition: 'inline',
      renewable: true,
    }),
  };

  return {
    useCase: new GetStudentLessonPlaybackUseCase(
      accessService,
      lessonsReadAdapter as unknown as StudentLessonsReadAdapter,
    ),
    lessonsReadAdapter,
  };
}

function currentStudent(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: {
      studentUserId: 'student-user-1',
      schoolId: 'school-1',
      organizationId: 'organization-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: ['academics.lesson_plans.view'],
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      classroomId: 'classroom-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    },
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}
