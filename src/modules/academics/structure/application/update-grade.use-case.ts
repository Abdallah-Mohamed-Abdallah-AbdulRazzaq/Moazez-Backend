import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { GradeResponseDto } from '../dto/structure-response.dto';
import { UpdateGradeDto } from '../dto/grade.dto';
import {
  resolveSortOrder,
  resolveUpdateLocalizedNames,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentGrade } from '../presenters/structure.presenter';

@Injectable()
export class UpdateGradeUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    gradeId: string,
    command: UpdateGradeDto,
  ): Promise<GradeResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findGradeById(gradeId);
    if (!existing) {
      throw new NotFoundDomainException('Grade not found', { gradeId });
    }

    if (command.stageId) {
      const stage = await this.structureRepository.findStageById(command.stageId);
      if (!stage) {
        throw new NotFoundDomainException('Stage not found', {
          stageId: command.stageId,
        });
      }
    }

    const { nameAr, nameEn } = resolveUpdateLocalizedNames(existing, command);
    const sortOrder = resolveSortOrder(command, existing.sortOrder);

    const updated = await this.structureRepository.updateGrade(gradeId, {
      ...(command.stageId ? { stageId: command.stageId } : {}),
      nameAr,
      nameEn,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(command.capacity !== undefined ? { capacity: command.capacity } : {}),
    });

    return presentGrade(updated);
  }
}
