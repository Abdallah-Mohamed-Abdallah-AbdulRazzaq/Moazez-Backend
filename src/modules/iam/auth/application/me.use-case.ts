import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../../common/context/request-context';
import { TokenInvalidException } from '../domain/auth.exceptions';
import type { MeResponseDto } from '../dto/me-response.dto';
import { AuthRepository } from '../infrastructure/auth.repository';
import { pickActiveMembership } from './membership.mapper';

@Injectable()
export class MeUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(): Promise<MeResponseDto> {
    const ctx = getRequestContext();
    if (!ctx?.actor) {
      throw new TokenInvalidException();
    }

    const user = await this.authRepository.findUserById(ctx.actor.id);
    if (!user) {
      throw new TokenInvalidException();
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      status: user.status,
      activeMembership: pickActiveMembership(user),
    };
  }
}
