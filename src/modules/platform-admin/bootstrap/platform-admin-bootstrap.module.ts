import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PasswordService } from '../../iam/auth/domain/password.service';
import { BootstrapInitialPlatformAdministratorUseCase } from './bootstrap-initial-platform-administrator.use-case';
import { validatePlatformAdminBootstrapEnvironment } from './platform-admin-bootstrap.environment';
import { PlatformAdminBootstrapRepository } from './platform-admin-bootstrap.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: true,
      isGlobal: true,
      validate: validatePlatformAdminBootstrapEnvironment,
    }),
    PrismaModule,
  ],
  providers: [
    PasswordService,
    PlatformAdminBootstrapRepository,
    BootstrapInitialPlatformAdministratorUseCase,
  ],
  exports: [BootstrapInitialPlatformAdministratorUseCase],
})
export class PlatformAdminBootstrapModule {}
