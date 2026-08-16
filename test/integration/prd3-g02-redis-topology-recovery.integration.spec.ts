import { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import IORedis from 'ioredis';
import { spawnSync } from 'node:child_process';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import { ApplicationLifecycleState } from '../../src/bootstrap/application-lifecycle.state';
import type { Env } from '../../src/config/env.validation';
import { createRedisConnectionConfiguration } from '../../src/config/redis-connection.options';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import type { RealtimeAuthService } from '../../src/infrastructure/realtime/realtime-auth.service';
import type { RealtimeCommunicationAccessService } from '../../src/infrastructure/realtime/realtime-communication-access.service';
import { createRealtimeEmitterRedisClient } from '../../src/infrastructure/realtime/realtime-emitter.module';
import { REALTIME_CLIENT_COMMANDS } from '../../src/infrastructure/realtime/realtime-event-names';
import {
  RealtimeGateway,
  REALTIME_NAMESPACE,
} from '../../src/infrastructure/realtime/realtime.gateway';
import type { RealtimePresenceService } from '../../src/infrastructure/realtime/realtime-presence.service';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import { RedisRealtimePublisherService } from '../../src/infrastructure/realtime/redis-realtime-publisher.service';
import { conversationRoom } from '../../src/infrastructure/realtime/realtime-room-names';
import { RealtimeStateStoreService } from '../../src/infrastructure/realtime/realtime-state-store.service';
import type { RealtimeTypingService } from '../../src/infrastructure/realtime/realtime-typing.service';
import type { RealtimeSocket } from '../../src/infrastructure/realtime/realtime.types';

const QUEUE_GOVERNED_MAXIMUM = 40;
const REALTIME_GOVERNED_MAXIMUM = 30;
const EXPECTED_QUEUE_STEADY_MAXIMUM = 36;
const EXPECTED_REALTIME_STEADY_MAXIMUM = 14;
const REDIS_SAMPLER_CLOSE_TIMEOUT_MS = 400;
const CORE_QUEUE_NAMES = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `prd3-g02-core-${index}`),
);
const MEDIA_QUEUE_NAME = 'prd3-g02-media';
const SCHEDULER_QUEUE_NAME = 'prd3-g02-maintenance';
const TEST_JOB_NAME = 'prd3-g02-evidence-job';

jest.setTimeout(9 * 60_000);

