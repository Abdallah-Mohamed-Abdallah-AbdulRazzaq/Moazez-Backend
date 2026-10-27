import { DomainException } from '../../src/common/exceptions/domain-exception';
import type { AssessmentMediaRepository } from '../../src/modules/files/assessment-media/infrastructure/assessment-media.repository';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PersistedUrlPolicy } from '../../src/infrastructure/storage/provider-url.policy';
import { PrivateMediaContentService } from '../../src/infrastructure/storage/private-media-content.service';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { GradeAssetsRepository } from '../../src/modules/grades/assessments/infrastructure/grade-assets.repository';
import { GradeAssetsService } from '../../src/modules/grades/assessments/application/grade-assets.service';
import { GradesAssessmentsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-assessments.repository';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import { GradeAssetsFixture } from '../fixtures/grade-assets.fixture';
import { StudentGradeAssetsService } from '../../src/modules/student-app/assessment-assets/student-grade-assets.service';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { StudentExamsReadAdapter } from '../../src/modules/student-app/exams/infrastructure/student-exams-read.adapter';
import { StudentGradesReadAdapter } from '../../src/modules/student-app/grades/infrastructure/student-grades-read.adapter';
jest.setTimeout(120000);
describe('ST-07 actual PostgreSQL transactional authorization and capacity', () => {
  const prisma = new PrismaService();
  let fixture: GradeAssetsFixture;
  let service: GradeAssetsService;
  let graph: Awaited<ReturnType<GradeAssetsFixture['gradeGraph']>>;
  const actor = () => ({
    surface: 'teacher' as const,
    classId: fixture.allocations.teacher,
  });
  const resource = (question?: number) => ({
    assessmentId: graph.assessment.id,
    ...(question === undefined
      ? {}
      : { questionId: graph.questions[question].id }),
  });
  const teacher = <T>(operation: () => Promise<T>) =>
    fixture.asMediaActor('teacher', operation);
  const external = {
    sourceType: 'EXTERNAL_HTTPS' as const,
    externalUrl: 'https://media.example.org/reference.txt',
  };
  beforeAll(async () => {
    fixture = new GradeAssetsFixture(prisma);
    await prisma.$connect();
  });
  beforeEach(async () => {
    fixture = new GradeAssetsFixture(prisma);
    await fixture.create();
    graph = await fixture.gradeGraph();
    const urls = new PersistedUrlPolicy({
      s3CompatibleEndpoints: [
        fixture.config.getOrThrow<string>('STORAGE_ENDPOINT'),
      ],
    });
    service = new GradeAssetsService(
      new GradeAssetsRepository(
        prisma,
        new PrismaTeacherAllocationOperationalWriteGate(),
        fixture.repository,
        new AssessmentMediaRuntimePolicy(fixture.config),
        fixture.config,
        urls,
      ),
      new PrivateMediaContentService(fixture.storage),
      urls,
    );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.dispose();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it.each(['student-exams', 'student-grades'] as const)(
    '%s denies stale Term A asset authorization after committed enrollment reassignment and permits fresh Term B bytes',
    async (surface) => {
      const readyA = await fixture.readyGrade(graph.assessment.id);
      const assetsA = [];
      for (const target of [resource(), resource(0)]) {
        const created = await teacher(() =>
          service.create(actor(), target, {
            sourceType: 'MANAGED_FILE',
            fileId: readyA.fileId,
            uploadId: readyA.uploadId,
          }),
        );
        assetsA.push({ ...target, assetId: created.asset.assetId });
      }
      const termA = await prisma.term.findUniqueOrThrow({
        where: { id: fixture.school.termId },
      });
      const termB = await prisma.term.create({
        data: {
          schoolId: fixture.school.schoolId,
          academicYearId: fixture.school.yearId,
          nameAr: 'ST07-REV-01 Term B',
          nameEn: 'ST07-REV-01 Term B',
          startDate: termA.startDate,
          endDate: termA.endDate,
          isActive: true,
        },
      });
      const allocationB = await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: fixture.school.schoolId,
          teacherUserId: fixture.actors.teacher.userId,
          classroomId: fixture.school.classroomId,
          subjectId: fixture.school.subjectId,
          termId: termB.id,
        },
      });
      const draftB = await fixture.assessment();
      const assessmentB = await prisma.gradeAssessment.update({
        where: { id: draftB.id },
        data: {
          termId: termB.id,
          deliveryMode: 'SCORE_ONLY',
          // Preserve the broader Grades audience alongside exam-only access.
          type: surface === 'student-grades' ? 'ASSIGNMENT' : 'QUIZ',
        },
      });
      const bytesB = Buffer.from('ST07-REV-01 authorized Term B bytes\n');
      const readyB = await fixture.readyGrade(
        assessmentB.id,
        'teacher',
        bytesB,
        'term-b.txt',
      );
      const assetB = await teacher(() =>
        service.create(
          { surface: 'teacher', classId: allocationB.id },
          { assessmentId: assessmentB.id },
          {
            sourceType: 'MANAGED_FILE',
            fileId: readyB.fileId,
            uploadId: readyB.uploadId,
          },
        ),
      );
      for (const assessmentId of [graph.assessment.id, assessmentB.id])
        await fixture.asMediaActor('admin', () =>
          new GradesAssessmentsRepository(prisma).publishAssessment(
            assessmentId,
            {
              approvalStatus: 'PUBLISHED',
              publishedAt: new Date(),
              publishedById: fixture.actors.admin.userId,
            },
          ),
        );
      const access = new StudentAppAccessService(
        new StudentAppStudentReadAdapter(prisma),
      );
      const exams = new StudentExamsReadAdapter(prisma);
      const grades = new StudentGradesReadAdapter(prisma);
      const adapter = surface === 'student-exams' ? exams : grades;
      const scoped = prisma.scoped as unknown as PrismaService;
      await fixture.asMediaActor('student', async () => {
        const contextA = await access.getStudentAppContext();
        expect(contextA.termId).toBe(termA.id);
        await scoped.$transaction((tx) =>
          adapter.assertAssetAccess(tx, contextA, graph.assessment.id),
        );

        // Commit reassignment after the real context read, before final auth.
        const reassigned = await prisma.enrollment.update({
          where: { id: contextA.enrollmentId },
          data: { termId: termB.id },
        });
        expect(reassigned).toMatchObject({
          id: contextA.enrollmentId,
          termId: termB.id,
          status: 'ACTIVE',
          academicYearId: contextA.academicYearId,
          classroomId: contextA.classroomId,
          endedAt: null,
        });
        await expect(
          scoped.$transaction((tx) =>
            adapter.assertAssetAccess(tx, contextA, graph.assessment.id),
          ),
        ).rejects.toMatchObject({ code: 'not_found' });
        const readFile = jest.spyOn(fixture.storage, 'getObject');
        for (const target of assetsA)
          await expect(
            service.openContent(
              {
                surface,
                authorize: (tx, assessmentId) =>
                  adapter.assertAssetAccess(tx, contextA, assessmentId),
              },
              target,
              { disposition: 'attachment' },
            ),
          ).rejects.toMatchObject({ code: 'not_found' });
        expect(readFile).not.toHaveBeenCalled();

        const contextB = await access.getStudentAppContext();
        expect(contextB).toMatchObject({
          enrollmentId: contextA.enrollmentId,
          termId: termB.id,
        });
        await scoped.$transaction((tx) =>
          adapter.assertAssetAccess(tx, contextB, assessmentB.id),
        );
        const student = new StudentGradeAssetsService(
          access,
          exams,
          grades,
          service,
        );
        const metadata = await student.metadata(surface, assessmentB.id);
        expect(metadata.assessment.map((asset) => asset.assetId)).toEqual([
          assetB.asset.assetId,
        ]);
        const content = await student.openContent(
          surface,
          { assessmentId: assessmentB.id, assetId: assetB.asset.assetId },
          { disposition: 'attachment' },
        );
        const chunks: Buffer[] = [];
        for await (const chunk of content.stream)
          chunks.push(Buffer.from(chunk as Uint8Array));
        expect(content.statusCode).toBe(200);
        expect(Buffer.concat(chunks)).toEqual(bytesB);
        expect(readFile).toHaveBeenCalledTimes(1);
      });
    },
  );
  it('authorizes both Student surfaces and private content with one database connection', async () => {
    const ready = await fixture.readyGrade(graph.assessment.id);
    const created = await teacher(() =>
      service.create(actor(), resource(), {
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      }),
    );
    await fixture.asMediaActor('admin', () =>
      new GradesAssessmentsRepository(prisma).publishAssessment(
        graph.assessment.id,
        {
          approvalStatus: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: fixture.actors.admin.userId,
        },
      ),
    );
    const databaseUrl = new URL(
      fixture.config.getOrThrow<string>('DATABASE_URL'),
    );
    databaseUrl.searchParams.set('connection_limit', '1');
    databaseUrl.searchParams.set('pool_timeout', '2');
    const single = new PrismaService({ datasourceUrl: databaseUrl.toString() });
    try {
      await single.$connect();
      const urls = new PersistedUrlPolicy();
      const core = new GradeAssetsService(
        new GradeAssetsRepository(
          single,
          new PrismaTeacherAllocationOperationalWriteGate(),
          fixture.repository,
          new AssessmentMediaRuntimePolicy(fixture.config),
          fixture.config,
          urls,
        ),
        new PrivateMediaContentService(fixture.storage),
        urls,
      );
      const student = new StudentGradeAssetsService(
        new StudentAppAccessService(new StudentAppStudentReadAdapter(single)),
        new StudentExamsReadAdapter(single),
        new StudentGradesReadAdapter(single),
        core,
      );
      await fixture.asMediaActor('student', async () => {
        for (const surface of ['student-exams', 'student-grades'] as const) {
          const result = await student.metadata(surface, graph.assessment.id);
          expect(result.assessment.map((asset) => asset.assetId)).toEqual([
            created.asset.assetId,
          ]);
          const content = await student.openContent(
            surface,
            { ...resource(), assetId: created.asset.assetId },
            { head: true, disposition: 'attachment' },
          );
          expect(content.statusCode).toBe(200);
          content.stream.destroy();
        }
      });
    } finally {
      await single.$disconnect();
    }
  });
  function latch<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }
  async function blockedBy(pid: number) {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      const rows = await prisma.$queryRaw<
        Array<{ pid: number }>
      >`SELECT pid FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'`;
      if (rows.length) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Actual PostgreSQL blocking relationship absent');
  }
  it('enforces reference capacity across both families while charging physical upload once and retaining every historical reference', async () => {
    const ready = await fixture.readyGrade(graph.assessment.id);
    const command = {
      sourceType: 'MANAGED_FILE' as const,
      fileId: ready.fileId,
      uploadId: ready.uploadId,
    };
    await prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: fixture.school.schoolId },
      data: { maximumFilesPerResource: 3 },
    });
    const root = await teacher(() =>
      service.create(actor(), resource(), command),
    );
    const results = await Promise.allSettled(
      [0, 1, 2].map((q) =>
        teacher(() => service.create(actor(), resource(q), command)),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.fileUploadSession.count({
        where: { purposeContextId: graph.assessment.id, status: 'READY' },
      }),
    ).toBe(1);
    await teacher(() =>
      service.remove(actor(), { ...resource(), assetId: root.asset.assetId }),
    );
    expect(await hasRetainedFileReferences(prisma, ready.fileId)).toBe(true);
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: ready.fileId } }))
        .deletedAt,
    ).toBeNull();
  });
  it.each(['PUBLISHED', 'APPROVED', 'LOCKED', 'SUBMISSION'] as const)(
    'rejects stale author mutation after %s state change',
    async (state) => {
      await teacher(() => service.list(actor(), resource(0)));
      if (state === 'SUBMISSION')
        await prisma.gradeSubmission.create({
          data: {
            schoolId: fixture.school.schoolId,
            assessmentId: graph.assessment.id,
            termId: fixture.school.termId,
            studentId: fixture.children[0].studentId,
            enrollmentId: fixture.children[0].enrollmentId,
          },
        });
      else
        await prisma.gradeAssessment.update({
          where: { id: graph.assessment.id },
          data:
            state === 'LOCKED'
              ? { lockedAt: new Date() }
              : { approvalStatus: state },
        });
      await expect(
        teacher(() => service.create(actor(), resource(0), external)),
      ).rejects.toMatchObject({ httpStatus: 409 });
      expect(
        await prisma.gradeAssessmentQuestionAsset.count({
          where: { questionId: graph.questions[0].id },
        }),
      ).toBe(0);
    },
  );
  it.each([
    'membership',
    'permission',
    'allocation',
    'classroom',
    'term',
    'question',
    'asset',
    'publish',
    'approve',
    'lock',
    'submission',
  ] as const)('%s wins before a waiting actual transaction', async (kind) => {
    const created =
      kind === 'asset'
        ? await teacher(() => service.create(actor(), resource(0), external))
        : null;
    await teacher(() => service.list(actor(), resource(0)));
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'grades.questions.manage' },
    });
    const entered = latch<number>(),
      release = latch<void>();
    const revoking = prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        if (kind === 'membership')
          await tx.membership.update({
            where: { id: fixture.actors.teacher.membershipId },
            data: { status: 'SUSPENDED' },
          });
        else if (kind === 'permission')
          await tx.rolePermission.deleteMany({
            where: {
              roleId: fixture.actors.teacher.roleId,
              permissionId: permission.id,
            },
          });
        else if (kind === 'allocation')
          await tx.teacherSubjectAllocation.update({
            where: { id: fixture.allocations.teacher },
            data: { teacherUserId: fixture.actors.otherTeacher.userId },
          });
        else if (kind === 'classroom')
          await tx.classroom.update({
            where: { id: fixture.actors.teacher.classroomId },
            data: { deletedAt: new Date() },
          });
        else if (kind === 'term')
          await tx.term.update({
            where: { id: fixture.school.termId },
            data: { isActive: false },
          });
        else if (kind === 'question')
          await tx.gradeAssessmentQuestion.update({
            where: { id: graph.questions[0].id },
            data: { deletedAt: new Date() },
          });
        else if (kind === 'asset')
          await tx.gradeAssessmentQuestionAsset.update({
            where: { id: created!.asset.assetId },
            data: { deletedAt: new Date() },
          });
        else {
          await tx.$queryRaw`SELECT id FROM grade_assessments WHERE id=${graph.assessment.id}::uuid FOR UPDATE`;
          if (kind === 'submission')
            await tx.gradeSubmission.create({
              data: {
                schoolId: fixture.school.schoolId,
                assessmentId: graph.assessment.id,
                termId: fixture.school.termId,
                studentId: fixture.children[0].studentId,
                enrollmentId: fixture.children[0].enrollmentId,
              },
            });
          else
            await tx.gradeAssessment.update({
              where: { id: graph.assessment.id },
              data:
                kind === 'lock'
                  ? { lockedAt: new Date() }
                  : {
                      approvalStatus:
                        kind === 'publish' ? 'PUBLISHED' : 'APPROVED',
                    },
            });
        }
        entered.resolve(pid);
        await release.promise;
      },
      { timeout: 20000 },
    );
    const blocker = await entered.promise;
    const outcome = teacher(() =>
      created
        ? service.update(
            actor(),
            { ...resource(0), assetId: created.asset.assetId },
            { title: 'Stale' },
          )
        : service.create(actor(), resource(0), external),
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
      if (!result.ok) expect(result.error).toBeInstanceOf(DomainException);
      expect(
        await prisma.gradeAssessmentQuestionAsset.count({
          where: { questionId: graph.questions[0].id, deletedAt: null },
        }),
      ).toBe(0);
    } finally {
      release.resolve();
      await Promise.allSettled([revoking, outcome]);
    }
  });
  it('actual repository publication waits for an asset write and both commit in order', async () => {
    const ready = await fixture.readyGrade(graph.assessment.id),
      entered = latch<void>(),
      release = latch<void>();
    let pid = 0;
    const original = fixture.repository.readyGradeAssessmentFile.bind(
      fixture.repository,
    ) as AssessmentMediaRepository['readyGradeAssessmentFile'];
    jest
      .spyOn(fixture.repository, 'readyGradeAssessmentFile')
      .mockImplementation(async (tx, input) => {
        const value = await original(tx, input);
        if (input.lock) {
          [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          entered.resolve();
          await release.promise;
        }
        return value;
      });
    const writing = teacher(() =>
      service.create(actor(), resource(), {
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      }),
    );
    await entered.promise;
    const publishing = fixture.asMediaActor('admin', () =>
      new GradesAssessmentsRepository(prisma).publishAssessment(
        graph.assessment.id,
        {
          approvalStatus: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: fixture.actors.admin.userId,
        },
      ),
    );
    try {
      await blockedBy(pid);
      release.resolve();
      await writing;
      await publishing;
      expect(
        (
          await prisma.gradeAssessment.findUniqueOrThrow({
            where: { id: graph.assessment.id },
          })
        ).approvalStatus,
      ).toBe('PUBLISHED');
    } finally {
      release.resolve();
      await Promise.allSettled([writing, publishing]);
    }
  });
  it('retirement wins the File lock before a stale binding', async () => {
    const ready = await fixture.readyGrade(graph.assessment.id),
      entered = latch<number>(),
      release = latch<void>();
    const retiring = prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        await tx.file.update({
          where: { id: ready.fileId },
          data: { deletedAt: new Date() },
        });
        entered.resolve(pid);
        await release.promise;
      },
      { timeout: 20000 },
    );
    const blocker = await entered.promise;
    const outcome = teacher(() =>
      service.create(actor(), resource(), {
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      }),
    ).then(
      () => true,
      () => false,
    );
    try {
      await blockedBy(blocker);
      release.resolve();
      await retiring;
      expect(await outcome).toBe(false);
    } finally {
      release.resolve();
      await Promise.allSettled([retiring, outcome]);
    }
  });
  it('concurrent reorders serialize and preserve deterministic ties and atomic safe audit', async () => {
    const a = await teacher(() =>
        service.create(actor(), resource(), external),
      ),
      b = await teacher(() => service.create(actor(), resource(), external));
    await Promise.all(
      [a, b].map((asset) =>
        teacher(() =>
          service.reorder(
            actor(),
            { ...resource(), assetId: asset.asset.assetId },
            { sortOrder: 2 },
          ),
        ),
      ),
    );
    const first = await teacher(() => service.list(actor(), resource())),
      second = await teacher(() => service.list(actor(), resource()));
    expect(first.assets.map((x) => x.assetId)).toEqual(
      second.assets.map((x) => x.assetId),
    );
    const audits = await prisma.auditLog.findMany({
      where: { resourceId: a.asset.assetId },
    });
    expect(audits.map((x) => x.action).sort()).toEqual([
      'grade.assessment.asset.create',
      'grade.assessment.asset.reorder',
    ]);
    expect(JSON.stringify(audits.map((x) => x.after))).not.toMatch(
      /fileId|objectKey|bucket|externalUrl|assessmentSecurityEvidence/u,
    );
  });
  it('orders all owned allocation fences consistently across simultaneous classroom writes', async () => {
    const other = await fixture.gradeGraph('otherTeacher');
    await prisma.teacherSubjectAllocation.update({
      where: { id: fixture.allocations.otherTeacher },
      data: { teacherUserId: fixture.actors.teacher.userId },
    });
    await prisma.gradeAssessment.update({
      where: { id: other.assessment.id },
      data: { createdById: fixture.actors.teacher.userId },
    });
    const results = await Promise.all([
      teacher(() => service.create(actor(), resource(), external)),
      teacher(() =>
        service.create(
          { surface: 'teacher', classId: fixture.allocations.otherTeacher },
          { assessmentId: other.assessment.id },
          external,
        ),
      ),
    ]);
    expect(
      new Set(results.map((result) => result.asset.assessmentId)).size,
    ).toBe(2);
  });

  it('a binding that wins the File lock makes retirement observe the committed retained reference', async () => {
    const ready = await fixture.readyGrade(graph.assessment.id),
      entered = latch<number>(),
      release = latch<void>();
    const original = fixture.repository.readyGradeAssessmentFile.bind(
      fixture.repository,
    ) as AssessmentMediaRepository['readyGradeAssessmentFile'];
    jest
      .spyOn(fixture.repository, 'readyGradeAssessmentFile')
      .mockImplementation(async (tx, input) => {
        const result = await original(tx, input);
        if (input.lock) {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          entered.resolve(pid);
          await release.promise;
        }
        return result;
      });
    const writing = teacher(() =>
      service.create(actor(), resource(), {
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      }),
    );
    const writer = await entered.promise;
    const retiring = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM files WHERE id=${ready.fileId}::uuid FOR UPDATE`;
        const keep = await hasRetainedFileReferences(tx, ready.fileId);
        if (!keep)
          await tx.file.update({
            where: { id: ready.fileId },
            data: { deletedAt: new Date() },
          });
        return keep;
      },
      { timeout: 20000 },
    );
    try {
      await blockedBy(writer);
      release.resolve();
      await writing;
      expect(await retiring).toBe(true);
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: ready.fileId } }))
          .deletedAt,
      ).toBeNull();
    } finally {
      release.resolve();
      await Promise.allSettled([writing, retiring]);
    }
  });
});
