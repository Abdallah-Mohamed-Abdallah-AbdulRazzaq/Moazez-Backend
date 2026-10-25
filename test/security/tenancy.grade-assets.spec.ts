import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { UnapprovedAssessmentMediaSecurityGate } from '../../src/modules/files/assessment-media/application/assessment-media-verifier';
import { GradeAssetsHttp, st07Json } from '../fixtures/grade-assets.http';
jest.setTimeout(180000);
describe('ST-07 tenant, Teacher decision and verified provenance security', () => {
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
  const external = {
    sourceType: 'EXTERNAL_HTTPS',
    externalUrl: 'https://media.example.org/reference.txt',
  };
  it.each([undefined, 0])(
    'denies cross-tenant CRUD, wrong resource IDs and all non-author actors on family %s',
    async (question) => {
      const graph = await h.fixture.gradeGraph(),
        foreign = await h.fixture.gradeGraph('foreignTeacher'),
        asset = await h.external(foreign, question, 'foreignTeacher');
      const path = `${h.core(foreign, question)}/${asset.assetId}`;
      await h
        .http()
        .get(h.core(foreign, question))
        .set(h.headers('admin'))
        .expect(404);
      await h.http().get(path).set(h.headers('admin')).expect(404);
      await h
        .http()
        .post(h.core(foreign, question))
        .set(h.headers('admin'))
        .send(external)
        .expect(404);
      await h
        .http()
        .patch(path)
        .set(h.headers('admin'))
        .send({ title: 'Denied' })
        .expect(404);
      await h
        .http()
        .patch(`${path}/reorder`)
        .set(h.headers('admin'))
        .send({ sortOrder: 1 })
        .expect(404);
      await h.http().delete(path).set(h.headers('admin')).expect(404);
      await h
        .http()
        .get(`${h.teacher(graph, question)}/${asset.assetId}`)
        .set(h.headers())
        .expect(404);
      await h.http().post(h.core(graph, question)).send(external).expect(401);
      await h
        .http()
        .post(h.core(graph, question))
        .set(h.headers('student'))
        .send(external)
        .expect(403);
      // Even a Teacher with manage permission cannot use Core as a broad-scope ownership bypass.
      await h
        .http()
        .post(h.core(graph, question))
        .set(h.headers())
        .send(external)
        .expect(404);
    },
  );
  it.each(['SCHOOL', 'STAGE', 'GRADE', 'SECTION'] as const)(
    'denies Teacher mutation of readable %s scopes',
    async (scopeType) => {
      const graph = await h.fixture.gradeGraph();
      const keys = {
        SCHOOL: h.fixture.school.schoolId,
        STAGE: h.fixture.school.stageId,
        GRADE: h.fixture.school.gradeId,
        SECTION: h.fixture.school.sectionId,
      };
      await h.prisma.gradeAssessment.update({
        where: { id: graph.assessment.id },
        data: { scopeType, scopeKey: keys[scopeType] },
      });
      await h.http().get(h.teacher(graph)).set(h.headers()).expect(200);
      for (const question of [undefined, 0])
        await h
          .http()
          .post(h.teacher(graph, question))
          .set(h.headers())
          .send(external)
          .expect(404);
      await expect(
        h.fixture.readyGrade(graph.assessment.id),
      ).rejects.toMatchObject({ code: 'not_found' });
    },
  );
  it.each([
    'creator',
    'allocation',
    'subject',
    'term',
    'membership',
    'permission',
  ] as const)(
    'rechecks Teacher %s after a successful read',
    async (changed) => {
      const graph = await h.fixture.gradeGraph();
      await h.http().get(h.teacher(graph)).set(h.headers()).expect(200);
      if (changed === 'creator')
        await h.prisma.gradeAssessment.update({
          where: { id: graph.assessment.id },
          data: { createdById: h.fixture.actors.admin.userId },
        });
      if (changed === 'allocation')
        await h.prisma.teacherSubjectAllocation.update({
          where: { id: h.fixture.allocations.teacher },
          data: { teacherUserId: h.fixture.actors.otherTeacher.userId },
        });
      if (changed === 'subject')
        await h.prisma.subject.update({
          where: { id: graph.assessment.subjectId },
          data: { isActive: false },
        });
      if (changed === 'term')
        await h.prisma.term.update({
          where: { id: graph.assessment.termId },
          data: { isActive: false },
        });
      if (changed === 'membership')
        await h.prisma.membership.update({
          where: { id: h.fixture.actors.teacher.membershipId },
          data: { status: 'SUSPENDED' },
        });
      if (changed === 'permission') {
        const permission = await h.prisma.permission.findUniqueOrThrow({
          where: { code: 'grades.assessments.manage' },
        });
        await h.prisma.rolePermission.deleteMany({
          where: {
            roleId: h.fixture.actors.teacher.roleId,
            permissionId: permission.id,
          },
        });
      }
      const response = await h
        .http()
        .post(h.teacher(graph))
        .set(h.headers())
        .send(external);
      expect([403, 404, 409]).toContain(response.status);
      expect(
        await h.prisma.gradeAssessmentAsset.count({
          where: { assessmentId: graph.assessment.id },
        }),
      ).toBe(0);
    },
  );
  it('keeps question and assessment permissions separate, including the managed purpose permission', async () => {
    const graph = await h.fixture.gradeGraph(),
      ready = await h.fixture.readyGrade(graph.assessment.id);
    const permission = await h.prisma.permission.findUniqueOrThrow({
      where: { code: 'grades.questions.manage' },
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
      .post(h.teacher(graph, 0))
      .set(h.headers())
      .send(external)
      .expect(403);
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
  it('authorizes one verified File across the exact assessment and multiple questions without charging another physical upload', async () => {
    const graph = await h.fixture.gradeGraph(),
      ready = await h.fixture.readyGrade(graph.assessment.id);
    const command = {
      sourceType: 'MANAGED_FILE',
      uploadId: ready.uploadId,
      fileId: ready.fileId,
    };
    for (const question of [undefined, 0, 1])
      await h
        .http()
        .post(h.teacher(graph, question))
        .set(h.headers())
        .send(command)
        .expect(201);
    expect(
      await h.prisma.fileUploadSession.count({
        where: { purposeContextId: graph.assessment.id, status: 'READY' },
      }),
    ).toBe(1);
    expect(await h.prisma.file.count({ where: { id: ready.fileId } })).toBe(1);
    const other = await h.fixture.gradeGraph();
    await h
      .http()
      .post(h.teacher(other))
      .set(h.headers())
      .send(command)
      .expect(404);
    const foreign = await h.fixture.gradeGraph('foreignTeacher');
    await h
      .http()
      .post(h.teacher(foreign, undefined, 'foreignTeacher'))
      .set(h.headers('foreignTeacher'))
      .send(command)
      .expect(404);
    const list = st07Json<{ assets: { assetId: string }[] }>(
      await h.http().get(h.teacher(graph)).set(h.headers()).expect(200),
    );
    await h
      .http()
      .delete(`${h.teacher(graph)}/${list.assets[0].assetId}`)
      .set(h.headers())
      .expect(204);
    expect(
      (await h.prisma.file.findUniqueOrThrow({ where: { id: ready.fileId } }))
        .deletedAt,
    ).toBeNull();
    expect(
      await h.prisma.gradeAssessmentQuestionAsset.count({
        where: { fileId: ready.fileId, deletedAt: null },
      }),
    ).toBe(2);
  });
  it.each([
    'public',
    'retired',
    'uploader',
    'bucket',
    'name',
    'checksum',
    'mime',
    'size',
    'session-purpose',
    'session-context',
    'session-status',
    'evidence',
    'version',
    'completed',
    'cleanup',
  ] as const)(
    'rejects File corruption or prevents immutable session tampering: %s',
    async (changed) => {
      const graph = await h.fixture.gradeGraph(),
        ready = await h.fixture.readyGrade(graph.assessment.id);
      if (changed === 'public')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { visibility: 'PUBLIC' },
        });
      if (changed === 'retired')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { deletedAt: new Date() },
        });
      if (changed === 'uploader')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { uploaderId: h.fixture.actors.otherTeacher.userId },
        });
      if (changed === 'bucket')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { bucket: 'owned-negative' },
        });
      if (changed === 'name')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { originalName: 'changed.txt' },
        });
      if (changed === 'checksum')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { checksumSha256: '0'.repeat(64) },
        });
      if (changed === 'mime')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { mimeType: 'application/pdf' },
        });
      if (changed === 'size')
        await h.prisma.file.update({
          where: { id: ready.fileId },
          data: { sizeBytes: 1n },
        });
      if (
        [
          'session-purpose',
          'session-context',
          'session-status',
          'evidence',
          'version',
          'completed',
          'cleanup',
        ].includes(changed)
      ) {
        const before = await h.prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: ready.uploadId },
        });
        await expect(
          (async () => {
            if (changed === 'session-purpose')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { purpose: 'HOMEWORK_ASSIGNMENT_MEDIA' },
              });
            if (changed === 'session-context')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { purposeContextId: randomUUID() },
              });
            if (changed === 'session-status')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { status: 'FAILED' },
              });
            if (changed === 'evidence')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { assessmentSecurityEvidence: { verdict: 'CLEAN' } },
              });
            if (changed === 'version')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { verificationVersion: 'unsupported' },
              });
            if (changed === 'completed')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { completedAt: null },
              });
            if (changed === 'cleanup')
              await h.prisma.fileUploadSession.update({
                where: { id: ready.uploadId },
                data: { finalObjectDeletedAt: new Date() },
              });
          })(),
        ).rejects.toThrow(
          /immutable|assessment_upload_contract_check|Illegal assessment upload transition/u,
        );
        expect(
          await h.prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: ready.uploadId },
          }),
        ).toEqual(before);
        return;
      }

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
    },
  );
  it('rejects bare files, spoofed attestation and uploads owned by another author', async () => {
    const graph = await h.fixture.gradeGraph(),
      ready = await h.fixture.readyGrade(graph.assessment.id, 'admin');
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      })
      .expect(404);
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({ sourceType: 'MANAGED_FILE', fileId: ready.fileId })
      .expect(400);
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({ ...external, assessmentSecurityEvidence: { verdict: 'CLEAN' } })
      .expect(400);
  });
  it.each([
    'http://media.example.org/a',
    'https://user:secret@media.example.org/a',
    'https://127.0.0.1/a',
    'https://localhost/a',
    'https://media.example.org/a?token=secret',
    'https://media.example.org/a#token',
    'https://storage.googleapis.com/a',
    'https://x.amazonaws.com/a',
    'https://media.example.org/api/v1/files/a/download',
  ])('rejects unsafe external reference %s', async (externalUrl) => {
    const graph = await h.fixture.gradeGraph();
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({ ...external, externalUrl })
      .expect(400);
  });
  it.each([
    'fileId',
    'externalUrl',
    'sourceType',
    'questionId',
    'assessmentId',
    'schoolId',
    'createdByUserId',
  ])('rejects immutable metadata patch field %s', async (field) => {
    const graph = await h.fixture.gradeGraph(),
      asset = await h.external(graph);
    await h
      .http()
      .patch(`${h.teacher(graph)}/${asset.assetId}`)
      .set(h.headers())
      .send({ [field]: randomUUID() })
      .expect(400);
  });
  it('denies unpublished, wrong student, foreign student, mismatched question and Parent content', async () => {
    const graph = await h.fixture.gradeGraph(),
      { asset } = await h.bind(graph, 0);
    const path = h.student(graph, 0, asset.assetId);
    await h.http().get(path).set(h.headers('student')).expect(404);
    await h.publish(graph);
    // Shared classroom assessment content is legitimately visible to both enrolled students.
    await h.http().get(path).set(h.headers('otherStudent')).expect(200);
    await h.prisma.enrollment.update({
      where: { id: h.fixture.children[1].enrollmentId },
      data: { classroomId: h.fixture.actors.otherTeacher.classroomId },
    });
    for (const actor of ['otherStudent', 'foreignStudent', 'parent'] as const) {
      const response = await h.http().get(path).set(h.headers(actor));
      expect([403, 404]).toContain(response.status);
    }
    await h
      .http()
      .get(h.student(graph, 1, asset.assetId))
      .set(h.headers('student'))
      .expect(404);
  });
  it('preserves disabled Production release and unapproved security provider', async () => {
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
  });
  it('denies an actual verified binding when Production execution is selected', async () => {
    const graph = await h.fixture.gradeGraph(),
      ready = await h.fixture.readyGrade(graph.assessment.id);
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
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      })
      .expect(409);
    expect(
      await h.prisma.gradeAssessmentAsset.count({
        where: { assessmentId: graph.assessment.id },
      }),
    ).toBe(0);
  });
  it.each([
    'uploadsEnabled',
    'teacherUploadsEnabled',
    'mime',
    'size',
    'resourceBytes',
    'schoolBytes',
  ] as const)(
    'reevaluates %s policy for a genuine READY File',
    async (changed) => {
      const graph = await h.fixture.gradeGraph(),
        ready = await h.fixture.readyGrade(graph.assessment.id);
      const data =
        changed === 'mime'
          ? { allowedMimeTypes: ['application/pdf'] }
          : changed === 'size'
            ? { maximumFileSizeBytes: 1n }
            : changed === 'resourceBytes'
              ? { maximumResourceBytes: 1n }
              : changed === 'schoolBytes'
                ? { maximumSchoolBytes: 1n }
                : { [changed]: false };
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data,
      });
      await h
        .http()
        .post(h.teacher(graph))
        .set(h.headers())
        .send({
          sourceType: 'MANAGED_FILE',
          fileId: ready.fileId,
          uploadId: ready.uploadId,
        })
        .expect(409);
    },
  );
  it('rejects a genuine Homework-purpose upload instead of substituting Grades purpose', async () => {
    const graph = await h.fixture.gradeGraph(),
      homework = await h.fixture.graph(),
      ready = await h.fixture.ready(homework.homework.id);
    await h
      .http()
      .post(h.teacher(graph))
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      })
      .expect(404);
  });
  it.each([
    ['audio/mpeg', 'sample.mp3', Buffer.from('ID3owned-denied-audio')],
    [
      'video/mp4',
      'sample.mp4',
      Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'),
    ],
  ] as const)(
    'denies %s upload under current restrictive school policy',
    async (mime, name, bytes) => {
      const graph = await h.fixture.gradeGraph();
      await expect(
        h.fixture.asMediaActor('teacher', () =>
          h.fixture.upload(
            graph.assessment.id,
            bytes,
            'GRADE_ASSESSMENT_MEDIA',
            name,
            mime,
          ),
        ),
      ).rejects.toMatchObject({ code: 'assessment_media.policy_denied' });
    },
  );
});
