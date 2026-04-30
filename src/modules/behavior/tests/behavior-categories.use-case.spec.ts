import {
  AuditOutcome,
  BehaviorRecordType,
  BehaviorSeverity,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  CreateBehaviorCategoryUseCase,
  DeleteBehaviorCategoryUseCase,
  GetBehaviorCategoryUseCase,
  ListBehaviorCategoriesUseCase,
  UpdateBehaviorCategoryUseCase,
} from '../application/behavior-categories.use-cases';
import { BehaviorCategoriesRepository } from '../infrastructure/behavior-categories.repository';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const CATEGORY_ID = 'category-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior category use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['behavior.categories.view', 'behavior.categories.manage'],
      });

      return fn();
    });
  }

  it('rejects duplicate category codes on create', async () => {
    const repository = baseRepository({
      findCategoryByCode: jest.fn().mockResolvedValue(categoryRecord()),
      createCategory: jest.fn(),
    });

    await expect(
      withScope(() =>
        new CreateBehaviorCategoryUseCase(repository, authRepository()).execute(
          {
            code: 'late arrival',
            nameEn: 'Late arrival',
            type: 'negative',
          },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    expect(repository.createCategory).not.toHaveBeenCalled();
  });

  it('creates a category and audits the mutation without record or XP side effects', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const result = await withScope(() =>
      new CreateBehaviorCategoryUseCase(repository, auth).execute({
        code: 'helpful act',
        nameEn: 'Helpful act',
        type: 'positive',
        defaultSeverity: 'low',
        defaultPoints: 5,
      }),
    );

    expect(repository.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        category: expect.objectContaining({
          code: 'HELPFUL_ACT',
          type: BehaviorRecordType.POSITIVE,
          defaultSeverity: BehaviorSeverity.LOW,
          defaultPoints: 5,
          createdById: ACTOR_ID,
        }),
      }),
    );
    expect(result).toMatchObject({
      code: 'HELPFUL_ACT',
      type: 'positive',
      defaultSeverity: 'low',
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'behavior',
        action: 'behavior.category.create',
        resourceType: 'behavior_category',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(repository.createBehaviorRecord).not.toHaveBeenCalled();
    expect(repository.createBehaviorPointLedger).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('validates duplicate category codes on update', async () => {
    const repository = baseRepository({
      findCategoryByCode: jest.fn().mockResolvedValue(
        categoryRecord({
          id: 'category-2',
          code: 'EXISTING_CODE',
        }),
      ),
      updateCategory: jest.fn(),
    });

    await expect(
      withScope(() =>
        new UpdateBehaviorCategoryUseCase(repository, authRepository()).execute(
          CATEGORY_ID,
          {
            code: 'existing code',
          },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    expect(repository.updateCategory).not.toHaveBeenCalled();
  });

  it('updates category fields and audits the mutation without record or XP side effects', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new UpdateBehaviorCategoryUseCase(repository, auth).execute(CATEGORY_ID, {
        nameEn: 'Updated helpful act',
        defaultPoints: 10,
        sortOrder: 4,
      }),
    );

    expect(repository.updateCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: CATEGORY_ID,
        data: expect.objectContaining({
          nameEn: 'Updated helpful act',
          defaultPoints: 10,
          sortOrder: 4,
        }),
      }),
    );
    expect(result).toMatchObject({
      id: CATEGORY_ID,
      defaultPoints: 10,
      sortOrder: 4,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'behavior.category.update',
        before: expect.objectContaining({ code: 'HELPFUL_ACT' }),
      }),
    );
    expect(repository.createBehaviorRecord).not.toHaveBeenCalled();
    expect(repository.createBehaviorPointLedger).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('soft-deletes unused categories and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new DeleteBehaviorCategoryUseCase(repository, auth).execute(CATEGORY_ID),
    );

    expect(result).toEqual({ ok: true });
    expect(repository.softDeleteCategory).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      categoryId: CATEGORY_ID,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'behavior.category.delete',
        after: expect.objectContaining({
          usage: {
            recordsCount: 0,
            pointLedgerEntriesCount: 0,
          },
        }),
      }),
    );
    expect(repository.createBehaviorRecord).not.toHaveBeenCalled();
    expect(repository.createBehaviorPointLedger).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('does not audit category reads', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() =>
      new ListBehaviorCategoriesUseCase(repository).execute({ search: 'Help' }),
    );
    await withScope(() =>
      new GetBehaviorCategoryUseCase(repository).execute(CATEGORY_ID),
    );

    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      listCategories: jest.fn().mockResolvedValue({
        items: [categoryRecord()],
        total: 1,
      }),
      findCategoryById: jest.fn().mockResolvedValue(categoryRecord()),
      findCategoryByCode: jest.fn().mockResolvedValue(null),
      createCategory: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          categoryRecord({
            ...input.category,
            schoolId: input.schoolId,
          }),
        ),
      ),
      updateCategory: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          categoryRecord({
            id: input.categoryId,
            ...input.data,
          }),
        ),
      ),
      softDeleteCategory: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          categoryRecord({
            id: params.categoryId,
            schoolId: params.schoolId,
            deletedAt: new Date('2026-04-30T13:00:00.000Z'),
          }),
        ),
      ),
      countCategoryUsage: jest.fn().mockResolvedValue({
        recordsCount: 0,
        pointLedgerEntriesCount: 0,
      }),
      createBehaviorRecord: jest.fn(),
      createBehaviorPointLedger: jest.fn(),
      createXpLedger: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<BehaviorCategoriesRepository> & {
      createBehaviorRecord: jest.Mock;
      createBehaviorPointLedger: jest.Mock;
      createXpLedger: jest.Mock;
    };
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as jest.Mocked<AuthRepository>;
  }

  function categoryRecord(overrides?: Record<string, unknown>) {
    return {
      id: CATEGORY_ID,
      schoolId: SCHOOL_ID,
      code: 'HELPFUL_ACT',
      nameEn: 'Helpful act',
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      type: BehaviorRecordType.POSITIVE,
      defaultSeverity: BehaviorSeverity.LOW,
      defaultPoints: 5,
      isActive: true,
      sortOrder: 0,
      createdById: ACTOR_ID,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      ...overrides,
    } as never;
  }
});
