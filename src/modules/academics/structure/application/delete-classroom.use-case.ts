import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteStructureNodeResponseDto } from '../dto/structure-response.dto';
import { StructureRepository } from '../infrastructure/structure.repository';

@Injectable()
export class DeleteClassroomUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    classroomId: string,
  ): Promise<DeleteStructureNodeResponseDto> {
    requireAcademicsScope();

    const result = await this.structureRepository.softDeleteClassroom(classroomId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Classroom not found', {
        classroomId,
      });
    }

    return { ok: true };
  }
}
