import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type {
  GradeAssessmentQuestionResponseDto,
  GradeAssessmentQuestionsListResponseDto,
} from '../../src/modules/grades/assessments/dto/grade-assessment-question.dto';
import {
  St12GradesHttp,
  ST12_TYPES,
  st12Command,
  ST12_PERMISSION,
} from '../fixtures/st12-grades.http';
import { groupTextStimulus } from '../fixtures/st11-multipart.http';

describe('ST12-A real authenticated Teacher authoring', () => {
  jest.setTimeout(180000);
  const h = new St12GradesHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeSt12Case());
  afterAll(() => h.close());
  it('publishes the actual authoring and release HTTP DTO fields in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      h.app,
      new DocumentBuilder().setTitle('ST12 contract').setVersion('1').build(),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/authoring/questions',
        '/api/v1/student/grades/assessments/{assessmentId}/review',
        '/api/v1/parent/children/{studentId}/grades/assessments/{assessmentId}/review',
      ]),
    );
    const schemas = document.components?.schemas ?? {};
    for (const name of [
      'CreateGradeAssessmentQuestionDto',
      'UpdateTeacherGradeQuestionDto',
      'GradeAssessmentQuestionResponseDto',
    ]) {
      const schema = schemas[name];
      expect(
        schema && 'properties' in schema
          ? Object.keys(schema.properties ?? {})
          : [],
      ).toEqual(
        expect.arrayContaining([
          'points',
          'responseConfig',
          'richContent',
          'answerKey',
          'options',
        ]),
      );
    }
    const update = schemas.UpdateTeacherGradeQuestionDto;
    expect(update && 'required' in update ? update.required : []).toContain(
      'expectedQuestionUpdatedAt',
    );
  });
  it.each(ST12_TYPES)(
    'authors %s without broad management grants and denies ordinary key disclosure',
    async (type) => {
      const f = await h.draft(type);
      expect(f.question.canonicalType).toBe(type);
      expect(h.fixture.actors.teacher.permissions).not.toContain(
        'grades.questions.manage',
      );
      const list = await h
        .http()
        .get(f.teacher + '/authoring/questions')
        .set(h.headers())
        .expect(200);
      expect(list.body).toMatchObject({
        totalQuestions: 1,
        totalPoints: 2,
        pointsMatchMaxScore: true,
      });
      expect(
        (list.body as GradeAssessmentQuestionsListResponseDto).questions[0],
      ).toHaveProperty('answerKey');
      if (type === 'FILL_IN_BLANK')
        await h
          .http()
          .patch(f.teacher + '/authoring/questions/' + f.question.id)
          .set(h.headers())
          .send({
            answerKey: {},
            expectedQuestionUpdatedAt: f.question.updatedAt,
          })
          .expect(400);
      const ordinary = await h
        .http()
        .get(f.core + '/questions')
        .set(h.headers())
        .expect(200);
      expect(JSON.stringify(ordinary.body)).not.toContain('"answerKey"');
      expect(JSON.stringify(ordinary.body)).not.toContain('"isCorrect"');
      const changed = await h
        .http()
        .patch(f.teacher + '/authoring/questions/' + f.question.id)
        .set(h.headers())
        .send({
          prompt: 'Revised display',
          expectedQuestionUpdatedAt: f.question.updatedAt,
        })
        .expect(200);
      expect((changed.body as GradeAssessmentQuestionResponseDto).prompt).toBe(
        'Revised display',
      );
      await h
        .http()
        .patch(f.teacher + '/authoring/questions/' + f.question.id)
        .set(h.headers())
        .send({
          prompt: 'Stale display',
          expectedQuestionUpdatedAt: f.question.updatedAt,
        })
        .expect(409);
      await h
        .http()
        .put(f.teacher + '/authoring/questions/points')
        .set(h.headers())
        .send({ items: [{ questionId: f.question.id, points: 3 }] })
        .expect(200)
        .expect((response) =>
          expect(
            (response.body as GradeAssessmentQuestionsListResponseDto)
              .pointsMatchMaxScore,
          ).toBe(true),
        );
      expect(
        (
          await h.prisma.gradeAssessment.findUniqueOrThrow({
            where: { id: f.assessmentId },
          })
        ).maxScore.toFixed(2),
      ).toBe('3.00');
    },
  );
  it('denies wrong actors, broad scope, creator mismatch and revoked permission', async () => {
    const f = await h.draft(),
      path = f.teacher + '/authoring/questions';
    for (const actor of [
      'otherTeacher',
      'foreignTeacher',
      'student',
      'parent',
    ] as const) {
      const response = await h.http().get(path).set(h.headers(actor));
      expect([403, 404]).toContain(response.status);
    }
    await h.prisma.gradeAssessment.update({
      where: { id: f.assessmentId },
      data: { scopeType: 'SCHOOL', scopeKey: h.fixture.school.schoolId },
    });
    await h.http().get(path).set(h.headers()).expect(404);
    await h.prisma.gradeAssessment.update({
      where: { id: f.assessmentId },
      data: {
        scopeType: 'CLASSROOM',
        scopeKey: h.fixture.school.classroomId,
        createdById: h.fixture.actors.admin.userId,
      },
    });
    await h.http().get(path).set(h.headers()).expect(404);
    await h.prisma.gradeAssessment.update({
      where: { id: f.assessmentId },
      data: { createdById: h.fixture.actors.teacher.userId },
    });
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.teacher.roleId,
        permission: { code: ST12_PERMISSION },
      },
    });
    const denied = await h
      .http()
      .post(path)
      .set(h.headers())
      .send(st12Command('NUMERIC'));
    expect([403, 404]).toContain(denied.status);
    expect(
      await h.prisma.gradeAssessmentQuestion.count({
        where: { assessmentId: f.assessmentId, deletedAt: null },
      }),
    ).toBe(1);
  });
  it('denies a Core Teacher key mutation even with a manually granted broad permission', async () => {
    const f = await h.draft(),
      actor = h.fixture.actors.teacher;
    const permission = await h.prisma.permission.findUniqueOrThrow({
      where: { code: 'grades.questions.manage' },
    });
    await h.prisma.rolePermission.create({
      data: { roleId: actor.roleId, permissionId: permission.id },
    });
    actor.permissions.push('grades.questions.manage');
    const before = await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
      where: { id: f.question.id },
    });
    await h
      .http()
      .patch('/api/v1/grades/questions/' + f.question.id)
      .set(h.headers())
      .send({
        answerKey: {
          keyVersion: 1,
          kind: 'numeric',
          reference: { value: '13', unitCode: 'm' },
          policy: { policyVersion: 1, mode: 'EXACT' },
        },
      })
      .expect(404);
    const ordinary = await h
      .http()
      .get(f.core + '/questions')
      .set(h.headers())
      .expect(200);
    expect(JSON.stringify(ordinary.body)).not.toContain('"answerKey"');
    expect(
      (
        await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: f.question.id },
        })
      ).answerKey,
    ).toEqual(before.answerKey);
  });
  it('supports responseConfig, CRUD/order/groups and same-assessment verified media reuse with real bytes', async () => {
    const f = await h.draft('SHORT_ANSWER', {
        responseConfig: { version: 1, mode: 'FILE_ONLY', maxFiles: 1 },
      }),
      path = f.teacher + '/authoring';
    const q2 = await h
      .http()
      .post(path + '/questions')
      .set(h.headers())
      .send({ ...st12Command('NUMERIC'), sortOrder: 2 })
      .expect(201);
    const grouped = await h
      .http()
      .post(path + '/groups')
      .set(h.headers())
      .send({
        title: 'Shared passage',
        sharedStimulus: groupTextStimulus(),
        layoutOrder: 1,
      })
      .expect(201);
    const groupId = String(
      (grouped.body as { groups: { id: string }[] }).groups[0].id,
    );
    await h
      .http()
      .put(path + '/groups/layout')
      .set(h.headers())
      .send({
        questions: [
          {
            questionId: f.question.id,
            expectedGroupId: null,
            groupId,
            layoutOrder: 1,
          },
        ],
        blocks: [{ kind: 'group', id: groupId, layoutOrder: 1 }],
      })
      .expect(200);
    const upload = await h.paperUpload(f);
    for (const resource of [
      '/assets',
      '/questions/' + f.question.id + '/assets',
      '/groups/' + groupId + '/assets',
    ]) {
      const bound = await h
        .http()
        .post(path + resource)
        .set(h.headers())
        .send({
          sourceType: 'MANAGED_FILE',
          uploadId: upload.ready.uploadId,
          fileId: upload.ready.fileId,
        })
        .expect(201);
      const binding = bound.body as {
        asset?: { assetId?: string; id?: string };
        assetId?: string;
        id?: string;
      };
      const id = String(
          (binding.asset ?? binding).assetId ?? (binding.asset ?? binding).id,
        ),
        base = path + resource + '/' + id;
      await h
        .http()
        .get(base + '/download')
        .set(h.headers())
        .expect(200)
        .expect((response) =>
          expect(response.text).toBe(upload.bytes.toString()),
        );
      await h
        .http()
        .get(base + '/preview')
        .set(h.headers())
        .set('Range', 'bytes=0-4')
        .expect(206)
        .expect((response) =>
          expect(response.text).toBe(upload.bytes.subarray(0, 5).toString()),
        );
      await h
        .http()
        .head(base + '/download')
        .set(h.headers())
        .expect(200);
      await h
        .http()
        .get(base + '/download')
        .set(h.headers())
        .set('Range', 'bytes=99999-')
        .expect(416);
    }
    await h
      .http()
      .put(path + '/questions/reorder')
      .set(h.headers())
      .send({
        questionIds: [
          (q2.body as GradeAssessmentQuestionResponseDto).id,
          f.question.id,
        ],
      })
      .expect(200);
    await h
      .http()
      .delete(
        path +
          '/questions/' +
          (q2.body as GradeAssessmentQuestionResponseDto).id,
      )
      .set(h.headers())
      .expect(200);
    await h
      .http()
      .delete(path + '/questions/' + f.question.id)
      .set(h.headers())
      .expect(409);
    expect(
      await h.prisma.fileUploadSession.count({
        where: { purposeContextId: f.assessmentId, status: 'READY' },
      }),
    ).toBe(1);
  });
  it('serializes publication against edits and denies later attempt mutations', async () => {
    const f = await h.draft();
    const results = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () =>
          h
            .http()
            .patch(f.teacher + '/authoring/questions/' + f.question.id)
            .set(h.headers())
            .send({
              prompt: 'Ordered edit',
              expectedQuestionUpdatedAt: f.question.updatedAt,
            }),
        () =>
          h
            .http()
            .post(f.core + '/publish')
            .set(h.headers('admin'))
            .send({}),
      ],
    );
    expect([200, 409]).toContain(results[0].status);
    expect(results[1].status).toBe(201);
    await h
      .http()
      .post(f.student + '/start')
      .set(h.headers('student'))
      .expect(201);
    await h
      .http()
      .post(f.teacher + '/authoring/questions')
      .set(h.headers())
      .send(st12Command('NUMERIC'))
      .expect(409);
  });

  it.each(['allocation', 'membership', 'permission'] as const)(
    'denies %s revocation at the mutation boundary after a successful read',
    async (kind) => {
      const f = await h.draft();
      await h
        .http()
        .get(f.teacher + '/authoring/questions')
        .set(h.headers())
        .expect(200);
      const actor = h.fixture.actors.teacher;
      const [response] = await h.heldLock(
        async (tx) => {
          if (kind === 'allocation')
            await tx.$executeRawUnsafe(
              'DELETE FROM teacher_subject_allocations WHERE id=$1::uuid',
              h.fixture.allocations.teacher,
            );
          if (kind === 'membership')
            await tx.$executeRawUnsafe(
              "UPDATE memberships SET status='SUSPENDED' WHERE id=$1::uuid",
              actor.membershipId,
            );
          if (kind === 'permission')
            await tx.$executeRawUnsafe(
              'DELETE FROM role_permissions WHERE role_id=$1::uuid AND permission_id=(SELECT id FROM permissions WHERE code=$2)',
              actor.roleId,
              ST12_PERMISSION,
            );
        },
        [
          () =>
            h
              .http()
              .patch(f.teacher + '/authoring/questions/' + f.question.id)
              .set(h.headers())
              .send({
                prompt: 'Revoked write',
                expectedQuestionUpdatedAt: f.question.updatedAt,
              }),
        ],
      );
      expect([403, 404]).toContain(response.status);
      expect(
        (
          await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
            where: { id: f.question.id },
          })
        ).prompt,
      ).not.toBe('Revoked write');
      expect(
        await h.prisma.auditLog.count({
          where: {
            resourceId: f.question.id,
            action: 'grades.teacher_authoring.question.update',
          },
        }),
      ).toBe(0);
    },
  );
  it('denies same-class wrong-subject and wrong-parent resource substitutions', async () => {
    const f = await h.draft(),
      school = h.fixture.school;
    const subject = await h.prisma.subject.create({
      data: {
        schoolId: school.schoolId,
        nameAr: 'مادة أخرى',
        nameEn: 'Other subject',
        code: 'st12-' + Date.now(),
      },
    });
    const allocation = await h.prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.schoolId,
        subjectId: subject.id,
        termId: school.termId,
        classroomId: school.classroomId,
        teacherUserId: h.fixture.actors.teacher.userId,
      },
    });
    try {
      await h
        .http()
        .get(
          (f.teacher + '/authoring/questions').replace(
            h.fixture.allocations.teacher,
            allocation.id,
          ),
        )
        .set(h.headers())
        .expect(404);
      const other = await h.draft();
      await h
        .http()
        .patch(f.teacher + '/authoring/questions/' + other.question.id)
        .set(h.headers())
        .send({
          prompt: 'Confused parent',
          expectedQuestionUpdatedAt: other.question.updatedAt,
        })
        .expect(404);
      await h
        .http()
        .post(
          f.teacher + '/authoring/questions/' + other.question.id + '/assets',
        )
        .set(h.headers())
        .send({
          sourceType: 'EXTERNAL_HTTPS',
          externalUrl: 'https://media.example.org/stimulus.txt',
        })
        .expect(404);
    } finally {
      await h.prisma.teacherSubjectAllocation.delete({
        where: { id: allocation.id },
      });
      await h.prisma.subject.delete({ where: { id: subject.id } });
    }
  });
  it('advances option-only revisions and rejects stale option replacement while preserving identity', async () => {
    const f = await h.draft('MCQ_SINGLE'),
      path = f.teacher + '/authoring/questions/' + f.question.id;
    const options = f.question.options.map((option, index) => ({
      id: option.id,
      label: index === 0 ? 'Updated choice' : option.label,
      value: option.value,
      isCorrect: index === 0,
      sortOrder: index + 1,
    }));
    const updated = await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ options, expectedQuestionUpdatedAt: f.question.updatedAt })
      .expect(200);
    expect(
      String((updated.body as GradeAssessmentQuestionResponseDto).updatedAt),
    ).not.toBe(f.question.updatedAt);
    expect(
      (updated.body as GradeAssessmentQuestionResponseDto).options.map(
        (option: { id: string }) => option.id,
      ),
    ).toEqual(f.question.options.map((option) => option.id));
    await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ options, expectedQuestionUpdatedAt: f.question.updatedAt })
      .expect(409);
  });
});
