import { PrismaClient } from '@prisma/client';
import { PERMISSION_CODES } from './01-permissions.seed';

type SystemRoleSeed = {
  key: string;
  name: string;
  description: string;
  permissions: string[];
};

const ALL = PERMISSION_CODES;

const NON_PLATFORM = ALL;

const SCHOOL_LEVEL = ALL;

const TEACHER_PERMISSIONS = [
  'attendance.sessions.view',
  'attendance.sessions.manage',
  'attendance.sessions.submit',
  'attendance.entries.manage',
  'grades.assessments.view',
  'grades.assessments.manage',
  'grades.questions.view',
  'grades.questions.manage',
  'grades.submissions.view',
  'grades.submissions.review',
  'grades.items.view',
  'grades.items.manage',
  'grades.gradebook.view',
  'grades.analytics.view',
  'grades.snapshots.view',
  'reinforcement.tasks.view',
  'reinforcement.tasks.manage',
  'reinforcement.templates.view',
  'reinforcement.reviews.view',
  'reinforcement.reviews.manage',
  'reinforcement.xp.view',
  'reinforcement.hero.view',
  'reinforcement.hero.progress.view',
  'reinforcement.rewards.view',
  'reinforcement.rewards.redemptions.view',
  'reinforcement.rewards.redemptions.request',
  'behavior.overview.view',
  'behavior.categories.view',
  'behavior.records.view',
  'behavior.records.create',
  'behavior.points.view',
  'communication.messages.view',
  'communication.messages.send',
  'communication.announcements.view',
  'students.records.view',
  'files.uploads.manage',
  'dashboard.summary.view',
];

const PARENT_PERMISSIONS = [
  'attendance.sessions.view',
  'grades.assessments.view',
  'reinforcement.tasks.view',
  'communication.messages.view',
  'communication.messages.send',
  'communication.announcements.view',
  'students.records.view',
];

const STUDENT_PERMISSIONS = [
  'attendance.sessions.view',
  'grades.assessments.view',
  'reinforcement.tasks.view',
  'communication.messages.view',
  'communication.announcements.view',
  'students.records.view',
];

const SYSTEM_ROLES: SystemRoleSeed[] = [
  {
    key: 'platform_super_admin',
    name: 'Platform Super Admin',
    description: 'Full platform-level access across all organizations and schools',
    permissions: ALL,
  },
  {
    key: 'organization_admin',
    name: 'Organization Admin',
    description: 'Full access across the organization and its schools',
    permissions: NON_PLATFORM,
  },
  {
    key: 'school_admin',
    name: 'School Admin',
    description: 'Full access within a single school',
    permissions: SCHOOL_LEVEL,
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Classroom-level access for attendance, grades, and reinforcement',
    permissions: TEACHER_PERMISSIONS,
  },
  {
    key: 'parent',
    name: 'Parent',
    description: 'Read access to linked children and communication with the school',
    permissions: PARENT_PERMISSIONS,
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Read access to own academic data',
    permissions: STUDENT_PERMISSIONS,
  },
];

export async function seedSystemRoles(prisma: PrismaClient): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { key: role.key, schoolId: null, isSystem: true },
      select: { id: true },
    });

    const record = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: role.name,
            description: role.description,
          },
        })
      : await prisma.role.create({
          data: {
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: true,
            schoolId: null,
          },
        });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: role.permissions } },
      select: { id: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: record.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`  ✔ seeded ${SYSTEM_ROLES.length} system roles`);
}
