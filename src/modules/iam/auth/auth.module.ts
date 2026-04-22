import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { MeUseCase } from './application/me.use-case';
import { RefreshUseCase } from './application/refresh.use-case';
import { AuthController } from './controller/auth.controller';
import { PasswordService } from './domain/password.service';
import { TokenService } from './domain/token.service';
import { AuthRepository } from './infrastructure/auth.repository';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    PasswordService,
    TokenService,
    LoginUseCase,
    RefreshUseCase,
    MeUseCase,
    LogoutUseCase,
  ],
  exports: [TokenService, AuthRepository, PasswordService],
})
export class AuthModule {}
