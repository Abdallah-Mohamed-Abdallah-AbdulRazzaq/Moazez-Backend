import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { CreateTermDto } from '../dto/term.dto';
import { TermResponseDto } from '../dto/structure-response.dto';
import { TermOutsideAcademicYearException } from '../domain/structure.exceptions';
import {
  parseDateOnly,
  resolveCreateLocalizedNames,
  resolveTermIsActive,
} from '../domain/structure-inputs';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { TermsRepository } from '../infrastructure/terms.repository';
import { presentTerm } from '../presenters/structure.presenter';

@Injectable()
export class CreateTermUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
    private readonly termsRepository: TermsRepository,
  ) {}

  async execute(command: CreateTermDto): Promise<TermResponseDto> {
    const scope = requireAcademicsScope();
    const academicYearId = command.academicYearId ?? command.yearId;
    const academicYear = academicYearId
      ? await this.academicYearsRepository.findYearById(academicYearId)
      : null;

    if (!academicYear) {
      throw new NotFoundDomainException('Academic year not found', {
        yearId: academicYearId,
      });
    }

    const { nameAr, nameEn } = resolveCreateLocalizedNames(command);
    const startDate = parseDateOnly(command.startDate);
    const endDate = parseDateOnly(command.endDate);

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
        startDate: command.startDate,
        endDate: command.endDate,
        yearStartDate: academicYear.startDate.toISOString().slice(0, 10),
        yearEndDate: academicYear.endDate.toISOString().slice(0, 10),
      });
    }

    const created = await this.termsRepository.createTerm({
      schoolId: scope.schoolId,
      academicYearId: academicYear.id,
      nameAr,
      nameEn,
      startDate,
      endDate,
      isActive: resolveTermIsActive(command, false) ?? false,
    });

    return presentTerm(created);
  }
}
