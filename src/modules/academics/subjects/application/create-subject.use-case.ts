import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { CreateSubjectDto } from '../dto/subject.dto';
import { SubjectResponseDto } from '../dto/subject-response.dto';
import {
  isUniqueConstraintError,
  SubjectCodeConflictException,
} from '../domain/subject.exceptions';
import {
  normalizeOptionalSubjectValue,
  resolveCreateSubjectNames,
} from '../domain/subject-inputs';
import { SubjectsRepository } from '../infrastructure/subjects.repository';
import { presentSubject } from '../presenters/subjects.presenter';

@Injectable()
export class CreateSubjectUseCase {
  constructor(private readonly subjectsRepository: SubjectsRepository) {}

  async execute(command: CreateSubjectDto): Promise<SubjectResponseDto> {
    const scope = requireAcademicsScope();
    const { nameAr, nameEn } = resolveCreateSubjectNames(command);

    try {
      const subject = await this.subjectsRepository.createSubject({
        schoolId: scope.schoolId,
        nameAr,
        nameEn,
        code: normalizeOptionalSubjectValue(command.code),
        color: normalizeOptionalSubjectValue(command.color),
        isActive: command.isActive ?? true,
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
