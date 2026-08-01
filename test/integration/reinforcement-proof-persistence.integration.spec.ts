import { randomUUID } from 'node:crypto';
import {
  FileVisibility,
  ReinforcementProofType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AuthRepository } from '../../src/modules/iam/auth/infrastructure/auth.repository';
import { ReinforcementProofContentVerifierService } from '../../src/modules/reinforcement/reviews/application/reinforcement-proof-content-verifier.service';
import { SubmitReinforcementStageUseCase } from '../../src/modules/reinforcement/reviews/application/submit-reinforcement-stage.use-case';
import {
  ReinforcementProofInvalidContentException,
  ReinforcementProofMimeMismatchException,
  ReinforcementProofVerificationUnavailableException,
} from '../../src/modules/reinforcement/reviews/domain/reinforcement-proof-content';
import { ReinforcementReviewsRepository } from '../../src/modules/reinforcement/reviews/infrastructure/reinforcement-reviews.repository';

jest.setTimeout(120_000);

describe('reinforcement proof persistence guarantees (real PostgreSQL)', () => {
  const marker = `g06-proof-persistence-${randomUUID().slice(0, 8)}`;
  let prisma: PrismaService;
  let reviewsRepository: ReinforcementReviewsRepository;
  let authRepository: AuthRepository;
  let organizationId: string;
  let schoolId: string;
  let actorId: string;
  let otherUploaderId: string;
  let academicYearId: string;
  let termId: string;
  let academicStageId: string;
  let gradeId: string;
  let sectionId: string;
  let classroomId: string;
  let studentId: string;
  let enrollmentId: string;

  beforeAll(async () => {
    assertDisposableDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    reviewsRepository = new ReinforcementReviewsRepository(prisma);
    authRepository = new AuthRepository(prisma);

    const organization = await prisma.organization.create({
      data: { name: `${marker}-organization`, slug: `${marker}-organization` },
      select: { id: true },
    });
    organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${marker}-school`,
        slug: `${marker}-school`,
      },
      select: { id: true },
    });
    schoolId = school.id;
    [actorId, otherUploaderId] = await Promise.all([
      createUser('actor', UserType.SCHOOL_USER),
      createUser('other-uploader', UserType.STUDENT),
    ]);

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    academicYearId = academicYear.id;
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    termId = term.id;
    const academicStage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage`,
      },
      select: { id: true },
    });
    academicStageId = academicStage.id;
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: academicStageId,
        nameAr: `${marker}-grade-ar`,
        nameEn: `${marker}-grade`,
      },
      select: { id: true },
    });
    gradeId = grade.id;
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId,
        nameAr: `${marker}-section-ar`,
        nameEn: `${marker}-section`,
      },
      select: { id: true },
    });
    sectionId = section.id;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId,
        nameAr: `${marker}-classroom-ar`,
        nameEn: `${marker}-classroom`,
      },
      select: { id: true },
    });
    classroomId = classroom.id;
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        firstName: 'G06',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    studentId = student.id;
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId,
        academicYearId,
        termId,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    enrollmentId = enrollment.id;
  });

  afterEach(cleanTestMutations);

  afterAll(async () => {
    if (!prisma) return;
    await cleanTestMutations();
    await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.classroom.deleteMany({ where: { id: classroomId } });
    await prisma.section.deleteMany({ where: { id: sectionId } });
    await prisma.grade.deleteMany({ where: { id: gradeId } });
    await prisma.stage.deleteMany({ where: { id: academicStageId } });
    await prisma.term.deleteMany({ where: { id: termId } });
    await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
    await prisma.user.deleteMany({
      where: { id: { in: [actorId, otherUploaderId] } },
    });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it.each([
    {
      label: 'MIME not allowed',
      proofType: ReinforcementProofType.VIDEO,
      errorCode: 'reinforcement.proof.mime_not_allowed',
      verifierError: null,
    },
    {
      label: 'MIME mismatch',
      proofType: ReinforcementProofType.IMAGE,
      errorCode: 'reinforcement.proof.mime_mismatch',
      verifierError: new ReinforcementProofMimeMismatchException(),
    },
    {
      label: 'invalid content',
      proofType: ReinforcementProofType.IMAGE,
      errorCode: 'reinforcement.proof.invalid_content',
      verifierError: new ReinforcementProofInvalidContentException(),
    },
    {
      label: 'verification unavailable',
      proofType: ReinforcementProofType.IMAGE,
      errorCode: 'reinforcement.proof.verification_unavailable',
      verifierError: new ReinforcementProofVerificationUnavailableException(
        new Error('internal storage cause'),
      ),
    },
  ])(
    'leaves persistence and audit untouched when $label rejects',
    async ({ proofType, errorCode, verifierError }) => {
      const fixture = await createSubmissionFixture({ proofType });
      const verifier = verifierRejecting(verifierError);

      await expect(executeSubmission(fixture, verifier)).rejects.toMatchObject({
        code: errorCode,
      });

      await expectFailedSubmissionPreserved(fixture, null);
    },
  );

  it('leaves persistence and audit untouched when proof ownership is hidden', async () => {
    const fixture = await createSubmissionFixture({
      proofType: ReinforcementProofType.IMAGE,
      uploaderId: otherUploaderId,
    });
    const verifier = verifierRejecting(null);

    await expect(executeSubmission(fixture, verifier)).rejects.toMatchObject({
      code: 'not_found',
      httpStatus: 404,
    });

    expect(verifier.verify).not.toHaveBeenCalled();
    await expectFailedSubmissionPreserved(fixture, null);
  });

  it('does not mutate an existing rejected submission when verification fails', async () => {
    const fixture = await createSubmissionFixture({
      proofType: ReinforcementProofType.IMAGE,
      existingSubmission: true,
    });
    const existingBefore = await readSubmission(fixture.assignmentId);
    const verifier = verifierRejecting(
      new ReinforcementProofInvalidContentException(),
    );

    await expect(executeSubmission(fixture, verifier)).rejects.toMatchObject({
      code: 'reinforcement.proof.invalid_content',
    });

    await expectFailedSubmissionPreserved(fixture, existingBefore);
  });

  it('creates exactly one verified submission, mutates the assignment once, audits once, and preserves File metadata', async () => {
    const fixture = await createSubmissionFixture({
      proofType: ReinforcementProofType.IMAGE,
    });
    const verifier = verifierRejecting(null);

    const result = await executeSubmission(fixture, verifier);
    expect(result.status).toBe('submitted');
    expect(result.proof.file?.id).toBe(fixture.proofFileId);

    const submissions = await prisma.reinforcementSubmission.findMany({
      where: { assignmentId: fixture.assignmentId, stageId: fixture.stageId },
    });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      proofFileId: fixture.proofFileId,
      submittedById: actorId,
      status: ReinforcementSubmissionStatus.SUBMITTED,
    });
    await expectSuccessfulAssignmentMutation(fixture.assignmentId, null, 0);
    await expectSingleAudit(submissions[0].id);
    await expectFileUnchanged(fixture);
  });

  it('resubmits the existing row exactly once with the authenticated actor and one audit', async () => {
    const fixture = await createSubmissionFixture({
      proofType: ReinforcementProofType.IMAGE,
      existingSubmission: true,
    });
    const existingBefore = await readSubmission(fixture.assignmentId);
    const verifier = verifierRejecting(null);

    await expect(executeSubmission(fixture, verifier)).resolves.toMatchObject({
      id: existingBefore?.id,
      status: 'submitted',
    });

    const submissions = await prisma.reinforcementSubmission.findMany({
      where: { assignmentId: fixture.assignmentId, stageId: fixture.stageId },
    });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      id: existingBefore?.id,
      proofFileId: fixture.proofFileId,
      submittedById: actorId,
      status: ReinforcementSubmissionStatus.SUBMITTED,
      currentReviewId: null,
      reviewedAt: null,
    });
    await expectSuccessfulAssignmentMutation(
      fixture.assignmentId,
      fixture.assignmentBefore.startedAt,
      35,
    );
    await expectSingleAudit(submissions[0].id);
    await expectFileUnchanged(fixture);
  });

  async function createSubmissionFixture(params: {
    proofType: ReinforcementProofType;
    uploaderId?: string;
    existingSubmission?: boolean;
  }) {
    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        titleEn: `${marker}-task-${randomUUID()}`,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
      },
      select: { id: true },
    });
    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${marker}-proof-stage`,
        proofType: params.proofType,
        requiresApproval: true,
      },
      select: { id: true },
    });
    const startedAt = params.existingSubmission
      ? new Date('2026-10-01T08:00:00.000Z')
      : null;
    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId,
        taskId: task.id,
        academicYearId,
        termId,
        studentId,
        enrollmentId,
        status: params.existingSubmission
          ? ReinforcementTaskStatus.IN_PROGRESS
          : ReinforcementTaskStatus.NOT_COMPLETED,
        progress: params.existingSubmission ? 35 : 0,
        startedAt,
      },
      select: { id: true },
    });
    const proofFile = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: params.uploaderId ?? actorId,
        bucket: 'g06-private-files',
        objectKey: `${marker}/${randomUUID()}`,
        originalName: `${marker}-${randomUUID()}.png`,
        mimeType: 'image/png',
        sizeBytes: 33n,
        checksumSha256: 'a'.repeat(64),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });

    if (params.existingSubmission) {
      await prisma.reinforcementSubmission.create({
        data: {
          schoolId,
          assignmentId: assignment.id,
          taskId: task.id,
          stageId: stage.id,
          studentId,
          enrollmentId,
          status: ReinforcementSubmissionStatus.REJECTED,
          proofFileId: proofFile.id,
          proofText: 'Original rejected proof',
          submittedById: actorId,
          submittedAt: new Date('2026-10-01T08:05:00.000Z'),
          reviewedAt: new Date('2026-10-01T09:00:00.000Z'),
          metadata: { original: true },
        },
      });
    }

    return {
      taskId: task.id,
      stageId: stage.id,
      assignmentId: assignment.id,
      proofFileId: proofFile.id,
      assignmentBefore: await readAssignment(assignment.id),
      fileBefore: await readFile(proofFile.id),
    };
  }

  function executeSubmission(
    fixture: { assignmentId: string; stageId: string; proofFileId: string },
    verifier: jest.Mocked<
      Pick<ReinforcementProofContentVerifierService, 'verify'>
    >,
  ) {
    const useCase = new SubmitReinforcementStageUseCase(
      reviewsRepository,
      authRepository,
      verifier as unknown as ReinforcementProofContentVerifierService,
    );
    const context = createRequestContext(`${marker}-request`);
    context.actor = { id: actorId, userType: UserType.SCHOOL_USER };
    context.activeMembership = {
      membershipId: randomUUID(),
      organizationId,
      schoolId,
      roleId: randomUUID(),
      permissions: ['reinforcement.tasks.manage'],
    };
    return runWithRequestContext(context, () =>
      useCase.execute(fixture.assignmentId, fixture.stageId, {
        proofFileId: fixture.proofFileId,
        proofText: '  Verified proof  ',
      }),
    );
  }

  function verifierRejecting(error: Error | null) {
    return {
      verify: error
        ? jest.fn().mockRejectedValue(error)
        : jest.fn().mockResolvedValue(undefined),
    };
  }

  async function expectFailedSubmissionPreserved(
    fixture: Awaited<ReturnType<typeof createSubmissionFixture>>,
    submissionBefore: Awaited<ReturnType<typeof readSubmission>>,
  ) {
    await expect(readSubmission(fixture.assignmentId)).resolves.toEqual(
      submissionBefore,
    );
    await expect(readAssignment(fixture.assignmentId)).resolves.toEqual(
      fixture.assignmentBefore,
    );
    await expectFileUnchanged(fixture);
    await expect(auditCount()).resolves.toBe(0);
  }

  async function expectSuccessfulAssignmentMutation(
    assignmentId: string,
    expectedStartedAt: Date | null,
    expectedProgress: number,
  ) {
    const assignment = await readAssignment(assignmentId);
    expect(assignment).toMatchObject({
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      progress: expectedProgress,
      completedAt: null,
      cancelledAt: null,
    });
    expect(assignment?.startedAt).toEqual(
      expectedStartedAt ?? expect.any(Date),
    );
  }

  async function expectSingleAudit(submissionId: string) {
    await expect(
      prisma.auditLog.findMany({
        where: {
          actorId,
          schoolId,
          action: 'reinforcement.submission.submit',
        },
        select: {
          resourceId: true,
          resourceType: true,
          outcome: true,
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        resourceId: submissionId,
        resourceType: 'reinforcement_submission',
        outcome: 'SUCCESS',
      }),
    ]);
  }

  function expectFileUnchanged(
    fixture: Awaited<ReturnType<typeof createSubmissionFixture>>,
  ) {
    return expect(readFile(fixture.proofFileId)).resolves.toEqual(
      fixture.fileBefore,
    );
  }

  function readAssignment(assignmentId: string) {
    return prisma.reinforcementAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        status: true,
        progress: true,
        assignedAt: true,
        startedAt: true,
        completedAt: true,
        cancelledAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  function readSubmission(assignmentId: string) {
    return prisma.reinforcementSubmission.findFirst({
      where: { assignmentId },
      select: {
        id: true,
        status: true,
        proofFileId: true,
        proofText: true,
        submittedById: true,
        submittedAt: true,
        currentReviewId: true,
        reviewedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  function readFile(fileId: string) {
    return prisma.file.findUnique({
      where: { id: fileId },
      select: {
        organizationId: true,
        schoolId: true,
        uploaderId: true,
        bucket: true,
        objectKey: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        checksumSha256: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
  }

  function auditCount() {
    return prisma.auditLog.count({
      where: {
        actorId,
        schoolId,
        action: 'reinforcement.submission.submit',
      },
    });
  }

  async function cleanTestMutations() {
    if (!prisma || !schoolId) return;
    await prisma.auditLog.deleteMany({
      where: { actorId, schoolId, action: 'reinforcement.submission.submit' },
    });
    await prisma.reinforcementSubmission.updateMany({
      where: { schoolId, task: { titleEn: { startsWith: marker } } },
      data: { currentReviewId: null },
    });
    await prisma.reinforcementReview.deleteMany({
      where: { schoolId, task: { titleEn: { startsWith: marker } } },
    });
    await prisma.reinforcementSubmission.deleteMany({
      where: { schoolId, task: { titleEn: { startsWith: marker } } },
    });
    await prisma.reinforcementAssignment.deleteMany({
      where: { schoolId, task: { titleEn: { startsWith: marker } } },
    });
    await prisma.reinforcementTaskStage.deleteMany({
      where: { schoolId, task: { titleEn: { startsWith: marker } } },
    });
    await prisma.reinforcementTask.deleteMany({
      where: { schoolId, titleEn: { startsWith: marker } },
    });
    await prisma.file.deleteMany({
      where: { schoolId, originalName: { startsWith: marker } },
    });
  }

  async function createUser(
    label: string,
    userType: UserType,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'G06',
        lastName: label,
        userType,
      },
      select: { id: true },
    });
    return user.id;
  }
});

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Disposable DATABASE_URL is required');
  const databaseName = decodeURIComponent(new URL(raw).pathname.slice(1));
  if (!/^g06_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error('G06 persistence tests require a disposable G06 database');
  }
}
