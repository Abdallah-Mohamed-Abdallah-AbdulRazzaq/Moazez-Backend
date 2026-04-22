import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { StructureTreeResponseDto } from '../dto/structure-response.dto';
import { TreeQueryDto } from '../dto/tree-query.dto';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';
import { StructureRepository } from '../infrastructure/structure.repository';
import { TermsRepository } from '../infrastructure/terms.repository';
import { presentStructureTree } from '../presenters/structure.presenter';

@Injectable()
export class GetTreeUseCase {
  constructor(
    private readonly academicYearsRepository: AcademicYearsRepository,
    private readonly termsRepository: TermsRepository,
    private readonly structureRepository: StructureRepository,
  ) {}

  async execute(query: TreeQueryDto): Promise<StructureTreeResponseDto> {
    requireAcademicsScope();

    const [year, term] = await Promise.all([
      this.academicYearsRepository.findYearById(query.yearId),
      this.termsRepository.findTermById(query.termId),
    ]);

    if (!year) {
      throw new NotFoundDomainException('Academic year not found', {
        yearId: query.yearId,
      });
    }

    if (!term || term.academicYearId !== year.id) {
      throw new NotFoundDomainException('Term not found', {
        termId: query.termId,
      });
    }

    const stages = await this.structureRepository.listTree();
    return presentStructureTree(year.id, term.id, stages);
  }
}
