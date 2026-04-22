import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ListTermsQueryDto } from '../dto/list-terms-query.dto';
import { TermsListResponseDto } from '../dto/structure-response.dto';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { TermsRepository } from '../infrastructure/terms.repository';
import { presentTerms } from '../presenters/structure.presenter';

@Injectable()
export class ListTermsUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
    private readonly termsRepository: TermsRepository,
  ) {}

  async execute(query: ListTermsQueryDto): Promise<TermsListResponseDto> {
    requireAcademicsScope();

    const academicYearId = query.academicYearId ?? query.yearId;
    if (academicYearId) {
      const year = await this.academicYearsRepository.findYearById(academicYearId);
      if (!year) {
        throw new NotFoundDomainException('Academic year not found', {
          yearId: academicYearId,
        });
      }
    }

    const terms = await this.termsRepository.listTerms(academicYearId);
    return presentTerms(terms);
  }
}
