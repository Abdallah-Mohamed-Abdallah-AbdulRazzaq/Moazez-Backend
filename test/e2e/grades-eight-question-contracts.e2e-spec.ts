import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GradeQuestionType } from '@prisma/client';
import * as argon2 from 'argon2';
import request, { Response } from 'supertest';
import { AssessmentsModule } from '../../src/modules/grades/assessments/assessments.module';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { GradesSubmissionsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-submissions.repository';
import { GradesAssessmentsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-assessments.repository';
import { AssessmentMediaFixture } from '../fixtures/assessment-media.fixture';
import {
  GRADE_EIGHT_TYPES,
  gradeEightAnswer,
  gradeEightAuthor,
} from '../fixtures/grades-eight-types.fixture';

jest.setTimeout(120_000);
const prefix = '/api/v1';
type Question = {
  id: string;
  type: string;
  canonicalType: string;
  interaction: { supported: boolean; definition: unknown };
  options: Array<{ id: string; label: string }>;
};
type Submission = {
  id: string;
  status: string;
  answers: Array<{ id: string; questionId: string }>;
  totalScore: number;
};
const json = <T>(response: Response): T => response.body as T;

describe('ST-04 eight existing Grades types — real HTTP/PostgreSQL certification', () => {
  const prisma = new PrismaService();
  let app: INestApplication<Server>;
  const http = () => request(app.getHttpServer());
  let fixture: AssessmentMediaFixture;
  let password: string, passwordHash: string;
  let tokens: Record<string, string>;
  const permissions = [
    'grades.assessments.view',
    'grades.assessments.manage',
    'grades.assessments.publish',
    'grades.questions.view',
    'grades.questions.manage',
    'grades.submissions.view',
    'grades.submissions.start',
    'grades.submissions.save',
    'grades.submissions.submit',
    'grades.submissions.review',
    'grades.items.manage',
    'grades.items.view',
    'grades.gradebook.view',
  ];
  beforeAll(async () => {
    fixture = new AssessmentMediaFixture(prisma); // refuses shared/non-disposable targets
    await prisma.$connect();
    password = `Owned-${randomUUID()}!`;
    passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(async () => {
    fixture = new AssessmentMediaFixture(prisma);
    await fixture.create();
    for (const school of fixture.schools)
      await prisma.academicYear.update({
        where: { id: school.yearId },
        data: { isActive: true },
      });
    const actors = [
      ...Object.entries(fixture.actors).map(([name, actor]) => ({
        name,
        userId: actor.userId,
        roleId: actor.roleId,
      })),
      {
        name: 'parent',
        userId: fixture.parentId,
        roleId: fixture.parentRoleId,
      },
    ];
    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: permissions } },
      select: { id: true },
    });
    expect(permissionRows.length).toBe(permissions.length);
    tokens = {};
    for (const actor of actors) {
      // Existing permissions granted only to these disposable fixture roles.
      await prisma.rolePermission.createMany({
        data: permissionRows.map((permission) => ({
          roleId: actor.roleId,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
      const user = await prisma.user.update({
        where: { id: actor.userId },
        data: { passwordHash },
        select: { email: true },
      });
      const response = await http()
        .post(`${prefix}/auth/login`)
        .send({ email: user.email, password })
        .expect(200);
      tokens[actor.name] = json<{ accessToken: string }>(response).accessToken;
    }
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const where = {
      schoolId: { in: fixture.schools.map((school) => school.schoolId) },
    };
    await prisma.gradeSubmissionAnswerOption.deleteMany({ where });
    await prisma.gradeSubmissionAnswer.deleteMany({ where });
    await prisma.gradeItem.deleteMany({ where });
    await prisma.gradeAssessmentQuestionOption.deleteMany({ where });
    await prisma.gradeAssessmentQuestion.deleteMany({ where });
    await prisma.session.deleteMany({
      where: {
        userId: {
          in: [
            ...fixture.users,
            ...Object.values(fixture.actors).map((actor) => actor.userId),
          ],
        },
      },
    });
    await fixture.dispose();
  });
  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  const api = (actor = 'teacher') => ({
    Authorization: `Bearer ${tokens[actor]}`,
  });
  async function assessment() {
    const school = fixture.school;
    const response = await http()
      .post(`${prefix}/grades/assessments/question-based`)
      .set(api())
      .send({
        academicYearId: school.yearId,
        termId: school.termId,
        subjectId: school.subjectId,
        scopeType: 'classroom',
        scopeId: school.classroomId,
        classroomId: school.classroomId,
        titleEn: 'ST04 owned assessment',
        type: 'QUIZ',
        date: new Date().toISOString().slice(0, 10),
        weight: 1,
        maxScore: 2,
      })
      .expect(201);
    return json<{ id: string }>(response).id;
  }
  async function author(type: GradeQuestionType) {
    const assessmentId = await assessment();
    const created = await http()
      .post(`${prefix}/grades/assessments/${assessmentId}/questions`)
      .set(api())
      .send(gradeEightAuthor(type))
      .expect(201);
    return { assessmentId, question: json<Question>(created) };
  }
  async function published(type: GradeQuestionType) {
    const result = await author(type);
    await http()
      .post(`${prefix}/grades/assessments/${result.assessmentId}/publish`)
      .set(api())
      .expect(201);
    const started = await http()
      .post(`${prefix}/student/exams/${result.assessmentId}/start`)
      .set(api('student'))
      .expect(201);
    const persisted = await prisma.gradeSubmission.findFirstOrThrow({
      where: {
        assessmentId: result.assessmentId,
        studentId: fixture.children[0].studentId,
      },
    });
    expect(started.status).toBe(201);
    return { ...result, submissionId: persisted.id };
  }

  it.each(GRADE_EIGHT_TYPES)(
    '%s: author/edit/publish → both student reads → single/bulk save → submit/review/finalize → Parent-safe result',
    async (type) => {
      const assessmentId = await assessment();
      const authorInput = gradeEightAuthor(type);
      await http()
        .post(`${prefix}/grades/assessments/${assessmentId}/questions`)
        .set(api())
        .send({ ...authorInput, prompt: '' })
        .expect(400);
      const created = await http()
        .post(`${prefix}/grades/assessments/${assessmentId}/questions`)
        .set(api())
        .send(authorInput)
        .expect(201);
      let question = json<Question>(created);
      const edited = await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api())
        .send({ prompt: 'Edited typed prompt' })
        .expect(200);
      expect(json<Question>(edited).id).toBe(question.id);
      expect(json<Question>(edited).options.map((option) => option.id)).toEqual(
        question.options.map((option) => option.id),
      );
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api())
        .send({ points: -1 })
        .expect(400);
      await http()
        .get(
          `${prefix}/parent/children/${fixture.children[0].studentId}/grades/assessments/${assessmentId}`,
        )
        .set(api('parent'))
        .expect(404);
      await http()
        .post(`${prefix}/grades/assessments/${assessmentId}/publish`)
        .set(api())
        .expect(201);
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api())
        .send({ prompt: 'Forbidden published edit' })
        .expect(409);

      const exams = json<{ stages: Array<{ questions: Question[] }> }>(
        await http()
          .get(`${prefix}/student/exams/${assessmentId}`)
          .set(api('student'))
          .expect(200),
      );
      const grades = json<{ questions: Question[] }>(
        await http()
          .get(`${prefix}/student/grades/assessments/${assessmentId}`)
          .set(api('student'))
          .expect(200),
      );
      const examQuestion = exams.stages
        .flatMap((stage) => stage.questions)
        .find((row) => row.id === question.id)!;
      expect(examQuestion.canonicalType).toBe(type);
      expect(examQuestion.interaction.supported).toBe(true);
      expect(grades.questions[0].interaction).toEqual(examQuestion.interaction);
      for (const view of [examQuestion, grades.questions[0]])
        expect(JSON.stringify(view)).not.toMatch(
          /answerKey|isCorrect|DO_NOT_RELEASE|teacherOnly|renamedPrivateGuidance/,
        );
      await http()
        .get(`${prefix}/student/exams/${assessmentId}`)
        .set(api('foreignStudent'))
        .expect(404);
      await http()
        .get(`${prefix}/grades/assessments/${assessmentId}/questions`)
        .set(api('otherTeacher'))
        .expect(404);
      await http()
        .post(`${prefix}/student/exams/${assessmentId}/start`)
        .set(api('student'))
        .expect(201);
      const submission = await prisma.gradeSubmission.findFirstOrThrow({
        where: { assessmentId, studentId: fixture.children[0].studentId },
      });
      // Isolate the attempt guard from the already-tested publication guard.
      // Only this owned disposable fixture is put back into Draft.
      await prisma.gradeAssessment.update({
        where: { id: assessmentId },
        data: { approvalStatus: 'DRAFT' },
      });
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api())
        .send({ prompt: 'Forbidden edit after an existing attempt' })
        .expect(409);
      expect(
        (
          await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
            where: { id: question.id },
          })
        ).prompt,
      ).toBe('Edited typed prompt');
      await prisma.gradeAssessment.update({
        where: { id: assessmentId },
        data: { approvalStatus: 'PUBLISHED' },
      });
      await http()
        .post(`${prefix}/student/exams/${assessmentId}/submission/submit`)
        .set(api('student'))
        .expect(400);
      const good = gradeEightAnswer(
        type,
        question.options.map((option) => option.id),
      );
      const single = `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`;
      const bulk = `${prefix}/student/exams/${assessmentId}/submission/answers`;
      for (const { invalid, expected } of [
        { invalid: { answerJson: { arbitrary: true } }, expected: 400 },
        {
          invalid: { ...good, selectedOptionIds: [randomUUID(), randomUUID()] },
          expected: type === 'MCQ_MULTI' ? 404 : 400,
        },
      ]) {
        await http()
          .patch(single)
          .set(api('student'))
          .send(invalid)
          .expect(expected);
        await http()
          .put(bulk)
          .set(api('student'))
          .send({ answers: [{ questionId: question.id, ...invalid }] })
          .expect(expected);
      }
      await http().patch(single).set(api('student')).send(good).expect(200);
      await http()
        .put(bulk)
        .set(api('student'))
        .send({ answers: [{ questionId: question.id, ...good }] })
        .expect(200);
      const answers = await prisma.gradeSubmissionAnswer.findMany({
        where: { submissionId: submission.id },
        include: { selectedOptions: true },
      });
      expect(answers.length).toBe(1);
      expect(
        answers[0].answerText === null || answers[0].answerJson === null,
      ).toBe(true);
      expect(
        answers[0].selectedOptions.map((option) => option.optionId).sort(),
      ).toEqual(
        ('selectedOptionIds' in good ? good.selectedOptionIds : [])
          .slice()
          .sort(),
      );
      await http()
        .get(`${prefix}/grades/submissions/${submission.id}`)
        .set(api('otherStudent'))
        .expect(404);
      await http()
        .post(`${prefix}/student/exams/${assessmentId}/submission/submit`)
        .set(api('student'))
        .expect(201);
      await http().patch(single).set(api('student')).send(good).expect(409);
      const answerId = answers[0].id;
      const reviewer = await http()
        .get(`${prefix}/grades/submissions/${submission.id}`)
        .set(api())
        .expect(200);
      expect(JSON.stringify(reviewer.body)).not.toMatch(
        /answerKey|isCorrect|DO_NOT_RELEASE|teacherOnly|renamedPrivateGuidance/,
      );
      const reviewPath = `${prefix}/grades/submissions/${submission.id}/answers/${answerId}/review`;
      await http()
        .patch(reviewPath)
        .set(api())
        .send({ awardedPoints: 3 })
        .expect(400);
      await http()
        .patch(reviewPath)
        .set(api('otherTeacher'))
        .send({ awardedPoints: 1 })
        .expect(404);
      expect(await prisma.gradeItem.count({ where: { assessmentId } })).toBe(0);
      await http()
        .patch(reviewPath)
        .set(api())
        .send({ awardedPoints: 1.5, reviewerComment: 'Manual review' })
        .expect(200);
      const finalized = json<Submission>(
        await http()
          .post(`${prefix}/grades/submissions/${submission.id}/review/finalize`)
          .set(api())
          .expect(201),
      );
      expect(finalized.totalScore).toBe(1.5);
      await http()
        .patch(reviewPath)
        .set(api())
        .send({ awardedPoints: 2 })
        .expect(409);
      await http()
        .post(`${prefix}/grades/submissions/${submission.id}/sync-grade-item`)
        .set(api())
        .expect(201);
      const item = await prisma.gradeItem.findFirstOrThrow({
        where: { assessmentId, studentId: fixture.children[0].studentId },
      });
      expect(item.score?.toNumber()).toBe(1.5);
      const parent = await http()
        .get(
          `${prefix}/parent/children/${fixture.children[0].studentId}/grades/assessments/${assessmentId}`,
        )
        .set(api('parent'))
        .expect(200);
      expect(JSON.stringify(parent.body)).not.toMatch(
        /answerKey|isCorrect|DO_NOT_RELEASE|answerJson|matchingPairs/,
      );
      await http()
        .get(
          `${prefix}/parent/children/${fixture.children[2].studentId}/grades/assessments/${assessmentId}`,
        )
        .set(api('parent'))
        .expect(404);
      question = json<Question>(edited);
      expect(
        (
          await prisma.gradeSubmissionAnswer.findUniqueOrThrow({
            where: { id: answerId },
          })
        ).questionId,
      ).toBe(question.id);
    },
  );

  it.each(GRADE_EIGHT_TYPES)(
    '%s: school administrator authoring and publication obey typed and scoring constraints',
    async (type) => {
      const assessmentId = await assessment();
      const input = gradeEightAuthor(type);
      const invalid =
        type === 'MCQ_SINGLE'
          ? { ...input, options: [{ label: 'Only', isCorrect: true }] }
          : type === 'MCQ_MULTI'
            ? { ...input, metadata: { minSelections: 3, maxSelections: 1 } }
            : type === 'TRUE_FALSE'
              ? {
                  ...input,
                  options: [
                    { label: 'A', value: 'ambiguous', isCorrect: true },
                    { label: 'B', value: 'ambiguous' },
                  ],
                }
              : type === 'SHORT_ANSWER' || type === 'ESSAY'
                ? { ...input, options: [{ label: 'Not text' }] }
                : type === 'FILL_IN_BLANK'
                  ? { ...input, metadata: { blanks: 'invalid', segments: [] } }
                  : type === 'MATCHING'
                    ? { ...input, metadata: { left: [], right: [] } }
                    : {
                        ...input,
                        mediaUrl:
                          'https://storage.googleapis.com/private/object?X-Goog-Signature=never-expose',
                      };
      const expected = [
        'MCQ_SINGLE',
        'SHORT_ANSWER',
        'ESSAY',
        'MEDIA',
      ].includes(type)
        ? 422
        : 400;
      const rejected = await http()
        .post(`${prefix}/grades/assessments/${assessmentId}/questions`)
        .set(api('admin'))
        .send(invalid)
        .expect(expected);
      expect(JSON.stringify(rejected.body)).not.toContain('never-expose');
      const question = json<Question>(
        await http()
          .post(`${prefix}/grades/assessments/${assessmentId}/questions`)
          .set(api('admin'))
          .send(input)
          .expect(201),
      );
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api('admin'))
        .send({ points: 1 })
        .expect(200);
      const mismatch = await http()
        .post(`${prefix}/grades/assessments/${assessmentId}/publish`)
        .set(api('admin'))
        .expect(422);
      expect(json<{ error: { code: string } }>(mismatch).error.code).toBe(
        'grades.question.points_mismatch',
      );
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api('admin'))
        .send({ points: 2 })
        .expect(200);
      await http()
        .post(`${prefix}/grades/assessments/${assessmentId}/publish`)
        .set(api('admin'))
        .expect(201);
    },
  );

  it('MEDIA enforces the existing Unicode text bound and rejects unsupported modalities in both HTTP save paths', async () => {
    const { assessmentId, question, submissionId } = await published('MEDIA');
    const single = `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`;
    const bulk = `${prefix}/student/exams/${assessmentId}/submission/answers`;
    for (const invalid of [
      { answerText: '' },
      { answerText: ' \n\t ' },
      { answerText: 'x'.repeat(10001) },
      { answerText: 'valid', answerJson: {} },
      { answerJson: { fileId: randomUUID() } },
      { answerText: 'valid', selectedOptionIds: [randomUUID()] },
      { fileId: randomUUID() },
      { answerText: 'https://example.org/object?X-Amz-Signature=never-expose' },
    ]) {
      for (const response of [
        await http()
          .patch(single)
          .set(api('student'))
          .send(invalid)
          .expect(400),
        await http()
          .put(bulk)
          .set(api('student'))
          .send({ answers: [{ questionId: question.id, ...invalid }] })
          .expect(400),
      ])
        expect(JSON.stringify(response.body)).not.toContain('never-expose');
    }
    const exact = '😀'.repeat(10000);
    await http()
      .patch(single)
      .set(api('student'))
      .send({ answerText: exact })
      .expect(200);
    await http()
      .put(bulk)
      .set(api('student'))
      .send({ answers: [{ questionId: question.id, answerText: exact }] })
      .expect(200);
    const answer = await prisma.gradeSubmissionAnswer.findFirstOrThrow({
      where: { submissionId },
    });
    expect(Array.from(answer.answerText!).length).toBe(10000);
    expect(answer.answerJson).toBeNull();
  });

  it('historical malformed definitions and MEDIA answers stay unavailable without destructive rewrites', async () => {
    const { assessmentId, question, submissionId } = await published('MEDIA');
    const before = {
      arbitraryLegacyShape: { renamedPrivateGuidance: 'DO_NOT_RELEASE' },
    };
    const answer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: fixture.school.schoolId,
        submissionId,
        assessmentId,
        studentId: fixture.children[0].studentId,
        questionId: question.id,
        answerJson: before,
        maxPoints: 2,
      },
    });
    await prisma.gradeAssessmentQuestion.update({
      where: { id: question.id },
      data: {
        metadata: {
          mediaUrl:
            'https://storage.googleapis.com/old/object?X-Goog-Signature=never-expose',
        },
      },
    });
    for (const path of [
      `${prefix}/student/exams/${assessmentId}`,
      `${prefix}/student/grades/assessments/${assessmentId}`,
      `${prefix}/student/exams/${assessmentId}/submission`,
    ]) {
      const response = await http().get(path).set(api('student')).expect(200);
      expect(JSON.stringify(response.body)).not.toMatch(
        /DO_NOT_RELEASE|never-expose|storage.googleapis.com/,
      );
      expect(JSON.stringify(response.body)).toContain('"supported":false');
    }
    expect(
      (
        await prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        })
      ).answerJson,
    ).toEqual(before);
  });

  it('preserves option identity through explicit reorder and legacy in-place edits, and rejects foreign IDs', async () => {
    const { question } = await author('MCQ_SINGLE');
    const rows = await prisma.gradeAssessmentQuestionOption.findMany({
      where: { questionId: question.id },
      orderBy: { sortOrder: 'asc' },
    });
    const explicit = rows
      .slice()
      .reverse()
      .map((option, index) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        isCorrect: option.isCorrect,
        sortOrder: index + 1,
      }));
    const reordered = json<Question>(
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api())
        .send({ options: explicit })
        .expect(200),
    );
    expect(reordered.options.map((option) => option.id)).toEqual(
      explicit.map((option) => option.id),
    );
    const legacy = explicit.map((option) => ({
      label: `${option.label} edited`,
      value: option.value,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
    }));
    const edited = json<Question>(
      await http()
        .patch(`${prefix}/grades/questions/${question.id}`)
        .set(api())
        .send({ options: legacy })
        .expect(200),
    );
    expect(edited.options.map((option) => option.id)).toEqual(
      explicit.map((option) => option.id),
    );
    await http()
      .patch(`${prefix}/grades/questions/${question.id}`)
      .set(api())
      .send({ options: [{ ...explicit[0], id: randomUUID() }, explicit[1]] })
      .expect(404);
  });

  it('publication rejects an authoritative structure changed after use-case validation', async () => {
    const { assessmentId, question } = await author('MATCHING');
    const repository = app.get(GradesAssessmentsRepository);
    const original = repository.publishAssessment.bind(
      repository,
    ) as typeof repository.publishAssessment;
    jest
      .spyOn(repository, 'publishAssessment')
      .mockImplementation(async (...args) => {
        await prisma.gradeAssessmentQuestion.update({
          where: { id: question.id },
          data: { metadata: { left: [] } },
        });
        return original(...args);
      });
    await http()
      .post(`${prefix}/grades/assessments/${assessmentId}/publish`)
      .set(api())
      .expect(400);
    expect(
      (
        await prisma.gradeAssessment.findUniqueOrThrow({
          where: { id: assessmentId },
        })
      ).approvalStatus,
    ).toBe('DRAFT');
  });

  it.each(['FILL_IN_BLANK', 'MATCHING'] as const)(
    '%s rejects wrong, duplicate and incomplete structured IDs atomically through both HTTP saves',
    async (type) => {
      const { assessmentId, question, submissionId } = await published(type);
      const invalid =
        type === 'FILL_IN_BLANK'
          ? [
              { blanks: [{ blankId: 'foreign', text: 'x' }] },
              {
                blanks: [
                  { blankId: 'capital', text: 'x' },
                  { blankId: 'capital', text: 'y' },
                ],
              },
              { blanks: [{ blankId: 'capital', text: 'x' }] },
              {
                blanks: [
                  { blankId: 'capital', text: 'x'.repeat(1001) },
                  { blankId: 'river', text: 'y' },
                ],
              },
            ]
          : [
              { pairs: [{ leftId: 'foreign', rightId: 'r1' }] },
              {
                pairs: [
                  { leftId: 'l1', rightId: 'r1' },
                  { leftId: 'l2', rightId: 'r1' },
                ],
              },
              { pairs: [{ leftId: 'l1', rightId: 'r1' }] },
              {
                pairs: [
                  { leftId: 'l1', rightId: 'r1' },
                  { leftId: 'l1', rightId: 'r2' },
                ],
              },
            ];
      for (const answerJson of invalid) {
        await http()
          .patch(
            `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`,
          )
          .set(api('student'))
          .send({ answerJson })
          .expect(400);
        await http()
          .put(`${prefix}/student/exams/${assessmentId}/submission/answers`)
          .set(api('student'))
          .send({ answers: [{ questionId: question.id, answerJson }] })
          .expect(400);
      }
      expect(
        await prisma.gradeSubmissionAnswer.count({ where: { submissionId } }),
      ).toBe(0);
    },
  );

  it.each(['single', 'bulk'] as const)(
    '%s save rejects an option retired after answer validation',
    async (mode) => {
      const { assessmentId, question, submissionId } =
        await published('MCQ_SINGLE');
      const repository = app.get(GradesSubmissionsRepository);
      const retire = () =>
        prisma.gradeAssessmentQuestionOption.update({
          where: { id: question.options[0].id },
          data: { deletedAt: new Date() },
        });
      if (mode === 'single') {
        const original = repository.upsertAnswerWithSelectedOptions.bind(
          repository,
        ) as typeof repository.upsertAnswerWithSelectedOptions;
        jest
          .spyOn(repository, 'upsertAnswerWithSelectedOptions')
          .mockImplementationOnce(async (...args) => {
            await retire();
            return original(...args);
          });
        await http()
          .patch(
            `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`,
          )
          .set(api('student'))
          .send({ selectedOptionIds: [question.options[0].id] })
          .expect(400);
      } else {
        const original = repository.bulkUpsertAnswersWithSelectedOptions.bind(
          repository,
        ) as typeof repository.bulkUpsertAnswersWithSelectedOptions;
        jest
          .spyOn(repository, 'bulkUpsertAnswersWithSelectedOptions')
          .mockImplementationOnce(async (...args) => {
            await retire();
            return original(...args);
          });
        await http()
          .put(`${prefix}/student/exams/${assessmentId}/submission/answers`)
          .set(api('student'))
          .send({
            answers: [
              {
                questionId: question.id,
                selectedOptionIds: [question.options[0].id],
              },
            ],
          })
          .expect(400);
      }
      expect(
        await prisma.gradeSubmissionAnswer.count({ where: { submissionId } }),
      ).toBe(0);
    },
  );

  it('a concurrent finalization prevents stale review from overwriting marks', async () => {
    const { assessmentId, question, submissionId } =
      await published('SHORT_ANSWER');
    await http()
      .patch(
        `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`,
      )
      .set(api('student'))
      .send({ answerText: 'response' })
      .expect(200);
    await http()
      .post(`${prefix}/student/exams/${assessmentId}/submission/submit`)
      .set(api('student'))
      .expect(201);
    const answer = await prisma.gradeSubmissionAnswer.findFirstOrThrow({
      where: { submissionId },
    });
    const review = `${prefix}/grades/submissions/${submissionId}/answers/${answer.id}/review`;
    await http()
      .patch(review)
      .set(api())
      .send({ awardedPoints: 1 })
      .expect(200);
    const repository = app
      .select(AssessmentsModule)
      .get(GradesSubmissionsRepository, { strict: true });
    const original = repository.updateAnswerReview.bind(
      repository,
    ) as typeof repository.updateAnswerReview;
    const reviewSpy = jest
      .spyOn(repository, 'updateAnswerReview')
      .mockImplementationOnce(async (...args) => {
        await http()
          .post(`${prefix}/grades/submissions/${submissionId}/review/finalize`)
          .set(api())
          .expect(201);
        return original(...args);
      });
    await http()
      .patch(review)
      .set(api())
      .send({ awardedPoints: 2 })
      .expect(409);
    expect(reviewSpy).toHaveBeenCalledTimes(1);
    expect(
      (
        await prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        })
      ).awardedPoints?.toNumber(),
    ).toBe(1);
    expect(
      (
        await prisma.gradeSubmission.findUniqueOrThrow({
          where: { id: submissionId },
        })
      ).totalScore?.toNumber(),
    ).toBe(1);
  });

  it.each(
    ['single', 'bulk'].flatMap((mode) =>
      ['membership', 'permission', 'enrollment'].map(
        (resource) => [mode, resource] as const,
      ),
    ),
  )(
    '%s save cannot survive %s revocation after successful validation',
    async (mode, resource) => {
      const { assessmentId, question, submissionId } =
        await published('SHORT_ANSWER');
      await http()
        .get(`${prefix}/student/exams/${assessmentId}/submission`)
        .set(api('student'))
        .expect(200);
      const revoke = async () => {
        if (resource === 'membership')
          await prisma.membership.update({
            where: { id: fixture.actors.student.membershipId },
            data: { status: 'SUSPENDED' },
          });
        if (resource === 'permission')
          await prisma.rolePermission.deleteMany({
            where: {
              roleId: fixture.actors.student.roleId,
              permission: { code: 'grades.submissions.save' },
            },
          });
        if (resource === 'enrollment')
          await prisma.enrollment.update({
            where: { id: fixture.children[0].enrollmentId },
            data: { status: 'WITHDRAWN', endedAt: new Date() },
          });
      };
      const repository = app.get(GradesSubmissionsRepository);
      if (mode === 'single') {
        const original = repository.upsertAnswerWithSelectedOptions.bind(
          repository,
        ) as typeof repository.upsertAnswerWithSelectedOptions;
        jest
          .spyOn(repository, 'upsertAnswerWithSelectedOptions')
          .mockImplementationOnce(async (...args) => {
            await revoke();
            return original(...args);
          });
        await http()
          .patch(
            `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`,
          )
          .set(api('student'))
          .send({ answerText: 'stale' })
          .expect(404);
      } else {
        const original = repository.bulkUpsertAnswersWithSelectedOptions.bind(
          repository,
        ) as typeof repository.bulkUpsertAnswersWithSelectedOptions;
        jest
          .spyOn(repository, 'bulkUpsertAnswersWithSelectedOptions')
          .mockImplementationOnce(async (...args) => {
            await revoke();
            return original(...args);
          });
        await http()
          .put(`${prefix}/student/exams/${assessmentId}/submission/answers`)
          .set(api('student'))
          .send({ answers: [{ questionId: question.id, answerText: 'stale' }] })
          .expect(404);
      }
      expect(
        await prisma.gradeSubmissionAnswer.count({ where: { submissionId } }),
      ).toBe(0);
      expect(
        (
          await prisma.gradeSubmission.findUniqueOrThrow({
            where: { id: submissionId },
          })
        ).status,
      ).toBe('IN_PROGRESS');
    },
  );

  it('a concurrent HTTP submit wins over an already validated answer save', async () => {
    const { assessmentId, question, submissionId } =
      await published('SHORT_ANSWER');
    const path = `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`;
    await http()
      .patch(path)
      .set(api('student'))
      .send({ answerText: 'before' })
      .expect(200);
    const repository = app.get(GradesSubmissionsRepository);
    const original = repository.upsertAnswerWithSelectedOptions.bind(
      repository,
    ) as typeof repository.upsertAnswerWithSelectedOptions;
    jest
      .spyOn(repository, 'upsertAnswerWithSelectedOptions')
      .mockImplementationOnce(async (...args) => {
        await http()
          .post(`${prefix}/student/exams/${assessmentId}/submission/submit`)
          .set(api('student'))
          .expect(201);
        return original(...args);
      });
    await http()
      .patch(path)
      .set(api('student'))
      .send({ answerText: 'must not overwrite' })
      .expect(409);
    expect(
      (
        await prisma.gradeSubmissionAnswer.findFirstOrThrow({
          where: { submissionId },
        })
      ).answerText,
    ).toBe('before');
    expect(
      (
        await prisma.gradeSubmission.findUniqueOrThrow({
          where: { id: submissionId },
        })
      ).status,
    ).toBe('SUBMITTED');
  });

  it('stored legacy short text retains the former 10000-character read/review bound without widening new saves', async () => {
    const { assessmentId, question, submissionId } =
      await published('SHORT_ANSWER');
    const text = 'legacy '.repeat(200).trim();
    const answer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: fixture.school.schoolId,
        submissionId,
        assessmentId,
        studentId: fixture.children[0].studentId,
        questionId: question.id,
        answerText: text,
        maxPoints: 2,
      },
    });
    await http()
      .patch(
        `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`,
      )
      .set(api('student'))
      .send({ answerText: text })
      .expect(400);
    const read = await http()
      .get(`${prefix}/student/exams/${assessmentId}/submission`)
      .set(api('student'))
      .expect(200);
    expect(JSON.stringify(read.body)).toContain(text);
    await http()
      .post(`${prefix}/student/exams/${assessmentId}/submission/submit`)
      .set(api('student'))
      .expect(201);
    await http()
      .patch(
        `${prefix}/grades/submissions/${submissionId}/answers/${answer.id}/review`,
      )
      .set(api())
      .send({ awardedPoints: 1 })
      .expect(200);
    await http()
      .post(`${prefix}/grades/submissions/${submissionId}/review/finalize`)
      .set(api())
      .expect(201);
    expect(
      (
        await prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        })
      ).answerText,
    ).toBe(text);
  });

  it.each(['single', 'bulk'] as const)(
    '%s save rechecks a question retired after a successful read',
    async (mode) => {
      const { assessmentId, question, submissionId } =
        await published('SHORT_ANSWER');
      await http()
        .get(`${prefix}/student/exams/${assessmentId}`)
        .set(api('student'))
        .expect(200);
      const repository = app.get(GradesSubmissionsRepository);
      if (mode === 'single') {
        const original = repository.upsertAnswerWithSelectedOptions.bind(
          repository,
        ) as typeof repository.upsertAnswerWithSelectedOptions;
        jest
          .spyOn(repository, 'upsertAnswerWithSelectedOptions')
          .mockImplementation(async (...args) => {
            await prisma.gradeAssessmentQuestion.update({
              where: { id: question.id },
              data: { deletedAt: new Date() },
            });
            return original(...args);
          });
        await http()
          .patch(
            `${prefix}/student/exams/${assessmentId}/submission/answers/${question.id}`,
          )
          .set(api('student'))
          .send({ answerText: 'Cannot persist' })
          .expect(404);
      } else {
        const original = repository.bulkUpsertAnswersWithSelectedOptions.bind(
          repository,
        ) as typeof repository.bulkUpsertAnswersWithSelectedOptions;
        jest
          .spyOn(repository, 'bulkUpsertAnswersWithSelectedOptions')
          .mockImplementation(async (...args) => {
            await prisma.gradeAssessmentQuestion.update({
              where: { id: question.id },
              data: { deletedAt: new Date() },
            });
            return original(...args);
          });
        await http()
          .put(`${prefix}/student/exams/${assessmentId}/submission/answers`)
          .set(api('student'))
          .send({
            answers: [
              { questionId: question.id, answerText: 'Cannot persist' },
            ],
          })
          .expect(404);
      }
      expect(
        await prisma.gradeSubmissionAnswer.count({ where: { submissionId } }),
      ).toBe(0);
    },
  );
});
