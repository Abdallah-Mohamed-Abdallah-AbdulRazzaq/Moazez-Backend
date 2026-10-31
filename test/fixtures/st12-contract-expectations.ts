import { PERMISSION_CODES } from '../../src/modules/iam/reference-data/permission-catalog';
import { SYSTEM_ROLES } from '../../src/modules/iam/reference-data/system-role-catalog';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { NotFoundDomainException } from '../../src/common/exceptions/domain-exception';
import { TeacherGradeAuthoringController } from '../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring.controller';
import { TeacherGradeAuthoringUploadsController } from '../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring-uploads.controller';
import { TeacherGradeAuthoringAssessmentAssetsController } from '../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring-assessment-assets.controller';
import { TeacherGradeAuthoringQuestionAssetsController } from '../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring-question-assets.controller';
import { TeacherGradeAuthoringGroupsController } from '../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring-groups.controller';
import { TeacherGradeScoringController } from '../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-scoring.controller';
import { StudentGradeReviewController } from '../../src/modules/student-app/grades/controller/student-grade-review.controller';
import { StudentExamReviewController } from '../../src/modules/student-app/grades/controller/student-exam-review.controller';
import { ParentGradeReviewController } from '../../src/modules/parent-app/grades/controller/parent-grade-review.controller';

/** Fixed ST12 additions, reviewed against ADR-0025. Never derived from the route graph under test. */
const authoring =
  'teacher/classroom/:classId/grades/assessments/:assessmentId/authoring';
type Route = {
  method: string;
  path: string;
  controller: string;
  handler: string;
  permissions: string[];
};
const family = (
  controller: string,
  prefix: string,
  definitions: string[][],
  permission = 'grades.teacher_authoring.manage',
): Route[] =>
  definitions.map(([method, suffix, handler]) => ({
    method,
    path: '/api/v1/' + prefix + (suffix ? '/' + suffix : ''),
    controller,
    handler,
    permissions: [permission],
  }));
