import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const DEMO_ORG_SLUG = 'moazez-demo';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const DEMO_SCHOOL_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_SCHOOL_ADMIN_PASSWORD = 'School123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export async function seedDemoOrg(prisma: PrismaClient): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: { name: 'Moazez Demo Org', status: OrganizationStatus.ACTIVE },
    create: {
      slug: DEMO_ORG_SLUG,
      name: 'Moazez Demo Org',
      status: OrganizationStatus.ACTIVE,
    },
  });

  const school = await prisma.school.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: DEMO_SCHOOL_SLUG,
      },
    },
    update: { name: 'Moazez Academy', status: SchoolStatus.ACTIVE },
    create: {
      organizationId: organization.id,
      slug: DEMO_SCHOOL_SLUG,
      name: 'Moazez Academy',
      status: SchoolStatus.ACTIVE,
    },
  });

  const schoolAdminRole = await prisma.role.findFirst({
    where: { key: 'school_admin', schoolId: null, isSystem: true },
    select: { id: true },
  });

  if (!schoolAdminRole) {
    throw new Error(
      'school_admin system role not found. Run 02-system-roles.seed.ts first.',
    );
  }

  const passwordHash = await argon2.hash(
    DEMO_SCHOOL_ADMIN_PASSWORD,
    ARGON2_OPTIONS,
  );

  const adminUser = await prisma.user.upsert({
    where: { email: DEMO_SCHOOL_ADMIN_EMAIL },
    update: {
      firstName: 'Demo',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: DEMO_SCHOOL_ADMIN_EMAIL,
      firstName: 'Demo',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
  });

  const existingMembership = await prisma.membership.findFirst({
    where: {
      userId: adminUser.id,
      organizationId: organization.id,
      schoolId: school.id,
      roleId: schoolAdminRole.id,
    },
    select: { id: true },
  });

  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        userId: adminUser.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });
  } else {
    await prisma.membership.update({
      where: { id: existingMembership.id },
      data: {
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });
  }

  console.log(
    `  ✔ seeded demo org "${organization.name}" + school "${school.name}" + admin (${DEMO_SCHOOL_ADMIN_EMAIL})`,
  );
}
