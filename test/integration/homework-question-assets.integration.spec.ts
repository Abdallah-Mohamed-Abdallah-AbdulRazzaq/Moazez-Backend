import { Prisma, type File as ManagedFile } from '@prisma/client';
import type { AssessmentMediaRepository } from '../../src/modules/files/assessment-media/infrastructure/assessment-media.repository';
import { PersistedUrlPolicy } from '../../src/infrastructure/storage/provider-url.policy';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PrivateMediaContentService } from '../../src/infrastructure/storage/private-media-content.service';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { HomeworkQuestionAssetsRepository } from '../../src/modules/homework/infrastructure/homework-question-assets.repository';
import { HomeworkQuestionAssetsService } from '../../src/modules/homework/application/homework-question-assets.service';
import { HomeworkRepository } from '../../src/modules/homework/infrastructure/homework.repository';
import { HomeworkRichContentService } from '../../src/modules/homework/application/homework-rich-content.service';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import { HomeworkQuestionAssetsFixture } from '../fixtures/homework-question-assets.fixture';

jest.setTimeout(120000);
describe('ST-06 exact Homework question assets on real PostgreSQL and private MinIO', () => {
  const prisma = new PrismaService();
  let fixture: HomeworkQuestionAssetsFixture;
  let service: HomeworkQuestionAssetsService;
  let homeworkRepository: HomeworkRepository;
  let graph: Awaited<ReturnType<HomeworkQuestionAssetsFixture['graph']>>;
  const actor = () => ({
    surface: 'teacher' as const,
    classId: fixture.allocations.teacher,
  });
  const resource = (question = 0) => ({
    homeworkId: graph.homework.id,
    questionId: graph.questions[question].id,
  });
  const asTeacher = <T>(operation: () => Promise<T>) =>
    fixture.asMediaActor('teacher', operation);
  const managed = async () => {
    const ready = await fixture.ready(graph.homework.id);
    return {
      ready,
      command: {
        sourceType: 'MANAGED_FILE' as const,
        uploadId: ready.uploadId,
        fileId: ready.fileId,
      },
    };
  };
  const external = {
    sourceType: 'EXTERNAL_HTTPS' as const,
    externalUrl: 'https://media.example.org/lesson.txt',
  };
  async function publish() {
    const targets = await prisma.homeworkTarget.findMany({
      where: { homeworkAssignmentId: graph.homework.id },
    });
    return asTeacher(() =>
      homeworkRepository.publishAssignmentWithTargets(
        graph.homework.id,
        {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedByUserId: fixture.actors.teacher.userId,
        },
        targets,
      ),
    );
  }
  beforeAll(async () => {
    fixture = new HomeworkQuestionAssetsFixture(prisma);
    await prisma.$connect();
  });
  beforeEach(async () => {
    fixture = new HomeworkQuestionAssetsFixture(prisma);
    await fixture.create();
    graph = await fixture.graph();
    const gate = new PrismaTeacherAllocationOperationalWriteGate();
    const repository = new HomeworkQuestionAssetsRepository(
      prisma,
      gate,
      fixture.repository,
      new AssessmentMediaRuntimePolicy(fixture.config),
      fixture.storage,
      new PersistedUrlPolicy({
        s3CompatibleEndpoints: [
          fixture.config.getOrThrow<string>('STORAGE_ENDPOINT'),
        ],
      }),
    );
    homeworkRepository = new HomeworkRepository(
      prisma,
      gate,
      new HomeworkRichContentService(prisma, gate, repository),
    );
    service = new HomeworkQuestionAssetsService(
      repository,
      new PrivateMediaContentService(fixture.storage),
      new PersistedUrlPolicy({
        s3CompatibleEndpoints: [
          fixture.config.getOrThrow<string>('STORAGE_ENDPOINT'),
        ],
      }),
    );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.dispose();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('binds genuinely verified distinct Files to exact questions, preserves an empty question and returns real private bytes', async () => {
    const first = await managed(),
      second = await fixture.ready(
        graph.homework.id,
        'teacher',
        Buffer.from('Second actual owned file\n'),
      );
    const a = await asTeacher(() =>
      service.create(actor(), resource(0), first.command),
    );
    const b = await asTeacher(() =>
      service.create(actor(), resource(1), {
        sourceType: 'MANAGED_FILE',
        fileId: second.fileId,
        uploadId: second.uploadId,
      }),
    );
    expect(a.asset.category).toBe('DOCUMENT');
    expect(a.asset.file?.sizeBytes).toBe(String(first.ready.bytes.length));
    expect(
      (await asTeacher(() => service.list(actor(), resource(0)))).assets.map(
        (row) => row.assetId,
      ),
    ).toEqual([a.asset.assetId]);
    expect(
      (await asTeacher(() => service.list(actor(), resource(1)))).assets.map(
        (row) => row.assetId,
      ),
    ).toEqual([b.asset.assetId]);
    expect(
      (await asTeacher(() => service.list(actor(), resource(2)))).assets,
    ).toEqual([]);
    await publish();
    await fixture.asMediaActor('student', async () => {
      const { context } = await new StudentAppAccessService(
        new StudentAppStudentReadAdapter(prisma),
      ).getCurrentStudentWithEnrollment();
      const student = { surface: 'student' as const, student: context };
      const rows = await service.studentAssets(student, graph.homework.id);
      expect(
        rows.get(graph.questions[0].id)?.map((row) => row.assetId),
      ).toEqual([a.asset.assetId]);
      expect(
        rows.get(graph.questions[1].id)?.map((row) => row.assetId),
      ).toEqual([b.asset.assetId]);
      const content = await service.openContent(
        student,
        { ...resource(), assetId: a.asset.assetId },
        { disposition: 'inline' },
      );
      const chunks: Buffer[] = [];
      for await (const chunk of content.stream)
        chunks.push(Buffer.from(chunk as Uint8Array));
      expect(Buffer.concat(chunks)).toEqual(first.ready.bytes);
      const json = JSON.stringify([...rows.values()]);
      for (const secret of [
        first.ready.fileId,
        first.ready.file.bucket,
        first.ready.file.objectKey,
        'assessmentSecurityEvidence',
        'expectedAnswer',
        'isCorrect',
      ])
        expect(json).not.toContain(secret);
    });
  });
  it('accepts an external reference without a File or storage fetch', async () => {
    const count = await prisma.file.count();
    const stat = jest.spyOn(fixture.storage, 'statObject');
    const created = await asTeacher(() =>
      service.create(actor(), resource(), external),
    );
    expect(created.asset).toMatchObject({
      sourceType: 'EXTERNAL_HTTPS',
      file: null,
      access: null,
      externalUrl: external.externalUrl,
    });
    expect(await prisma.file.count()).toBe(count);
    expect(stat).not.toHaveBeenCalled();
  });
  it('supports metadata, stable concurrent reorder, audit and soft deletion without losing File retention', async () => {
    const { ready, command } = await managed();
    const a = await asTeacher(() =>
      service.create(actor(), resource(), command),
    );
    const b = await asTeacher(() =>
      service.create(actor(), resource(), external),
    );
    await asTeacher(() =>
      service.update(
        actor(),
        { ...resource(), assetId: a.asset.assetId },
        { title: 'Updated label', description: 'Plain reference' },
      ),
    );
    await Promise.all([
      asTeacher(() =>
        service.reorder(
          actor(),
          { ...resource(), assetId: a.asset.assetId },
          { sortOrder: 0 },
        ),
      ),
      asTeacher(() =>
        service.reorder(
          actor(),
          { ...resource(), assetId: b.asset.assetId },
          { sortOrder: 0 },
        ),
      ),
    ]);
    const once = await asTeacher(() => service.list(actor(), resource()));
    expect(await asTeacher(() => service.list(actor(), resource()))).toEqual(
      once,
    );
    await asTeacher(() =>
      service.remove(actor(), { ...resource(), assetId: a.asset.assetId }),
    );
    expect(
      (await asTeacher(() => service.list(actor(), resource()))).assets.map(
        (row) => row.assetId,
      ),
    ).toEqual([b.asset.assetId]);
    const historical = await prisma.homeworkQuestionAsset.findUniqueOrThrow({
      where: { id: a.asset.assetId },
    });
    expect(historical.fileId).toBe(ready.fileId);
    expect(historical.deletedAt).not.toBeNull();
    expect(
      await prisma.$transaction((tx) =>
        hasRetainedFileReferences(tx, ready.fileId),
      ),
    ).toBe(true);
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: ready.fileId } }))
        .deletedAt,
    ).toBeNull();
    expect(
      await fixture.storage.objectExists({
        bucket: ready.file.bucket,
        objectKey: ready.file.objectKey,
      }),
    ).toBe(true);
    const audits = await prisma.auditLog.findMany({
      where: { resourceId: a.asset.assetId, module: 'homework' },
    });
    expect(audits.map((row) => row.action).sort()).toEqual(
      [
        'homework.question.asset.create',
        'homework.question.asset.delete',
        'homework.question.asset.metadata',
        'homework.question.asset.reorder',
      ].sort(),
    );
    const logged = JSON.stringify(audits.map((row) => row.after));
    expect(logged).not.toContain(ready.file.objectKey);
    expect(logged).not.toContain(ready.file.bucket);
    expect(logged).not.toContain(ready.fileId);
  });
  it('rechecks membership and permission after earlier successful reads', async () => {
    await asTeacher(() => service.list(actor(), resource()));
    await prisma.membership.update({
      where: { id: fixture.actors.teacher.membershipId },
      data: { status: 'SUSPENDED' },
    });
    try {
      await expect(
        asTeacher(() => service.create(actor(), resource(), external)),
      ).rejects.toMatchObject({ code: 'not_found' });
    } finally {
      await prisma.membership.update({
        where: { id: fixture.actors.teacher.membershipId },
        data: { status: 'ACTIVE' },
      });
    }
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'homework.questions.manage' },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: fixture.actors.teacher.roleId,
        permissionId: permission.id,
      },
    });
    try {
      await expect(
        asTeacher(() => service.create(actor(), resource(), external)),
      ).rejects.toMatchObject({ code: 'not_found' });
    } finally {
      await fixture.grantAssets(fixture.actors.teacher.roleId, [
        'homework.questions.manage',
      ]);
    }
    expect(
      await prisma.homeworkQuestionAsset.count({
        where: { homeworkQuestionId: graph.questions[0].id },
      }),
    ).toBe(0);
  });
  it('rechecks allocation ownership and exact question after earlier successful reads', async () => {
    await asTeacher(() => service.list(actor(), resource()));
    await prisma.teacherSubjectAllocation.update({
      where: { id: fixture.allocations.teacher },
      data: { teacherUserId: fixture.actors.otherTeacher.userId },
    });
    try {
      await expect(
        asTeacher(() => service.create(actor(), resource(), external)),
      ).rejects.toMatchObject({ code: 'not_found' });
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocations.teacher },
        data: { teacherUserId: fixture.actors.teacher.userId },
      });
    }
    await prisma.homeworkQuestion.update({
      where: { id: graph.questions[0].id },
      data: { deletedAt: new Date() },
    });
    await expect(
      asTeacher(() => service.create(actor(), resource(), external)),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
  it('rejects a stale asset update and mutation after real repository publication', async () => {
    const created = await asTeacher(() =>
      service.create(actor(), resource(), external),
    );
    await prisma.homeworkQuestionAsset.update({
      where: { id: created.asset.assetId },
      data: { deletedAt: new Date() },
    });
    await expect(
      asTeacher(() =>
        service.update(
          actor(),
          { ...resource(), assetId: created.asset.assetId },
          { title: 'Stale' },
        ),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    await publish();
    await expect(
      asTeacher(() => service.create(actor(), resource(2), external)),
    ).rejects.toMatchObject({ code: 'homework.question.read_only' });
  });
  it('rejects a different assignment and uploader without reusing their approved upload provenance', async () => {
    const other = await fixture.homework();
    const wrong = await fixture.ready(other.id);
    await expect(
      asTeacher(() =>
        service.create(actor(), resource(), {
          sourceType: 'MANAGED_FILE',
          uploadId: wrong.uploadId,
          fileId: wrong.fileId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    const adminFile = await fixture.ready(graph.homework.id, 'admin');
    await expect(
      asTeacher(() =>
        service.create(actor(), resource(), {
          sourceType: 'MANAGED_FILE',
          uploadId: adminFile.uploadId,
          fileId: adminFile.fileId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      (
        await fixture.asMediaActor('admin', () =>
          service.create({ surface: 'core' }, resource(), {
            sourceType: 'MANAGED_FILE',
            uploadId: adminFile.uploadId,
            fileId: adminFile.fileId,
          }),
        )
      ).asset.sourceType,
    ).toBe('MANAGED_FILE');
  });
  it('enforces assignment-scoped current capacity and current school actions', async () => {
    const { ready, command } = await managed();
    await prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: fixture.school.schoolId },
      data: { maximumResourceBytes: ready.file.sizeBytes - 1n },
    });
    await expect(
      asTeacher(() => service.create(actor(), resource(), command)),
    ).rejects.toMatchObject({ code: 'assessment_media.quota_exceeded' });
    await prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: fixture.school.schoolId },
      data: { maximumResourceBytes: 83886080n },
    });
    const created = await asTeacher(() =>
      service.create(actor(), resource(), command),
    );
    await prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: fixture.school.schoolId },
      data: { allowInlinePreview: false },
    });
    expect(
      (
        await asTeacher(() =>
          service.get(actor(), {
            ...resource(),
            assetId: created.asset.assetId,
          }),
        )
      ).asset.access?.previewPath,
    ).toBeNull();
    await expect(
      asTeacher(() =>
        service.openContent(
          actor(),
          { ...resource(), assetId: created.asset.assetId },
          { disposition: 'inline' },
        ),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    const downloaded = await asTeacher(() =>
      service.openContent(
        actor(),
        { ...resource(), assetId: created.asset.assetId },
        { disposition: 'attachment', head: true },
      ),
    );
    expect(downloaded.statusCode).toBe(200);
    downloaded.stream.destroy();
  });
  it.each<
    Array<
      [string, (file: ManagedFile) => Prisma.FileUncheckedUpdateInput]
    >[number]
  >([
    ['public', () => ({ visibility: 'PUBLIC' })],
    ['retired', () => ({ deletedAt: new Date() })],
    ['null school', () => ({ schoolId: null })],
    [
      'foreign organization',
      () => ({ organizationId: fixture.schools[1].organizationId }),
    ],
    [
      'wrong uploader',
      () => ({ uploaderId: fixture.actors.otherTeacher.userId }),
    ],
    ['wrong bucket', () => ({ bucket: 'unrelated-owned-negative' })],
    ['wrong object', () => ({ objectKey: 'unrelated-owned-negative' })],
    ['wrong MIME', () => ({ mimeType: 'application/pdf' })],
    ['wrong size', (file) => ({ sizeBytes: file.sizeBytes + 1n })],
    ['wrong checksum', () => ({ checksumSha256: 'b'.repeat(64) })],
  ])(
    'rejects a %s File at the actual binding boundary',
    async (_label, change) => {
      const { ready, command } = await managed();
      await prisma.file.update({
        where: { id: ready.fileId },
        data: change(ready.file),
      });
      try {
        await expect(
          asTeacher(() => service.create(actor(), resource(), command)),
        ).rejects.toMatchObject({ code: 'not_found' });
      } finally {
        const file = ready.file;
        await prisma.file.update({
          where: { id: file.id },
          data: {
            schoolId: file.schoolId,
            organizationId: file.organizationId,
            uploaderId: file.uploaderId,
            visibility: file.visibility,
            deletedAt: file.deletedAt,
            bucket: file.bucket,
            objectKey: file.objectKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            checksumSha256: file.checksumSha256,
          },
        });
      }
    },
  );
  function latch<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }
  async function blockedBy(pid: number): Promise<void> {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      const rows = await prisma.$queryRaw<
        Array<{ pid: number }>
      >`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`;
      if (rows.length) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      'Expected actual PostgreSQL blocking relationship was not observed',
    );
  }
  it.each(['membership', 'permission', 'question', 'asset'] as const)(
    '%s revocation wins before a waiting mutation',
    async (kind) => {
      const asset =
        kind === 'asset'
          ? await asTeacher(() => service.create(actor(), resource(), external))
          : null;
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: 'homework.questions.manage' },
      });
      const entered = latch<number>(),
        release = latch<void>();
      const revoking = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          if (kind === 'membership') {
            await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${fixture.actors.teacher.membershipId}::uuid FOR UPDATE`;
            await tx.membership.update({
              where: { id: fixture.actors.teacher.membershipId },
              data: { status: 'SUSPENDED' },
            });
          } else if (kind === 'permission') {
            await tx.$queryRaw`SELECT role_id FROM role_permissions WHERE role_id = ${fixture.actors.teacher.roleId}::uuid AND permission_id = ${permission.id}::uuid FOR UPDATE`;
            await tx.rolePermission.deleteMany({
              where: {
                roleId: fixture.actors.teacher.roleId,
                permissionId: permission.id,
              },
            });
          } else if (kind === 'question') {
            await tx.$queryRaw`SELECT id FROM homework_questions WHERE id = ${graph.questions[0].id}::uuid FOR UPDATE`;
            await tx.homeworkQuestion.update({
              where: { id: graph.questions[0].id },
              data: { deletedAt: new Date() },
            });
          } else {
            await tx.$queryRaw`SELECT id FROM homework_question_assets WHERE id = ${asset!.asset.assetId}::uuid FOR UPDATE`;
            await tx.homeworkQuestionAsset.update({
              where: { id: asset!.asset.assetId },
              data: { deletedAt: new Date() },
            });
          }
          entered.resolve(pid);
          await release.promise;
        },
        { timeout: 15000 },
      );
      const blocker = await entered.promise;
      const writing = asTeacher(() =>
        kind === 'asset'
          ? service.update(
              actor(),
              { ...resource(), assetId: asset!.asset.assetId },
              { title: 'Stale update' },
            )
          : service.create(actor(), resource(), external),
      );
      const outcome = writing.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      try {
        await blockedBy(blocker);
        release.resolve();
        await revoking;
        const result = await outcome;
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.error).toMatchObject({ code: 'not_found' });
        expect(
          await prisma.homeworkQuestionAsset.count({
            where: {
              homeworkQuestionId: graph.questions[0].id,
              deletedAt: null,
            },
          }),
        ).toBe(0);
      } finally {
        release.resolve();
        await Promise.allSettled([revoking, outcome]);
      }
    },
  );
  it('allocation revocation wins before the operational allocation gate', async () => {
    const entered = latch<number>(),
      release = latch<void>();
    const revoking = prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM teacher_subject_allocations WHERE id = ${fixture.allocations.teacher}::uuid FOR UPDATE`;
        await tx.teacherSubjectAllocation.update({
          where: { id: fixture.allocations.teacher },
          data: { teacherUserId: fixture.actors.otherTeacher.userId },
        });
        entered.resolve(pid);
        await release.promise;
      },
      { timeout: 15000 },
    );
    const blocker = await entered.promise;
    const outcome = asTeacher(() =>
      service.create(actor(), resource(), external),
    ).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    try {
      await blockedBy(blocker);
      release.resolve();
      await revoking;
      const result = await outcome;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ code: 'not_found' });
    } finally {
      release.resolve();
      await Promise.allSettled([revoking, outcome]);
    }
  });
  it('a binding that wins the File lock makes retirement observe retained references', async () => {
    const { ready, command } = await managed(),
      entered = latch<number>(),
      release = latch<void>();
    const original = fixture.repository.readyHomeworkFile.bind(
      fixture.repository,
    ) as AssessmentMediaRepository['readyHomeworkFile'];
    jest
      .spyOn(fixture.repository, 'readyHomeworkFile')
      .mockImplementation(async (tx, input) => {
        const value = await original(tx, input);
        if (input.lock) {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          entered.resolve(pid);
          await release.promise;
        }
        return value;
      });
    const writing = asTeacher(() =>
      service.create(actor(), resource(), command),
    );
    const writer = await entered.promise;
    const retiring = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM files WHERE id = ${ready.fileId}::uuid FOR UPDATE`;
        const keep = await hasRetainedFileReferences(tx, ready.fileId);
        if (!keep)
          await tx.file.update({
            where: { id: ready.fileId },
            data: { deletedAt: new Date() },
          });
        return keep;
      },
      { timeout: 15000 },
    );
    try {
      await blockedBy(writer);
      release.resolve();
      const created = await writing;
      expect(await retiring).toBe(true);
      expect(created.asset.sourceType).toBe('MANAGED_FILE');
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: ready.fileId } }))
          .deletedAt,
      ).toBeNull();
    } finally {
      release.resolve();
      await Promise.allSettled([writing, retiring]);
    }
  });
  it('retirement that wins the File lock denies an already-started stale binding', async () => {
    const { ready, command } = await managed(),
      entered = latch<number>(),
      release = latch<void>();
    const retiring = prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM files WHERE id = ${ready.fileId}::uuid FOR UPDATE`;
        expect(await hasRetainedFileReferences(tx, ready.fileId)).toBe(false);
        await tx.file.update({
          where: { id: ready.fileId },
          data: { deletedAt: new Date() },
        });
        entered.resolve(pid);
        await release.promise;
      },
      { timeout: 15000 },
    );
    const blocker = await entered.promise;
    const outcome = asTeacher(() =>
      service.create(actor(), resource(), command),
    ).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    try {
      await blockedBy(blocker);
      release.resolve();
      await retiring;
      const result = await outcome;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ code: 'not_found' });
    } finally {
      release.resolve();
      await Promise.allSettled([retiring, outcome]);
    }
  });
  it('actual repository publication waits for a committed asset mutation on the assignment row', async () => {
    const { command } = await managed(),
      entered = latch<number>(),
      release = latch<void>();
    const original = fixture.repository.readyHomeworkFile.bind(
      fixture.repository,
    ) as AssessmentMediaRepository['readyHomeworkFile'];
    jest
      .spyOn(fixture.repository, 'readyHomeworkFile')
      .mockImplementation(async (tx, input) => {
        const value = await original(tx, input);
        if (input.lock) {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          entered.resolve(pid);
          await release.promise;
        }
        return value;
      });
    const writing = asTeacher(() =>
      service.create(actor(), resource(), command),
    );
    const writer = await entered.promise,
      publishing = publish();
    try {
      await blockedBy(writer);
      release.resolve();
      const created = await writing;
      await publishing;
      expect(
        (
          await prisma.homeworkAssignment.findUniqueOrThrow({
            where: { id: graph.homework.id },
          })
        ).status,
      ).toBe('PUBLISHED');
      expect(
        (await asTeacher(() => service.list(actor(), resource()))).assets.map(
          (row) => row.assetId,
        ),
      ).toEqual([created.asset.assetId]);
      await expect(
        asTeacher(() => service.create(actor(), resource(2), external)),
      ).rejects.toMatchObject({ code: 'homework.question.read_only' });
    } finally {
      release.resolve();
      await Promise.allSettled([writing, publishing]);
    }
  });
  it('concurrent reorder serializes real writers and preserves deterministic ties', async () => {
    const first = await managed(),
      second = await managed();
    const a = await asTeacher(() =>
        service.create(actor(), resource(), first.command),
      ),
      b = await asTeacher(() =>
        service.create(actor(), resource(), second.command),
      );
    const entered = latch<number>(),
      release = latch<void>();
    let pause = true;
    const original = fixture.repository.readyHomeworkFile.bind(
      fixture.repository,
    ) as AssessmentMediaRepository['readyHomeworkFile'];
    jest
      .spyOn(fixture.repository, 'readyHomeworkFile')
      .mockImplementation(async (tx, input) => {
        const value = await original(tx, input);
        if (pause) {
          pause = false;
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          entered.resolve(pid);
          await release.promise;
        }
        return value;
      });
    const writing = asTeacher(() =>
      service.reorder(
        actor(),
        { ...resource(), assetId: a.asset.assetId },
        { sortOrder: 7 },
      ),
    );
    const writer = await entered.promise;
    const following = asTeacher(() =>
      service.reorder(
        actor(),
        { ...resource(), assetId: b.asset.assetId },
        { sortOrder: 7 },
      ),
    );
    try {
      await blockedBy(writer);
      release.resolve();
      await Promise.all([writing, following]);
      const listed = await asTeacher(() => service.list(actor(), resource()));
      expect(listed.assets).toHaveLength(2);
      expect(listed.assets.every((asset) => asset.sortOrder === 7)).toBe(true);
      expect(await asTeacher(() => service.list(actor(), resource()))).toEqual(
        listed,
      );
    } finally {
      release.resolve();
      await Promise.allSettled([writing, following]);
    }
  });
});
