import { PrismaClient } from '@prisma/client';
import {
  ProviderUrlAuditClient,
  auditPersistedProviderUrls,
  formatProviderUrlAuditResult,
} from '../../src/infrastructure/storage/provider-url-audit';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await auditPersistedProviderUrls(
      prisma as unknown as ProviderUrlAuditClient,
    );
    process.stdout.write(`${formatProviderUrlAuditResult(result)}\n`);
    if (result.status === 'FAIL') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('PROVIDER URL AUDIT: NOT EXECUTED\n');
    process.stderr.write(
      'REASON: database unavailable or bounded query failed\n',
    );
    process.exitCode = 1;
  });
}
