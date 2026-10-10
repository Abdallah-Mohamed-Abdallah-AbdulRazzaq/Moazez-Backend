import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Readable } from 'node:stream';
import { setTimeout as pollDelay } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureHttpApplication } from '../../src/bootstrap/http-application';
import { validateEnv } from '../../src/config/env.validation';
import { PrismaModule } from '../../src/infrastructure/database/prisma.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import {
  OBJECT_STORAGE_PORT,
  ObjectStoragePort,
  ObjectStoragePutInput,
  ObjectStorageResumableUploadInput,
  ObjectStorageSignedGetOverrides,
  ObjectStorageSignedCapability,
} from '../../src/infrastructure/storage/object-storage.port';
import { TokenService } from '../../src/modules/iam/auth/domain/token.service';
import { CoreWorkerConsumersModule } from '../../src/runtime/core-worker/core-worker-consumers.module';
import { validateCoreWorkerEnv } from '../../src/runtime/runtime-env.validation';
import { AcademicContentEngagementFixture } from './academic-content-engagement.fixture';

export type JourneyActor =
  | 'school'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'foreignStudent';
export type JourneyContent = { id: string; status: string };
export type JourneyPublication = {
  publicationId: string;
  revisionId: string;
  status: string;
};
export type JourneyDetail = {
  content: {
    contentId: string;
    publicationId: string;
    revisionId: string;
    links: { revisionLinkId: string; label: string; url: string }[];
    assets: { fileId: string }[];
    details: { joinUrl?: string } | null;
  };
};

