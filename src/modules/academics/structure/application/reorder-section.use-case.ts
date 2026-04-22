import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ReorderNodeDto } from '../dto/reorder-node.dto';
import { SectionResponseDto } from '../dto/structure-response.dto';
import { resolveSortOrder } from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentSection } from '../presenters/structure.presenter';

@Injectable()
export class ReorderSectionUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    sectionId: string,
    command: ReorderNodeDto,
  ): Promise<SectionResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findSectionById(sectionId);
    if (!existing) {
      throw new NotFoundDomainException('Section not found', { sectionId });
    }

    const sortOrder = resolveSortOrder(command);
    if (sortOrder === undefined) {
      throw new ValidationDomainException('sortOrder is required', {
        fields: ['sortOrder'],
      });
    }

    const updated = await this.structureRepository.reorderSection(
      sectionId,
      sortOrder,
    );
    return presentSection(updated);
  }
}