describe('PRD3-G02 split Redis topology and same-process recovery', () => {
  const queueRedisUrl = process.env.TEST_QUEUE_REDIS_URL;
  const realtimeRedisUrl = process.env.TEST_REALTIME_REDIS_URL;
  const queueContainer = process.env.PRD3_G02_QUEUE_CONTAINER;
  const realtimeContainer = process.env.PRD3_G02_REALTIME_CONTAINER;
  const enabled =
    process.env.RUN_PRD3_G02_REDIS_INTEGRATION === '1' &&
    Boolean(
      queueRedisUrl && realtimeRedisUrl && queueContainer && realtimeContainer,
    );

  (enabled ? it : it.skip)(
    'proves isolation, bounded failure, recovery, fan-out, state, and budgets',
    async () => {
      if (
        !queueRedisUrl ||
        !realtimeRedisUrl ||
        !queueContainer ||
        !realtimeContainer
      ) {
        throw new Error('prd3_g02_fixture_contract_missing');
      }

      const topology = await createProductionShapedTopology(
        queueRedisUrl,
        realtimeRedisUrl,
      );
      const queueSamples: ConnectionSample[] = [];
      const realtimeSamples: ConnectionSample[] = [];
      const queueSampler = new RedisConnectionSampler(
        queueRedisUrl,
        queueSamples,
      );
      const realtimeSampler = new RedisConnectionSampler(
        realtimeRedisUrl,
        realtimeSamples,
      );
      let apiOneClient: RawSocketIoClient | undefined;
      let apiTwoClient: RawSocketIoClient | undefined;
      let fallbackSuccessCount = 0;
      let apiProducerFailureMilliseconds = 0;
      let coreProducerFailureMilliseconds = 0;
      let mediaProducerFailureMilliseconds = 0;
      let schedulerRegistrationFailureMilliseconds = 0;
      const failedProducerJobIds = {
        api: '',
        core: '',
        media: '',
      };
      let failedSchedulerRegistrationJobId = '';
      let failedSchedulerRegistrationActiveDuringOutage = false;
      let failedSchedulerRegistrationDesiredDuringOutage = false;
      let failedSchedulerDesiredRegistrationRestored = false;
      let failedSchedulerRegistrationActiveCount = 0;
      let failedSchedulerRegistrationDesiredCount = 0;
      let recoveredSchedulerRegistrationActive = false;

      try {
        await topology.initialize();
        await queueSampler.start();
        await realtimeSampler.start();
        queueSampler.stage = 'steady';
        realtimeSampler.stage = 'steady';

        console.log(
          `PRD3_G02_INITIAL_CONNECTIONS=${JSON.stringify({
            queue: await queueSampler.readApplicationConnections(),
            realtime: await realtimeSampler.readApplicationConnections(),
          })}`,
        );

        await waitFor(
          async () =>
            (await queueSampler.readApplicationConnections()) ===
            EXPECTED_QUEUE_STEADY_MAXIMUM,
        );
        await waitFor(
          async () =>
            (await realtimeSampler.readApplicationConnections()) ===
            EXPECTED_REALTIME_STEADY_MAXIMUM,
        );

        apiOneClient = await topology.connectApiClient(0);
        apiTwoClient = await topology.connectApiClient(1);
        await joinConversation(apiOneClient);
        await joinConversation(apiTwoClient);
        await expectCrossInstanceFanout(
          topology.apiNamespaces[0],
          apiTwoClient,
          'healthy',
        );

        const healthyCoreJobId = `core-healthy-${topology.runId}`;
        const healthyMediaJobId = `media-healthy-${topology.runId}`;
        await topology.apiBullmq[0].addJob(
          CORE_QUEUE_NAMES[0],
          TEST_JOB_NAME,
          { runId: topology.runId },
          { jobId: healthyCoreJobId },
        );
        await topology.apiBullmq[0].addJob(
          MEDIA_QUEUE_NAME,
          TEST_JOB_NAME,
          { runId: topology.runId },
          { jobId: healthyMediaJobId },
        );
        await topology.registerRepeat(`healthy-${topology.runId}`);
        await waitFor(
          () =>
            topology.processedJobCounts.get(healthyCoreJobId) === 1 &&
            topology.processedJobCounts.get(healthyMediaJobId) === 1,
        );

        await topology.stateStores[0].incrementPresence(
          'school-g02',
          'presence-user-g02',
          'socket-owned-g02',
          90,
        );
        await expect(
          topology.stateStores[1].getPresenceSnapshot('school-g02'),
        ).resolves.toEqual([
          expect.objectContaining({
            userId: 'presence-user-g02',
            online: true,
          }),
        ]);
        await topology.stateStores[0].setTyping(
          'school-g02',
          'conversation-g02',
          'typing-user-g02',
          8,
        );
        await expect(
          topology.stateStores[1].getTypingUsers(
            'school-g02',
            'conversation-g02',
          ),
        ).resolves.toEqual([
          expect.objectContaining({ userId: 'typing-user-g02' }),
        ]);

        const initialOwnership = await topology.inspectKeyOwnership();
        expect(initialOwnership.queueHasBullmqKeys).toBe(true);
        expect(initialOwnership.queueHasRealtimeKeys).toBe(false);
        expect(initialOwnership.realtimeHasBullmqKeys).toBe(false);
        expect(initialOwnership.realtimeHasRealtimeKeys).toBe(true);

        queueSampler.stage = 'queue-outage';
        docker(['stop', '--time', '5', queueContainer]);
        await expectAllRejected(
          topology.allBullmq.map((service) => service.ping()),
        );

        failedProducerJobIds.api = `failed-api-${topology.runId}`;
        failedProducerJobIds.core = `failed-core-${topology.runId}`;
        failedProducerJobIds.media = `failed-media-${topology.runId}`;
        failedSchedulerRegistrationJobId = `failed-scheduler-${topology.runId}`;
        apiProducerFailureMilliseconds = await expectQueueCommandRejectedWithin(
          () =>
            topology.apiBullmq[0].addJob(
              CORE_QUEUE_NAMES[0],
              TEST_JOB_NAME,
              { runId: topology.runId },
              { jobId: failedProducerJobIds.api },
            ),
        );
        coreProducerFailureMilliseconds =
          await expectQueueCommandRejectedWithin(() =>
            topology.coreBullmq[0].addJob(
              CORE_QUEUE_NAMES[1],
              TEST_JOB_NAME,
              { runId: topology.runId },
              { jobId: failedProducerJobIds.core },
            ),
          );
        mediaProducerFailureMilliseconds =
          await expectQueueCommandRejectedWithin(() =>
            topology.mediaBullmq[0].addJob(
              MEDIA_QUEUE_NAME,
              TEST_JOB_NAME,
              { runId: topology.runId },
              { jobId: failedProducerJobIds.media },
            ),
          );
        const schedulerInventoryBeforeFailure =
          topology.schedulerBullmq.getRepeatRegistrations();
        schedulerRegistrationFailureMilliseconds =
          await expectQueueCommandRejectedWithin(() =>
            topology.schedulerBullmq.registerRepeatJob(
              SCHEDULER_QUEUE_NAME,
              TEST_JOB_NAME,
              { runId: topology.runId },
              {
                jobId: failedSchedulerRegistrationJobId,
                repeat: { every: 60_000 },
              },
            ),
          );
        expect(topology.schedulerBullmq.getRepeatRegistrations()).toEqual(
          schedulerInventoryBeforeFailure,
        );
        failedSchedulerRegistrationActiveDuringOutage = topology.schedulerBullmq
          .getRepeatRegistrations()
          .some(
            (registration) =>
              registration.jobId === failedSchedulerRegistrationJobId,
          );
        expect(failedSchedulerRegistrationActiveDuringOutage).toBe(false);
        const failedSchedulerDesiredRegistrationsDuringOutage =
          topology.schedulerBullmq
            .getDesiredRepeatRegistrations()
            .filter(
              (registration) =>
                registration.jobId === failedSchedulerRegistrationJobId,
            );
        expect(failedSchedulerDesiredRegistrationsDuringOutage).toHaveLength(1);
        failedSchedulerRegistrationDesiredDuringOutage =
          failedSchedulerDesiredRegistrationsDuringOutage.length === 1;

        await expectAllResolved([
          ...topology.gateways.map((gateway) => gateway.checkReadiness()),
          ...topology.stateStores.map((store) => store.checkReadiness()),
          ...topology.emitters.map((emitter) => emitter.checkReadiness()),
        ]);
        await expectCrossInstanceFanout(
          topology.apiNamespaces[0],
          apiTwoClient,
          'queue-outage',
        );
        await expect(
          topology.stateStores[2].getPresenceSnapshot('school-g02'),
        ).resolves.toEqual([
          expect.objectContaining({
            userId: 'presence-user-g02',
            online: true,
          }),
        ]);
        await expect(
          topology.stateStores[2].getTypingUsers(
            'school-g02',
            'conversation-g02',
          ),
        ).resolves.toEqual([
          expect.objectContaining({ userId: 'typing-user-g02' }),
        ]);

        queueSampler.stage = 'queue-recovery';
        docker(['start', queueContainer]);
        await waitForRedisContainer(queueContainer);
        await waitFor(async () => {
          const outcomes = await Promise.allSettled(
            topology.allBullmq.map((service) => service.ping()),
          );
          return outcomes.every((outcome) => outcome.status === 'fulfilled');
        });
        await waitFor(async () => {
          const outcomes = await Promise.allSettled([
            topology.apiBullmq[0].getQueueReadiness(CORE_QUEUE_NAMES[0]),
            topology.coreBullmq[0].getQueueReadiness(CORE_QUEUE_NAMES[1]),
            topology.mediaBullmq[0].getQueueReadiness(MEDIA_QUEUE_NAME),
            topology.schedulerBullmq.getQueueReadiness(SCHEDULER_QUEUE_NAME),
          ]);
          return outcomes.every((outcome) => outcome.status === 'fulfilled');
        });
        const failedSchedulerActiveRegistrations = topology.schedulerBullmq
          .getRepeatRegistrations()
          .filter(
            (registration) =>
              registration.jobId === failedSchedulerRegistrationJobId,
          );
        const failedSchedulerDesiredRegistrations = topology.schedulerBullmq
          .getDesiredRepeatRegistrations()
          .filter(
            (registration) =>
              registration.jobId === failedSchedulerRegistrationJobId,
          );
        expect(failedSchedulerActiveRegistrations).toHaveLength(1);
        expect(failedSchedulerDesiredRegistrations).toHaveLength(1);
        failedSchedulerRegistrationActiveCount =
          failedSchedulerActiveRegistrations.length;
        failedSchedulerRegistrationDesiredCount =
          failedSchedulerDesiredRegistrations.length;
        failedSchedulerDesiredRegistrationRestored =
          failedSchedulerRegistrationActiveCount === 1 &&
          failedSchedulerRegistrationDesiredCount === 1;
        expect(failedSchedulerDesiredRegistrationRestored).toBe(true);

        const recoveredApiJobId = `api-recovered-${topology.runId}`;
        const recoveredCoreProducerJobId = `core-producer-recovered-${topology.runId}`;
        const recoveredMediaProducerJobId = `media-producer-recovered-${topology.runId}`;
        const recoveredSchedulerRegistrationJobId = `scheduler-recovered-${topology.runId}`;
        expect(recoveredSchedulerRegistrationJobId).not.toBe(
          failedSchedulerRegistrationJobId,
        );
        await topology.apiBullmq[0].addJob(
          CORE_QUEUE_NAMES[0],
          TEST_JOB_NAME,
          { runId: topology.runId },
          { jobId: recoveredApiJobId },
        );
        await topology.coreBullmq[0].addJob(
          CORE_QUEUE_NAMES[1],
          TEST_JOB_NAME,
          { runId: topology.runId },
          { jobId: recoveredCoreProducerJobId },
        );
        await topology.mediaBullmq[0].addJob(
          MEDIA_QUEUE_NAME,
          TEST_JOB_NAME,
          { runId: topology.runId },
          { jobId: recoveredMediaProducerJobId },
        );
        await topology.schedulerBullmq.registerRepeatJob(
          SCHEDULER_QUEUE_NAME,
          TEST_JOB_NAME,
          { runId: topology.runId },
          {
            jobId: recoveredSchedulerRegistrationJobId,
            repeat: { every: 60_000 },
          },
        );
        await waitFor(
          () =>
            topology.processedJobCounts.get(recoveredApiJobId) === 1 &&
            topology.processedJobCounts.get(recoveredCoreProducerJobId) === 1 &&
            topology.processedJobCounts.get(recoveredMediaProducerJobId) === 1,
        );
        for (const failedJobId of Object.values(failedProducerJobIds)) {
          expect(topology.processedJobCounts.get(failedJobId) ?? 0).toBe(0);
        }
        await expect(
          topology.apiBullmq[0]
            .getQueue(CORE_QUEUE_NAMES[0])
            .getJob(failedProducerJobIds.api),
        ).resolves.toBeUndefined();
        await expect(
          topology.coreBullmq[0]
            .getQueue(CORE_QUEUE_NAMES[1])
            .getJob(failedProducerJobIds.core),
        ).resolves.toBeUndefined();
        await expect(
          topology.mediaBullmq[0]
            .getQueue(MEDIA_QUEUE_NAME)
            .getJob(failedProducerJobIds.media),
        ).resolves.toBeUndefined();
        const postRecoverySchedulerRegistrations =
          topology.schedulerBullmq.getRepeatRegistrations();
        expect(
          postRecoverySchedulerRegistrations.filter(
            (registration) =>
              registration.jobId === failedSchedulerRegistrationJobId,
          ),
        ).toHaveLength(1);
        const recoveredSchedulerRegistrations =
          postRecoverySchedulerRegistrations.filter(
            (registration) =>
              registration.jobId === recoveredSchedulerRegistrationJobId,
          );
        expect(recoveredSchedulerRegistrations).toHaveLength(1);
        recoveredSchedulerRegistrationActive =
          recoveredSchedulerRegistrations.length === 1;

        await topology.stateStores[0].setTyping(
          'school-expired-g02',
          'conversation-expired-g02',
          'typing-expired-g02',
          1,
        );
        realtimeSampler.stage = 'realtime-outage';
        const oldApiClients = [apiOneClient, apiTwoClient];
        const clientClosures = oldApiClients.map((client) =>
          client.waitForClose(),
        );
        docker(['stop', '--time', '5', realtimeContainer]);
        await expectAllRejected(
          topology.gateways.map((gateway) => gateway.checkReadiness()),
        );
        await expectAllRejected(
          topology.stateStores.map((store) => store.checkReadiness()),
        );
        await expectAllRejected(
          topology.emitters.map((emitter) => emitter.checkReadiness()),
        );
        await Promise.all(clientClosures);

        const rejectedSocket = rejectedSocketDouble();
        await topology.gateways[0].handleConnection(rejectedSocket.socket);
        expect(rejectedSocket.disconnect).toHaveBeenCalledWith(true);

        const unavailableOperations = [
          () =>
            topology.stateStores[0].incrementPresence(
              'school-g02',
              'presence-user-g02',
              'socket-owned-g02',
              90,
            ),
          () => topology.stateStores[0].getPresenceSnapshot('school-g02'),
          () =>
            topology.stateStores[0].setTyping(
              'school-g02',
              'conversation-g02',
              'unavailable-typing-g02',
              8,
            ),
          () =>
            topology.stateStores[0].getTypingUsers(
              'school-g02',
              'conversation-g02',
            ),
        ];
        for (const operation of unavailableOperations) {
          try {
            await operation();
            fallbackSuccessCount += 1;
          } catch (error) {
            expect(error).toEqual(
              expect.objectContaining({
                message: 'realtime_state_redis_unavailable',
              }),
            );
          }
        }
        expect(fallbackSuccessCount).toBe(0);

        await expectAllResolved(
          topology.allBullmq.map((service) => service.ping()),
        );
        const queueDuringRealtimeOutageJobId = `queue-during-realtime-${topology.runId}`;
        await topology.apiBullmq[2].addJob(
          CORE_QUEUE_NAMES[2],
          TEST_JOB_NAME,
          { runId: topology.runId },
          { jobId: queueDuringRealtimeOutageJobId },
        );
        await waitFor(
          () =>
            topology.processedJobCounts.get(queueDuringRealtimeOutageJobId) ===
            1,
        );
        await topology.registerRepeat(`realtime-outage-${topology.runId}`);

        await delay(1_200);
        realtimeSampler.stage = 'realtime-recovery';
        docker(['start', realtimeContainer]);
        await waitForRedisContainer(realtimeContainer);
        await waitFor(async () => {
          const outcomes = await Promise.allSettled([
            ...topology.gateways.map((gateway) => gateway.checkReadiness()),
            ...topology.stateStores.map((store) => store.checkReadiness()),
            ...topology.emitters.map((emitter) => emitter.checkReadiness()),
          ]);
          return outcomes.every((outcome) => outcome.status === 'fulfilled');
        }, 30_000);

        await expect(
          topology.stateStores[1].getPresenceSnapshot('school-g02'),
        ).resolves.toEqual([
          expect.objectContaining({
            userId: 'presence-user-g02',
            online: true,
          }),
        ]);
        await expect(
          topology.stateStores[1].getTypingUsers(
            'school-expired-g02',
            'conversation-expired-g02',
          ),
        ).resolves.toEqual([]);
        await expect(
          topology.stateStores[1].getTypingUsers(
            'school-g02',
            'conversation-g02',
          ),
        ).resolves.toEqual([]);

        apiOneClient = await topology.connectApiClient(0);
        apiTwoClient = await topology.connectApiClient(1);
        await joinConversation(apiOneClient);
        await joinConversation(apiTwoClient);
        await expectCrossInstanceFanout(
          topology.apiNamespaces[0],
          apiTwoClient,
          'recovered',
        );
        const emitterDelivery = apiTwoClient.waitFor('test:emitter:recovered');
        expect(
          topology.emitters[0].publishToConversation(
            'school-g02',
            'conversation-g02',
            'test:emitter:recovered',
            { recovered: true },
          ),
        ).toBe(true);
        await expect(emitterDelivery).resolves.toEqual({ recovered: true });

        await waitFor(
          async () =>
            (await queueSampler.readApplicationConnections()) ===
            EXPECTED_QUEUE_STEADY_MAXIMUM,
        );
        await waitFor(
          async () =>
            (await realtimeSampler.readApplicationConnections()) ===
            EXPECTED_REALTIME_STEADY_MAXIMUM,
        );
        await delay(300);

        const measured = {
          queueMaximum: maximumApplicationConnections(queueSamples),
          realtimeMaximum: maximumApplicationConnections(realtimeSamples),
          queueRecoveryMaximum: maximumApplicationConnections(
            queueSamples,
            'queue-recovery',
          ),
          realtimeRecoveryMaximum: maximumApplicationConnections(
            realtimeSamples,
            'realtime-recovery',
          ),
        };
        expect(measured.queueMaximum).toBeLessThanOrEqual(
          QUEUE_GOVERNED_MAXIMUM,
        );
        expect(measured.realtimeMaximum).toBeLessThanOrEqual(
          REALTIME_GOVERNED_MAXIMUM,
        );

        await apiOneClient.close();
        await apiTwoClient.close();
        apiOneClient = undefined;
        apiTwoClient = undefined;
        queueSampler.stage = 'shutdown';
        realtimeSampler.stage = 'shutdown';
        await topology.shutdown();
        await waitFor(
          async () => (await queueSampler.readApplicationConnections()) === 0,
        );
        await waitFor(
          async () =>
            (await realtimeSampler.readApplicationConnections()) === 0,
        );

        queueSampler.stop();
        realtimeSampler.stop();
        const finalQueueApplicationConnections =
          await queueSampler.readApplicationConnections();
        const finalRealtimeApplicationConnections =
          await realtimeSampler.readApplicationConnections();
        expect(finalQueueApplicationConnections).toBe(0);
        expect(finalRealtimeApplicationConnections).toBe(0);

        const evidence = {
          runId: topology.runId,
          imageId: process.env.PRD3_G02_REDIS_IMAGE_ID,
          topology: {
            apiInstances: 4,
            coreWorkerInstances: 2,
            coreWorkersPerInstance: 6,
            mediaWorkerInstances: 2,
            mediaWorkersPerInstance: 1,
            schedulerInstances: 1,
          },
          queueExpectedSteadyMaximum: EXPECTED_QUEUE_STEADY_MAXIMUM,
          realtimeExpectedSteadyMaximum: EXPECTED_REALTIME_STEADY_MAXIMUM,
          ...measured,
          finalQueueApplicationConnections,
          finalRealtimeApplicationConnections,
          administrativeInspectionConnections: {
            queueMaximum: maximumAdministrativeConnections(queueSamples),
            realtimeMaximum: maximumAdministrativeConnections(realtimeSamples),
            excludedFromApplicationBudgets: true,
          },
          apiProducerFailureMilliseconds,
          coreProducerFailureMilliseconds,
          mediaProducerFailureMilliseconds,
          schedulerRegistrationFailureMilliseconds,
          producerFailureMilliseconds: Math.max(
            apiProducerFailureMilliseconds,
            coreProducerFailureMilliseconds,
            mediaProducerFailureMilliseconds,
            schedulerRegistrationFailureMilliseconds,
          ),
          producerFailureLimitMilliseconds: 2_000,
          failedProducerReplayCount: Object.values(failedProducerJobIds).reduce(
            (total, jobId) =>
              total + (topology.processedJobCounts.get(jobId) ?? 0),
            0,
          ),
          failedSchedulerRegistrationActiveDuringOutage,
          failedSchedulerRegistrationDesiredDuringOutage,
          failedSchedulerDesiredRegistrationRestored,
          failedSchedulerRegistrationActiveCount,
          failedSchedulerRegistrationDesiredCount,
          recoveredSchedulerRegistrationActive,
          fallbackSuccessCount,
          queueKeyOwnership: initialOwnership,
          queueRecovery: true,
          realtimeRecovery: true,
          independentFailureDomains: true,
          multiInstanceFanout: true,
          multiInstancePresence: true,
          multiInstanceTyping: true,
          expiredTypingResurrected: false,
          socketsRejectedDuringOutage: true,
          livenessPreserved: true,
          processInstancesReplaced: 0,
        };
        console.log(`PRD3_G02_EVIDENCE_JSON=${JSON.stringify(evidence)}`);

        await queueSampler.close();
        await realtimeSampler.close();
        expect(redisCliApplicationConnections(queueContainer)).toBe(0);
        expect(redisCliApplicationConnections(realtimeContainer)).toBe(0);
      } finally {
        await apiOneClient?.close().catch(() => undefined);
        await apiTwoClient?.close().catch(() => undefined);
        queueSampler.stop();
        realtimeSampler.stop();
        await topology.shutdown().catch(() => undefined);
        await queueSampler.close().catch(() => undefined);
        await realtimeSampler.close().catch(() => undefined);
      }
    },
  );
});

