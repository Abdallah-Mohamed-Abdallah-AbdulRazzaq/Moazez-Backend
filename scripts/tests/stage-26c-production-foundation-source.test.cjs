'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { classifyTestFile } = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = '1342d64dee8355ba2a6c8a286430a6cdd698e93a';
const TEST_PATH =
  'scripts/tests/stage-26c-production-foundation-source.test.cjs';
const ROOT_FILES = Object.freeze([
  '.terraform.lock.hcl',
  'main.tf',
  'outputs.tf',
  'providers.tf',
  'variables.tf',
  'versions.tf',
]);
const STATUS_MARKERS = Object.freeze([
  'PRODUCTION_SOURCE_PREPARED=YES',
  'PRODUCTION_TERRAFORM_APPLIED=NO',
  'PRODUCTION_SECRET_VERSIONS_CREATED=NO',
  'PRODUCTION_ARTIFACTS_PUSHED=NO',
  'PRODUCTION_RUNTIME_DEPLOYED=NO',
]);

function assertStage26CandidateScope(candidateFiles) {
  if (!candidateFiles.includes(TEST_PATH)) return;

  const allowed = [
    /^infra\/gcp\/(?:secrets|artifact-registry|runtime-iam|deployment-identity)\//u,
    /^scripts\/ci\/plan-ci\.cjs$/u,
    /^scripts\/tests\/stage-26c-production-foundation-source\.test\.cjs$/u,
    /^scripts\/tests\/plan-ci\.test\.cjs$/u,
  ];
  assert.deepEqual(
    candidateFiles.filter((file) => !allowed.some((pattern) => pattern.test(file))),
    [],
  );
  assert.deepEqual(
    candidateFiles.filter((file) => /\/environments\/nonprod\//u.test(file)),
    [],
  );
}

const STAGING_SECRET_IDS = Object.freeze({
  api_database_url: 'moazez-staging-api-database-url',
  core_worker_database_url: 'moazez-staging-core-worker-database-url',
  media_worker_database_url: 'moazez-staging-media-worker-database-url',
  migration_database_url: 'moazez-staging-migration-database-url',
  jwt_access_secret: 'moazez-staging-jwt-access-secret',
  jwt_refresh_secret: 'moazez-staging-jwt-refresh-secret',
  smtp_secret_encryption_key: 'moazez-staging-smtp-secret-encryption-key',
  app_device_token_encryption_key:
    'moazez-staging-app-device-token-encryption-key',
});
const PRODUCTION_SECRET_IDS = Object.freeze(
  Object.fromEntries(
    Object.entries(STAGING_SECRET_IDS).map(([key, value]) => [
      key,
      value.replace('moazez-staging-', 'moazez-production-'),
    ]),
  ),
);
const EXISTING_RUNTIME_IDS = Object.freeze({
  api_runtime: 'moazez-api-runtime',
  core_worker: 'moazez-core-worker',
  media_worker: 'moazez-media-worker',
});
const MANAGED_RUNTIME_ACCOUNTS = Object.freeze({
  migration_job: Object.freeze({
    account_id: 'moazez-migration-job',
    display_name: 'Moazez Migration Job',
  }),
  maintenance_scheduler: Object.freeze({
    account_id: 'moazez-maintenance-scheduler',
    display_name: 'Moazez Maintenance Scheduler',
  }),
});
const RUNTIME_SERVICE_ACCOUNT_IDS = Object.freeze({
  ...EXISTING_RUNTIME_IDS,
  migration_job: 'moazez-migration-job',
  maintenance_scheduler: 'moazez-maintenance-scheduler',
});

function runtimeGrants(environment) {
  const prefix = `moazez-${environment}-`;
  return {
    api_database_url: {
      runtime_identity_key: 'api_runtime',
      secret_id: `${prefix}api-database-url`,
    },
    api_jwt_access_secret: {
      runtime_identity_key: 'api_runtime',
      secret_id: `${prefix}jwt-access-secret`,
    },
    api_jwt_refresh_secret: {
      runtime_identity_key: 'api_runtime',
      secret_id: `${prefix}jwt-refresh-secret`,
    },
    api_smtp_secret_encryption_key: {
      runtime_identity_key: 'api_runtime',
      secret_id: `${prefix}smtp-secret-encryption-key`,
    },
    api_app_device_token_encryption_key: {
      runtime_identity_key: 'api_runtime',
      secret_id: `${prefix}app-device-token-encryption-key`,
    },
    core_worker_database_url: {
      runtime_identity_key: 'core_worker',
      secret_id: `${prefix}core-worker-database-url`,
    },
    core_worker_smtp_secret_encryption_key: {
      runtime_identity_key: 'core_worker',
      secret_id: `${prefix}smtp-secret-encryption-key`,
    },
    core_worker_app_device_token_encryption_key: {
      runtime_identity_key: 'core_worker',
      secret_id: `${prefix}app-device-token-encryption-key`,
    },
    media_worker_database_url: {
      runtime_identity_key: 'media_worker',
      secret_id: `${prefix}media-worker-database-url`,
    },
    migration_job_database_url: {
      runtime_identity_key: 'migration_job',
      secret_id: `${prefix}migration-database-url`,
    },
  };
}

const GITHUB_IDENTITY = Object.freeze({
  github_owner_name: 'Abdallah-Mohamed-Abdallah-AbdulRazzaq',
  github_owner_id: '127324203',
  github_repository:
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend',
  github_repository_id: '1217512033',
  github_allowed_ref: 'refs/heads/main',
});

const CONTRACTS = Object.freeze({
  secrets: Object.freeze({
    staging: Object.freeze({
      project_id: 'moazez-nonprod-91001421934',
      environment: 'staging',
      replication_location: 'me-central2',
      secret_ids: STAGING_SECRET_IDS,
    }),
    production: Object.freeze({
      project_id: 'moazez-production',
      environment: 'production',
      replication_location: 'me-central2',
      secret_ids: PRODUCTION_SECRET_IDS,
    }),
  }),
  artifactRegistry: Object.freeze({
    staging: Object.freeze({
      project_id: 'moazez-nonprod-91001421934',
      environment: 'staging',
      location: 'me-central2',
      repository_id: 'moazez-staging-containers',
    }),
    production: Object.freeze({
      project_id: 'moazez-production',
      environment: 'production',
      location: 'me-central2',
      repository_id: 'moazez-production-containers',
    }),
  }),
  runtimeIam: Object.freeze({
    staging: Object.freeze({
      project_id: 'moazez-nonprod-91001421934',
      environment: 'staging',
      existing_runtime_service_account_ids: EXISTING_RUNTIME_IDS,
      managed_runtime_service_accounts: MANAGED_RUNTIME_ACCOUNTS,
      secret_access_grants: runtimeGrants('staging'),
    }),
    production: Object.freeze({
      project_id: 'moazez-production',
      environment: 'production',
      existing_runtime_service_account_ids: EXISTING_RUNTIME_IDS,
      managed_runtime_service_accounts: MANAGED_RUNTIME_ACCOUNTS,
      secret_access_grants: runtimeGrants('production'),
    }),
  }),
  deploymentIdentity: Object.freeze({
    staging: Object.freeze({
      project_id: 'moazez-nonprod-91001421934',
      project_number: '375161231141',
      environment: 'staging',
      ...GITHUB_IDENTITY,
      workload_identity_pool_id: 'moazez-github-staging',
      workload_identity_provider_id: 'moazez-backend-main',
      iac_deployer_service_account_id: 'moazez-iac-deployer',
      artifact_registry_location: 'me-central2',
      artifact_registry_repository_id: 'moazez-staging-containers',
      terraform_state_bucket: 'moazez-nonprod-91001421934-tfstate',
      runtime_service_account_ids: RUNTIME_SERVICE_ACCOUNT_IDS,
    }),
    production: Object.freeze({
      project_id: 'moazez-production',
      project_number: '91001421934',
      environment: 'production',
      ...GITHUB_IDENTITY,
      workload_identity_pool_id: 'moazez-github-production',
      workload_identity_provider_id: 'moazez-backend-main',
      iac_deployer_service_account_id: 'moazez-iac-deployer',
      artifact_registry_location: 'me-central2',
      artifact_registry_repository_id: 'moazez-production-containers',
      terraform_state_bucket: 'moazez-production-91001421934-tfstate',
      runtime_service_account_ids: RUNTIME_SERVICE_ACCOUNT_IDS,
    }),
  }),
});

const PRODUCTION_MODULE_CALLERS = Object.freeze({
  secrets: Object.freeze({
    source: '"../../modules/secret-environment"',
    project_id: 'var.project_id',
    environment: 'var.environment',
    replication_location: 'var.replication_location',
    secret_ids: 'local.production_secret_ids',
  }),
  artifactRegistry: Object.freeze({
    source: '"../../modules/artifact-registry-environment"',
    project_id: 'var.project_id',
    environment: 'var.environment',
    location: 'var.location',
    repository_id: 'var.repository_id',
  }),
  runtimeIam: Object.freeze({
    source: '"../../modules/runtime-iam-environment"',
    project_id: 'var.project_id',
    environment: 'var.environment',
    existing_runtime_service_account_ids:
      'local.existing_runtime_service_account_ids',
    managed_runtime_service_accounts:
      'local.managed_runtime_service_accounts',
    secret_access_grants: 'local.secret_access_grants',
  }),
  deploymentIdentity: Object.freeze({
    source: '"../../modules/deployment-identity-environment"',
    project_id: 'var.project_id',
    project_number: 'var.project_number',
    environment: 'var.environment',
    github_owner_name: 'local.github_identity.owner_name',
    github_owner_id: 'local.github_identity.owner_id',
    github_repository: 'local.github_identity.repository',
    github_repository_id: 'local.github_identity.repository_id',
    github_allowed_ref: 'local.github_identity.allowed_ref',
    workload_identity_pool_id: 'local.workload_identity_pool_id',
    workload_identity_provider_id: 'local.workload_identity_provider_id',
    iac_deployer_service_account_id:
      'local.iac_deployer_service_account_id',
    artifact_registry_location: 'local.artifact_registry_location',
    artifact_registry_repository_id:
      'local.artifact_registry_repository_id',
    terraform_state_bucket: 'local.terraform_state_bucket',
    runtime_service_account_ids: 'local.runtime_service_account_ids',
  }),
});

const DOMAINS = Object.freeze({
  secrets: Object.freeze({
    root: 'infra/gcp/secrets',
    module: 'infra/gcp/secrets/modules/secret-environment',
    moduleName: 'secret_environment',
    productionCaller: PRODUCTION_MODULE_CALLERS.secrets,
    backendPrefix: 'secrets/production',
    rootLocks: Object.freeze({
      project_id: 'moazez-production',
      environment: 'production',
      replication_location: 'me-central2',
    }),
    contract: CONTRACTS.secrets,
    variables: Object.freeze([
      'project_id',
      'environment',
      'replication_location',
      'secret_ids',
    ]),
    baselineBlobs: Object.freeze({
      '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
      'main.tf': 'b7a045ba79d13e7b1eb54bdc03cecfb74f97d397',
      'outputs.tf': 'dd79dc100fc13edfd65ea5f580bf183b76eb7e43',
      'providers.tf': '54cfc991572c83b3e781c3cb87267da61dd227f3',
      'variables.tf': 'b6d723914049020405d58d9c85e09426861685bb',
      'versions.tf': 'b918eb91cf477e3cec8647c8674faf9e1e73a083',
    }),
  }),
  artifactRegistry: Object.freeze({
    root: 'infra/gcp/artifact-registry',
    module: 'infra/gcp/artifact-registry/modules/artifact-registry-environment',
    moduleName: 'artifact_registry_environment',
    productionCaller: PRODUCTION_MODULE_CALLERS.artifactRegistry,
    backendPrefix: 'artifact-registry/production',
    rootLocks: Object.freeze({
      project_id: 'moazez-production',
      environment: 'production',
      location: 'me-central2',
      repository_id: 'moazez-production-containers',
    }),
    contract: CONTRACTS.artifactRegistry,
    variables: Object.freeze([
      'project_id',
      'environment',
      'location',
      'repository_id',
    ]),
    baselineBlobs: Object.freeze({
      '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
      'main.tf': 'eeb3ab0e9e48673f1c2b5107dee0380f27836540',
      'outputs.tf': '8eef9b68ae45329bd80af706a845f4cf8f1a15bb',
      'providers.tf': 'a31d8bd2860e5cc7f44273ec10062314a9d4c232',
      'variables.tf': '8e173f3f9ad0a0e632fb0f821487f0d94c05d461',
      'versions.tf': 'd62cf9c6376919ebb6d432126f698fdca1281121',
    }),
  }),
  runtimeIam: Object.freeze({
    root: 'infra/gcp/runtime-iam',
    module: 'infra/gcp/runtime-iam/modules/runtime-iam-environment',
    moduleName: 'runtime_iam_environment',
    productionCaller: PRODUCTION_MODULE_CALLERS.runtimeIam,
    backendPrefix: 'runtime-iam/production',
    rootLocks: Object.freeze({
      project_id: 'moazez-production',
      environment: 'production',
    }),
    contract: CONTRACTS.runtimeIam,
    variables: Object.freeze([
      'project_id',
      'environment',
      'existing_runtime_service_account_ids',
      'managed_runtime_service_accounts',
      'secret_access_grants',
    ]),
    baselineBlobs: Object.freeze({
      '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
      'main.tf': '5759afd042a7f9441c9d61c77f001885148f79f4',
      'outputs.tf': 'f907e1722fe32e4efedb884e05cbf36c82929f6c',
      'providers.tf': 'a2bd246468c57d112fac8815b48a76a0f4a56aab',
      'variables.tf': '9205df4a40193937e051bc4cb50d6021afa89f99',
      'versions.tf': '14468e620f801a3163d00efb569ccf77892c6473',
    }),
  }),
  deploymentIdentity: Object.freeze({
    root: 'infra/gcp/deployment-identity',
    module:
      'infra/gcp/deployment-identity/modules/deployment-identity-environment',
    moduleName: 'deployment_identity_environment',
    productionCaller: PRODUCTION_MODULE_CALLERS.deploymentIdentity,
    backendPrefix: 'deployment-identity/production',
    rootLocks: Object.freeze({
      project_id: 'moazez-production',
      project_number: '91001421934',
      environment: 'production',
    }),
    contract: CONTRACTS.deploymentIdentity,
    variables: Object.freeze([
      'project_id',
      'project_number',
      'environment',
      'github_owner_name',
      'github_owner_id',
      'github_repository',
      'github_repository_id',
      'github_allowed_ref',
      'workload_identity_pool_id',
      'workload_identity_provider_id',
      'iac_deployer_service_account_id',
      'artifact_registry_location',
      'artifact_registry_repository_id',
      'terraform_state_bucket',
      'runtime_service_account_ids',
    ]),
    baselineBlobs: Object.freeze({
      '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
      'main.tf': 'fc0c13effb13be11b96acde67d78cb8f1d4785be',
      'outputs.tf': '157e7b9fbe1e57fee615f10bcf729bde1c6a2de8',
      'providers.tf': 'a2bd246468c57d112fac8815b48a76a0f4a56aab',
      'variables.tf': '163ef3ccd0e06f021b8b573f0513b064f0233190',
      'versions.tf': '9cecc9cec6ee4a6c61742596a2f02490ad15b072',
    }),
  }),
});

function absolutePath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function normalizedSource(relativePath) {
  return fs.readFileSync(absolutePath(relativePath), 'utf8').replace(/\r\n/gu, '\n');
}

function gitBlobHash(source) {
  const body = Buffer.from(source, 'utf8');
  return crypto
    .createHash('sha1')
    .update(`blob ${body.length}\0`, 'utf8')
    .update(body)
    .digest('hex');
}

function extractBlockAt(source, startIndex, label) {
  const openIndex = source.indexOf('{', startIndex);
  assert.notEqual(openIndex, -1, `Missing opening brace for ${label}.`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  assert.fail(`Unterminated block for ${label}.`);
}

function extractBlock(source, headerPattern, label) {
  const match = headerPattern.exec(source);
  assert.ok(match, `Missing ${label}.`);
  return extractBlockAt(source, match.index, label);
}

function findResources(source) {
  return [...source.matchAll(/^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gmu)].map(
    (match) => ({
      type: match[1],
      name: match[2],
      body: extractBlockAt(source, match.index, `${match[1]}.${match[2]}`),
    }),
  );
}

function terraformFiles(relativeRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.terraform') continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.tf')) files.push(target);
    }
  };
  visit(absolutePath(relativeRoot));
  return files.sort().map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

