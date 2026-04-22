import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { schoolScopeExtension } from './school-scope.extension';

type ExtendedClient = ReturnType<PrismaClient['$extends']>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private _scoped?: ExtendedClient;

  /**
   * Scoped client with the schoolScope extension applied. Use this for all
   * tenant-scoped model reads and writes. Falls back to the base client for
   * $queryRaw, platform-level queries, and explicit bypass flows.
   */
  get scoped(): ExtendedClient {
    if (!this._scoped) {
      this._scoped = this.$extends(schoolScopeExtension);
    }
    return this._scoped;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
