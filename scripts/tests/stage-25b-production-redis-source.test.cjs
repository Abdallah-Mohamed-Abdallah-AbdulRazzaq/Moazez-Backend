'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const REDIS_ROOT = 'infra/gcp/redis';
const NONPROD_ROOT = `${REDIS_ROOT}/environments/nonprod`;
const PRODUCTION_ROOT = `${REDIS_ROOT}/environments/production`;
const MODULE_ROOT = `${REDIS_ROOT}/modules/redis-environment`;

const PRODUCTION_FILES = Object.freeze([
  '.terraform.lock.hcl',
  'main.tf',
  'outputs.tf',
  'providers.tf',
  'variables.tf',
  'versions.tf',
]);

const SAFE_OUTPUTS = Object.freeze([
  'project_id',
  'environment',
  'queue_instance_name',
  'queue_id',
  'queue_region',
  'queue_tier',
  'queue_memory_size_gb',
  'queue_redis_version',
  'queue_authorized_network',
  'queue_connect_mode',
  'queue_transit_encryption_mode',
  'queue_auth_enabled',
  'queue_deletion_protection',
  'realtime_instance_name',
  'realtime_id',
  'realtime_region',
  'realtime_tier',
  'realtime_memory_size_gb',
  'realtime_redis_version',
  'realtime_authorized_network',
  'realtime_connect_mode',
  'realtime_transit_encryption_mode',
  'realtime_auth_enabled',
  'realtime_deletion_protection',
]);

const STAGING_LOCAL_SOURCE = `staging_redis = {
  queue_instance_name = "moazez-staging-queue-me-central2"
  realtime_instance_name = "moazez-staging-realtime-me-central2"
  tier = "BASIC"
  queue_memory_size_gb = 1
  realtime_memory_size_gb = 1
  redis_version = "REDIS_7_2"
  authorized_network = "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
  connect_mode = "PRIVATE_SERVICE_ACCESS"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  auth_enabled = false
  deletion_protection = true
  queue_labels = {
    environment = "staging"
    redis_role = "queue"
  }
  realtime_labels = {
    environment = "staging"
    redis_role = "realtime"
  }
}`;

const PRODUCTION_LOCAL_SOURCE = `production_redis = {
  queue_instance_name = "moazez-production-queue-me-central2"
  realtime_instance_name = "moazez-production-realtime-me-central2"
  tier = "STANDARD_HA"
  queue_memory_size_gb = 2
  realtime_memory_size_gb = 1
  redis_version = "REDIS_7_2"
  authorized_network = "projects/moazez-production/global/networks/moazez-production-vpc"
  connect_mode = "PRIVATE_SERVICE_ACCESS"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  auth_enabled = false
  deletion_protection = true
  queue_labels = {
    environment = "production"
    redis_role = "queue"
  }
  realtime_labels = {
    environment = "production"
    redis_role = "realtime"
  }
}`;

const CURRENT_CONTRACT_SOURCE = `current_contract = {
  project_id = var.project_id
  environment = var.environment
  region = var.region
  queue_instance_name = var.queue_instance_name
  realtime_instance_name = var.realtime_instance_name
  tier = var.tier
  queue_memory_size_gb = var.queue_memory_size_gb
  realtime_memory_size_gb = var.realtime_memory_size_gb
  redis_version = var.redis_version
  authorized_network = var.authorized_network
  connect_mode = var.connect_mode
  transit_encryption_mode = var.transit_encryption_mode
  auth_enabled = var.auth_enabled
  deletion_protection = var.deletion_protection
  queue_labels = var.queue_labels
  realtime_labels = var.realtime_labels
}`;

const STAGING_CONTRACT_SOURCE = `staging_contract = {
  project_id = "moazez-nonprod-91001421934"
  environment = "staging"
  region = "me-central2"
  queue_instance_name = "moazez-staging-queue-me-central2"
  realtime_instance_name = "moazez-staging-realtime-me-central2"
  tier = "BASIC"
  queue_memory_size_gb = 1
  realtime_memory_size_gb = 1
  redis_version = "REDIS_7_2"
  authorized_network = "projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc"
  connect_mode = "PRIVATE_SERVICE_ACCESS"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  auth_enabled = false
  deletion_protection = true
  queue_labels = tomap({
    environment = "staging"
    redis_role = "queue"
  })
  realtime_labels = tomap({
    environment = "staging"
    redis_role = "realtime"
  })
}`;

