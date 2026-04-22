import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { CreateAcademicYearDto } from '../dto/academic-year.dto';
import { AcademicYearResponseDto } from '../dto/structure-response.dto';
import {
  AcademicYearOverlapException,
} from '../domain/structure.exceptions';
import {
  parseDateOnly,
  resolveCreateLocalizedNames,
} from '../domain/structure-inputs';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { presentAcademicYear } from '../presenters/structure.presenter';

@Injectable()
export class CreateYearUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
  ) {}

  async execute(command: CreateAcademicYearDto): Promise<AcademicYearResponseDto> {
    const scope = requireAcademicsScope();
    const { nameAr, nameEn } = resolveCreateLocalizedNames(command);
    const startDate = parseDateOnly(command.startDate);
    const endDate = parseDateOnly(command.endDate);

    if (startDate > endDate) {
      throw new ValidationDomainException('startDate must be on or before endDate', {
        fields: ['startDate', 'endDate'],
      });
    }

    const overlappingYear = await this.academicYearsRepository.findOverlappingYear({
      startDate,
      endDate,
    });
    if (overlappingYear) {
      throw new AcademicYearOverlapException({
        schoolId: scope.schoolId,
        startDate: command.startDate,
        endDate: command.endDate,
        conflictingYearId: overlappingYear.id,
      });
    }

    const data = {
      schoolId: scope.schoolId,
      nameAr,
      nameEn,
      startDate,
      endDate,
      isActive: command.isActive ?? false,
    };

    const created = command.isActive
      ? await this.academicYearsRepository.createYearAndDeactivateOthers(data)
      : await this.academicYearsRepository.createYear(data);

    return presentAcademicYear(created);
  }
}
