import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteStructureNodeResponseDto } from '../dto/structure-response.dto';
import { StructureChildExistsException } from '../domain/structure.exceptions';
import { StructureRepository } from '../infrastructure/structure.repository';

@Injectable()
export class DeleteSectionUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(sectionId: string): Promise<DeleteStructureNodeResponseDto> {
    requireAcademicsScope();

    const result = await this.structureRepository.softDeleteSection(sectionId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Section not found', { sectionId });
    }

    if (result.status === 'has_children') {
      throw new StructureChildExistsException({
        nodeType: 'section',
        nodeId: sectionId,
        childType: result.childType,
        childCount: result.childCount,
      });
    }

    return { ok: true };
  }
}
