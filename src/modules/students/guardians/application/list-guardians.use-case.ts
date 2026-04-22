import { Injectable } from '@nestjs/common';
import {
  GuardianResponseDto,
  ListGuardiansQueryDto,
} from '../dto/guardian.dto';
import { resolveGuardianRelation } from '../domain/guardian.inputs';
import { GuardiansRepository } from '../infrastructure/guardians.repository';
import { presentGuardian } from '../presenters/guardian.presenter';

@Injectable()
export class ListGuardiansUseCase {
  constructor(private readonly guardiansRepository: GuardiansRepository) {}

  async execute(query: ListGuardiansQueryDto): Promise<GuardianResponseDto[]> {
    const guardians = await this.guardiansRepository.listGuardians({
      search: query.search,
      ...(query.relation
        ? { relation: resolveGuardianRelation(query.relation) }
        : {}),
    });

    return guardians.map((guardian) => presentGuardian(guardian));
  }
}
