import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AcademicContentValidationRepository } from '../infrastructure/academic-content-validation.repository';

export interface AcademicContentContext {
  schoolId: string;
  academicYearId: string;
  termId: string;
}

@Injectable()
export class AcademicContentContextValidator {
  constructor(
    private readonly validation: AcademicContentValidationRepository,
  ) {}

  async validate(context: AcademicContentContext): Promise<void> {
    const year = await this.validation.findAcademicYear(
      context.academicYearId,
      context.schoolId,
    );
    if (!year) throw new NotFoundDomainException('Academic year not found');

    const term = await this.validation.findTerm(
      context.termId,
      context.schoolId,
    );
    if (!term) throw new NotFoundDomainException('Term not found');
    if (term.academicYearId !== year.id) {
      throw new ValidationDomainException(
        'Term does not belong to academic year',
      );
    }
  }
}
