import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { AcademicYearsListResponseDto } from '../dto/structure-response.dto';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { presentAcademicYears } from '../presenters/structure.presenter';

@Injectable()
export class ListYearsUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
  ) {}

  async execute(): Promise<AcademicYearsListResponseDto> {
    requireAcademicsScope();
    const years = await this.academicYearsRepository.listYears();
    return presentAcademicYears(years);
  }
}
