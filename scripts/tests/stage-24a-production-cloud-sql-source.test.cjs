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
  edition: 'ENTERPRISE',
  tier: 'db-custom-N4-2-16384',
  availability_type: 'REGIONAL',
  primary_zone: null,
  secondary_zone: null,
  disk_type: 'HYPERDISK_BALANCED',
  disk_size_gb: 20,
  disk_autoresize: true,
  disk_autoresize_limit_gb: 100,
  backups_enabled: true,
  point_in_time_recovery_enabled: true,
  transaction_log_retention_days: 7,
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
      ([name]) =>
        ![
          'project_id',
          'environment',
          'region',
          'primary_zone',
          'secondary_zone',
        ].includes(name),
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
  edition: 'var.edition=="ENTERPRISE"',
  tier: 'contains(["db-custom-N4-2-8192","db-custom-N4-2-16384"],var.tier)',
  availability_type: 'contains(["ZONAL","REGIONAL"],var.availability_type)',
  primary_zone: 'var.primary_zone==null||var.primary_zone=="me-central2-a"',
  secondary_zone:
    'var.secondary_zone==null||var.secondary_zone=="me-central2-c"',
  disk_type: 'var.disk_type=="HYPERDISK_BALANCED"',
  disk_size_gb: 'var.disk_size_gb==20',
  disk_autoresize: 'var.disk_autoresize==true',
  disk_autoresize_limit_gb: 'var.disk_autoresize_limit_gb==100',
  backups_enabled: 'var.backups_enabled==true',
  point_in_time_recovery_enabled: 'var.point_in_time_recovery_enabled==true',
  transaction_log_retention_days: 'var.transaction_log_retention_days==7',
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
  terraform_deletion_protection: 'var.terraform_deletion_protection==true',
  gcp_deletion_protection_enabled: 'var.gcp_deletion_protection_enabled==true',
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

