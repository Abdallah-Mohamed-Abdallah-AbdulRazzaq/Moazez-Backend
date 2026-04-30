import {
  AuditOutcome,
  FileVisibility,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  ArchiveRewardCatalogItemUseCase,
  CreateRewardCatalogItemUseCase,
  GetRewardCatalogItemUseCase,
  ListRewardCatalogUseCase,
  PublishRewardCatalogItemUseCase,
  UpdateRewardCatalogItemUseCase,
} from '../application/reward-catalog.use-cases';
import { RewardCatalogRepository } from '../infrastructure/reward-catalog.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const FILE_ID = 'file-1';
const REWARD_ID = 'reward-1';
const ACTOR_ID = 'user-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Reward catalog use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.rewards.view',
          'reinforcement.rewards.manage',
        ],
      });

      return fn();
    });
  }

  it('creates a draft reward and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const result = await withScope(() =>
      new CreateRewardCatalogItemUseCase(repository, auth).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        titleEn: 'Library Pass',
        type: 'privilege',
        minTotalXp: 25,
        isUnlimited: true,
        imageFileId: FILE_ID,
      }),
    );

    expect(repository.createCatalogItem).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        item: expect.objectContaining({
          status: RewardCatalogItemStatus.DRAFT,
          type: RewardCatalogItemType.PRIVILEGE,
          stockQuantity: null,
          stockRemaining: null,
          createdById: ACTOR_ID,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'draft',
      type: 'privilege',
      isUnlimited: true,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.reward.catalog.create',
        resourceType: 'reward_catalog_item',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(repository.createRewardRedemption).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('validates academic year ownership on create', async () => {
    const repository = baseRepository({
      findAcademicYear: jest.fn().mockResolvedValue(null),
      createCatalogItem: jest.fn(),
    });

    await expect(
      withScope(() =>
        new CreateRewardCatalogItemUseCase(repository, authRepository()).execute({
          academicYearId: 'school-b-year',
          titleEn: 'Reward',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.createCatalogItem).not.toHaveBeenCalled();
  });

  it('validates term ownership and term-year consistency on create', async () => {
    await expect(
      withScope(() =>
        new CreateRewardCatalogItemUseCase(
          baseRepository({
            findTerm: jest.fn().mockResolvedValue(null),
            createCatalogItem: jest.fn(),
          }),
          authRepository(),
        ).execute({
          academicYearId: YEAR_ID,
          termId: 'school-b-term',
          titleEn: 'Reward',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    await expect(
      withScope(() =>
        new CreateRewardCatalogItemUseCase(
          baseRepository({
            findTerm: jest.fn().mockResolvedValue({
              id: TERM_ID,
              academicYearId: 'other-year',
            }),
            createCatalogItem: jest.fn(),
          }),
          authRepository(),
        ).execute({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          titleEn: 'Reward',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('validates image file ownership on create', async () => {
    const repository = baseRepository({
      findFile: jest.fn().mockResolvedValue(null),
      createCatalogItem: jest.fn(),
    });

    await expect(
      withScope(() =>
        new CreateRewardCatalogItemUseCase(repository, authRepository()).execute({
          titleEn: 'Reward',
          imageFileId: 'school-b-file',
        }),
      ),
    ).rejects.toBeInstanceOf(FilesNotFoundException);
    expect(repository.createCatalogItem).not.toHaveBeenCalled();
  });

  it('validates changed references on update', async () => {
    const repository = baseRepository({
      findFile: jest.fn().mockResolvedValue(null),
      updateCatalogItem: jest.fn(),
    });

    await expect(
      withScope(() =>
        new UpdateRewardCatalogItemUseCase(repository, authRepository()).execute(
          REWARD_ID,
          { imageFileId: 'school-b-file' },
        ),
      ),
    ).rejects.toBeInstanceOf(FilesNotFoundException);
    expect(repository.updateCatalogItem).not.toHaveBeenCalled();
  });

  it('updates editable draft fields and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new UpdateRewardCatalogItemUseCase(repository, auth).execute(REWARD_ID, {
        type: 'digital',
        isUnlimited: false,
        stockQuantity: 5,
        stockRemaining: 4,
      }),
    );

    expect(repository.updateCatalogItem).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardId: REWARD_ID,
        data: expect.objectContaining({
          type: RewardCatalogItemType.DIGITAL,
          isUnlimited: false,
          stockQuantity: 5,
          stockRemaining: 4,
        }),
      }),
    );
    expect(result).toMatchObject({
      type: 'digital',
      isUnlimited: false,
      stockRemaining: 4,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.reward.catalog.update',
      }),
    );
  });

  it('publishes draft rewards and sets actor fields', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new PublishRewardCatalogItemUseCase(repository, auth).execute(REWARD_ID),
    );

    expect(repository.publishCatalogItem).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      rewardId: REWARD_ID,
      actorId: ACTOR_ID,
    });
    expect(result).toMatchObject({
      status: 'published',
      publishedById: ACTOR_ID,
      publishedAt: NOW.toISOString(),
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.reward.catalog.publish',
        after: expect.objectContaining({
          beforeStatus: RewardCatalogItemStatus.DRAFT,
          afterStatus: RewardCatalogItemStatus.PUBLISHED,
        }),
      }),
    );
    expect(repository.createRewardRedemption).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('archives active rewards and audits the reason', async () => {
    const repository = baseRepository({
      findCatalogItemById: jest.fn().mockResolvedValue(
        rewardRecord({
          status: RewardCatalogItemStatus.PUBLISHED,
          publishedAt: NOW,
          publishedById: ACTOR_ID,
        }),
      ),
    });
    const auth = authRepository();

    const result = await withScope(() =>
      new ArchiveRewardCatalogItemUseCase(repository, auth).execute(REWARD_ID, {
        reason: 'Term ended',
      }),
    );

    expect(result.status).toBe('archived');
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.reward.catalog.archive',
        after: expect.objectContaining({ reason: 'Term ended' }),
      }),
    );
    expect(repository.createRewardRedemption).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('does not audit catalog reads', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() =>
      new ListRewardCatalogUseCase(repository).execute({ search: 'Reward' }),
    );
    await withScope(() =>
      new GetRewardCatalogItemUseCase(repository).execute(REWARD_ID),
    );

    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      listCatalogItems: jest.fn().mockResolvedValue({
        items: [rewardRecord()],
        total: 1,
      }),
      findCatalogItemById: jest.fn().mockResolvedValue(rewardRecord()),
      createCatalogItem: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          rewardRecord({
            ...input.item,
            schoolId: input.schoolId,
          }),
        ),
      ),
      updateCatalogItem: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          rewardRecord({
            id: input.rewardId,
            ...input.data,
          }),
        ),
      ),
      publishCatalogItem: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          rewardRecord({
            id: params.rewardId,
            status: RewardCatalogItemStatus.PUBLISHED,
            publishedAt: NOW,
            publishedById: params.actorId,
          }),
        ),
      ),
      archiveCatalogItem: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          rewardRecord({
            id: params.rewardId,
            status: RewardCatalogItemStatus.ARCHIVED,
            archivedAt: NOW,
            archivedById: params.actorId,
          }),
        ),
      ),
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
      }),
      findFile: jest.fn().mockResolvedValue(fileRecord()),
      countOpenRedemptionsForCatalogItem: jest.fn().mockResolvedValue(0),
      createRewardRedemption: jest.fn(),
      createXpLedger: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<RewardCatalogRepository> & {
      createRewardRedemption: jest.Mock;
      createXpLedger: jest.Mock;
    };
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as jest.Mocked<AuthRepository>;
  }

  function rewardRecord(overrides?: any) {
    return {
      id: overrides?.id ?? REWARD_ID,
      schoolId: overrides?.schoolId ?? SCHOOL_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      titleEn: overrides?.titleEn ?? 'Reward',
      titleAr: overrides?.titleAr ?? null,
      descriptionEn: overrides?.descriptionEn ?? null,
      descriptionAr: overrides?.descriptionAr ?? null,
      type: overrides?.type ?? RewardCatalogItemType.PHYSICAL,
      status: overrides?.status ?? RewardCatalogItemStatus.DRAFT,
      minTotalXp: overrides?.minTotalXp ?? null,
      stockQuantity: overrides?.stockQuantity ?? null,
      stockRemaining: overrides?.stockRemaining ?? null,
      isUnlimited: overrides?.isUnlimited ?? true,
      imageFileId: overrides?.imageFileId ?? FILE_ID,
      sortOrder: overrides?.sortOrder ?? 0,
      publishedAt: overrides?.publishedAt ?? null,
      publishedById: overrides?.publishedById ?? null,
      archivedAt: overrides?.archivedAt ?? null,
      archivedById: overrides?.archivedById ?? null,
      createdById: overrides?.createdById ?? ACTOR_ID,
      metadata: overrides?.metadata ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      deletedAt: overrides?.deletedAt ?? null,
      academicYear: {
        id: YEAR_ID,
        nameAr: 'Year AR',
        nameEn: 'Year',
        isActive: true,
      },
      term: {
        id: TERM_ID,
        academicYearId: YEAR_ID,
        nameAr: 'Term AR',
        nameEn: 'Term',
        isActive: true,
      },
      imageFile: fileRecord(),
    } as never;
  }

  function fileRecord() {
    return {
      id: FILE_ID,
      originalName: 'reward.png',
      mimeType: 'image/png',
      sizeBytes: BigInt(128),
      visibility: FileVisibility.PRIVATE,
      createdAt: NOW,
    };
  }
});
