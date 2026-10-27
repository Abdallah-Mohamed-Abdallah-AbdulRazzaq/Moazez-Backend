import { createHash, randomUUID } from 'node:crypto';
import type { AssessmentMediaPurpose } from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import {
  AssessmentMediaFixture,
  type MediaFixtureActor,
} from './assessment-media.fixture';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';

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

/** Test-only owned graph and attestation hook; never imported by runtime application code. */
export class HomeworkQuestionAssetsFixture extends AssessmentMediaFixture {
  private readonly permittedAttestations = new Map<
    string,
    { creatorId: string; contextId: string | null; purpose: string }
  >();
  constructor(prisma: PrismaService) {
    super(prisma); // disposable PostgreSQL + owned MinIO guard runs before DB access
    this.security.beforeAttest = async (input) => {
      const expected = this.permittedAttestations.get(input.uploadId);
      const session = await this.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: input.uploadId },
      });
      const schoolOwned = this.schools.some(
        (school) => school.schoolId === session.schoolId,
      );
      if (
        !expected ||
        !schoolOwned ||
        expected.creatorId !== session.createdByUserId ||
        expected.contextId !== session.purposeContextId ||
        expected.purpose !== session.purpose ||
        session.status !== 'VERIFYING' ||
        !session.assessmentVerificationClaimId ||
        input.bucket !== this.storage.resolveBucket('PRIVATE') ||
        input.bucket !== session.finalBucket ||
        input.objectKey !== session.finalObjectKey ||
        input.objectKey !==
          `assessment-media/${session.schoolId}/verified/${input.uploadId}`
      )
        throw new Error(
          'Test attestation refuses an unregistered or unrelated object',
        );
      const stat = await this.storage.statObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
      });
      if (
        stat.size !== Number(input.facts.actualSizeBytes) ||
        stat.contentType !== input.facts.verifiedMimeType ||
        stat.contentType !== session.expectedMimeType ||
        BigInt(stat.size) !== session.expectedSizeBytes ||
        input.objectIdentity !==
          JSON.stringify([
            stat.etag,
            stat.generation,
            stat.version,
            stat.size,
            stat.contentType,
          ])
      )
        throw new Error(
          'Test attestation rejects inconsistent object/MIME/size identity',
        );
      const source = await this.storage.getObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
        raw: true,
      });
      const hash = createHash('sha256');
      let size = 0;
      try {
        for await (const chunk of source) {
          const bytes = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);
          size += bytes.length;
          if (size > stat.size)
            throw new Error('Test attestation rejects oversized content');
          hash.update(bytes);
        }
      } finally {
        source.destroy();
      }
      if (
        size !== stat.size ||
        hash.digest('hex') !== input.facts.checksumSha256
      )
        throw new Error('Test attestation rejects real-byte checksum mismatch');
    };
  }
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
      this.permittedAttestations.set(uploaded.intent.uploadId, {
        creatorId: uploaded.session.createdByUserId,
        contextId: uploaded.session.purposeContextId,
        purpose: uploaded.session.purpose,
      });
      const result = await this.service.complete(
        purpose,
        contextId,
        uploaded.intent.uploadId,
      );
      if (result.status !== 'READY' || !result.fileId)
        throw new Error('Owned attested upload did not produce READY');
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
