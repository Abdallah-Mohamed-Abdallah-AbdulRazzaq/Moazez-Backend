import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GuardiansRepository } from '../infrastructure/guardians.repository';

@Injectable()
export class UnlinkGuardianFromStudentUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(studentId: string, guardianId: string): Promise<void> {
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

    const unlinked = await this.guardiansRepository.unlinkGuardianFromStudent({
      studentId,
      guardianId,
    });

    if (!unlinked) {
      throw new NotFoundDomainException('Student guardian link not found', {
        studentId,
        guardianId,
      });
    }
  }
}
