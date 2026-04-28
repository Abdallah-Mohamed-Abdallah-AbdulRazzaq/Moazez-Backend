import { PrismaClient } from '@prisma/client';

type PermissionSeed = {
  code: string;
  module: string;
  resource: string;
  action: string;
  description: string;
};

const PERMISSIONS: PermissionSeed[] = [
  // settings
  { code: 'settings.overview.view', module: 'settings', resource: 'overview', action: 'view', description: 'View settings overview metrics and recent audit activity' },
  { code: 'settings.users.view', module: 'settings', resource: 'users', action: 'view', description: 'View users in the school' },
  { code: 'settings.users.manage', module: 'settings', resource: 'users', action: 'manage', description: 'Invite, update, disable users' },
  { code: 'settings.roles.view', module: 'settings', resource: 'roles', action: 'view', description: 'View roles and their permissions' },
  { code: 'settings.roles.manage', module: 'settings', resource: 'roles', action: 'manage', description: 'Create and edit custom roles' },
  { code: 'settings.branding.view', module: 'settings', resource: 'branding', action: 'view', description: 'View school branding configuration' },
  { code: 'settings.branding.manage', module: 'settings', resource: 'branding', action: 'manage', description: 'Manage school branding configuration' },
  { code: 'settings.security.view', module: 'settings', resource: 'security', action: 'view', description: 'View security settings' },
  { code: 'settings.security.manage', module: 'settings', resource: 'security', action: 'manage', description: 'Manage security settings' },

  // admissions
  { code: 'admissions.leads.view', module: 'admissions', resource: 'leads', action: 'view', description: 'View admissions leads' },
  { code: 'admissions.leads.manage', module: 'admissions', resource: 'leads', action: 'manage', description: 'Create and update admissions leads' },
  { code: 'admissions.applications.view', module: 'admissions', resource: 'applications', action: 'view', description: 'View admission applications' },
  { code: 'admissions.applications.manage', module: 'admissions', resource: 'applications', action: 'manage', description: 'Create and update admission applications' },
  { code: 'admissions.documents.view', module: 'admissions', resource: 'documents', action: 'view', description: 'View admissions application documents' },
  { code: 'admissions.documents.manage', module: 'admissions', resource: 'documents', action: 'manage', description: 'Manage admissions application documents' },
  { code: 'admissions.tests.view', module: 'admissions', resource: 'tests', action: 'view', description: 'View admissions placement tests' },
  { code: 'admissions.tests.manage', module: 'admissions', resource: 'tests', action: 'manage', description: 'Schedule and update admissions placement tests' },
  { code: 'admissions.interviews.view', module: 'admissions', resource: 'interviews', action: 'view', description: 'View admissions interviews' },
  { code: 'admissions.interviews.manage', module: 'admissions', resource: 'interviews', action: 'manage', description: 'Schedule and update admissions interviews' },
  { code: 'admissions.decisions.view', module: 'admissions', resource: 'decisions', action: 'view', description: 'View admissions decisions' },
  { code: 'admissions.decisions.manage', module: 'admissions', resource: 'decisions', action: 'manage', description: 'Record admission decisions' },

  // academics
  { code: 'academics.structure.view', module: 'academics', resource: 'structure', action: 'view', description: 'View academic structure (grades, sections, classrooms)' },
  { code: 'academics.structure.manage', module: 'academics', resource: 'structure', action: 'manage', description: 'Manage academic structure' },
  { code: 'academics.subjects.view', module: 'academics', resource: 'subjects', action: 'view', description: 'View subjects' },
  { code: 'academics.subjects.manage', module: 'academics', resource: 'subjects', action: 'manage', description: 'Manage subjects' },

  // attendance
  { code: 'attendance.policies.view', module: 'attendance', resource: 'policies', action: 'view', description: 'View attendance policies' },
  { code: 'attendance.policies.manage', module: 'attendance', resource: 'policies', action: 'manage', description: 'Create and update attendance policies' },
  { code: 'attendance.sessions.view', module: 'attendance', resource: 'sessions', action: 'view', description: 'View attendance sessions' },
  { code: 'attendance.sessions.manage', module: 'attendance', resource: 'sessions', action: 'manage', description: 'Create and update attendance sessions' },
  { code: 'attendance.sessions.submit', module: 'attendance', resource: 'sessions', action: 'submit', description: 'Submit or update attendance sessions' },
  { code: 'attendance.entries.manage', module: 'attendance', resource: 'entries', action: 'manage', description: 'Create and update attendance entries' },
  { code: 'attendance.absences.view', module: 'attendance', resource: 'absences', action: 'view', description: 'View derived attendance absences' },
  { code: 'attendance.excuses.view', module: 'attendance', resource: 'excuses', action: 'view', description: 'View attendance excuse requests' },
  { code: 'attendance.excuses.manage', module: 'attendance', resource: 'excuses', action: 'manage', description: 'Create and update attendance excuse requests' },
  { code: 'attendance.excuses.review', module: 'attendance', resource: 'excuses', action: 'review', description: 'Approve or reject attendance excuse requests' },
  { code: 'attendance.reports.view', module: 'attendance', resource: 'reports', action: 'view', description: 'View attendance reports' },

  // grades
  { code: 'grades.assessments.view', module: 'grades', resource: 'assessments', action: 'view', description: 'View assessments' },
  { code: 'grades.assessments.manage', module: 'grades', resource: 'assessments', action: 'manage', description: 'Create and update assessments' },
  { code: 'grades.assessments.publish', module: 'grades', resource: 'assessments', action: 'publish', description: 'Publish assessments for grade entry' },
  { code: 'grades.assessments.approve', module: 'grades', resource: 'assessments', action: 'approve', description: 'Approve published assessments' },
  { code: 'grades.assessments.lock', module: 'grades', resource: 'assessments', action: 'lock', description: 'Lock approved assessments' },
  { code: 'grades.questions.view', module: 'grades', resource: 'questions', action: 'view', description: 'View assessment questions' },
  { code: 'grades.questions.manage', module: 'grades', resource: 'questions', action: 'manage', description: 'Create and update assessment questions' },
  { code: 'grades.submissions.view', module: 'grades', resource: 'submissions', action: 'view', description: 'View question-based assessment submissions' },
  { code: 'grades.submissions.submit', module: 'grades', resource: 'submissions', action: 'submit', description: 'Submit answers for question-based assessments' },
  { code: 'grades.submissions.review', module: 'grades', resource: 'submissions', action: 'review', description: 'Review and correct question-based assessment submissions' },
  { code: 'grades.items.view', module: 'grades', resource: 'items', action: 'view', description: 'View grade items' },
  { code: 'grades.items.manage', module: 'grades', resource: 'items', action: 'manage', description: 'Enter and update grade items' },
  { code: 'grades.gradebook.view', module: 'grades', resource: 'gradebook', action: 'view', description: 'View gradebook data' },
  { code: 'grades.rules.view', module: 'grades', resource: 'rules', action: 'view', description: 'View grading rules' },
  { code: 'grades.rules.manage', module: 'grades', resource: 'rules', action: 'manage', description: 'Create and update grading rules' },
  { code: 'grades.analytics.view', module: 'grades', resource: 'analytics', action: 'view', description: 'View grades analytics' },
  { code: 'grades.snapshots.view', module: 'grades', resource: 'snapshots', action: 'view', description: 'View student grade snapshots' },

  // reinforcement
  { code: 'reinforcement.tasks.view', module: 'reinforcement', resource: 'tasks', action: 'view', description: 'View reinforcement tasks' },
  { code: 'reinforcement.tasks.manage', module: 'reinforcement', resource: 'tasks', action: 'manage', description: 'Create and update reinforcement tasks' },
  { code: 'reinforcement.reviews.manage', module: 'reinforcement', resource: 'reviews', action: 'manage', description: 'Approve or reject reinforcement submissions' },

  // communication
  { code: 'communication.messages.view', module: 'communication', resource: 'messages', action: 'view', description: 'View chat messages' },
  { code: 'communication.messages.send', module: 'communication', resource: 'messages', action: 'send', description: 'Send chat messages' },
  { code: 'communication.announcements.view', module: 'communication', resource: 'announcements', action: 'view', description: 'View announcements' },
  { code: 'communication.announcements.manage', module: 'communication', resource: 'announcements', action: 'manage', description: 'Publish announcements' },

  // files
  { code: 'files.uploads.manage', module: 'files', resource: 'uploads', action: 'manage', description: 'Upload and manage files' },
  { code: 'files.downloads.view', module: 'files', resource: 'downloads', action: 'view', description: 'Download private files through the secure files endpoint' },
  { code: 'files.imports.manage', module: 'files', resource: 'imports', action: 'manage', description: 'Create file import jobs' },
  { code: 'files.imports.view', module: 'files', resource: 'imports', action: 'view', description: 'View import job status and validation reports' },

  // students
  { code: 'students.records.view', module: 'students', resource: 'records', action: 'view', description: 'View student records' },
  { code: 'students.records.manage', module: 'students', resource: 'records', action: 'manage', description: 'Manage student records' },
  { code: 'students.guardians.view', module: 'students', resource: 'guardians', action: 'view', description: 'View guardian records linked to students' },
  { code: 'students.guardians.manage', module: 'students', resource: 'guardians', action: 'manage', description: 'Manage guardian records linked to students' },
  { code: 'students.enrollments.view', module: 'students', resource: 'enrollments', action: 'view', description: 'View student enrollment records' },
  { code: 'students.enrollments.manage', module: 'students', resource: 'enrollments', action: 'manage', description: 'Manage student enrollment records and placements' },
  { code: 'students.documents.view', module: 'students', resource: 'documents', action: 'view', description: 'View student document records' },
  { code: 'students.documents.manage', module: 'students', resource: 'documents', action: 'manage', description: 'Manage student document records' },
  { code: 'students.medical.view', module: 'students', resource: 'medical', action: 'view', description: 'View student medical profiles' },
  { code: 'students.medical.manage', module: 'students', resource: 'medical', action: 'manage', description: 'Manage student medical profiles' },
  { code: 'students.notes.view', module: 'students', resource: 'notes', action: 'view', description: 'View student notes' },
  { code: 'students.notes.manage', module: 'students', resource: 'notes', action: 'manage', description: 'Manage student notes' },
  { code: 'students.lifecycle.manage', module: 'students', resource: 'lifecycle', action: 'manage', description: 'Manage student lifecycle actions such as transfers and withdrawals' },

  // dashboard
  { code: 'dashboard.summary.view', module: 'dashboard', resource: 'summary', action: 'view', description: 'View dashboard summary KPIs' },
];

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }
  console.log(`  ✔ seeded ${PERMISSIONS.length} permissions`);
}

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);