const PRODUCTION_CONTRACT_SOURCE = `production_contract = {
  project_id = "moazez-production"
  environment = "production"
  region = "me-central2"
  queue_instance_name = "moazez-production-queue-me-central2"
  realtime_instance_name = "moazez-production-realtime-me-central2"
  tier = "STANDARD_HA"
  queue_memory_size_gb = 2
  realtime_memory_size_gb = 1
  redis_version = "REDIS_7_2"
  authorized_network = "projects/moazez-production/global/networks/moazez-production-vpc"
  connect_mode = "PRIVATE_SERVICE_ACCESS"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  auth_enabled = false
  deletion_protection = true
  queue_labels = tomap({
    environment = "production"
    redis_role = "queue"
  })
  realtime_labels = tomap({
    environment = "production"
    redis_role = "realtime"
  })
}`;

const STAGING_BASELINE_BLOBS = Object.freeze({
  '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
  'outputs.tf': 'a2e8d589c1e8bac5fa79bbbd8cfb06d3f12a7e45',
  'providers.tf': 'fc74f25a5128ab211eb08d5f1450b88c724bcac2',
  'variables.tf': '36d460a534aac4b83c204b61c6aa9eee7777145e',
  'versions.tf': '11c080ba95a5cf0003dc55c58a344c2bcc42dcf1',
});

const VARIABLE_VALIDATION_CONDITIONS = Object.freeze({
  project_id:
    'contains(["moazez-nonprod-91001421934","moazez-production"],var.project_id)',
  environment: 'contains(["staging","production"],var.environment)',
  region: 'var.region=="me-central2"',
  queue_instance_name:
    'contains(["moazez-staging-queue-me-central2","moazez-production-queue-me-central2"],var.queue_instance_name)',
  realtime_instance_name:
    'contains(["moazez-staging-realtime-me-central2","moazez-production-realtime-me-central2"],var.realtime_instance_name)',
  tier: 'contains(["BASIC","STANDARD_HA"],var.tier)',
  queue_memory_size_gb: 'contains([1,2],var.queue_memory_size_gb)',
  realtime_memory_size_gb: 'var.realtime_memory_size_gb==1',
  redis_version: 'var.redis_version=="REDIS_7_2"',
  authorized_network:
    'contains(["projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc","projects/moazez-production/global/networks/moazez-production-vpc"],var.authorized_network)',
  connect_mode: 'var.connect_mode=="PRIVATE_SERVICE_ACCESS"',
  transit_encryption_mode:
    'var.transit_encryption_mode=="SERVER_AUTHENTICATION"',
  auth_enabled: 'var.auth_enabled==false',
  deletion_protection: 'var.deletion_protection==true',
  queue_labels:
    '(length(var.queue_labels)==2&&contains(["staging","production"],lookup(var.queue_labels,"environment",""))&&lookup(var.queue_labels,"redis_role","")=="queue")',
  realtime_labels:
    '(length(var.realtime_labels)==2&&contains(["staging","production"],lookup(var.realtime_labels,"environment",""))&&lookup(var.realtime_labels,"redis_role","")=="realtime")',
});

function absolutePath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function readSource(relativePath) {
  return fs.readFileSync(absolutePath(relativePath), 'utf8');
}

function normalizedSource(relativePath) {
  return readSource(relativePath).replace(/\r\n/gu, '\n');
}

function withoutHclComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        output += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      } else if (character === '\n') {
        output += character;
      }
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === '#') {
      lineComment = true;
    } else if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
    } else {
      output += character;
    }
  }

  return output;
}

function extractBlock(source, headerPattern, label) {
  const flags = headerPattern.flags.replaceAll('g', '');
  const match = new RegExp(headerPattern.source, flags).exec(source);
  assert.ok(match, `Missing ${label}.`);

  const openingBrace = source.indexOf('{', match.index);
  assert.notEqual(openingBrace, -1, `Missing opening brace for ${label}.`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index, index + 1);
      }
    }
  }

  assert.fail(`Missing closing brace for ${label}.`);
}

