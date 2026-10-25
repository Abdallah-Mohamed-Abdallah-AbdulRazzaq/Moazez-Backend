import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { get as httpGet } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { UnapprovedAssessmentMediaSecurityGate } from '../../src/modules/files/assessment-media/application/assessment-media-verifier';
import {
  HomeworkQuestionAssetsHttp,
  st06Json,
} from '../fixtures/homework-question-assets.http';
import type { HomeworkQuestionAssetDto } from '../../src/modules/homework/dto/homework-question-asset.dto';
import type { StudentHomeworkResponseDto } from '../../src/modules/student-app/homeworks/dto/student-homeworks.dto';

jest.setTimeout(180000);
describe('ST-06 complete Homework question assets over actual JWT/HTTP and private bytes', () => {
  const h = new HomeworkQuestionAssetsHttp();
  beforeAll(async () => {
    await h.start();
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterEach(async () => {
    await h.disposeCase();
  });
  afterAll(async () => {
    await h.close();
  });

  it('keeps distinct question assets and an empty question in the existing student detail wrapper', async () => {
    const graph = await h.fixture.graph();
    const a = await h.bind(
      graph,
      0,
      'teacher',
      Buffer.from('Actual question A bytes\n'),
    );
    const b = await h.bind(
      graph,
      1,
      'teacher',
      Buffer.from('Actual question B bytes\n'),
    );
    await h.publish(graph);
    const response = await h
      .http()
      .get(`/api/v1/student/homeworks/${graph.homework.id}`)
      .set(h.headers('student'))
      .expect(200);
    const homework = st06Json<StudentHomeworkResponseDto>(response).homework;
    const questions = new Map(
      homework.questions.map((question) => [question.questionId, question]),
    );
    expect(
      questions
        .get(graph.questions[0].id)
        ?.assets.map((asset) => asset.assetId),
    ).toEqual([a.asset.assetId]);
    expect(
      questions
        .get(graph.questions[1].id)
        ?.assets.map((asset) => asset.assetId),
    ).toEqual([b.asset.assetId]);
    expect(questions.get(graph.questions[2].id)?.assets).toEqual([]);
    expect(homework.attachments).toEqual([]);
    const safe = JSON.stringify(homework.questions);
    for (const secret of [
      a.ready.fileId,
      a.ready.file.objectKey,
      a.ready.file.bucket,
      'expectedAnswer',
      'isCorrect',
      'assessmentSecurityEvidence',
      'uploadId',
    ])
      expect(safe).not.toContain(secret);
    await h.prisma.homeworkAssignment.update({
      where: { id: graph.homework.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await h
      .http()
      .get(a.asset.access!.previewPath!)
      .set(h.headers('student'))
      .expect(403); // author permissions are not a student shortcut
    await h
      .http()
      .get(h.student(graph, 0, a.asset.assetId))
      .set(h.headers('student'))
      .expect(200);
  });
  it('allows Core and Organization authors through their own scoped contracts', async () => {
    const graph = await h.fixture.graph();
    for (const actor of ['admin', 'organization'] as const) {
      const { asset } = await h.bind(graph, 0, actor);
      await h
        .http()
        .get(`${h.core(graph)}/${asset.assetId}`)
        .set(h.headers(actor))
        .expect(200);
    }
    const empty = await h
      .http()
      .get(h.core(graph, 2))
      .set(h.headers('admin'))
      .expect(200);
    expect(st06Json<{ questionId: string; assets: unknown[] }>(empty)).toEqual({
      questionId: graph.questions[2].id,
      assets: [],
    });
  });
  it('updates display metadata, reorders deterministically and soft-deletes with 204', async () => {
    const graph = await h.fixture.graph(),
      a = await h.external(graph),
      b = await h.external(graph);
    const path = `${h.teacher(graph)}/${a.assetId}`;
    const updated = await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({
        title: 'Reference',
        description: 'Plain display label',
        category: 'DOCUMENT',
      })
      .expect(200);
    expect(
      st06Json<{ asset: HomeworkQuestionAssetDto }>(updated).asset,
    ).toMatchObject({
      title: 'Reference',
      description: 'Plain display label',
      category: 'DOCUMENT',
    });
    await h
      .http()
      .patch(`${path}/reorder`)
      .set(h.headers())
      .send({ sortOrder: 2 })
      .expect(200);
    const list = await h
      .http()
      .get(h.teacher(graph))
      .set(h.headers())
      .expect(200);
    expect(
      st06Json<{ assets: HomeworkQuestionAssetDto[] }>(list).assets.map(
        (row) => row.assetId,
      ),
    ).toEqual([b.assetId, a.assetId]);
    await h.http().delete(path).set(h.headers()).expect(204);
    await h.http().get(path).set(h.headers()).expect(404);
  });
  it('returns external references without managed paths, File creation or remote fetching', async () => {
    const graph = await h.fixture.graph(),
      before = await h.prisma.file.count();
    const fetch = jest.spyOn(globalThis, 'fetch');
    const asset = await h.external(graph);
    expect(asset).toMatchObject({
      sourceType: 'EXTERNAL_HTTPS',
      externalUrl: 'https://media.example.org/reference.txt',
      file: null,
      access: null,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await h.prisma.file.count()).toBe(before);
    fetch.mockRestore();
    await h.publish(graph);
    const detail = await h
      .http()
      .get(`/api/v1/student/homeworks/${graph.homework.id}`)
      .set(h.headers('student'))
      .expect(200);
    expect(
      st06Json<StudentHomeworkResponseDto>(detail).homework.questions.find(
        (row) => row.questionId === graph.questions[0].id,
      )?.assets[0],
    ).toMatchObject({ externalUrl: asset.externalUrl, access: null });
    await h
      .http()
      .get(h.student(graph, 0, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
  });
  it('streams real private bytes with GET, Range, HEAD, If-Range and secure headers', async () => {
    const graph = await h.fixture.graph(),
      { ready, asset } = await h.bind(
        graph,
        0,
        'teacher',
        Buffer.from('0123456789 actual private bytes\n'),
        'reference "quoted".txt',
      );
    await h.publish(graph);
    const preview = h.student(graph, 0, asset.assetId),
      download = h.student(graph, 0, asset.assetId, 'download');
    const full = await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .expect(200);
    expect(Buffer.from(full.text)).toEqual(ready.bytes);
    expect(full.headers['cache-control']).toContain('no-store');
    expect(full.headers['cache-control']).toContain('private');
    expect(full.headers['x-content-type-options']).toBe('nosniff');
    expect(full.headers['content-disposition']).toMatch(/^inline;/u);
    expect(full.headers['content-disposition']).not.toMatch(/[\r\n]/u);
    expect(full.headers['content-length']).toBe(String(ready.bytes.length));
    const range = await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .set('Range', 'bytes=2-5')
      .expect(206);
    expect(range.text).toBe('2345');
    expect(range.headers['content-range']).toBe(
      `bytes 2-5/${ready.bytes.length}`,
    );
    for (const invalid of ['bytes=999999-', 'bytes=0-1,3-4', 'invalid'])
      await h
        .http()
        .get(preview)
        .set(h.headers('student'))
        .set('Range', invalid)
        .expect(416);
    const head = await h
      .http()
      .head(preview)
      .set(h.headers('student'))
      .expect(200);
    expect(head.text).toBeUndefined();
    expect(head.headers['content-length']).toBe(String(ready.bytes.length));
    const mismatch = await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .set('Range', 'bytes=0-1')
      .set('If-Range', '"mismatch"')
      .expect(200);
    expect(Buffer.from(mismatch.text)).toEqual(ready.bytes);
    await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .set('Range', 'bytes=0-1')
      .set('If-Range', String(full.headers.etag))
      .expect(206);
    const attached = await h
      .http()
      .get(download)
      .set(h.headers('student'))
      .expect(200);
    expect(attached.headers['content-disposition']).toMatch(/^attachment;/u);
    expect(attached.headers.location).toBeUndefined();
    await h.http().head(download).set(h.headers('student')).expect(200);
    await h
      .http()
      .get(`${h.teacher(graph)}/${asset.assetId}/preview`)
      .set(h.headers())
      .expect(200);
    await h
      .http()
      .head(`${h.core(graph)}/${asset.assetId}/download`)
      .set(h.headers('admin'))
      .expect(200);
    await h
      .http()
      .get(`/api/v1/files/${ready.fileId}/download`)
      .set(h.headers())
      .expect(403);
  });
  it.each([
    'membership',
    'permission',
    'asset',
    'question',
    'File',
    'policy',
  ] as const)(
    'reauthorizes %s after object lookup and before committing bytes',
    async (changed) => {
      const graph = await h.fixture.graph(),
        { asset, ready } = await h.bind(graph);
      await h.publish(graph);
      const storage = h.app.get(StorageService),
        get = storage.getObject.bind(storage) as StorageService['getObject'];
      jest.spyOn(storage, 'getObject').mockImplementationOnce(async (input) => {
        const stream = await get(input);
        if (changed === 'membership')
          await h.prisma.membership.update({
            where: { id: h.fixture.actors.student.membershipId },
            data: { status: 'SUSPENDED' },
          });
        if (changed === 'permission') {
          const permission = await h.prisma.permission.findUniqueOrThrow({
            where: { code: 'homework.assignments.view' },
          });
          await h.prisma.rolePermission.deleteMany({
            where: {
              roleId: h.fixture.actors.student.roleId,
              permissionId: permission.id,
            },
          });
        }
        if (changed === 'asset')
          await h.prisma.homeworkQuestionAsset.update({
            where: { id: asset.assetId },
            data: { deletedAt: new Date() },
          });
        if (changed === 'question')
          await h.prisma.homeworkQuestion.update({
            where: { id: graph.questions[0].id },
            data: { deletedAt: new Date() },
          });
        if (changed === 'File')
          await h.prisma.file.update({
            where: { id: ready.fileId },
            data: { deletedAt: new Date() },
          });
        if (changed === 'policy')
          await h.prisma.schoolAssessmentMediaPolicy.update({
            where: { schoolId: h.fixture.school.schoolId },
            data: { allowInlinePreview: false },
          });
        return stream;
      });
      const denied = await h
        .http()
        .get(h.student(graph, 0, asset.assetId))
        .set(h.headers('student'))
        .expect(404);
      expect(denied.headers['content-disposition']).toBeUndefined();
      expect(denied.text).not.toContain(ready.bytes.toString());
    },
  );
  it('aborts an actual private-object stream when the client disconnects', async () => {
    const graph = await h.fixture.graph(),
      { asset } = await h.bind(graph, 0, 'teacher', Buffer.alloc(8192, 'a'));
    await h.publish(graph);
    const storage = h.app.get(StorageService),
      original = storage.getObject.bind(storage) as StorageService['getObject'];
    let tracked:
      | {
          slow: Transform;
          source: import('node:stream').Readable;
          sent: number;
        }
      | undefined;
    jest.spyOn(storage, 'getObject').mockImplementationOnce(async (input) => {
      const source = await original(input);
      const slow = new Transform({
        transform(chunk: Buffer, _encoding, complete) {
          let offset = 0;
          const next = () => {
            if (this.destroyed || offset >= chunk.length) {
              complete();
              return;
            }
            const piece = chunk.subarray(offset, offset + 1024);
            offset += piece.length;
            if (tracked) tracked.sent += piece.length;
            this.push(piece);
            setTimeout(next, 40);
          };
          setTimeout(next, 40);
        },
      });
      tracked = { slow, source, sent: 0 };
      source.pipe(slow);
      slow.once('close', () => source.destroy());
      return slow;
    });
    const server = h.app.getHttpServer();
    if (!server.listening) await h.app.listen(0, '127.0.0.1');
    const address = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) => {
      const client = httpGet(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: h.student(graph, 0, asset.assetId),
          headers: h.headers('student'),
        },
        (response) => {
          response.once('data', () => {
            client.destroy();
            resolve();
          });
          response.once('error', () => resolve());
        },
      );
      client.once('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') resolve();
        else reject(error);
      });
    });
    const until = Date.now() + 3000;
    while (tracked && !tracked.slow.destroyed && Date.now() < until)
      await delay(10);
    expect(tracked?.slow.destroyed).toBe(true);
    expect(tracked?.source.destroyed).toBe(true);
    expect(tracked!.sent).toBeLessThan(8192);
  });
  it('denies genuine managed binding through the production release gate', async () => {
    const graph = await h.fixture.graph(),
      ready = await h.fixture.ready(graph.homework.id);
    const production = new AssessmentMediaRuntimePolicy(
      new ConfigService({
        NODE_ENV: 'production',
        ASSESSMENT_MEDIA_UPLOADS_ENABLED: true,
      }),
    );
    jest
      .spyOn(
        h.app.get(AssessmentMediaRuntimePolicy),
        'assertUploadExecutionEnabled',
      )
      .mockImplementation(() => production.assertUploadExecutionEnabled());
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        uploadId: ready.uploadId,
        fileId: ready.fileId,
      })
      .expect(409)
      .expect((response) => {
        expect(st06Json<{ error: { code: string } }>(response).error.code).toBe(
          'assessment_media.disabled',
        );
      });
    expect(
      await h.prisma.homeworkQuestionAsset.count({
        where: { homeworkQuestionId: graph.questions[0].id },
      }),
    ).toBe(0);
  });
  it.each(['allowInlinePreview', 'allowDownload'] as const)(
    'enforces current %s at projection and content lookup',
    async (flag) => {
      const graph = await h.fixture.graph(),
        { asset } = await h.bind(graph);
      await h.publish(graph);
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { [flag]: false },
      });
      const response = await h
        .http()
        .get(`/api/v1/student/homeworks/${graph.homework.id}`)
        .set(h.headers('student'))
        .expect(200);
      const projected = st06Json<StudentHomeworkResponseDto>(
        response,
      ).homework.questions.find(
        (row) => row.questionId === graph.questions[0].id,
      )!.assets[0];
      const mode = flag === 'allowInlinePreview' ? 'preview' : 'download';
      expect(
        projected.access?.[mode === 'preview' ? 'previewPath' : 'downloadPath'],
      ).toBeNull();
      await h
        .http()
        .get(h.student(graph, 0, asset.assetId, mode))
        .set(h.headers('student'))
        .expect(404);
      await h
        .http()
        .head(h.student(graph, 0, asset.assetId, mode))
        .set(h.headers('student'))
        .expect(404);
    },
  );
  it('keeps the production runtime/security gate denied and documents every new GET/HEAD route', async () => {
    expect(() =>
      new AssessmentMediaRuntimePolicy(
        new ConfigService({
          NODE_ENV: 'production',
          ASSESSMENT_MEDIA_UPLOADS_ENABLED: true,
        }),
      ).assertUploadExecutionEnabled(),
    ).toThrow();
    await expect(
      new UnapprovedAssessmentMediaSecurityGate().attest(),
    ).rejects.toMatchObject({
      code: 'assessment_media.security_verification_unavailable',
    });
    const document = SwaggerModule.createDocument(
      h.app,
      new DocumentBuilder().setTitle('Owned ST06 contracts').build(),
    );
    const paths = Object.keys(document.paths).filter(
      (path) =>
        path.includes('/questions/{questionId}/assets') &&
        [
          '/api/v1/homework/',
          '/api/v1/teacher/homeworks/',
          '/api/v1/student/homeworks/',
        ].some((prefix) => path.startsWith(prefix)),
    );
    const content = paths.filter(
      (path) => path.endsWith('/preview') || path.endsWith('/download'),
    );
    expect(content).toHaveLength(6);
    for (const path of content) {
      expect(document.paths[path].get).toBeDefined();
      expect(document.paths[path].head).toBeDefined();
    }
    const asset = document.components?.schemas?.HomeworkQuestionAssetDto;
    expect(JSON.stringify(asset)).not.toMatch(
      /bucket|objectKey|checksumSha256|assessmentSecurityEvidence|uploadId/u,
    );
  });
});
