import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES } from '../../src/modules/iam/reference-data/system-role-catalog';
import { applyCanonicalSystemRoles } from '../../src/modules/iam/reference-data/infrastructure/authorization-reference-data.apply';

export {
  SYSTEM_ROLES,
  TEACHER_PERMISSIONS,
} from '../../src/modules/iam/reference-data/system-role-catalog';

export async function seedSystemRoles(prisma: PrismaClient): Promise<void> {
  await applyCanonicalSystemRoles(prisma);
  console.log(`  ✔ seeded ${SYSTEM_ROLES.length} system roles`);
}