function variableBlock(source, name) {
  return extractBlock(
    source,
    new RegExp(`variable\\s+"${name}"\\s*\\{`, 'u'),
    `${name} variable`,
  );
}

function assertRootVariableLocks(source, locks) {
  for (const [name, value] of Object.entries(locks)) {
    const block = variableBlock(source, name);
    assert.match(block, new RegExp(`default\\s*=\\s*"${value}"`, 'u'));
    const validation = extractBlock(block, /validation\s*\{/u, `${name} validation`);
    assert.match(
      validation,
      new RegExp(`condition\\s*=\\s*var\\.${name}\\s*==\\s*"${value}"`, 'u'),
    );
  }
}

function parseFlatStringAssignments(block) {
  return Object.fromEntries(
    [...block.matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*$/gmu)].map(
      (match) => [match[1], match[2]],
    ),
  );
}

function parseSimpleAssignments(block) {
  const assignments = {};
  for (const match of block.matchAll(
    /^\s*([A-Za-z0-9_]+)\s*=\s*([^\r\n]+?)\s*$/gmu,
  )) {
    assert.equal(
      Object.hasOwn(assignments, match[1]),
      false,
      `Duplicate assignment for ${match[1]}.`,
    );
    assignments[match[1]] = match[2].trim();
  }
  return assignments;
}

