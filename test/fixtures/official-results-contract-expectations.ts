export const officialResultsTeacherPermissions = [
  'official_results.templates.view',
  'official_results.designs.manage',
  'official_results.sheets.view',
  'official_results.sheets.create',
  'official_results.entries.manage',
  'official_results.imports.view',
  'official_results.imports.manage',
  'official_results.exports.create',
  'official_results.reviews.submit',
  'official_results.corrections.request',
  'official_results.history.view',
  'official_results.results.view',
] as const;

export const officialResultsFamilyPermissions = [
  'official_results.results.view',
] as const;

export const officialResultsPermissionCatalog = [
  ...officialResultsTeacherPermissions,
  'official_results.policies.view',
  'official_results.policies.manage',
  'official_results.periods.manage',
  'official_results.groups.manage',
  'official_results.templates.manage',
  'official_results.designs.approve',
  'official_results.scopes.manage',
  'official_results.grants.manage',
  'official_results.rosters.manage',
  'official_results.reviews.approve',
  'official_results.publications.publish',
  'official_results.publications.correct',
  'official_results.publications.revoke',
  'official_results.aggregates.manage',
  'official_results.archives.manage',
] as const;

export const officialResultsStudentRoutes = [
  'GET /api/v1/student/official-results/periods',
  'GET /api/v1/student/official-results/periods/:reportingPeriodId/result',
  'GET /api/v1/student/official-results/periods/:reportingPeriodId/groups/:groupId',
  'GET /api/v1/student/official-results/periods/:reportingPeriodId/history',
  'GET /api/v1/student/official-results/publications/:publicationId',
] as const;

export const officialResultsParentRoutes = officialResultsStudentRoutes.map(
  (route) => route.replace('/student/', '/parent/children/:studentId/'),
);
