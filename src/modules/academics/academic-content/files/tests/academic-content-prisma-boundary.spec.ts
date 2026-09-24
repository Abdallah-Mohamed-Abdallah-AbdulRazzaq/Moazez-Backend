import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts'))
      return [];
    return [readFileSync(path, 'utf8')];
  });
}

describe('ACC-3D Prisma boundary', () => {
  it('keeps Prisma clients, transactions, and raw SQL out of all ACC application code', () => {
    const sources = [
      ...productionSources(join(__dirname, '../../application')),
      ...productionSources(join(__dirname, '../application')),
      readFileSync(
        join(__dirname, '../infrastructure/academic-content-cleanup.worker.ts'),
        'utf8',
      ),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/repository\s*\.\s*prisma/u);
      expect(source).not.toMatch(/\$(?:queryRaw|executeRaw)/u);
      expect(source).not.toMatch(/PrismaService|Prisma\.TransactionClient/u);
      expect(source).not.toMatch(/\$transaction/u);
      expect(source).not.toMatch(/infrastructure\/database\/prisma\.service/u);
    }
  });
});
