import { PrismaClient } from '@prisma/client';
import { PERMISSION_CODES } from './01-permissions.seed';

type SystemRoleSeed = {
  key: string;
  name: string;
  description: string;
  permissions: string[];
};

const ALL = PERMISSION_CODES;

const COMMUNICATION_PLATFORM_PERMISSIONS = [
  'communication.platform.view',
  'communication.platform.manage',
];

const NON_PLATFORM = ALL.filter(
  (code) =>
    !code.startsWith('platform.') &&
    !COMMUNICATION_PLATFORM_PERMISSIONS.includes(code),
);

const SCHOOL_LEVEL = NON_PLATFORM;

const TEACHER_PERMISSIONS = [
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.curriculum.view',
  'academics.lesson_plans.view',
  'academics.timetable.view',
  'attendance.entries.manage',
  'attendance.sessions.manage',
  'attendance.sessions.submit',
  'attendance.sessions.view',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'files.uploads.manage',
  'grades.assessments.view',
  'grades.gradebook.view',
  'grades.items.manage',
  'grades.items.view',
  'grades.questions.view',
  'grades.submissions.review',
  'grades.submissions.view',
  'homework.assignments.manage',
  'homework.assignments.view',
  'homework.attachments.manage',
  'homework.attachments.view',
  'homework.grade_sync.manage',
  'homework.grade_sync.view',
  'homework.questions.manage',
  'homework.questions.view',
  'homework.submissions.review',
  'homework.submissions.view',
  'homework.targets.manage',
  'homework.targets.view',
  'reinforcement.reviews.manage',
  'reinforcement.reviews.view',
  'reinforcement.tasks.manage',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'students.records.view',
  'teacher.announcements.manage',
  'teacher.classroom.view',
  'teacher.classes.view',
  'teacher.home.view',
  'teacher.lesson_preparation.status.manage',
  'teacher.lesson_preparation.view',
  'teacher.profile.view',
  'teacher.settings.view',
];

const PARENT_PERMISSIONS = [
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.curriculum.view',
  'academics.lesson_plans.view',
  'academics.subjects.view',
  'academics.timetable.view',
  'attendance.absences.view',
  'attendance.sessions.view',
  'behavior.points.view',
  'behavior.records.view',
  'communication.announcements.read',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'discipline.timeline.view',
  'grades.assessments.view',
  'grades.gradebook.view',
  'grades.submissions.view',
  'homework.assignments.view',
  'homework.submissions.view',
  'parent.children.view',
  'parent.home.view',
  'parent.profile.view',
  'parent.progress.view',
  'parent.reports.view',
  'reinforcement.hero.badges.view',
  'reinforcement.hero.progress.view',
  'reinforcement.hero.view',
  'reinforcement.rewards.redemptions.view',
  'reinforcement.rewards.view',
  'reinforcement.submissions.view',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'students.enrollments.view',
  'students.records.view',
];

const STUDENT_PERMISSIONS = [
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.lesson_plans.view',
  'academics.subjects.view',
  'academics.timetable.view',
  'attendance.sessions.view',
  'behavior.points.view',
  'behavior.records.view',
  'communication.announcements.read',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.attachments.manage',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'discipline.timeline.view',
  'files.downloads.view',
  'files.uploads.manage',
  'grades.assessments.view',
  'grades.snapshots.view',
  'grades.submissions.save',
  'grades.submissions.start',
  'grades.submissions.submit',
  'grades.submissions.view',
  'homework.answers.manage',
  'homework.assignments.view',
  'homework.submission_attachments.manage',
  'homework.submissions.save',
  'homework.submissions.submit',
  'homework.submissions.view',
  'reinforcement.hero.badges.view',
  'reinforcement.hero.missions.complete',
  'reinforcement.hero.missions.start',
  'reinforcement.hero.objectives.complete',
  'reinforcement.hero.progress.view',
  'reinforcement.hero.view',
  'reinforcement.rewards.redemptions.request',
  'reinforcement.rewards.redemptions.view',
  'reinforcement.rewards.view',
  'reinforcement.submissions.submit',
  'reinforcement.submissions.view',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'student.home.view',
  'student.profile.avatar.manage',
  'student.profile.correction_requests.cancel',
  'student.profile.correction_requests.create',
  'student.profile.correction_requests.view',
  'student.profile.view',
  'student.progress.view',
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
      select: { id: true, code: true },
    });
    const foundPermissionIdsByCode = new Map(
      permissions.map((permission) => [permission.code, permission.id]),
    );
    const missingPermissions = role.permissions.filter(
      (code) => !foundPermissionIdsByCode.has(code),
    );

    if (missingPermissions.length > 0) {
      throw new Error(
        `Missing permissions for system role ${role.key}: ${missingPermissions.join(', ')}`,
      );
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });

    if (role.permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: role.permissions.map((code) => ({
          roleId: record.id,
          permissionId: foundPermissionIdsByCode.get(code)!,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`  ✔ seeded ${SYSTEM_ROLES.length} system roles`);
}
