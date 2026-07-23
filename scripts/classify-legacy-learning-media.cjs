'use strict';

const { PrismaClient } = require('@prisma/client');

function sanitizeLegacyName(value) {
  const basename = String(value).split(/[\\/]/u).at(-1) ?? '';
  const sanitized = basename.replace(/\p{Cc}/gu, '').trim();
  const length = Array.from(sanitized).length;
  if (length === 0 || length > 255) throw new Error('invalid_original_name');
  return sanitized;
}

async function classify(prisma) {
  const files = await prisma.file.findMany({
    where: { lessonContentItems: { some: {} } },
    select: {
      id: true,
      organizationId: true,
      schoolId: true,
      uploaderId: true,
      originalName: true,
    },
  });
  for (const file of files) {
    if (!file.organizationId || !file.schoolId || !file.uploaderId) {
      throw new Error('legacy_learning_media_missing_ownership');
    }
    sanitizeLegacyName(file.originalName);
  }
  return { referencedFiles: files.length, valid: true };
}

module.exports = { classify, sanitizeLegacyName };

if (require.main === module) {
  const prisma = new PrismaClient();
  classify(prisma)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'classification_failed'}\n`,
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