const assets = [
  ['GET', '', 'list'],
  ['GET', ':assetId', 'get'],
  ['POST', '', 'create'],
  ['PATCH', ':assetId', 'update'],
  ['PATCH', ':assetId/reorder', 'reorder'],
  ['DELETE', ':assetId', 'remove'],
  ['GET', ':assetId/preview', 'getPreview'],
  ['HEAD', ':assetId/preview', 'headPreview'],
  ['GET', ':assetId/download', 'getDownload'],
  ['HEAD', ':assetId/download', 'headDownload'],
];
// Every authoring method requires the exact allocation/creator/DRAFT/no-attempt boundary;
// scoring uses the existing scoped reviewer permission and never implicitly applies marks.
export const ST12_TEACHER_CONTRACTS: Route[] = [
  ...family('TeacherGradeAuthoringController', authoring, [
    ['GET', 'questions', 'list'],
    ['POST', 'questions', 'create'],
    ['PUT', 'questions/reorder', 'reorder'],
    ['PUT', 'questions/points', 'points'],
    ['PATCH', 'questions/:questionId', 'update'],
    ['DELETE', 'questions/:questionId', 'remove'],
  ]),
  ...family('TeacherGradeAuthoringUploadsController', authoring + '/uploads', [
    ['POST', '', 'create'],
    ['GET', ':uploadId', 'status'],
    ['POST', ':uploadId/complete', 'complete'],
    ['POST', ':uploadId/cancel', 'cancel'],
  ]),
  ...family(
    'TeacherGradeAuthoringAssessmentAssetsController',
    authoring + '/assets',
    assets,
  ),
  ...family(
    'TeacherGradeAuthoringQuestionAssetsController',
    authoring + '/questions/:questionId/assets',
    assets,
  ),
  ...family('TeacherGradeAuthoringGroupsController', authoring, [
    ['GET', 'groups', 'list'],
    ['POST', 'groups', 'create'],
    ['PUT', 'groups/layout', 'layout'],
    ['PATCH', 'groups/:groupId', 'update'],
    ['DELETE', 'groups/:groupId', 'remove'],
    ['POST', 'groups/:groupId/assets', 'createAsset'],
    ['PATCH', 'groups/:groupId/assets/:assetId', 'updateAsset'],
    ['DELETE', 'groups/:groupId/assets/:assetId', 'removeAsset'],
    ['GET', 'groups/:groupId/assets/:assetId/preview', 'getpreview'],
    ['HEAD', 'groups/:groupId/assets/:assetId/preview', 'headpreview'],
    ['GET', 'groups/:groupId/assets/:assetId/download', 'getdownload'],
    ['HEAD', 'groups/:groupId/assets/:assetId/download', 'headdownload'],
  ]),
  ...family(
    'TeacherGradeScoringController',
    'teacher/classroom/:classId/grades/assessments/:assessmentId/submissions/:submissionId/answers/:answerId/scoring',
    [
      ['POST', 'suggestions', 'evaluate'],
      ['GET', 'suggestions/:suggestionId', 'suggestion'],
      ['POST', 'suggestions/:suggestionId/apply', 'apply'],
    ],
    'grades.submissions.review',
  ),
];
const review = (controller: string, prefix: string) =>
  family(
    controller,
    prefix,
    [
      ['GET', '', 'read'],
      ['GET', 'assets', 'assessmentAssets'],
      ['GET', 'questions/:questionId/assets', 'questionAssets'],
      [
        'GET',
        'submissions/:submissionId/questions/:questionId/answer-assets',
        'answerAssets',
      ],
      ...[
        ['assets/:assetId', 'Paper'],
        ['questions/:questionId/assets/:assetId', 'Question'],
        ['groups/:groupId/assets/:assetId', 'Group'],
        [
          'submissions/:submissionId/questions/:questionId/answer-assets/:assetId',
          'Answer',
        ],
      ].flatMap(([path, kind]) =>
        ['preview', 'download'].flatMap((action) => [
          ['GET', path + '/' + action, 'get' + kind + action],
          ['HEAD', path + '/' + action, 'head' + kind + action],
        ]),
      ),
    ],
    'grades.assessments.view',
  );
// All review routes require current audience/ownership + release; KEYS additionally
// requires current approval. Media retains exact parent identity, private READY
// provenance, guardian policy, trusted MIME and GET/HEAD/Range reauthorization.
export const ST12_STUDENT_CONTRACTS = [
  ...review(
    'StudentGradeReviewController',
    'student/grades/assessments/:assessmentId/review',
  ),
  ...review(
    'StudentExamReviewController',
    'student/exams/:assessmentId/review',
  ),
];
export const ST12_PARENT_CONTRACTS = review(
  'ParentGradeReviewController',
  'parent/children/:studentId/grades/assessments/:assessmentId/review',
);
export const ST12_TEACHER_ROUTES = ST12_TEACHER_CONTRACTS.map(
  (r) => r.method + ' ' + r.path,
);
export const ST12_STUDENT_ROUTES = ST12_STUDENT_CONTRACTS.map(
  (r) => r.method + ' ' + r.path,
);
export const ST12_PARENT_ROUTES = ST12_PARENT_CONTRACTS.map(
  (r) => r.method + ' ' + r.path,
);
export const ST12_ASSET_OPERATIONS = [
  ...ST12_TEACHER_CONTRACTS,
  ...ST12_STUDENT_CONTRACTS,
  ...ST12_PARENT_CONTRACTS,
]
  .filter((r) => r.path.includes('/assets'))
  .map((r) => r.method + ' ' + r.path.replace(/:([A-Za-z]+)/g, '{$1}'));

