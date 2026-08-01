import { Inject, Injectable, Logger } from '@nestjs/common';
import { APPLICATION_VERSION } from '../../bootstrap/application-metadata';
import { ApplicationLifecycleState } from '../../bootstrap/application-lifecycle.state';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import { RealtimeStateStoreService } from '../../infrastructure/realtime/realtime-state-store.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MediaRuntimeStartupGuard } from '../files/uploads/application/media-runtime-startup.guard';
import { BoundedProbeExecutor } from './bounded-probe-executor';
import {
  OPERATIONAL_ROLE_MANIFESTS,
  type OperationalDependencyId,
  type OperationalProbeKind,
  type OperationalProbeRole,
  type OperationalRoleDependencyManifest,
} from './operational-probe.manifests';
import { TemporaryDiskProbe } from './temporary-disk.probe';

export interface OperationalProbeResponse {
  status: 'ok' | 'unavailable';
  version: string;
  timestamp: string;
}

export interface OperationalProbeResult {
  statusCode: 200 | 503;
  response: OperationalProbeResponse;
}

type StartupState = 'pending' | 'ready' | 'failed';

@Injectable()
export class OperationalProbeService {
  private readonly logger = new Logger(OperationalProbeService.name);
  private startupState: StartupState = 'pending';
  private readonly executor = new BoundedProbeExecutor();
  private readonly readinessFailureFingerprints = new Map<
    OperationalProbeRole,
    string
  >();
  private readonly readinessFlights = new Map<
    OperationalProbeRole,
    Promise<boolean>
  >();

  constructor(
    private readonly lifecycle: ApplicationLifecycleState,
    private readonly prisma: PrismaService,
    private readonly queue: BullmqService,
    private readonly realtime: RealtimeGateway,
    private readonly realtimeStateStore: RealtimeStateStoreService,
    private readonly storage: StorageService,
    private readonly mediaRuntime: MediaRuntimeStartupGuard,
    private readonly temporaryDisk: TemporaryDiskProbe,
    @Inject(OPERATIONAL_ROLE_MANIFESTS)
    private readonly manifests: Readonly<
      Record<OperationalProbeRole, OperationalRoleDependencyManifest>
    >,
  ) {}

  markInitializationComplete(): void {
    if (this.startupState === 'pending') this.startupState = 'ready';
  }

  markInitializationFailed(): void {
    if (this.startupState !== 'ready') this.startupState = 'failed';
  }

  async evaluate(
    role: OperationalProbeRole,
    kind: OperationalProbeKind,
  ): Promise<OperationalProbeResult> {
    if (kind === 'liveness') return this.result(true);

    if (
      this.lifecycle.isDraining() ||
      this.startupState !== 'ready' ||
      !this.hasRequiredLocalCapabilities(this.manifests[role])
    ) {
      return this.result(false);
    }

    if (kind === 'startup') return this.result(true);

    const ready = await this.checkReadiness(role);
    return this.result(ready && !this.lifecycle.isDraining());
  }

  private checkReadiness(role: OperationalProbeRole): Promise<boolean> {
    const existing = this.readinessFlights.get(role);
    if (existing) return existing;

    const manifest = this.manifests[role];
    const execution = Promise.all(
      manifest.readiness.map(async (dependency) => ({
        dependency,
        available: await this.executor.run(dependency, () =>
          this.runDependencyCheck(dependency, manifest),
        ),
      })),
    )
      .then((checks) => {
        const failed = checks
          .filter((check) => !check.available)
          .map((check) => check.dependency);
        this.recordReadinessState(role, failed);
        return failed.length === 0;
      })
      .finally(() => {
        if (this.readinessFlights.get(role) === execution) {
          this.readinessFlights.delete(role);
        }
      });
    this.readinessFlights.set(role, execution);
    return execution;
  }

  private runDependencyCheck(
    dependency: OperationalDependencyId,
    manifest: OperationalRoleDependencyManifest,
  ): Promise<void> {
    switch (dependency) {
      case 'prisma':
        return this.checkPrisma();
      case 'queue-redis':
        return this.queue.ping();
      case 'storage':
        return this.storage.checkReadiness();
      case 'realtime-adapter-redis':
        return this.realtime.checkReadiness();
      case 'realtime-state-store-redis':
        return this.realtimeStateStore.checkReadiness();
      case 'core-consumers':
      case 'media-consumers':
        return this.assertConsumersRegistered(manifest.assignedConsumers);
      case 'ffprobe':
        return this.mediaRuntime.assertReady();
      case 'temporary-disk':
        return this.temporaryDisk.checkReadiness();
    }
  }

  private async checkPrisma(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private assertConsumersRegistered(
    assignedConsumers: readonly string[],
  ): Promise<void> {
    if (!this.queue.hasAvailableWorkers(assignedConsumers)) {
      return Promise.reject(new Error('assigned_consumer_unavailable'));
    }
    return Promise.resolve();
  }

  private hasRequiredLocalCapabilities(
    manifest: OperationalRoleDependencyManifest,
  ): boolean {
    if (
      manifest.assignedConsumers.length > 0 &&
      !this.queue.hasAvailableWorkers(manifest.assignedConsumers)
    ) {
      return false;
    }

    return (
      !manifest.requiresVerifiedMediaRuntime || this.mediaRuntime.isVerified()
    );
  }

  private recordReadinessState(
    role: OperationalProbeRole,
    failed: readonly OperationalDependencyId[],
  ): void {
    if (failed.length === 0) {
      if (this.readinessFailureFingerprints.delete(role)) {
        this.logger.log({
          event: 'management.probe.readiness_recovered',
          role,
        });
      }
      return;
    }

    const fingerprint = failed.join(',');
    if (this.readinessFailureFingerprints.get(role) === fingerprint) return;
    this.readinessFailureFingerprints.set(role, fingerprint);
    this.logger.warn({
      event: 'management.probe.readiness_unavailable',
      role,
      dependencies: failed,
    });
  }

  private result(available: boolean): OperationalProbeResult {
    return {
      statusCode: available ? 200 : 503,
      response: {
        status: available ? 'ok' : 'unavailable',
        version: APPLICATION_VERSION,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
