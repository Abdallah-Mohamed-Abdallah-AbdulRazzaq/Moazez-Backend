import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateUserUseCase } from './application/create-user.use-case';
import { InviteUserUseCase } from './application/invite-user.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { ResendInviteUseCase } from './application/resend-invite.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import { UpdateUserStatusUseCase } from './application/update-user-status.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { UsersController } from './controller/users.controller';
import { UsersRepository } from './infrastructure/users.repository';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    ListUsersUseCase,
    InviteUserUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    UpdateUserStatusUseCase,
    ResendInviteUseCase,
    ResetPasswordUseCase,
  ],
})
export class UsersModule {}
