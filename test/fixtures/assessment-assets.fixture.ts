import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentEngagementFixture } from './academic-content-engagement.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

export const ASSET_FAMILIES = [
  {
    model: 'HomeworkQuestionAsset',
    table: 'homework_question_assets',
    parentColumn: 'homework_question_id',
    key: 'homeworkQuestionId',
    parentTable: 'homework_questions',
    dual: true,
    prefix: 'hw_question_asset',
  },
  {
    model: 'GradeAssessmentQuestionAsset',
    table: 'grade_assessment_question_assets',
    parentColumn: 'question_id',
    key: 'questionId',
    parentTable: 'grade_assessment_questions',
    dual: true,
    prefix: 'grade_question_asset',
  },
  {
    model: 'GradeAssessmentAsset',
    table: 'grade_assessment_assets',
    parentColumn: 'assessment_id',
    key: 'assessmentId',
    parentTable: 'grade_assessments',
    dual: true,
    prefix: 'grade_assessment_asset',
  },
  {
    model: 'HomeworkAnswerAsset',
    table: 'homework_answer_assets',
    parentColumn: 'homework_submission_answer_id',
    key: 'homeworkAnswerId',
    parentTable: 'homework_submission_answers',
    dual: false,
    prefix: 'hw_answer_asset',
  },
  {
    model: 'GradeSubmissionAnswerAsset',
    table: 'grade_submission_answer_assets',
    parentColumn: 'answer_id',
    key: 'answerId',
    parentTable: 'grade_submission_answers',
    dual: false,
    prefix: 'grade_answer_asset',
  },
] as const;
export type AssetFamily = (typeof ASSET_FAMILIES)[number];
export interface AssetRow {
  id: string;
  schoolId: string;
  parentId: string;
  fileId: string | null;
  sourceType: string;
  category: string;
  sortOrder: number;
  createdByUserId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface AssetInsert {
  id?: string;
  schoolId?: string | null;
  parentId?: string | null;
  fileId?: string | null;
  sourceType?: string;
  externalUrl?: string | null;
  createdByUserId?: string;
  sortOrder?: number;
  deletedAt?: Date | null;
}
export async function expectSqlState(
  operation: () => Promise<unknown>,
  code: string,
) {
  await expect(operation()).rejects.toMatchObject({
    code: 'P2010',
    meta: { code },
  });
}

/** Structural SQL fixture only. Answer inserts now include the ST11 immutable registry.
 * Synthetic persisted evidence below tests FKs/triggers, never runtime verification or bytes.
 * Real READY/streaming authority is tested separately with the owned ST11 HTTP/MinIO fixture. */
export class AssessmentAssetsFixture extends AcademicContentEngagementFixture {
  readonly files: string[] = [];
  readonly parents: Array<
    Awaited<ReturnType<AssessmentAssetsFixture['createParents']>>
  > = [];
  constructor(prisma: PrismaService) {
    super(prisma);
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
      errorMessage:
        'Asset foundation tests require an owned disposable PostgreSQL database',
    });
  }
  async create(): Promise<void> {
    await super.create();
    for (const child of [0, 1, 2])
      this.parents.push(await this.createParents(child));
  }
  private async createParents(childIndex: number) {
    const child = this.children[childIndex],
      school = this.schools[child.school];
    const teacherId = randomUUID();
    const teacher = await this.prisma.user.create({
      data: {
        id: teacherId,
        email: `${randomUUID()}@st05-fixture.test`,
        firstName: 'Owned',
        lastName: 'Teacher',
        userType: 'TEACHER',
      },
    });
    this.users.push(teacherId);
    const allocation = await this.prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.schoolId,
        teacherUserId: teacher.id,
        subjectId: school.subjectId,
        classroomId: school.classroomId,
        termId: school.termId,
      },
    });
    const homework = await this.prisma.homeworkAssignment.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        classroomId: school.classroomId,
        subjectId: school.subjectId,
        teacherUserId: teacher.id,
        teacherSubjectAllocationId: allocation.id,
        title: 'Owned ST05 parent',
        dueAt: new Date(Date.now() + 86400000),
        createdByUserId: teacher.id,
      },
    });
    const homeworkQuestion = await this.prisma.homeworkQuestion.create({
      data: {
        schoolId: school.schoolId,
        homeworkAssignmentId: homework.id,
        type: 'SHORT_TEXT',
        prompt: 'Existing Homework question',
        createdByUserId: teacher.id,
      },
    });
    const target = await this.prisma.homeworkTarget.create({
      data: {
        schoolId: school.schoolId,
        homeworkAssignmentId: homework.id,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
      },
    });
    const homeworkSubmission = await this.prisma.homeworkSubmission.create({
      data: {
        schoolId: school.schoolId,
        homeworkAssignmentId: homework.id,
        homeworkTargetId: target.id,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        bodyText: 'Legacy Homework body',
      },
    });
    const homeworkAnswer = await this.prisma.homeworkSubmissionAnswer.create({
      data: {
        schoolId: school.schoolId,
        homeworkAssignmentId: homework.id,
        homeworkTargetId: target.id,
        homeworkSubmissionId: homeworkSubmission.id,
        homeworkQuestionId: homeworkQuestion.id,
        textAnswer: 'Legacy Homework answer',
      },
    });
    const assessment = await this.prisma.gradeAssessment.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        subjectId: school.subjectId,
        scopeType: 'CLASSROOM',
        scopeKey: school.classroomId,
        classroomId: school.classroomId,
        titleEn: 'Owned ST05 Grades parent',
        type: 'QUIZ',
        deliveryMode: 'QUESTION_BASED',
        date: new Date(),
        weight: 1,
        maxScore: 2,
      },
    });
    const question = await this.prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: school.schoolId,
        assessmentId: assessment.id,
        type: 'ESSAY',
        prompt: 'Existing Grades question',
        points: 2,
        sortOrder: 1,
      },
    });
    const submission = await this.prisma.gradeSubmission.create({
      data: {
        schoolId: school.schoolId,
        assessmentId: assessment.id,
        termId: school.termId,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        maxScore: 2,
      },
    });
    const answer = await this.prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: school.schoolId,
        submissionId: submission.id,
        assessmentId: assessment.id,
        questionId: question.id,
        studentId: child.studentId,
        answerText: 'Legacy Grades answer',
        maxPoints: 2,
      },
    });
    return {
      schoolId: school.schoolId,
      organizationId: school.organizationId,
      studentId: child.studentId,
      homeworkAssignmentId: homework.id,
      homeworkQuestionId: homeworkQuestion.id,
      homeworkTargetId: target.id,
      homeworkSubmissionId: homeworkSubmission.id,
      homeworkAnswerId: homeworkAnswer.id,
      assessmentId: assessment.id,
      questionId: question.id,
      submissionId: submission.id,
      answerId: answer.id,
    };
  }
  async file(
    schoolIndex = 0,
    options: { global?: boolean; retired?: boolean } = {},
  ) {
    const school = this.schools[schoolIndex];
    const row = await this.prisma.file.create({
      data: {
        schoolId: options.global ? null : school.schoolId,
        organizationId: school.organizationId,
        uploaderId: this.authorId,
        bucket: 'owned-st05-schema-test',
        objectKey: `st05/${randomUUID()}`,
        originalName: 'identity-only.txt',
        mimeType: 'text/plain',
        sizeBytes: 12,
        visibility: 'PRIVATE',
        deletedAt: options.retired ? new Date() : null,
      },
    });
    this.files.push(row.id);
    return row;
  }
  async insert(
    family: AssetFamily,
    input: AssetInsert = {},
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    if (!ASSET_FAMILIES.includes(family))
      throw new Error('Unknown static asset family');
    const row = this.parents[0];
    const claim = family.dual
      ? null
      : await this.answerClaim(family, input, tx);
    const columns = family.dual
      ? Prisma.sql`, external_url`
      : Prisma.sql`, answer_media_claim_id`;
    const values = family.dual
      ? Prisma.sql`, ${input.externalUrl ?? null}`
      : Prisma.sql`, ${claim!.id}::uuid`;
    const rows = await tx.$queryRaw<AssetRow[]>(Prisma.sql`
      INSERT INTO public.${Prisma.raw(family.table)}
        (id, school_id, ${Prisma.raw(family.parentColumn)}, file_id, source_type, category,
         sort_order, created_by_user_id, title, deleted_at, updated_at${columns})
      VALUES (${input.id ?? randomUUID()}::uuid,
        ${input.schoolId === undefined ? row.schoolId : input.schoolId}::uuid,
        ${input.parentId === undefined ? row[family.key] : input.parentId}::uuid,
        ${input.fileId ?? null}::uuid, ${input.sourceType ?? 'MANAGED_FILE'}::public."AssessmentAssetSourceType",
        'DOCUMENT', ${input.sortOrder ?? 0}, ${input.createdByUserId ?? claim?.actorId ?? this.authorId}::uuid,
        'Owned resource', ${input.deletedAt ?? null}, CURRENT_TIMESTAMP${values})
      RETURNING id, school_id AS "schoolId", ${Prisma.raw(family.parentColumn)} AS "parentId",
        file_id AS "fileId", source_type::text AS "sourceType", category::text, sort_order AS "sortOrder",
        created_by_user_id AS "createdByUserId", title, created_at AS "createdAt",
        updated_at AS "updatedAt", deleted_at AS "deletedAt"`);
    return rows[0];
  }
  async scopedRows(
    family: AssetFamily,
    ids: string[],
  ): Promise<Array<{ id: string; schoolId: string; deletedAt: Date | null }>> {
    const args = { where: { id: { in: ids } } };
    const scoped = this.prisma.scoped as unknown as Pick<
      PrismaService,
      | 'homeworkQuestionAsset'
      | 'gradeAssessmentQuestionAsset'
      | 'gradeAssessmentAsset'
      | 'homeworkAnswerAsset'
      | 'gradeSubmissionAnswerAsset'
    >;
    switch (family.model) {
      case 'HomeworkQuestionAsset':
        return scoped.homeworkQuestionAsset.findMany(args);
      case 'GradeAssessmentQuestionAsset':
        return scoped.gradeAssessmentQuestionAsset.findMany(args);
      case 'GradeAssessmentAsset':
        return scoped.gradeAssessmentAsset.findMany(args);
      case 'HomeworkAnswerAsset':
        return scoped.homeworkAnswerAsset.findMany(args);
      case 'GradeSubmissionAnswerAsset':
        return scoped.gradeSubmissionAnswerAsset.findMany(args);
    }
  }
  async resetAssets(): Promise<void> {
    // Constructor rejects non-disposable DBs. Serial fixture teardown may discard append-only test history.
    await this.prisma
      .$executeRaw`TRUNCATE TABLE assessment_answer_media_claims, assessment_answer_upload_intents CASCADE`;
    const schoolIds = this.schools.map((s) => s.schoolId);
    for (const family of ASSET_FAMILIES)
      await this.prisma.$executeRaw(
        Prisma.sql`DELETE FROM public.${Prisma.raw(family.table)} WHERE school_id IN (${Prisma.join(schoolIds.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
  }
  async dispose(): Promise<void> {
    const where = { schoolId: { in: this.schools.map((s) => s.schoolId) } };
    await this.resetAssets();
    await this.prisma.homeworkSubmissionAttachment.deleteMany({ where });
    await this.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await this.prisma.homeworkSubmission.deleteMany({ where });
    await this.prisma.homeworkTarget.deleteMany({ where });
    await this.prisma.homeworkQuestionOption.deleteMany({ where });
    await this.prisma.homeworkQuestion.deleteMany({ where });
    await this.prisma.homeworkAssignmentAttachment.deleteMany({ where });
    await this.prisma.homeworkAssignment.deleteMany({ where });
    await this.prisma.gradeSubmissionAnswerOption.deleteMany({ where });
    await this.prisma.gradeSubmissionAnswer.deleteMany({ where });
    await this.prisma.gradeSubmission.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestionOption.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestion.deleteMany({ where });
    await this.prisma.gradeAssessment.deleteMany({ where });
    await this.prisma.teacherSubjectAllocation.deleteMany({ where });
    await this.prisma.attachment.deleteMany({ where });
    await this.prisma.fileUploadSession.deleteMany({ where });
    await this.prisma.file.deleteMany({ where: { id: { in: this.files } } });
    await super.dispose();
  }

  private async answerClaim(
    family: AssetFamily,
    input: AssetInsert,
    tx: Prisma.TransactionClient,
  ) {
    const base = this.parents[0];
    const parent =
      this.parents.find(
        (p) =>
          p[family.key] === input.parentId &&
          p.schoolId === (input.schoolId ?? base.schoolId),
      ) ?? base;
    const student = await tx.student.findUniqueOrThrow({
      where: { id: parent.studentId },
      select: { userId: true },
    });
    if (!student.userId)
      throw new Error('Owned answer identity requires Student user');
    const actorId = student.userId;
    const requested = input.fileId
      ? await tx.file.findUnique({ where: { id: input.fileId } })
      : null;
    let file =
      requested?.schoolId === parent.schoolId && requested.deletedAt === null
        ? requested
        : null;
    if (!file) {
      file = await tx.file.create({
        data: {
          schoolId: parent.schoolId,
          organizationId: parent.organizationId,
          uploaderId: actorId,
          bucket: 'owned-st11-schema-only',
          objectKey: 'structural/' + randomUUID(),
          originalName: 'identity-only.txt',
          mimeType: 'text/plain',
          sizeBytes: 12,
          visibility: 'PRIVATE',
        },
      });
      this.files.push(file.id);
    }
    const existing = await tx.assessmentAnswerMediaClaim.findUnique({
      where: { fileId: file.id },
    });
    if (existing) return { id: existing.id, actorId: existing.actorId };
    const checksum = 'a'.repeat(64),
      uploadId = randomUUID();
    file = await tx.file.update({
      where: { id: file.id },
      data: {
        uploaderId: actorId,
        checksumSha256: checksum,
        objectKey: `assessment-media/${parent.schoolId}/verified/${uploadId}`,
      },
    });
    const hw = family.model === 'HomeworkAnswerAsset';
    const config = { version: 1, mode: 'TEXT_OR_FILE', maxFiles: 3 };
    if (hw)
      await tx.homeworkQuestion.update({
        where: { id: parent.homeworkQuestionId },
        data: { responseConfig: config },
      });
    else
      await tx.gradeAssessmentQuestion.update({
        where: { id: parent.questionId },
        data: { responseConfig: config },
      });
    const now = new Date(Date.now() - 60000),
      created = new Date(now.getTime() - 1000);
    const purpose = hw ? 'HOMEWORK_SUBMISSION_MEDIA' : 'GRADE_SUBMISSION_MEDIA';
    const contextId = hw ? parent.homeworkTargetId : parent.submissionId;
    const questionId = hw ? parent.homeworkQuestionId : parent.questionId;
    const upload = await tx.fileUploadSession.create({
      data: {
        id: uploadId,
        schoolId: parent.schoolId,
        organizationId: parent.organizationId,
        createdByUserId: actorId,
        clientRequestId: randomUUID(),
        purpose,
        purposeContextId: contextId,
        originalName: file.originalName,
        expectedMimeType: file.mimeType,
        expectedSizeBytes: file.sizeBytes,
        stagingBucket: file.bucket,
        stagingObjectKey: `assessment-media/${parent.schoolId}/staging/${uploadId}`,
        finalBucket: file.bucket,
        finalObjectKey: file.objectKey,
        status: 'CREATED',
        createdAt: created,
        expiresAt: new Date(now.getTime() + 120000),
      },
    });
    const intent = await tx.assessmentAnswerUploadIntent.create({
      data: {
        schoolId: parent.schoolId,
        organizationId: parent.organizationId,
        actorId,
        studentId: parent.studentId,
        purpose,
        contextId,
        questionId,
        uploadId: upload.id,
        clientRequestId: upload.clientRequestId,
        ...(hw
          ? {
              homeworkTargetId: contextId,
              homeworkQuestionId: questionId,
              homeworkAssignmentId: parent.homeworkAssignmentId,
            }
          : {
              gradeSubmissionId: contextId,
              gradeQuestionId: questionId,
              gradeAssessmentId: parent.assessmentId,
            }),
      },
    });
    await tx.fileUploadSession.update({
      where: { id: upload.id },
      data: {
        status: 'UPLOADING',
        latestUploadUrlExpiresAt: new Date(now.getTime() + 120000),
      },
    });
    await tx.fileUploadSession.update({
      where: { id: upload.id },
      data: {
        status: 'VERIFYING',
        assessmentVerificationClaimId: randomUUID(),
      },
    });
    const evidence = {
      verdict: 'CLEAN',
      provider: 'schema-only-fixture',
      version: 'structural-test-v1',
      checksumSha256: checksum,
      verifiedAt: now.toISOString(),
    };
    await tx.$executeRaw`UPDATE file_upload_sessions SET status='READY', file_id=${file.id}::uuid, actual_size_bytes=${file.sizeBytes},
      verified_mime_type=${file.mimeType}, checksum_sha256=${checksum}, verified_at=${now}, completed_at=${now},
      verification_version='assessment-media-attested-v1', assessment_verification_claim_id=NULL,
      assessment_security_evidence=${JSON.stringify(evidence)}::jsonb WHERE id=${upload.id}::uuid`;
    const claim = await tx.assessmentAnswerMediaClaim.create({
      data: {
        schoolId: parent.schoolId,
        organizationId: parent.organizationId,
        actorId,
        studentId: parent.studentId,
        purpose,
        contextId,
        questionId,
        intentId: intent.id,
        fileId: file.id,
        ...(hw
          ? {
              homeworkAnswerId: parent.homeworkAnswerId,
              homeworkSubmissionId: parent.homeworkSubmissionId,
              homeworkAssignmentId: parent.homeworkAssignmentId,
            }
          : {
              gradeAnswerId: parent.answerId,
              gradeAssessmentId: parent.assessmentId,
            }),
      },
    });
    return { id: claim.id, actorId };
  }
}
