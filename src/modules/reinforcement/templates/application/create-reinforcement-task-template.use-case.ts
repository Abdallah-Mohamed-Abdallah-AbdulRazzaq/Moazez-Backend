import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import {
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  normalizeNullableText,
  normalizeReinforcementSource,
  normalizeRewardType,
} from '../../tasks/domain/reinforcement-task-domain';
import { CreateReinforcementTaskTemplateDto } from '../dto/reinforcement-template.dto';
import {
  assertTemplateNamePresent,
  isUniqueConstraintError,
  normalizeTemplateStages,
  ReinforcementTemplateConflictException,
} from '../domain/reinforcement-template-domain';
import { ReinforcementTemplatesRepository } from '../infrastructure/reinforcement-templates.repository';
import { presentReinforcementTaskTemplate } from '../presenters/reinforcement-template.presenter';

@Injectable()
export class CreateReinforcementTaskTemplateUseCase {
  constructor(
    private readonly reinforcementTemplatesRepository: ReinforcementTemplatesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateReinforcementTaskTemplateDto) {
    const scope = requireReinforcementScope();
    assertTemplateNamePresent(command);

    const nameEn = normalizeNullableText(command.nameEn);
    const nameAr = normalizeNullableText(command.nameAr);
    const stages = normalizeTemplateStages({
      stages: command.stages,
      templateNameEn: nameEn,
      templateNameAr: nameAr,
    });

    try {
      const template =
        await this.reinforcementTemplatesRepository.createTemplateWithStages({
          schoolId: scope.schoolId,
          template: {
            nameEn,
            nameAr,
            descriptionEn: normalizeNullableText(command.descriptionEn),
            descriptionAr: normalizeNullableText(command.descriptionAr),
            source: normalizeReinforcementSource(command.source),
            rewardType: normalizeRewardType(command.rewardType),
            rewardValue: toDecimal(command.rewardValue),
            rewardLabelEn: normalizeNullableText(command.rewardLabelEn),
            rewardLabelAr: normalizeNullableText(command.rewardLabelAr),
            metadata: toJsonInput(command.metadata),
            createdById: scope.actorId,
          },
          stages,
        });

      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'reinforcement',
        action: 'reinforcement.template.create',
        resourceType: 'reinforcement_task_template',
        resourceId: template.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          stageCount: template.stages.length,
          source: template.source,
          rewardType: template.rewardType,
          nameEn: template.nameEn,
          nameAr: template.nameAr,
        },
      });

      return presentReinforcementTaskTemplate(template);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ReinforcementTemplateConflictException({
          nameEn,
          nameAr,
        });
      }
      throw error;
    }
  }
}

function toDecimal(value: number | string | null | undefined): Prisma.Decimal | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new ValidationDomainException('Reward value is invalid', {
      field: 'rewardValue',
      value,
    });
  }

  return new Prisma.Decimal(numberValue);
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
