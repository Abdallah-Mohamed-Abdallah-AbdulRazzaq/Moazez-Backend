import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { ApplicationLifecycleState } from './bootstrap/application-lifecycle.state';
import { startApplicationRuntime } from './bootstrap/application-startup';
import { handleBootstrapFailure } from './bootstrap/bootstrap-failure';
import { GracefulShutdownCoordinator } from './bootstrap/graceful-shutdown';
import {
  configureHttpApplication,
  logHttpApplicationStarted,
} from './bootstrap/http-application';
import {
  closeManagementProbeServer,
  createManagementProbeServer,
  listenManagementProbeServer,
} from './bootstrap/management-probe.server';
import type { Env } from './config/env.validation';
import { RealtimeGateway } from './infrastructure/realtime/realtime.gateway';
import { OperationalProbeService } from './modules/health/operational-probe.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const lifecycle = app.get(ApplicationLifecycleState);
  const configured = configureHttpApplication(
    app,
    {
      environment: config.get('NODE_ENV', { infer: true }),
      corsOrigins: config.get('APP_CORS_ORIGINS', { infer: true }),
      swaggerEnabled: config.get('SWAGGER_ENABLED', { infer: true }),
    },
    lifecycle,
  );

  const port = config.get('APP_PORT', { infer: true });
  const probePort = config.get('APP_PROBE_PORT', { infer: true });
  const probes = app.get(OperationalProbeService);
  const managementServer = createManagementProbeServer(probes);

  await startApplicationRuntime({
    listenManagement: () =>
      listenManagementProbeServer(managementServer, probePort),
    listenPublic: () => app.listen(port).then(() => undefined),
    createShutdownOwnership: () =>
      new GracefulShutdownCoordinator({
        app,
        httpServer: app.getHttpServer(),
        managementServer,
        lifecycle,
        realtime: app.get(RealtimeGateway),
        timeoutMs: config.get('APP_SHUTDOWN_TIMEOUT_MS', { infer: true }),
        logger,
      }),
    markInitializationComplete: () => probes.markInitializationComplete(),
    markInitializationFailed: () => probes.markInitializationFailed(),
    closeManagement: () => closeManagementProbeServer(managementServer),
    closeApplication: () => app.close(),
  });

  logHttpApplicationStarted(logger, port, configured);
  logger.log({ event: 'management.probe.started' });
  logRegisteredRoutes(app.getHttpAdapter().getInstance() as Express, logger);
}

function logRegisteredRoutes(server: Express, logger: Logger): void {
  const router = (server as unknown as { _router?: { stack: unknown[] } })
    ._router;
  if (!router) return;

  const routes: string[] = [];
  for (const layer of router.stack as Array<Record<string, unknown>>) {
    const route = layer.route as
      | { path: string; methods: Record<string, boolean> }
      | undefined;
    if (!route) continue;
    const methods = Object.keys(route.methods)
      .filter((m) => route.methods[m])
      .map((m) => m.toUpperCase());
    for (const method of methods) {
      routes.push(`${method.padEnd(6)} ${route.path}`);
    }
  }

  if (routes.length === 0) return;
  logger.log(`Registered routes (${routes.length}):`);
  for (const line of routes.sort()) {
    logger.log(`  ${line}`);
  }
}

bootstrap().catch(handleBootstrapFailure);
