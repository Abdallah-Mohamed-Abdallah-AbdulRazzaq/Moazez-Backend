import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  classifyLegacyBrandingLogoValue,
  LegacyBrandingLogoValueClass,
} from '../../src/modules/settings/branding/domain/legacy-branding-logo-url';

interface ClassificationSummary {
  count: number;
  sanitizedExamples: string[];
}

export async function classifySchoolBrandingLogoValues(
  prisma: Pick<PrismaClient, 'schoolProfile'>,
): Promise<Record<LegacyBrandingLogoValueClass, ClassificationSummary>> {
  const rows = await prisma.schoolProfile.findMany({
    where: { logoUrl: { not: null } },
    select: { logoUrl: true },
  });
  const result: Record<LegacyBrandingLogoValueClass, ClassificationSummary> = {
    external_http_https: { count: 0, sanitizedExamples: [] },
    protected_files_download_route: { count: 0, sanitizedExamples: [] },
    signed_storage_url: { count: 0, sanitizedExamples: [] },
    raw_storage_key: { count: 0, sanitizedExamples: [] },
    invalid_url: { count: 0, sanitizedExamples: [] },
    other: { count: 0, sanitizedExamples: [] },
  };

  for (const row of rows) {
    if (!row.logoUrl) continue;
    const valueClass = classifyLegacyBrandingLogoValue(row.logoUrl);
    const summary = result[valueClass];
    summary.count += 1;
    const example = sanitizeExample(row.logoUrl, valueClass);
    if (
      summary.sanitizedExamples.length < 3 &&
      !summary.sanitizedExamples.includes(example)
    ) {
      summary.sanitizedExamples.push(example);
    }
  }
  return result;
}

function sanitizeExample(
  value: string,
  valueClass: LegacyBrandingLogoValueClass,
): string {
  switch (valueClass) {
    case 'external_http_https': {
      const parsed = new URL(value.trim());
      const segments = parsed.pathname.split('/').filter(Boolean).length;
      return `${parsed.protocol}//<external-host>/<${segments}-path-segments>`;
    }
    case 'protected_files_download_route':
      return 'https://<host>/api/v1/files/<id>/download';
    case 'signed_storage_url':
      return 'https://<host>/<object>?<signed-parameters-redacted>';
    case 'raw_storage_key':
      return '<raw-storage-key-redacted>';
    case 'invalid_url':
      return `<invalid-url-${lengthBand(value.length)}>`;
    case 'other':
      return `<other-value-${lengthBand(value.length)}>`;
  }
}

function lengthBand(length: number): string {
  if (length < 32) return 'short';
  if (length < 128) return 'medium';
  return 'long';
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const classification = await classifySchoolBrandingLogoValues(prisma);
    process.stdout.write(`${JSON.stringify(classification, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('DATA CLASSIFICATION: NOT EXECUTED\n');
    process.stderr.write('REASON: database unavailable or query failed\n');
    process.exitCode = 1;
  });
}