type ConnectionSample = {
  stage: string;
  applicationConnections: number;
  administrativeConnections: number;
};

class RedisConnectionSampler {
  private readonly admin: IORedis;
  private timer?: NodeJS.Timeout;
  private inFlightSample?: Promise<void>;
  private closePromise?: Promise<void>;
  stage = 'initializing';

  constructor(
    redisUrl: string,
    private readonly samples: ConnectionSample[],
  ) {
    this.admin = new IORedis(redisUrl, {
      connectionName: 'prd3-g02-administrative-inspection',
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 400,
      commandTimeout: 400,
      disconnectTimeout: REDIS_SAMPLER_CLOSE_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(attempt * 50, 500),
    });
    this.admin.on('error', () => undefined);
  }

  async start(): Promise<void> {
    await this.readApplicationConnections();
    this.timer = setInterval(() => void this.sample(), 25);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async readApplicationConnections(): Promise<number> {
    if (this.admin.status !== 'ready') {
      throw new Error('redis_administrative_inspection_unavailable');
    }
    const clientList = await this.admin.client('LIST');
    const clients = clientList
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const administrative = clients.filter((line) =>
      line.includes('name=prd3-g02-administrative-inspection'),
    );
    expect(administrative.length).toBeGreaterThanOrEqual(1);
    return clients.length - administrative.length;
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeOnce();
    return this.closePromise;
  }

  private async closeOnce(): Promise<void> {
    this.stop();
    await this.inFlightSample;
    await closeSamplerRedisClient(this.admin);
  }

  private sample(): Promise<void> {
    if (this.inFlightSample) return this.inFlightSample;
    if (this.admin.status !== 'ready') return Promise.resolve();

    const execution = this.sampleOnce();
    this.inFlightSample = execution;
    void execution.finally(() => {
      if (this.inFlightSample === execution) this.inFlightSample = undefined;
    });
    return execution;
  }

  private async sampleOnce(): Promise<void> {
    try {
      const clientList = await this.admin.client('LIST');
      const clients = clientList.split('\n').filter((line) => line.trim());
      const administrativeConnections = clients.filter((line) =>
        line.includes('name=prd3-g02-administrative-inspection'),
      ).length;
      this.samples.push({
        stage: this.stage,
        applicationConnections: clients.length - administrativeConnections,
        administrativeConnections,
      });
    } catch {
      // Outage samples are unavailable by definition; recovery sampling resumes.
    }
  }
}

type SamplerRedisCloseSettlement = 'fulfilled' | 'rejected' | 'timed_out';
type SamplerRedisTerminalSettlement = 'ended' | 'timed_out';

async function closeSamplerRedisClient(redis: IORedis): Promise<void> {
  if (redis.status === 'end') return;

  const terminal = observeSamplerRedisEnd(redis);
  const closeResult = await settleSamplerRedisClose(
    Promise.resolve().then(() => redis.quit()),
  );
  if (closeResult !== 'fulfilled' && redis.status !== 'end') {
    redis.disconnect();
  }

  const terminalResult = await terminal;
  if (terminalResult === 'timed_out' && redis.status !== 'end') {
    const forcedTerminal = observeSamplerRedisEnd(redis);
    redis.disconnect();
    await forcedTerminal;
  }
}

function observeSamplerRedisEnd(
  redis: IORedis,
): Promise<SamplerRedisTerminalSettlement> {
  if (redis.status === 'end') return Promise.resolve('ended');

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (result: SamplerRedisTerminalSettlement): void => {
      if (settled) return;
      settled = true;
      redis.off('end', onEnd);
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const onEnd = (): void => settle('ended');

    redis.once('end', onEnd);
    if (redis.status === 'end') {
      settle('ended');
      return;
    }

    timer = setTimeout(
      () => settle('timed_out'),
      REDIS_SAMPLER_CLOSE_TIMEOUT_MS,
    );
    timer.unref();
  });
}

