import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request, { type Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { HomeworkQuestionAssetsFixture } from './homework-question-assets.fixture';
import type { MediaFixtureActor } from './assessment-media.fixture';
import type { HomeworkQuestionAssetDto } from '../../src/modules/homework/dto/homework-question-asset.dto';

export const st06Json = <T>(response: Response): T => response.body as T;
export type HttpAssetActor = MediaFixtureActor | 'parent';
export type HttpHomeworkGraph = Awaited<
  ReturnType<HomeworkQuestionAssetsFixture['graph']>
>;

/** Actual JWT/login + Nest HTTP. Only runtime upload enablement is test-wired;
 * the application's unapproved attestation provider is never replaced. */
export class HomeworkQuestionAssetsHttp {
  readonly prisma = new PrismaService();
  app!: INestApplication<Server>;
  fixture!: HomeworkQuestionAssetsFixture;
  private readonly password = `Owned-ST06-${randomUUID()}!`;
  private passwordHash!: string;
  private tokens: Partial<Record<HttpAssetActor, string>> = {};
  async start(): Promise<void> {
    this.fixture = new HomeworkQuestionAssetsFixture(this.prisma); // guard before connect/provider override
    await this.prisma.$connect();
    this.passwordHash = await argon2.hash(this.password, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AssessmentMediaRuntimePolicy)
      .useValue(
        new AssessmentMediaRuntimePolicy(
          new ConfigService({
            NODE_ENV: 'test',
            ASSESSMENT_MEDIA_UPLOADS_ENABLED: true,
          }),
        ),
      )
      .compile();
    this.app = module.createNestApplication<INestApplication<Server>>();
    this.app.setGlobalPrefix('api/v1');
    this.app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await this.app.init();
  }
  async reset(): Promise<void> {
    this.fixture = new HomeworkQuestionAssetsFixture(this.prisma);
    await this.fixture.create();
    this.tokens = {};
    const actors = [
      ...Object.entries(this.fixture.actors).map(([name, actor]) => ({
        name: name as HttpAssetActor,
        userId: actor.userId,
      })),
      { name: 'parent' as const, userId: this.fixture.parentId },
    ];
    for (const actor of actors) {
      const user = await this.prisma.user.update({
        where: { id: actor.userId },
        data: { passwordHash: this.passwordHash },
        select: { email: true },
      });
      const response = await this.http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: this.password });
      if (response.status !== 200)
        throw new Error(
          `Owned fixture login failed with status ${response.status}`,
        );
      const body = st06Json<{ accessToken?: string }>(response);
      if (typeof body.accessToken !== 'string')
        throw new Error('Owned fixture login did not return an access token');
      this.tokens[actor.name] = body.accessToken;
    }
  }
  http() {
    return request(this.app.getHttpServer());
  }
  headers(name: HttpAssetActor = 'teacher') {
    const school =
      name === 'parent'
        ? this.fixture.school
        : this.fixture.schools[this.fixture.actors[name].school];
    return {
      Authorization: `Bearer ${this.tokens[name]}`,
      'X-School-Id': school.schoolId,
    };
  }
  core(graph: HttpHomeworkGraph, question = 0) {
    return `/api/v1/homework/assignments/${graph.homework.id}/questions/${graph.questions[question].id}/assets`;
  }
  teacher(
    graph: HttpHomeworkGraph,
    question = 0,
    owner: 'teacher' | 'otherTeacher' | 'foreignTeacher' = 'teacher',
  ) {
    return `/api/v1/teacher/homeworks/classes/${this.fixture.allocations[owner]}/assignments/${graph.homework.id}/questions/${graph.questions[question].id}/assets`;
  }
  student(
    graph: HttpHomeworkGraph,
    question: number,
    assetId: string,
    mode: 'preview' | 'download' = 'preview',
  ) {
    return `/api/v1/student/homeworks/${graph.homework.id}/questions/${graph.questions[question].id}/assets/${assetId}/${mode}`;
  }
  async bind(
    graph: HttpHomeworkGraph,
    question = 0,
    actor: 'teacher' | 'admin' | 'organization' = 'teacher',
    bytes?: Buffer,
    filename?: string,
  ) {
    const ready = await this.fixture.ready(
      graph.homework.id,
      actor,
      bytes,
      'HOMEWORK_ASSIGNMENT_MEDIA',
      filename,
    );
    const path =
      actor === 'teacher'
        ? this.teacher(graph, question)
        : this.core(graph, question);
    const response = await this.http()
      .post(path)
      .set(this.headers(actor))
      .send({
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      })
      .expect((response) => {
        if (response.status !== 201)
          throw new Error(
            `Owned ${actor} bind: ${response.status} ${JSON.stringify(response.body)}`,
          );
      });
    return {
      ready,
      asset: st06Json<{ asset: HomeworkQuestionAssetDto }>(response).asset,
    };
  }
  async external(graph: HttpHomeworkGraph, question = 0) {
    const response = await this.http()
      .post(this.teacher(graph, question))
      .set(this.headers())
      .send({
        sourceType: 'EXTERNAL_HTTPS',
        externalUrl: 'https://media.example.org/reference.txt',
      })
      .expect(201);
    return st06Json<{ asset: HomeworkQuestionAssetDto }>(response).asset;
  }
  async publish(graph: HttpHomeworkGraph): Promise<void> {
    const response = await this.http()
      .post(
        `/api/v1/teacher/homeworks/classes/${this.fixture.allocations.teacher}/assignments/${graph.homework.id}/publish`,
      )
      .set(this.headers())
      .send({});
    if (![200, 201].includes(response.status))
      throw new Error(
        `Owned Homework publication failed with status ${response.status}`,
      );
  }
  async disposeCase(): Promise<void> {
    jest.restoreAllMocks();
    await this.fixture.dispose();
  }
  async close(): Promise<void> {
    if (this.app) await this.app.close();
    await this.prisma.$disconnect();
  }
}