export function expectSt12TeacherMetadata(
  inventory: Array<{
    controller: string;
    handler: string;
    permissions: string[];
  }>,
) {
  const names = new Set(ST12_TEACHER_CONTRACTS.map((r) => r.controller));
  const actual = inventory.filter((r) => names.has(r.controller));
  const closed = (rows: typeof actual) =>
    rows
      .map((r) => ({
        controller: r.controller,
        handler: r.handler,
        permissions: r.permissions,
      }))
      .sort((a, b) =>
        (a.controller + a.handler).localeCompare(b.controller + b.handler),
      );
  expect(ST12_TEACHER_ROUTES).toHaveLength(45);
  expect(new Set(ST12_TEACHER_ROUTES).size).toBe(45);
  expect(closed(actual)).toEqual(closed(ST12_TEACHER_CONTRACTS));
}

export function expectDefaultPermissionContract() {
  const optIn = 'grades.teacher_authoring.manage';
  expect(PERMISSION_CODES).toHaveLength(244);
  expect(new Set(PERMISSION_CODES).size).toBe(244);
  expect(PERMISSION_CODES.filter((code) => code === optIn)).toHaveLength(1);
  expect(SYSTEM_ROLES).toHaveLength(7);
  expect(SYSTEM_ROLES.map((role) => role.key).sort()).toEqual([
    'dismissal_staff',
    'organization_admin',
    'parent',
    'platform_super_admin',
    'school_admin',
    'student',
    'teacher',
  ]);
  expect(SYSTEM_ROLES.reduce((sum, r) => sum + r.permissions.length, 0)).toBe(
    874,
  );
  for (const role of SYSTEM_ROLES) {
    expect(role.permissions).not.toContain(optIn);
    expect(new Set(role.permissions).size).toBe(role.permissions.length);
    expect(
      role.permissions.every((code) => PERMISSION_CODES.includes(code)),
    ).toBe(true);
  }
  const defaults = PERMISSION_CODES.filter((code) => code !== optIn);
  const platform = SYSTEM_ROLES.find((r) => r.key === 'platform_super_admin')!;
  expect([...platform.permissions].sort()).toEqual([...defaults].sort());
  const tenant = defaults.filter(
    (code) =>
      !code.startsWith('platform.') &&
      ![
        'communication.platform.manage',
        'communication.platform.view',
      ].includes(code),
  );
  for (const key of ['organization_admin', 'school_admin'])
    expect(
      [...SYSTEM_ROLES.find((r) => r.key === key)!.permissions].sort(),
    ).toEqual([...tenant].sort());
}

/** Validate every method/path/handler/permission against the fixed allowlist and
 * execute each real surface guard for every actor type, including anonymous. */
export function expectSt12SurfaceMetadata(
  audience: 'teacher' | 'student' | 'parent',
) {
  const controllers =
    audience === 'teacher'
      ? [
          TeacherGradeAuthoringController,
          TeacherGradeAuthoringUploadsController,
          TeacherGradeAuthoringAssessmentAssetsController,
          TeacherGradeAuthoringQuestionAssetsController,
          TeacherGradeAuthoringGroupsController,
          TeacherGradeScoringController,
        ]
      : audience === 'student'
        ? [StudentGradeReviewController, StudentExamReviewController]
        : [ParentGradeReviewController];
  const expected =
    audience === 'teacher'
      ? ST12_TEACHER_CONTRACTS
      : audience === 'student'
        ? ST12_STUDENT_CONTRACTS
        : ST12_PARENT_CONTRACTS;
  const actorType =
    audience === 'teacher'
      ? UserType.TEACHER
      : audience === 'student'
        ? UserType.STUDENT
        : UserType.PARENT;
  const actual: Route[] = [];
  for (const controller of controllers) {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as Array<
      new () => { canActivate(): boolean }
    >;
    expect(guards).toHaveLength(1);
    const guard = new guards[0]();
    expect(() =>
      runWithRequestContext(createRequestContext(), () => guard.canActivate()),
    ).toThrow();
    for (const type of Object.values(UserType)) {
      const context = createRequestContext();
      context.actor = { id: 'scope-contract-actor', userType: type };
      if (type === actorType)
        expect(runWithRequestContext(context, () => guard.canActivate())).toBe(
          true,
        );
      else
        expect(() =>
          runWithRequestContext(context, () => guard.canActivate()),
        ).toThrow(NotFoundDomainException);
    }
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as Record<string, object>)[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (method === undefined) continue;
      const suffix = Reflect.getMetadata(PATH_METADATA, handler) as string;
      actual.push({
        method: RequestMethod[method],
        path: ('/api/v1/' + prefix + '/' + suffix)
          .replace(/\/+/g, '/')
          .replace(/\/$/, ''),
        controller: controller.name,
        handler: name,
        permissions: (Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          handler,
        ) ??
          Reflect.getMetadata(
            REQUIRED_PERMISSIONS_METADATA,
            controller,
          )) as string[],
      });
    }
  }
  const sorted = (rows: Route[]) =>
    rows
      .slice()
      .sort((a, b) => (a.method + a.path).localeCompare(b.method + b.path));
  expect(sorted(actual)).toEqual(sorted(expected));
}

