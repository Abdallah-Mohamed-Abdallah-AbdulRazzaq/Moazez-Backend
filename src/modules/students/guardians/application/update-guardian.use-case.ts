import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GuardianResponseDto, UpdateGuardianDto } from '../dto/guardian.dto';
import {
  resolveGuardianEmail,
  resolveGuardianName,
  resolveGuardianPhone,
  resolveGuardianRelation,
} from '../domain/guardian.inputs';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardian } from '../presenters/guardian.presenter';

function hasGuardianNamePatch(command: UpdateGuardianDto): boolean {
  return [command.full_name, command.first_name, command.last_name].some(
    (value) => value !== undefined,
  );
}

@Injectable()
export class UpdateGuardianUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(
    guardianId: string,
    command: UpdateGuardianDto,
  ): Promise<GuardianResponseDto> {
    const existingGuardian = await this.guardiansRepository.findGuardianById(
      guardianId,
    );
    if (!existingGuardian) {
      throw new NotFoundDomainException('Guardian not found', { guardianId });
    }

    const data: Record<string, unknown> = {};

    if (hasGuardianNamePatch(command)) {
      const name = resolveGuardianName(command, {
        firstName: existingGuardian.firstName,
        lastName: existingGuardian.lastName,
      });
      data.firstName = name.firstName;
      data.lastName = name.lastName;
    }

    if (command.phone_primary !== undefined) {
      data.phone = resolveGuardianPhone(
        command.phone_primary,
        existingGuardian.phone,
      );
    }

    if (command.email !== undefined) {
      data.email = resolveGuardianEmail(command.email, existingGuardian.email);
    }

    if (command.relation !== undefined) {
      data.relation = resolveGuardianRelation(
        command.relation,
        existingGuardian.relation,
      );
    }

    if (command.is_primary !== undefined) {
      data.isPrimary = command.is_primary;
    }

    if (Object.keys(data).length === 0) {
      return presentGuardian(existingGuardian);
    }

    const updatedGuardian = await this.guardiansRepository.updateGuardian(
      guardianId,
      data,
    );

    if (!updatedGuardian) {
      throw new NotFoundDomainException('Guardian not found', { guardianId });
    }

    return presentGuardian(updatedGuardian);
  }
}
