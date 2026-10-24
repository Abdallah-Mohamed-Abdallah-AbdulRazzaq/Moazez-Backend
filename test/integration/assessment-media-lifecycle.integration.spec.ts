import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { UnapprovedAssessmentMediaSecurityGate } from '../../src/modules/files/assessment-media/application/assessment-media-verifier';
import {
  AssessmentMediaFixture,
  deferred,
  postAssessmentUpload,
} from '../fixtures/assessment-media.fixture';

jest.setTimeout(120_000);
const purpose = 'HOMEWORK_ASSIGNMENT_MEDIA' as const;

describe('ST-03 real PostgreSQL and bounded private storage lifecycle', () => {
  const prisma = new PrismaService();
  let fixture: AssessmentMediaFixture;
  beforeAll(async () => {
    fixture = new AssessmentMediaFixture(prisma);
    await prisma.$connect();
  });
  beforeEach(async () => {
    fixture = new AssessmentMediaFixture(prisma);
    await fixture.create();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.dispose();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  const command = (size = 3) => ({
    clientRequestId: randomUUID(),
    originalName: 'response.txt',
    expectedMimeType: 'text/plain',
    expectedSizeBytes: String(size),
  });
  const asTeacher = <T>(operation: () => Promise<T>) =>
    fixture.asMediaActor('teacher', operation);
  const row = (id: string) =>
    prisma.fileUploadSession.findUniqueOrThrow({ where: { id } });
  const noFiles = async () =>
    expect(
      await prisma.file.count({ where: { schoolId: fixture.school.schoolId } }),
    ).toBe(0);

  it('streams actual uploaded bytes to an immutable final object and creates exactly one attested File', async () => {
    const homework = await fixture.homework();
    const uploaded = await asTeacher(() => fixture.upload(homework.id));
    const ready = await asTeacher(() =>
      fixture.service.complete(purpose, homework.id, uploaded.intent.uploadId),
    );
    expect(ready.status).toBe('READY');
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: ready.fileId! },
    });
    const stream = await fixture.storage.getObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>)
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(uploaded.bytes);
    expect(file.checksumSha256).toBe(
      createHash('sha256').update(uploaded.bytes).digest('hex'),
    );
    expect(file.visibility).toBe('PRIVATE');
    expect(file.objectKey).not.toBe(uploaded.session.stagingObjectKey);
    const replay = await asTeacher(() =>
      fixture.service.complete(purpose, homework.id, ready.uploadId),
    );
    expect(replay.fileId).toBe(file.id);
    expect(fixture.security.calls).toBe(1);
    expect(
      await prisma.file.count({ where: { schoolId: fixture.school.schoolId } }),
    ).toBe(1);
    const audit = await prisma.auditLog.findMany({
      where: { schoolId: fixture.school.schoolId, module: 'assessment-media' },
    });
    expect(audit.map((event) => event.action)).toContain('upload.ready');
    const auditText = JSON.stringify(audit);
    expect(auditText.includes(uploaded.intent.uploadCapability!.url)).toBe(
      false,
    );
    expect(auditText.includes(file.objectKey)).toBe(false);
  });

  it('the default unapproved security gate rejects real bytes without READY or a File', async () => {
    const homework = await fixture.homework();
    const service = fixture.serviceWithSecurity(
      new UnapprovedAssessmentMediaSecurityGate(),
    );
    const uploaded = await asTeacher(() =>
      fixture.upload(
        homework.id,
        undefined,
        purpose,
        undefined,
        undefined,
        service,
      ),
    );
    await expect(
      asTeacher(() =>
        service.complete(purpose, homework.id, uploaded.intent.uploadId),
      ),
    ).rejects.toMatchObject({ reason: 'security_verification_unavailable' });
    expect((await row(uploaded.intent.uploadId)).status).toBe('FAILED');
    await noFiles();
    // Lack of deletion authority preserves both private transient objects.
    expect(
      await fixture.storage.objectExists({
        bucket: uploaded.session.finalBucket,
        objectKey: uploaded.session.finalObjectKey,
      }),
    ).toBe(true);
  });

  it('enforces exact length and MIME in the actual storage capability before completion', async () => {
    const homework = await fixture.homework();
    const intent = await asTeacher(() =>
      fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
    );
    const capability = intent.uploadCapability!;
    expect(capability.mode).toBe('signed-post');
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from('xx'),
      Buffer.from('xxxx'),
    ]) {
      const response = await postAssessmentUpload(
        capability,
        bytes,
        'text/plain',
      );
      expect(response.ok).toBe(false);
    }
    const wrongType = await postAssessmentUpload(
      capability,
      Buffer.from('abc'),
      'application/octet-stream',
    );
    expect(wrongType.ok).toBe(false);
    const session = await row(intent.uploadId);
    expect(
      await fixture.storage.objectExists({
        bucket: session.stagingBucket!,
        objectKey: session.stagingObjectKey!,
      }),
    ).toBe(false);
    expect(
      (await postAssessmentUpload(capability, Buffer.from('abc'), 'text/plain'))
        .ok,
    ).toBe(true);
  });

  it('serializes identical concurrent create retries without duplicate capabilities', async () => {
    const homework = await fixture.homework(),
      input = command();
    const issue = jest.spyOn(fixture.storage, 'createBoundedUploadCapability');
    const intents = await Promise.all(
      Array.from({ length: 3 }, () =>
        asTeacher(() =>
          fixture.service.createHomeworkAssignmentUpload(homework.id, input),
        ),
      ),
    );
    expect(new Set(intents.map((intent) => intent.uploadId)).size).toBe(1);
    expect(issue).toHaveBeenCalledTimes(1);
    expect(
      intents.filter((intent) => intent.uploadCapability !== undefined).length,
    ).toBe(1);
    await expect(
      asTeacher(() =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, {
          ...input,
          expectedSizeBytes: '4',
        }),
      ),
    ).rejects.toMatchObject({ reason: 'idempotency_conflict' });
  });

  it('grants only one concurrent verification claim and replays the single File', async () => {
    const homework = await fixture.homework();
    const uploaded = await asTeacher(() => fixture.upload(homework.id));
    const reached = deferred(),
      release = deferred();
    fixture.security.beforeAttest = async () => {
      reached.resolve();
      await release.promise;
    };
    const first = asTeacher(() =>
      fixture.service.complete(purpose, homework.id, uploaded.intent.uploadId),
    );
    await Promise.race([
      reached.promise,
      first.then(() => {
        throw new Error('Early complete');
      }),
    ]);
    await expect(
      asTeacher(() =>
        fixture.service.complete(
          purpose,
          homework.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ reason: 'verification_in_progress' });
    release.resolve();
    const ready = await first;
    expect(
      (
        await asTeacher(() =>
          fixture.service.complete(purpose, homework.id, ready.uploadId),
        )
      ).fileId,
    ).toBe(ready.fileId);
    expect(fixture.security.calls).toBe(1);
  });

  it('cancellation wins against in-flight verification and cannot be reopened or replayed', async () => {
    const homework = await fixture.homework();
    const uploaded = await asTeacher(() => fixture.upload(homework.id));
    const reached = deferred(),
      release = deferred();
    fixture.security.beforeAttest = async () => {
      reached.resolve();
      await release.promise;
    };
    const completing = asTeacher(() =>
      fixture.service.complete(purpose, homework.id, uploaded.intent.uploadId),
    );
    const rejected = expect(completing).rejects.toMatchObject({
      reason: 'state_conflict',
    });
    await Promise.race([
      reached.promise,
      completing.then(() => {
        throw new Error('Early complete');
      }),
    ]);
    expect(
      (
        await asTeacher(() =>
          fixture.service.cancel(
            purpose,
            homework.id,
            uploaded.intent.uploadId,
          ),
        )
      ).status,
    ).toBe('CANCELLED');
    release.resolve();
    await rejected;
    expect(
      (
        await asTeacher(() =>
          fixture.service.cancel(
            purpose,
            homework.id,
            uploaded.intent.uploadId,
          ),
        )
      ).status,
    ).toBe('CANCELLED');
    await expect(
      asTeacher(() =>
        fixture.service.complete(
          purpose,
          homework.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ reason: 'state_conflict' });
    await noFiles();
  });

  it('expires a real historical intent conservatively and retains its byte reservation', async () => {
    const homework = await fixture.homework(),
      id = randomUUID();
    const createdAt = new Date(Date.now() - 3_600_000),
      expiresAt = new Date(Date.now() - 1000);
    await prisma.fileUploadSession.create({
      data: {
        id,
        schoolId: fixture.school.schoolId,
        organizationId: fixture.school.organizationId,
        createdByUserId: fixture.actors.teacher.userId,
        clientRequestId: randomUUID(),
        purpose,
        purposeContextId: homework.id,
        originalName: 'response.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: 3n,
        stagingBucket: fixture.storage.resolveBucket('PRIVATE'),
        stagingObjectKey: `assessment-media/${fixture.school.schoolId}/staging/${id}`,
        finalBucket: fixture.storage.resolveBucket('PRIVATE'),
        finalObjectKey: `assessment-media/${fixture.school.schoolId}/verified/${id}`,
        createdAt,
        expiresAt,
      },
    });
    await prisma.fileUploadSession.update({
      where: { id },
      data: { status: 'UPLOADING', latestUploadUrlExpiresAt: expiresAt },
    });
    await expect(
      asTeacher(() => fixture.service.complete(purpose, homework.id, id)),
    ).rejects.toMatchObject({ reason: 'expired' });
    expect((await row(id)).status).toBe('EXPIRED');
    await prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: fixture.school.schoolId },
      data: { maximumSchoolBytes: 11n },
    });
    await expect(
      asTeacher(() =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
      ),
    ).rejects.toMatchObject({ reason: 'quota_exceeded' });
  });

  it('atomically bounds concurrent reservations and counts cancelled live capabilities', async () => {
    const homework = await fixture.homework();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        asTeacher(() =>
          fixture.service.createHomeworkAssignmentUpload(
            homework.id,
            command(),
          ),
        ),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    ).toBe(2);
    const rejected = outcomes.filter(
      (outcome) => outcome.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { reason: 'quota_exceeded' } });
    const sessions = await prisma.fileUploadSession.findMany({
      where: { schoolId: fixture.school.schoolId },
    });
    await asTeacher(() =>
      fixture.service.cancel(purpose, homework.id, sessions[0].id),
    );
    await expect(
      asTeacher(() =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
      ),
    ).rejects.toMatchObject({ reason: 'quota_exceeded' });
  });

  it.each(['school', 'resource', 'rate'] as const)(
    'enforces the aggregate %s limit including unsuccessful retained reservations',
    async (limit) => {
      const homework = await fixture.homework();
      await prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: fixture.school.schoolId },
        data:
          limit === 'school'
            ? { maximumSchoolBytes: 11n }
            : limit === 'resource'
              ? { maximumResourceBytes: 5n }
              : { maximumUploadsPerHour: 1 },
      });
      const intent = await asTeacher(() =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
      );
      await asTeacher(() =>
        fixture.service.cancel(purpose, homework.id, intent.uploadId),
      );
      await expect(
        asTeacher(() =>
          fixture.service.createHomeworkAssignmentUpload(
            homework.id,
            command(),
          ),
        ),
      ).rejects.toMatchObject({
        reason: limit === 'rate' ? 'rate_exceeded' : 'quota_exceeded',
      });
    },
  );

  it('requires an explicit independent school policy and rejects out-of-bounds stored overrides', async () => {
    const homework = await fixture.homework();
    await prisma.schoolAssessmentMediaPolicy.delete({
      where: { schoolId: fixture.school.schoolId },
    });
    await expect(
      asTeacher(() =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
      ),
    ).rejects.toMatchObject({ reason: 'policy_denied' });
    await expect(
      prisma.$executeRaw`INSERT INTO school_assessment_media_policies (school_id, updated_at, maximum_concurrent_uploads) VALUES (${fixture.school.schoolId}::uuid, NOW(), 3)`,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });

  it.each([
    ['wrong.txt', 'application/pdf', '3'],
    ['script.html', 'text/html', '3'],
    ['archive.zip', 'application/zip', '3'],
    ['zero.txt', 'text/plain', '0'],
    ['huge.txt', 'text/plain', String(10 * 1024 * 1024 + 1)],
  ])(
    'rejects unsupported extension/type/size %s before storage issuance',
    async (originalName, expectedMimeType, expectedSizeBytes) => {
      const homework = await fixture.homework();
      const issue = jest.spyOn(
        fixture.storage,
        'createBoundedUploadCapability',
      );
      await expect(
        asTeacher(() =>
          fixture.service.createHomeworkAssignmentUpload(homework.id, {
            ...command(),
            originalName,
            expectedMimeType,
            expectedSizeBytes,
          }),
        ),
      ).rejects.toBeDefined();
      expect(issue).not.toHaveBeenCalled();
      await noFiles();
    },
  );

  it.each(['zero', 'size', 'signature'] as const)(
    'rejects actual malformed %s data even when injected with owned storage credentials',
    async (kind) => {
      const homework = await fixture.homework();
      const uploaded = await asTeacher(() => fixture.upload(homework.id));
      const body =
        kind === 'zero'
          ? Buffer.alloc(0)
          : kind === 'size'
            ? Buffer.from('oversized')
            : Buffer.alloc(uploaded.bytes.length, 0);
      await fixture.storage.saveObject({
        bucket: uploaded.session.stagingBucket!,
        objectKey: uploaded.session.stagingObjectKey!,
        body,
        sizeBytes: body.length,
        contentType: 'text/plain',
      });
      await expect(
        asTeacher(() =>
          fixture.service.complete(
            purpose,
            homework.id,
            uploaded.intent.uploadId,
          ),
        ),
      ).rejects.toMatchObject({ reason: 'verification_failed' });
      expect((await row(uploaded.intent.uploadId)).status).toBe('FAILED');
      await noFiles();
    },
  );

  it('rejects final-object mutation while security verification is pending', async () => {
    const homework = await fixture.homework();
    const uploaded = await asTeacher(() => fixture.upload(homework.id));
    fixture.security.beforeAttest = async (input) => {
      await fixture.storage.saveObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
        body: Buffer.alloc(uploaded.bytes.length, 65),
        contentType: 'text/plain',
      });
    };
    await expect(
      asTeacher(() =>
        fixture.service.complete(
          purpose,
          homework.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ reason: 'object_changed' });
    await noFiles();
  });

  it.each([
    ['document.pdf', 'application/pdf', Buffer.from('%PDF-1.7\ntruncated\n')],
    [
      'image.png',
      'image/png',
      Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex'),
    ],
    [
      'wide.png',
      'image/png',
      Buffer.from('89504e470d0a1a0a0000000d494844520000200000002000', 'hex'),
    ],
  ])(
    'never releases signature-only or oversized-dimension %s without required deep verification',
    async (name, mime, bytes) => {
      const homework = await fixture.homework();
      await prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: fixture.school.schoolId },
        data: { allowedMimeTypes: [mime] },
      });
      const uploaded = await asTeacher(() =>
        fixture.upload(homework.id, bytes, purpose, name, mime),
      );
      await expect(
        asTeacher(() =>
          fixture.service.complete(
            purpose,
            homework.id,
            uploaded.intent.uploadId,
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 409 });
      expect((await row(uploaded.intent.uploadId)).status).toBe('FAILED');
      expect(fixture.security.calls).toBe(0);
      await noFiles();
    },
  );

  it('fails closed for actual audio bytes when the required FFprobe runtime is unavailable or unaccepted', async () => {
    fixture.config.set('FFPROBE_PATH', 'st03-deliberately-unavailable-ffprobe');
    const homework = await fixture.homework();
    await prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: fixture.school.schoolId },
      data: { allowedMimeTypes: ['audio/mpeg'] },
    });
    const uploaded = await asTeacher(() =>
      fixture.upload(
        homework.id,
        Buffer.from('ID3malformed-owned-audio'),
        purpose,
        'response.mp3',
        'audio/mpeg',
      ),
    );
    await expect(
      asTeacher(() =>
        fixture.service.complete(
          purpose,
          homework.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ reason: 'verifier_unavailable' });
    expect(fixture.security.calls).toBe(0);
    await noFiles();
  });

  it('rechecks revoked policy at the final transaction', async () => {
    const homework = await fixture.homework();
    const uploaded = await asTeacher(() => fixture.upload(homework.id));
    fixture.security.beforeAttest = async () => {
      await prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: fixture.school.schoolId },
        data: { uploadsEnabled: false },
      });
    };
    await expect(
      asTeacher(() =>
        fixture.service.complete(
          purpose,
          homework.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ reason: 'policy_denied' });
    await noFiles();
  });

  it.each(['homework', 'generic-retained-history'] as const)(
    'retains %s references under concurrent linking and repeated cleanup checks',
    async (reference) => {
      const homework = await fixture.homework();
      const uploaded = await asTeacher(() => fixture.upload(homework.id));
      const ready = await asTeacher(() =>
        fixture.service.complete(
          purpose,
          homework.id,
          uploaded.intent.uploadId,
        ),
      );
      const deleting = jest.spyOn(fixture.storage, 'deleteObject');
      await Promise.all([
        reference === 'homework'
          ? prisma.homeworkAssignmentAttachment.create({
              data: {
                schoolId: fixture.school.schoolId,
                homeworkAssignmentId: homework.id,
                fileId: ready.fileId!,
                createdByUserId: fixture.actors.teacher.userId,
              },
            })
          : prisma.attachment.create({
              data: {
                schoolId: fixture.school.schoolId,
                fileId: ready.fileId!,
                resourceType: 'retained-cross-purpose-fixture',
                resourceId: homework.id,
                createdById: fixture.actors.teacher.userId,
              },
            }),
        asTeacher(() =>
          fixture.service.cleanupEligibility(
            purpose,
            homework.id,
            ready.uploadId,
          ),
        ),
      ]);
      const result = await asTeacher(() =>
        fixture.service.cleanupEligibility(
          purpose,
          homework.id,
          ready.uploadId,
        ),
      );
      expect(result).toMatchObject({
        retainedReferences: true,
        deletionPermitted: false,
      });
      await prisma.file.update({
        where: { id: ready.fileId! },
        data: { deletedAt: new Date() },
      });
      await expect(
        asTeacher(() =>
          fixture.service.createHomeworkAssignmentUpload(
            homework.id,
            uploaded.command,
          ),
        ),
      ).rejects.toMatchObject({ reason: 'ready_relationship_invalid' });
      expect(
        (
          await asTeacher(() =>
            fixture.service.cleanupEligibility(
              purpose,
              homework.id,
              ready.uploadId,
            ),
          )
        ).deletionPermitted,
      ).toBe(false);
      expect(deleting).not.toHaveBeenCalled();
      expect((await row(ready.uploadId)).status).toBe('READY');
      expect(
        await fixture.storage.objectExists({
          bucket: uploaded.session.finalBucket,
          objectKey: uploaded.session.finalObjectKey,
        }),
      ).toBe(true);
    },
  );

  it('enforces database identity, state and attestation constraints without rewriting historical purposes', async () => {
    const homework = await fixture.homework();
    const intent = await asTeacher(() =>
      fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
    );
    for (const change of [
      prisma.$executeRaw`UPDATE file_upload_sessions SET purpose = 'ACADEMIC_CONTENT' WHERE id = ${intent.uploadId}::uuid`,
      prisma.$executeRaw`UPDATE file_upload_sessions SET purpose_context_id = ${randomUUID()}::uuid WHERE id = ${intent.uploadId}::uuid`,
      prisma.$executeRaw`UPDATE file_upload_sessions SET status = 'READY' WHERE id = ${intent.uploadId}::uuid`,
    ])
      await expect(change).rejects.toMatchObject({
        code: 'P2010',
        meta: { code: '23514' },
      });
    const checks = await prisma.$queryRaw<
      Array<{ conname: string; convalidated: boolean }>
    >`SELECT conname, convalidated FROM pg_constraint WHERE conname LIKE 'assessment_%'`;
    expect(checks.length).toBeGreaterThanOrEqual(3);
    expect(checks.every((check) => check.convalidated)).toBe(true);
    const enums = await prisma.$queryRaw<
      Array<{ enumlabel: string }>
    >`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'file_upload_purpose'`;
    expect(enums.map((value) => value.enumlabel)).toEqual(
      expect.arrayContaining([
        'LESSON_CONTENT',
        'ACADEMIC_CONTENT',
        purpose,
        'GRADE_ASSESSMENT_MEDIA',
        'HOMEWORK_SUBMISSION_MEDIA',
        'GRADE_SUBMISSION_MEDIA',
      ]),
    );
    const functions = await prisma.$queryRaw<
      Array<{ prosecdef: boolean; public_execute: boolean }>
    >`SELECT prosecdef, EXISTS (SELECT 1 FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) WHERE grantee = 0 AND privilege_type = 'EXECUTE') AS public_execute FROM pg_proc WHERE proname = 'enforce_assessment_upload_contract'`;
    expect(functions).toEqual([{ prosecdef: false, public_execute: false }]);
    await noFiles();
  });
});
