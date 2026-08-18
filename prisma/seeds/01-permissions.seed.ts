import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../../src/modules/iam/reference-data/permission-catalog';
import { applyCanonicalPermissions } from '../../src/modules/iam/reference-data/infrastructure/authorization-reference-data.apply';

export { PERMISSION_CODES } from '../../src/modules/iam/reference-data/permission-catalog';

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  await applyCanonicalPermissions(prisma);
  console.log(`  ✔ seeded ${PERMISSIONS.length} permissions`);
}
