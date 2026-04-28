import {
  ReinforcementTaskTemplateResponseDto,
  ReinforcementTaskTemplatesListResponseDto,
} from '../dto/reinforcement-template.dto';
import {
  presentDecimal,
  presentEnum,
} from '../../tasks/presenters/reinforcement-task.presenter';
import { ReinforcementTaskTemplateRecord } from '../infrastructure/reinforcement-templates.repository';

export function presentReinforcementTaskTemplate(
  template: ReinforcementTaskTemplateRecord,
): ReinforcementTaskTemplateResponseDto {
  return {
    id: template.id,
    nameEn: template.nameEn,
    nameAr: template.nameAr,
    descriptionEn: template.descriptionEn,
    descriptionAr: template.descriptionAr,
    source: presentEnum(template.source),
    reward: {
      type: template.rewardType ? presentEnum(template.rewardType) : null,
      value: presentDecimal(template.rewardValue),
      labelEn: template.rewardLabelEn,
      labelAr: template.rewardLabelAr,
    },
    stages: template.stages.map((stage) => ({
      id: stage.id,
      sortOrder: stage.sortOrder,
      titleEn: stage.titleEn,
      titleAr: stage.titleAr,
      descriptionEn: stage.descriptionEn,
      descriptionAr: stage.descriptionAr,
      proofType: presentEnum(stage.proofType),
      requiresApproval: stage.requiresApproval,
    })),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export function presentReinforcementTaskTemplates(
  templates: ReinforcementTaskTemplateRecord[],
): ReinforcementTaskTemplatesListResponseDto {
  return {
    items: templates.map((template) =>
      presentReinforcementTaskTemplate(template),
    ),
  };
}
