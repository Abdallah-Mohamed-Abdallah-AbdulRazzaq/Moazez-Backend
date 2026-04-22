import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ClassroomResponseDto } from '../dto/structure-response.dto';
import { UpdateClassroomDto } from '../dto/classroom.dto';
import {
  resolveSortOrder,
  resolveUpdateLocalizedNames,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentClassroom } from '../presenters/structure.presenter';

@Injectable()
export class UpdateClassroomUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    classroomId: string,
    command: UpdateClassroomDto,
  ): Promise<ClassroomResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findClassroomById(classroomId);
    if (!existing) {
      throw new NotFoundDomainException('Classroom not found', { classroomId });
    }

    if (command.sectionId) {
      const section = await this.structureRepository.findSectionById(command.sectionId);
      if (!section) {
        throw new NotFoundDomainException('Section not found', {
          sectionId: command.sectionId,
        });
      }
    }

    const { nameAr, nameEn } = resolveUpdateLocalizedNames(existing, command);
    const sortOrder = resolveSortOrder(command, existing.sortOrder);

    const updated = await this.structureRepository.updateClassroom(classroomId, {
      ...(command.sectionId ? { sectionId: command.sectionId } : {}),
      nameAr,
      nameEn,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(command.capacity !== undefined ? { capacity: command.capacity } : {}),
    });

    return presentClassroom(updated);
  }
}