function canonicalHcl(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (!/\s/u.test(character)) {
      output += character;
    }
  }
  return output.replace(/,\]/gu, ']');
}

function validationCondition(block, variableName) {
  const match = /condition\s*=\s*([\s\S]*?)\s+error_message\s*=/u.exec(block);
  assert.ok(match, `Missing validation condition for ${variableName}.`);
  return canonicalHcl(match[1]);
}

function mapEntryCondition(variableName, values, { useLookup = false } = {}) {
  const comparisons = [];
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      const accessor = useLookup
        ? `lookup(var.${variableName},${JSON.stringify(key)},"")`
        : `try(var.${variableName}[${JSON.stringify(key)}],"")`;
      comparisons.push(`${accessor}==${JSON.stringify(value)}`);
      continue;
    }
    for (const [field, fieldValue] of Object.entries(value)) {
      comparisons.push(
        `try(var.${variableName}[${JSON.stringify(key)}].${field},"")==${JSON.stringify(fieldValue)}`,
      );
    }
  }
  return comparisons.join('&&');
}

function exactMapCondition(variableName, values, options) {
  return `(length(var.${variableName})==${Object.keys(values).length}&&${mapEntryCondition(variableName, values, options)})`;
}

function expectedValidationCondition(config, variableName) {
  const stagingValue = config.contract.staging[variableName];
  const productionValue = config.contract.production[variableName];
  if (typeof stagingValue === 'string') {
    if (stagingValue === productionValue) {
      return `var.${variableName}==${JSON.stringify(stagingValue)}`;
    }
    return `contains([${JSON.stringify(stagingValue)},${JSON.stringify(productionValue)}],var.${variableName})`;
  }
  if (variableName === 'secret_ids') {
    return `(${exactMapCondition(variableName, stagingValue, { useLookup: true })}||${exactMapCondition(variableName, productionValue, { useLookup: true })})`;
  }
  if (variableName === 'secret_access_grants') {
    return `(length(var.${variableName})==${Object.keys(stagingValue).length}&&((${mapEntryCondition(variableName, stagingValue)})||(${mapEntryCondition(variableName, productionValue)})))`;
  }
  assert.equal(
    isDeepStrictEqual(stagingValue, productionValue),
    true,
    `Missing exact validation model for ${variableName}.`,
  );
  return exactMapCondition(variableName, stagingValue);
}

