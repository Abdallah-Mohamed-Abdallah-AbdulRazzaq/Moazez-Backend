import { randomUUID } from 'node:crypto';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { AssessmentMediaSecurityGate } from '../../src/modules/files/assessment-media/application/assessment-media-verifier';
import type { AssessmentMediaUploadDto } from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';
import {
  TestOnlyAssessmentSecurityAttestation,
  postAssessmentUpload,
} from './assessment-media.fixture';
import { St10bRuntimeHttp, type St10bDomain } from './st10b-runtime.http';
import { st06Json } from './homework-question-assets.http';
import { st09bcTeacher, st09bcStudent } from './homework-eight-type.fixture';

export class St11AnswerMediaHttp extends St10bRuntimeHttp {
  readonly testSecurity = new TestOnlyAssessmentSecurityAttestation();
  protected configure(builder: TestingModuleBuilder) {
    this.testSecurity.beforeAttest = async (input) => {
      const intent = await this.prisma.assessmentAnswerUploadIntent.findUnique({
        where: { uploadId: input.uploadId },
        include: { upload: true },
      });
      if (
        !intent ||
        !this.fixture.schools.some((s) => s.schoolId === intent.schoolId) ||
        intent.upload.status !== 'VERIFYING' ||
        input.bucket !== this.fixture.storage.resolveBucket('PRIVATE') ||
        input.bucket !== intent.upload.finalBucket ||
        input.objectKey !== intent.upload.finalObjectKey ||
        input.facts.actualSizeBytes !== intent.upload.expectedSizeBytes
      )
        throw new Error('Test attestor refuses unowned answer upload');
    };
    return builder
      .overrideProvider(AssessmentMediaSecurityGate)
      .useValue(this.testSecurity);
  }
  async setupResponse(
    domain: St10bDomain,
    mode = 'FILE_ONLY',
    required = true,
    maxFiles = 1,
    coreAssignment = false,
  ) {
    const responseConfig = {
      version: 1,
      mode,
      ...(mode === 'TEXT_ONLY' ? {} : { maxFiles }),
    };
    if (domain === 'Homework') {
      const graph = await this.fixture.graph();
      const author = st09bcTeacher(this, graph);
      await this.http()
        .patch(author)
        .set(this.headers())
        .send({ isGraded: true, totalMarks: 1 })
        .expect(200);
      for (const question of graph.questions)
        await this.http()
          .delete(author + '/questions/' + question.id)
          .set(this.headers())
          .expect(204);
      const created = await this.http()
        .post(author + '/questions')
        .set(this.headers())
        .send({
          type: 'SHORT_TEXT',
          prompt: 'Answer response',
          points: 1,
          isRequired: required,
          responseConfig,
        })
        .expect(201);
      const questionId = st06Json<{ question: { questionId: string } }>(created)
        .question.questionId;
      const other = await this.http()
        .post(author + '/questions')
        .set(this.headers())
        .send({
          type: 'LONG_TEXT',
          prompt: 'Other response',
          points: 0,
          isRequired: false,
          responseConfig,
        })
        .expect(201);
      const otherQuestionId = st06Json<{ question: { questionId: string } }>(
        other,
      ).question.questionId;
      await this.http()
        .post(author + '/publish')
        .set(this.headers())
        .send({})
        .expect(200);
      const target = await this.prisma.homeworkTarget.findFirstOrThrow({
        where: {
          homeworkAssignmentId: graph.homework.id,
          studentId: this.fixture.children[0].studentId,
        },
      });
      const student = st09bcStudent(graph);
      return {
        domain,
        parentId: graph.homework.id,
        questionId,
        otherQuestionId,
        contextId: target.id,
        student,
        media: student + '/questions/' + questionId,
        submissionId: null,
        author,
        graph,
      };
    }
    const assessment = await this.fixture.assessment();
    await this.prisma.gradeAssessment.update({
      where: { id: assessment.id },
      data: {
        maxScore: 2,
        ...(coreAssignment ? { type: 'ASSIGNMENT' as const } : {}),
      },
    });
    const author = '/api/v1/grades/assessments/' + assessment.id;
    const created = await this.http()
      .post(author + '/questions')
      .set(this.headers('admin'))
      .send({
        type: 'SHORT_ANSWER',
        prompt: 'Answer response',
        points: 1,
        required,
        responseConfig,
      })
      .expect(201);
    const questionId = st06Json<{ id: string }>(created).id;
    const other = await this.http()
      .post(author + '/questions')
      .set(this.headers('admin'))
      .send({
        type: 'ESSAY',
        prompt: 'Other response',
        points: 1,
        required: false,
        responseConfig,
      })
      .expect(201);
    const otherQuestionId = st06Json<{ id: string }>(other).id;
    await this.http()
      .post(author + '/publish')
      .set(this.headers('admin'))
      .send({})
      .expect(201);
    const student = '/api/v1/student/exams/' + assessment.id;
    await this.http()
      .post(
        coreAssignment ? author + '/submissions/resolve' : student + '/start',
      )
      .set(this.headers('student'))
      .send(
        coreAssignment
          ? {
              studentId: this.fixture.children[0].studentId,
              enrollmentId: this.fixture.children[0].enrollmentId,
            }
          : {},
      )
      .expect(201);
    const submission = await this.prisma.gradeSubmission.findFirstOrThrow({
      where: {
        assessmentId: assessment.id,
        studentId: this.fixture.children[0].studentId,
      },
    });
    return {
      domain,
      parentId: assessment.id,
      questionId,
      otherQuestionId,
      contextId: submission.id,
      student,
      media: coreAssignment
        ? '/api/v1/grades/submissions/' +
          submission.id +
          '/questions/' +
          questionId
        : student +
          '/submissions/' +
          submission.id +
          '/questions/' +
          questionId,
      submissionId: submission.id,
      author,
      graph: null,
    };
  }
  async prepare(
    path: string,
    bytes = Buffer.from('ST11 private answer bytes'),
    mime = 'text/plain',
    requestId = randomUUID(),
  ) {
    const names: Record<string, string> = {
      'text/plain': 'answer.txt',
      'audio/mpeg': 'answer.mp3',
      'audio/mp4': 'answer.m4a',
      'audio/webm': 'answer.webm',
    };
    const command = {
      clientRequestId: requestId,
      originalName: names[mime] ?? 'answer.bin',
      expectedMimeType: mime,
      expectedSizeBytes: String(bytes.length),
    };
    const created = await this.http()
      .post(path + '/answer-uploads')
      .set(this.headers('student'))
      .send(command)
      .expect(201);
    return {
      intent: st06Json<AssessmentMediaUploadDto>(created),
      command,
      bytes,
    };
  }
  async ready(path: string, bytes?: Buffer, mime = 'text/plain') {
    const uploaded = await this.prepare(path, bytes, mime);
    if (!uploaded.intent.uploadCapability)
      throw new Error('Missing test capability');
    const response = await postAssessmentUpload(
      uploaded.intent.uploadCapability,
      uploaded.bytes,
      mime,
    );
    if (response.status !== 204)
      throw new Error('Owned answer bytes upload failed');
    const completed = await this.http()
      .post(path + '/answer-uploads/' + uploaded.intent.uploadId + '/complete')
      .set(this.headers('student'))
      .send({})
      .expect(201);
    return {
      ...uploaded,
      ready: st06Json<AssessmentMediaUploadDto>(completed),
    };
  }
  async bindReady(path: string, bytes?: Buffer) {
    const uploaded = await this.ready(path, bytes);
    const bound = await this.http()
      .post(path + '/answer-assets')
      .set(this.headers('student'))
      .send({ uploadId: uploaded.ready.uploadId })
      .expect(201);
    return {
      ...uploaded,
      asset: st06Json<{ asset: { id: string; fileId: string } }>(bound).asset,
    };
  }
  async disposeAnswerCase() {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
      errorMessage: 'ST11 teardown requires owned disposable DB',
    });
    // Append-only history has no application DELETE authority. This entire DB is a disposable serial fixture.
    await this.prisma
      .$executeRaw`TRUNCATE TABLE assessment_answer_media_claims, assessment_answer_upload_intents CASCADE`;
    await this.prisma.homeworkAnswerAsset.deleteMany({
      where: { schoolId: { in: this.fixture.schools.map((s) => s.schoolId) } },
    });
    await this.prisma.gradeSubmissionAnswerAsset.deleteMany({
      where: { schoolId: { in: this.fixture.schools.map((s) => s.schoolId) } },
    });
    await this.disposeRuntimeCase();
  }
}
