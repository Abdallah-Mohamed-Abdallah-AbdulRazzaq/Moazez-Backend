import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ClassroomResponseDto } from '../dto/structure-response.dto';
import { CreateClassroomDto } from '../dto/classroom.dto';
import {
  resolveCreateLocalizedNames,
  resolveSortOrder,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentClassroom } from '../presenters/structure.presenter';

@Injectable()
export class CreateClassroomUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(command: CreateClassroomDto): Promise<ClassroomResponseDto> {
    const scope = requireAcademicsScope();
    const section = await this.structureRepository.findSectionById(command.sectionId);
    if (!section) {
      throw new NotFoundDomainException('Section not found', {
        sectionId: command.sectionId,
      });
    }

    const { nameAr, nameEn } = resolveCreateLocalizedNames(command);
    const classroom = await this.structureRepository.createClassroom({
      schoolId: scope.schoolId,
      sectionId: section.id,
      nameAr,
      nameEn,
      sortOrder: resolveSortOrder(command, 0) ?? 0,
      capacity: command.capacity,
    });

    return presentClassroom(classroom);
  }
}
