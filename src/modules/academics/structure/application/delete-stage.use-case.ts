import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteStructureNodeResponseDto } from '../dto/structure-response.dto';
import { StructureChildExistsException } from '../domain/structure.exceptions';
import { StructureRepository } from '../infrastructure/structure.repository';

@Injectable()
export class DeleteStageUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(stageId: string): Promise<DeleteStructureNodeResponseDto> {
    requireAcademicsScope();

    const result = await this.structureRepository.softDeleteStage(stageId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Stage not found', { stageId });
    }

    if (result.status === 'has_children') {
      throw new StructureChildExistsException({
        nodeType: 'stage',
        nodeId: stageId,
        childType: result.childType,
        childCount: result.childCount,
      });
    }

    return { ok: true };
  }
}
