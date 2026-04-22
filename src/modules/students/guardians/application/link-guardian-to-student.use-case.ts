import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  GuardianResponseDto,
  LinkGuardianToStudentDto,
} from '../dto/guardian.dto';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardianLink } from '../presenters/guardian.presenter';

@Injectable()
export class LinkGuardianToStudentUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(
    studentId: string,
    command: LinkGuardianToStudentDto,
  ): Promise<GuardianResponseDto> {
    const scope = requireStudentsScope();

    const [student, guardian] = await Promise.all([
      this.guardiansRepository.findStudentById(studentId),
      this.guardiansRepository.findGuardianById(command.guardianId),
    ]);

    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    if (!guardian) {
      throw new NotFoundDomainException('Guardian not found', {
        guardianId: command.guardianId,
      });
    }

    const link = await this.guardiansRepository.linkGuardianToStudent({
      schoolId: scope.schoolId,
      studentId,
      guardianId: command.guardianId,
      isPrimary: command.is_primary,
    });

    return presentGuardianLink(link);
  }
}
