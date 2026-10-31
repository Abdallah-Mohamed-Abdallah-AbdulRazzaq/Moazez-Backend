'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  FAILURE_CLASSIFICATION,
  analyzeFixtureSources,
  buildEvidence,
  stableStringify,
  validateRolePermissionCatalog,
  validateSeedPipelineSource,
  validateSeedRuntimeGraph,
} = require('../ci/ci-fixture-contract.cjs');
const {
  classifyPersistedUrl,
} = require('../../src/infrastructure/storage/provider-url.policy.ts');

function fixtureFile(source, name = 'test/e2e/fixture.e2e-spec.ts') {
  return [{ path: name, source }];
}

function emptyCatalog() {
  return validateRolePermissionCatalog([], [], {
    enforceHierarchy: false,
    expectedRoleKeys: [],
  });
}

function validPipeline() {
  return validateSeedPipelineSource(`
    async function main() {
      await seedPermissions(prisma);
      await seedSystemRoles(prisma);
      await seedPlatformAdmin(prisma);
      if (seedDemo) {
        await seedDemoOrg(prisma);
        await seedDemoAcademics(prisma);
      }
    }
  `);
}

function validSeedGraph() {
  return {
    membership: {
      lookup: {
        organizationId: 'organization-id',
        roleId: 'role-id',
        schoolId: 'school-id',
        userId: 'school-user-id',
      },
      write: {
        branch: 'create',
        organizationId: 'organization-id',
        roleId: 'role-id',
        schoolId: 'school-id',
        status: 'ACTIVE',
        userId: 'school-user-id',
        userType: 'SCHOOL_USER',
      },
    },
    operationOrder: [
      'user.upsert.platform_admin',
      'organization.upsert',
      'school.upsert',
      'role.findFirst',
      'user.upsert.school_admin',
      'membership.findFirst',
      'membership.create',
    ],
    organization: {
      createStatus: 'ACTIVE',
      id: 'organization-id',
      updateStatus: 'ACTIVE',
      whereSlugPresent: true,
    },
    roleLookup: {
      isSystem: true,
      key: 'school_admin',
      resultId: 'role-id',
      schoolId: null,
    },
    school: {
      createOrganizationId: 'organization-id',
      createStatus: 'ACTIVE',
      id: 'school-id',
      updateStatus: 'ACTIVE',
      whereOrganizationId: 'organization-id',
    },
    users: [
      {
        createStatus: 'ACTIVE',
        createUserType: 'PLATFORM_USER',
        id: 'platform-user-id',
        kind: 'platform_admin',
        updateStatus: 'ACTIVE',
        updateUserType: 'PLATFORM_USER',
      },
      {
        createStatus: 'ACTIVE',
        createUserType: 'SCHOOL_USER',
        id: 'school-user-id',
        kind: 'school_admin',
        updateStatus: 'ACTIVE',
        updateUserType: 'SCHOOL_USER',
      },
    ],
  };
}

test('accepts null and external HTTPS persisted fixtures through the production classifier', () => {
  const result = analyzeFixtureSources(
    fixtureFile(`
      import { randomUUID } from 'node:crypto';
      const suffix = randomUUID().split('-')[0];
      const marker = \`fixture-\${suffix}\`;
      async function createSchoolWithProfile(input: { logoUrl?: string | null }) {
        await prisma.schoolProfile.create({
          data: { logoUrl: input.logoUrl ?? null },
        });
      }
      await createSchoolWithProfile({ logoUrl: null });
      await createSchoolWithProfile({
        logoUrl: \`https://assets.school-domain.com/\${marker}/logo.png\`,
      });
      await createSchoolWithProfile({});
    `),
    classifyPersistedUrl,
  );

  assert.deepEqual(result.failures, []);
  assert.equal(result.counts.helperPassThroughs, 1);
  assert.equal(result.counts.helperCallsScanned, 3);
  assert.equal(result.classifications.absent, 2);
  assert.equal(result.classifications.external_https, 1);
});