function topLevelAssignmentKeys(block) {
  const keys = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const line of block.split('\n')) {
    if (depth === 0) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=/u.exec(line);
      if (match) keys.push(match[1]);
    }
    for (const character of line) {
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
  }
  assert.equal(depth, 0, 'Unbalanced nested map while reading assignment keys.');
  return keys;
}

function nestedObject(block, key) {
  return extractBlock(
    block,
    new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*\\{`, 'u'),
    `${key} object`,
  );
}

function assertNestedMap(block, expected) {
  assert.deepEqual(
    topLevelAssignmentKeys(block).sort(),
    Object.keys(expected).sort(),
    'Nested map must contain exactly the governed keys.',
  );
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === 'string') {
      assert.match(block, new RegExp(`\\b${key}\\s*=\\s*"${value}"`, 'u'));
      continue;
    }
    assert.deepEqual(parseFlatStringAssignments(nestedObject(block, key)), value);
  }
}

function assertContractGuard(config) {
  const main = normalizedSource(`${config.module}/main.tf`);
  const variables = normalizedSource(`${config.module}/variables.tf`);
  const current = extractBlock(main, /current_contract\s*=\s*\{/u, 'current contract');
  const staging = extractBlock(main, /staging_contract\s*=\s*\{/u, 'staging contract');
  const production = extractBlock(
    main,
    /production_contract\s*=\s*\{/u,
    'production contract',
  );

  for (const name of config.variables) {
    assert.match(current, new RegExp(`\\b${name}\\s*=\\s*var\\.${name}`, 'u'));
    const block = variableBlock(variables, name);
    const validations = [...block.matchAll(/validation\s*\{/gu)];
    assert.equal(validations.length, 1, `${name} must have one validation.`);
    const validation = extractBlock(block, /validation\s*\{/u, `${name} validation`);
    const references = [
      ...new Set([...validation.matchAll(/\bvar\.([A-Za-z0-9_]+)/gu)].map((m) => m[1])),
    ];
    assert.deepEqual(references, [name], `${name} validation crosses variables.`);
    assert.equal(
      validationCondition(validation, name),
      expectedValidationCondition(config, name),
      `${name} validation must permit exactly its governed Staging and Production values.`,
    );
  }

  const variableNames = [
    ...variables.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(variableNames.sort(), [...config.variables].sort());
  assert.match(
    main,
    /governed_contract\s*=\s*\(\s*local\.current_contract\s*==\s*local\.staging_contract\s*\|\|\s*local\.current_contract\s*==\s*local\.production_contract\s*\)/u,
  );

  assert.deepEqual(
    topLevelAssignmentKeys(current).sort(),
    [...config.variables].sort(),
    'current_contract must contain exactly the module variables.',
  );

  const assertContractSource = (block, expected) => {
    assert.deepEqual(
      topLevelAssignmentKeys(block).sort(),
      Object.keys(expected).sort(),
      'Governed contract must contain exactly the declared tuple fields.',
    );
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'string') {
        assert.match(block, new RegExp(`\\b${key}\\s*=\\s*"${value}"`, 'u'));
      } else {
        assert.ok(block.includes(`${key} = tomap({`) || block.includes(`${key}=tomap({`));
        assertNestedMap(extractBlock(block, new RegExp(`${key}\\s*=\\s*tomap\\(\\{`, 'u'), key), value);
      }
    }
  };
  assertContractSource(staging, config.contract.staging);
  assertContractSource(production, config.contract.production);

  const accepts = (candidate) =>
    isDeepStrictEqual(candidate, config.contract.staging) ||
    isDeepStrictEqual(candidate, config.contract.production);
  assert.equal(accepts(config.contract.staging), true);
  assert.equal(accepts(config.contract.production), true);
  for (const key of config.variables) {
    const stagingValue = config.contract.staging[key];
    const productionValue = config.contract.production[key];
    const invalidValue = isDeepStrictEqual(stagingValue, productionValue)
      ? typeof stagingValue === 'string'
        ? `${stagingValue}-invalid`
        : { ...stagingValue, invalid: 'mixed' }
      : productionValue;
    assert.equal(
      accepts({ ...config.contract.staging, [key]: invalidValue }),
      false,
      `${key} admitted a mixed or ungoverned contract.`,
    );
  }

  const resources = findResources(main);
  assert.ok(resources.length > 0);
  for (const resource of resources) {
    const lifecycle = extractBlock(resource.body, /lifecycle\s*\{/u, `${resource.name} lifecycle`);
    const precondition = extractBlock(
      lifecycle,
      /precondition\s*\{/u,
      `${resource.name} precondition`,
    );
    assert.match(precondition, /condition\s*=\s*local\.governed_contract/u);
  }
}

function resourceByName(resources, type, name) {
  const resource = resources.find(
    (candidate) => candidate.type === type && candidate.name === name,
  );
  assert.ok(resource, `Missing ${type}.${name}.`);
  return resource.body;
}

test('all four Production roots and Staging baselines are exact', () => {
  for (const config of Object.values(DOMAINS)) {
    const productionRoot = `${config.root}/environments/production`;
    const nonprodRoot = `${config.root}/environments/nonprod`;
    assert.deepEqual(
      fs.readdirSync(absolutePath(productionRoot)).sort(),
      [...ROOT_FILES].sort(),
      `${productionRoot} must contain exactly six files.`,
    );

    const main = normalizedSource(`${productionRoot}/main.tf`);
    const variables = normalizedSource(`${productionRoot}/variables.tf`);
    const providers = normalizedSource(`${productionRoot}/providers.tf`);
    const versions = normalizedSource(`${productionRoot}/versions.tf`);
    const rootSource = terraformFiles(productionRoot);
    assert.equal(findResources(rootSource).length, 0);
    assert.equal((rootSource.match(/^\s*data\s+"/gmu) ?? []).length, 0);
    assert.equal((rootSource.match(/^\s*module\s+"/gmu) ?? []).length, 1);
    const moduleCaller = extractBlock(
      main,
      new RegExp(`module\\s+"${config.moduleName}"\\s*\\{`, 'u'),
      `${config.moduleName} Production caller`,
    );
    assert.deepEqual(
      parseSimpleAssignments(moduleCaller),
      config.productionCaller,
      `${config.moduleName} must receive the exact Production caller contract.`,
    );
    assertRootVariableLocks(variables, config.rootLocks);
    assert.match(providers, /provider\s+"google"\s*\{/u);
    assert.match(providers, /project\s*=\s*var\.project_id/u);
    assert.match(versions, /required_version\s*=\s*">= 1\.6\.0, < 2\.0\.0"/u);
    assert.match(versions, /backend\s+"gcs"\s*\{/u);
    assert.match(
      versions,
      /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u,
    );
    assert.match(
      versions,
      new RegExp(`prefix\\s*=\\s*"${config.backendPrefix}"`, 'u'),
    );
    assert.match(versions, /source\s*=\s*"hashicorp\/google"/u);
    assert.match(versions, /version\s*=\s*">= 7\.40\.0, < 8\.0\.0"/u);

    const nonprodLock = fs.readFileSync(
      absolutePath(`${nonprodRoot}/.terraform.lock.hcl`),
    );
    const productionLock = fs.readFileSync(
      absolutePath(`${productionRoot}/.terraform.lock.hcl`),
    );
    assert.equal(productionLock.equals(nonprodLock), true);
    assert.match(productionLock.toString('utf8'), /version\s*=\s*"7\.44\.0"/u);

    for (const [file, expectedBlob] of Object.entries(config.baselineBlobs)) {
      assert.equal(
        gitBlobHash(normalizedSource(`${nonprodRoot}/${file}`)),
        expectedBlob,
        `${nonprodRoot}/${file} differs from the starting baseline.`,
      );
    }
  }
});

test('all shared modules accept only exact complete Staging or Production contracts', () => {
  for (const config of Object.values(DOMAINS)) assertContractGuard(config);
  console.log('FULL_TUPLE_GUARD_SECRETS=PASS');
  console.log('FULL_TUPLE_GUARD_ARTIFACT_REGISTRY=PASS');
  console.log('FULL_TUPLE_GUARD_RUNTIME_IAM=PASS');
  console.log('FULL_TUPLE_GUARD_DEPLOYMENT_IDENTITY=PASS');
  console.log('MIXED_STAGING_PRODUCTION_TUPLE_ACCEPTED=NO');
});

test('Secret Manager source owns exactly eight safe Production containers', () => {
  const config = DOMAINS.secrets;
  const moduleMain = normalizedSource(`${config.module}/main.tf`);
  const productionMain = normalizedSource(
    `${config.root}/environments/production/main.tf`,
  );
  const resources = findResources(terraformFiles(config.root));
  assert.deepEqual(
    resources.map(({ type, name }) => [type, name]),
    [['google_secret_manager_secret', 'managed']],
  );
  assert.deepEqual(
    parseFlatStringAssignments(
      extractBlock(
        productionMain,
        /production_secret_ids\s*=\s*\{/u,
        'Production secret IDs',
      ),
    ),
    PRODUCTION_SECRET_IDS,
  );
  const secret = resources[0].body;
  assert.match(secret, /for_each\s*=\s*var\.secret_ids/u);
  assert.match(secret, /deletion_policy\s*=\s*"PREVENT"/u);
  assert.match(secret, /deletion_protection\s*=\s*true/u);
  assert.match(secret, /environment\s*=\s*var\.environment/u);
  assert.equal((secret.match(/user_managed\s*\{/gu) ?? []).length, 1);
  assert.equal((secret.match(/replicas\s*\{/gu) ?? []).length, 1);
  assert.match(secret, /location\s*=\s*var\.replication_location/u);
  assert.match(secret, /prevent_destroy\s*=\s*true/u);
  assert.doesNotMatch(
    moduleMain,
    /google_secret_manager_secret_version|secret_data|payload|redis[^\n]*ca|legacy[^\n]*v1/iu,
  );
  console.log('PRODUCTION_SECRET_CONTAINER_SOURCE_COUNT=8');
});

test('Artifact Registry source owns exactly one governed Docker repository', () => {
  const config = DOMAINS.artifactRegistry;
  const moduleMain = normalizedSource(`${config.module}/main.tf`);
  const moduleVariables = normalizedSource(`${config.module}/variables.tf`);
  const resources = findResources(terraformFiles(config.root));
  assert.deepEqual(
    resources.map(({ type, name }) => [type, name]),
    [['google_artifact_registry_repository', 'this']],
  );
  const repository = resources[0].body;
  assert.match(repository, /repository_id\s*=\s*var\.repository_id/u);
  assert.match(repository, /description\s*=\s*local\.repository_descriptions\[var\.environment\]/u);
  assert.match(moduleMain, /"Stores Moazez staging container artifacts\."/u);
  assert.match(moduleMain, /"Stores Moazez production container artifacts\."/u);
  assert.match(repository, /format\s*=\s*"DOCKER"/u);
  assert.match(repository, /mode\s*=\s*"STANDARD_REPOSITORY"/u);
  assert.match(repository, /deletion_policy\s*=\s*"PREVENT"/u);
  assert.match(repository, /environment\s*=\s*var\.environment/u);
  assert.match(repository, /component\s*=\s*"artifact-registry"/u);
  assert.match(repository, /managed_by\s*=\s*"terraform"/u);
  assert.match(repository, /prevent_destroy\s*=\s*true/u);
  assert.doesNotMatch(moduleVariables, /variable\s+"description"/u);
  assert.doesNotMatch(
    moduleMain,
    /cleanup_policies|remote_repository_config|virtual_repository_config|docker_config/u,
  );
  console.log('PRODUCTION_ARTIFACT_REPOSITORY_SOURCE_COUNT=1');
});

test('Runtime IAM owns only two accounts and ten exact secret-level grants', () => {
  const config = DOMAINS.runtimeIam;
  const moduleMain = normalizedSource(`${config.module}/main.tf`);
  const productionMain = normalizedSource(
    `${config.root}/environments/production/main.tf`,
  );
  const resources = findResources(terraformFiles(config.root));
  assert.deepEqual(
    resources.map(({ type, name }) => [type, name]),
    [
      ['google_service_account', 'runtime'],
      ['google_secret_manager_secret_iam_member', 'secret_accessor'],
    ],
  );
  const managed = extractBlock(
    productionMain,
    /managed_runtime_service_accounts\s*=\s*\{/u,
    'managed runtime accounts',
  );
  assertNestedMap(managed, MANAGED_RUNTIME_ACCOUNTS);
  const existing = extractBlock(
    productionMain,
    /existing_runtime_service_account_ids\s*=\s*\{/u,
    'existing runtime IDs',
  );
  assert.deepEqual(parseFlatStringAssignments(existing), EXISTING_RUNTIME_IDS);
  const grants = extractBlock(
    productionMain,
    /secret_access_grants\s*=\s*\{/u,
    'Production secret grants',
  );
  assertNestedMap(grants, runtimeGrants('production'));

  const serviceAccount = resourceByName(
    resources,
    'google_service_account',
    'runtime',
  );
  assert.match(serviceAccount, /for_each\s*=\s*var\.managed_runtime_service_accounts/u);
  assert.match(serviceAccount, /deletion_policy\s*=\s*"PREVENT"/u);
  assert.match(serviceAccount, /prevent_destroy\s*=\s*true/u);
  const secretAccessor = resourceByName(
    resources,
    'google_secret_manager_secret_iam_member',
    'secret_accessor',
  );
  assert.match(secretAccessor, /for_each\s*=\s*var\.secret_access_grants/u);
  assert.match(secretAccessor, /role\s*=\s*"roles\/secretmanager\.secretAccessor"/u);
  assert.doesNotMatch(
    moduleMain,
    /google_service_account_key|google_project_iam_|roles\/iam\.serviceAccountTokenCreator/u,
  );
  console.log('PRODUCTION_RUNTIME_MANAGED_SERVICE_ACCOUNT_COUNT=2');
  console.log('PRODUCTION_RUNTIME_SECRET_ACCESS_GRANT_COUNT=10');
});

test('Deployment Identity owns exactly the approved 11-instance WIF authorization model', () => {
  const config = DOMAINS.deploymentIdentity;
  const moduleMain = normalizedSource(`${config.module}/main.tf`);
  const productionMain = normalizedSource(
    `${config.root}/environments/production/main.tf`,
  );
  const resources = findResources(terraformFiles(config.root));
  assert.deepEqual(
    resources.map(({ type, name }) => [type, name]),
    [
      ['google_iam_workload_identity_pool', 'github'],
      ['google_iam_workload_identity_pool_provider', 'github'],
      ['google_service_account_iam_member', 'github_workload_identity_user'],
      ['google_artifact_registry_repository_iam_member', 'artifact_writer'],
      ['google_storage_bucket_iam_member', 'terraform_state_object_admin'],
      ['google_project_iam_member', 'cloud_run_developer'],
      ['google_service_account_iam_member', 'runtime_service_account_user'],
    ],
  );
  const githubIdentity = extractBlock(
    productionMain,
    /github_identity\s*=\s*\{/u,
    'GitHub identity',
  );
  assert.deepEqual(parseFlatStringAssignments(githubIdentity), {
    owner_name: GITHUB_IDENTITY.github_owner_name,
    owner_id: GITHUB_IDENTITY.github_owner_id,
    repository: GITHUB_IDENTITY.github_repository,
    repository_id: GITHUB_IDENTITY.github_repository_id,
    allowed_ref: GITHUB_IDENTITY.github_allowed_ref,
  });
  assert.match(productionMain, /workload_identity_pool_id\s*=\s*"moazez-github-production"/u);
  assert.match(productionMain, /workload_identity_provider_id\s*=\s*"moazez-backend-main"/u);
  assert.match(productionMain, /artifact_registry_repository_id\s*=\s*"moazez-production-containers"/u);
  assert.match(productionMain, /terraform_state_bucket\s*=\s*"moazez-production-91001421934-tfstate"/u);
  assert.deepEqual(
    parseFlatStringAssignments(
      extractBlock(
        productionMain,
        /runtime_service_account_ids\s*=\s*\{/u,
        'runtime actAs IDs',
      ),
    ),
    RUNTIME_SERVICE_ACCOUNT_IDS,
  );

  assert.match(moduleMain, /"MOAZEZ GitHub staging deploy"/u);
  assert.match(moduleMain, /"MOAZEZ GitHub production deploy"/u);
  assert.match(
    moduleMain,
    /"MOAZEZ GitHub Actions staging deployment identity pool\."/u,
  );
  assert.match(
    moduleMain,
    /"MOAZEZ GitHub Actions production deployment identity pool\."/u,
  );
  const provider = resourceByName(
    resources,
    'google_iam_workload_identity_pool_provider',
    'github',
  );
  const mapping = extractBlock(provider, /attribute_mapping\s*=\s*\{/u, 'attribute mapping');
  assert.deepEqual(
    Object.fromEntries(
      [...mapping.matchAll(/"([^"]+)"\s*=\s*"([^"]+)"/gu)].map((match) => [
        match[1],
        match[2],
      ]),
    ),
    {
      'google.subject': 'assertion.sub',
      'attribute.repository': 'assertion.repository',
      'attribute.repository_id': 'assertion.repository_id',
      'attribute.repository_owner': 'assertion.repository_owner',
      'attribute.repository_owner_id': 'assertion.repository_owner_id',
      'attribute.ref': 'assertion.ref',
    },
  );
  assert.match(provider, /issuer_uri\s*=\s*"https:\/\/token\.actions\.githubusercontent\.com"/u);
  const conditionAssignment =
    /github_attribute_condition\s*=\s*([\s\S]*?)\n\s*pool_display_name\s*=/u.exec(
      moduleMain,
    );
  assert.ok(conditionAssignment, 'Missing exact GitHub attribute condition assignment.');
  assert.equal(
    canonicalHcl(conditionAssignment[1]),
    canonicalHcl(`format(
      "assertion.repository_id == \\"%s\\" && assertion.repository_owner_id == \\"%s\\" && assertion.ref == \\"%s\\"",
      var.github_repository_id,
      var.github_owner_id,
      var.github_allowed_ref,
    )`),
  );
  assert.doesNotMatch(conditionAssignment[1], /\*/u);

  const workloadIdentityUser = resourceByName(
    resources,
    'google_service_account_iam_member',
    'github_workload_identity_user',
  );
  assert.match(workloadIdentityUser, /roles\/iam\.workloadIdentityUser/u);
  const principalAssignment =
    /\bmember\s*=\s*([\s\S]*?)\n\s*depends_on\s*=/u.exec(workloadIdentityUser);
  assert.ok(principalAssignment, 'Missing exact Workload Identity User member.');
  assert.equal(
    canonicalHcl(principalAssignment[1]),
    canonicalHcl(`format(
      "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.repository_id/%s",
      var.project_number,
      google_iam_workload_identity_pool.github.workload_identity_pool_id,
      var.github_repository_id,
    )`),
  );
  assert.doesNotMatch(principalAssignment[1], /\*/u);
  const productionIdentity = CONTRACTS.deploymentIdentity.production;
  assert.equal(
    `assertion.repository_id == "${productionIdentity.github_repository_id}" && assertion.repository_owner_id == "${productionIdentity.github_owner_id}" && assertion.ref == "${productionIdentity.github_allowed_ref}"`,
    'assertion.repository_id == "1217512033" && assertion.repository_owner_id == "127324203" && assertion.ref == "refs/heads/main"',
  );
  assert.equal(
    `principalSet://iam.googleapis.com/projects/${productionIdentity.project_number}/locations/global/workloadIdentityPools/${productionIdentity.workload_identity_pool_id}/attribute.repository_id/${productionIdentity.github_repository_id}`,
    'principalSet://iam.googleapis.com/projects/91001421934/locations/global/workloadIdentityPools/moazez-github-production/attribute.repository_id/1217512033',
  );
  const artifactWriter = resourceByName(
    resources,
    'google_artifact_registry_repository_iam_member',
    'artifact_writer',
  );
  assert.match(artifactWriter, /repository\s*=\s*var\.artifact_registry_repository_id/u);
  assert.match(artifactWriter, /roles\/artifactregistry\.writer/u);
  const stateObjectAdmin = resourceByName(
    resources,
    'google_storage_bucket_iam_member',
    'terraform_state_object_admin',
  );
  assert.match(stateObjectAdmin, /bucket\s*=\s*var\.terraform_state_bucket/u);
  assert.match(stateObjectAdmin, /roles\/storage\.objectAdmin/u);
  const runDeveloper = resourceByName(
    resources,
    'google_project_iam_member',
    'cloud_run_developer',
  );
  assert.match(runDeveloper, /role\s*=\s*"roles\/run\.developer"/u);
  const serviceAccountUser = resourceByName(
    resources,
    'google_service_account_iam_member',
    'runtime_service_account_user',
  );
  assert.match(serviceAccountUser, /for_each\s*=\s*var\.runtime_service_account_ids/u);
  assert.match(serviceAccountUser, /role\s*=\s*"roles\/iam\.serviceAccountUser"/u);
  assert.equal(
    resources.filter(({ type }) => type === 'google_project_iam_member').length,
    1,
  );
  assert.doesNotMatch(
    moduleMain,
    /roles\/iam\.serviceAccountTokenCreator|roles\/(?:owner|editor)|roles\/secretmanager\.secretAccessor|google_service_account_key|member\s*=\s*"\*"/iu,
  );
  console.log('PRODUCTION_DEPLOYMENT_IDENTITY_MANAGED_INSTANCE_COUNT=11');
});

test('global Terraform ownership and forbidden-resource boundary is exact', () => {
  const allSource = Object.values(DOMAINS)
    .map((config) => terraformFiles(config.root))
    .join('\n');
  assert.doesNotMatch(allSource, /terraform_remote_state/u);
  assert.doesNotMatch(allSource, /^\s*import\s*\{/gmu);
  assert.doesNotMatch(allSource, /resource\s+"(?:terraform_data|null_resource)"/u);
  assert.doesNotMatch(allSource, /resource\s+"google_project_service"/u);
  assert.doesNotMatch(allSource, /resource\s+"google_secret_manager_secret_version"/u);
  assert.doesNotMatch(allSource, /resource\s+"google_service_account_key"/u);
  assert.doesNotMatch(allSource, /resource\s+"google_storage_bucket"\s+/u);
  assert.doesNotMatch(
    allSource,
    /resource\s+"google_(?:cloud_run|sql_|redis_|compute_network|compute_subnetwork|compute_router|vpc_access_connector)/u,
  );
  assert.doesNotMatch(allSource, /roles\/iam\.serviceAccountTokenCreator/u);
  assert.doesNotMatch(allSource, /roles\/(?:owner|editor)/iu);
  assert.doesNotMatch(allSource, /google_project_iam_(?:policy|binding)/u);

  const projectMembers = findResources(allSource).filter(
    ({ type }) => type === 'google_project_iam_member',
  );
  assert.deepEqual(
    projectMembers.map(({ name }) => name),
    ['cloud_run_developer'],
  );
  assert.match(projectMembers[0].body, /roles\/run\.developer/u);
  assert.equal(
    findResources(allSource).filter(
      ({ type }) => type === 'google_storage_bucket_iam_member',
    ).length,
    1,
  );
  console.log('TERRAFORM_REMOTE_STATE_USED=NO');
  console.log('IMPORT_BLOCK_CREATED=NO');
  console.log('API_ENABLEMENT_RESOURCE_CREATED=NO');
  console.log('SERVICE_ACCOUNT_KEY_RESOURCE_CREATED=NO');
  console.log('TOKEN_CREATOR_GRANTED=NO');
  console.log('OWNER_EDITOR_GRANTED=NO');
  console.log('PROJECT_WIDE_SECRET_ACCESSOR_GRANTED=NO');
  console.log('PROJECT_WIDE_SERVICE_ACCOUNT_USER_GRANTED=NO');
});

test('READMEs preserve source-only Production claims and exact discovery status', () => {
  for (const config of Object.values(DOMAINS)) {
    const readme = normalizedSource(`${config.root}/README.md`);
    for (const marker of STATUS_MARKERS) {
      assert.ok(readme.includes(marker), `${config.root}/README.md missing ${marker}`);
    }
    assert.match(readme, /Stage 26/u);
    assert.match(readme, /moazez-production/u);
    assert.match(readme, /91001421934/u);
    assert.match(readme, /me-central2/u);
    assert.match(
      readme,
      /zero\s+Stage\s+26\s+Terraform(?:-|\s+)state\s+residue/iu,
    );
    assert.match(
      readme,
      /not\s+(?:a\s+)?(?:provisioning\s+)?claim|not\s+evidence|does\s+not\s+claim/iu,
    );
  }
});

test('Stage 26C candidate change scope contains no application, Prisma, workflow, or unrelated source', () => {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    })
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((file) => file.replace(/\\/gu, '/'));
  const base = process.env.CI_BASE_SHA || BASE_SHA;
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  const candidateFiles = git([
    'diff',
    '--name-only',
    base,
    candidate,
    '--',
  ]).sort();
  assertStage26CandidateScope(candidateFiles);
});

test('Stage 26C scope activation ignores future unrelated PRs and rejects mixed Stage26 candidates', () => {
  assert.doesNotThrow(() =>
    assertStage26CandidateScope(['src/example-future-change.ts']),
  );
  assert.throws(
    () =>
      assertStage26CandidateScope([
        TEST_PATH,
        'src/example-unrelated-change.ts',
      ]),
    { code: 'ERR_ASSERTION' },
  );
});

test('Stage 26C TAP has the exact active CI owner assignment', () => {
  assert.deepEqual(classifyTestFile(TEST_PATH), {
    file: TEST_PATH,
    kind: 'node-tap',
    owner: 'production-foundation-source-governance',
    category: 'invariant',
    profile: 'runtime-governance',
    execution: 'pull-request',
  });
});
