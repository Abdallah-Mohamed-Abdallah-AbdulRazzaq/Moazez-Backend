import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteStructureNodeResponseDto } from '../dto/structure-response.dto';
import { StructureChildExistsException } from '../domain/structure.exceptions';
import { StructureRepository } from '../infrastructure/structure.repository';

@Injectable()
export class DeleteGradeUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(gradeId: string): Promise<DeleteStructureNodeResponseDto> {
    requireAcademicsScope();

    const result = await this.structureRepository.softDeleteGrade(gradeId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Grade not found', { gradeId });
    }

    if (result.status === 'has_children') {
      throw new StructureChildExistsException({
        nodeType: 'grade',
        nodeId: gradeId,
        childType: result.childType,
        childCount: result.childCount,
      });
    }

    return { ok: true };
  }
}