test('rejects stale unsafe and provider-backed persisted logo fixtures', () => {
  const result = analyzeFixtureSources(
    fixtureFile(`
      await prisma.schoolProfile.create({
        data: { logoUrl: 'http://assets.school-domain.com/logo.png' },
      });
      await prisma.schoolProfile.create({
        data: { logoUrl: 'https://storage.googleapis.com/bucket/logo.png' },
      });
    `),
    classifyPersistedUrl,
  );

  assert.equal(result.failures.length, 2);
  assert.deepEqual(
    result.failures.map((failure) => failure.classification).sort(),
    ['gcs_provider_url', 'unsafe'],
  );
  assert.ok(
    result.failures.every(
      (failure) =>
        failure.reasonCode === 'PERSISTED_LOGO_CLASSIFICATION_DISALLOWED',
    ),
  );
});

test('records and excludes an explicitly negative HTTP request body', () => {
  const result = analyzeFixtureSources(
    fixtureFile(`
      await request(app.getHttpServer())
        .patch('/api/v1/settings/branding')
        .send({ logoUrl: 'https://storage.googleapis.com/negative/logo.png' })
        .expect(400);
    `),
    classifyPersistedUrl,
  );

  assert.deepEqual(result.failures, []);
  assert.equal(result.counts.negativeRequestBodiesExcluded, 1);
  assert.equal(result.counts.persistedLogoFixturesChecked, 0);
  assert.equal(
    result.exclusions[0].classification,
    'negative_http_request_body',
  );
});

test('fails closed for an untraceable dynamic persisted initializer', () => {
  const result = analyzeFixtureSources(
    fixtureFile(`
      await prisma.schoolProfile.update({
        where: { schoolId },
        data: { logoUrl: runtimeLogoUrl },
      });
      await prisma.schoolProfile.update({
        where: { schoolId },
        data: {
          logoUrl: \`https://assets.school-domain.com/\${runtimeMarker}/logo.png\`,
        },
      });
    `),
    classifyPersistedUrl,
  );
  assert.equal(result.failures.length, 2);
  assert.ok(
    result.failures.every(
      (failure) => failure.reasonCode === 'DYNAMIC_LOGO_INITIALIZER',
    ),
  );
});

test('detects duplicate and unknown role/permission references', () => {
  const result = validateRolePermissionCatalog(
    ['school.view', 'school.view'],
    [
      {
        key: 'school_admin',
        permissions: ['school.view', 'school.view', 'school.unknown'],
      },
    ],
    { enforceHierarchy: false, expectedRoleKeys: ['school_admin'] },
  );
  const reasons = result.failures.map((failure) => failure.reasonCode);
  assert.ok(reasons.includes('DUPLICATE_PERMISSION_CODE'));
  assert.ok(reasons.includes('DUPLICATE_ROLE_PERMISSION_REFERENCE'));
  assert.ok(reasons.includes('UNKNOWN_ROLE_PERMISSION_REFERENCE'));
});

test('detects a broken organization-school-user-membership tenant graph', () => {
  const graph = validSeedGraph();
  graph.school.createOrganizationId = 'different-organization-id';
  graph.membership.write.schoolId = 'different-school-id';
  const result = validateSeedRuntimeGraph(graph);
  const reasons = result.failures.map((failure) => failure.reasonCode);
  assert.ok(reasons.includes('SCHOOL_TENANT_GRAPH_MISMATCH'));
  assert.ok(reasons.includes('MEMBERSHIP_WRITE_GRAPH_MISMATCH'));
});

test('detects seed pipeline reordering', () => {
  const result = validateSeedPipelineSource(`
    async function main() {
      await seedSystemRoles(prisma);
      await seedPermissions(prisma);
      await seedPlatformAdmin(prisma);
      if (seedDemo) {
        await seedDemoOrg(prisma);
        await seedDemoAcademics(prisma);
      }
    }
  `);
  assert.equal(result.failures[0].reasonCode, 'SEED_PIPELINE_ORDER_MISMATCH');
});

