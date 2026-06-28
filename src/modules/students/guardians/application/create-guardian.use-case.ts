import { Injectable } from '@nestjs/common';
import { GuardianResponseDto, CreateGuardianDto } from '../dto/guardian.dto';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  resolveGuardianEmail,
  resolveGuardianName,
  resolveGuardianPhone,
  resolveGuardianProfileFields,
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
    const profile = resolveGuardianProfileFields(command);

    const guardian = await this.guardiansRepository.createGuardian({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      userId: null,
      firstName: name.firstName,
      lastName: name.lastName,
      phone: resolveGuardianPhone(command.phone_primary),
      phoneSecondary: profile.phoneSecondary,
      email: resolveGuardianEmail(command.email),
      nationalId: profile.nationalId,
      jobTitle: profile.jobTitle,
      workplace: profile.workplace,
      relation: resolveGuardianRelation(command.relation),
      isPrimary: command.is_primary ?? false,
      canPickup: profile.canPickup,
      canReceiveNotifications: profile.canReceiveNotifications,
    });

    return presentGuardian(guardian);
  }
}
