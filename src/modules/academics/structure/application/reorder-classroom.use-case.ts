import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ReorderNodeDto } from '../dto/reorder-node.dto';
import { ClassroomResponseDto } from '../dto/structure-response.dto';
import { resolveSortOrder } from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentClassroom } from '../presenters/structure.presenter';

@Injectable()
export class ReorderClassroomUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    classroomId: string,
    command: ReorderNodeDto,
  ): Promise<ClassroomResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findClassroomById(classroomId);
    if (!existing) {
      throw new NotFoundDomainException('Classroom not found', { classroomId });
    }

    const sortOrder = resolveSortOrder(command);
    if (sortOrder === undefined) {
      throw new ValidationDomainException('sortOrder is required', {
        fields: ['sortOrder'],
      });
    }

    const updated = await this.structureRepository.reorderClassroom(
      classroomId,
      sortOrder,
    );
    return presentClassroom(updated);
  }
}