test('emits deterministic schemaVersion 1 evidence without fixture values or secrets', () => {
  const fixture = analyzeFixtureSources(
    fixtureFile(`
      await prisma.schoolProfile.create({
        data: {
          logoUrl: 'https://storage.googleapis.com/private?token=super-secret-token',
        },
      });
    `),
    classifyPersistedUrl,
  );
  const evidence = buildEvidence({
    catalog: emptyCatalog(),
    fixture,
    pipeline: validPipeline(),
    seed: validateSeedRuntimeGraph(validSeedGraph()),
  });
  const first = stableStringify(evidence);
  const second = stableStringify(evidence);

  assert.equal(first, second);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.status, 'FAIL');
  assert.equal(evidence.classification, FAILURE_CLASSIFICATION);
  assert.doesNotMatch(
    first,
    /super-secret-token|storage\.googleapis\.com|private/u,
  );
  assert.match(first, /gcs_provider_url/u);
});

test('the current repository fixture contract passes end-to-end inputs', async () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const {
    loadProductionContracts,
    runRepositoryGate,
  } = require('../ci/ci-fixture-contract.cjs');
  const production = loadProductionContracts(repositoryRoot);
  assert.equal(
    production.permissionCodes.filter(
      (code) => code === 'grades.teacher_authoring.manage',
    ).length,
    1,
  );
  assert.equal(production.systemRoles.length, 7);
  assert.ok(
    production.systemRoles.every(
      (role) => !role.permissions.includes('grades.teacher_authoring.manage'),
    ),
  );
  const evidence = await runRepositoryGate(repositoryRoot, { production });
  assert.equal(evidence.status, 'PASS', stableStringify(evidence));
  assert.equal(evidence.schemaVersion, 1);
  assert.ok(evidence.counts.filesScanned > 0);
  assert.ok(evidence.counts.permissionCodes > 0);
  assert.ok(evidence.counts.systemRoles > 0);
  assert.equal(evidence.counts.negativeRequestBodiesExcluded, 1);
});