async function settleSamplerRedisClose(
  operation: Promise<unknown>,
): Promise<SamplerRedisCloseSettlement> {
  let timer: NodeJS.Timeout | undefined;
  const observed = operation.then<
    SamplerRedisCloseSettlement,
    SamplerRedisCloseSettlement
  >(
    () => 'fulfilled',
    () => 'rejected',
  );
  const deadline = new Promise<SamplerRedisCloseSettlement>((resolve) => {
    timer = setTimeout(
      () => resolve('timed_out'),
      REDIS_SAMPLER_CLOSE_TIMEOUT_MS,
    );
    timer.unref();
  });

  try {
    return await Promise.race([observed, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createProductionShapedTopology(
  queueRedisUrl: string,
  realtimeRedisUrl: string,
) {
  const runId = process.env.PRD3_G02_RUN_ID ?? 'unknown-run';
  const queueConfig = (runtimeRole?: string) =>
    new ConfigService({
      QUEUE_REDIS_URL: queueRedisUrl,
      ...(runtimeRole ? { DATABASE_RUNTIME_ROLE: runtimeRole } : {}),
    });
  // The disposable Redis fixture is intentionally plaintext. Transport runs
  // under NODE_ENV=test while the state-store fallback policy is forced to the
  // strict production value below, so this proof cannot normalize plaintext
  // Redis as valid staging/production configuration.
  const realtimeConfig = new ConfigService<Env, true>({
    NODE_ENV: 'test',
    REALTIME_REDIS_URL: realtimeRedisUrl,
  } as Env);
  const realtimeTestConnection = createRedisConnectionConfiguration({
    family: 'realtime',
    nodeEnvironment: 'test',
    url: realtimeRedisUrl,
  });
  const apiBullmq = Array.from(
    { length: 4 },
    () => new BullmqService(queueConfig('api')),
  );
  const coreBullmq = Array.from(
    { length: 2 },
    () => new BullmqService(queueConfig('core-worker')),
  );
  const mediaBullmq = Array.from(
    { length: 2 },
    () => new BullmqService(queueConfig('media-worker')),
  );
  const schedulerBullmq = new BullmqService(queueConfig());
  const allBullmq = [
    ...apiBullmq,
    ...coreBullmq,
    ...mediaBullmq,
    schedulerBullmq,
  ];
  const processedJobCounts = new Map<string, number>();
  const countJob = (job: { id?: string }): void => {
    if (!job.id) return;
    processedJobCounts.set(job.id, (processedJobCounts.get(job.id) ?? 0) + 1);
  };
  for (const service of coreBullmq) {
    for (const queueName of CORE_QUEUE_NAMES) {
      service.createWorker(queueName, async (job) => countJob(job));
    }
  }
  for (const service of mediaBullmq) {
    service.createWorker(MEDIA_QUEUE_NAME, async (job) => countJob(job));
  }

  const stateStores = Array.from(
    { length: 4 },
    () =>
      enforceStrictRealtimeFallbackPolicy(
        new RealtimeStateStoreService(realtimeConfig),
      ),
  );
  const apiServers = Array.from({ length: 4 }, () => createServer());
  const socketServers = apiServers.map(
    (httpServer) => new Server(httpServer, { serveClient: false }),
  );
  const apiNamespaces = socketServers.map((server) =>
    server.of(REALTIME_NAMESPACE),
  );
  const publishers = Array.from(
    { length: 4 },
    () => new RealtimePublisherService(),
  );
  const gateways = publishers.map(
    (publisher) =>
      new RealtimeGateway(
        {
          authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
        } as unknown as RealtimeAuthService,
        {
          canJoinConversationRoom: jest.fn().mockResolvedValue(true),
          isOnlinePresenceEnabled: jest.fn().mockResolvedValue(false),
        } as unknown as RealtimeCommunicationAccessService,
        publisher,
        realtimeConfig,
        {
          registerSocket: jest.fn(),
          unregisterSocket: jest.fn(),
        } as unknown as RealtimePresenceService,
        {
          startTyping: jest.fn(),
          stopTyping: jest.fn(),
        } as unknown as RealtimeTypingService,
        new ApplicationLifecycleState(),
      ),
  );
  const emitterClients = Array.from({ length: 2 }, () =>
    createRealtimeEmitterRedisClient(realtimeTestConnection),
  );
  const emitters = emitterClients.map(
    (client) => new RedisRealtimePublisherService(client),
  );
  const apiPorts: number[] = [];
  let shutdownPromise: Promise<void> | undefined;

  return {
    runId,
    apiBullmq,
    coreBullmq,
    mediaBullmq,
    schedulerBullmq,
    allBullmq,
    stateStores,
    apiNamespaces,
    gateways,
    emitters,
    processedJobCounts,
    async initialize(): Promise<void> {
      await Promise.all(
        allBullmq.map((service) =>
          service.getQueueReadiness('prd3-g02-connection-budget-probe'),
        ),
      );
      await Promise.all(allBullmq.map((service) => service.ping()));
      await Promise.all(stateStores.map((store) => store.checkReadiness()));
      for (let index = 0; index < gateways.length; index += 1) {
        await gateways[index].afterInit(apiNamespaces[index]);
        installGatewayHandlers(apiNamespaces[index], gateways[index]);
        apiPorts.push(await listen(apiServers[index]));
      }
      await Promise.all(emitters.map((emitter) => emitter.onModuleInit()));
      await waitFor(
        () =>
          coreBullmq.every((service) =>
            service.hasExactAvailableWorkers(CORE_QUEUE_NAMES),
          ) &&
          mediaBullmq.every((service) =>
            service.hasExactAvailableWorkers([MEDIA_QUEUE_NAME]),
          ),
      );
    },
    connectApiClient(index: number): Promise<RawSocketIoClient> {
      return RawSocketIoClient.connect(apiPorts[index]);
    },
    registerRepeat(suffix: string): Promise<void> {
      return schedulerBullmq.registerRepeatJob(
        SCHEDULER_QUEUE_NAME,
        TEST_JOB_NAME,
        { runId },
        {
          jobId: `scheduler-${suffix}`,
          repeat: { every: 60_000 },
        },
      );
    },
    async inspectKeyOwnership() {
      const queue = finiteRedis(queueRedisUrl);
      const realtime = finiteRedis(realtimeRedisUrl);
      try {
        const [queueKeys, realtimeKeys] = await Promise.all([
          queue.keys('*'),
          realtime.keys('*'),
        ]);
        return {
          queueHasBullmqKeys: queueKeys.some((key) => key.startsWith('bull:')),
          queueHasRealtimeKeys: queueKeys.some((key) =>
            key.startsWith('realtime:'),
          ),
          realtimeHasBullmqKeys: realtimeKeys.some((key) =>
            key.startsWith('bull:'),
          ),
          realtimeHasRealtimeKeys: realtimeKeys.some((key) =>
            key.startsWith('realtime:'),
          ),
        };
      } finally {
        await Promise.all([queue.quit(), realtime.quit()]);
      }
    },
    shutdown(): Promise<void> {
      shutdownPromise ??= Promise.all([
        ...gateways.map((gateway) => gateway.onModuleDestroy()),
        ...stateStores.map((store) => store.onModuleDestroy()),
        ...emitters.map((emitter) => emitter.onModuleDestroy()),
        ...allBullmq.map((service) => service.onModuleDestroy()),
        ...socketServers.map((server) => closeSocketServer(server)),
        ...apiServers.map((server) => closeHttpServer(server)),
      ]).then(() => undefined);
      return shutdownPromise;
    },
  };
}

function enforceStrictRealtimeFallbackPolicy(
  store: RealtimeStateStoreService,
): RealtimeStateStoreService {
  (
    store as unknown as {
      allowLocalFallback: boolean;
    }
  ).allowLocalFallback = false;
  return store;
}

function authenticatedContext() {
  return {
    actorId: 'user-g02',
    userType: UserType.SCHOOL_USER,
    membershipId: 'membership-g02',
    schoolId: 'school-g02',
    organizationId: 'organization-g02',
    roleId: 'role-g02',
    permissions: ['communication.messages.view'],
    sessionId: 'session-g02',
    actor: { id: 'user-g02', type: UserType.SCHOOL_USER },
  };
}

function installGatewayHandlers(
  namespace: ReturnType<Server['of']>,
  gateway: RealtimeGateway,
): void {
  namespace.on('connection', (socket) => {
    socket.on('disconnect', () => {
      void gateway.handleDisconnect(socket as unknown as RealtimeSocket);
    });
    socket.on(
      REALTIME_CLIENT_COMMANDS.COMMUNICATION_CHAT_CONVERSATION_JOIN,
      (payload: unknown) => {
        void gateway
          .handleConversationJoin(socket as unknown as RealtimeSocket, payload)
          .then(() => socket.emit('test:conversation-ready', true));
      },
    );
    void gateway
      .handleConnection(socket as unknown as RealtimeSocket)
      .then(() => socket.emit('test:ready', true));
  });
}

async function joinConversation(client: RawSocketIoClient): Promise<void> {
  await client.waitFor('test:ready');
  client.emit(REALTIME_CLIENT_COMMANDS.COMMUNICATION_CHAT_CONVERSATION_JOIN, {
    conversationId: 'conversation-g02',
  });
  await expect(client.waitFor('test:conversation-ready')).resolves.toBe(true);
}

async function expectCrossInstanceFanout(
  namespace: ReturnType<Server['of']>,
  receivingClient: RawSocketIoClient,
  suffix: string,
): Promise<void> {
  const eventName = `test:cross-instance:${suffix}`;
  const delivery = receivingClient.waitFor(eventName);
  namespace
    .to(conversationRoom('school-g02', 'conversation-g02'))
    .emit(eventName, { suffix });
  await expect(delivery).resolves.toEqual({ suffix });
}

function rejectedSocketDouble(): {
  socket: RealtimeSocket;
  disconnect: jest.Mock;
} {
  const disconnect = jest.fn();
  return {
    socket: {
      id: 'outage-admission-g02',
      connected: true,
      handshake: { headers: {} },
      data: {},
      join: jest.fn(),
      disconnect,
    } as unknown as RealtimeSocket,
    disconnect,
  };
}

class RawSocketIoClient {
  private readonly events = new Map<string, unknown[]>();
  private readonly waiters = new Map<string, Array<(value: unknown) => void>>();
  private readonly closeWaiters: Array<() => void> = [];
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.handleMessage(data.toString()));
    socket.on('close', () => {
      this.closed = true;
      for (const resolve of this.closeWaiters.splice(0)) resolve();
    });
  }

  static connect(port: number): Promise<RawSocketIoClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`,
      );
      const client = new RawSocketIoClient(socket);
      const timeout = setTimeout(
        () => reject(new Error('socket_io_connection_timeout')),
        5_000,
      );
      socket.once('error', reject);
      socket.on('message', (data) => {
        if (data.toString().startsWith('0')) {
          socket.send(`40${REALTIME_NAMESPACE},`);
        }
        if (data.toString().startsWith(`40${REALTIME_NAMESPACE},`)) {
          clearTimeout(timeout);
          resolve(client);
        }
      });
    });
  }

  emit(event: string, payload: unknown): void {
    this.socket.send(
      `42${REALTIME_NAMESPACE},${JSON.stringify([event, payload])}`,
    );
  }

  waitFor(event: string): Promise<unknown> {
    const queued = this.events.get(event);
    if (queued?.length) return Promise.resolve(queued.shift());
    return withTimeout(
      new Promise((resolve) => {
        const waiters = this.waiters.get(event) ?? [];
        waiters.push(resolve);
        this.waiters.set(event, waiters);
      }),
    );
  }

  waitForClose(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return withTimeout(
      new Promise((resolve) => this.closeWaiters.push(resolve)),
    );
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    const closed = this.waitForClose();
    this.socket.close();
    return closed;
  }

  private handleMessage(packet: string): void {
    if (packet === '2') {
      this.socket.send('3');
      return;
    }
    const prefix = `42${REALTIME_NAMESPACE},`;
    if (!packet.startsWith(prefix)) return;
    const [event, payload] = JSON.parse(packet.slice(prefix.length)) as [
      string,
      unknown,
    ];
    const waiter = this.waiters.get(event)?.shift();
    if (waiter) {
      waiter(payload);
      return;
    }
    const queued = this.events.get(event) ?? [];
    queued.push(payload);
    this.events.set(event, queued);
  }
}

function finiteRedis(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    connectionName: 'prd3-g02-administrative-inspection',
    enableOfflineQueue: true,
    autoResendUnfulfilledCommands: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 400,
    commandTimeout: 400,
    retryStrategy: () => null,
  });
}

async function waitForRedisContainer(container: string): Promise<void> {
  await waitFor(async () => {
    const result = spawnSync(
      'docker',
      ['exec', container, 'redis-cli', '--raw', 'PING'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 2_000,
        killSignal: 'SIGTERM',
      },
    );
    return result.status === 0 && result.stdout.trim() === 'PONG';
  }, 15_000);
}

function maximumApplicationConnections(
  samples: readonly ConnectionSample[],
  stage?: string,
): number {
  const selected = stage
    ? samples.filter((sample) => sample.stage === stage)
    : samples;
  if (selected.length === 0) throw new Error('connection_samples_missing');
  return Math.max(...selected.map((sample) => sample.applicationConnections));
}

function maximumAdministrativeConnections(
  samples: readonly ConnectionSample[],
): number {
  if (samples.length === 0) throw new Error('connection_samples_missing');
  return Math.max(...samples.map((sample) => sample.administrativeConnections));
}

function docker(args: string[]): string {
  const result = spawnSync('docker', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
    killSignal: 'SIGTERM',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`docker_evidence_command_failed:${args[0]}`);
  }
  return result.stdout;
}

function redisCliApplicationConnections(container: string): number {
  const list = docker([
    'exec',
    container,
    'redis-cli',
    '--raw',
    'CLIENT',
    'LIST',
  ]);
  return list.split('\n').filter((line) => line.trim()).length - 1;
}

async function expectAllRejected(promises: Promise<unknown>[]): Promise<void> {
  const outcomes = await Promise.allSettled(promises);
  expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
}

async function expectAllResolved(promises: Promise<unknown>[]): Promise<void> {
  const outcomes = await Promise.allSettled(promises);
  expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(
    true,
  );
}

async function expectQueueCommandRejectedWithin(
  operation: () => Promise<unknown>,
): Promise<number> {
  const startedAt = performance.now();
  await expect(operation()).rejects.toThrow('queue_redis_unavailable');
  const elapsedMilliseconds = Math.ceil(performance.now() - startedAt);
  expect(elapsedMilliseconds).toBeLessThanOrEqual(2_000);
  return elapsedMilliseconds;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error('evidence_condition_timeout');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function listen(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeSocketServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('socket_io_event_timeout')),
        5_000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
