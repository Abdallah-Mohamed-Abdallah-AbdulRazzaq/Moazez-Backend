'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const SQL_ROOT = 'infra/gcp/sql';
const NONPROD_ROOT = `${SQL_ROOT}/environments/nonprod`;
const PRODUCTION_ROOT = `${SQL_ROOT}/environments/production`;
const MODULE_ROOT = `${SQL_ROOT}/modules/sql-environment`;

const STAGING_TUPLE = Object.freeze({
  project_id: 'moazez-nonprod-91001421934',
  environment: 'staging',
  region: 'me-central2',
  instance_name: 'moazez-staging-postgres-me-central2',
  database_version: 'POSTGRES_16',
  edition: 'ENTERPRISE',
  tier: 'db-custom-N4-2-8192',
  availability_type: 'ZONAL',
  primary_zone: null,
  secondary_zone: null,
  disk_type: 'HYPERDISK_BALANCED',
  disk_size_gb: 20,
  disk_autoresize: true,
  disk_autoresize_limit_gb: 100,
  backups_enabled: true,
  point_in_time_recovery_enabled: true,
  transaction_log_retention_days: 7,
  retained_backups: 8,
  backup_retention_unit: 'COUNT',
  backup_location: null,
  max_connections: 100,
  ipv4_enabled: false,
  private_network:
    'projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc',
  allocated_ip_range: 'moazez-staging-psa',
  ssl_mode: 'ENCRYPTED_ONLY',
  enable_private_path_for_google_cloud_services: false,
  terraform_deletion_protection: true,
  gcp_deletion_protection_enabled: true,
});

const PRODUCTION_TUPLE = Object.freeze({
  project_id: 'moazez-production',
  environment: 'production',
  region: 'me-central2',
  instance_name: 'moazez-production-postgres-me-central2',
  database_version: 'POSTGRES_16',
  edition: 'ENTERPRISE_PLUS',
  tier: 'db-perf-optimized-N-2',
  availability_type: 'REGIONAL',
  primary_zone: 'me-central2-a',
  secondary_zone: 'me-central2-c',
  disk_type: 'PD_SSD',
  disk_size_gb: 20,
  disk_autoresize: true,
  disk_autoresize_limit_gb: 100,
  backups_enabled: true,
  point_in_time_recovery_enabled: true,
  transaction_log_retention_days: 14,
  retained_backups: 30,
  backup_retention_unit: 'COUNT',
  backup_location: 'me-central2',
  max_connections: 100,
  ipv4_enabled: false,
  private_network:
    'projects/moazez-production/global/networks/moazez-production-vpc',
  allocated_ip_range: 'moazez-production-psa',
  ssl_mode: 'ENCRYPTED_ONLY',
  enable_private_path_for_google_cloud_services: false,
  terraform_deletion_protection: true,
  gcp_deletion_protection_enabled: true,
});

const PRODUCTION_LOCAL = Object.freeze(
  Object.fromEntries(
    Object.entries(PRODUCTION_TUPLE).filter(
      ([name]) => !['project_id', 'environment', 'region'].includes(name),
    ),
  ),
);

const STAGING_BASELINE_BLOBS = Object.freeze({
  '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
  'main.tf': '9b6434b60b211fae8c4f8474e1ee7d4c9885f38b',
  'outputs.tf': 'b05573c1e746dfc552194494a5e6b8e4c0db63ef',
  'providers.tf': 'fc74f25a5128ab211eb08d5f1450b88c724bcac2',
  'variables.tf': '5faf64294aeb2df85c4cbe446ca9805d98bce707',
  'versions.tf': '7427ca9bf2f72b264a5a2c1f0ea6cef4ebc3b23b',
});

