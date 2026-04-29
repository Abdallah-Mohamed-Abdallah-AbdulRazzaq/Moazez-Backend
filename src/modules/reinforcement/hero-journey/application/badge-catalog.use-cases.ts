import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { HeroBadgeInUseException } from '../domain/hero-journey-domain';
import {
  CreateHeroBadgeDto,
  DeleteHeroResourceResponseDto,
  ListHeroBadgesQueryDto,
  UpdateHeroBadgeDto,
} from '../dto/hero-journey.dto';
import { HeroJourneyRepository } from '../infrastructure/hero-journey.repository';
import {
  presentHeroBadge,
  presentHeroBadges,
} from '../presenters/hero-journey.presenter';
import {
  buildBadgeAuditEntry,
  buildCreateBadgeData,
  buildUpdateBadgeData,
  normalizeBadgeListFilters,
  translateBadgeDuplicate,
  validateFileReference,
} from './hero-journey-use-case.helpers';

@Injectable()
export class ListHeroBadgesUseCase {
  constructor(private readonly heroJourneyRepository: HeroJourneyRepository) {}

  async execute(query: ListHeroBadgesQueryDto) {
    requireReinforcementScope();
    const badges = await this.heroJourneyRepository.listBadges(
      normalizeBadgeListFilters(query),
    );

    return presentHeroBadges(badges);
  }
}

@Injectable()
export class GetHeroBadgeUseCase {
  constructor(private readonly heroJourneyRepository: HeroJourneyRepository) {}

  async execute(badgeId: string) {
    requireReinforcementScope();
    const badge = await this.heroJourneyRepository.findBadgeById(badgeId);
    if (!badge) {
      throw new NotFoundDomainException('Hero badge not found', { badgeId });
    }

    return presentHeroBadge(badge);
  }
}

@Injectable()
export class CreateHeroBadgeUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateHeroBadgeDto) {
    const scope = requireReinforcementScope();
    await validateFileReference(this.heroJourneyRepository, command.fileId);

    try {
      const badge = await this.heroJourneyRepository.createBadge(
        buildCreateBadgeData({ scope, command }),
      );
      await this.authRepository.createAuditLog(
        buildBadgeAuditEntry({
          scope,
          action: 'reinforcement.hero.badge.create',
          badge,
        }),
      );

      return presentHeroBadge(badge);
    } catch (error) {
      translateBadgeDuplicate(error);
    }
  }
}

@Injectable()
export class UpdateHeroBadgeUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(badgeId: string, command: UpdateHeroBadgeDto) {
    const scope = requireReinforcementScope();
    const existing = await this.heroJourneyRepository.findBadgeById(badgeId);
    if (!existing) {
      throw new NotFoundDomainException('Hero badge not found', { badgeId });
    }

    await validateFileReference(this.heroJourneyRepository, command.fileId);

    try {
      const badge = await this.heroJourneyRepository.updateBadge(
        existing.id,
        buildUpdateBadgeData({ existing, command }),
      );
      await this.authRepository.createAuditLog(
        buildBadgeAuditEntry({
          scope,
          action: 'reinforcement.hero.badge.update',
          badge,
          before: existing,
        }),
      );

      return presentHeroBadge(badge);
    } catch (error) {
      translateBadgeDuplicate(error);
    }
  }
}

@Injectable()
export class DeleteHeroBadgeUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(badgeId: string): Promise<DeleteHeroResourceResponseDto> {
    const scope = requireReinforcementScope();
    const existing = await this.heroJourneyRepository.findBadgeById(badgeId);
    if (!existing) {
      throw new NotFoundDomainException('Hero badge not found', { badgeId });
    }

    const activeMissionCount =
      await this.heroJourneyRepository.countActiveMissionsUsingBadge(
        existing.id,
      );
    if (activeMissionCount > 0) {
      throw new HeroBadgeInUseException({ badgeId, activeMissionCount });
    }

    const deleted = await this.heroJourneyRepository.softDeleteBadge(existing.id);
    await this.authRepository.createAuditLog(
      buildBadgeAuditEntry({
        scope,
        action: 'reinforcement.hero.badge.delete',
        badge: deleted,
        before: existing,
      }),
    );

    return { ok: true };
  }
}
