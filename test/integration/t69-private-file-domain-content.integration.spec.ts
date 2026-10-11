import { randomUUID } from 'node:crypto';
import {
  AcademicContentACC12JourneyFixture,
  type JourneyActor,
} from '../fixtures/academic-content-acc12-journey.fixture';

describe('T6.9 private file domain content through real JWT, actor, permission and tenancy guards', () => {
  jest.setTimeout(120_000);
  const f = new AcademicContentACC12JourneyFixture();
  const body = Buffer.from('%PDF-1.4\nprivate-test-bytes\n');
  let fileId: string,
    conversationId: string,
    messageId: string,
    attachmentId: string;
  let rewardId: string, taskId: string, submissionId: string;
  beforeAll(async () => {
    await f.start();
    const roles = await f.prisma.role.findMany({
      where: { schoolId: f.school.schoolId },
    });
    const permissions = await f.prisma.permission.findMany({
      where: {
        code: {
          in: [
            'communication.messages.view',
            'student.profile.view',
            'reinforcement.rewards.view',
            'reinforcement.rewards.redemptions.view',
            'reinforcement.xp.view',
            'reinforcement.submissions.view',
            'reinforcement.reviews.view',
            'reinforcement.tasks.view',
            'files.downloads.view',
          ],
        },
      },
    });
    await f.prisma.rolePermission.createMany({
      data: roles.flatMap((role) =>
        permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      ),
      skipDuplicates: true,
    });
    await f.prisma.rolePermission.createMany({
      data: permissions
        .filter((permission) =>
          ['communication.messages.view', 'files.downloads.view'].includes(
            permission.code,
          ),
        )
        .map((permission) => ({
          roleId: f.prerequisites.children[2].roleId,
          permissionId: permission.id,
        })),
      skipDuplicates: true,
    });
    const file = await f.prisma.file.create({
      data: {
        schoolId: f.school.schoolId,
        organizationId: f.school.organizationId,
        originalName: 'مرفق.pdf',
        mimeType: 'application/pdf',
        bucket: 'fixture-private',
        objectKey: randomUUID(),
        sizeBytes: BigInt(body.length),
        visibility: 'PRIVATE',
      },
    });
    fileId = file.id;
    await f.storage.putObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
      body,
      contentType: file.mimeType,
    });
    await f.prisma.student.update({
      where: { id: f.child.studentId },
      data: { avatarFileId: fileId },
    });
    rewardId = (
      await f.prisma.rewardCatalogItem.create({
        data: {
          schoolId: f.school.schoolId,
          academicYearId: f.school.yearId,
          termId: f.school.termId,
          titleEn: 'Test reward',
          status: 'PUBLISHED',
          imageFileId: fileId,
        },
      })
    ).id;
    conversationId = (
      await f.prisma.communicationConversation.create({
        data: {
          schoolId: f.school.schoolId,
          type: 'GROUP',
          titleEn: 'T69 private test',
        },
      })
    ).id;
    await f.prisma.communicationConversationParticipant.createMany({
      data: [f.child.userId, f.teacherId, f.prerequisites.parentId].map(
        (userId) => ({ schoolId: f.school.schoolId, conversationId, userId }),
      ),
    });
    messageId = (
      await f.prisma.communicationMessage.create({
        data: {
          schoolId: f.school.schoolId,
          conversationId,
          senderUserId: f.teacherId,
          body: 'Test attachment',
        },
      })
    ).id;
    attachmentId = (
      await f.prisma.communicationMessageAttachment.create({
        data: {
          schoolId: f.school.schoolId,
          conversationId,
          messageId,
          fileId,
        },
      })
    ).id;
    taskId = (
      await f.prisma.reinforcementTask.create({
        data: {
          schoolId: f.school.schoolId,
          academicYearId: f.school.yearId,
          termId: f.school.termId,
          subjectId: f.school.subjectId,
          source: 'TEACHER',
          createdById: f.teacherId,
          assignedById: f.teacherId,
        },
      })
    ).id;
    const stageId = (
      await f.prisma.reinforcementTaskStage.create({
        data: {
          schoolId: f.school.schoolId,
          taskId,
          sortOrder: 0,
          proofType: 'DOCUMENT',
        },
      })
    ).id;
    const assignmentId = (
      await f.prisma.reinforcementAssignment.create({
        data: {
          schoolId: f.school.schoolId,
          taskId,
          academicYearId: f.school.yearId,
          termId: f.school.termId,
          studentId: f.child.studentId,
          enrollmentId: f.child.enrollmentId,
        },
      })
    ).id;
    submissionId = (
      await f.prisma.reinforcementSubmission.create({
        data: {
          schoolId: f.school.schoolId,
          taskId,
          stageId,
          assignmentId,
          studentId: f.child.studentId,
          enrollmentId: f.child.enrollmentId,
          proofFileId: fileId,
          status: 'SUBMITTED',
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (f.prisma && fileId) {
      await f.prisma.student.update({
        where: { id: f.child.studentId },
        data: { avatarFileId: null },
      });
      if (conversationId) {
        await f.prisma.communicationMessageAttachment.deleteMany({
          where: { conversationId },
        });
        await f.prisma.communicationConversationParticipant.deleteMany({
          where: { conversationId },
        });
        await f.prisma.communicationMessage.deleteMany({
          where: { conversationId },
        });
        await f.prisma.communicationConversation.deleteMany({
          where: { id: conversationId },
        });
      }
      if (rewardId)
        await f.prisma.rewardRedemption.deleteMany({
          where: { catalogItemId: rewardId },
        });
      if (rewardId)
        await f.prisma.rewardCatalogItem.deleteMany({
          where: { id: rewardId },
        });
      if (taskId) {
        await f.prisma.reinforcementSubmission.deleteMany({
          where: { taskId },
        });
        await f.prisma.reinforcementAssignment.deleteMany({
          where: { taskId },
        });
        await f.prisma.reinforcementTaskStage.deleteMany({ where: { taskId } });
        await f.prisma.reinforcementTask.deleteMany({ where: { id: taskId } });
      }
      await f.prisma.file.deleteMany({ where: { id: fileId } });
    }
    await f.stop();
  });
  const messagePath = (actor: JourneyActor, mode: string) =>
    `${actor}/messages/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}/${mode}`;
  it.each(['student', 'teacher', 'parent'] as const)(
    '%s message preview and download stream exact bytes and retain legacy 307',
    async (actor) => {
      for (const mode of ['download', 'preview']) {
        const path = messagePath(actor, mode);
        const response = await f.http<Buffer>('get', path + '/content', actor);
        expect(response.body).toEqual(body);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['content-disposition']).toMatch(
          new RegExp(
            '^' + (mode === 'preview' ? 'inline' : 'attachment') + ';',
          ),
        );
        const partial = await f.http<Buffer>(
          'get',
          path + '/content',
          actor,
          undefined,
          206,
          { Range: 'bytes=0-3' },
        );
        expect(partial.body).toEqual(body.subarray(0, 4));
        await f.http('get', path, actor, undefined, 307);
        await f.http('get', path + '/content', null, undefined, 401);
        await f.http(
          'get',
          path + '/content',
          'foreignStudent',
          undefined,
          actor === 'student' ? 404 : 403,
        );
      }
    },
  );
  it('hides a removed participant, hidden message, wrong attachment and deleted File before reading', async () => {
    const getObject = jest.spyOn(f.storage, 'getObject');
    try {
      const path = messagePath('parent', 'download') + '/content';
      await f.http(
        'get',
        path.replace(attachmentId, randomUUID()),
        'parent',
        undefined,
        404,
      );
      await f.prisma.communicationMessage.update({
        where: { id: messageId },
        data: { hiddenAt: new Date(), status: 'HIDDEN' },
      });
      await f.http('get', path, 'parent', undefined, 404);
      await f.prisma.communicationMessage.update({
        where: { id: messageId },
        data: { hiddenAt: null, status: 'SENT' },
      });
      await f.prisma.communicationConversationParticipant.updateMany({
        where: { conversationId, userId: f.prerequisites.parentId },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
      await f.http('get', path, 'parent', undefined, 404);
      await f.prisma.communicationConversationParticipant.updateMany({
        where: { conversationId, userId: f.prerequisites.parentId },
        data: { status: 'ACTIVE', removedAt: null },
      });
      await f.prisma.file.update({
        where: { id: fileId },
        data: { deletedAt: new Date() },
      });
      await f.http('get', path, 'parent', undefined, 404);
      expect(getObject).not.toHaveBeenCalled();
    } finally {
      await f.prisma.file.update({
        where: { id: fileId },
        data: { deletedAt: null },
      });
      getObject.mockRestore();
    }
  });
  it('streams only the current Student avatar and a currently visible reward image', async () => {
    const avatar = `student/profile/avatar/${fileId}/content`;
    expect((await f.http<Buffer>('get', avatar, 'student')).body).toEqual(body);
    await f.http(
      'get',
      avatar.replace(fileId, randomUUID()),
      'student',
      undefined,
      404,
    );
    for (const [actor, path] of [
      [
        'student',
        `student/rewards/${rewardId}/images/${fileId}/download/content`,
      ],
      [
        'parent',
        `parent/children/${f.child.studentId}/rewards/${rewardId}/images/${fileId}/download/content`,
      ],
    ] as const) {
      expect((await f.http<Buffer>('get', path, actor)).body).toEqual(body);
      await f.http(
        'get',
        path.replace(fileId, randomUUID()),
        actor,
        undefined,
        404,
      );
    }
    await f.prisma.rewardCatalogItem.update({
      where: { id: rewardId },
      data: { status: 'DRAFT' },
    });
    await f.http(
      'get',
      `student/rewards/${rewardId}/images/${fileId}/download/content`,
      'student',
      undefined,
      404,
    );
    await f.http(
      'get',
      `parent/children/${f.child.studentId}/rewards/${rewardId}/images/${fileId}/download/content`,
      'parent',
      undefined,
      404,
    );
    await f.prisma.rewardCatalogItem.update({
      where: { id: rewardId },
      data: { status: 'PUBLISHED' },
    });
  });
  it('streams Parent child and Teacher-owned allocated task proofs while rejecting arbitrary files and foreign children', async () => {
    const parent = `parent/children/${f.child.studentId}/files/${fileId}/download/content`;
    const teacher = `teacher/tasks/review-queue/${submissionId}/files/${fileId}/download/content`;
    const taskProof = `teacher/tasks/${taskId}/submissions/${submissionId}/files/${fileId}/download/content`;
    for (const [actor, path] of [
      ['parent', parent],
      ['teacher', teacher],
      ['teacher', taskProof],
    ] as const) {
      expect((await f.http<Buffer>('get', path, actor)).body).toEqual(body);
      await f.http(
        'get',
        path.replace(fileId, randomUUID()),
        actor,
        undefined,
        404,
      );
      await f.http('get', path, 'student', undefined, 403);
    }
    await f.http(
      'get',
      parent.replace(f.child.studentId, randomUUID()),
      'parent',
      undefined,
      404,
    );
    await f.prisma.teacherSubjectAllocation.update({
      where: { id: f.allocationId },
      data: { teacherUserId: f.prerequisites.authorId },
    });
    await f.http('get', teacher, 'teacher', undefined, 404);
    await f.http('get', taskProof, 'teacher', undefined, 404);
    await f.prisma.teacherSubjectAllocation.update({
      where: { id: f.allocationId },
      data: { teacherUserId: f.teacherId },
    });
  });
  it('streams an owned historical redemption image while its catalog is unavailable, without opening catalog or foreign redemption access', async () => {
    const redemption = await f.prisma.rewardRedemption.create({
      data: {
        schoolId: f.school.schoolId,
        catalogItemId: rewardId,
        studentId: f.child.studentId,
        enrollmentId: f.child.enrollmentId,
        academicYearId: f.school.yearId,
        termId: f.school.termId,
      },
    });
    await f.prisma.rewardCatalogItem.update({
      where: { id: rewardId },
      data: { status: 'DRAFT' },
    });
    try {
      for (const [actor, prefix] of [
        ['student', 'student'],
        ['parent', 'parent/children/' + f.child.studentId],
      ] as const) {
        const path =
          prefix +
          '/rewards/redemptions/' +
          redemption.id +
          '/images/' +
          fileId +
          '/download/content';
        expect((await f.http<Buffer>('get', path, actor)).body).toEqual(body);
        await f.http(
          'get',
          path.replace(redemption.id, randomUUID()),
          actor,
          undefined,
          404,
        );
        await f.http(
          'get',
          path.replace(fileId, randomUUID()),
          actor,
          undefined,
          404,
        );
        await f.http(
          'get',
          prefix +
            '/rewards/' +
            rewardId +
            '/images/' +
            fileId +
            '/download/content',
          actor,
          undefined,
          404,
        );
      }
    } finally {
      await f.prisma.rewardCatalogItem.update({
        where: { id: rewardId },
        data: { status: 'PUBLISHED' },
      });
    }
  });
  it('does not expose a credential artifact through avatar, catalog, history, task proof or generic file relationships', async () => {
    const redemption =
      (await f.prisma.rewardRedemption.findFirst({
        where: {
          schoolId: f.school.schoolId,
          catalogItemId: rewardId,
          studentId: f.child.studentId,
        },
      })) ??
      (await f.prisma.rewardRedemption.create({
        data: {
          schoolId: f.school.schoolId,
          catalogItemId: rewardId,
          studentId: f.child.studentId,
          enrollmentId: f.child.enrollmentId,
          academicYearId: f.school.yearId,
          termId: f.school.termId,
        },
      }));
    const batch = await f.prisma.studentCredentialBatch.create({
      data: {
        schoolId: f.school.schoolId,
        organizationId: f.school.organizationId,
        audienceMode: 'SELECTED_STUDENTS',
        credentialMode: 'UNIQUE_GENERATED',
        createdById: f.prerequisites.authorId,
        status: 'FAILED',
        secretArtifactFileId: fileId,
      },
    });
    const read = jest.spyOn(f.storage, 'getObject');
    try {
      for (const [actor, path] of [
        ['student', `student/profile/avatar/${fileId}/content`],
        [
          'student',
          `student/rewards/${rewardId}/images/${fileId}/download/content`,
        ],
        [
          'parent',
          `parent/children/${f.child.studentId}/rewards/${rewardId}/images/${fileId}/download/content`,
        ],
        [
          'student',
          `student/rewards/redemptions/${redemption.id}/images/${fileId}/download/content`,
        ],
        [
          'parent',
          `parent/children/${f.child.studentId}/rewards/redemptions/${redemption.id}/images/${fileId}/download/content`,
        ],
        [
          'teacher',
          `teacher/tasks/review-queue/${submissionId}/files/${fileId}/download/content`,
        ],
        [
          'teacher',
          `teacher/tasks/${taskId}/submissions/${submissionId}/files/${fileId}/download/content`,
        ],
        ['school', `files/${fileId}/download/content`],
      ] as const) {
        await f.http('get', path, actor, undefined, 404);
      }
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      await f.prisma.studentCredentialBatch.delete({ where: { id: batch.id } });
    }
  });

  it('preserves School Management generic file access and denies generic actor bypass', async () => {
    const path = `files/${fileId}/download/content`;
    expect((await f.http<Buffer>('get', path, 'school')).body).toEqual(body);
    const partial = await f.http<Buffer>(
      'get',
      path,
      'school',
      undefined,
      206,
      { Range: 'bytes=-4' },
    );
    expect(partial.body).toEqual(body.subarray(-4));
    await f.http('get', `files/${fileId}/download`, 'school', undefined, 307);
    for (const actor of ['student', 'parent', 'teacher'] as const)
      await f.http('get', path, actor, undefined, 403);
  });
});
