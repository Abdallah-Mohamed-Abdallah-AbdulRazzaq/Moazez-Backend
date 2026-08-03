import { Logger, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ApplicationLifecycleState } from '../bootstrap/application-lifecycle.state';
import { startApplicationRuntime } from '../bootstrap/application-startup';
import { GracefulShutdownCoordinator } from '../bootstrap/graceful-shutdown';
import {
  closeManagementProbeServer,
  createManagementProbeServer,
  listenManagementProbeServer,
} from '../bootstrap/management-probe.server';
import type { Env } from '../config/env.validation';
import { BullmqService } from '../infrastructure/queue/bullmq.service';
import { OperationalProbeService } from '../modules/health/operational-probe.service';
import type { RuntimeRole } from './runtime-role';

export async function bootstrapApplicationContextRuntime(
  rootModule: Type<unknown>,
  role: Exclude<RuntimeRole, 'api'>,
): Promise<void> {
  const app = await NestFactory.createApplicationContext(rootModule);
  const logger = new Logger(`${role}Bootstrap`);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const lifecycle = app.get(ApplicationLifecycleState);
  const probes = app.get(OperationalProbeService);
  const managementServer = createManagementProbeServer(probes);
  const probePort = config.get('APP_PROBE_PORT', { infer: true });

  await startApplicationRuntime({
    listenManagement: () =>
      listenManagementProbeServer(managementServer, probePort),
    listenPublic: () => Promise.resolve(),
    createShutdownOwnership: () =>
      new GracefulShutdownCoordinator({
        app,
        managementServer,
        lifecycle,
        queue:
          role === 'core-worker' || role === 'media-worker'
            ? app.get(BullmqService)
            : undefined,
        timeoutMs: config.get('APP_SHUTDOWN_TIMEOUT_MS', { infer: true }),
        logger,
      }),
    markInitializationComplete: () => probes.markInitializationComplete(),
    markInitializationFailed: () => probes.markInitializationFailed(),
    closeManagement: () => closeManagementProbeServer(managementServer),
    closeApplication: () => app.close(),
  });

  logger.log({ event: 'runtime.started', role });
  logger.log({ event: 'management.probe.started', role });
}
