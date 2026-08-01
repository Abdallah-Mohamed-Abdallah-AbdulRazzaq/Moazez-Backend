import { Test, type TestingModule } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { ApplicationLifecycleState } from './application-lifecycle.state';
import {
  closeManagementProbeServer,
  createManagementProbeServer,
  listenManagementProbeServer,
} from './management-probe.server';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BullmqService } from '../infrastructure/queue/bullmq.service';
import { RealtimeGateway } from '../infrastructure/realtime/realtime.gateway';
import { RealtimeStateStoreService } from '../infrastructure/realtime/realtime-state-store.service';
import { StorageService } from '../infrastructure/storage/storage.service';
import { MediaRuntimeStartupGuard } from '../modules/files/uploads/application/media-runtime-startup.guard';
import {
  createOperationalRoleManifests,
  OPERATIONAL_ROLE_MANIFESTS,
} from '../modules/health/operational-probe.manifests';
import { OperationalProbeService } from '../modules/health/operational-probe.service';
import { TemporaryDiskProbe } from '../modules/health/temporary-disk.probe';

describe('Nest-managed operational probes on the management listener', () => {
  let moduleRef: TestingModule;
  let lifecycle: ApplicationLifecycleState;
  let probes: OperationalProbeService;
  let server: ReturnType<typeof createManagementProbeServer>;
  let origin: string;
  const queuePing = jest.fn();

  beforeEach(async () => {
    queuePing.mockResolvedValue(undefined);
    moduleRef = await Test.createTestingModule({
      providers: [
        ApplicationLifecycleState,
        OperationalProbeService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) },
        },
        {
          provide: BullmqService,
          useValue: {
            ping: queuePing,
            hasAvailableWorkers: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: RealtimeGateway,
          useValue: { checkReadiness: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: RealtimeStateStoreService,
          useValue: { checkReadiness: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: StorageService,
          useValue: { checkReadiness: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MediaRuntimeStartupGuard,
          useValue: {
            assertReady: jest.fn().mockResolvedValue(undefined),
            isVerified: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: TemporaryDiskProbe,
          useValue: { checkReadiness: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: OPERATIONAL_ROLE_MANIFESTS,
          useValue: createOperationalRoleManifests(),
        },
      ],
    }).compile();
    lifecycle = moduleRef.get(ApplicationLifecycleState);
    probes = moduleRef.get(OperationalProbeService);
    server = createManagementProbeServer(probes);
    await listenManagementProbeServer(server, 0, '127.0.0.1');
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await closeManagementProbeServer(server);
    await moduleRef.close();
  });

  it('transitions startup from unavailable to ready after initialization', async () => {
    await expectStatus('/internal/probes/api/startup', 503, 'unavailable');

    probes.markInitializationComplete();

    await expectStatus('/internal/probes/api/startup', 200, 'ok');
    await expectStatus('/internal/probes/core-worker/startup', 200, 'ok');
    await expectStatus('/internal/probes/media-worker/startup', 200, 'ok');
  });

  it('keeps liveness healthy, makes readiness recoverable, and rejects drain', async () => {
    probes.markInitializationComplete();
    queuePing.mockRejectedValueOnce(
      new Error('redis://user:secret@internal:6379'),
    );

    await expectStatus('/internal/probes/api/readiness', 503, 'unavailable');
    await expectStatus('/internal/probes/api/liveness', 200, 'ok');
    await expectStatus('/internal/probes/api/readiness', 200, 'ok');

    lifecycle.beginDraining();
    await expectStatus('/internal/probes/api/readiness', 503, 'unavailable');
    await expectStatus('/internal/probes/api/startup', 503, 'unavailable');
    await expectStatus('/internal/probes/api/liveness', 200, 'ok');
  });

  async function expectStatus(
    path: string,
    statusCode: number,
    status: string,
  ): Promise<void> {
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(statusCode);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      status,
      version: '0.0.1',
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toMatch(
      /database|redis|storage|queue|email|provider|topology|secret/i,
    );
  }
});
