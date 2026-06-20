import { FileVisibility, ReinforcementTaskStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentFilesReadAdapter } from '../infrastructure/parent-files-read.adapter';

describe('ParentFilesReadAdapter', () => {
  it('uses scoped Prisma and owned child task proof filters for downloads', async () => {
    const { adapter, submissionMocks } = createAdapter();
    submissionMocks.findFirst.mockResolvedValue(submissionFixture());

    const result = await adapter.findTaskProofFileForDownload({
      child: childFixture(),
      fileId: 'file-1',
    });

    expect(submissionMocks.findFirst.mock.calls[0][0].where).toMatchObject({
      proofFileId: 'file-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      assignment: {
        is: {
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          status: { not: ReinforcementTaskStatus.CANCELLED },
          task: {
            is: {
              deletedAt: null,
              status: { not: ReinforcementTaskStatus.CANCELLED },
            },
          },
        },
      },
      proofFile: {
        is: {
          deletedAt: null,
        },
      },
    });
    expect(submissionMocks.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      'schoolId',
    );
    expect(result).toEqual({
      id: 'file-1',
      bucket: 'private-bucket',
      objectKey: 'schools/school-1/files/proof.pdf',
      originalName: 'proof.pdf',
      visibility: FileVisibility.PRIVATE,
    });
  });

  it('returns null for missing or deleted proof files', async () => {
    const { adapter, submissionMocks } = createAdapter();
    submissionMocks.findFirst.mockResolvedValueOnce(null);

    await expect(
      adapter.findTaskProofFileForDownload({
        child: childFixture(),
        fileId: 'file-1',
      }),
    ).resolves.toBeNull();

    submissionMocks.findFirst.mockResolvedValueOnce({
      ...submissionFixture(),
      proofFile: {
        ...submissionFixture().proofFile,
        deletedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    });

    await expect(
      adapter.findTaskProofFileForDownload({
        child: childFixture(),
        fileId: 'file-1',
      }),
    ).resolves.toBeNull();
  });

  it('performs no file/task/submission mutations or platform bypass calls', async () => {
    const { adapter, submissionMocks, fileMocks, mutationMocks, platformBypass } =
      createAdapter();
    submissionMocks.findFirst.mockResolvedValue(null);

    await adapter.findTaskProofFileForDownload({
      child: childFixture(),
      fileId: 'file-1',
    });

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(fileMocks.findFirst).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function submissionFixture() {
  return {
    id: 'submission-1',
    proofFile: {
      id: 'file-1',
      bucket: 'private-bucket',
      objectKey: 'schools/school-1/files/proof.pdf',
      originalName: 'proof.pdf',
      visibility: FileVisibility.PRIVATE,
      deletedAt: null,
    },
  };
}

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentFilesReadAdapter;
  submissionMocks: ReturnType<typeof modelMocks>;
  fileMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const submissionMocks = modelMocks();
  const fileMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      reinforcementSubmission: submissionMocks,
      file: fileMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentFilesReadAdapter(prisma),
    submissionMocks,
    fileMocks,
    mutationMocks: {
      submissionCreate: submissionMocks.create,
      submissionUpdate: submissionMocks.update,
      submissionDelete: submissionMocks.delete,
      fileCreate: fileMocks.create,
      fileUpdate: fileMocks.update,
      fileDelete: fileMocks.delete,
    },
    platformBypass,
  };
}
