import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { get as httpGet } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import type { GradeAssetDto } from '../../src/modules/grades/assessments/dto/grade-asset.dto';
import type { StudentExamDetailResponseDto } from '../../src/modules/student-app/exams/dto/student-exams.dto';
import type { StudentAssessmentGradeDetailResponseDto } from '../../src/modules/student-app/grades/dto/student-grades.dto';
import { GradeAssetsHttp, st07Json } from '../fixtures/grade-assets.http';
jest.setTimeout(180000);
describe('ST-07 Grades asset contracts and actual private HTTP bytes', () => {
  const h = new GradeAssetsHttp();
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
  it.each([undefined, 0])(
    'streams real private bytes for family %s with GET, Range, HEAD, If-Range and secure headers',
    async (question) => {
      const graph = await h.fixture.gradeGraph(),
        { ready, asset } = await h.bind(
          graph,
          question,
          'teacher',
          Buffer.from('0123456789 actual private bytes\n'),
          'reference "quoted".txt',
        );
      await h.publish(graph);
      const preview = h.student(graph, question, asset.assetId),
        download = h.student(graph, question, asset.assetId, 'download');
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
        .get(`${h.teacher(graph, question)}/${asset.assetId}/preview`)
        .set(h.headers())
        .expect(200);
      await h
        .http()
        .head(`${h.core(graph, question)}/${asset.assetId}/download`)
        .set(h.headers('admin'))
        .expect(200);
      await h
        .http()
        .get(`/api/v1/files/${ready.fileId}/download`)
        .set(h.headers())
        .expect(403);
    },
  );
  it.each([
    'membership',
    'enrollment',
    'permission',
    'asset',
    'question',
    'File',
    'policy',
  ] as const)(
    'reauthorizes %s after object lookup and before committing bytes',
    async (changed) => {
      const graph = await h.fixture.gradeGraph(),
        { asset, ready } = await h.bind(graph, 0);
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
        if (changed === 'enrollment')
          await h.prisma.enrollment.update({
            where: { id: h.fixture.children[0].enrollmentId },
            data: { endedAt: new Date() },
          });
        if (changed === 'permission') {
          const permission = await h.prisma.permission.findUniqueOrThrow({
            where: { code: 'grades.assessments.view' },
          });
          await h.prisma.rolePermission.deleteMany({
            where: {
              roleId: h.fixture.actors.student.roleId,
              permissionId: permission.id,
            },
          });
        }
        if (changed === 'asset')
          await h.prisma.gradeAssessmentQuestionAsset.update({
            where: { id: asset.assetId },
            data: { deletedAt: new Date() },
          });
        if (changed === 'question')
          await h.prisma.gradeAssessmentQuestion.update({
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
    const graph = await h.fixture.gradeGraph(),
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

  it('preserves both detail envelopes, distinct question assets, an empty question and MEDIA stimulus semantics', async () => {
    const graph = await h.fixture.gradeGraph();
    const root = await h.bind(graph),
      first = await h.bind(graph, 0),
      second = await h.external(graph, 1);
    await h.prisma.gradeAssessmentQuestion.update({
      where: { id: graph.questions[0].id },
      data: {
        type: 'MEDIA',
        metadata: {
          mediaUrl: 'https://media.example.org/lesson.mp4',
          mediaMode: 'video',
          mediaTitle: 'Stimulus',
        },
      },
    });
    await h.publish(graph);
    const exam = st07Json<StudentExamDetailResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/exams/${graph.assessment.id}`)
        .set(h.headers('student'))
        .expect(200),
    );
    expect(exam.assets.map((a) => a.assetId)).toEqual([root.asset.assetId]);
    const questions = exam.stages.flatMap((s) => s.questions);
    expect(questions[0].assets.map((a) => a.assetId)).toEqual([
      first.asset.assetId,
    ]);
    expect(questions[1].assets.map((a) => a.assetId)).toEqual([second.assetId]);
    expect(questions[2].assets).toEqual([]);
    expect(questions[0].interaction).toMatchObject({
      kind: 'media',
      definition: { kind: 'media', answer: { kind: 'text' } },
    });
    const grade = st07Json<StudentAssessmentGradeDetailResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/grades/assessments/${graph.assessment.id}`)
        .set(h.headers('student'))
        .expect(200),
    );
    expect(grade.assessment.assets[0].access?.previewPath).toContain(
      '/student/grades/assessments/',
    );
    expect(grade.questions[0].assets[0].assetId).toBe(first.asset.assetId);
    for (const response of [exam, grade])
      for (const secret of [
        root.ready.fileId,
        root.ready.file.bucket,
        root.ready.file.objectKey,
        'isCorrect',
        'answerKey',
        'assessmentSecurityEvidence',
        'uploadId',
      ])
        expect(JSON.stringify(response)).not.toContain(secret);
  });
  it('supports genuine SCORE_ONLY assessment uploads and Grades-only non-exam audience without fabricating questions', async () => {
    const graph = await h.fixture.gradeGraph('teacher', 'SCORE_ONLY');
    const { asset, ready } = await h.bind(graph);
    await h
      .http()
      .post(
        `${h.teacher(graph).replace(/\/assets$/u, '')}/questions/${graph.assessment.id}/assets`,
      )
      .set(h.headers())
      .send({
        sourceType: 'EXTERNAL_HTTPS',
        externalUrl: 'https://media.example.org/reference.txt',
      })
      .expect(400);
    await h.prisma.gradeAssessment.update({
      where: { id: graph.assessment.id },
      data: { type: 'ASSIGNMENT' },
    });
    await h.publish(graph);
    await h
      .http()
      .get(`/api/v1/student/exams/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(404);
    const response = st07Json<StudentAssessmentGradeDetailResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/grades/assessments/${graph.assessment.id}`)
        .set(h.headers('student'))
        .expect(200),
    );
    await h
      .http()
      .get(
        `/api/v1/student/grades/assessments/${graph.assessment.id}/questions/${graph.assessment.id}/assets/${asset.assetId}/download`,
      )
      .set(h.headers('student'))
      .expect(404);
    expect(response.assessment.supportsQuestionSubmission).toBe(false);
    expect(response.questions).toEqual([]);
    expect(response.assessment.assets[0].assetId).toBe(asset.assetId);
    const path = response.assessment.assets[0].access!.downloadPath!;
    expect(path).toContain('/student/grades/assessments/');
    expect(
      (await h.http().get(path).set(h.headers('student')).expect(200)).text,
    ).toBe(ready.bytes.toString());
    await h
      .http()
      .get(h.student(graph, undefined, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
  });
  it.each([undefined, 0])(
    'supports all author operations for resource %s and leaves physical File retained',
    async (question) => {
      const graph = await h.fixture.gradeGraph(),
        created = await h.bind(graph, question),
        other = await h.external(graph, question);
      const path = `${h.teacher(graph, question)}/${created.asset.assetId}`;
      await h.http().get(path).set(h.headers()).expect(200);
      await h
        .http()
        .patch(path)
        .set(h.headers())
        .send({ title: 'Reference', description: 'Plain text' })
        .expect(200);
      await h
        .http()
        .patch(`${path}/reorder`)
        .set(h.headers())
        .send({ sortOrder: 2 })
        .expect(200);
      const list = st07Json<{ assets: GradeAssetDto[] }>(
        await h
          .http()
          .get(h.teacher(graph, question))
          .set(h.headers())
          .expect(200),
      );
      expect(list.assets.map((a) => a.assetId)).toEqual([
        other.assetId,
        created.asset.assetId,
      ]);
      await h.http().delete(path).set(h.headers()).expect(204);
      await h.http().get(path).set(h.headers()).expect(404);
      expect(
        (
          await h.prisma.file.findUniqueOrThrow({
            where: { id: created.ready.fileId },
          })
        ).deletedAt,
      ).toBeNull();
      expect(
        await h.fixture.storage.objectExists({
          bucket: created.ready.file.bucket,
          objectKey: created.ready.file.objectKey,
        }),
      ).toBe(true);
    },
  );
  it('supports Core and Organization managed writes without expanding Teacher permissions', async () => {
    const graph = await h.fixture.gradeGraph();
    for (const actor of ['admin', 'organization'] as const)
      for (const question of [undefined, 0]) {
        const { asset } = await h.bind(graph, question, actor);
        await h
          .http()
          .get(`${h.core(graph, question)}/${asset.assetId}`)
          .set(h.headers(actor))
          .expect(200);
      }
  });
  it('publishes zero assets and produces empty additive arrays', async () => {
    const graph = await h.fixture.gradeGraph();
    await h.publish(graph);
    const exam = st07Json<StudentExamDetailResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/exams/${graph.assessment.id}`)
        .set(h.headers('student'))
        .expect(200),
    );
    expect(exam.assets).toEqual([]);
    expect(
      exam.stages
        .flatMap((s) => s.questions)
        .every((q) => q.assets.length === 0),
    ).toBe(true);
  });
  it('documents the original 56 asset operations and exactly 19 group operations with safe response schemas', () => {
    const doc = SwaggerModule.createDocument(
      h.app,
      new DocumentBuilder().setTitle('ST07').build(),
    );
    const paths = Object.entries(doc.paths).filter(
      ([path]) =>
        path.includes('/assets') &&
        (path.includes('/grades/assessments/') ||
          path.includes('/student/exams/')),
    );
    const operations = (entries: typeof paths) =>
      entries.flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) =>
            [
              'get',
              'head',
              'post',
              'patch',
              'delete',
              'put',
              'options',
            ].includes(method),
          )
          .map((method) => `${method.toUpperCase()} ${path}`),
      );
    expect(
      operations(paths.filter(([path]) => !path.includes('/groups/'))),
    ).toHaveLength(56);
    const groupAuthor =
      '/api/v1/grades/assessments/{assessmentId}/groups/{groupId}/assets';
    const groupPrefixes = [
      groupAuthor,
      '/api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/groups/{groupId}/assets',
      '/api/v1/student/exams/{assessmentId}/groups/{groupId}/assets',
      '/api/v1/student/grades/assessments/{assessmentId}/groups/{groupId}/assets',
    ];
    const expectedGroups = [
      ...groupPrefixes.flatMap((prefix) =>
        ['preview', 'download'].flatMap((action) =>
          ['GET', 'HEAD'].map(
            (method) => `${method} ${prefix}/{assetId}/${action}`,
          ),
        ),
      ),
      `POST ${groupAuthor}`,
      `PATCH ${groupAuthor}/{assetId}`,
      `DELETE ${groupAuthor}/{assetId}`,
    ];
    expect(expectedGroups).toHaveLength(19);
    expect(
      operations(paths.filter(([path]) => path.includes('/groups/'))).sort(),
    ).toEqual(expectedGroups.sort());
    expect(operations(paths)).toHaveLength(56 + expectedGroups.length);
    expect(JSON.stringify(doc.components?.schemas?.GradeAssetDto)).not.toMatch(
      /bucket|objectKey|checksumSha256|assessmentSecurityEvidence|uploadId/u,
    );
    for (const name of [
      'QuestionGroupAssetResponseDto',
      'QuestionGroupFileResponseDto',
    ]) {
      expect(doc.components?.schemas?.[name]).toBeDefined();
      expect(JSON.stringify(doc.components?.schemas?.[name])).not.toMatch(
        /bucket|objectKey|checksumSha256|assessmentSecurityEvidence|uploadId/u,
      );
    }
  });
  it.each(['image/png', 'application/pdf'] as const)(
    'fails closed for actual %s bytes while approved deep verification is unavailable',
    async (mime) => {
      const graph = await h.fixture.gradeGraph();
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: {
          allowedMimeTypes: ['text/plain', 'image/png', 'application/pdf'],
        },
      });
      let pdf = '%PDF-1.4\n';
      const offsets = [0];
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>',
        '<< /Length 0 >>\nstream\n\nendstream',
      ];
      objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      });
      const xref = Buffer.byteLength(pdf);
      pdf +=
        'xref\n0 5\n0000000000 65535 f \n' +
        offsets
          .slice(1)
          .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
          .join('') +
        `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const bytes =
        mime === 'image/png'
          ? Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh1EAAAAASUVORK5CYII=',
              'base64',
            )
          : Buffer.from(pdf);
      const uploaded = await h.fixture.asMediaActor('teacher', async () => {
        const intent = await h.fixture.upload(
          graph.assessment.id,
          bytes,
          'GRADE_ASSESSMENT_MEDIA',
          mime === 'image/png' ? 'pixel.png' : 'page.pdf',
          mime,
        );
        await expect(
          h.fixture.service.complete(
            'GRADE_ASSESSMENT_MEDIA',
            graph.assessment.id,
            intent.intent.uploadId,
          ),
        ).rejects.toMatchObject({
          code: 'assessment_media.verifier_unavailable',
        });
        return intent;
      });
      const session = await h.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: uploaded.intent.uploadId },
      });
      expect(session.status).toBe('FAILED');
      expect(session.fileId).toBeNull();
      expect(
        await h.prisma.gradeAssessmentAsset.count({
          where: { assessmentId: graph.assessment.id },
        }),
      ).toBe(0);
    },
  );
  it.each(['allowInlinePreview', 'allowDownload'] as const)(
    'enforces current %s in metadata and GET/HEAD',
    async (flag) => {
      const graph = await h.fixture.gradeGraph(),
        { asset } = await h.bind(graph);
      await h.publish(graph);
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { [flag]: false },
      });
      const detail = st07Json<StudentExamDetailResponseDto>(
        await h
          .http()
          .get(`/api/v1/student/exams/${graph.assessment.id}`)
          .set(h.headers('student'))
          .expect(200),
      );
      const mode = flag === 'allowInlinePreview' ? 'preview' : 'download';
      expect(
        detail.assets[0].access?.[
          mode === 'preview' ? 'previewPath' : 'downloadPath'
        ],
      ).toBeNull();
      for (const method of ['get', 'head'] as const)
        await h
          .http()
          [method](h.student(graph, undefined, asset.assetId, mode))
          .set(h.headers('student'))
          .expect(404);
    },
  );
  it('withholds unusable historical sources from Students while retaining safe author identity', async () => {
    const graph = await h.fixture.gradeGraph(),
      { asset, ready } = await h.bind(graph);
    const bound = st07Json<{ asset: GradeAssetDto }>(
      await h
        .http()
        .post(h.teacher(graph, 0))
        .set(h.headers())
        .send({
          sourceType: 'MANAGED_FILE',
          fileId: ready.fileId,
          uploadId: ready.uploadId,
        })
        .expect(201),
    ).asset;
    await h.publish(graph);
    await h.prisma.file.update({
      where: { id: ready.fileId },
      data: { visibility: 'PUBLIC' },
    });
    const author = st07Json<{ asset: GradeAssetDto }>(
      await h
        .http()
        .get(`${h.teacher(graph)}/${asset.assetId}`)
        .set(h.headers())
        .expect(200),
    ).asset;
    expect(author).toMatchObject({
      assetId: asset.assetId,
      file: null,
      access: { previewPath: null, downloadPath: null },
    });
    const exam = st07Json<StudentExamDetailResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/exams/${graph.assessment.id}`)
        .set(h.headers('student'))
        .expect(200),
    );
    expect(exam.assets).toEqual([]);
    expect(exam.stages[0].questions[0].assets).toEqual([]);
    expect(JSON.stringify(exam)).not.toContain(asset.assetId);
    expect(JSON.stringify(exam)).not.toContain(bound.assetId);
    await h
      .http()
      .get(h.student(graph, undefined, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
    await h
      .http()
      .get(h.student(graph, 0, bound.assetId))
      .set(h.headers('student'))
      .expect(404);
  });
});
