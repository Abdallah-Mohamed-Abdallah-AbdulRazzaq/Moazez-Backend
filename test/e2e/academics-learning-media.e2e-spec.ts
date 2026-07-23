import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  LessonContentItemType,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const PASSWORD = 'LearningMediaE2E123!';
const GLOBAL_PREFIX = '/api/v1';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type LoginBody = { accessToken: string };
type UploadIntentBody = {
  id: string;
  status: FileUploadSessionStatus;
  uploadUrl: string;
};
type UploadCompletionBody = {
  id: string;
  fileId: string;
  status: FileUploadSessionStatus;
  mimeType: string;
  sizeBytes: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

jest.setTimeout(180_000);

describe('Academics learning media production HTTP path', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storage: StorageService;
  let accessToken = '';
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    organizationId: '',
    schoolId: '',
    actorId: '',
    historicalUploaderId: '',
    academicYearId: '',
    termId: '',
    stageId: '',
    gradeId: '',
    subjectId: '',
    curriculumId: '',
    unitId: '',
    lessonId: '',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const role = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error('school_admin seed role is required');
    const organization = await prisma.organization.create({
      data: {
        name: `Learning Media E2E ${suffix}`,
        slug: `learning-media-e2e-${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    ids.organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        name: `Learning Media E2E School ${suffix}`,
        slug: `learning-media-e2e-school-${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    ids.schoolId = school.id;
    const actor = await prisma.user.create({
      data: {
        email: `learning-media-e2e-${suffix}@example.test`,
        firstName: 'Media',
        lastName: 'Manager',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
    });
    ids.actorId = actor.id;
    await prisma.membership.create({
      data: {
        userId: actor.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const historical = await prisma.user.create({
      data: {
        email: `learning-media-e2e-teacher-${suffix}@example.test`,
        firstName: 'Historical',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    });
    ids.historicalUploaderId = historical.id;
    await createAcademicTree();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue({
        createWorker: jest.fn().mockReturnValue({ on: jest.fn() }),
        addJob: jest.fn().mockResolvedValue(undefined),
        getQueue: jest.fn(),
        getQueueReadiness: jest.fn().mockResolvedValue({
          name: 'test',
          status: 'ok',
          counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        }),
        ping: jest.fn().mockResolvedValue(undefined),
      })
      .compile();
    storage = moduleRef.get(StorageService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
    const login = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({
        email: `learning-media-e2e-${suffix}@example.test`,
        password: PASSWORD,
      })
      .expect(200);
    accessToken = (login.body as LoginBody).accessToken;
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      const sessions = await prisma.fileUploadSession.findMany({
        where: { schoolId: ids.schoolId },
      });
      for (const session of sessions) {
        if (session.stagingBucket && session.stagingObjectKey) {
          await storage
            .deleteObject({
              bucket: session.stagingBucket,
              objectKey: session.stagingObjectKey,
            })
            .catch(() => undefined);
        }
        await storage
          .deleteObject({
            bucket: session.finalBucket,
            objectKey: session.finalObjectKey,
          })
          .catch(() => undefined);
      }
      await prisma.session.deleteMany({
        where: { userId: { in: [ids.actorId, ids.historicalUploaderId] } },
      });
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.lessonContentItem.deleteMany({
        where: { schoolId: ids.schoolId },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.schoolId },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.curriculumLesson.delete({ where: { id: ids.lessonId } });
      await prisma.curriculumUnit.delete({ where: { id: ids.unitId } });
      await prisma.curriculum.delete({ where: { id: ids.curriculumId } });
      await prisma.subject.delete({ where: { id: ids.subjectId } });
      await prisma.grade.delete({ where: { id: ids.gradeId } });
      await prisma.stage.delete({ where: { id: ids.stageId } });
      await prisma.term.delete({ where: { id: ids.termId } });
      await prisma.academicYear.delete({ where: { id: ids.academicYearId } });
      await prisma.membership.deleteMany({
        where: { userId: { in: [ids.actorId, ids.historicalUploaderId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [ids.actorId, ids.historicalUploaderId] } },
      });
      await prisma.school.delete({ where: { id: ids.schoolId } });
      await prisma.organization.delete({ where: { id: ids.organizationId } });
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('executes guarded create, signed PUT, completion, and immutable final read', async () => {
    const original = Buffer.from('HTTP production path lesson text A\n');
    const create = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/learning-media/uploads`)
      .set('Authorization', bearer())
      .send({
        clientRequestId: randomUUID(),
        originalName: 'lesson.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: original.byteLength.toString(),
      })
      .expect(201);
    const createBody = create.body as UploadIntentBody;
    expect(createBody.status).toBe(FileUploadSessionStatus.UPLOADING);
    expectSafeBody(createBody);
    const upload = await fetch(createBody.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: original,
    });
    expect(upload.ok).toBe(true);

    const complete = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/academics/learning-media/uploads/${createBody.id}/complete`,
      )
      .set('Authorization', bearer())
      .send({})
      .expect(200);
    const completeBody = complete.body as UploadCompletionBody;
    expect(completeBody).toMatchObject({
      id: createBody.id,
      status: FileUploadSessionStatus.READY,
      mimeType: 'text/plain',
      sizeBytes: original.byteLength.toString(),
      durationSeconds: null,
      width: null,
      height: null,
    });
    expectSafeBody(completeBody);
    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: createBody.id },
    });
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: completeBody.fileId },
    });
    expect(file.objectKey).toBe(session.finalObjectKey);
    expect(file.objectKey).not.toBe(session.stagingObjectKey);
    const finalBytes = await readObject(file.bucket, file.objectKey);
    expect(finalBytes).toEqual(original);
  });

  it('keeps DTO rejection behind the real management guards and global pipe', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/learning-media/uploads`)
      .set('Authorization', bearer())
      .send({
        clientRequestId: randomUUID(),
        originalName: 'lesson.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: '10',
        bucket: 'client-controlled',
      })
      .expect(400);
  });

  it('verifies a referenced Teacher-owned LEGACY File as the current manager', async () => {
    const body = Buffer.from('historical teacher lesson text\n');
    const finalBucket = storage.resolveBucket(FileVisibility.PRIVATE);
    const finalObjectKey = `learning-media/${ids.schoolId}/legacy/${randomUUID()}`;
    await storage.saveObject({
      bucket: finalBucket,
      objectKey: finalObjectKey,
      body,
      contentType: 'text/plain',
    });
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        uploaderId: ids.historicalUploaderId,
        bucket: finalBucket,
        objectKey: finalObjectKey,
        originalName: 'legacy.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(body.byteLength),
      },
    });
    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const legacy = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.historicalUploaderId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'legacy.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: BigInt(body.byteLength),
        stagingBucket: null,
        stagingObjectKey: null,
        finalBucket,
        finalObjectKey,
        status: FileUploadSessionStatus.LEGACY,
        createdAt,
        expiresAt: createdAt,
        verificationVersion: 'legacy_metadata_v1',
        fileId: file.id,
      },
    });
    await prisma.lessonContentItem.create({
      data: {
        schoolId: ids.schoolId,
        curriculumId: ids.curriculumId,
        unitId: ids.unitId,
        lessonId: ids.lessonId,
        type: LessonContentItemType.FILE,
        title: 'Referenced historical lesson file',
        fileId: file.id,
        createdByUserId: ids.actorId,
      },
    });

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/academics/learning-media/uploads/legacy/${legacy.id}/verify`,
      )
      .set('Authorization', bearer())
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({
      id: legacy.id,
      fileId: file.id,
      status: FileUploadSessionStatus.READY,
      mimeType: 'text/plain',
    });
    expectSafeBody(response.body);
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: file.id } }))
        .uploaderId,
    ).toBe(ids.historicalUploaderId);
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: {
            resourceId: legacy.id,
            action: 'learning.media.upload.complete',
          },
        })
      ).actorId,
    ).toBe(ids.actorId);
  });

  async function createAcademicTree(): Promise<void> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: ids.schoolId,
        nameAr: `Media E2E Year AR ${suffix}`,
        nameEn: `Media E2E Year ${suffix}`,
        startDate: new Date('2034-09-01T00:00:00.000Z'),
        endDate: new Date('2035-06-30T00:00:00.000Z'),
        isActive: true,
      },
    });
    ids.academicYearId = year.id;
    const term = await prisma.term.create({
      data: {
        schoolId: ids.schoolId,
        academicYearId: year.id,
        nameAr: `Media E2E Term AR ${suffix}`,
        nameEn: `Media E2E Term ${suffix}`,
        startDate: new Date('2034-09-01T00:00:00.000Z'),
        endDate: new Date('2034-12-31T00:00:00.000Z'),
        isActive: true,
      },
    });
    ids.termId = term.id;
    const stage = await prisma.stage.create({
      data: {
        schoolId: ids.schoolId,
        nameAr: `Media E2E Stage AR ${suffix}`,
        nameEn: `Media E2E Stage ${suffix}`,
      },
    });
    ids.stageId = stage.id;
    const grade = await prisma.grade.create({
      data: {
        schoolId: ids.schoolId,
        stageId: stage.id,
        nameAr: `Media E2E Grade AR ${suffix}`,
        nameEn: `Media E2E Grade ${suffix}`,
      },
    });
    ids.gradeId = grade.id;
    const subject = await prisma.subject.create({
      data: {
        schoolId: ids.schoolId,
        nameAr: `Media E2E Subject AR ${suffix}`,
        nameEn: `Media E2E Subject ${suffix}`,
        code: `MEDIA-E2E-${suffix}`,
      },
    });
    ids.subjectId = subject.id;
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: ids.schoolId,
        academicYearId: year.id,
        termId: term.id,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `Media E2E Curriculum ${suffix}`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: ids.actorId,
      },
    });
    ids.curriculumId = curriculum.id;
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: ids.schoolId,
        curriculumId: curriculum.id,
        title: `Media E2E Unit ${suffix}`,
      },
    });
    ids.unitId = unit.id;
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: ids.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `Media E2E Lesson ${suffix}`,
      },
    });
    ids.lessonId = lesson.id;
  }

  function bearer(): string {
    return `Bearer ${accessToken}`;
  }

  function expectSafeBody(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'stagingBucket',
      'stagingObjectKey',
      'finalBucket',
      'finalObjectKey',
      'checksumSha256',
      'originalName',
      'createdByUserId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function readObject(
    bucket: string,
    objectKey: string,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = await storage.getObject({ bucket, objectKey });
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
});
