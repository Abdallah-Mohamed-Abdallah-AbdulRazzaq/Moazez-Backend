import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ReorderNodeDto } from '../dto/reorder-node.dto';
import { GradeResponseDto } from '../dto/structure-response.dto';
import { resolveSortOrder } from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentGrade } from '../presenters/structure.presenter';

@Injectable()
export class ReorderGradeUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    gradeId: string,
    command: ReorderNodeDto,
  ): Promise<GradeResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findGradeById(gradeId);
    if (!existing) {
      throw new NotFoundDomainException('Grade not found', { gradeId });
    }

    const sortOrder = resolveSortOrder(command);
    if (sortOrder === undefined) {
      throw new ValidationDomainException('sortOrder is required', {
        fields: ['sortOrder'],
      });
    }

    const updated = await this.structureRepository.reorderGrade(gradeId, sortOrder);
    return presentGrade(updated);
  }
}
