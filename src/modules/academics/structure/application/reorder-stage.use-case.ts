import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ReorderNodeDto } from '../dto/reorder-node.dto';
import { StageResponseDto } from '../dto/structure-response.dto';
import { resolveSortOrder } from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentStage } from '../presenters/structure.presenter';

@Injectable()
export class ReorderStageUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    stageId: string,
    command: ReorderNodeDto,
  ): Promise<StageResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findStageById(stageId);
    if (!existing) {
      throw new NotFoundDomainException('Stage not found', { stageId });
    }

    const sortOrder = resolveSortOrder(command);
    if (sortOrder === undefined) {
      throw new ValidationDomainException('sortOrder is required', {
        fields: ['sortOrder'],
      });
    }

    const updated = await this.structureRepository.reorderStage(stageId, sortOrder);
    return presentStage(updated);
  }
}