// Immutable pre-ST12 source authority: 5edd73b197bfaad2e186d7a9d2fe41a8d19e4063.
export const ST12_HISTORICAL_ASSET_OPERATIONS = [
  'DELETE /api/v1/grades/assessments/{assessmentId}/assets/{assetId}',
  'DELETE /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}',
  'DELETE /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}',
  'DELETE /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}',
  'GET /api/v1/grades/assessments/{assessmentId}/assets',
  'GET /api/v1/grades/assessments/{assessmentId}/assets/{assetId}',
  'GET /api/v1/grades/assessments/{assessmentId}/assets/{assetId}/download',
  'GET /api/v1/grades/assessments/{assessmentId}/assets/{assetId}/preview',
  'GET /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets',
  'GET /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}',
  'GET /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'GET /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'GET /api/v1/student/exams/{assessmentId}/assets/{assetId}/download',
  'GET /api/v1/student/exams/{assessmentId}/assets/{assetId}/preview',
  'GET /api/v1/student/exams/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'GET /api/v1/student/exams/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'GET /api/v1/student/grades/assessments/{assessmentId}/assets/{assetId}/download',
  'GET /api/v1/student/grades/assessments/{assessmentId}/assets/{assetId}/preview',
  'GET /api/v1/student/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'GET /api/v1/student/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}/download',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}/preview',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'GET /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'HEAD /api/v1/grades/assessments/{assessmentId}/assets/{assetId}/download',
  'HEAD /api/v1/grades/assessments/{assessmentId}/assets/{assetId}/preview',
  'HEAD /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'HEAD /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'HEAD /api/v1/student/exams/{assessmentId}/assets/{assetId}/download',
  'HEAD /api/v1/student/exams/{assessmentId}/assets/{assetId}/preview',
  'HEAD /api/v1/student/exams/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'HEAD /api/v1/student/exams/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'HEAD /api/v1/student/grades/assessments/{assessmentId}/assets/{assetId}/download',
  'HEAD /api/v1/student/grades/assessments/{assessmentId}/assets/{assetId}/preview',
  'HEAD /api/v1/student/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'HEAD /api/v1/student/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'HEAD /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}/download',
  'HEAD /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}/preview',
  'HEAD /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/download',
  'HEAD /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/preview',
  'PATCH /api/v1/grades/assessments/{assessmentId}/assets/{assetId}',
  'PATCH /api/v1/grades/assessments/{assessmentId}/assets/{assetId}/reorder',
  'PATCH /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}',
  'PATCH /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/reorder',
  'PATCH /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}',
  'PATCH /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets/{assetId}/reorder',
  'PATCH /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}',
  'PATCH /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets/{assetId}/reorder',
  'POST /api/v1/grades/assessments/{assessmentId}/assets',
  'POST /api/v1/grades/assessments/{assessmentId}/questions/{questionId}/assets',
  'POST /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/assets',
  'POST /api/v1/teacher/classroom/{classId}/grades/assessments/{assessmentId}/questions/{questionId}/assets',
];
