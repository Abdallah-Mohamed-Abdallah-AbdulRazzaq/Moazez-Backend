import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { CreateGradeDto } from '../dto/grade.dto';
import { GradeResponseDto } from '../dto/structure-response.dto';
import {
  resolveCreateLocalizedNames,
  resolveSortOrder,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentGrade } from '../presenters/structure.presenter';

@Injectable()
export class CreateGradeUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(command: CreateGradeDto): Promise<GradeResponseDto> {
    const scope = requireAcademicsScope();
    const stage = await this.structureRepository.findStageById(command.stageId);
    if (!stage) {
      throw new NotFoundDomainException('Stage not found', {
        stageId: command.stageId,
      });
    }

    const { nameAr, nameEn } = resolveCreateLocalizedNames(command);
    const grade = await this.structureRepository.createGrade({
      schoolId: scope.schoolId,
      stageId: stage.id,
      nameAr,
      nameEn,
      sortOrder: resolveSortOrder(command, 0) ?? 0,
      capacity: command.capacity,
    });

    return presentGrade(grade);
  }
}
