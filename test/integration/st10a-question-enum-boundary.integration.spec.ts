import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { HomeworkQuestionAssetsFixture } from '../fixtures/homework-question-assets.fixture';
import { HOMEWORK_RUNTIME_QUESTION_TYPES } from '../../src/modules/homework/domain/homework-runtime-types';
import { GRADE_RUNTIME_QUESTION_TYPES } from '../../src/modules/grades/assessments/domain/grade-runtime-types';

describe('ST10-A immutable enum catalogs with authorized ST10-B runtime activation', () => {
  const prisma = new PrismaService();
  beforeAll(async () => {
    new HomeworkQuestionAssetsFixture(prisma); // refuses shared or Production targets before connect
    await prisma.$connect();
  });
  afterAll(() => prisma.$disconnect());
  it('preserves both eleven-value catalogs and activates their explicit declared runtime types', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ typname: string; enumlabel: string }>
    >`SELECT t.typname,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('homework_question_type','grade_question_type') ORDER BY t.typname,e.enumsortorder`;
    for (const [name, active] of [
      ['homework_question_type', HOMEWORK_RUNTIME_QUESTION_TYPES],
      ['grade_question_type', GRADE_RUNTIME_QUESTION_TYPES],
    ] as const) {
      expect(active).toHaveLength(11);
      expect(
        rows.filter((row) => row.typname === name).map((row) => row.enumlabel),
      ).toEqual([...active]);
    }
    const failed = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
    expect(failed[0].count).toBe(0n);
  });
});
