import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  AssessmentMediaFixture,
  deferred,
} from '../fixtures/assessment-media.fixture';

jest.setTimeout(120_000);

describe('ST-03 Assessment Media real tenant/resource authorization', () => {
  const prisma = new PrismaService();
  let fixture: AssessmentMediaFixture;
  beforeAll(async () => {
    fixture = new AssessmentMediaFixture(prisma); // validates target before connect
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

  const command = () => ({
    clientRequestId: randomUUID(),
    originalName: 'response.txt',
    expectedMimeType: 'text/plain',
    expectedSizeBytes: '3',
  });

  it('injects automatic school scope into the new independent policy model', async () => {
    const scoped = prisma.scoped as unknown as PrismaClient;
    await fixture.asMediaActor('teacher', async () => {
      expect(
        await scoped.schoolAssessmentMediaPolicy.findFirst({
          where: { schoolId: fixture.schools[1].schoolId },
        }),
      ).toBeNull();
      expect(
        (
          await scoped.schoolAssessmentMediaPolicy.findMany({
            select: { schoolId: true },
          })
        ).map((row) => row.schoolId),
      ).toEqual([fixture.school.schoolId]);
    });
  });

  it.each(['admin', 'organization', 'teacher'] as const)(
    'allows legitimate %s authoring ownership without generic Files grants',
    async (actor) => {
      const homework = await fixture.homework();
      const intent = await fixture.asMediaActor(actor, () =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
      );
      expect([intent.status, intent.fileId]).toEqual(['UPLOADING', null]);
      expect(fixture.actors[actor].permissions).not.toContain(
        'files.downloads.view',
      );
      expect(
        await prisma.file.count({
          where: { schoolId: fixture.school.schoolId },
        }),
      ).toBe(0);
    },
  );

  it('denies same-school wrong-allocation and cross-school actors before issuing capabilities', async () => {
    const homework = await fixture.homework();
    const issue = jest.spyOn(fixture.storage, 'createBoundedUploadCapability');
    for (const actor of ['otherTeacher', 'foreignTeacher', 'student'] as const)
      await expect(
        fixture.asMediaActor(actor, () =>
          fixture.service.createHomeworkAssignmentUpload(
            homework.id,
            command(),
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
    expect(issue).not.toHaveBeenCalled();
    expect(
      await prisma.fileUploadSession.count({
        where: { schoolId: fixture.school.schoolId },
      }),
    ).toBe(0);
  });

  it('does not let an organization actor select another organization school', async () => {
    const homework = await fixture.homework('DRAFT', 'foreignTeacher');
    await expect(
      fixture.asMediaActor(
        'organization',
        () =>
          fixture.service.createHomeworkAssignmentUpload(
            homework.id,
            command(),
          ),
        1,
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('uses server-derived actor, school and object identity despite hostile extra metadata', async () => {
    const homework = await fixture.homework();
    const input = {
      ...command(),
      schoolId: fixture.schools[1].schoolId,
      actorId: fixture.actors.foreignTeacher.userId,
      finalBucket: 'untrusted',
      finalObjectKey: 'untrusted',
    };
    const intent = await fixture.asMediaActor('teacher', () =>
      fixture.service.createHomeworkAssignmentUpload(homework.id, input),
    );
    const row = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.uploadId },
    });
    expect(row).toMatchObject({
      schoolId: fixture.school.schoolId,
      createdByUserId: fixture.actors.teacher.userId,
      purposeContextId: homework.id,
    });
    expect(row.finalBucket).toBe(fixture.storage.resolveBucket('PRIVATE'));
    expect(row.finalObjectKey).toBe(
      `assessment-media/${fixture.school.schoolId}/verified/${row.id}`,
    );
    expect(Object.keys(intent)).not.toContain('bucket');
    expect(Object.keys(intent)).not.toContain('objectKey');
  });

  it('authorizes Grades through its own allocation/assessment boundary', async () => {
    const assessment = await fixture.assessment();
    const intent = await fixture.asMediaActor('teacher', () =>
      fixture.service.createGradeAssessmentUpload(assessment.id, command()),
    );
    expect(intent.status).toBe('UPLOADING');
    await expect(
      fixture.asMediaActor('otherTeacher', () =>
        fixture.service.createGradeAssessmentUpload(assessment.id, command()),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      fixture.asMediaActor('foreignTeacher', () =>
        fixture.service.createGradeAssessmentUpload(assessment.id, command()),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('denies same-class wrong-subject Grades authoring', async () => {
    const subject = await prisma.subject.create({
      data: {
        schoolId: fixture.school.schoolId,
        code: randomUUID(),
        nameAr: 'Other',
        nameEn: 'Other',
      },
    });
    await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: fixture.school.schoolId,
        teacherUserId: fixture.actors.otherTeacher.userId,
        classroomId: fixture.school.classroomId,
        subjectId: subject.id,
        termId: fixture.school.termId,
      },
    });
    const assessment = await fixture.assessment();
    await prisma.gradeAssessment.update({
      where: { id: assessment.id },
      data: { subjectId: subject.id },
    });
    await expect(
      fixture.asMediaActor('teacher', () =>
        fixture.service.createGradeAssessmentUpload(assessment.id, command()),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('supports both student purposes only for the actual own target/submission', async () => {
    const target = await fixture.target(),
      submission = await fixture.submission();
    const homeworkIntent = await fixture.asMediaActor('student', () =>
      fixture.service.createHomeworkSubmissionUpload(target.id, command()),
    );
    const gradeIntent = await fixture.asMediaActor('student', () =>
      fixture.service.createGradeSubmissionUpload(submission.id, command()),
    );
    expect([homeworkIntent.status, gradeIntent.status]).toEqual([
      'UPLOADING',
      'UPLOADING',
    ]);
    for (const actor of [
      'otherStudent',
      'foreignStudent',
      'teacher',
    ] as const) {
      await expect(
        fixture.asMediaActor(actor, () =>
          fixture.service.createHomeworkSubmissionUpload(target.id, command()),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      await expect(
        fixture.asMediaActor(actor, () =>
          fixture.service.createGradeSubmissionUpload(submission.id, command()),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
    }
  });

  it('rejects wrong purpose/context reuse of a previously readable upload', async () => {
    const homework = await fixture.homework(),
      other = await fixture.homework(),
      assessment = await fixture.assessment();
    const intent = await fixture.asMediaActor('teacher', () =>
      fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
    );
    await fixture.asMediaActor('teacher', () =>
      fixture.service.status(
        'HOMEWORK_ASSIGNMENT_MEDIA',
        homework.id,
        intent.uploadId,
      ),
    );
    await expect(
      fixture.asMediaActor('teacher', () =>
        fixture.service.complete(
          'HOMEWORK_ASSIGNMENT_MEDIA',
          other.id,
          intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      fixture.asMediaActor('teacher', () =>
        fixture.service.complete(
          'GRADE_ASSESSMENT_MEDIA',
          assessment.id,
          intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      fixture.asMediaActor('otherTeacher', () =>
        fixture.service.cancel(
          'HOMEWORK_ASSIGNMENT_MEDIA',
          homework.id,
          intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it.each(['membership', 'permission', 'allocation'] as const)(
    'rechecks revoked %s inside the final File transaction after a successful read',
    async (resource) => {
      const homework = await fixture.homework();
      const uploaded = await fixture.asMediaActor('teacher', () =>
        fixture.upload(homework.id),
      );
      await fixture.asMediaActor('teacher', () =>
        fixture.service.status(
          'HOMEWORK_ASSIGNMENT_MEDIA',
          homework.id,
          uploaded.intent.uploadId,
        ),
      );
      const reached = deferred(),
        release = deferred();
      fixture.security.beforeAttest = async () => {
        reached.resolve();
        await release.promise;
      };
      const completing = fixture.asMediaActor('teacher', () =>
        fixture.service.complete(
          'HOMEWORK_ASSIGNMENT_MEDIA',
          homework.id,
          uploaded.intent.uploadId,
        ),
      );
      const rejected = expect(completing).rejects.toMatchObject({
        httpStatus: 404,
      });
      await Promise.race([
        reached.promise,
        completing.then(
          () => {
            throw new Error('Completion finished before barrier');
          },
          () => {
            throw new Error('Completion failed before barrier');
          },
        ),
      ]);
      if (resource === 'membership')
        await prisma.membership.update({
          where: { id: fixture.actors.teacher.membershipId },
          data: { status: 'SUSPENDED' },
        });
      if (resource === 'permission')
        await prisma.rolePermission.deleteMany({
          where: {
            roleId: fixture.actors.teacher.roleId,
            permission: { code: 'homework.attachments.manage' },
          },
        });
      if (resource === 'allocation')
        await prisma.teacherSubjectAllocation.update({
          where: { id: fixture.allocations.teacher },
          data: { teacherUserId: fixture.actors.otherTeacher.userId },
        });
      release.resolve();
      await rejected;
      expect(
        await prisma.file.count({
          where: { schoolId: fixture.school.schoolId },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: uploaded.intent.uploadId },
          })
        ).fileId,
      ).toBeNull();
    },
  );

  it('rechecks student enrollment during completion, not only at intent creation', async () => {
    const target = await fixture.target();
    const uploaded = await fixture.asMediaActor('student', () =>
      fixture.upload(target.id, undefined, 'HOMEWORK_SUBMISSION_MEDIA'),
    );
    const reached = deferred(),
      release = deferred();
    fixture.security.beforeAttest = async () => {
      reached.resolve();
      await release.promise;
    };
    const completing = fixture.asMediaActor('student', () =>
      fixture.service.complete(
        'HOMEWORK_SUBMISSION_MEDIA',
        target.id,
        uploaded.intent.uploadId,
      ),
    );
    const rejected = expect(completing).rejects.toMatchObject({
      httpStatus: 404,
    });
    await Promise.race([
      reached.promise,
      completing.then(
        () => {
          throw new Error('Completion finished before barrier');
        },
        () => {
          throw new Error('Completion failed before barrier');
        },
      ),
    ]);
    await prisma.enrollment.update({
      where: { id: fixture.children[0].enrollmentId },
      data: { endedAt: new Date(), status: 'WITHDRAWN' },
    });
    release.resolve();
    await rejected;
    expect(
      await prisma.file.count({ where: { schoolId: fixture.school.schoolId } }),
    ).toBe(0);
  });

  it('does not let a cached request permission survive live role revocation', async () => {
    const homework = await fixture.homework();
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: fixture.actors.teacher.roleId,
        permission: { code: 'homework.attachments.manage' },
      },
    });
    const issue = jest.spyOn(fixture.storage, 'createBoundedUploadCapability');
    await expect(
      fixture.asMediaActor('teacher', () =>
        fixture.service.createHomeworkAssignmentUpload(homework.id, command()),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(issue).not.toHaveBeenCalled();
  });

  it('rechecks management Grades academic scope after a successful read and real verification', async () => {
    const assessment = await fixture.assessment();
    const uploaded = await fixture.asMediaActor('admin', () =>
      fixture.upload(assessment.id, undefined, 'GRADE_ASSESSMENT_MEDIA'),
    );
    await fixture.asMediaActor('admin', () =>
      fixture.service.status(
        'GRADE_ASSESSMENT_MEDIA',
        assessment.id,
        uploaded.intent.uploadId,
      ),
    );
    fixture.security.beforeAttest = async () => {
      await prisma.term.update({
        where: { id: fixture.school.termId },
        data: { deletedAt: new Date() },
      });
    };
    await expect(
      fixture.asMediaActor('admin', () =>
        fixture.service.complete(
          'GRADE_ASSESSMENT_MEDIA',
          assessment.id,
          uploaded.intent.uploadId,
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(
      await prisma.file.count({ where: { schoolId: fixture.school.schoolId } }),
    ).toBe(0);
  });
});
