import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { UpdateSubjectDto } from '../dto/subject.dto';
import { SubjectResponseDto } from '../dto/subject-response.dto';
import {
  isUniqueConstraintError,
  SubjectCodeConflictException,
} from '../domain/subject.exceptions';
import {
  normalizeOptionalSubjectValue,
  resolveUpdateSubjectNames,
} from '../domain/subject-inputs';
import { SubjectsRepository } from '../infrastructure/subjects.repository';
import { presentSubject } from '../presenters/subjects.presenter';

@Injectable()
export class UpdateSubjectUseCase {
  constructor(private readonly subjectsRepository: SubjectsRepository) {}

  async execute(
    subjectId: string,
    command: UpdateSubjectDto,
  ): Promise<SubjectResponseDto> {
    requireAcademicsScope();

    const existing = await this.subjectsRepository.findSubjectById(subjectId);
    if (!existing) {
      throw new NotFoundDomainException('Subject not found', { subjectId });
    }

    const { nameAr, nameEn } = resolveUpdateSubjectNames(existing, command);

    try {
      const subject = await this.subjectsRepository.updateSubject(subjectId, {
        nameAr,
        nameEn,
        ...(command.code !== undefined
          ? { code: normalizeOptionalSubjectValue(command.code) }
          : {}),
        ...(command.color !== undefined
          ? { color: normalizeOptionalSubjectValue(command.color) }
          : {}),
        ...(typeof command.isActive === 'boolean'
          ? { isActive: command.isActive }
          : {}),
      });

      return presentSubject(subject);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new SubjectCodeConflictException();
      }

      throw error;
    }
  }
}