const VARIABLE_VALIDATION_CONDITIONS = Object.freeze({
  project_id:
    'contains(["moazez-nonprod-91001421934","moazez-production"],var.project_id)',
  environment: 'contains(["staging","production"],var.environment)',
  region: 'var.region=="me-central2"',
  instance_name:
    'contains(["moazez-staging-postgres-me-central2","moazez-production-postgres-me-central2"],var.instance_name)',
  database_version: 'var.database_version=="POSTGRES_16"',
  edition: 'contains(["ENTERPRISE","ENTERPRISE_PLUS"],var.edition)',
  tier: 'contains(["db-custom-N4-2-8192","db-perf-optimized-N-2"],var.tier)',
  availability_type:
    'contains(["ZONAL","REGIONAL"],var.availability_type)',
  primary_zone:
    'var.primary_zone==null||var.primary_zone=="me-central2-a"',
  secondary_zone:
    'var.secondary_zone==null||var.secondary_zone=="me-central2-c"',
  disk_type: 'contains(["HYPERDISK_BALANCED","PD_SSD"],var.disk_type)',
  disk_size_gb: 'var.disk_size_gb==20',
  disk_autoresize: 'var.disk_autoresize==true',
  disk_autoresize_limit_gb: 'var.disk_autoresize_limit_gb==100',
  backups_enabled: 'var.backups_enabled==true',
  point_in_time_recovery_enabled:
    'var.point_in_time_recovery_enabled==true',
  transaction_log_retention_days:
    'contains([7,14],var.transaction_log_retention_days)',
  retained_backups: 'contains([8,30],var.retained_backups)',
  backup_retention_unit: 'var.backup_retention_unit=="COUNT"',
  backup_location:
    'var.backup_location==null||var.backup_location=="me-central2"',
  max_connections: 'var.max_connections==100',
  ipv4_enabled: 'var.ipv4_enabled==false',
  private_network:
    'contains(["projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc","projects/moazez-production/global/networks/moazez-production-vpc"],var.private_network)',
  allocated_ip_range:
    'contains(["moazez-staging-psa","moazez-production-psa"],var.allocated_ip_range)',
  ssl_mode: 'var.ssl_mode=="ENCRYPTED_ONLY"',
  enable_private_path_for_google_cloud_services:
    'var.enable_private_path_for_google_cloud_services==false',
  terraform_deletion_protection:
    'var.terraform_deletion_protection==true',
  gcp_deletion_protection_enabled:
    'var.gcp_deletion_protection_enabled==true',
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

function gitBlobHash(source) {
  const content = Buffer.from(source, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${content.length}\0`, 'utf8'))
    .update(content)
    .digest('hex');
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

function extractBracketList(source, assignmentPattern, label) {
  const match = assignmentPattern.exec(source);
  assert.ok(match, `Missing ${label}.`);
  const openingBracket = source.indexOf('[', match.index);
  assert.notEqual(openingBracket, -1, `Missing opening bracket for ${label}.`);

  let depth = 0;
  for (let index = openingBracket; index < source.length; index += 1) {
    if (source[index] === '[') {
      depth += 1;
    } else if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBracket, index + 1);
      }
    }
  }

  assert.fail(`Missing closing bracket for ${label}.`);
}

function parseLiteral(rawValue) {
  if (rawValue === 'null') {
    return null;
  }
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  if (rawValue.startsWith('"')) {
    return JSON.parse(rawValue);
  }
  return Number(rawValue);
}

function parseLiteralAssignments(source) {
  const assignments = {};
  const pattern =
    /^\s*([a-z][a-z0-9_]*)\s*=\s*(null|true|false|-?\d+|"[^"\r\n]*")\s*$/gmu;
  for (const match of source.matchAll(pattern)) {
    assert.equal(
      Object.hasOwn(assignments, match[1]),
      false,
      `Duplicate literal assignment for ${match[1]}.`,
    );
    assignments[match[1]] = parseLiteral(match[2]);
  }
  return assignments;
}

function parseTupleComparisons(source) {
  const tuple = {};
  const pattern =
    /var\.([a-z][a-z0-9_]*)\s*==\s*(null|true|false|-?\d+|"[^"\r\n]*")/gmu;
  for (const match of source.matchAll(pattern)) {
    assert.equal(
      Object.hasOwn(tuple, match[1]),
      false,
      `Duplicate tuple comparison for ${match[1]}.`,
    );
    tuple[match[1]] = parseLiteral(match[2]);
  }
  return tuple;
}

function canonicalCondition(condition) {
  return condition.replace(/\s+/gu, '').replace(/,\]/gu, ']');
}

function hclLiteral(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function tupleCondition(tuple) {
  return Object.entries(tuple)
    .map(([name, value]) => `var.${name}==${hclLiteral(value)}`)
    .join('&&');
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
  return canonicalCondition(match[1]);
}

function tupleMatches(candidate, expected) {
  const expectedEntries = Object.entries(expected);
  return (
    Object.keys(candidate).length === expectedEntries.length &&
    expectedEntries.every(([name, value]) => candidate[name] === value)
  );
}

function governedTupleAccepted(candidate) {
  return (
    tupleMatches(candidate, STAGING_TUPLE) ||
    tupleMatches(candidate, PRODUCTION_TUPLE)
  );
}

test('Staging SQL root remains byte-semantic baseline source', () => {
  for (const [file, expectedBlob] of Object.entries(STAGING_BASELINE_BLOBS)) {
    assert.equal(
      gitBlobHash(normalizedSource(`${NONPROD_ROOT}/${file}`)),
      expectedBlob,
      `${file} differs from the exact Stage 24A baseline.`,
    );
  }

  console.log('STAGING_CONTRACT_UNCHANGED=YES');
});

test('Production root locks the complete Stage 24C contract', () => {
  const main = normalizedSource(`${PRODUCTION_ROOT}/main.tf`);
  const variables = normalizedSource(`${PRODUCTION_ROOT}/variables.tf`);
  const providers = normalizedSource(`${PRODUCTION_ROOT}/providers.tf`);
  const versions = normalizedSource(`${PRODUCTION_ROOT}/versions.tf`);
  const outputs = normalizedSource(`${PRODUCTION_ROOT}/outputs.tf`);
  const rootSource = [main, variables, providers, versions, outputs].join('\n');

  assert.equal((rootSource.match(/^\s*resource\s+"/gmu) ?? []).length, 0);
  assert.equal((rootSource.match(/^\s*data\s+"/gmu) ?? []).length, 0);
  assert.equal((rootSource.match(/^\s*module\s+"/gmu) ?? []).length, 1);

  const productionLocal = extractBlock(
    main,
    /production_sql\s*=\s*\{/u,
    'production_sql local object',
  );
  assert.deepEqual(parseLiteralAssignments(productionLocal), PRODUCTION_LOCAL);

  const moduleBlock = extractBlock(
    main,
    /module\s+"sql_environment"\s*\{/u,
    'production sql_environment module',
  );
  assert.match(
    moduleBlock,
    /^\s*source\s*=\s*"\.\.\/\.\.\/modules\/sql-environment"\s*$/mu,
  );
  for (const variableName of ['project_id', 'environment', 'region']) {
    assert.match(
      moduleBlock,
      new RegExp(
        `^\\s*${variableName}\\s*=\\s*var\\.${variableName}\\s*$`,
        'mu',
      ),
    );
  }
  for (const localName of Object.keys(PRODUCTION_LOCAL)) {
    assert.match(
      moduleBlock,
      new RegExp(
        `^\\s*${localName}\\s*=\\s*local\\.production_sql\\.${localName}\\s*$`,
        'mu',
      ),
    );
  }

  const variableNames = [
    ...variables.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(variableNames, ['project_id', 'region', 'environment']);
  const rootLocks = {
    project_id: 'moazez-production',
    region: 'me-central2',
    environment: 'production',
  };
  for (const [name, value] of Object.entries(rootLocks)) {
    const variableBlock = extractBlock(
      variables,
      new RegExp(`variable\\s+"${name}"\\s*\\{`, 'u'),
      `production ${name} variable`,
    );
    assert.match(variableBlock, new RegExp(`default\\s*=\\s*"${value}"`, 'u'));
    assert.match(
      variableBlock,
      new RegExp(`condition\\s*=\\s*var\\.${name}\\s*==\\s*"${value}"`, 'u'),
    );
    assert.deepEqual(
      [...new Set([...variableBlock.matchAll(/var\.([a-z0-9_]+)/gu)].map((item) => item[1]))],
      [name],
    );
  }

  assert.equal((providers.match(/^provider\s+"google"\s*\{/gmu) ?? []).length, 1);
  assert.match(providers, /project\s*=\s*var\.project_id/u);
  assert.match(providers, /region\s*=\s*var\.region/u);
  assert.match(versions, /required_version\s*=\s*">= 1\.6\.0, < 2\.0\.0"/u);
  assert.match(versions, /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u);
  assert.match(versions, /prefix\s*=\s*"sql\/production"/u);
  assert.match(versions, /version\s*=\s*">= 7\.40\.0, < 8\.0\.0"/u);

  const expectedOutputs = [
    'project_id',
    'environment',
    'region',
    'instance_name',
    'connection_name',
    'database_version',
    'edition',
    'tier',
    'availability_type',
    'private_ip_address',
    'private_network',
    'allocated_ip_range',
    'ssl_mode',
    'self_link',
  ];
  const outputNames = [
    ...outputs.matchAll(/^output\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(outputNames, expectedOutputs);
  for (const outputName of expectedOutputs) {
    const outputBlock = extractBlock(
      outputs,
      new RegExp(`output\\s+"${outputName}"\\s*\\{`, 'u'),
      `${outputName} output`,
    );
    assert.match(
      outputBlock,
      new RegExp(`value\\s*=\\s*module\\.sql_environment\\.${outputName}`, 'u'),
    );
  }
  assert.doesNotMatch(outputs, /password|database_url|credential|access_token|private_key/iu);
  assert.equal(PRODUCTION_LOCAL.primary_zone, 'me-central2-a');
  assert.equal(PRODUCTION_LOCAL.secondary_zone, 'me-central2-c');
  assert.doesNotMatch(
    rootSource,
    /data_cache_config|authorized_networks|start_time|follow_gae_application/u,
  );

  console.log('PRODUCTION_ROOT_DIRECT_RESOURCE_COUNT=0');
  console.log('PRODUCTION_ROOT_DATA_SOURCE_COUNT=0');
  console.log('PRODUCTION_ROOT_MODULE_COUNT=1');
  console.log('PRODUCTION_PRIMARY_ZONE=me-central2-a');
  console.log('PRODUCTION_SECONDARY_ZONE=me-central2-c');
  console.log('PRODUCTION_REGION=me-central2');
  console.log('PRODUCTION_AVAILABILITY_TYPE=REGIONAL');
  console.log('PRODUCTION_EDITION=ENTERPRISE_PLUS');
  console.log('PRODUCTION_TIER=db-perf-optimized-N-2');
  console.log('PRODUCTION_DATABASE_VERSION=POSTGRES_16');
  console.log('PRODUCTION_STAGE_24C_CONTRACT=PASS');
});

test('Shared module permits only governed values and owns one SQL instance', () => {
  const moduleMain = normalizedSource(`${MODULE_ROOT}/main.tf`);
  const moduleVariables = normalizedSource(`${MODULE_ROOT}/variables.tf`);
  const stagingMain = normalizedSource(`${NONPROD_ROOT}/main.tf`);

  const resourceMatches = [
    ...moduleMain.matchAll(/^resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gmu),
  ];
  assert.equal(resourceMatches.length, 1);
  assert.deepEqual(resourceMatches[0].slice(1), [
    'google_sql_database_instance',
    'postgres',
  ]);
  assert.equal((moduleMain.match(/^\s*data\s+"/gmu) ?? []).length, 0);

  const variableNames = [
    ...moduleVariables.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(variableNames.sort(), Object.keys(STAGING_TUPLE).sort());

  for (const [name, expectedCondition] of Object.entries(
    VARIABLE_VALIDATION_CONDITIONS,
  )) {
    const variableBlock = extractBlock(
      moduleVariables,
      new RegExp(`variable\\s+"${name}"\\s*\\{`, 'u'),
      `${name} module variable`,
    );
    const referencedVariables = [
      ...new Set(
        [...variableBlock.matchAll(/var\.([a-z0-9_]+)/gu)].map(
          (match) => match[1],
        ),
      ),
    ];
    assert.deepEqual(referencedVariables, [name]);
    assert.equal(validationCondition(variableBlock, name), expectedCondition);
  }

  const backupLocationVariable = extractBlock(
    moduleVariables,
    /variable\s+"backup_location"\s*\{/u,
    'backup_location variable',
  );
  assert.match(backupLocationVariable, /default\s*=\s*null/u);

  for (const zoneVariableName of ['primary_zone', 'secondary_zone']) {
    const zoneVariable = extractBlock(
      moduleVariables,
      new RegExp(`variable\\s+"${zoneVariableName}"\\s*\\{`, 'u'),
      `${zoneVariableName} variable`,
    );
    assert.match(zoneVariable, /type\s*=\s*string/u);
    assert.match(zoneVariable, /default\s*=\s*null/u);
    assert.match(zoneVariable, /nullable\s*=\s*true/u);
  }

  const resourceBlock = extractBlock(
    moduleMain,
    /resource\s+"google_sql_database_instance"\s+"postgres"\s*\{/u,
    'Cloud SQL instance resource',
  );
  const backupBlock = extractBlock(
    resourceBlock,
    /backup_configuration\s*\{/u,
    'backup_configuration',
  );
  assert.match(backupBlock, /location\s*=\s*var\.backup_location/u);
  assert.doesNotMatch(backupBlock, /start_time/u);

  const databaseFlagBlocks = [
    ...resourceBlock.matchAll(/database_flags\s*\{/gu),
  ];
  assert.equal(databaseFlagBlocks.length, 1);
  const databaseFlag = extractBlock(
    resourceBlock,
    /database_flags\s*\{/u,
    'database_flags',
  );
  assert.match(databaseFlag, /name\s*=\s*"max_connections"/u);
  assert.match(databaseFlag, /value\s*=\s*tostring\(var\.max_connections\)/u);

  assert.equal(
    (resourceBlock.match(/dynamic\s+"location_preference"\s*\{/gu) ?? [])
      .length,
    1,
  );
  const locationPreference = extractBlock(
    resourceBlock,
    /dynamic\s+"location_preference"\s*\{/u,
    'dynamic location_preference',
  );
  const forEachMatch =
    /for_each\s*=\s*([\s\S]*?)\s+content\s*\{/u.exec(locationPreference);
  assert.ok(forEachMatch, 'Missing location_preference for_each expression.');
  assert.equal(
    canonicalCondition(forEachMatch[1]),
    '(var.primary_zone!=null&&var.secondary_zone!=null)?[1]:[]',
  );
  const locationContent = extractBlock(
    locationPreference,
    /content\s*\{/u,
    'location_preference content',
  );
  assert.deepEqual(
    [...locationContent.matchAll(/^\s*([a-z][a-z0-9_]*)\s*=/gmu)].map(
      (match) => match[1],
    ),
    ['zone', 'secondary_zone'],
  );
  assert.match(
    locationContent,
    /^\s*zone\s*=\s*var\.primary_zone\s*$/mu,
  );
  assert.match(
    locationContent,
    /^\s*secondary_zone\s*=\s*var\.secondary_zone\s*$/mu,
  );
  assert.doesNotMatch(locationPreference, /follow_gae_application/u);

  const stagingModule = extractBlock(
    stagingMain,
    /module\s+"sql_environment"\s*\{/u,
    'Staging sql_environment module',
  );
  assert.doesNotMatch(
    stagingModule,
    /^\s*(?:primary_zone|secondary_zone)\s*=/gmu,
  );
  assert.doesNotMatch(
    resourceBlock,
    /data_cache_config|authorized_networks|start_time|follow_gae_application/u,
  );

  console.log('SHARED_MODULE_MANAGED_RESOURCE_COUNT=1');
  console.log('SHARED_MODULE_LOCATION_PREFERENCE=PASS');
  console.log('STAGING_LOCATION_PREFERENCE_CONFIGURED=NO');
  console.log('PRODUCTION_LOCATION_PREFERENCE_CONFIGURED=YES');
  console.log(
    'PRODUCTION_MANAGED_RESOURCE=module.sql_environment.google_sql_database_instance.postgres',
  );
});

test('Lifecycle guard is an exact Staging-or-Production tuple gate', () => {
  const moduleMain = normalizedSource(`${MODULE_ROOT}/main.tf`);
  const lifecycle = extractBlock(moduleMain, /lifecycle\s*\{/u, 'lifecycle');
  assert.equal((moduleMain.match(/lifecycle\s*\{/gu) ?? []).length, 1);
  assert.equal((lifecycle.match(/precondition\s*\{/gu) ?? []).length, 1);

  const precondition = extractBlock(
    lifecycle,
    /precondition\s*\{/u,
    'tuple precondition',
  );
  const conditionMatch =
    /condition\s*=\s*([\s\S]*?)\s+error_message\s*=/u.exec(precondition);
  assert.ok(conditionMatch, 'Missing tuple precondition condition.');
  assert.equal(
    canonicalCondition(conditionMatch[1]),
    `((${tupleCondition(STAGING_TUPLE)})||(${tupleCondition(PRODUCTION_TUPLE)}))`,
  );

  const branches = precondition.split(/\)\s*\|\|\s*\(/u);
  assert.equal(branches.length, 2);
  assert.deepEqual(parseTupleComparisons(branches[0]), STAGING_TUPLE);
  assert.deepEqual(parseTupleComparisons(branches[1]), PRODUCTION_TUPLE);

  const rejectedMixtures = [
    {
      name: 'Production plus Staging VPC',
      tuple: {
        ...PRODUCTION_TUPLE,
        private_network: STAGING_TUPLE.private_network,
      },
    },
    {
      name: 'Production plus Staging PSA',
      tuple: {
        ...PRODUCTION_TUPLE,
        allocated_ip_range: STAGING_TUPLE.allocated_ip_range,
      },
    },
    {
      name: 'Production plus HYPERDISK_BALANCED',
      tuple: { ...PRODUCTION_TUPLE, disk_type: 'HYPERDISK_BALANCED' },
    },
    {
      name: 'Production plus missing backup location',
      tuple: { ...PRODUCTION_TUPLE, backup_location: null },
    },
    {
      name: 'Production with null zones',
      tuple: {
        ...PRODUCTION_TUPLE,
        primary_zone: null,
        secondary_zone: null,
      },
    },
    {
      name: 'Production with only primary zone',
      tuple: { ...PRODUCTION_TUPLE, secondary_zone: null },
    },
    {
      name: 'Production with only secondary zone',
      tuple: { ...PRODUCTION_TUPLE, primary_zone: null },
    },
    {
      name: 'Production with wrong primary zone',
      tuple: { ...PRODUCTION_TUPLE, primary_zone: 'me-central2-c' },
    },
    {
      name: 'Production with wrong secondary zone',
      tuple: { ...PRODUCTION_TUPLE, secondary_zone: 'me-central2-a' },
    },
    {
      name: 'Staging plus Enterprise Plus',
      tuple: { ...STAGING_TUPLE, edition: 'ENTERPRISE_PLUS' },
    },
    {
      name: 'Staging plus REGIONAL',
      tuple: { ...STAGING_TUPLE, availability_type: 'REGIONAL' },
    },
  ];
  assert.equal(governedTupleAccepted(STAGING_TUPLE), true);
  assert.equal(governedTupleAccepted(PRODUCTION_TUPLE), true);
  for (const mixture of rejectedMixtures) {
    assert.equal(
      governedTupleAccepted(mixture.tuple),
      false,
      `${mixture.name} must be rejected.`,
    );
  }

  const ignoreChanges = extractBracketList(
    lifecycle,
    /ignore_changes\s*=/u,
    'ignore_changes',
  );
  assert.equal(
    ignoreChanges.replace(/\s|,/gu, ''),
    '[settings[0].disk_size]',
  );

  console.log('CROSS_ENVIRONMENT_TUPLE_GUARD_PRESENT=PASS');
  console.log('PRODUCTION_NULL_ZONES_REJECTED=PASS');
  console.log('PRODUCTION_PARTIAL_ZONE_PAIR_REJECTED=PASS');
  console.log('PRODUCTION_WRONG_ZONE_PAIR_REJECTED=PASS');
  console.log('PRODUCTION_HYPERDISK_REJECTED=PASS');
  console.log('PRODUCTION_BACKUP_LOCATION_GUARD=PASS');
  console.log('LIFECYCLE_DISK_SIZE_ONLY=PASS');
});

test('Production lockfile and README retain source-only governance', () => {
  const nonprodLock = fs.readFileSync(
    absolutePath(`${NONPROD_ROOT}/.terraform.lock.hcl`),
  );
  const productionLock = fs.readFileSync(
    absolutePath(`${PRODUCTION_ROOT}/.terraform.lock.hcl`),
  );
  assert.equal(productionLock.equals(nonprodLock), true);
  assert.match(productionLock.toString('utf8'), /version\s*=\s*"7\.44\.0"/u);

  const readme = normalizedSource(`${SQL_ROOT}/README.md`);
  for (const requiredText of [
    'STAGING_ROOT=infra/gcp/sql/environments/nonprod',
    'PRODUCTION_ROOT=infra/gcp/sql/environments/production',
    'PRODUCTION_SQL_SOURCE_PREPARED != PRODUCTION_SQL_APPLIED',
    '`moazez-production-postgres-me-central2`',
    '`db-perf-optimized-N-2`',
    '`me-central2-a`',
    '`me-central2-c`',
    '`PD_SSD`, 20 GB initial',
    '`me-central2`',
    '`moazez-production-91001421934-tfstate`',
    '`sql/production`',
    'Stage 24C',
    'DevOps owns any later Stage 24C',
  ]) {
    assert.ok(readme.includes(requiredText), `README is missing: ${requiredText}`);
  }
  assert.match(readme, /does not prove[\s\S]*backup execution/iu);
  assert.match(readme, /does not prove[\s\S]*capacity/iu);
  assert.match(readme, /does not prove[\s\S]*successful HA placement/iu);
  assert.match(readme, /does not authorize Terraform\s+plan, apply/iu);

  console.log('PRODUCTION_LOCK_MATCHES_NONPROD_LOCK=YES');
  console.log('GOOGLE_PROVIDER_LOCK_VERSION=7.44.0');
  console.log('DETERMINISTIC_ZONE_SOURCE=PASS');
  console.log('CAPACITY_SUCCESS_GUARANTEE=NO');
  console.log('SOURCE_PREPARATION_ONLY=YES');
});
