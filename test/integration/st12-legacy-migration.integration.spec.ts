import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AssessmentAssetsFixture } from '../fixtures/assessment-assets.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

describe('ST12 upgrades the 38-migration historical baseline without disclosure or mark changes', () => {
  jest.setTimeout(180000);
  it('preserves corrected/synchronized rows and leaves all new review state absent/default-denied', async () => {
    const guard = (databaseUrl: string | undefined) =>
      assertDisposablePostgresTarget({
        databaseUrl,
        nodeEnv: process.env.NODE_ENV,
        universalRegressionMarker:
          process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
        localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
        errorMessage:
          'Historical ST12 replay requires an owned disposable database',
      });
    guard(process.env.DATABASE_URL);
    const url = new URL(process.env.DATABASE_URL!);
    const name =
      (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ? 'ci_'
        : 'g07_') + randomBytes(10).toString('hex');
    if (!/^(ci|g07)_[0-9a-f]{20}$/u.test(name))
      throw new Error('Unexpected owned database name');
    url.pathname = '/' + name;
    guard(url.toString());
    const admin = new PrismaService(),
      legacy = new PrismaService({ datasourceUrl: url.toString() });
    const directory = mkdtempSync(join(tmpdir(), 'moazez-st12-legacy-')),
      migrationsDir = join(directory, 'migrations');
    mkdirSync(migrationsDir);
    const source = join(process.cwd(), 'prisma/migrations');
    const migrations = readdirSync(source)
      .filter((name) => /^\d{14}_[a-z0-9_]+$/u.test(name))
      .sort();
    expect(migrations[37]).toBe(
      '20261030163220_st11b_multipart_question_groups',
    );
    expect(migrations[38]).toBe(
      '20261031120322_st12_grades_review_release_scoring',
    );
    copyFileSync(
      join(source, 'migration_lock.toml'),
      join(migrationsDir, 'migration_lock.toml'),
    );
    const copy = (names: string[]) => {
      for (const migration of names) {
        mkdirSync(join(migrationsDir, migration));
        copyFileSync(
          join(source, migration, 'migration.sql'),
          join(migrationsDir, migration, 'migration.sql'),
        );
      }
    };
    const config = join(directory, 'prisma.config.cjs');
    writeFileSync(
      config,
      'const {defineConfig}=require(' +
        JSON.stringify(join(process.cwd(), 'node_modules/prisma/config.js')) +
        '); module.exports=defineConfig({schema:' +
        JSON.stringify(join(process.cwd(), 'prisma/schema.prisma')) +
        ',migrations:{path:' +
        JSON.stringify(migrationsDir) +
        '},datasource:{url:process.env.DATABASE_URL}});',
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
            windowsHide: true,
            stdio: 'pipe',
            timeout: 60000,
          },
        );
      } catch {
        throw new Error(
          'Owned ST12 historical deploy failed; datasource details withheld',
        );
      }
    };
    let created = false;
    try {
      await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
      created = true;
      copy(migrations.slice(0, 38));
      deploy();
      const fixture = new AssessmentAssetsFixture(legacy);
      await fixture.create();
      const parent = fixture.parents[0],
        now = new Date();
      await legacy.gradeSubmissionAnswer.update({
        where: { id: parent.answerId },
        data: {
          awardedPoints: 1.25,
          correctionStatus: 'CORRECTED',
          reviewedById: fixture.authorId,
          reviewedAt: now,
          reviewerComment: 'Historical private correction',
        },
      });
      await legacy.gradeSubmission.update({
        where: { id: parent.submissionId },
        data: {
          status: 'CORRECTED',
          correctedAt: now,
          reviewedById: fixture.authorId,
          totalScore: 1.25,
          maxScore: 2,
        },
      });
      await legacy.gradeItem.create({
        data: {
          schoolId: parent.schoolId,
          termId: fixture.school.termId,
          assessmentId: parent.assessmentId,
          studentId: parent.studentId,
          enrollmentId: null,
          score: 1.25,
          status: 'ENTERED',
          enteredById: fixture.authorId,
          enteredAt: now,
        },
      });
      const tables = [
        'grade_assessments',
        'grade_submission_answers',
        'grade_submissions',
        'grade_items',
      ] as const;
      const snapshot = async () =>
        Promise.all(
          tables.map((table) =>
            legacy.$queryRawUnsafe(
              'SELECT to_jsonb(x) AS data FROM "' +
                table +
                '" x WHERE school_id=$1::uuid ORDER BY id',
              parent.schoolId,
            ),
          ),
        );
      const before = await snapshot();
      copy(migrations.slice(38));
      deploy();
      expect(await snapshot()).toEqual(before);
      expect(await legacy.gradeReviewReleasePolicy.count()).toBe(0);
      expect(await legacy.gradeQuestionKeyApproval.count()).toBe(0);
      expect(await legacy.gradeScoringSuggestion.count()).toBe(0);
      expect(
        (
          await legacy.gradeItem.findFirstOrThrow({
            where: { assessmentId: parent.assessmentId },
          })
        ).enrollmentId,
      ).toBeNull();
      const history = await legacy.$queryRawUnsafe<Array<{ count: number }>>(
        'SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      expect(history[0].count).toBe(migrations.length);
      deploy();
      expect(
        await legacy.$queryRawUnsafe(
          'SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        ),
      ).toEqual(history);
    } finally {
      await legacy.$disconnect();
      if (created)
        await admin.$executeRawUnsafe('DROP DATABASE "' + name + '"');
      await admin.$disconnect();
      const absolute = resolve(directory),
        prefix = resolve(tmpdir()) + sep + 'moazez-st12-legacy-';
      const ownedPath =
        absolute.startsWith(prefix) && realpathSync(directory) === absolute;
      expect(ownedPath).toBe(true);
      if (ownedPath) rmSync(directory, { recursive: true, force: true });
    }
  });
});
