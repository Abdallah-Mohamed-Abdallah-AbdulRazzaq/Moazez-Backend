import { HttpStatus } from '@nestjs/common';
import { ReinforcementProofType } from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  buildDefaultStage,
  normalizeNullableText,
  normalizeProofType,
  ReinforcementStageInput,
  NormalizedReinforcementStage,
} from '../../tasks/domain/reinforcement-task-domain';

export class ReinforcementTemplateConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.policy.conflict',
      message: 'A reinforcement template with this name already exists',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function assertTemplateNamePresent(input: {
  nameEn?: string | null;
  nameAr?: string | null;
}): void {
  if (!normalizeNullableText(input.nameEn) && !normalizeNullableText(input.nameAr)) {
    throw new ValidationDomainException('Template name is required', {
      field: 'nameEn',
      aliases: ['nameAr'],
    });
  }
}

export function normalizeTemplateStages(params: {
  stages?: ReinforcementStageInput[] | null;
  templateNameEn?: string | null;
  templateNameAr?: string | null;
}): NormalizedReinforcementStage[] {
  if (!params.stages || params.stages.length === 0) {
    return [
      buildDefaultTemplateStage({
        templateNameEn: params.templateNameEn,
        templateNameAr: params.templateNameAr,
      }),
    ];
  }

  return [...params.stages]
    .map((stage, index) => ({
      stage,
      originalIndex: index,
      sortKey: stage.sortOrder ?? index + 1,
    }))
    .sort((left, right) => {
      if (left.sortKey !== right.sortKey) return left.sortKey - right.sortKey;
      return left.originalIndex - right.originalIndex;
    })
    .map(({ stage }, index) => {
      const titleEn = normalizeNullableText(stage.titleEn);
      const titleAr = normalizeNullableText(stage.titleAr);
      if (!titleEn && !titleAr) {
        throw new ValidationDomainException('Template stage title is required', {
          field: 'stages.titleEn',
          aliases: ['titleAr'],
        });
      }

      return {
        sortOrder: index + 1,
        titleEn,
        titleAr,
        descriptionEn: normalizeNullableText(stage.descriptionEn),
        descriptionAr: normalizeNullableText(stage.descriptionAr),
        proofType: normalizeProofType(
          stage.proofType,
          ReinforcementProofType.NONE,
        ),
        requiresApproval: stage.requiresApproval ?? true,
        ...(stage.metadata === undefined ? {} : { metadata: stage.metadata }),
      };
    });
}

export function buildDefaultTemplateStage(params: {
  templateNameEn?: string | null;
  templateNameAr?: string | null;
}): NormalizedReinforcementStage {
  return buildDefaultStage({
    taskTitleEn: params.templateNameEn,
    taskTitleAr: params.templateNameAr,
  });
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
  );
}
