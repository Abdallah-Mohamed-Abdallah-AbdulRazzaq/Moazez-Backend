import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertRewardCatalogArchivable,
  assertRewardCatalogEditable,
  assertRewardCatalogPublishable,
} from '../domain/reward-catalog-domain';
import {
  ArchiveRewardCatalogItemDto,
  CreateRewardCatalogItemDto,
  ListRewardCatalogQueryDto,
  UpdateRewardCatalogItemDto,
} from '../dto/reward-catalog.dto';
import { RewardCatalogRepository } from '../infrastructure/reward-catalog.repository';
import {
  presentRewardCatalogItem,
  presentRewardCatalogList,
} from '../presenters/reward-catalog.presenter';
import {
  buildCreateCatalogItemInput,
  buildRewardCatalogAuditEntry,
  buildUpdateCatalogItemInput,
  normalizeCatalogListFilters,
  protectedPublishedCatalogChanges,
} from './reward-catalog.use-case.helpers';

@Injectable()
export class ListRewardCatalogUseCase {
  constructor(private readonly rewardCatalogRepository: RewardCatalogRepository) {}

  async execute(query: ListRewardCatalogQueryDto) {
    requireReinforcementScope();
    const filters = normalizeCatalogListFilters(query);
    const result = await this.rewardCatalogRepository.listCatalogItems(filters);

    return presentRewardCatalogList({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}

@Injectable()
export class GetRewardCatalogItemUseCase {
  constructor(private readonly rewardCatalogRepository: RewardCatalogRepository) {}

  async execute(rewardId: string) {
    requireReinforcementScope();
    const item = await this.rewardCatalogRepository.findCatalogItemById(rewardId);
    if (!item) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        rewardId,
      });
    }

    return presentRewardCatalogItem(item);
  }
}

@Injectable()
export class CreateRewardCatalogItemUseCase {
  constructor(
    private readonly rewardCatalogRepository: RewardCatalogRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateRewardCatalogItemDto) {
    const scope = requireReinforcementScope();
    const input = await buildCreateCatalogItemInput({
      scope,
      repository: this.rewardCatalogRepository,
      command,
    });

    const item = await this.rewardCatalogRepository.createCatalogItem(input);
    await this.authRepository.createAuditLog(
      buildRewardCatalogAuditEntry({
        scope,
        action: 'reinforcement.reward.catalog.create',
        item,
      }),
    );

    return presentRewardCatalogItem(item);
  }
}

@Injectable()
export class UpdateRewardCatalogItemUseCase {
  constructor(
    private readonly rewardCatalogRepository: RewardCatalogRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(rewardId: string, command: UpdateRewardCatalogItemDto) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardCatalogRepository.findCatalogItemById(rewardId);
    if (!existing) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        rewardId,
      });
    }

    assertRewardCatalogEditable({
      item: existing,
      protectedChangedFields: protectedPublishedCatalogChanges(command),
    });

    const input = await buildUpdateCatalogItemInput({
      scope,
      repository: this.rewardCatalogRepository,
      existing,
      command,
    });
    const item = await this.rewardCatalogRepository.updateCatalogItem(input);

    await this.authRepository.createAuditLog(
      buildRewardCatalogAuditEntry({
        scope,
        action: 'reinforcement.reward.catalog.update',
        item,
        before: existing,
      }),
    );

    return presentRewardCatalogItem(item);
  }
}

@Injectable()
export class PublishRewardCatalogItemUseCase {
  constructor(
    private readonly rewardCatalogRepository: RewardCatalogRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(rewardId: string) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardCatalogRepository.findCatalogItemById(rewardId);
    if (!existing) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        rewardId,
      });
    }

    assertRewardCatalogPublishable(existing);

    const item = await this.rewardCatalogRepository.publishCatalogItem({
      schoolId: scope.schoolId,
      rewardId: existing.id,
      actorId: scope.actorId,
    });
    await this.authRepository.createAuditLog(
      buildRewardCatalogAuditEntry({
        scope,
        action: 'reinforcement.reward.catalog.publish',
        item,
        before: existing,
        afterMetadata: {
          beforeStatus: existing.status,
          afterStatus: item.status,
        },
      }),
    );

    return presentRewardCatalogItem(item);
  }
}

@Injectable()
export class ArchiveRewardCatalogItemUseCase {
  constructor(
    private readonly rewardCatalogRepository: RewardCatalogRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(rewardId: string, command: ArchiveRewardCatalogItemDto) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardCatalogRepository.findCatalogItemById(rewardId);
    if (!existing) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        rewardId,
      });
    }

    assertRewardCatalogArchivable(existing);

    const item = await this.rewardCatalogRepository.archiveCatalogItem({
      schoolId: scope.schoolId,
      rewardId: existing.id,
      actorId: scope.actorId,
    });
    await this.authRepository.createAuditLog(
      buildRewardCatalogAuditEntry({
        scope,
        action: 'reinforcement.reward.catalog.archive',
        item,
        before: existing,
        afterMetadata: {
          beforeStatus: existing.status,
          afterStatus: item.status,
          reason: command.reason ?? null,
        },
      }),
    );

    return presentRewardCatalogItem(item);
  }
}
