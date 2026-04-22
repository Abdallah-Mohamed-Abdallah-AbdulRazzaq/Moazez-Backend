import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GuardianResponseDto,
  UpdateStudentGuardianLinkDto,
} from '../dto/guardian.dto';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardianLink } from '../presenters/guardian.presenter';

@Injectable()
export class UpdateStudentGuardianLinkUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(
    studentId: string,
    guardianId: string,
    command: UpdateStudentGuardianLinkDto,
  ): Promise<GuardianResponseDto> {
    const [student, guardian] = await Promise.all([
      this.guardiansRepository.findStudentById(studentId),
      this.guardiansRepository.findGuardianById(guardianId),
    ]);

    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    if (!guardian) {
      throw new NotFoundDomainException('Guardian not found', { guardianId });
    }

    const updatedLink = await this.guardiansRepository.updateStudentGuardianLink(
      {
        studentId,
        guardianId,
        isPrimary: command.is_primary,
      },
    );

    if (!updatedLink) {
      throw new NotFoundDomainException('Student guardian link not found', {
        studentId,
        guardianId,
      });
    }

    return presentGuardianLink(updatedLink);
  }
}
