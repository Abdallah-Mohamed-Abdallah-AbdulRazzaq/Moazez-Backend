import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GuardianWithStudentsResponseDto } from '../dto/guardian.dto';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardianProfile } from '../presenters/guardian.presenter';

@Injectable()
export class GetGuardianStudentsUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(guardianId: string): Promise<GuardianWithStudentsResponseDto> {
    const guardian = await this.guardiansRepository.findGuardianProfileById(
      guardianId,
    );
    if (!guardian) {
      throw new NotFoundDomainException('Guardian not found', { guardianId });
    }

    return presentGuardianProfile(guardian);
  }
}
