import { createHash, randomUUID } from 'node:crypto';
import {
  assessmentMediaOwner,
  ASSESSMENT_MEDIA_VERSION,
  type AssessmentMediaPurpose,
} from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import {
  AssessmentMediaFixture,
  type MediaFixtureActor,
} from './assessment-media.fixture';

const authorPermissions = [
  'homework.assignments.view',
  'homework.assignments.manage',
  'homework.questions.view',
  'homework.questions.manage',
  'homework.attachments.manage',
  'homework.attachments.view',
  'homework.targets.view',
  'homework.targets.manage',
  'homework.submissions.view',
];

/** Owned academic graph for managed Homework and Grades files. */
export class HomeworkQuestionAssetsFixture extends AssessmentMediaFixture {
  async create(): Promise<void> {
    await super.create();
    // Existing Homework Core requires an active School scope, including Organization users.
    await this.prisma.membership.update({
      where: { id: this.actors.organization.membershipId },
      data: { schoolId: this.school.schoolId },
    });
    for (const [name, actor] of Object.entries(this.actors)) {
      const permissions =
        actor.userType === 'STUDENT'
          ? ['homework.assignments.view', 'homework.submissions.view']
          : authorPermissions;
      await this.grantAssets(actor.roleId, permissions);
      this.actors[name as MediaFixtureActor].permissions = [
        ...new Set([...actor.permissions, ...permissions]),
      ];
    }
    await this.grantAssets(this.parentRoleId, [
      'homework.assignments.view',
      'homework.submissions.view',
      'parent.children.view',
    ]);
    for (const school of this.schools) {
      await this.prisma.academicYear.update({
        where: { id: school.yearId },
        data: { isActive: true },
      });
      await this.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: school.schoolId },
        data: { allowInlinePreview: true, allowDownload: true },
      });
    }
  }
  async grantAssets(roleId: string, codes: readonly string[]): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true },
    });
    if (permissions.length !== codes.length)
      throw new Error(
        'Owned fixture requires existing seeded permission codes',
      );
    await this.prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
  async question(homeworkId: string, prompt = 'Owned question') {
    const homework = await this.prisma.homeworkAssignment.findUniqueOrThrow({
      where: { id: homeworkId },
    });
    return this.prisma.homeworkQuestion.create({
      data: {
        schoolId: homework.schoolId,
        homeworkAssignmentId: homework.id,
        type: 'SHORT_TEXT',
        prompt,
        createdByUserId: homework.createdByUserId,
        points: 1,
        isRequired: false,
      },
    });
  }
  async graph(
    actor: 'teacher' | 'otherTeacher' | 'foreignTeacher' = 'teacher',
  ) {
    const homework = await this.homework('DRAFT', actor);
    await this.prisma.homeworkAssignment.update({
      where: { id: homework.id },
      data: { targetMode: 'SELECTED_STUDENTS' },
    });
    const questions = await Promise.all([
      this.question(homework.id, 'Question A'),
      this.question(homework.id, 'Question B'),
      this.question(homework.id, 'No assets'),
    ]);
    const child = this.children[actor === 'foreignTeacher' ? 2 : 0];
    // A different classroom owner intentionally has no student target from this graph.
    if (actor !== 'otherTeacher')
      await this.prisma.homeworkTarget.create({
        data: {
          schoolId: homework.schoolId,
          homeworkAssignmentId: homework.id,
          studentId: child.studentId,
          enrollmentId: child.enrollmentId,
        },
      });
    return { homework, questions };
  }
  async ready(
    contextId: string,
    actor: MediaFixtureActor = 'teacher',
    bytes: Buffer = Buffer.from('Owned ST06 verified text\n'),
    purpose: AssessmentMediaPurpose = 'HOMEWORK_ASSIGNMENT_MEDIA',
    filename = 'reference.txt',
  ) {
    return this.asMediaActor(actor, async () => {
      const uploaded = await this.upload(contextId, bytes, purpose, filename);
      const result = await this.service.complete(
        purpose,
        contextId,
        uploaded.intent.uploadId,
      );
      if (result.status !== 'READY' || !result.fileId)
        throw new Error('Owned verified upload did not produce READY');
      const file = await this.prisma.file.findUniqueOrThrow({
        where: { id: result.fileId },
      });
      if (
        file.checksumSha256 !== createHash('sha256').update(bytes).digest('hex')
      )
        throw new Error('Owned verified File checksum mismatch');
      // Simulate expiration of the already-used capability, not expiration of READY.
      // This preserves the existing two-concurrent-capability limit across cases.
      await this.prisma.fileUploadSession.update({
        where: { id: result.uploadId },
        data: {
          latestUploadUrlExpiresAt: new Date(
            uploaded.session.createdAt.getTime() + 1,
          ),
        },
      });
      return { uploadId: result.uploadId, fileId: result.fileId, file, bytes };
    });
  }

  /** Reconstructs historical evidence in a disposable database for read compatibility tests. */
  async historicalHomeworkReady(homeworkId: string) {
    const purpose = 'HOMEWORK_ASSIGNMENT_MEDIA';
    const { session, bytes } = await this.asMediaActor('teacher', async () => {
      const uploaded = await this.upload(homeworkId);
      await this.repository.claim(
        assessmentMediaOwner(purpose, homeworkId),
        uploaded.intent.uploadId,
      );
      return uploaded;
    });
    await this.storage.saveObject({
      bucket: session.finalBucket,
      objectKey: session.finalObjectKey,
      body: bytes,
      contentType: session.expectedMimeType,
    });
    const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
    const verifiedAt = new Date();
    const evidence = {
      verdict: 'CLEAN',
      provider: 'historical-fixture',
      version: 'historical-v1',
      checksumSha256,
      verifiedAt: verifiedAt.toISOString(),
    };
    const file = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.file.create({
        data: {
          organizationId: session.organizationId,
          schoolId: session.schoolId,
          uploaderId: session.createdByUserId,
          bucket: session.finalBucket,
          objectKey: session.finalObjectKey,
          originalName: session.originalName,
          mimeType: session.expectedMimeType,
          sizeBytes: session.expectedSizeBytes,
          visibility: 'PRIVATE',
          checksumSha256,
        },
      });
      await tx.fileUploadSession.update({
        where: { id: session.id },
        data: {
          status: 'READY',
          fileId: stored.id,
          completedAt: verifiedAt,
          verifiedAt,
          actualSizeBytes: stored.sizeBytes,
          verifiedMimeType: stored.mimeType,
          checksumSha256,
          assessmentVerificationClaimId: null,
          verificationVersion: ASSESSMENT_MEDIA_VERSION,
          assessmentSecurityEvidence: evidence,
        },
      });
      return stored;
    });
    return { uploadId: session.id, fileId: file.id, file, bytes, evidence };
  }

  async dispose(): Promise<void> {
    const where = {
      schoolId: { in: this.schools.map((school) => school.schoolId) },
    };
    await this.prisma.homeworkQuestionAsset.deleteMany({ where });
    await this.prisma.homeworkQuestionOption.deleteMany({ where });
    await this.prisma.homeworkQuestion.deleteMany({ where });
    await this.prisma.session.deleteMany({
      where: {
        userId: {
          in: [
            ...this.users,
            ...Object.values(this.actors).map((actor) => actor.userId),
          ],
        },
      },
    });
    await super.dispose();
  }
}

export function st06Id(): string {
  return randomUUID();
}
