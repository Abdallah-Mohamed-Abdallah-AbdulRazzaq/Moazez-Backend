import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  PRISMA_CLIENT_OPTIONS,
  type PrismaClientRuntimeOptions,
} from './prisma-client-options.provider';
import { schoolScopeExtension } from './school-scope.extension';

type ExtendedClient = ReturnType<PrismaClient['$extends']>;
const DIRECT_CONSTRUCTION_OPTIONS: Prisma.PrismaClientOptions = Object.freeze(
  {},
);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private _scoped?: ExtendedClient;
  private disconnectPromise: Promise<void> | null = null;

  constructor(
    @Inject(PRISMA_CLIENT_OPTIONS)
    options: PrismaClientRuntimeOptions = DIRECT_CONSTRUCTION_OPTIONS,
  ) {
    super(options);
  }

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

  onModuleDestroy(): Promise<void> {
    if (!this.disconnectPromise) {
      this.disconnectPromise = this.$disconnect();
    }
    return this.disconnectPromise;
  }
}
