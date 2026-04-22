import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { StageResponseDto } from '../dto/structure-response.dto';
import { UpdateStageDto } from '../dto/stage.dto';
import {
  resolveSortOrder,
  resolveUpdateLocalizedNames,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentStage } from '../presenters/structure.presenter';

@Injectable()
export class UpdateStageUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    stageId: string,
    command: UpdateStageDto,
  ): Promise<StageResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findStageById(stageId);
    if (!existing) {
      throw new NotFoundDomainException('Stage not found', { stageId });
    }

    const { nameAr, nameEn } = resolveUpdateLocalizedNames(existing, command);
    const sortOrder = resolveSortOrder(command, existing.sortOrder);

    const updated = await this.structureRepository.updateStage(stageId, {
      nameAr,
      nameEn,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    });

    return presentStage(updated);
  }
}
