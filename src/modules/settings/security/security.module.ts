import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetSecurityUseCase } from './application/get-security.use-case';
import { UpdateSecurityUseCase } from './application/update-security.use-case';
import { SecurityController } from './controller/security.controller';
import { SecurityRepository } from './infrastructure/security.repository';

@Module({
  imports: [AuthModule],
  controllers: [SecurityController],
  providers: [SecurityRepository, GetSecurityUseCase, UpdateSecurityUseCase],
})
export class SecurityModule {}
