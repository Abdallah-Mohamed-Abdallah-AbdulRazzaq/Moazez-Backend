import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppCurrentStudentWithEnrollment } from '../../shared/student-app.types';
import { GetStudentLessonPlaybackUseCase } from '../application/get-student-lesson-playback.use-case';
import { StudentLessonPlaybackNotFoundException } from '../domain/student-lesson-playback.errors';
import {
  StudentLessonPlayableContentRecord,
  StudentLessonsReadAdapter,
} from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonPlaybackPresenter } from '../presenters/student-lesson-playback.presenter';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import type { Prisma } from '@prisma/client';

describe('GetStudentLessonPlaybackUseCase', () => {
  it('returns the exact inline 300-second playback response', async () => {
    const { useCase, lessonsReadAdapter, storageService } = createHarness();

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

    expect(lessonsReadAdapter.withPlayableLessonContent).toHaveBeenCalledWith(
      {
        context: currentStudent().context,
        lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
        contentItemId: '22222222-2222-4222-8222-222222222222',
      },
      expect.any(Function),
    );
    expect(storageService.createDownloadUrl).toHaveBeenCalledWith({
      bucket: 'final-bucket',
      objectKey: 'final/video.mp4',
      expiresInSeconds: 300,
      disposition: 'inline',
      contentType: 'video/mp4',
    });
  });

  it('does not sign when playback eligibility is absent', async () => {
    const { useCase, lessonsReadAdapter, storageService } = createHarness();
    lessonsReadAdapter.withPlayableLessonContent.mockResolvedValue(null);

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
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
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

describe('StudentLessonsReadAdapter playback lookup', () => {
  it('requires the visible Student lesson scope and a READY verified video session', async () => {
    const findFirst = jest.fn(
      (args: Prisma.LessonPlanItemFindFirstArgs): Promise<unknown> => {
        void args;
        return Promise.resolve(playableCandidateFixture());
      },
    );
    const transaction = {
      lessonPlanItem: { findFirst },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
    };
    const adapter = new StudentLessonsReadAdapter({
      scoped: { lessonPlanItem: { findFirst } },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as never);

    await expect(
      adapter.findPlayableLessonContent({
        context: currentStudent().context,
        lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
        contentItemId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toEqual<StudentLessonPlayableContentRecord>({
      bucket: 'final-bucket',
      objectKey: 'final/video.webm',
      mimeType: 'video/webm',
      sizeBytes: BigInt(4096),
    });

    const findFirstInput = findFirst.mock.calls[0]?.[0];
    const where = findFirstInput?.where;
    const whereJson = JSON.stringify(where);

    expect(where?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(where?.schoolId).toBe('school-1');
    expect(where?.deletedAt).toBeNull();
    expect(whereJson).toContain('classroom-1');
    expect(whereJson).toContain('year-1');
    expect(whereJson).toContain('term-1');
    expect(whereJson).toContain('22222222-2222-4222-8222-222222222222');
    expect(whereJson).toContain('PUBLISHED');
    expect(whereJson).toContain('FILE');
    expect(whereJson).toContain('LESSON_CONTENT');
    expect(whereJson).toContain('READY');
    expect(whereJson).toContain('video/mp4');
    expect(whereJson).toContain('video/webm');
  });

  it('rejects inconsistent File/session facts after retrieval', async () => {
    const inconsistent = playableCandidateFixture();
    const file = inconsistent.lesson.contentItems[0]?.file;
    if (!file?.uploadSession) throw new Error('invalid playback test fixture');
    file.uploadSession.finalObjectKey = 'different/final.mp4';
    const adapter = new StudentLessonsReadAdapter({
      scoped: {
        lessonPlanItem: {
          findFirst: jest.fn().mockResolvedValue(inconsistent),
        },
      },
    } as never);

    await expect(
      adapter.findPlayableLessonContent({
        context: currentStudent().context,
        lessonPlanItemId: '11111111-1111-4111-8111-111111111111',
        contentItemId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toBeNull();
  });
});

function createHarness(): {
  useCase: GetStudentLessonPlaybackUseCase;
  lessonsReadAdapter: jest.Mocked<
    Pick<StudentLessonsReadAdapter, 'withPlayableLessonContent'>
  >;
  storageService: jest.Mocked<Pick<StorageService, 'createDownloadUrl'>>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest
      .fn()
      .mockResolvedValue(currentStudent()),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const lessonsReadAdapter = {
    withPlayableLessonContent: jest.fn(
      (
        _params: unknown,
        operation: (
          playable: StudentLessonPlayableContentRecord,
        ) => Promise<unknown>,
      ) =>
        operation({
          bucket: 'final-bucket',
          objectKey: 'final/video.mp4',
          mimeType: 'video/mp4',
          sizeBytes: BigInt(209_715_200),
        }),
    ),
  };
  const storageService = {
    createDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/video',
      expiresAt: new Date('2026-07-23T12:05:00.000Z'),
    }),
  };

  return {
    useCase: new GetStudentLessonPlaybackUseCase(
      accessService,
      lessonsReadAdapter as unknown as StudentLessonsReadAdapter,
      storageService as unknown as StorageService,
    ),
    lessonsReadAdapter,
    storageService,
  };
}

function playableCandidateFixture(): {
  id: string;
  lessonPlanId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlan: {
    id: string;
    subjectId: string;
    classroomId: string;
    classroom: {
      sectionId: string;
      section: {
        gradeId: string;
        grade: {
          stageId: string;
        };
      };
    };
  };
  lesson: {
    contentItems: Array<{
      id: string;
      curriculumId: string;
      unitId: string;
      lessonId: string;
      fileId: string;
      file: {
        id: string;
        bucket: string;
        objectKey: string;
        mimeType: string;
        sizeBytes: bigint;
        schoolId: string;
        organizationId: string;
        uploadSession: {
          id: string;
          purpose: string;
          status: string;
          fileId: string;
          schoolId: string;
          organizationId: string;
          finalBucket: string;
          finalObjectKey: string;
          finalCleanupClaimedAt: null;
          finalObjectDeletedAt: null;
          verifiedMimeType: string;
          actualSizeBytes: bigint;
          durationSeconds: number;
          width: number;
          height: number;
          verifiedAt: Date;
        };
      };
    }>;
  };
} {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    lessonPlanId: '88888888-8888-4888-8888-888888888888',
    curriculumId: '33333333-3333-4333-8333-333333333333',
    unitId: '44444444-4444-4444-8444-444444444444',
    lessonId: '55555555-5555-4555-8555-555555555555',
    lessonPlan: {
      id: '88888888-8888-4888-8888-888888888888',
      subjectId: '99999999-9999-4999-8999-999999999999',
      classroomId: 'classroom-1',
      classroom: {
        sectionId: 'section-1',
        section: {
          gradeId: 'grade-1',
          grade: {
            stageId: 'stage-1',
          },
        },
      },
    },
    lesson: {
      contentItems: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          curriculumId: '33333333-3333-4333-8333-333333333333',
          unitId: '44444444-4444-4444-8444-444444444444',
          lessonId: '55555555-5555-4555-8555-555555555555',
          fileId: '66666666-6666-4666-8666-666666666666',
          file: {
            id: '66666666-6666-4666-8666-666666666666',
            bucket: 'final-bucket',
            objectKey: 'final/video.webm',
            mimeType: 'video/webm',
            sizeBytes: BigInt(4096),
            schoolId: 'school-1',
            organizationId: 'organization-1',
            uploadSession: {
              id: '77777777-7777-4777-8777-777777777777',
              purpose: 'LESSON_CONTENT',
              status: 'READY',
              fileId: '66666666-6666-4666-8666-666666666666',
              schoolId: 'school-1',
              organizationId: 'organization-1',
              finalBucket: 'final-bucket',
              finalObjectKey: 'final/video.webm',
              finalCleanupClaimedAt: null,
              finalObjectDeletedAt: null,
              verifiedMimeType: 'video/webm',
              actualSizeBytes: BigInt(4096),
              durationSeconds: 12,
              width: 640,
              height: 360,
              verifiedAt: new Date('2026-07-23T12:00:00.000Z'),
            },
          },
        },
      ],
    },
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
