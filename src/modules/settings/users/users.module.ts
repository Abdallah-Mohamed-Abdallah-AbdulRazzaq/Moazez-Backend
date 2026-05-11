import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { LoginIdentityModule } from '../login-identity/login-identity.module';
import { BulkCredentialGenerateUseCase } from './credentials/application/bulk-credential-generate.use-case';
import { BulkCredentialPreviewUseCase } from './credentials/application/bulk-credential-preview.use-case';
import { GenerateUserCredentialUseCase } from './credentials/application/generate-user-credential.use-case';
import { ListCredentialStatusUseCase } from './credentials/application/list-credential-status.use-case';
import { SetUserCredentialUseCase } from './credentials/application/set-user-credential.use-case';
import {
  UserCredentialsCollectionController,
  UserCredentialsMemberController,
} from './credentials/controller/user-credentials.controller';
import { UserCredentialsRepository } from './credentials/infrastructure/user-credentials.repository';
import { CreateUserUseCase } from './application/create-user.use-case';
import { InviteUserUseCase } from './application/invite-user.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { ResendInviteUseCase } from './application/resend-invite.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import { UpdateUserStatusUseCase } from './application/update-user-status.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { UserLoginIdentityResolver } from './application/user-login-identity.resolver';
import { UsersController } from './controller/users.controller';
import { UsersRepository } from './infrastructure/users.repository';

@Module({
  imports: [AuthModule, LoginIdentityModule],
  controllers: [
    UsersController,
    UserCredentialsCollectionController,
    UserCredentialsMemberController,
  ],
  providers: [
    UsersRepository,
    UserCredentialsRepository,
    ListUsersUseCase,
    InviteUserUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    UpdateUserStatusUseCase,
    ResendInviteUseCase,
    ResetPasswordUseCase,
    UserLoginIdentityResolver,
    ListCredentialStatusUseCase,
    GenerateUserCredentialUseCase,
    SetUserCredentialUseCase,
    BulkCredentialPreviewUseCase,
    BulkCredentialGenerateUseCase,
  ],
  exports: [
    UsersRepository,
    UserCredentialsRepository,
    UserLoginIdentityResolver,
    GenerateUserCredentialUseCase,
  ],
})
export class UsersModule {}
