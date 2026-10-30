import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import {
  AssessmentAssetsFixture,
  ASSET_FAMILIES,
  expectSqlState,
} from '../fixtures/assessment-assets.fixture';

describe('ST11-A physical intent, consumption and retained history integrity', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  let fixture: AssessmentAssetsFixture;
  beforeAll(async () => {
    fixture = new AssessmentAssetsFixture(prisma);
    await prisma.$connect();
    await fixture.create();
  });
  afterEach(() => fixture.resetAssets());
  afterAll(async () => {
    await fixture.dispose();
    await prisma.$disconnect();
  });

  async function bound(domain: 'Homework' | 'Grades') {
    const file = await fixture.file();
    const family = ASSET_FAMILIES[domain === 'Homework' ? 3 : 4];
    const asset = await fixture.insert(family, { fileId: file.id });
    const claim = await prisma.assessmentAnswerMediaClaim.findUniqueOrThrow({
      where: { fileId: file.id },
    });
    return { file, family, asset, claim };
  }
  async function unconsumedIntent(sourceId: string) {
    const [source] = await prisma.$queryRaw<
      Array<{
        intent: Record<string, unknown>;
        upload: Record<string, unknown>;
      }>
    >`
      SELECT to_jsonb(i) AS intent, to_jsonb(u) AS upload FROM assessment_answer_upload_intents i
      JOIN file_upload_sessions u ON u.id=i.upload_id WHERE i.id=${sourceId}::uuid`;
    const uploadId = randomUUID();
    const schoolId = source.upload.school_id;
    if (
      typeof schoolId !== 'string' ||
      !fixture.schools.some((s) => s.schoolId === schoolId)
    )
      throw new Error('Unexpected owned upload school');
    const upload: Record<string, unknown> = {
      ...source.upload,
      id: uploadId,
      client_request_id: randomUUID(),
      status: 'CREATED',
    };
    for (const key of [
      'file_id',
      'completed_at',
      'latest_upload_url_expires_at',
      'verified_mime_type',
      'actual_size_bytes',
      'checksum_sha256',
      'duration_seconds',
      'width',
      'height',
      'verified_at',
      'verification_version',
      'assessment_verification_claim_id',
      'assessment_security_evidence',
    ])
      upload[key] = null;
    upload.staging_object_key = `assessment-media/${schoolId}/staging/${uploadId}`;
    upload.final_object_key = `assessment-media/${schoolId}/verified/${uploadId}`;
    await prisma.$executeRaw`INSERT INTO file_upload_sessions SELECT (jsonb_populate_record(NULL::file_upload_sessions, ${JSON.stringify(upload)}::jsonb)).*`;
    return {
      ...source.intent,
      id: randomUUID(),
      upload_id: upload.id,
      client_request_id: upload.client_request_id,
    };
  }
  const domains = ['Homework', 'Grades'] as const;
  it.each(domains)(
    '%s binds exact composite question/parent/Student ancestry even under adversarial SQL',
    async (domain) => {
      const { claim } = await bound(domain);
      const foreign = fixture.parents[2],
        sameSchool = fixture.parents[1];
      const mutations: Array<Record<string, unknown>> =
        domain === 'Homework'
          ? [
              {
                question_id: foreign.homeworkQuestionId,
                homework_question_id: foreign.homeworkQuestionId,
              },
              {
                question_id: sameSchool.homeworkQuestionId,
                homework_question_id: sameSchool.homeworkQuestionId,
              },
              {
                context_id: sameSchool.homeworkTargetId,
                homework_target_id: sameSchool.homeworkTargetId,
              },
              { homework_assignment_id: sameSchool.homeworkAssignmentId },
              { student_id: sameSchool.studentId },
            ]
          : [
              {
                question_id: foreign.questionId,
                grade_question_id: foreign.questionId,
              },
              {
                question_id: sameSchool.questionId,
                grade_question_id: sameSchool.questionId,
              },
              {
                context_id: sameSchool.submissionId,
                grade_submission_id: sameSchool.submissionId,
              },
              { grade_assessment_id: sameSchool.assessmentId },
              { student_id: sameSchool.studentId },
            ];
      for (const mutation of mutations) {
        const input = {
          ...(await unconsumedIntent(claim.intentId)),
          ...mutation,
        };
        await expectSqlState(
          () =>
            prisma.$executeRaw`INSERT INTO assessment_answer_upload_intents SELECT (jsonb_populate_record(NULL::assessment_answer_upload_intents, ${JSON.stringify(input)}::jsonb)).*`,
          '23503',
        );
      }
    },
  );
  it.each(domains)(
    '%s retains immutable claim/creator and soft-deleted File history globally',
    async (domain) => {
      const { claim, asset, family, file } = await bound(domain);
      await expectSqlState(
        () =>
          prisma.$executeRaw`UPDATE assessment_answer_upload_intents SET question_id=${randomUUID()}::uuid WHERE id=${claim.intentId}::uuid`,
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw`DELETE FROM assessment_answer_upload_intents WHERE id=${claim.intentId}::uuid`,
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw`UPDATE assessment_answer_media_claims SET file_id=${randomUUID()}::uuid WHERE id=${claim.id}::uuid`,
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw`DELETE FROM assessment_answer_media_claims WHERE id=${claim.id}::uuid`,
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(
            Prisma.sql`UPDATE ${Prisma.raw(family.table)} SET created_by_user_id=${fixture.authorId}::uuid WHERE id=${asset.id}::uuid`,
          ),
        '23503',
      );
      await prisma.$executeRaw(
        Prisma.sql`UPDATE ${Prisma.raw(family.table)} SET deleted_at=CURRENT_TIMESTAMP WHERE id=${asset.id}::uuid`,
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(
            Prisma.sql`UPDATE ${Prisma.raw(family.table)} SET deleted_at=NULL WHERE id=${asset.id}::uuid`,
          ),
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(
            Prisma.sql`DELETE FROM ${Prisma.raw(family.table)} WHERE id=${asset.id}::uuid`,
          ),
        '23514',
      );
      expect(
        await fixture.asActor(
          'STUDENT',
          () =>
            prisma.$transaction((tx) => hasRetainedFileReferences(tx, file.id)),
          2,
        ),
      ).toBe(true);
      await expectSqlState(
        () => prisma.$executeRaw`DELETE FROM files WHERE id=${file.id}::uuid`,
        '23503',
      );
    },
  );
  it.each(domains)(
    '%s rejects malformed persisted response configuration and JSON null',
    async (domain) => {
      const parent = fixture.parents[0],
        table =
          domain === 'Homework'
            ? 'homework_questions'
            : 'grade_assessment_questions';
      const id =
        domain === 'Homework' ? parent.homeworkQuestionId : parent.questionId;
      for (const value of [
        null,
        { version: 2, mode: 'FILE_ONLY', maxFiles: 1 },
        { version: 1, mode: 'FILE_ONLY', maxFiles: 0 },
        { version: 1, mode: 'TEXT_ONLY', maxFiles: 1 },
        { version: 1, mode: 'FILE_ONLY', maxFiles: 1, nested: {} },
      ]) {
        await expectSqlState(
          () =>
            prisma.$executeRaw(
              Prisma.sql`UPDATE ${Prisma.raw(table)} SET response_config=${JSON.stringify(value)}::jsonb WHERE id=${id}::uuid`,
            ),
          '23514',
        );
      }
    },
  );
  it('proves global unique consumption and private invoker trigger inventory in PostgreSQL', async () => {
    const indexes = await prisma.$queryRaw<
      Array<{ definition: string }>
    >`SELECT indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND tablename='assessment_answer_media_claims'`;
    expect(
      indexes.some(
        (i) =>
          i.definition.includes('UNIQUE INDEX') &&
          i.definition.endsWith('(file_id)'),
      ),
    ).toBe(true);
    expect(
      indexes.some(
        (i) =>
          i.definition.includes('UNIQUE INDEX') &&
          i.definition.endsWith('(intent_id)'),
      ),
    ).toBe(true);
    const functions = await prisma.$queryRaw<
      Array<{
        name: string;
        definer: boolean;
        config: string[];
        publicExecute: boolean;
      }>
    >`
      SELECT p.proname AS name,p.prosecdef AS definer,p.proconfig AS config,
        EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname IN ('enforce_answer_media_append_only','enforce_answer_media_claim','enforce_answer_asset_claim')`;
    expect(functions).toHaveLength(3);
    for (const f of functions) {
      expect(f.definer).toBe(false);
      expect(f.config).toContain('search_path=pg_catalog');
      expect(f.publicExecute).toBe(false);
    }
  });
});
