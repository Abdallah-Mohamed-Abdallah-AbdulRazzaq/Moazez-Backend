import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { SectionResponseDto } from '../dto/structure-response.dto';
import { UpdateSectionDto } from '../dto/section.dto';
import {
  resolveSortOrder,
  resolveUpdateLocalizedNames,
} from '../domain/structure-inputs';
import { StructureRepository } from '../infrastructure/structure.repository';
import { presentSection } from '../presenters/structure.presenter';

@Injectable()
export class UpdateSectionUseCase {
  constructor(private readonly structureRepository: StructureRepository) {}

  async execute(
    sectionId: string,
    command: UpdateSectionDto,
  ): Promise<SectionResponseDto> {
    requireAcademicsScope();

    const existing = await this.structureRepository.findSectionById(sectionId);
    if (!existing) {
      throw new NotFoundDomainException('Section not found', { sectionId });
    }

    if (command.gradeId) {
      const grade = await this.structureRepository.findGradeById(command.gradeId);
      if (!grade) {
        throw new NotFoundDomainException('Grade not found', {
          gradeId: command.gradeId,
        });
      }
    }

    const { nameAr, nameEn } = resolveUpdateLocalizedNames(existing, command);
    const sortOrder = resolveSortOrder(command, existing.sortOrder);

    const updated = await this.structureRepository.updateSection(sectionId, {
      ...(command.gradeId ? { gradeId: command.gradeId } : {}),
      nameAr,
      nameEn,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(command.capacity !== undefined ? { capacity: command.capacity } : {}),
    });

    return presentSection(updated);
  }
}
