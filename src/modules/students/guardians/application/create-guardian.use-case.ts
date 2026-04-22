import { Injectable } from '@nestjs/common';
import { GuardianResponseDto, CreateGuardianDto } from '../dto/guardian.dto';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  resolveGuardianEmail,
  resolveGuardianName,
  resolveGuardianPhone,
  resolveGuardianRelation,
} from '../domain/guardian.inputs';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardian } from '../presenters/guardian.presenter';

@Injectable()
export class CreateGuardianUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(command: CreateGuardianDto): Promise<GuardianResponseDto> {
    const scope = requireStudentsScope();
    const name = resolveGuardianName(command);

    const guardian = await this.guardiansRepository.createGuardian({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      userId: null,
      firstName: name.firstName,
      lastName: name.lastName,
      phone: resolveGuardianPhone(command.phone_primary),
      email: resolveGuardianEmail(command.email),
      relation: resolveGuardianRelation(command.relation),
      isPrimary: command.is_primary ?? false,
    });

    return presentGuardian(guardian);
  }
}