function blockAssignmentExpressions(block) {
  const openingBrace = block.indexOf('{');
  const closingBrace = block.lastIndexOf('}');
  assert.notEqual(openingBrace, -1, 'Assignment block has no opening brace.');
  assert.ok(
    closingBrace > openingBrace,
    'Assignment block has no closing brace.',
  );

  const body = withoutHclComments(block.slice(openingBrace + 1, closingBrace));
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

function markdownSection(source, heading) {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing README section: ${heading}.`);
  const remainder = source.slice(start + marker.length);
  const nextHeading = /^##\s+/mu.exec(remainder);
  return remainder.slice(0, nextHeading?.index ?? remainder.length);
}

function withoutMarkdownComments(source) {
  return source.replace(/<!--[\s\S]*?-->/gu, '');
}

function markdownTable(section) {
  const rows = section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  assert.ok(rows.length >= 3, 'README section is missing its governed table.');
  assert.deepEqual(rows[0], ['Component', 'Approved value']);
  assert.deepEqual(rows[1], ['---', '---']);
  const table = Object.fromEntries(rows.slice(2));
  assert.equal(
    Object.keys(table).length,
    rows.length - 2,
    'README governed table contains a duplicate component.',
  );
  return table;
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
  for (const match of withoutHclComments(source).matchAll(pattern)) {
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
  const main = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/main.tf`),
  );
  const variables = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/variables.tf`),
  );
  const providers = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/providers.tf`),
  );
  const versions = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/versions.tf`),
  );
  const outputs = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/outputs.tf`),
  );
  const rootSource = [main, variables, providers, versions, outputs].join('\n');

  assert.equal((rootSource.match(/^\s*resource\s+"/gmu) ?? []).length, 0);
  assert.equal((rootSource.match(/^\s*data\s+"/gmu) ?? []).length, 0);
  assert.equal((rootSource.match(/^\s*module\s+"/gmu) ?? []).length, 1);

  const productionLocal = extractBlock(
    main,
    /production_sql\s*=\s*\{/u,
    'production_sql local object',
  );
  assert.deepEqual(
    Object.keys(blockAssignmentExpressions(productionLocal)),
    Object.keys(PRODUCTION_LOCAL),
  );
  assert.deepEqual(parseLiteralAssignments(productionLocal), PRODUCTION_LOCAL);

  const moduleBlock = extractBlock(
    main,
    /module\s+"sql_environment"\s*\{/u,
    'production sql_environment module',
  );
  const expectedModuleAssignments = {
    source: '"../../modules/sql-environment"',
    project_id: 'var.project_id',
    environment: 'var.environment',
    region: 'var.region',
    ...Object.fromEntries(
      Object.keys(PRODUCTION_LOCAL).map((name) => [
        name,
        `local.production_sql.${name}`,
      ]),
    ),
  };
  assert.deepEqual(
    blockAssignmentExpressions(moduleBlock),
    expectedModuleAssignments,
  );

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
      [
        ...new Set(
          [...variableBlock.matchAll(/var\.([a-z0-9_]+)/gu)].map(
            (item) => item[1],
          ),
        ),
      ],
      [name],
    );
  }

  assert.equal(
    (providers.match(/^provider\s+"google"\s*\{/gmu) ?? []).length,
    1,
  );
  assert.match(providers, /project\s*=\s*var\.project_id/u);
  assert.match(providers, /region\s*=\s*var\.region/u);
  assert.match(versions, /required_version\s*=\s*">= 1\.6\.0, < 2\.0\.0"/u);
  assert.match(
    versions,
    /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u,
  );
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
  const outputNames = [...outputs.matchAll(/^output\s+"([^"]+)"\s*\{/gmu)].map(
    (match) => match[1],
  );
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
  assert.doesNotMatch(
    outputs,
    /password|database_url|credential|access_token|private_key/iu,
  );
  assert.equal(PRODUCTION_TUPLE.primary_zone, null);
  assert.equal(PRODUCTION_TUPLE.secondary_zone, null);
  assert.doesNotMatch(
    main,
    /\b(?:machine_series|vcpu|memory_mb|primary_zone|secondary_zone)\b|me-central2-[ac]\b/u,
  );
  const tierIdentity = /^db-custom-(N4)-(\d+)-(\d+)$/u.exec(
    PRODUCTION_LOCAL.tier,
  );
  assert.ok(tierIdentity, 'Production tier must encode the governed N4 shape.');
  assert.deepEqual(tierIdentity.slice(1), ['N4', '2', '16384']);
  assert.doesNotMatch(
    rootSource,
    /data_cache_config|authorized_networks|start_time|follow_gae_application/u,
  );

  console.log('PRODUCTION_ROOT_DIRECT_RESOURCE_COUNT=0');
  console.log('PRODUCTION_ROOT_DATA_SOURCE_COUNT=0');
  console.log('PRODUCTION_ROOT_MODULE_COUNT=1');
  console.log('PRODUCTION_PRIMARY_ZONE_EXPLICIT=NO');
  console.log('PRODUCTION_SECONDARY_ZONE_EXPLICIT=NO');
  console.log('PRODUCTION_REGION=me-central2');
  console.log('PRODUCTION_AVAILABILITY_TYPE=REGIONAL');
  console.log('PRODUCTION_EDITION=ENTERPRISE');
  console.log('PRODUCTION_MACHINE_SERIES=N4');
  console.log('PRODUCTION_TIER=db-custom-N4-2-16384');
  console.log('PRODUCTION_VCPU=2');
  console.log('PRODUCTION_MEMORY_MB=16384');
  console.log('PRODUCTION_DATABASE_VERSION=POSTGRES_16');
  console.log('PRODUCTION_DISK_TYPE=HYPERDISK_BALANCED');
  console.log('PRODUCTION_TRANSACTION_LOG_RETENTION_DAYS=7');
  console.log('TIER_SOURCE_CONTRACT=PASS');
  console.log('PRODUCTION_STAGE_24C_CONTRACT=PASS');
});

test('Shared module permits only governed values and owns one SQL instance', () => {
  const moduleMain = withoutHclComments(
    normalizedSource(`${MODULE_ROOT}/main.tf`),
  );
  const moduleVariables = withoutHclComments(
    normalizedSource(`${MODULE_ROOT}/variables.tf`),
  );
  const stagingMain = withoutHclComments(
    normalizedSource(`${NONPROD_ROOT}/main.tf`),
  );
  const productionMain = withoutHclComments(
    normalizedSource(`${PRODUCTION_ROOT}/main.tf`),
  );

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
  const forEachMatch = /for_each\s*=\s*([\s\S]*?)\s+content\s*\{/u.exec(
    locationPreference,
  );
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
  assert.deepEqual(blockAssignmentExpressions(locationContent), {
    zone: 'var.primary_zone',
    secondary_zone: 'var.secondary_zone',
  });
  assert.doesNotMatch(locationPreference, /follow_gae_application/u);

  for (const [callerName, callerSource] of [
    ['Staging', stagingMain],
    ['Production', productionMain],
  ]) {
    const callerModule = extractBlock(
      callerSource,
      /module\s+"sql_environment"\s*\{/u,
      `${callerName} sql_environment module`,
    );
    const callerAssignments = blockAssignmentExpressions(callerModule);
    assert.equal(Object.hasOwn(callerAssignments, 'primary_zone'), false);
    assert.equal(Object.hasOwn(callerAssignments, 'secondary_zone'), false);
  }
  assert.doesNotMatch(
    resourceBlock,
    /data_cache_config|authorized_networks|start_time|follow_gae_application/u,
  );

  console.log('SHARED_MODULE_MANAGED_RESOURCE_COUNT=1');
  console.log('SHARED_MODULE_LOCATION_PREFERENCE=PASS');
  console.log('SHARED_MODULE_OPTIONAL_LOCATION_PREFERENCE_PRESERVED=YES');
  console.log('STAGING_LOCATION_PREFERENCE_CONFIGURED=NO');
  console.log('PRODUCTION_LOCATION_PREFERENCE_CONFIGURED=NO');
  console.log(
    'PRODUCTION_MANAGED_RESOURCE=module.sql_environment.google_sql_database_instance.postgres',
  );
});

test('Lifecycle guard is an exact Staging-or-Production tuple gate', () => {
  const moduleMain = withoutHclComments(
    normalizedSource(`${MODULE_ROOT}/main.tf`),
  );
  const lifecycle = extractBlock(moduleMain, /lifecycle\s*\{/u, 'lifecycle');
  assert.equal((moduleMain.match(/lifecycle\s*\{/gu) ?? []).length, 1);
  assert.equal((lifecycle.match(/precondition\s*\{/gu) ?? []).length, 1);

  const precondition = extractBlock(
    lifecycle,
    /precondition\s*\{/u,
    'tuple precondition',
  );
  const conditionMatch = /condition\s*=\s*([\s\S]*?)\s+error_message\s*=/u.exec(
    precondition,
  );
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
      name: 'Production plus missing backup location',
      tuple: { ...PRODUCTION_TUPLE, backup_location: null },
    },
    {
      name: 'Old Enterprise Plus Production profile',
      tuple: { ...PRODUCTION_TUPLE, edition: 'ENTERPRISE_PLUS' },
    },
    {
      name: 'Old N2 Production profile',
      tuple: { ...PRODUCTION_TUPLE, tier: 'db-perf-optimized-N-2' },
    },
    {
      name: 'Old PD_SSD Production profile',
      tuple: { ...PRODUCTION_TUPLE, disk_type: 'PD_SSD' },
    },
    {
      name: 'Old 14-day Production implementation',
      tuple: { ...PRODUCTION_TUPLE, transaction_log_retention_days: 14 },
    },
    {
      name: 'Old deterministic a/c Production zone pair',
      tuple: {
        ...PRODUCTION_TUPLE,
        primary_zone: 'me-central2-a',
        secondary_zone: 'me-central2-c',
      },
    },
    {
      name: 'Production with only primary zone',
      tuple: { ...PRODUCTION_TUPLE, primary_zone: 'me-central2-a' },
    },
    {
      name: 'Production with only secondary zone',
      tuple: { ...PRODUCTION_TUPLE, secondary_zone: 'me-central2-c' },
    },
    {
      name: 'Production with arbitrary zones',
      tuple: {
        ...PRODUCTION_TUPLE,
        primary_zone: 'me-central2-b',
        secondary_zone: 'me-central2-d',
      },
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
  assert.equal(ignoreChanges.replace(/\s|,/gu, ''), '[settings[0].disk_size]');

  console.log('CROSS_ENVIRONMENT_TUPLE_GUARD=PASS');
  console.log('PRODUCTION_PARTIAL_ZONE_PAIR_REJECTED=PASS');
  console.log('PRODUCTION_ARBITRARY_ZONE_PAIR_REJECTED=PASS');
  console.log('OLD_ENTERPRISE_PLUS_PRODUCTION_REJECTED=PASS');
  console.log('OLD_N2_PRODUCTION_REJECTED=PASS');
  console.log('OLD_PD_SSD_PRODUCTION_REJECTED=PASS');
  console.log('OLD_14_DAY_PRODUCTION_IMPLEMENTATION_REJECTED=PASS');
  console.log('OLD_AC_ZONE_PAIR_PRODUCTION_REJECTED=PASS');
  console.log('PRODUCTION_BACKUP_LOCATION_GUARD=PASS');
  console.log('LIFECYCLE_DISK_SIZE_ONLY=PASS');
});

test('Production lockfile and README retain temporary source-only governance', () => {
  const nonprodLock = fs.readFileSync(
    absolutePath(`${NONPROD_ROOT}/.terraform.lock.hcl`),
  );
  const productionLock = fs.readFileSync(
    absolutePath(`${PRODUCTION_ROOT}/.terraform.lock.hcl`),
  );
  assert.equal(productionLock.equals(nonprodLock), true);
  assert.match(productionLock.toString('utf8'), /version\s*=\s*"7\.44\.0"/u);

  const readme = withoutMarkdownComments(
    normalizedSource(`${SQL_ROOT}/README.md`),
  );
  for (const requiredText of [
    'STAGING_ROOT=infra/gcp/sql/environments/nonprod',
    'PRODUCTION_ROOT=infra/gcp/sql/environments/production',
    '`moazez-production-91001421934-tfstate`',
    '`sql/production`',
  ]) {
    assert.ok(
      readme.includes(requiredText),
      `README is missing: ${requiredText}`,
    );
  }

  const productionSection = markdownSection(
    readme,
    'Temporary Production Stage 24C capacity profile',
  );
  const productionTable = markdownTable(productionSection);
  assert.deepEqual(productionTable, {
    Project: '`moazez-production`',
    Environment: '`production`',
    Region: '`me-central2`',
    Instance: '`moazez-production-postgres-me-central2`',
    Engine: '`POSTGRES_16`',
    Edition: '`ENTERPRISE`',
    'Machine series': 'N4',
    Tier: '`db-custom-N4-2-16384`',
    'Machine shape': '2 vCPU / 16 GB',
    Availability: '`REGIONAL`',
    'Primary zone': 'unset; provider-managed placement',
    'Secondary zone':
      'unset; provider-managed and different from the primary zone',
    Disk: '`HYPERDISK_BALANCED`, 20 GB initial',
    'Disk autoresize': 'enabled, 100 GB limit',
    'Automated backups': 'enabled',
    'Point-in-time recovery': 'enabled',
    'Transaction log retention': '7 days',
    'Automated backup retention': '30 backups, `COUNT`',
    'Backup location': '`me-central2`',
    'PostgreSQL flag': '`max_connections = 100`',
    'Public IPv4': 'disabled',
    'Private network':
      '`projects/moazez-production/global/networks/moazez-production-vpc`',
    'Allocated range': '`moazez-production-psa`',
    'SSL mode': '`ENCRYPTED_ONLY`',
    'Google Cloud services private path': 'disabled',
    'Terraform deletion protection': 'enabled',
    'GCP/API deletion protection': 'enabled',
  });
  assert.doesNotMatch(
    JSON.stringify(productionTable),
    /ENTERPRISE_PLUS|db-perf-optimized-N-2|PD_SSD|14 days|me-central2-[ac]/u,
  );
  const q007Markers = [
    '```text',
    'APPROVED_Q007_PITR_OBJECTIVE=14',
    'CURRENT_TEMPORARY_IMPLEMENTATION_PITR=7',
    'Q007_RECOVERY_POLICY_CHANGED=NO',
    'TEMPORARY_PITR_EXCEPTION=YES',
    'CURRENT_IMPLEMENTATION_MEETS_Q007_PITR_OBJECTIVE=NO',
    '```',
  ].join('\n');
  assert.ok(
    productionSection.includes(q007Markers),
    'Production section is missing the exact Q007 exception markers.',
  );
  assert.match(productionSection, /does not prove[\s\S]*capacity/iu);
  assert.match(productionSection, /does not prove[\s\S]*will succeed/iu);
  assert.match(productionSection, /30-day backup-retention\s+objective/iu);
  assert.match(
    productionSection,
    /30\s+backup objects[\s\S]*does not prove 30 calendar\s+days/iu,
  );

  const sourceEvidenceSection = markdownSection(
    readme,
    'Source preparation is not live evidence',
  );
  assert.ok(
    sourceEvidenceSection.includes(
      '```text\nPRODUCTION_SQL_SOURCE_PREPARED != PRODUCTION_SQL_APPLIED\n```',
    ),
    'Source-evidence section is missing the source-not-applied marker.',
  );
  const sourceBoundaryMarkers = [
    '```text',
    'TIER_SOURCE_CONTRACT=PASS',
    'LIVE_TIER_CAPACITY_PROVEN=NO',
    'CAPACITY_SUCCESS_GUARANTEE=NO',
    'OLD_SAVED_PLANS_AUTHORIZED=NO',
    'NEW_SAVED_PLAN_REQUIRED=YES',
    '```',
  ].join('\n');
  assert.ok(
    sourceEvidenceSection.includes(sourceBoundaryMarkers),
    'Source-evidence section is missing the exact capacity and plan markers.',
  );
  assert.match(
    sourceEvidenceSection,
    /do not prove\s*:[\s\S]*backup execution/iu,
  );
  assert.match(sourceEvidenceSection, /do not prove\s*:[\s\S]*capacity/iu);
  assert.match(
    sourceEvidenceSection,
    /do not prove\s*:[\s\S]*successful creation/iu,
  );
  assert.match(
    sourceEvidenceSection,
    /Previously generated saved plans[\s\S]*not authorized/iu,
  );
  assert.match(
    sourceEvidenceSection,
    /DevOps owns any later Stage 24C[\s\S]*does not authorize Terraform\s+plan, apply/iu,
  );

  console.log('PRODUCTION_LOCK_MATCHES_NONPROD_LOCK=YES');
  console.log('GOOGLE_PROVIDER_LOCK_VERSION=7.44.0');
  console.log('Q007_RECOVERY_POLICY_CHANGED=NO');
  console.log('TEMPORARY_PITR_EXCEPTION_DOCUMENTED=YES');
  console.log('CURRENT_IMPLEMENTATION_MEETS_Q007_PITR_OBJECTIVE=NO');
  console.log('LIVE_TIER_CAPACITY_PROVEN=NO');
  console.log('CAPACITY_SUCCESS_GUARANTEE=NO');
  console.log('OLD_SAVED_PLANS_AUTHORIZED=NO');
  console.log('NEW_SAVED_PLAN_REQUIRED=YES');
  console.log('SOURCE_PREPARATION_ONLY=YES');
});
