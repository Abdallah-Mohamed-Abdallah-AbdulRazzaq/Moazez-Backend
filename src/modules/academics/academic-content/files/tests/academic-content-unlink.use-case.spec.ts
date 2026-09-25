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
    lockMutableContent: jest.fn().mockResolvedValue(undefined),
    findActiveAsset: jest.fn().mockResolvedValue(asset),
    findUploadIdForFile: jest.fn().mockResolvedValue('upload'),
    lockUploadById: jest.fn().mockResolvedValue({ id: 'upload' }),
    lockActiveFile: jest.fn().mockResolvedValue(true),
    lockActiveAsset: jest.fn().mockResolvedValue(true),
    softDeleteAsset: jest.fn().mockResolvedValue(asset),
    countActiveAssets: jest.fn().mockResolvedValue(0),
    extendReadyCleanup: jest.fn().mockResolvedValue(undefined),
  };
  const repository = {
    withTransaction: jest.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
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
    tx.countActiveAssets.mockResolvedValue(0);
  });

  it('soft-deletes only the last link and starts at least seven days of orphan grace', async () => {
    const before = Date.now();
    await expect(run()).resolves.toEqual(asset);
    expect(tx.lockUploadById).toHaveBeenCalledWith('upload');
    expect(tx.softDeleteAsset).toHaveBeenCalledWith(assetId, expect.any(Date));
    expect(tx.extendReadyCleanup).toHaveBeenCalledWith(
      fileId,
      schoolId,
      expect.any(Date),
    );
    const calls = tx.extendReadyCleanup.mock.calls as unknown as Array<
      [string, string, Date]
    >;
    const eligibleAt = calls[0][2];
    expect(eligibleAt.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000,
    );
  });

  it('does not schedule orphan cleanup while another active asset remains', async () => {
    tx.countActiveAssets.mockResolvedValue(1);
    await run();
    expect(tx.extendReadyCleanup).not.toHaveBeenCalled();
  });
});
