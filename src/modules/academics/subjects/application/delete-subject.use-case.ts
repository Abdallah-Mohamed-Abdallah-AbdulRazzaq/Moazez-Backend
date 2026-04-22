import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteSubjectResponseDto } from '../dto/subject-response.dto';
import { SubjectsRepository } from '../infrastructure/subjects.repository';

@Injectable()
export class DeleteSubjectUseCase {
  constructor(private readonly subjectsRepository: SubjectsRepository) {}

  async execute(subjectId: string): Promise<DeleteSubjectResponseDto> {
    requireAcademicsScope();

    const result = await this.subjectsRepository.softDeleteSubject(subjectId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Subject not found', { subjectId });
    }

    return { ok: true };
  }
}
