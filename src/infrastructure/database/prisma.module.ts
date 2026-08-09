import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrismaClientOptions,
  PRISMA_CLIENT_OPTIONS,
} from './prisma-client-options.provider';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: createPrismaClientOptions,
    },
    PrismaService,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
