import { randomUUID } from 'node:crypto';
import {
  HomeworkQuestionAssetsHttp,
  st06Json,
} from '../fixtures/homework-question-assets.http';
import { UnapprovedAssessmentMediaSecurityGate } from '../../src/modules/files/assessment-media/application/assessment-media-verifier';
import type { HomeworkQuestionAssetDto } from '../../src/modules/homework/dto/homework-question-asset.dto';

jest.setTimeout(180000);
describe('ST-06 Homework question asset ownership, provenance and private-content denials', () => {
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
  const external = {
    sourceType: 'EXTERNAL_HTTPS',
    externalUrl: 'https://media.example.org/lesson.txt',
  };

  it('denies every Core CRUD operation against another School/Organization', async () => {
    const own = await h.fixture.graph(),
      foreign = await h.fixture.graph('foreignTeacher');
    const response = await h
      .http()
      .post(h.teacher(foreign, 0, 'foreignTeacher'))
      .set(h.headers('foreignTeacher'))
      .send(external)
      .expect(201);
    const id = st06Json<{ asset: HomeworkQuestionAssetDto }>(response).asset
      .assetId;
    const base = h.core(foreign),
      one = `${base}/${id}`;
    await h.http().get(base).set(h.headers('admin')).expect(404);
    await h.http().get(one).set(h.headers('admin')).expect(404);
    await h
      .http()
      .post(base)
      .set(h.headers('admin'))
      .send(external)
      .expect(404);
    await h
      .http()
      .patch(one)
      .set(h.headers('admin'))
      .send({ title: 'Denied' })
      .expect(404);
    await h
      .http()
      .patch(`${one}/reorder`)
      .set(h.headers('admin'))
      .send({ sortOrder: 1 })
      .expect(404);
    await h.http().delete(one).set(h.headers('admin')).expect(404);
    await h.http().get(base).set(h.headers('organization')).expect(404);
    await h.http().post(h.core(own)).send(external).expect(401);
  });
  it('denies another teacher allocation, classroom, subject and mismatched parent/asset', async () => {
    const graph = await h.fixture.graph(),
      asset = await h.external(graph);
    await h
      .http()
      .get(h.teacher(graph))
      .set(h.headers('otherTeacher'))
      .expect(404);
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers('otherTeacher'))
      .send(external)
      .expect(404);
    await h
      .http()
      .get(h.teacher(graph, 0, 'otherTeacher'))
      .set(h.headers())
      .expect(404);
    await h
      .http()
      .get(`${h.teacher(graph, 1)}/${asset.assetId}`)
      .set(h.headers())
      .expect(404);
    await h
      .http()
      .patch(`${h.teacher(graph, 1)}/${asset.assetId}`)
      .set(h.headers())
      .send({ title: 'Wrong question' })
      .expect(404);
    await h
      .http()
      .delete(`${h.teacher(graph, 1)}/${asset.assetId}`)
      .set(h.headers())
      .expect(404);
    await h.http().get(h.core(graph)).set(h.headers()).expect(403);
    const subject = await h.prisma.subject.create({
      data: {
        schoolId: h.fixture.school.schoolId,
        nameAr: 'Other owned',
        nameEn: 'Other owned',
        code: 'ST06-' + randomUUID(),
      },
    });
    await h.prisma.homeworkAssignment.update({
      where: { id: graph.homework.id },
      data: { subjectId: subject.id },
    });
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send(external)
      .expect(404);
    await h.prisma.homeworkAssignment.update({
      where: { id: graph.homework.id },
      data: { subjectId: h.fixture.school.subjectId },
    });
    await h.prisma.subject.delete({ where: { id: subject.id } });
  });
  it.each([
    'fileId',
    'uploadId',
    'externalUrl',
    'sourceType',
    'schoolId',
    'homeworkQuestionId',
    'createdByUserId',
    'assetId',
  ])('rejects immutable PATCH field %s', async (field) => {
    const graph = await h.fixture.graph(),
      asset = await h.external(graph);
    await h
      .http()
      .patch(`${h.teacher(graph)}/${asset.assetId}`)
      .set(h.headers())
      .send({ [field]: randomUUID() })
      .expect(400);
    expect(
      (
        await h.prisma.homeworkQuestionAsset.findUniqueOrThrow({
          where: { id: asset.assetId },
        })
      ).externalUrl,
    ).toBe(asset.externalUrl);
  });
  it('rejects HTML/control metadata, out-of-range order and source ambiguity', async () => {
    const graph = await h.fixture.graph();
    for (const body of [
      { ...external, title: '<script>alert(1)</script>' },
      { ...external, description: '<img src=x onerror=alert(1)>' },
      { ...external, sortOrder: -1 },
      { ...external, sortOrder: 2147483648 },
      { ...external, fileId: randomUUID() },
      { sourceType: 'MANAGED_FILE', fileId: randomUUID() },
    ])
      await h
        .http()
        .post(h.teacher(graph))
        .set(h.headers())
        .send(body)
        .expect(400);
    await h
      .http()
      .get(h.teacher(graph).replace(graph.questions[0].id, 'not-a-uuid'))
      .set(h.headers())
      .expect(400);
  });
  it.each([
    ['HTTP', 'http://media.example.org/file'],
    ['credentials', 'https://user:pass@media.example.org/file'],
    ['provider', 'https://storage.googleapis.com/bucket/key'],
    ['private', 'https://127.0.0.1/file'],
    [
      'signed query',
      'https://media.example.org/file?X-Amz-Signature=not-a-real-secret',
    ],
    ['fragment', 'https://media.example.org/file#secret'],
    [
      'nested URL',
      'https://media.example.org/go?next=https://storage.googleapis.com/key',
    ],
    ['SQL-incompatible encoding', 'https://media.example.org/%61pi/file'],
  ])(
    'rejects external %s with controlled validation',
    async (_name, externalUrl) => {
      const graph = await h.fixture.graph();
      const response = await h
        .http()
        .post(h.teacher(graph))
        .set(h.headers())
        .send({ sourceType: 'EXTERNAL_HTTPS', externalUrl })
        .expect(400);
      expect(response.text).not.toContain(externalUrl);
      expect(
        await h.prisma.homeworkQuestionAsset.count({
          where: { homeworkQuestionId: graph.questions[0].id },
        }),
      ).toBe(0);
    },
  );
  it('rejects bare/missing provenance and client-provided READY/security attestations', async () => {
    const graph = await h.fixture.graph();
    const file = await h.prisma.file.create({
      data: {
        schoolId: h.fixture.school.schoolId,
        organizationId: h.fixture.school.organizationId,
        uploaderId: h.fixture.actors.teacher.userId,
        bucket: 'negative-identity-only',
        objectKey: randomUUID(),
        originalName: 'bare.txt',
        mimeType: 'text/plain',
        sizeBytes: 1n,
        visibility: 'PRIVATE',
      },
    });
    const body = {
      sourceType: 'MANAGED_FILE',
      fileId: file.id,
      uploadId: randomUUID(),
    };
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send(body)
      .expect(404);
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({
        ...body,
        status: 'READY',
        securityAttestation: { verdict: 'CLEAN' },
      })
      .expect(400);
  });
  it('rejects valid uploads for a different assignment, purpose or uploader', async () => {
    const graph = await h.fixture.graph(),
      other = await h.fixture.homework();
    const wrongContext = await h.fixture.ready(other.id),
      admin = await h.fixture.ready(graph.homework.id, 'admin');
    const assessment = await h.fixture.assessment();
    const wrongPurpose = await h.fixture.ready(
      assessment.id,
      'teacher',
      Buffer.from('Owned wrong-purpose text\n'),
      'GRADE_ASSESSMENT_MEDIA',
    );
    for (const file of [wrongContext, admin, wrongPurpose])
      await h
        .http()
        .post(h.teacher(graph))
        .set(h.headers())
        .send({
          sourceType: 'MANAGED_FILE',
          fileId: file.fileId,
          uploadId: file.uploadId,
        })
        .expect(404);
  });
  it('does not turn a failed/unapproved verification into READY or a bindable File', async () => {
    const graph = await h.fixture.graph();
    const blocked = h.fixture.serviceWithSecurity(
      new UnapprovedAssessmentMediaSecurityGate(),
    );
    const uploaded = await h.fixture.asMediaActor('teacher', () =>
      h.fixture.upload(
        graph.homework.id,
        Buffer.from('Owned gate denial text\n'),
        'HOMEWORK_ASSIGNMENT_MEDIA',
        'blocked.txt',
        'text/plain',
        blocked,
      ),
    );
    await expect(
      h.fixture.asMediaActor('teacher', () =>
        blocked.complete(
          'HOMEWORK_ASSIGNMENT_MEDIA',
          graph.homework.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'assessment_media.security_verification_unavailable',
    });
    const persisted = await h.prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: uploaded.intent.uploadId },
    });
    expect(persisted.status).toBe('FAILED');
    expect(persisted.fileId).toBeNull();
    expect(persisted.assessmentSecurityEvidence).toBeNull();
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        uploadId: uploaded.intent.uploadId,
        fileId: randomUUID(),
      })
      .expect(404);
  });
  it('requires the existing attachment permission separately from question management', async () => {
    const graph = await h.fixture.graph(),
      ready = await h.fixture.ready(graph.homework.id);
    const permission = await h.prisma.permission.findUniqueOrThrow({
      where: { code: 'homework.attachments.manage' },
    });
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.teacher.roleId,
        permissionId: permission.id,
      },
    });
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send(external)
      .expect(201);
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        uploadId: ready.uploadId,
        fileId: ready.fileId,
      })
      .expect(404);
  });
  it.each(['uploadsEnabled', 'teacherUploadsEnabled'] as const)(
    'denies managed binding when school %s changes',
    async (flag) => {
      const graph = await h.fixture.graph(),
        ready = await h.fixture.ready(graph.homework.id);
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { [flag]: false },
      });
      await h
        .http()
        .post(h.teacher(graph))
        .set(h.headers())
        .send({
          sourceType: 'MANAGED_FILE',
          uploadId: ready.uploadId,
          fileId: ready.fileId,
        })
        .expect(409);
    },
  );
  it('denies wrong targets, cross-school students, unpublished Homework and wrong question/File paths', async () => {
    const graph = await h.fixture.graph(),
      { asset } = await h.bind(graph);
    await h
      .http()
      .get(h.student(graph, 0, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
    await h.publish(graph);
    await h
      .http()
      .get(h.student(graph, 0, asset.assetId))
      .set(h.headers('otherStudent'))
      .expect(404);
    await h
      .http()
      .get(h.student(graph, 0, asset.assetId))
      .set(h.headers('foreignStudent'))
      .expect(404);
    await h
      .http()
      .get(h.student(graph, 1, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
    await h
      .http()
      .head(h.student(graph, 1, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
    await h.prisma.enrollment.update({
      where: { id: h.fixture.children[0].enrollmentId },
      data: { status: 'WITHDRAWN', endedAt: new Date() },
    });
    await h
      .http()
      .get(h.student(graph, 0, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
  });
  it('denies all author mutations after actual HTTP publication while keeping zero assets valid', async () => {
    const graph = await h.fixture.graph(),
      asset = await h.external(graph);
    await h.publish(graph);
    const base = h.teacher(graph),
      path = `${base}/${asset.assetId}`;
    await h.http().post(base).set(h.headers()).send(external).expect(409);
    await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ title: 'After publish' })
      .expect(409);
    await h
      .http()
      .patch(`${path}/reorder`)
      .set(h.headers())
      .send({ sortOrder: 1 })
      .expect(409);
    await h.http().delete(path).set(h.headers()).expect(409);
    const detail = await h
      .http()
      .get(`/api/v1/student/homeworks/${graph.homework.id}`)
      .set(h.headers('student'))
      .expect(200);
    expect(
      st06Json<{
        homework: {
          questions: Array<{ questionId: string; assets: unknown[] }>;
        };
      }>(detail).homework.questions.find(
        (row) => row.questionId === graph.questions[2].id,
      )?.assets,
    ).toEqual([]);
  });
  it('keeps Parent question-media access deferred even if its School flag is enabled', async () => {
    const graph = await h.fixture.graph(),
      { asset } = await h.bind(graph);
    await h.publish(graph);
    await h.prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: h.fixture.school.schoolId },
      data: { allowGuardianVisibility: true },
    });
    const child = h.fixture.children[0].studentId;
    const detail = await h
      .http()
      .get(`/api/v1/parent/children/${child}/homeworks/${graph.homework.id}`)
      .set(h.headers('parent'))
      .expect(200);
    expect(detail.text).not.toContain(asset.assetId);
    expect(detail.text).not.toContain('previewPath');
    await h
      .http()
      .get(
        `/api/v1/parent/children/${child}/homeworks/${graph.homework.id}/questions/${graph.questions[0].id}/assets/${asset.assetId}/preview`,
      )
      .set(h.headers('parent'))
      .expect(404);
  });
});
