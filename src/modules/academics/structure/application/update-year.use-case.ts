import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { UpdateAcademicYearDto } from '../dto/academic-year.dto';
import { AcademicYearResponseDto } from '../dto/structure-response.dto';
import { AcademicYearOverlapException } from '../domain/structure.exceptions';
import {
  parseDateOnly,
  resolveUpdateLocalizedNames,
} from '../domain/structure-inputs';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { presentAcademicYear } from '../presenters/structure.presenter';

@Injectable()
export class UpdateYearUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
  ) {}

  async execute(
    yearId: string,
    command: UpdateAcademicYearDto,
  ): Promise<AcademicYearResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await this.academicYearsRepository.findYearById(yearId);
    if (!existing) {
      throw new NotFoundDomainException('Academic year not found', { yearId });
    }

    const { nameAr, nameEn } = resolveUpdateLocalizedNames(existing, command);
    const startDate = command.startDate
      ? parseDateOnly(command.startDate)
      : existing.startDate;
    const endDate = command.endDate
      ? parseDateOnly(command.endDate)
      : existing.endDate;

    if (startDate > endDate) {
      throw new ValidationDomainException('startDate must be on or before endDate', {
        fields: ['startDate', 'endDate'],
      });
    }

    const overlappingYear = await this.academicYearsRepository.findOverlappingYear({
      startDate,
      endDate,
      excludeYearId: yearId,
    });
    if (overlappingYear) {
      throw new AcademicYearOverlapException({
        schoolId: scope.schoolId,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        conflictingYearId: overlappingYear.id,
      });
    }

    const data = {
      nameAr,
      nameEn,
      startDate,
      endDate,
      ...(typeof command.isActive === 'boolean'
        ? { isActive: command.isActive }
        : {}),
    };

    const updated = command.isActive === true
      ? await this.academicYearsRepository.updateYearAndDeactivateOthers(
          yearId,
          data,
        )
      : await this.academicYearsRepository.updateYear(yearId, data);

    return presentAcademicYear(updated);
  }
}
