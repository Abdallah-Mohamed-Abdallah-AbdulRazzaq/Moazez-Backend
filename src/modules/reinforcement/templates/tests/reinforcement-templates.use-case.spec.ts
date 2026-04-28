import {
  AuditOutcome,
  Prisma,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateReinforcementTaskTemplateUseCase } from '../application/create-reinforcement-task-template.use-case';
import { ListReinforcementTemplatesUseCase } from '../application/list-reinforcement-templates.use-case';
import { ReinforcementTemplatesRepository } from '../infrastructure/reinforcement-templates.repository';

describe('Reinforcement template use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'reinforcement.templates.view',
          'reinforcement.templates.manage',
        ],
      });

      return fn();
    });
  }

  it('creates a template with a default stage and records audit', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateReinforcementTaskTemplateUseCase(
      repository,
      auth,
    );

    const result = await withScope(() =>
      useCase.execute({
        nameEn: 'Reading template',
        source: 'teacher',
        rewardType: 'xp',
        rewardValue: 10,
      }),
    );

    expect(repository.createTemplateWithStages).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        stages: [
          expect.objectContaining({
            sortOrder: 1,
            titleEn: 'Reading template',
            proofType: ReinforcementProofType.NONE,
          }),
        ],
      }),
    );
    expect(result).toMatchObject({
      id: 'template-1',
      source: 'teacher',
      stages: [expect.objectContaining({ proofType: 'none' })],
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.template.create',
        resourceType: 'reinforcement_task_template',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({ stageCount: 1 }),
      }),
    );
  });

  it('rejects missing template names', async () => {
    const repository = baseRepository({
      createTemplateWithStages: jest.fn(),
    });
    const useCase = new CreateReinforcementTaskTemplateUseCase(
      repository,
      authRepository(),
    );

    await expect(withScope(() => useCase.execute({}))).rejects.toBeInstanceOf(
      ValidationDomainException,
    );
    expect(repository.createTemplateWithStages).not.toHaveBeenCalled();
  });

  it('lists templates without soft-deleted rows by default', async () => {
    const repository = baseRepository({
      listTemplates: jest.fn().mockResolvedValue([templateRecord()]),
    });
    const useCase = new ListReinforcementTemplatesUseCase(repository);

    const result = await withScope(() => useCase.execute({}));

    expect(repository.listTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: false }),
    );
    expect(result.items.map((item) => item.id)).toEqual(['template-1']);
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      listTemplates: jest.fn().mockResolvedValue([templateRecord()]),
      createTemplateWithStages: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          templateRecord({
            nameEn: input.template.nameEn,
            nameAr: input.template.nameAr,
            source: input.template.source,
            rewardType: input.template.rewardType,
            rewardValue: input.template.rewardValue,
            stages: input.stages.map(
              (stage: {
                sortOrder: number;
                titleEn: string | null;
                titleAr: string | null;
                proofType: ReinforcementProofType;
                requiresApproval: boolean;
              }) => stageRecord(stage),
            ),
          }),
        ),
      ),
      ...overrides,
    } as unknown as ReinforcementTemplatesRepository;
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  function templateRecord(
    overrides?: Partial<{
      nameEn: string | null;
      nameAr: string | null;
      source: ReinforcementSource;
      rewardType: ReinforcementRewardType | null;
      rewardValue: Prisma.Decimal | null;
      stages: ReturnType<typeof stageRecord>[];
    }>,
  ) {
    const now = new Date('2026-04-28T10:00:00.000Z');
    return {
      id: 'template-1',
      schoolId: 'school-1',
      academicYearId: null,
      termId: null,
      nameEn: overrides?.nameEn ?? 'Template',
      nameAr: overrides?.nameAr ?? null,
      descriptionEn: null,
      descriptionAr: null,
      source: overrides?.source ?? ReinforcementSource.TEACHER,
      rewardType: overrides?.rewardType ?? ReinforcementRewardType.XP,
      rewardValue: overrides?.rewardValue ?? new Prisma.Decimal(10),
      rewardLabelEn: null,
      rewardLabelAr: null,
      metadata: null,
      createdById: 'user-1',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      stages:
        overrides?.stages ??
        [
          stageRecord({
            sortOrder: 1,
            titleEn: 'Template',
            titleAr: null,
            proofType: ReinforcementProofType.NONE,
            requiresApproval: true,
          }),
        ],
    } as never;
  }

  function stageRecord(stage: {
    sortOrder: number;
    titleEn: string | null;
    titleAr: string | null;
    proofType: ReinforcementProofType;
    requiresApproval: boolean;
  }) {
    const now = new Date('2026-04-28T10:00:00.000Z');
    return {
      id: `stage-${stage.sortOrder}`,
      descriptionEn: null,
      descriptionAr: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...stage,
    };
  }
});
