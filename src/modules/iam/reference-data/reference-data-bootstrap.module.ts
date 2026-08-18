import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { validatePlatformAdminBootstrapEnvironment } from '../../platform-admin/bootstrap/platform-admin-bootstrap.environment';
import { BootstrapAuthorizationReferenceDataUseCase } from './application/bootstrap-authorization-reference-data.use-case';
import { AuthorizationReferenceDataRepository } from './infrastructure/authorization-reference-data.repository';

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
    AuthorizationReferenceDataRepository,
    BootstrapAuthorizationReferenceDataUseCase,
  ],
  exports: [BootstrapAuthorizationReferenceDataUseCase],
})
export class ReferenceDataBootstrapModule {}
