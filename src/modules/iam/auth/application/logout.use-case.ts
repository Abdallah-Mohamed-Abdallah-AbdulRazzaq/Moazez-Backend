import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../infrastructure/auth.repository';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(sessionId: string): Promise<void> {
    const session = await this.authRepository.findSessionById(sessionId);
    if (!session || session.revokedAt) return;
    await this.authRepository.revokeSession(session.id);
  }
}