function blockAssignmentExpressions(block) {
  const openingBrace = block.indexOf('{');
  const closingBrace = block.lastIndexOf('}');
  const body = block.slice(openingBrace + 1, closingBrace);
  const assignments = {};
  const pattern = /^\s*([a-z][a-z0-9_]*)\s*=\s*([^\r\n]+?)\s*$/gmu;
  for (const match of body.matchAll(pattern)) {
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
  return withoutHclComments(source)
    .replace(/\s+/gu, '')
    .replace(/,\]/gu, ']');
}

function validationCondition(variableBlock, variableName) {
  const validation = extractBlock(
    variableBlock,
    /validation\s*\{/u,
    `${variableName} validation`,
  );
  const match = /condition\s*=\s*([\s\S]*?)\s+error_message\s*=/u.exec(
    validation,
  );
  assert.ok(match, `Missing validation condition for ${variableName}.`);
  return canonicalHcl(match[1]);
}

function gitBlobHash(source) {
  const content = Buffer.from(source, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${content.length}\0`, 'utf8'))
    .update(content)
    .digest('hex');
}

function terraformSources(relativeRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.terraform') {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.name.endsWith('.tf')) {
        files.push(fs.readFileSync(entryPath, 'utf8'));
      }
    }
  };
  visit(absolutePath(relativeRoot));
  return files.join('\n').replace(/\r\n/gu, '\n');
}

function assertRootLocks(variables, expectedLocks) {
  const names = [
    ...variables.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(names, ['project_id', 'region', 'environment']);

  for (const [name, value] of Object.entries(expectedLocks)) {
    const variableBlock = extractBlock(
      variables,
      new RegExp(`variable\\s+"${name}"\\s*\\{`, 'u'),
      `${name} root variable`,
    );
    assert.match(variableBlock, new RegExp(`default\\s*=\\s*"${value}"`, 'u'));
    assert.match(
      variableBlock,
      new RegExp(`condition\\s*=\\s*var\\.${name}\\s*==\\s*"${value}"`, 'u'),
    );
  }
}

function assertModuleCaller(main, localName) {
  const moduleBlock = extractBlock(
    main,
    /module\s+"redis_environment"\s*\{/u,
    `${localName} redis_environment module`,
  );
  assert.deepEqual(blockAssignmentExpressions(moduleBlock), {
    source: '"../../modules/redis-environment"',
    project_id: 'var.project_id',
    environment: 'var.environment',
    region: 'var.region',
    queue_instance_name: `local.${localName}.queue_instance_name`,
    realtime_instance_name: `local.${localName}.realtime_instance_name`,
    tier: `local.${localName}.tier`,
    queue_memory_size_gb: `local.${localName}.queue_memory_size_gb`,
    realtime_memory_size_gb: `local.${localName}.realtime_memory_size_gb`,
    redis_version: `local.${localName}.redis_version`,
    authorized_network: `local.${localName}.authorized_network`,
    connect_mode: `local.${localName}.connect_mode`,
    transit_encryption_mode: `local.${localName}.transit_encryption_mode`,
    auth_enabled: `local.${localName}.auth_enabled`,
    deletion_protection: `local.${localName}.deletion_protection`,
    queue_labels: `local.${localName}.queue_labels`,
    realtime_labels: `local.${localName}.realtime_labels`,
  });
}

test('Production Redis root has the exact source-only file and caller contract', () => {
  const files = fs
    .readdirSync(absolutePath(PRODUCTION_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(files, [...PRODUCTION_FILES].sort());

  const main = withoutHclComments(normalizedSource(`${PRODUCTION_ROOT}/main.tf`));
  const variables = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/variables.tf`),
  );
  const providers = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/providers.tf`),
  );
  const rootSource = terraformSources(PRODUCTION_ROOT);

  assert.equal((rootSource.match(/^\s*resource\s+"/gmu) ?? []).length, 0);
  assert.equal((rootSource.match(/^\s*data\s+"/gmu) ?? []).length, 0);
  assert.equal((rootSource.match(/^\s*module\s+"/gmu) ?? []).length, 1);

  const productionLocal = extractBlock(
    main,
    /production_redis\s*=\s*\{/u,
    'production_redis local object',
  );
  assert.equal(canonicalHcl(productionLocal), canonicalHcl(PRODUCTION_LOCAL_SOURCE));
  assertModuleCaller(main, 'production_redis');
  assertRootLocks(variables, {
    project_id: 'moazez-production',
    region: 'me-central2',
    environment: 'production',
  });
  assert.equal((providers.match(/^provider\s+"google"\s*\{/gmu) ?? []).length, 1);
  assert.match(providers, /project\s*=\s*var\.project_id/u);
  assert.match(providers, /region\s*=\s*var\.region/u);

  console.log('PRODUCTION_REDIS_ROOT_CREATED=YES');
  console.log('PRODUCTION_ROOT_DIRECT_RESOURCE_COUNT=0');
  console.log('PRODUCTION_ROOT_DATA_SOURCE_COUNT=0');
  console.log('PRODUCTION_QUEUE_TIER=STANDARD_HA');
  console.log('PRODUCTION_QUEUE_MEMORY_GB=2');
  console.log('PRODUCTION_REALTIME_TIER=STANDARD_HA');
  console.log('PRODUCTION_REALTIME_MEMORY_GB=1');
});

test('Shared module owns only the two governed Redis resources', () => {
  const main = withoutHclComments(normalizedSource(`${MODULE_ROOT}/main.tf`));
  const variables = withoutHclComments(
    normalizedSource(`${MODULE_ROOT}/variables.tf`),
  );
  const allRedisTerraform = withoutHclComments(terraformSources(REDIS_ROOT));
  const resources = [
    ...allRedisTerraform.matchAll(
      /^resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gmu,
    ),
  ].map((match) => match.slice(1));

  assert.deepEqual(resources, [
    ['google_redis_instance', 'queue'],
    ['google_redis_instance', 'realtime'],
  ]);
  assert.equal((allRedisTerraform.match(/^\s*data\s+"/gmu) ?? []).length, 0);
  const moduleCalls = [
    ...allRedisTerraform.matchAll(/^module\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(moduleCalls, ['redis_environment', 'redis_environment']);
  assert.doesNotMatch(allRedisTerraform, /google_redis_cluster/u);
  assert.doesNotMatch(allRedisTerraform, /resource\s+"(?:terraform_data|null_resource)"/u);

  const queue = extractBlock(
    main,
    /resource\s+"google_redis_instance"\s+"queue"\s*\{/u,
    'Queue Redis resource',
  );
  const realtime = extractBlock(
    main,
    /resource\s+"google_redis_instance"\s+"realtime"\s*\{/u,
    'Realtime Redis resource',
  );
  assert.match(queue, /memory_size_gb\s*=\s*var\.queue_memory_size_gb/u);
  assert.match(realtime, /memory_size_gb\s*=\s*var\.realtime_memory_size_gb/u);
  assert.match(queue, /labels\s*=\s*var\.queue_labels/u);
  assert.match(realtime, /labels\s*=\s*var\.realtime_labels/u);
  assert.doesNotMatch(main, /\bvar\.memory_size_gb\b/u);
  assert.doesNotMatch(variables, /variable\s+"memory_size_gb"/u);

  for (const [name, resource] of [
    ['Queue', queue],
    ['Realtime', realtime],
  ]) {
    assert.match(resource, /deletion_protection\s*=\s*var\.deletion_protection/u);
    const lifecycle = extractBlock(resource, /lifecycle\s*\{/u, `${name} lifecycle`);
    assert.equal((resource.match(/lifecycle\s*\{/gu) ?? []).length, 1);
    assert.match(lifecycle, /prevent_destroy\s*=\s*true/u);
    assert.equal((lifecycle.match(/precondition\s*\{/gu) ?? []).length, 1);
    const precondition = extractBlock(
      lifecycle,
      /precondition\s*\{/u,
      `${name} tuple precondition`,
    );
    assert.match(precondition, /condition\s*=\s*local\.governed_contract/u);
  }

  assert.doesNotMatch(
    allRedisTerraform,
    /\b(?:location_id|alternative_location_id|read_replicas_mode|replica_count|persistence_config|reserved_ip_range|redis_configs|customer_managed_key)\b/u,
  );

  console.log('TERRAFORM_MANAGED_REDIS_RESOURCE_COUNT=2');
  console.log('OTHER_MANAGED_RESOURCE_COUNT=0');
  console.log('REDIS_CLUSTER_RESOURCE_CREATED=NO');
  console.log('VALIDATION_ONLY_RESOURCE_CREATED=NO');
  console.log('NETWORK_RESOURCE_CREATED=NO');
  console.log('SECRET_MANAGER_RESOURCE_CREATED=NO');
  console.log('IAM_RESOURCE_CREATED=NO');
  console.log('PREVENT_DESTROY=true');
  console.log('DELETION_PROTECTION=true');
});

test('Module validations and lifecycle permit only complete governed tuples', () => {
  const main = withoutHclComments(normalizedSource(`${MODULE_ROOT}/main.tf`));
  const variables = withoutHclComments(
    normalizedSource(`${MODULE_ROOT}/variables.tf`),
  );
  const variableNames = [
    ...variables.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(variableNames.sort(), Object.keys(VARIABLE_VALIDATION_CONDITIONS).sort());

  for (const [name, expectedCondition] of Object.entries(
    VARIABLE_VALIDATION_CONDITIONS,
  )) {
    const variableBlock = extractBlock(
      variables,
      new RegExp(`variable\\s+"${name}"\\s*\\{`, 'u'),
      `${name} module variable`,
    );
    assert.equal(validationCondition(variableBlock, name), expectedCondition);
  }

  for (const [name, expectedSource] of [
    ['current_contract', CURRENT_CONTRACT_SOURCE],
    ['staging_contract', STAGING_CONTRACT_SOURCE],
    ['production_contract', PRODUCTION_CONTRACT_SOURCE],
  ]) {
    const contract = extractBlock(
      main,
      new RegExp(`${name}\\s*=\\s*\\{`, 'u'),
      `${name} object`,
    );
    assert.equal(canonicalHcl(contract), canonicalHcl(expectedSource));
  }
  const governedContract = /governed_contract\s*=\s*\(([\s\S]*?)\)/u.exec(main);
  assert.ok(governedContract, 'Missing governed_contract expression.');
  assert.equal(
    canonicalHcl(governedContract[1]),
    'local.current_contract==local.staging_contract||local.current_contract==local.production_contract',
  );

  console.log('INDIVIDUAL_ALLOWED_VALUE_VALIDATIONS=PASS');
  console.log('CROSS_ENVIRONMENT_TUPLE_GUARD=PASS');
  console.log('MIXED_STAGING_PRODUCTION_TUPLE_ACCEPTED=NO');
});

test('Nonprod root preserves the exact Staging contract', () => {
  for (const [file, expectedBlob] of Object.entries(STAGING_BASELINE_BLOBS)) {
    assert.equal(
      gitBlobHash(normalizedSource(`${NONPROD_ROOT}/${file}`)),
      expectedBlob,
      `${file} differs from the Stage 25B authoritative baseline.`,
    );
  }

  const main = withoutHclComments(normalizedSource(`${NONPROD_ROOT}/main.tf`));
  const variables = withoutHclComments(
    normalizedSource(`${NONPROD_ROOT}/variables.tf`),
  );
  const stagingLocal = extractBlock(
    main,
    /staging_redis\s*=\s*\{/u,
    'staging_redis local object',
  );
  assert.equal(canonicalHcl(stagingLocal), canonicalHcl(STAGING_LOCAL_SOURCE));
  assertModuleCaller(main, 'staging_redis');
  assertRootLocks(variables, {
    project_id: 'moazez-nonprod-91001421934',
    region: 'me-central2',
    environment: 'staging',
  });

  console.log('STAGING_CONTRACT_CHANGED=NO');
  console.log('STAGING_QUEUE_MEMORY_GB=1');
  console.log('STAGING_REALTIME_MEMORY_GB=1');
});

test('Backend, provider, lockfile, and safe outputs are exact', () => {
  const versions = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/versions.tf`),
  );
  assert.match(versions, /required_version\s*=\s*">= 1\.6\.0, < 2\.0\.0"/u);
  assert.match(
    versions,
    /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u,
  );
  assert.match(versions, /prefix\s*=\s*"redis\/production"/u);
  assert.match(versions, /source\s*=\s*"hashicorp\/google"/u);
  assert.match(versions, /version\s*=\s*">= 7\.40\.0, < 8\.0\.0"/u);

  const nonprodLock = fs.readFileSync(
    absolutePath(`${NONPROD_ROOT}/.terraform.lock.hcl`),
  );
  const productionLock = fs.readFileSync(
    absolutePath(`${PRODUCTION_ROOT}/.terraform.lock.hcl`),
  );
  assert.equal(productionLock.equals(nonprodLock), true);
  assert.match(productionLock.toString('utf8'), /version\s*=\s*"7\.44\.0"/u);

  for (const root of [MODULE_ROOT, PRODUCTION_ROOT]) {
    const outputs = withoutHclComments(normalizedSource(`${root}/outputs.tf`));
    const outputNames = [
      ...outputs.matchAll(/^output\s+"([^"]+)"\s*\{/gmu),
    ].map((match) => match[1]);
    assert.deepEqual(outputNames, SAFE_OUTPUTS);
    assert.doesNotMatch(
      outputs,
      /\b(?:host|port|auth_string|ca_pem|private_key|password|credential|queue_redis_url|realtime_redis_url|secret_payload)\b/iu,
    );
  }

  const productionOutputs = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/outputs.tf`),
  );
  for (const outputName of SAFE_OUTPUTS) {
    const output = extractBlock(
      productionOutputs,
      new RegExp(`output\\s+"${outputName}"\\s*\\{`, 'u'),
      `${outputName} production output`,
    );
    assert.match(
      output,
      new RegExp(`value\\s*=\\s*module\\.redis_environment\\.${outputName}`, 'u'),
    );
  }

  console.log('PRODUCTION_BACKEND_BUCKET=moazez-production-91001421934-tfstate');
  console.log('PRODUCTION_STATE_PREFIX=redis/production');
  console.log('GOOGLE_PROVIDER_LOCK_VERSION=7.44.0');
  console.log('PRODUCTION_LOCK_MATCHES_NONPROD=YES');
  console.log('SAFE_OUTPUT_CONTRACT=PASS');
});

test('README distinguishes Stage 25B source preparation from provisioning', () => {
  const readme = normalizedSource(`${REDIS_ROOT}/README.md`);
  for (const requiredText of [
    'SOURCE_PREPARATION != CLOUD_PROVISIONING',
    'moazez-production-queue-me-central2',
    'moazez-production-realtime-me-central2',
    '`STANDARD_HA`',
    'Queue memory | 2 GiB',
    'Realtime memory | 1 GiB',
    '`REDIS_7_2`',
    'projects/moazez-production/global/networks/moazez-production-vpc',
    '`PRIVATE_SERVICE_ACCESS`',
    '`SERVER_AUTHENTICATION`',
    'AUTH is intentionally disabled in Stage 25',
    'Terraform deletion protection',
    'Terraform lifecycle `prevent_destroy`',
    '`moazez-production-91001421934-tfstate`',
    '`redis/production`',
    'PSA_CIDR=10.61.0.0/16',
    'Secret Manager, IAM, workload-identity, or',
    'not pinned',
    'No claim is made that either Production Redis instance exists.',
  ]) {
    assert.ok(readme.includes(requiredText), `README is missing: ${requiredText}`);
  }
  assert.match(readme, /two physically independent Redis instances/iu);
  assert.match(readme, /BullMQ failure domain[\s\S]*Socket\.IO/iu);
  assert.match(
    readme,
    /external prerequisites owned outside\s+this Redis stack/iu,
  );
  assert.match(readme, /does not create[\s\S]*runtime-delivery resources/iu);
  assert.match(
    readme,
    /Stage 25B does\s+not prove Redis creation, TLS connectivity, runtime CA trust, or application\s+cutover\./u,
  );

  console.log('README_STAGE25_PRODUCTION_SOURCE_CONTRACT=PASS');
  console.log('SOURCE_PREPARATION_ONLY=YES');
  console.log('CLOUD_PROVISIONING_CLAIMED=NO');
});
