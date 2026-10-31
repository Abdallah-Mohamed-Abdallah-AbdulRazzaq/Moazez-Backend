import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';
import {
  AssessmentAssetsFixture,
  ASSET_FAMILIES,
} from '../fixtures/assessment-assets.fixture';

function removeOwnedMigrationDirectory(directory: string) {
  const absolute = resolve(directory);
  if (
    !absolute.startsWith(resolve(tmpdir()) + sep + 'moazez-st11-legacy-') ||
    realpathSync(directory) !== absolute
  )
    throw new Error('Unexpected owned migration directory');
  rmSync(directory, { recursive: true, force: true });
}

describe('ST11 real migration compatibility with unclaimed historical answer assets', () => {
  jest.setTimeout(180000);
  it('upgrades all 34 inherited migrations without changing legacy rows or File retention', async () => {
    const guard = (databaseUrl: string | undefined) =>
      assertDisposablePostgresTarget({
        databaseUrl,
        nodeEnv: process.env.NODE_ENV,
        universalRegressionMarker:
          process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
        localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
        errorMessage:
          'Legacy migration regression requires an owned disposable PostgreSQL target',
      });
    guard(process.env.DATABASE_URL);
    const url = new URL(process.env.DATABASE_URL!);
    const name =
      (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ? 'ci_'
        : 'g07_') + randomBytes(10).toString('hex');
    if (!/^(ci|g07)_[a-f0-9]{20}$/u.test(name))
      throw new Error('Unexpected owned database identity');
    url.pathname = '/' + name;
    guard(url.toString());
    const admin = new PrismaService();
    const options = {
      datasourceUrl: url.toString(),
      omit: {
        homeworkQuestion: { responseConfig: true },
        gradeAssessmentQuestion: { responseConfig: true },
        homeworkAnswerAsset: { answerMediaClaimId: true },
        gradeSubmissionAnswerAsset: { answerMediaClaimId: true },
      },
    };
    const legacy = new PrismaService(options);
    const directory = mkdtempSync(join(tmpdir(), 'moazez-st11-legacy-'));
    const migrationDir = join(directory, 'migrations');
    mkdirSync(migrationDir);
    const source = join(process.cwd(), 'prisma/migrations');
    const migrations = readdirSync(source)
      .filter((n) => /^\d{14}_[a-z0-9_]+$/u.test(n))
      .sort();
    expect(migrations[33]).toBe(
      '20261028184644_st10a_question_types_foundation',
    );
    copyFileSync(
      join(source, 'migration_lock.toml'),
      join(migrationDir, 'migration_lock.toml'),
    );
    const copy = (names: string[]) => {
      for (const n of names) {
        mkdirSync(join(migrationDir, n));
        copyFileSync(
          join(source, n, 'migration.sql'),
          join(migrationDir, n, 'migration.sql'),
        );
      }
    };
    const config = join(directory, 'prisma.config.cjs');
    writeFileSync(
      config,
      `const {defineConfig}=require(${JSON.stringify(join(process.cwd(), 'node_modules/prisma/config.js'))}); module.exports=defineConfig({schema:${JSON.stringify(join(process.cwd(), 'prisma/schema.prisma'))},migrations:{path:${JSON.stringify(migrationDir)}},datasource:{url:process.env.DATABASE_URL}});`,
    );
    const deploy = () => {
      try {
        execFileSync(
          process.execPath,
          [
            join(process.cwd(), 'node_modules/prisma/build/index.js'),
            'migrate',
            'deploy',
            '--config',
            config,
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, DATABASE_URL: url.toString() },
            stdio: 'pipe',
            windowsHide: true,
            timeout: 60000,
          },
        );
      } catch {
        throw new Error(
          'Owned legacy migration deploy failed; datasource details withheld',
        );
      }
    };
    let created = false;
    try {
      await admin.$executeRaw(
        Prisma.sql`CREATE DATABASE ${Prisma.raw('"' + name + '"')}`,
      );
      created = true;
      copy(migrations.slice(0, 34));
      deploy();
      const fixture = new AssessmentAssetsFixture(legacy);
      await fixture.create();
      const file = await fixture.file();
      const before: Array<{ table: string; id: string; row: unknown }> = [];
      // These are genuinely pre-ST11 inserts, not disabled constraints or fabricated claims.
      for (const family of ASSET_FAMILIES) {
        const id = randomUUID();
        await legacy.$executeRaw(Prisma.sql`INSERT INTO public.${Prisma.raw(family.table)}
          (id,school_id,${Prisma.raw(family.parentColumn)},file_id,source_type,category,created_by_user_id,updated_at)
          VALUES (${id}::uuid,${fixture.school.schoolId}::uuid,${fixture.parents[0][family.key]}::uuid,${file.id}::uuid,'MANAGED_FILE','DOCUMENT',${fixture.authorId}::uuid,CURRENT_TIMESTAMP)`);
        const [row] = await legacy.$queryRaw<Array<{ data: unknown }>>(
          Prisma.sql`SELECT to_jsonb(x) AS data FROM public.${Prisma.raw(family.table)} x WHERE id=${id}::uuid`,
        );
        before.push({ table: family.table, id, row: row.data });
      }
      copy(migrations.slice(34));
      deploy();
      for (const row of before) {
        const [current] = await legacy.$queryRaw<Array<{ data: unknown }>>(
          Prisma.sql`SELECT to_jsonb(x)-'answer_media_claim_id' AS data FROM public.${Prisma.raw(row.table)} x WHERE id=${row.id}::uuid`,
        );
        expect(current.data).toEqual(row.row);
      }
      const [counts] = await legacy.$queryRaw<
        Array<{
          claims: number;
          intents: number;
          homeworkNull: boolean;
          gradeNull: boolean;
        }>
      >`
        SELECT (SELECT count(*)::int FROM assessment_answer_media_claims) AS claims,
          (SELECT count(*)::int FROM assessment_answer_upload_intents) AS intents,
          (SELECT response_config IS NULL FROM homework_questions WHERE id=${fixture.parents[0].homeworkQuestionId}::uuid) AS "homeworkNull",
          (SELECT response_config IS NULL FROM grade_assessment_questions WHERE id=${fixture.parents[0].questionId}::uuid) AS "gradeNull"`;
      expect(counts).toEqual({
        claims: 0,
        intents: 0,
        homeworkNull: true,
        gradeNull: true,
      });
      expect(
        await legacy.$transaction((tx) =>
          hasRetainedFileReferences(tx, file.id),
        ),
      ).toBe(true);
      const history = await legacy.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      expect(history[0].count).toBe(migrations.length);
      deploy();
      expect(
        await legacy.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      ).toEqual(history);
    } finally {
      await legacy.$disconnect();
      if (created)
        await admin.$executeRaw(
          Prisma.sql`DROP DATABASE ${Prisma.raw('"' + name + '"')}`,
        );
      await admin.$disconnect();
      removeOwnedMigrationDirectory(directory);
    }
  });
});
