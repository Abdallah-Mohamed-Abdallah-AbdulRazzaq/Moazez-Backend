import { PrismaClient } from '@prisma/client';
import { seedPermissions } from './01-permissions.seed';
import { seedSystemRoles } from './02-system-roles.seed';
import { seedPlatformAdmin } from './03-platform-admin.seed';
import { seedDemoOrg } from './04-demo-org.seed';
import { seedDemoAcademics } from './05-demo-academics.seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const seedDemo = process.env.SEED_DEMO_DATA === 'true';

  console.log('-> seeding permissions');
  await seedPermissions(prisma);

  console.log('-> seeding system roles');
  await seedSystemRoles(prisma);

  console.log('-> seeding platform admin');
  await seedPlatformAdmin(prisma);

  if (seedDemo) {
    console.log('-> seeding demo organization (SEED_DEMO_DATA=true)');
    await seedDemoOrg(prisma);

    console.log('-> seeding demo academics baseline (SEED_DEMO_DATA=true)');
    await seedDemoAcademics(prisma);
  } else {
    console.log('-> skipping demo data (set SEED_DEMO_DATA=true to enable)');
  }

  await prisma.$disconnect();
  console.log('OK seed complete');
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
