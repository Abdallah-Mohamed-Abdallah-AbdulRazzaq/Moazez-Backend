import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { buildGradesGradebookModel } from '../../shared/application/grades-read-model.builder';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import {
  GetGradebookQueryDto,
  GradebookResponseDto,
} from '../dto/get-gradebook-query.dto';
import { presentGradebook } from '../presenters/gradebook.presenter';

@Injectable()
export class GetGradesGradebookUseCase {
  constructor(
    private readonly gradesReadModelRepository: GradesReadModelRepository,
  ) {}

  async execute(query: GetGradebookQueryDto): Promise<GradebookResponseDto> {
    const scope = requireGradesScope();
    const gradebook = await buildGradesGradebookModel({
      repository: this.gradesReadModelRepository,
      schoolId: scope.schoolId,
      query,
      includeVirtualMissing: query.includeVirtualMissing ?? true,
    });

    return presentGradebook(gradebook);
  }
}