const teacherAuthoringOptIn = 'grades.teacher_authoring.manage';
function optInCatalogFixture() {
  const permissionCodes = [
    'platform.settings.manage',
    'schools.view',
    teacherAuthoringOptIn,
  ];
  const systemRoles = [
    'dismissal_staff',
    'organization_admin',
    'parent',
    'platform_super_admin',
    'school_admin',
    'student',
    'teacher',
  ].map((key) => ({
    key,
    permissions:
      key === 'platform_super_admin'
        ? ['platform.settings.manage', 'schools.view']
        : ['organization_admin', 'school_admin'].includes(key)
          ? ['schools.view']
          : [],
  }));
  return { permissionCodes, systemRoles };
}
test('ST12 accepts the registered exact opt-in capability absent from every default role', () => {
  const { permissionCodes, systemRoles } = optInCatalogFixture();
  const result = validateRolePermissionCatalog(permissionCodes, systemRoles);
  assert.deepEqual(result.failures, []);
  assert.equal(result.counts.permissionCodes, 3);
  assert.equal(result.counts.systemRoles, 7);
});
for (const key of [
  'dismissal_staff',
  'organization_admin',
  'parent',
  'platform_super_admin',
  'school_admin',
  'student',
  'teacher',
]) {
  test('ST12 rejects an opt-in default grant on ' + key, () => {
    const { permissionCodes, systemRoles } = optInCatalogFixture();
    systemRoles
      .find((role) => role.key === key)
      .permissions.push(teacherAuthoringOptIn);
    const result = validateRolePermissionCatalog(permissionCodes, systemRoles);
    assert.ok(
      result.failures.some(
        (f) => f.reasonCode === 'OPT_IN_PERMISSION_DEFAULT_GRANT',
      ),
    );
  });
}
test('ST12 keeps exact ordinary-permission coverage required for every administrator', () => {
  for (const key of [
    'platform_super_admin',
    'organization_admin',
    'school_admin',
  ]) {
    const { permissionCodes, systemRoles } = optInCatalogFixture();
    systemRoles.find((role) => role.key === key).permissions = [];
    const result = validateRolePermissionCatalog(permissionCodes, systemRoles);
    assert.ok(
      result.failures.some(
        (f) =>
          f.reasonCode ===
          (key === 'platform_super_admin'
            ? 'PLATFORM_ROLE_PERMISSION_MISMATCH'
            : 'TENANT_ADMIN_PERMISSION_MISMATCH'),
      ),
    );
  }
});
test('ST12 does not exempt arbitrary newly registered permission codes from default coverage', () => {
  const { permissionCodes, systemRoles } = optInCatalogFixture();
  permissionCodes.push('grades.other_future.manage');
  const result = validateRolePermissionCatalog(permissionCodes, systemRoles);
  assert.equal(
    result.failures.filter(
      (f) => f.reasonCode === 'PLATFORM_ROLE_PERMISSION_MISMATCH',
    ).length,
    1,
  );
  assert.equal(
    result.failures.filter(
      (f) => f.reasonCode === 'TENANT_ADMIN_PERMISSION_MISMATCH',
    ).length,
    2,
  );
});
test('ST12 preserves unknown, duplicate, and tenant platform-leak rejection', () => {
  for (const [code, reason] of [
    ['unknown.code', 'UNKNOWN_ROLE_PERMISSION_REFERENCE'],
    ['schools.view', 'DUPLICATE_ROLE_PERMISSION_REFERENCE'],
    ['platform.settings.manage', 'TENANT_ROLE_PLATFORM_SCOPE_LEAK'],
  ]) {
    const { permissionCodes, systemRoles } = optInCatalogFixture();
    if (reason === 'DUPLICATE_ROLE_PERMISSION_REFERENCE')
      systemRoles.find((r) => r.key === 'teacher').permissions.push(code);
    systemRoles.find((r) => r.key === 'teacher').permissions.push(code);
    const result = validateRolePermissionCatalog(permissionCodes, systemRoles);
    assert.ok(result.failures.some((f) => f.reasonCode === reason));
  }
  const { permissionCodes, systemRoles } = optInCatalogFixture();
  permissionCodes.push('schools.view');
  assert.ok(
    validateRolePermissionCatalog(permissionCodes, systemRoles).failures.some(
      (f) => f.reasonCode === 'DUPLICATE_PERMISSION_CODE',
    ),
  );
});

test('ST12 rejects a missing production opt-in catalog entry', () => {
  const { permissionCodes, systemRoles } = optInCatalogFixture();
  const result = validateRolePermissionCatalog(
    permissionCodes.filter((code) => code !== teacherAuthoringOptIn),
    systemRoles,
  );
  assert.ok(
    result.failures.some(
      (f) => f.reasonCode === 'OPT_IN_PERMISSION_CATALOG_COUNT_MISMATCH',
    ),
  );
});
test('ST12 rejects duplicate opt-in registration without hiding the duplicate catalog check', () => {
  const { permissionCodes, systemRoles } = optInCatalogFixture();
  permissionCodes.push(teacherAuthoringOptIn);
  const result = validateRolePermissionCatalog(permissionCodes, systemRoles);
  assert.ok(
    result.failures.some(
      (f) => f.reasonCode === 'OPT_IN_PERMISSION_CATALOG_COUNT_MISMATCH',
    ),
  );
  assert.ok(
    result.failures.some((f) => f.reasonCode === 'DUPLICATE_PERMISSION_CODE'),
  );
});
test('ST12 preserves exact default-role key equality', () => {
  const { permissionCodes, systemRoles } = optInCatalogFixture();
  const result = validateRolePermissionCatalog(
    permissionCodes,
    systemRoles.filter((role) => role.key !== 'teacher'),
  );
  assert.ok(
    result.failures.some((f) => f.reasonCode === 'ROLE_KEY_SET_MISMATCH'),
  );
});
