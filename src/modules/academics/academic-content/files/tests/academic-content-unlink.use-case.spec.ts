import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../../common/context/request-context';
import { UnlinkAcademicContentAssetUseCase } from '../application/academic-content-upload.use-cases';

const schoolId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const contentId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';
const fileId = '55555555-5555-4555-8555-555555555555';

describe('ACC asset unlink', () => {
  const asset = {
    id: assetId,
    schoolId,
    academicContentId: contentId,
    fileId,
    deletedAt: null,
  };
  const tx = {
    academicContent: {
      findFirst: jest.fn().mockResolvedValue({ id: contentId }),
    },
    academicContentAsset: {
      findFirst: jest.fn().mockResolvedValue(asset),
      update: jest.fn().mockResolvedValue(asset),
      count: jest.fn().mockResolvedValue(0),
    },
    fileUploadSession: {
      findFirst: jest.fn().mockResolvedValue({ id: 'upload' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    file: { update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ id: fileId }]),
  };
  const repository = {
    lockById: jest.fn().mockResolvedValue({ id: 'upload' }),
    prisma: {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
  };
  const useCase = new UnlinkAcademicContentAssetUseCase(repository as never);

  function run() {
    const context = createRequestContext();
    context.actor = { id: actorId, userType: UserType.SCHOOL_USER };
    context.activeMembership = {
      membershipId: 'm',
      schoolId,
      organizationId: '66666666-6666-4666-8666-666666666666',
      roleId: 'r',
      permissions: ['academics.academic_content.manage'],
    };
    return runWithRequestContext(context, () =>
      useCase.execute({ contentId, assetId }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    tx.academicContentAsset.count.mockResolvedValue(0);
  });

  it('soft-deletes only the last link and starts at least seven days of orphan grace', async () => {
    const before = Date.now();
    await expect(run()).resolves.toEqual(asset);
    expect(repository.lockById).toHaveBeenCalledWith(tx, 'upload');
    const assetUpdate = (
      tx.academicContentAsset.update.mock.calls as unknown as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >
    )[0][0];
    expect(assetUpdate.where.id).toBe(assetId);
    expect(assetUpdate.data.deletedAt).toBeInstanceOf(Date);
    expect(tx.file.update).not.toHaveBeenCalled();
    const update = (
      tx.fileUploadSession.updateMany.mock.calls as unknown as Array<
        [{ data: { finalCleanupEligibleAt: Date } }]
      >
    )[0][0];
    expect(update.data.finalCleanupEligibleAt.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000,
    );
  });

  it('does not schedule orphan cleanup while another active asset remains', async () => {
    tx.academicContentAsset.count.mockResolvedValue(1);
    await run();
    expect(tx.fileUploadSession.updateMany).not.toHaveBeenCalled();
  });
});
