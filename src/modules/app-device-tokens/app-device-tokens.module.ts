import { Module } from '@nestjs/common';
import { AppDeviceTokenService } from './application/app-device-token.service';
import { AppDeviceTokenCrypto } from './domain/app-device-token-crypto';
import { AppDeviceTokenRepository } from './infrastructure/app-device-token.repository';

@Module({
  providers: [
    AppDeviceTokenCrypto,
    AppDeviceTokenRepository,
    AppDeviceTokenService,
  ],
  exports: [
    AppDeviceTokenCrypto,
    AppDeviceTokenRepository,
    AppDeviceTokenService,
  ],
})
export class AppDeviceTokensModule {}
