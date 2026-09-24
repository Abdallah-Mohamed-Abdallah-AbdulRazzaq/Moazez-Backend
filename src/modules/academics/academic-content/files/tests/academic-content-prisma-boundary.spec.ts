import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('ACC-3C Prisma boundary', () => {
  it('keeps Prisma access and raw SQL out of application and cleanup worker code', () => {
    const application = join(__dirname, '../application');
    const sources = readdirSync(application)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(join(application, name), 'utf8'));
    sources.push(
      readFileSync(
        join(__dirname, '../infrastructure/academic-content-cleanup.worker.ts'),
        'utf8',
      ),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/repository\s*\.\s*prisma/u);
      expect(source).not.toMatch(/\$(?:queryRaw|executeRaw)/u);
      expect(source).not.toMatch(/PrismaService|Prisma\.TransactionClient/u);
    }
  });
});
