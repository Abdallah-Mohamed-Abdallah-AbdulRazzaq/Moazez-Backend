import { PrismaClient, UserStatus, UserType } from '@prisma/client';
import * as argon2 from 'argon2';

const PLATFORM_ADMIN_EMAIL = 'admin@moazez.dev';
const PLATFORM_ADMIN_PASSWORD = 'Admin123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export async function seedPlatformAdmin(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(PLATFORM_ADMIN_PASSWORD, ARGON2_OPTIONS);

  await prisma.user.upsert({
    where: { email: PLATFORM_ADMIN_EMAIL },
    update: {
      firstName: 'Platform',
      lastName: 'Admin',
      userType: UserType.PLATFORM_USER,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: PLATFORM_ADMIN_EMAIL,
      firstName: 'Platform',
      lastName: 'Admin',
      userType: UserType.PLATFORM_USER,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
  });

  console.log(`  ✔ seeded platform admin (${PLATFORM_ADMIN_EMAIL})`);
}