/** Only the external storage boundary is doubled. Verification, File and Asset writes stay real. */
export class ACC12IsolatedStorageProviderContractDouble implements ObjectStoragePort {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();
  readonly issuedGets: {
    expiresInSeconds: number;
    overrides?: ObjectStorageSignedGetOverrides;
  }[] = [];
  readonly sessions: ObjectStorageResumableUploadInput[] = [];
  getCapabilities() {
    return { resumableUpload: true, rangeRead: true };
  }
  createResumableUploadSession(input: ObjectStorageResumableUploadInput) {
    this.sessions.push(input);
    return Promise.resolve({
      sessionUrl: `https://storage.acc12.invalid/upload?capability=${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
  }
  putObject(input: ObjectStoragePutInput) {
    if (!Buffer.isBuffer(input.body))
      throw new Error('fixture_requires_buffer');
    this.objects.set(input.objectKey, {
      bytes: input.body,
      contentType: input.contentType ?? 'application/pdf',
    });
    return Promise.resolve({
      etag: 'fixture-etag',
      generation: '1',
      version: null,
    });
  }
  statObject(input: { objectKey: string }) {
    const object = this.objects.get(input.objectKey);
    if (!object) throw new Error('fixture_object_missing');
    return Promise.resolve({
      size: object.bytes.length,
      etag: 'fixture-etag',
      contentType: object.contentType,
      metadata: {},
      lastModified: new Date(),
      generation: '1',
      version: null,
    });
  }
  readObjectRange(input: {
    objectKey: string;
    offset: number;
    length: number;
  }) {
    const object = this.objects.get(input.objectKey);
    if (!object) throw new Error('fixture_object_missing');
    return Promise.resolve(
      object.bytes.subarray(input.offset, input.offset + input.length),
    );
  }
  getObject(input: { objectKey: string }) {
    return Promise.resolve(
      Readable.from(
        this.objects.get(input.objectKey)?.bytes ?? Buffer.alloc(0),
      ),
    );
  }
  deleteObject(input: { objectKey: string }) {
    this.objects.delete(input.objectKey);
    return Promise.resolve();
  }
  objectExists(input: { objectKey: string }) {
    return Promise.resolve(this.objects.has(input.objectKey));
  }
  listObjectsPage() {
    return Promise.resolve({ objects: [], nextCursor: null });
  }
  createSignedPutUrl(): Promise<ObjectStorageSignedCapability> {
    throw new Error('fixture_signed_put_not_used');
  }
  createSignedGetUrl(input: {
    expiresInSeconds: number;
    overrides?: ObjectStorageSignedGetOverrides;
  }) {
    this.issuedGets.push(input);
    return Promise.resolve({
      url: `https://storage.acc12.invalid/get?capability=${randomUUID()}`,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    });
  }
  isBucketAvailable() {
    return Promise.resolve(true);
  }
}

/** Canonical CI supplies a disposable ci_<digest> PostgreSQL database. Redis is separately owned. */
export class AcademicContentACC12JourneyFixture {
  readonly prisma = new PrismaService();
  readonly prerequisites = new AcademicContentEngagementFixture(this.prisma);
  readonly teacherId = randomUUID();
  readonly allocationId = randomUUID();
  readonly storage = new ACC12IsolatedStorageProviderContractDouble();
  private readonly redisOwner = randomUUID();
  private readonly redisName = `moazez-acc12-${this.redisOwner}`;
  private redisCreated = false;
  private databaseVerified = false;
  private core?: TestingModule;
  private app?: INestApplication;
  private readonly tokens = new Map<JourneyActor, string>();
  get school() {
    return this.prerequisites.school;
  }
  get child() {
    return this.prerequisites.children[0];
  }
  get api() {
    if (!this.app) throw new Error('fixture_api_not_initialized');
    return this.app;
  }
  get queues() {
    return this.api.get(BullmqService);
  }

  async start() {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      process.env.NODE_ENV !== 'test' ||
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      !/^\/ci_[a-f0-9]+$/.test(database.pathname)
    )
      throw new Error('acc12_requires_canonical_disposable_database');
    this.databaseVerified = true;
    try {
      execFileSync(
        'docker',
        [
          'run',
          '-d',
          '--name',
          this.redisName,
          '--label',
          `com.moazez.acc12.owner=${this.redisOwner}`,
          '-p',
          '127.0.0.1::6379',
          'redis:7-alpine',
        ],
        { stdio: 'pipe', timeout: 30_000 },
      );
      this.redisCreated = true;
      const port = execFileSync(
        'docker',
        ['port', this.redisName, '6379/tcp'],
        { encoding: 'utf8', timeout: 10_000 },
      )
        .trim()
        .split(':')
        .at(-1);
      const redisUrl = `redis://127.0.0.1:${port}/0`;
      await this.prisma.$connect();
      await this.prerequisites.create();
      await this.prisma.user.create({
        data: {
          id: this.teacherId,
          userType: 'TEACHER',
          email: `${this.teacherId}@acc12.test`,
          firstName: 'Private',
          lastName: 'Fixture',
        },
      });
      const codes = [
        'academics.academic_content.view',
        'academics.academic_content.manage',
        'academics.academic_content.approve',
        'academics.academic_content.publish',
        'academics.academic_content.settings.manage',
        'academics.academic_content.analytics.own.view',
        'communication.notifications.view',
        'communication.notifications.read',
      ];
      const permissions = await this.prisma.permission.findMany({
        where: { code: { in: codes } },
      });
      expect(permissions).toHaveLength(codes.length);
      for (const [userId, userType] of [
        [this.prerequisites.authorId, UserType.SCHOOL_USER],
        [this.teacherId, UserType.TEACHER],
      ] as const) {
        const role = await this.prisma.role.create({
          data: {
            schoolId: this.school.schoolId,
            key: `acc12-${userId}`,
            name: 'ACC12 fixture',
            rolePermissions: {
              create: permissions
                .filter(
                  (p) =>
                    userType !== UserType.TEACHER ||
                    p.code !== 'academics.academic_content.approve',
                )
                .map((p) => ({ permissionId: p.id })),
            },
          },
        });
        await this.prisma.membership.create({
          data: {
            schoolId: this.school.schoolId,
            organizationId: this.school.organizationId,
            userId,
            userType,
            roleId: role.id,
          },
        });
      }
      await this.prisma.rolePermission.createMany({
        data: permissions
          .filter((p) => p.code.startsWith('communication.notifications.'))
          .map((p) => ({
            roleId: this.prerequisites.parentRoleId,
            permissionId: p.id,
          })),
      });
      await this.prisma.teacherSubjectAllocation.create({
        data: {
          id: this.allocationId,
          schoolId: this.school.schoolId,
          classroomId: this.school.classroomId,
          subjectId: this.school.subjectId,
          termId: this.school.termId,
          teacherUserId: this.teacherId,
        },
      });
      const apiConfig = new ConfigService({
        ...validateEnv(process.env),
        QUEUE_REDIS_URL: redisUrl,
        REALTIME_REDIS_URL: redisUrl,
      });
      const apiModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ConfigService)
        .useValue(apiConfig)
        .overrideProvider(PrismaService)
        .useValue(this.prisma)
        .overrideProvider(OBJECT_STORAGE_PORT)
        .useValue(this.storage)
        .compile();
      this.app = apiModule.createNestApplication();
      configureHttpApplication(this.app, {
        environment: 'test',
        corsOrigins: undefined,
        swaggerEnabled: false,
      });
      await this.app.init();
      expect(this.queues.getRegisteredWorkerQueueNames()).toEqual([]);
      const coreConfig = new ConfigService({
        ...validateCoreWorkerEnv({
          ...process.env,
          DATABASE_RUNTIME_ROLE: 'core-worker',
        }),
        QUEUE_REDIS_URL: redisUrl,
        REALTIME_REDIS_URL: redisUrl,
      });
      this.core = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          PrismaModule,
          CoreWorkerConsumersModule,
        ],
      })
        .overrideProvider(ConfigService)
        .useValue(coreConfig)
        .overrideProvider(PrismaService)
        .useValue(this.prisma)
        .overrideProvider(OBJECT_STORAGE_PORT)
        .useValue(this.storage)
        .compile();
      await this.core.init();
      expect(
        this.core.get(BullmqService).getRegisteredWorkerQueueNames(),
      ).toHaveLength(8);
      const issuer = this.app.get(TokenService);
      for (const [actor, id, kind] of [
        ['school', this.prerequisites.authorId, 'SCHOOL_USER'],
        ['teacher', this.teacherId, 'TEACHER'],
        ['student', this.child.userId, 'STUDENT'],
        ['parent', this.prerequisites.parentId, 'PARENT'],
        ['foreignStudent', this.prerequisites.children[2].userId, 'STUDENT'],
      ] as const) {
        const pair = await issuer.issueTokens(id, kind);
        await this.prisma.session.create({
          data: {
            id: pair.refreshSessionId,
            userId: id,
            refreshTokenHash: pair.refreshTokenHash,
            expiresAt: pair.refreshExpiresAt,
          },
        });
        this.tokens.set(actor, pair.accessToken);
      }
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async http<T = Record<string, unknown>>(
    method: 'get' | 'post' | 'put' | 'patch',
    path: string,
    actor: JourneyActor | null = 'school',
    body?: object,
    status = method === 'post' ? 201 : 200,
  ) {
    let call = request(this.api.getHttpServer() as Server)[method](
      `/api/v1/${path}`,
    );
    if (actor)
      call = call.set('Authorization', `Bearer ${this.tokens.get(actor)}`);
    if (body) call = call.send(body);
    const response = await call.expect(status);
    return {
      body: response.body as T,
      headers: response.headers as Record<string, string>,
      status: response.status,
    };
  }

  parentPath(contentId: string, childId = this.child.studentId) {
    return `parent/children/${childId}/academic-content/${contentId}`;
  }
  async completed(queueName: string, jobId: string, timeoutMs = 40_000) {
    return this.until(async () => {
      const job = await this.queues.getQueue(queueName).getJob(jobId);
      if (!job) return undefined;
      const state = await job.getState();
      if (state === 'failed')
        throw new Error(`acc12_consumer_failed:${queueName}`);
      return state === 'completed' ? job : undefined;
    }, timeoutMs);
  }
  async until<T>(
    read: () => Promise<T | undefined>,
    timeoutMs = 40_000,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await read();
      if (result !== undefined) return result;
      await pollDelay(Math.min(25, Math.max(1, deadline - Date.now())));
    }
    throw new Error('acc12_poll_deadline_exceeded');
  }

  async stop() {
    try {
      if (!this.databaseVerified) return;
      if (this.core) {
        await this.core.close();
        this.core = undefined;
      }
      if (this.app) {
        await this.app.close();
        this.app = undefined;
      }
      // Every deletion is constrained to the unique fixture schools; no shared catalogs are removed.
      const where = {
        schoolId: { in: this.prerequisites.schools.map((s) => s.schoolId) },
      };
      await this.prisma.communicationNotificationPushAttempt.deleteMany({
        where,
      });
      await this.prisma.communicationNotificationDelivery.deleteMany({ where });
      await this.prisma.communicationNotification.deleteMany({ where });
      await this.prisma.academicContentAcknowledgement.deleteMany({ where });
      await this.prisma.academicContentApproval.deleteMany({ where });
      await this.prisma.academicContentAudienceRecipientTarget.deleteMany({
        where,
      });
      await this.prisma.academicContentAudienceRecipient.deleteMany({ where });
      await this.prisma.academicContentRevisionTag.deleteMany({ where });
      await this.prisma.academicContentAsset.deleteMany({ where });
      await this.prisma.academicContentLink.deleteMany({ where });
      await this.prisma.academicContentTag.deleteMany({ where });
      await this.prisma.academicContentTarget.deleteMany({ where });
      await this.prisma.academicContentPreparationDetail.deleteMany({ where });
      await this.prisma.academicContentWeeklyPlanHomeworkReference.deleteMany({
        where,
      });
      await this.prisma.academicContentWeeklyPlanAssessmentReference.deleteMany(
        { where },
      );
      await this.prisma.academicContentWeeklyPlanDetail.deleteMany({ where });
      await this.prisma.academicContentGuardianNoteDetail.deleteMany({ where });
      await this.prisma.academicContentSubjectResourceDetail.deleteMany({
        where,
      });
      await this.prisma.academicContentOnlineSessionDetail.deleteMany({
        where,
      });
      await this.prisma.fileUploadSession.deleteMany({ where });
      await this.prisma.academicContentNotificationPolicy.deleteMany({ where });
      await this.prisma.academicContentWorkflowPolicy.deleteMany({ where });
      await this.prisma.auditLog.deleteMany({ where });
      await this.prisma.teacherSubjectAllocation.deleteMany({ where });
      await this.prerequisites.dispose();
      await this.prisma.user.deleteMany({ where: { id: this.teacherId } });
      expect(
        await this.prisma.school.count({
          where: {
            id: { in: this.prerequisites.schools.map((s) => s.schoolId) },
          },
        }),
      ).toBe(0);
      expect(
        await this.prisma.user.findUnique({ where: { id: this.teacherId } }),
      ).toBeNull();
    } finally {
      await this.prisma.$disconnect();
      this.disposeRedis();
    }
  }

  private disposeRedis() {
    if (this.redisCreated) {
      const owner = execFileSync(
        'docker',
        [
          'inspect',
          '--format',
          '{{ index .Config.Labels "com.moazez.acc12.owner" }}',
          this.redisName,
        ],
        { encoding: 'utf8', timeout: 10_000 },
      ).trim();
      if (owner !== this.redisOwner)
        throw new Error('acc12_redis_cleanup_owner_mismatch');
      execFileSync('docker', ['rm', '-f', this.redisName], {
        stdio: 'pipe',
        timeout: 20_000,
      });
      this.redisCreated = false;
    }
  }
}
