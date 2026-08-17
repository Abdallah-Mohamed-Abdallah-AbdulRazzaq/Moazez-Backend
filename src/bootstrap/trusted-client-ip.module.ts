import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TrustedClientIpResolver } from './trusted-client-ip.resolver';

@Module({
  imports: [ConfigModule],
  providers: [TrustedClientIpResolver],
  exports: [TrustedClientIpResolver],
})
export class TrustedClientIpModule {}
