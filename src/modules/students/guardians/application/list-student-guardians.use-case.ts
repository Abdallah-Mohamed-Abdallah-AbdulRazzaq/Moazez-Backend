import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GuardianResponseDto } from '../dto/guardian.dto';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardianLink } from '../presenters/guardian.presenter';

@Injectable()
export class ListStudentGuardiansUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(studentId: string): Promise<GuardianResponseDto[]> {
    const student = await this.guardiansRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const guardians = await this.guardiansRepository.listStudentGuardians(
      studentId,
    );

    return guardians.map((guardian) => presentGuardianLink(guardian));
  }
}
