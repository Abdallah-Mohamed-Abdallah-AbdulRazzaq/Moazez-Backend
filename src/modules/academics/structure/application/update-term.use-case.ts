import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { TermResponseDto } from '../dto/structure-response.dto';
import { UpdateTermDto } from '../dto/term.dto';
import { TermOutsideAcademicYearException } from '../domain/structure.exceptions';
import {
  parseDateOnly,
  resolveTermIsActive,
  resolveUpdateLocalizedNames,
} from '../domain/structure-inputs';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { TermsRepository } from '../infrastructure/terms.repository';
import { presentTerm } from '../presenters/structure.presenter';

@Injectable()
export class UpdateTermUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
    private readonly termsRepository: TermsRepository,
  ) {}

  async execute(
    termId: string,
    command: UpdateTermDto,
  ): Promise<TermResponseDto> {
    requireAcademicsScope();

    const existing = await this.termsRepository.findTermById(termId);
    if (!existing) {
      throw new NotFoundDomainException('Term not found', { termId });
    }

    const targetAcademicYearId =
      command.academicYearId ?? command.yearId ?? existing.academicYearId;
    const academicYear = await this.academicYearsRepository.findYearById(
      targetAcademicYearId,
    );
    if (!academicYear) {
      throw new NotFoundDomainException('Academic year not found', {
        yearId: targetAcademicYearId,
      });
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

    if (
      startDate < academicYear.startDate ||
      endDate > academicYear.endDate
    ) {
      throw new TermOutsideAcademicYearException({
        academicYearId: academicYear.id,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        yearStartDate: academicYear.startDate.toISOString().slice(0, 10),
        yearEndDate: academicYear.endDate.toISOString().slice(0, 10),
      });
    }

    const updated = await this.termsRepository.updateTerm(termId, {
      academicYearId: academicYear.id,
      nameAr,
      nameEn,
      startDate,
      endDate,
      ...(command.isActive !== undefined || command.status !== undefined
        ? { isActive: resolveTermIsActive(command, existing.isActive) }
        : {}),
    });

    return presentTerm(updated);
  }
}
