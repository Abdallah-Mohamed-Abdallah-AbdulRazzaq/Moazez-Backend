import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { CreateSectionDto } from '../dto/section.dto';
import { SectionResponseDto } from '../dto/structure-response.dto';
import {
  resolveCreateLocalizedNames,
  resolveSortOrder,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentSection } from '../presenters/structure.presenter';

@Injectable()
export class CreateSectionUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(command: CreateSectionDto): Promise<SectionResponseDto> {
    const scope = requireAcademicsScope();
    const grade = await this.structureRepository.findGradeById(command.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: command.gradeId,
      });
    }

    const { nameAr, nameEn } = resolveCreateLocalizedNames(command);
    const section = await this.structureRepository.createSection({
      schoolId: scope.schoolId,
      gradeId: grade.id,
      nameAr,
      nameEn,
      sortOrder: resolveSortOrder(command, 0) ?? 0,
      capacity: command.capacity,
    });

    return presentSection(section);
  }
}
