import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { SubjectsListResponseDto } from '../dto/subject-response.dto';
import { SubjectsRepository } from '../infrastructure/subjects.repository';
import { presentSubjects } from '../presenters/subjects.presenter';

@Injectable()
export class ListSubjectsUseCase {
  constructor(private readonly subjectsRepository: SubjectsRepository) {}

  async execute(): Promise<SubjectsListResponseDto> {
    requireAcademicsScope();

    const subjects = await this.subjectsRepository.listSubjects();
    return presentSubjects(subjects);
  }
}
