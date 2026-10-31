import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { withSoftDeleted } from '../../src/common/context/request-context';
import {
  ASSET_FAMILIES,
  AssessmentAssetsFixture,
  expectSqlState,
} from '../fixtures/assessment-assets.fixture';

/** Structural tenant/source security only. Public binding and RBAC remain unimplemented. */
describe('ST-05 five-family asset database tenant boundary', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  let fixture: AssessmentAssetsFixture;
  let fileId: string;
  beforeAll(async () => {
    fixture = new AssessmentAssetsFixture(prisma); // rejects a shared/non-disposable target before DB access
    await prisma.$connect();
    await fixture.create();
  });
  beforeEach(async () => {
    fileId = (await fixture.file()).id;
  });
  afterEach(async () => {
    await fixture.resetAssets();
  });
  afterAll(async () => {
    if (fixture) await fixture.dispose();
    await prisma.$disconnect();
  });

  describe.each(ASSET_FAMILIES)('$model', (family) => {
    it('rejects a cross-school parent with a physical FK', async () => {
      await expectSqlState(
        () =>
          fixture.insert(family, {
            fileId,
            parentId: fixture.parents[2][family.key],
          }),
        '23503',
      );
    });
    it('rejects a different parent family even in the same school', async () => {
      const wrong =
        family.key === 'homeworkQuestionId'
          ? fixture.parents[0].answerId
          : fixture.parents[0].homeworkQuestionId;
      await expectSqlState(
        () => fixture.insert(family, { fileId, parentId: wrong }),
        '23503',
      );
    });
    it('rejects nonexistent and null parents', async () => {
      await expectSqlState(
        () => fixture.insert(family, { fileId, parentId: randomUUID() }),
        '23503',
      );
      await expectSqlState(
        () => fixture.insert(family, { fileId, parentId: null }),
        '23502',
      );
    });
    it('rejects cross-school and unscoped global Files', async () => {
      const foreign = await fixture.file(1),
        global = await fixture.file(0, { global: true });
      await expectSqlState(
        () => fixture.insert(family, { fileId: foreign.id }),
        '23503',
      );
      await expectSqlState(
        () => fixture.insert(family, { fileId: global.id }),
        '23503',
      );
    });
    it('rejects nonexistent and retired Files, including a new historical-looking row', async () => {
      const retired = await fixture.file(0, { retired: true });
      await expectSqlState(
        () => fixture.insert(family, { fileId: randomUUID() }),
        '23503',
      );
      await expectSqlState(
        () => fixture.insert(family, { fileId: retired.id }),
        '23503',
      );
      await expectSqlState(
        () =>
          fixture.insert(family, {
            fileId: retired.id,
            deletedAt: new Date('2020-01-01'),
          }),
        '23503',
      );
    });
    it('rejects null School, nonexistent creator, negative order and unknown source enum', async () => {
      await expectSqlState(
        () => fixture.insert(family, { fileId, schoolId: null }),
        '23502',
      );
      await expectSqlState(
        () => fixture.insert(family, { fileId, createdByUserId: randomUUID() }),
        '23503',
      );
      await expectSqlState(
        () => fixture.insert(family, { fileId, sortOrder: -1 }),
        '23514',
      );
      await expectSqlState(
        () =>
          fixture.insert(family, { fileId, sourceType: 'UNAPPROVED_SOURCE' }),
        '22P02',
      );
    });
    it('cannot coordinate School, parent and File reparenting', async () => {
      const row = await fixture.insert(family, { fileId }),
        foreign = await fixture.file(1);
      await expectSqlState(
        () =>
          prisma.$executeRaw(Prisma.sql`
        UPDATE public.${Prisma.raw(family.table)} SET school_id = ${fixture.parents[2].schoolId}::uuid,
          ${Prisma.raw(family.parentColumn)} = ${fixture.parents[2][family.key]}::uuid,
          file_id = ${foreign.id}::uuid WHERE id = ${row.id}::uuid`),
        '23514',
      );
      const [stored] = await prisma.$queryRaw<
        Array<{ schoolId: string; fileId: string }>
      >(Prisma.sql`
        SELECT school_id AS "schoolId", file_id AS "fileId" FROM public.${Prisma.raw(family.table)} WHERE id = ${row.id}::uuid`);
      expect(stored).toEqual({ schoolId: fixture.parents[0].schoolId, fileId });
    });
    it('keeps exact same-school parent, File and creation provenance immutable', async () => {
      const row = await fixture.insert(family, { fileId }),
        retired = await fixture.file(0, { retired: true });
      await expectSqlState(
        () =>
          prisma.$executeRaw(Prisma.sql`
        UPDATE public.${Prisma.raw(family.table)} SET ${Prisma.raw(family.parentColumn)} = ${fixture.parents[1][family.key]}::uuid WHERE id = ${row.id}::uuid`),
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(Prisma.sql`
        UPDATE public.${Prisma.raw(family.table)} SET file_id = ${retired.id}::uuid WHERE id = ${row.id}::uuid`),
        '23514',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(Prisma.sql`
        UPDATE public.${Prisma.raw(family.table)} SET created_by_user_id = ${fixture.parentId}::uuid WHERE id = ${row.id}::uuid`),
        // Claimed answer assets also enforce the immutable uploader/creator FK before the older identity trigger.
        family.dual ? '23514' : '23503',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(Prisma.sql`
        UPDATE public.${Prisma.raw(family.table)} SET id = ${randomUUID()}::uuid WHERE id = ${row.id}::uuid`),
        '23514',
      );
    });
    it('enforces tenant-scoped reads and soft-delete opt-in through actual Prisma', async () => {
      const own = await fixture.insert(family, { fileId }),
        foreignFile = await fixture.file(1);
      const foreign = await fixture.insert(family, {
        schoolId: fixture.parents[2].schoolId,
        parentId: fixture.parents[2][family.key],
        fileId: foreignFile.id,
      });
      const ids = [own.id, foreign.id];
      // This exercises the extension, not a future resource-binding permission.
      const seen = await fixture.asActor('STUDENT', () =>
        fixture.scopedRows(family, ids),
      );
      expect(seen.map((row) => row.id)).toEqual([own.id]);
      await prisma.$executeRaw(
        Prisma.sql`UPDATE public.${Prisma.raw(family.table)} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${own.id}::uuid`,
      );
      expect(
        await fixture.asActor('STUDENT', () => fixture.scopedRows(family, ids)),
      ).toEqual([]);
      const history = await fixture.asActor('STUDENT', () =>
        withSoftDeleted(() => fixture.scopedRows(family, ids)),
      );
      expect(history.map((row) => row.id)).toEqual([own.id]);
      expect(history[0].deletedAt).toBeInstanceOf(Date);
    });
    it('rejects an empty managed binding and unsupported source combinations', async () => {
      await expectSqlState(
        () => fixture.insert(family),
        family.dual ? '23514' : '23502',
      );
      if (family.dual) {
        await expectSqlState(
          () =>
            fixture.insert(family, {
              fileId,
              externalUrl: 'https://media.example.org/lesson.pdf',
            }),
          '23514',
        );
        await expectSqlState(
          () =>
            fixture.insert(family, {
              fileId,
              sourceType: 'EXTERNAL_HTTPS',
              externalUrl: 'https://media.example.org/lesson.pdf',
            }),
          '23514',
        );
        await expectSqlState(
          () => fixture.insert(family, { sourceType: 'EXTERNAL_HTTPS' }),
          '23514',
        );
      } else {
        await expectSqlState(
          () =>
            fixture.insert(family, { fileId, sourceType: 'EXTERNAL_HTTPS' }),
          '23514',
        );
      }
    });
    if (family.dual) {
      it('rejects signed/provider, unsafe and ambiguous external representations in PostgreSQL', async () => {
        for (const externalUrl of [
          'http://media.example.org/lesson',
          'https://user:secret@media.example.org/file',
          'https://storage.googleapis.com/private/object',
          'https://bucket.s3.amazonaws.com/key',
          'https://minio.example.org/key',
          'https://files.minio/key',
          'https://my-minio.example.org/key',
          'https://media.example.org/file?X-Amz-Signature=not-a-real-secret',
          'https://media.example.org/file?%58-Amz-Signature=value',
          'https://media.example.org/file#token',
          'https://127.0.0.1/file',
          'https://local.internal/file',
          'https://media.example.test/file',
          'https://media.example.org:443/file',
          'https://media.example.org/%61pi/v1/files/id/download',
          'https://media.example.org/api/v1/files/id/download',
          'https://media.example.org/file name',
          'https://media.example.org/' + 'x'.repeat(2000),
        ])
          await expectSqlState(
            () =>
              fixture.insert(family, {
                sourceType: 'EXTERNAL_HTTPS',
                externalUrl,
              }),
            externalUrl.length > 2000 ? '22001' : '23514',
          );
      });
    }
  });
});
