import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { StageResponseDto } from '../dto/structure-response.dto';
import { CreateStageDto } from '../dto/stage.dto';
import {
  resolveCreateLocalizedNames,
  resolveSortOrder,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentStage } from '../presenters/structure.presenter';

@Injectable()
export class CreateStageUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(command: CreateStageDto): Promise<StageResponseDto> {
    const scope = requireAcademicsScope();
    const { nameAr, nameEn } = resolveCreateLocalizedNames(command);

    const stage = await this.structureRepository.createStage({
      schoolId: scope.schoolId,
      nameAr,
      nameEn,
      sortOrder: resolveSortOrder(command, 0) ?? 0,
    });

    return presentStage(stage);
  }
}
