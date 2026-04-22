import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GuardianResponseDto } from '../dto/guardian.dto';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardian } from '../presenters/guardian.presenter';

@Injectable()
export class GetGuardianUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(guardianId: string): Promise<GuardianResponseDto> {
    const guardian = await this.guardiansRepository.findGuardianById(guardianId);
    if (!guardian) {
      throw new NotFoundDomainException('Guardian not found', { guardianId });
    }

    return presentGuardian(guardian);
  }
}
