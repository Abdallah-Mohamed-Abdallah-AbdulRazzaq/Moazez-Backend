import { St12GradesHttp, ST12_TYPES } from '../fixtures/st12-grades.http';
import type { GradeReleasedReviewResponseDto } from '../../src/modules/grades/assessments/dto/grade-review.dto';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';
import type { QuestionGroupContext } from '../../src/common/question-groups/question-group.projection';
import { randomUUID } from 'node:crypto';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function waitForBarrier(promise: Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Owned storage barrier was not reached')),
          5000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe('ST13 real HTTP authorization, confidentiality and transaction certification', () => {
  jest.setTimeout(180000);
  const h = new St12GradesHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeSt12Case());
  afterAll(() => h.close());

  async function syncTarget(surface: 'CORE' | 'TEACHER') {
    const draft = await h.draft();
    // Assignment identity is established before publication or any Student attempt.
    await h.prisma.gradeAssessment.update({
      where: { id: draft.assessmentId },
      data: { type: 'ASSIGNMENT' },
    });
    await h
      .http()
      .post(draft.core + '/publish')
      .set(h.headers('admin'))
      .send({})
      .expect(201);
    await h
      .http()
      .post(draft.core + '/submissions/resolve')
      .set(h.headers('student'))
      .send({
        studentId: h.fixture.children[0].studentId,
        enrollmentId: h.fixture.children[0].enrollmentId,
      })
      .expect(201);
    const submission = await h.prisma.gradeSubmission.findFirstOrThrow({
      where: {
        assessmentId: draft.assessmentId,
        studentId: h.fixture.children[0].studentId,
      },
    });
    await h
      .http()
      .put(`/api/v1/grades/submissions/${submission.id}/answers`)
      .set(h.headers('student'))
      .send({
        answers: [
          {
            questionId: draft.question.id,
            answerJson: { value: '12.5', unitCode: 'm' },
          },
        ],
      })
      .expect(200);
    await h
      .http()
      .post(`/api/v1/grades/submissions/${submission.id}/submit`)
      .set(h.headers('student'))
      .send({})
      .expect(201);
    const f = await h.submittedIdentity(draft);
    await h.manual(f);
    await h.finalize(f);
    const actorName: 'admin' | 'teacher' =
      surface === 'CORE' ? 'admin' : 'teacher';
    const permission =
      surface === 'CORE' ? 'grades.submissions.review' : 'grades.items.manage';
    const otherPermission =
      surface === 'CORE' ? 'grades.items.manage' : 'grades.submissions.review';
    const route =
      surface === 'CORE'
        ? `/api/v1/grades/submissions/${f.submissionId}/sync-grade-item`
        : `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/assignments/${f.assessmentId}/submissions/${f.submissionId}/sync-grade-item`;
    return {
      f,
      actorName,
      actor: h.fixture.actors[actorName],
      permission,
      otherPermission,
      route,
    };
  }

  it.each(['CORE', 'TEACHER'] as const)(
    'ST13-SYNC-PERMISSION %s preserves its existing route permission without requiring the other surface permission',
    async (surface) => {
      const target = await syncTarget(surface);
      await h.prisma.rolePermission.deleteMany({
        where: {
          roleId: target.actor.roleId,
          permission: { code: target.otherPermission },
        },
      });
      expect(
        await h.prisma.rolePermission.count({
          where: {
            roleId: target.actor.roleId,
            permission: { code: target.permission },
          },
        }),
      ).toBe(1);
      await h
        .http()
        .post(target.route)
        .set(h.headers(target.actorName))
        .expect(201);
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: target.f.assessmentId },
        }),
      ).toBe(1);
      expect(
        await h.prisma.auditLog.count({
          where: {
            resourceId: target.f.submissionId,
            action: 'grades.submission.grade_item.sync',
          },
        }),
      ).toBe(1);
    },
  );

  it.each(['CORE', 'TEACHER'] as const)(
    'ST13-SYNC-REVOCATION %s rejects its concurrently revoked route permission while the other permission remains',
    async (surface) => {
      const target = await syncTarget(surface);
      expect(
        await h.prisma.rolePermission.count({
          where: {
            roleId: target.actor.roleId,
            permission: { code: target.otherPermission },
          },
        }),
      ).toBe(1);
      const [response] = await h.heldLock(
        (tx) =>
          tx.rolePermission.deleteMany({
            where: {
              roleId: target.actor.roleId,
              permission: { code: target.permission },
            },
          }),
        [() => h.http().post(target.route).set(h.headers(target.actorName))],
      );
      expect(response.status).toBe(404);
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: target.f.assessmentId },
        }),
      ).toBe(0);
      expect(
        await h.prisma.auditLog.count({
          where: {
            resourceId: target.f.submissionId,
            action: 'grades.submission.grade_item.sync',
          },
        }),
      ).toBe(0);
      const current = await h.prisma.gradeSubmission.findUniqueOrThrow({
        where: { id: target.f.submissionId },
      });
      expect(current.status).toBe('CORRECTED');
      expect(current.totalScore?.toFixed(2)).toBe('1.00');
    },
  );

  it('ST13-ACADEMIC-BYTES serves an authorized sealed revision from real private MinIO and denies revoked access', async () => {
    const fixture = await h.fixture.publication('GENERAL_RESOURCE');
    const storage = h.app.get(StorageService);
    const location = {
      bucket: storage.resolveBucket('PRIVATE'),
      objectKey: `st13-academic-content/${h.fixture.school.schoolId}/${randomUUID()}.pdf`,
    };
    const bytes = Buffer.from(
      '%PDF-1.7\nOwned ST13 sealed academic-content bytes\n%%EOF\n',
    );
    await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
      'academics.academic_content.view',
    ]);
    await h.fixture.grantAssets(h.fixture.actors.foreignStudent.roleId, [
      'academics.academic_content.view',
    ]);
    // Existing legacy/publication fixture; this is not an Assessment READY upload or a GCS resumable-provider claim.
    await storage.saveObject({
      ...location,
      body: bytes,
      contentType: 'application/pdf',
    });
    try {
      await h.prisma.file.update({
        where: { id: fixture.file.id },
        data: { ...location, sizeBytes: bytes.length },
      });
      const content = `/api/v1/student/academic-content/${fixture.content.id}/assets/${fixture.file.id}/access/content`;
      const full = await h
        .http()
        .get(content + '?mode=download')
        .set(h.headers('student'))
        .buffer(true)
        .expect(200);
      expect(full.body).toEqual(bytes);
      expect(full.headers['cache-control']).toContain('no-store');
      expect(full.headers['x-content-type-options']).toBe('nosniff');
      expect(full.headers['content-disposition']).toContain('attachment');
      await h
        .http()
        .head(content + '?mode=download')
        .set(h.headers('student'))
        .expect(200)
        .expect('Content-Length', String(bytes.length));
      const part = await h
        .http()
        .get(content + '?mode=preview')
        .set(h.headers('student'))
        .set('Range', 'bytes=0-7')
        .buffer(true)
        .expect(206);
      expect(part.body).toEqual(bytes.subarray(0, 8));
      expect(part.headers['content-disposition']).toContain('inline');
      await h
        .http()
        .get(content + '?mode=download')
        .set(h.headers('student'))
        .set('Range', `bytes=${bytes.length + 1}-`)
        .expect(416);
      await h
        .http()
        .get(content + '?mode=download')
        .set(h.headers('foreignStudent'))
        .expect(404);
      await h
        .http()
        .get(content + '?mode=download')
        .expect(401);
      await h.prisma.academicContentPublication.update({
        where: { id: fixture.publication.id },
        data: { visibleUntil: new Date(Date.now() - 1000) },
      });
      await h
        .http()
        .get(content + '?mode=download')
        .set(h.headers('student'))
        .expect(404);
      expect(await storage.objectExists(location)).toBe(true);
    } finally {
      await storage.deleteObject(location);
    }
  });

  it.each(['Homework', 'Grades'] as St10bDomain[])(
    'ST13-RACE-02 %s proves overlapping replacement bind and submit transactions',
    async (domain) => {
      const f = await h.setupResponse(domain),
        previous = await h.bindReady(f.media),
        upload = await h.ready(f.media);
      const [binding, submitting] = await h.heldLock(
        (tx) =>
          domain === 'Homework'
            ? tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${f.parentId}::uuid FOR UPDATE`
            : tx.$queryRaw`SELECT id FROM grade_assessments WHERE id=${f.parentId}::uuid FOR UPDATE`,
        [
          () =>
            h
              .http()
              .post(f.media + '/answer-assets')
              .set(h.headers('student'))
              .send({
                uploadId: upload.ready.uploadId,
                replaceAssetId: previous.asset.id,
              }),
          () =>
            h
              .http()
              .post(f.student + '/submission/submit')
              .set(h.headers('student'))
              .send({}),
        ],
      );
      expect([201, 404, 409]).toContain(binding.status);
      expect(submitting.status).toBe(domain === 'Homework' ? 200 : 201);
      const submission =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmission.findFirstOrThrow({
              where: { homeworkTargetId: f.contextId },
            })
          : await h.prisma.gradeSubmission.findUniqueOrThrow({
              where: { id: f.contextId },
            });
      expect(submission.status).toBe('SUBMITTED');
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(
        binding.status === 201 ? 2 : 1,
      );
      const active =
        domain === 'Homework'
          ? await h.prisma.homeworkAnswerAsset.count({
              where: { deletedAt: null },
            })
          : await h.prisma.gradeSubmissionAnswerAsset.count({
              where: { deletedAt: null },
            });
      expect(active).toBe(1);
      expect(
        (
          await h.prisma.file.findUniqueOrThrow({
            where: { id: previous.asset.fileId },
          })
        ).deletedAt,
      ).toBeNull();
      expect(await h.prisma.gradeItem.count()).toBe(0);
    },
  );

  it.each(['Homework', 'Grades'] as St10bDomain[])(
    'ST13-RACE-07 %s proves overlapping group moves reject a stale membership',
    async (domain) => {
      const f = await h.grouped(domain);
      const second = await h
        .http()
        .post(f.groups)
        .set(h.headers(f.author))
        .send({ title: 'ST13 second group' })
        .expect(201);
      const g2 = (second.body as QuestionGroupContext).groups.find(
        (g) => g.id !== f.groupId,
      )!.id;
      const questionId = f.answers[2].questionId;
      const before = await h.stored(domain, questionId);
      const responses = await h.heldLock(
        (tx) =>
          domain === 'Homework'
            ? tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${f.parentId}::uuid FOR UPDATE`
            : tx.$queryRaw`SELECT id FROM grade_assessments WHERE id=${f.parentId}::uuid FOR UPDATE`,
        [f.groupId, g2].map(
          (groupId) => () =>
            h
              .http()
              .put(f.groups + '/layout')
              .set(h.headers(f.author))
              .send({
                questions: [
                  {
                    questionId,
                    expectedGroupId: null,
                    groupId,
                    layoutOrder: 0,
                  },
                ],
                blocks: [],
              }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const current = await h.stored(domain, questionId);
      expect(current.groupId).toBe(
        responses[0].status === 200 ? f.groupId : g2,
      );
      expect(current.sortOrder).toBe(before.sortOrder);
      expect(current.points).toEqual(before.points);
    },
  );

  it.each(['Homework', 'Grades'] as St10bDomain[])(
    'ST13-RACE-08 %s rechecks a deleted reference before real bytes and retains its File',
    async (domain) => {
      const f = await h.setupResponse(domain),
        upload = await h.bindReady(f.media);
      const file = await h.prisma.file.findUniqueOrThrow({
        where: { id: upload.asset.fileId },
      });
      const storage = h.app.get(StorageService),
        entered = barrier(),
        proceed = barrier();
      const actualStat = storage.statObject.bind(
        storage,
      ) as StorageService['statObject'];
      let paused = false;
      const spy = jest
        .spyOn(storage, 'statObject')
        .mockImplementation(async (input) => {
          const stat = await actualStat(input);
          if (input.objectKey === file.objectKey && !paused) {
            paused = true;
            entered.release();
            await proceed.promise;
          }
          return stat;
        });
      const path = f.media + '/answer-assets/' + upload.asset.id;
      const reading = h
        .http()
        .get(path + '/download')
        .set(h.headers('student'))
        .then((r) => r);
      try {
        await waitForBarrier(entered.promise);
        await h.http().delete(path).set(h.headers('student')).expect(204);
        expect(
          await h.prisma.$transaction((tx) =>
            hasRetainedFileReferences(tx, file.id),
          ),
        ).toBe(true);
        await expect(
          h.prisma.file.delete({ where: { id: file.id } }),
        ).rejects.toThrow();
      } finally {
        proceed.release();
        spy.mockRestore();
      }
      expect((await reading).status).toBe(404);
      await h
        .http()
        .head(path + '/download')
        .set(h.headers('student'))
        .expect(404);
      expect(
        (await h.prisma.file.findUniqueOrThrow({ where: { id: file.id } }))
          .deletedAt,
      ).toBeNull();
      const source = await storage.getObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
        raw: true,
      });
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of source)
          chunks.push(Buffer.from(chunk as Uint8Array));
      } finally {
        source.destroy();
      }
      expect(Buffer.concat(chunks)).toEqual(upload.bytes);
    },
  );

  it.each(ST12_TYPES)(
    'ST13-AUDIENCE %s separates NONE, DETAILS, approved KEYS and revoked Student/Parent reads',
    async (type) => {
      const draft = await h.draft(type);
      await h.approveKey(draft);
      const f = await h.submitDraft(draft);
      for (const audience of ['student', 'parent'] as const)
        await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(404);
      await h.manual(f, 1, 'ST13 authorized private feedback');
      await h.finalize(f);
      await h.approvePaper(f);
      await h
        .release(f, 'DETAILS', 'DETAILS')
        .then((r) => expect(r.status).toBe(200));
      for (const audience of ['student', 'parent'] as const) {
        const response = await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(200);
        const details = response.body as GradeReleasedReviewResponseDto;
        expect(details.level).toBe('DETAILS');
        expect(details.questions).toHaveLength(1);
        expect(details.questions[0].canonicalType).toBe(type);
        expect(details.questions[0].answer?.awardedPoints).toBe(1);
        expect(details.questions[0].answer?.reviewerComment).toBe(
          'ST13 authorized private feedback',
        );
        expect(details.questions[0].correctAnswerAvailable).toBe(false);
        for (const privateField of [
          'answerKey',
          'metadata',
          'isCorrect',
          'correctAnswer',
        ])
          expect(JSON.stringify(details)).not.toContain(`"${privateField}":`);
      }
      await h
        .release(f, 'KEYS', 'KEYS', 1)
        .then((r) => expect(r.status).toBe(200));
      for (const audience of ['student', 'parent'] as const) {
        const response = await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(200);
        const keys = response.body as GradeReleasedReviewResponseDto;
        expect(keys.level).toBe('KEYS');
        expect(keys.questions[0].correctAnswerAvailable).toBe(true);
        expect(keys.questions[0].correctAnswer).toEqual(expect.any(Object));
        expect(JSON.stringify(keys)).not.toContain('"answerKey":');
        expect(JSON.stringify(keys)).not.toContain('"isCorrect":');
      }
      await h
        .release(f, 'NONE', 'NONE', 2)
        .then((r) => expect(r.status).toBe(200));
      for (const audience of ['student', 'parent'] as const)
        await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(404);
      const legacy = await h
        .http()
        .get(f.student + '/submission')
        .set(h.headers('student'))
        .expect(200);
      expect(JSON.stringify(legacy.body)).not.toContain(
        'ST13 authorized private feedback',
      );
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: f.assessmentId },
        }),
      ).toBe(0);
      const current = await h.prisma.gradeSubmission.findUniqueOrThrow({
        where: { id: f.submissionId },
      });
      expect(current.totalScore?.toFixed(2)).toBe('1.00');
    },
  );

  it('ST13-SYNC-AUDIT rolls back GradeItem synchronization when its committed audit cannot be written', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.finalize(f);
    await h.prisma.$executeRawUnsafe(
      "ALTER TABLE audit_logs ADD CONSTRAINT st13_owned_sync_audit_failure CHECK(action <> 'grades.submission.grade_item.sync') NOT VALID",
    );
    try {
      await h
        .http()
        .post(`/api/v1/grades/submissions/${f.submissionId}/sync-grade-item`)
        .set(h.headers('admin'))
        .expect(500);
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: f.assessmentId },
        }),
      ).toBe(0);
      expect(
        await h.prisma.auditLog.count({
          where: {
            resourceId: f.submissionId,
            action: 'grades.submission.grade_item.sync',
          },
        }),
      ).toBe(0);
      const current = await h.prisma.gradeSubmission.findUniqueOrThrow({
        where: { id: f.submissionId },
      });
      expect(current.totalScore?.toFixed(2)).toBe('1.00');
      expect(current.status).toBe('CORRECTED');
    } finally {
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE audit_logs DROP CONSTRAINT st13_owned_sync_audit_failure',
      );
    }
  });

  it('ST13-RACE-05 invalidates approval when the same question revision changes concurrently', async () => {
    const draft = await h.draft();
    const revision = draft.question.updatedAt;
    const responses = await h.heldLock(
      (tx) => tx.$queryRaw`
        SELECT id FROM grade_assessments WHERE id=${draft.assessmentId}::uuid FOR UPDATE
      `,
      [
        () =>
          h
            .http()
            .post(`${draft.core}/questions/${draft.question.id}/key-approval`)
            .set(h.headers('admin'))
            .send({ expectedQuestionUpdatedAt: revision }),
        () =>
          h
            .http()
            .patch(`${draft.teacher}/authoring/questions/${draft.question.id}`)
            .set(h.headers())
            .send({
              expectedQuestionUpdatedAt: revision,
              prompt: 'Revised after approval snapshot',
            }),
      ],
    );
    expect([201, 409]).toContain(responses[0].status);
    expect(responses[1].status).toBe(200);
    const current = await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
      where: { id: draft.question.id },
    });
    expect(current.prompt).toBe('Revised after approval snapshot');
    const submitted = await h.submitDraft(draft);
    const suggestion = await h.evaluate(submitted);
    expect(suggestion.reason).toBe('KEY_NOT_APPROVED');
    expect(suggestion.suggestedPoints).toBeNull();
    expect(
      await h.prisma.gradeItem.count({
        where: { assessmentId: draft.assessmentId },
      }),
    ).toBe(0);
  });

  it('ST13-RACE-10 rejects synchronization after a concurrently committed assessment lock', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.finalize(f);
    await h.approvePaper(f);
    const responses = await h.heldLock(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM grade_assessments WHERE id=${f.assessmentId}::uuid FOR UPDATE
        `;
        await tx.gradeAssessment.update({
          where: { id: f.assessmentId },
          data: { lockedAt: new Date() },
        });
      },
      [
        () =>
          h
            .http()
            .post(
              `/api/v1/grades/submissions/${f.submissionId}/sync-grade-item`,
            )
            .set(h.headers('admin')),
      ],
    );
    expect(responses[0].status).toBe(409);
    expect(
      await h.prisma.gradeItem.count({
        where: { assessmentId: f.assessmentId },
      }),
    ).toBe(0);
    expect(
      await h.prisma.auditLog.count({
        where: {
          resourceId: f.submissionId,
          action: 'grades.submission.grade_item.sync',
        },
      }),
    ).toBe(0);
    const submission = await h.prisma.gradeSubmission.findUniqueOrThrow({
      where: { id: f.submissionId },
    });
    expect(submission.status).toBe('CORRECTED');
    expect(submission.totalScore?.toFixed(2)).toBe('1.00');
  });
});
