'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const FAILURE_CLASSIFICATION = 'FIXTURE_CONTRACT_FAILURE';
const PASS_CLASSIFICATION = 'fixture_contract_valid';
const EXPECTED_SYSTEM_ROLE_KEYS = Object.freeze([
  'dismissal_staff',
  'organization_admin',
  'parent',
  'platform_super_admin',
  'school_admin',
  'student',
  'teacher',
]);
const COMMUNICATION_PLATFORM_PERMISSIONS = new Set([
  'communication.platform.manage',
  'communication.platform.view',
]);
const PRISMA_MUTATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);
const PERSISTENCE_PAYLOAD_KEYS = new Set(['create', 'data', 'update']);
const CLASSIFICATIONS = Object.freeze([
  'absent',
  'external_https',
  'gcs_provider_url',
  'managed_internal_reference',
  's3_compatible_provider_url',
  'unsafe',
]);

function normalizeFileName(fileName) {
  return String(fileName).replace(/\\/gu, '/');
}

function sourceReference(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return Object.freeze({
    file: normalizeFileName(sourceFile.fileName),
    line: position.line + 1,
  });
}

function makeFailure(area, reasonCode, source, classification) {
  const result = { area, reasonCode };
  if (classification && CLASSIFICATIONS.includes(classification)) {
    result.classification = classification;
  }
  if (source) result.source = source;
  return Object.freeze(result);
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteralLike(name.expression)
  ) {
    return name.expression.text;
  }
  return undefined;
}

function isLogoUrlProperty(node) {
  return (
    (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
    propertyNameText(node.name) === 'logoUrl'
  );
}

function visitNodes(root, visitor) {
  const walk = (node) => {
    visitor(node);
    ts.forEachChild(node, walk);
  };
  walk(root);
}

function nodeIsWithin(node, container) {
  return node.pos >= container.pos && node.end <= container.end;
}

function callMethodName(call) {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  return call.expression.name.text;
}

function findNegativeSendCall(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isCallExpression(current) &&
      callMethodName(current) === 'send' &&
      current.arguments.some((argument) => nodeIsWithin(node, argument)) &&
      hasExplicitNegativeHttpExpectation(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function hasExplicitNegativeHttpExpectation(sendCall) {
  let current = sendCall;
  while (current.parent) {
    const access = current.parent;
    if (
      !ts.isPropertyAccessExpression(access) ||
      access.expression !== current ||
      !ts.isCallExpression(access.parent) ||
      access.parent.expression !== access
    ) {
      return false;
    }
    const chainedCall = access.parent;
    if (access.name.text === 'expect') {
      const status = chainedCall.arguments[0];
      if (status && ts.isNumericLiteral(status)) {
        const code = Number(status.text);
        if (Number.isInteger(code) && code >= 400 && code <= 599) return true;
      }
    }
    current = chainedCall;
  }
  return false;
}

function persistencePayloadPath(node, argument) {
  const keys = [];
  let current = node.parent;
  while (current && current !== argument) {
    if (ts.isPropertyAssignment(current)) {
      const key = propertyNameText(current.name);
      if (key) keys.push(key);
    }
    current = current.parent;
  }
  return keys;
}

function findPersistenceMutationCall(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isCallExpression(current) && current.arguments.length > 0) {
      const method = callMethodName(current);
      if (
        method &&
        PRISMA_MUTATIONS.has(method) &&
        nodeIsWithin(node, current.arguments[0])
      ) {
        const payloadPath = persistencePayloadPath(node, current.arguments[0]);
        if (payloadPath.some((key) => PERSISTENCE_PAYLOAD_KEYS.has(key))) {
          return current;
        }
      }
    }
    current = current.parent;
  }
  return undefined;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    (typeof ts.isSatisfiesExpression === 'function' &&
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function parseHelperPassThrough(initializer) {
  // This is the sole arbitrary-value pass-through: a named helper may persist
  // `input.logoUrl ?? null` only when every call site can be scanned below.
  const expression = unwrapExpression(initializer);
  if (
    !ts.isBinaryExpression(expression) ||
    expression.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken
  ) {
    return undefined;
  }
  const left = unwrapExpression(expression.left);
  const right = unwrapExpression(expression.right);
  if (
    !ts.isPropertyAccessExpression(left) ||
    left.name.text !== 'logoUrl' ||
    !ts.isIdentifier(left.expression) ||
    right.kind !== ts.SyntaxKind.NullKeyword
  ) {
    return undefined;
  }
  return { parameterName: left.expression.text };
}

function containingNamedFunction(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      let name;
      if ('name' in current && current.name)
        name = propertyNameText(current.name);
      if (!name && ts.isVariableDeclaration(current.parent)) {
        name = propertyNameText(current.parent.name);
      }
      return name ? { name, node: current } : undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function collectHelperPassThroughs(sourceFile, logoProperties, failures) {
  const helpers = new Map();
  const passThroughNodes = new Set();
  for (const property of logoProperties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !findPersistenceMutationCall(property)
    ) {
      continue;
    }
    const passThrough = parseHelperPassThrough(property.initializer);
    if (!passThrough) continue;
    const containing = containingNamedFunction(property);
    const parameterMatches = containing?.node.parameters.some(
      (parameter) =>
        ts.isIdentifier(parameter.name) &&
        parameter.name.text === passThrough.parameterName,
    );
    if (!containing || !parameterMatches || helpers.has(containing.name)) {
      failures.push(
        makeFailure(
          'persisted_logo_url',
          'AMBIGUOUS_HELPER_PASSTHROUGH',
          sourceReference(sourceFile, property),
        ),
      );
      continue;
    }
    helpers.set(containing.name, {
      name: containing.name,
      node: containing.node,
      property,
    });
    passThroughNodes.add(property);
  }
  return { helpers, passThroughNodes };
}

function collectConstInitializers(sourceFile) {
  const initializers = new Map();
  visitNodes(sourceFile, (node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      !node.initializer ||
      !ts.isVariableDeclarationList(node.parent) ||
      (node.parent.flags & ts.NodeFlags.Const) === 0
    ) {
      return;
    }
    const entries = initializers.get(node.name.text) ?? [];
    entries.push(node.initializer);
    initializers.set(node.name.text, entries);
  });
  return initializers;
}

function collectNodeCryptoRandomUuidImports(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'node:crypto' ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === 'randomUUID') {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

function isPathSegmentSafeExpression(
  expression,
  constInitializers,
  randomUuidImports,
  resolving = new Set(),
) {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) {
    return /^[a-z0-9._~-]*$/iu.test(current.text);
  }
  if (ts.isTemplateExpression(current)) {
    if (!/^[a-z0-9._~-]*$/iu.test(current.head.text)) return false;
    return current.templateSpans.every(
      (span) =>
        /^[a-z0-9._~-]*$/iu.test(span.literal.text) &&
        isPathSegmentSafeExpression(
          span.expression,
          constInitializers,
          randomUuidImports,
          resolving,
        ),
    );
  }
  if (ts.isIdentifier(current)) {
    if (resolving.has(current.text)) return false;
    const declarations = constInitializers.get(current.text) ?? [];
    if (declarations.length !== 1) return false;
    const nextResolving = new Set(resolving).add(current.text);
    return isPathSegmentSafeExpression(
      declarations[0],
      constInitializers,
      randomUuidImports,
      nextResolving,
    );
  }
  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    randomUuidImports.has(current.expression.text) &&
    current.arguments.length === 0
  ) {
    return true;
  }
  if (
    ts.isElementAccessExpression(current) &&
    ts.isNumericLiteral(current.argumentExpression) &&
    ts.isCallExpression(current.expression) &&
    ts.isPropertyAccessExpression(current.expression.expression) &&
    current.expression.expression.name.text === 'split'
  ) {
    const splitCall = current.expression;
    const delimiter = splitCall.arguments[0];
    return (
      Boolean(delimiter) &&
      ts.isStringLiteralLike(delimiter) &&
      /^[a-z0-9._~-]+$/iu.test(delimiter.text) &&
      isPathSegmentSafeExpression(
        splitCall.expression.expression,
        constInitializers,
        randomUuidImports,
        resolving,
      )
    );
  }
  return false;
}

function templateCandidate(expression, sourceFile) {
  // Test markers may vary only when their const initializer is provably a
  // path-segment-safe literal/template/randomUUID transform. Arbitrary runtime
  // expressions still fail closed, and scheme/authority are always static.
  const constInitializers = collectConstInitializers(sourceFile);
  const randomUuidImports = collectNodeCryptoRandomUuidImports(sourceFile);
  const marker = 'fixture-path-segment';
  let candidate = expression.head.text;
  const dynamicOffsets = [];
  for (const span of expression.templateSpans) {
    if (
      !isPathSegmentSafeExpression(
        span.expression,
        constInitializers,
        randomUuidImports,
      )
    ) {
      return { kind: 'unknown' };
    }
    dynamicOffsets.push(candidate.length);
    candidate += marker;
    candidate += span.literal.text;
  }

  const scheme = /^[a-z][a-z0-9+.-]*:\/\//iu.exec(candidate);
  if (!scheme) return { kind: 'unknown' };
  const originStart = scheme[0].length;
  const originEndMatch = /[/?#]/u.exec(candidate.slice(originStart));
  const originEnd = originEndMatch
    ? originStart + originEndMatch.index
    : candidate.length;
  if (dynamicOffsets.some((offset) => offset < originEnd)) {
    return { kind: 'unknown' };
  }
  return { kind: 'value', value: candidate };
}

function evaluateLogoInitializer(initializer, sourceFile) {
  const expression = unwrapExpression(initializer);
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: 'value', value: null };
  }
  if (ts.isStringLiteralLike(expression)) {
    return { kind: 'value', value: expression.text };
  }
  if (ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: 'value', value: expression.text };
  }
  if (ts.isTemplateExpression(expression) && sourceFile) {
    return templateCandidate(expression, sourceFile);
  }
  return { kind: 'unknown' };
}

function emptyClassificationCounts() {
  return Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [classification, 0]),
  );
}

function analyzeFixtureSources(files, classifyPersistedUrl) {
  if (typeof classifyPersistedUrl !== 'function') {
    throw new TypeError('classifyPersistedUrl must be injected');
  }

  const failures = [];
  const exclusions = [];
  const classifications = emptyClassificationCounts();
  const counts = {
    filesScanned: 0,
    helperCallsScanned: 0,
    helperPassThroughs: 0,
    ignoredNonPersistenceProperties: 0,
    logoUrlPropertiesSeen: 0,
    negativeRequestBodiesExcluded: 0,
    persistedLogoFixturesChecked: 0,
    persistedLogoFixturesValid: 0,
  };

  const orderedFiles = [...files].sort((left, right) =>
    normalizeFileName(left.path).localeCompare(
      normalizeFileName(right.path),
      'en',
    ),
  );
  if (orderedFiles.length === 0) {
    failures.push(
      makeFailure('persisted_logo_url', 'NO_TRACKED_FIXTURE_FILES'),
    );
  }

  const recordCheck = (sourceFile, node, evaluation) => {
    counts.persistedLogoFixturesChecked += 1;
    if (evaluation.kind !== 'value') {
      failures.push(
        makeFailure(
          'persisted_logo_url',
          'DYNAMIC_LOGO_INITIALIZER',
          sourceReference(sourceFile, node),
        ),
      );
      return;
    }

    let result;
    try {
      result = classifyPersistedUrl(evaluation.value);
    } catch {
      failures.push(
        makeFailure(
          'persisted_logo_url',
          'PRODUCTION_CLASSIFIER_ERROR',
          sourceReference(sourceFile, node),
        ),
      );
      return;
    }
    const classification = result?.classification;
    if (!CLASSIFICATIONS.includes(classification)) {
      failures.push(
        makeFailure(
          'persisted_logo_url',
          'UNKNOWN_URL_CLASSIFICATION',
          sourceReference(sourceFile, node),
        ),
      );
      return;
    }
    classifications[classification] += 1;
    if (classification === 'absent' || classification === 'external_https') {
      counts.persistedLogoFixturesValid += 1;
      return;
    }
    failures.push(
      makeFailure(
        'persisted_logo_url',
        'PERSISTED_LOGO_CLASSIFICATION_DISALLOWED',
        sourceReference(sourceFile, node),
        classification,
      ),
    );
  };

  for (const file of orderedFiles) {
    const fileName = normalizeFileName(file.path);
    const sourceFile = ts.createSourceFile(
      fileName,
      file.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    counts.filesScanned += 1;
    if (sourceFile.parseDiagnostics.length > 0) {
      failures.push(
        makeFailure(
          'persisted_logo_url',
          'TYPESCRIPT_PARSE_ERROR',
          sourceReference(sourceFile, sourceFile),
        ),
      );
      continue;
    }

    const logoProperties = [];
    const callExpressions = [];
    visitNodes(sourceFile, (node) => {
      if (isLogoUrlProperty(node)) logoProperties.push(node);
      if (ts.isCallExpression(node)) callExpressions.push(node);
    });
    counts.logoUrlPropertiesSeen += logoProperties.length;

    const handledNodes = new Set();
    const helperResult = collectHelperPassThroughs(
      sourceFile,
      logoProperties,
      failures,
    );
    counts.helperPassThroughs += helperResult.helpers.size;

    for (const property of logoProperties) {
      const negativeCall = findNegativeSendCall(property);
      if (negativeCall) {
        handledNodes.add(property);
        counts.negativeRequestBodiesExcluded += 1;
        exclusions.push(
          Object.freeze({
            classification: 'negative_http_request_body',
            source: sourceReference(sourceFile, property),
          }),
        );
        continue;
      }
      if (helperResult.passThroughNodes.has(property)) {
        handledNodes.add(property);
        continue;
      }
      if (findPersistenceMutationCall(property)) {
        handledNodes.add(property);
        const evaluation = ts.isPropertyAssignment(property)
          ? evaluateLogoInitializer(property.initializer, sourceFile)
          : { kind: 'unknown' };
        recordCheck(sourceFile, property, evaluation);
      }
    }

    for (const helper of helperResult.helpers.values()) {
      const calls = callExpressions.filter(
        (call) =>
          ts.isIdentifier(call.expression) &&
          call.expression.text === helper.name,
      );
      if (calls.length === 0) {
        failures.push(
          makeFailure(
            'persisted_logo_url',
            'UNSCANNED_HELPER_PASSTHROUGH',
            sourceReference(sourceFile, helper.node),
          ),
        );
      }
      for (const call of calls) {
        counts.helperCallsScanned += 1;
        const argument = call.arguments[0];
        if (
          !argument ||
          !ts.isObjectLiteralExpression(unwrapExpression(argument))
        ) {
          recordCheck(sourceFile, call, { kind: 'unknown' });
          continue;
        }
        const object = unwrapExpression(argument);
        const spread = object.properties.find((property) =>
          ts.isSpreadAssignment(property),
        );
        const logoArguments = object.properties.filter(isLogoUrlProperty);
        for (const property of logoArguments) handledNodes.add(property);
        if (spread || logoArguments.length > 1) {
          recordCheck(sourceFile, spread ?? logoArguments[1] ?? call, {
            kind: 'unknown',
          });
          continue;
        }
        if (logoArguments.length === 0) {
          recordCheck(sourceFile, call, { kind: 'value', value: null });
          continue;
        }
        const logoArgument = logoArguments[0];
        const evaluation = ts.isPropertyAssignment(logoArgument)
          ? evaluateLogoInitializer(logoArgument.initializer, sourceFile)
          : { kind: 'unknown' };
        recordCheck(sourceFile, logoArgument, evaluation);
      }
    }

    counts.ignoredNonPersistenceProperties += logoProperties.filter(
      (property) => !handledNodes.has(property),
    ).length;
  }

  failures.sort(compareEvidenceEntries);
  exclusions.sort(compareEvidenceEntries);
  return Object.freeze({
    classifications: Object.freeze(classifications),
    counts: Object.freeze(counts),
    exclusions: Object.freeze(exclusions),
    failures: Object.freeze(failures),
  });
}

function compareStringSets(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function validateRolePermissionCatalog(
  permissionCodes,
  systemRoles,
  options = {},
) {
  const failures = [];
  const expectedRoleKeys = new Set(
    options.expectedRoleKeys ?? EXPECTED_SYSTEM_ROLE_KEYS,
  );
  const enforceHierarchy = options.enforceHierarchy !== false;
  const permissionSet = new Set();
  let rolePermissionReferences = 0;

  for (let index = 0; index < permissionCodes.length; index += 1) {
    const code = permissionCodes[index];
    if (typeof code !== 'string' || code.length === 0) {
      failures.push(
        makeFailure('role_permission_catalog', 'INVALID_PERMISSION_CODE'),
      );
      continue;
    }
    if (permissionSet.has(code)) {
      failures.push(
        makeFailure('role_permission_catalog', 'DUPLICATE_PERMISSION_CODE'),
      );
    }
    permissionSet.add(code);
  }

  const roleKeys = new Set();
  const rolesByKey = new Map();
  for (const role of systemRoles) {
    if (!role || typeof role.key !== 'string' || role.key.length === 0) {
      failures.push(makeFailure('role_permission_catalog', 'INVALID_ROLE_KEY'));
      continue;
    }
    if (roleKeys.has(role.key)) {
      failures.push(
        makeFailure('role_permission_catalog', 'DUPLICATE_ROLE_KEY'),
      );
    }
    roleKeys.add(role.key);
    rolesByKey.set(role.key, role);
    if (!Array.isArray(role.permissions)) {
      failures.push(
        makeFailure('role_permission_catalog', 'INVALID_ROLE_PERMISSIONS'),
      );
      continue;
    }
    rolePermissionReferences += role.permissions.length;
    const referenced = new Set();
    for (const code of role.permissions) {
      if (referenced.has(code)) {
        failures.push(
          makeFailure(
            'role_permission_catalog',
            'DUPLICATE_ROLE_PERMISSION_REFERENCE',
          ),
        );
      }
      referenced.add(code);
      if (!permissionSet.has(code)) {
        failures.push(
          makeFailure(
            'role_permission_catalog',
            'UNKNOWN_ROLE_PERMISSION_REFERENCE',
          ),
        );
      }
    }
  }

  if (!compareStringSets(roleKeys, expectedRoleKeys)) {
    failures.push(
      makeFailure('role_permission_catalog', 'ROLE_KEY_SET_MISMATCH'),
    );
  }

  if (enforceHierarchy) {
    const platformPermissions = new Set(
      rolesByKey.get('platform_super_admin')?.permissions ?? [],
    );
    if (!compareStringSets(platformPermissions, permissionSet)) {
      failures.push(
        makeFailure(
          'role_permission_catalog',
          'PLATFORM_ROLE_PERMISSION_MISMATCH',
        ),
      );
    }
    const tenantPermissionSet = new Set(
      [...permissionSet].filter(
        (code) =>
          !code.startsWith('platform.') &&
          !COMMUNICATION_PLATFORM_PERMISSIONS.has(code),
      ),
    );
    for (const key of ['organization_admin', 'school_admin']) {
      const permissions = new Set(rolesByKey.get(key)?.permissions ?? []);
      if (!compareStringSets(permissions, tenantPermissionSet)) {
        failures.push(
          makeFailure(
            'role_permission_catalog',
            'TENANT_ADMIN_PERMISSION_MISMATCH',
          ),
        );
      }
    }
    for (const role of systemRoles) {
      if (
        role?.key === 'platform_super_admin' ||
        !Array.isArray(role?.permissions)
      ) {
        continue;
      }
      if (
        role.permissions.some(
          (code) =>
            typeof code === 'string' &&
            (code.startsWith('platform.') ||
              COMMUNICATION_PLATFORM_PERMISSIONS.has(code)),
        )
      ) {
        failures.push(
          makeFailure(
            'role_permission_catalog',
            'TENANT_ROLE_PLATFORM_SCOPE_LEAK',
          ),
        );
      }
    }
  }

  failures.sort(compareEvidenceEntries);
  return Object.freeze({
    counts: Object.freeze({
      permissionCodes: permissionCodes.length,
      rolePermissionReferences,
      systemRoles: systemRoles.length,
    }),
    failures: Object.freeze(failures),
  });
}

function validateSeedPipelineSource(
  source,
  fileName = 'prisma/seeds/index.ts',
) {
  const failures = [];
  const sourceFile = ts.createSourceFile(
    normalizeFileName(fileName),
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    return Object.freeze({
      counts: Object.freeze({ seedPipelineCalls: 0 }),
      failures: Object.freeze([
        makeFailure(
          'seed_pipeline',
          'TYPESCRIPT_PARSE_ERROR',
          sourceReference(sourceFile, sourceFile),
        ),
      ]),
    });
  }

  let mainFunction;
  visitNodes(sourceFile, (node) => {
    if (
      !mainFunction &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'main'
    ) {
      mainFunction = node;
    }
  });
  if (!mainFunction?.body) {
    failures.push(makeFailure('seed_pipeline', 'SEED_MAIN_FUNCTION_MISSING'));
    return Object.freeze({
      counts: Object.freeze({ seedPipelineCalls: 0 }),
      failures: Object.freeze(failures),
    });
  }

  const calls = [];
  visitNodes(mainFunction.body, (node) => {
    if (!ts.isAwaitExpression(node)) return;
    const expression = unwrapExpression(node.expression);
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text.startsWith('seed')
    ) {
      let current = node.parent;
      let conditional = false;
      while (current && current !== mainFunction.body) {
        if (ts.isIfStatement(current)) conditional = true;
        current = current.parent;
      }
      calls.push({
        conditional,
        name: expression.expression.text,
        node,
      });
    }
  });

  const expected = [
    'seedPermissions',
    'seedSystemRoles',
    'seedPlatformAdmin',
    'seedDemoOrg',
    'seedDemoAcademics',
  ];
  if (
    JSON.stringify(calls.map((call) => call.name)) !== JSON.stringify(expected)
  ) {
    failures.push(makeFailure('seed_pipeline', 'SEED_PIPELINE_ORDER_MISMATCH'));
  }
  if (
    calls.slice(0, 3).some((call) => call.conditional) ||
    calls.slice(3).some((call) => !call.conditional)
  ) {
    failures.push(
      makeFailure('seed_pipeline', 'SEED_DEMO_CONDITIONAL_MISMATCH'),
    );
  }
  return Object.freeze({
    counts: Object.freeze({ seedPipelineCalls: calls.length }),
    failures: Object.freeze(failures.sort(compareEvidenceEntries)),
  });
}

function createSeedPrismaRecorder() {
  const ids = Object.freeze({
    membership: 'fixture-membership',
    organization: 'fixture-organization',
    platformUser: 'fixture-platform-user',
    role: 'fixture-school-admin-role',
    school: 'fixture-school',
    schoolUser: 'fixture-school-user',
  });
  const graph = {
    membership: { lookup: undefined, write: undefined },
    operationOrder: [],
    organization: undefined,
    roleLookup: undefined,
    school: undefined,
    users: [],
  };
  let userIndex = 0;

  const prisma = {
    membership: {
      async create(args) {
        graph.operationOrder.push('membership.create');
        graph.membership.write = {
          branch: 'create',
          endedAt: args.data.endedAt,
          organizationId: args.data.organizationId,
          roleId: args.data.roleId,
          schoolId: args.data.schoolId,
          status: args.data.status,
          userId: args.data.userId,
          userType: args.data.userType,
        };
        return { id: ids.membership };
      },
      async findFirst(args) {
        graph.operationOrder.push('membership.findFirst');
        graph.membership.lookup = {
          organizationId: args.where.organizationId,
          roleId: args.where.roleId,
          schoolId: args.where.schoolId,
          userId: args.where.userId,
        };
        return null;
      },
      async update(args) {
        graph.operationOrder.push('membership.update');
        graph.membership.write = {
          branch: 'update',
          endedAt: args.data.endedAt,
          id: args.where.id,
          status: args.data.status,
          userType: args.data.userType,
        };
        return { id: ids.membership };
      },
    },
    organization: {
      async upsert(args) {
        graph.operationOrder.push('organization.upsert');
        graph.organization = {
          createStatus: args.create.status,
          id: ids.organization,
          updateStatus: args.update.status,
          whereSlugPresent:
            typeof args.where.slug === 'string' && args.where.slug.length > 0,
        };
        return { id: ids.organization, name: 'fixture organization' };
      },
    },
    role: {
      async findFirst(args) {
        graph.operationOrder.push('role.findFirst');
        graph.roleLookup = {
          isSystem: args.where.isSystem,
          key: args.where.key,
          resultId: ids.role,
          schoolId: args.where.schoolId,
        };
        return { id: ids.role };
      },
    },
    school: {
      async upsert(args) {
        graph.operationOrder.push('school.upsert');
        graph.school = {
          createOrganizationId: args.create.organizationId,
          createStatus: args.create.status,
          id: ids.school,
          updateStatus: args.update.status,
          whereOrganizationId: args.where.organizationId_slug?.organizationId,
        };
        return { id: ids.school, name: 'fixture school' };
      },
    },
    user: {
      async upsert(args) {
        const kind = userIndex === 0 ? 'platform_admin' : 'school_admin';
        const id = userIndex === 0 ? ids.platformUser : ids.schoolUser;
        userIndex += 1;
        graph.operationOrder.push(`user.upsert.${kind}`);
        graph.users.push({
          createStatus: args.create.status,
          createUserType: args.create.userType,
          id,
          kind,
          updateStatus: args.update.status,
          updateUserType: args.update.userType,
        });
        return { id };
      },
    },
  };

  return Object.freeze({ graph, ids, prisma });
}

async function collectSeedRuntimeGraph(seedPlatformAdmin, seedDemoOrg) {
  const recorder = createSeedPrismaRecorder();
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    await seedPlatformAdmin(recorder.prisma);
    await seedDemoOrg(recorder.prisma);
  } finally {
    console.log = originalLog;
  }
  return recorder.graph;
}

function validateSeedRuntimeGraph(graph, expected = {}) {
  const failures = [];
  const values = {
    active: expected.active ?? 'ACTIVE',
    platformUser: expected.platformUser ?? 'PLATFORM_USER',
    schoolUser: expected.schoolUser ?? 'SCHOOL_USER',
  };
  const fail = (reasonCode) =>
    failures.push(makeFailure('seed_runtime_graph', reasonCode));

  if (
    !graph.organization?.whereSlugPresent ||
    graph.organization.createStatus !== values.active ||
    graph.organization.updateStatus !== values.active
  ) {
    fail('ORGANIZATION_SEED_CONTRACT_MISMATCH');
  }
  if (
    !graph.school ||
    graph.school.createOrganizationId !== graph.organization?.id ||
    graph.school.whereOrganizationId !== graph.organization?.id ||
    graph.school.createStatus !== values.active ||
    graph.school.updateStatus !== values.active
  ) {
    fail('SCHOOL_TENANT_GRAPH_MISMATCH');
  }
  if (
    graph.roleLookup?.key !== 'school_admin' ||
    graph.roleLookup?.schoolId !== null ||
    graph.roleLookup?.isSystem !== true ||
    typeof graph.roleLookup?.resultId !== 'string'
  ) {
    fail('SCHOOL_ADMIN_ROLE_LOOKUP_MISMATCH');
  }

  const platformAdmin = graph.users?.find(
    (user) => user.kind === 'platform_admin',
  );
  if (
    !platformAdmin ||
    platformAdmin.createUserType !== values.platformUser ||
    platformAdmin.updateUserType !== values.platformUser ||
    platformAdmin.createStatus !== values.active ||
    platformAdmin.updateStatus !== values.active
  ) {
    fail('PLATFORM_ADMIN_USER_TYPE_MISMATCH');
  }
  const schoolAdmin = graph.users?.find((user) => user.kind === 'school_admin');
  if (
    !schoolAdmin ||
    schoolAdmin.createUserType !== values.schoolUser ||
    schoolAdmin.updateUserType !== values.schoolUser ||
    schoolAdmin.createStatus !== values.active ||
    schoolAdmin.updateStatus !== values.active
  ) {
    fail('SCHOOL_ADMIN_USER_TYPE_MISMATCH');
  }

  const lookup = graph.membership?.lookup;
  const write = graph.membership?.write;
  const expectedLinks = {
    organizationId: graph.organization?.id,
    roleId: graph.roleLookup?.resultId,
    schoolId: graph.school?.id,
    userId: schoolAdmin?.id,
  };
  if (
    !lookup ||
    Object.entries(expectedLinks).some(([key, value]) => lookup[key] !== value)
  ) {
    fail('MEMBERSHIP_LOOKUP_GRAPH_MISMATCH');
  }
  if (
    !write ||
    write.branch !== 'create' ||
    Object.entries(expectedLinks).some(
      ([key, value]) => write[key] !== value,
    ) ||
    write.userType !== values.schoolUser ||
    write.status !== values.active
  ) {
    fail('MEMBERSHIP_WRITE_GRAPH_MISMATCH');
  }

  const expectedOperations = [
    'user.upsert.platform_admin',
    'organization.upsert',
    'school.upsert',
    'role.findFirst',
    'user.upsert.school_admin',
    'membership.findFirst',
    'membership.create',
  ];
  if (
    JSON.stringify(graph.operationOrder) !== JSON.stringify(expectedOperations)
  ) {
    fail('SEED_RUNTIME_ORDER_MISMATCH');
  }

  return Object.freeze({
    counts: Object.freeze({
      seedRuntimeOperations: graph.operationOrder?.length ?? 0,
    }),
    failures: Object.freeze(failures.sort(compareEvidenceEntries)),
  });
}

function compareEvidenceEntries(left, right) {
  const leftKey = JSON.stringify(left);
  const rightKey = JSON.stringify(right);
  return leftKey.localeCompare(rightKey, 'en');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value), null, 2);
}

function sectionStatus(failures, area) {
  return failures.some((failure) => failure.area === area) ? 'FAIL' : 'PASS';
}

function buildEvidence({ fixture, catalog, pipeline, seed }) {
  const failures = [
    ...fixture.failures,
    ...catalog.failures,
    ...pipeline.failures,
    ...seed.failures,
  ].sort(compareEvidenceEntries);
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return Object.freeze({
    classification:
      status === 'PASS' ? PASS_CLASSIFICATION : FAILURE_CLASSIFICATION,
    contracts: Object.freeze({
      persistedLogoUrl: sectionStatus(failures, 'persisted_logo_url'),
      rolePermissionCatalog: sectionStatus(failures, 'role_permission_catalog'),
      seedPipeline: sectionStatus(failures, 'seed_pipeline'),
      seedRuntimeGraph: sectionStatus(failures, 'seed_runtime_graph'),
    }),
    counts: Object.freeze({
      ...fixture.counts,
      ...catalog.counts,
      ...pipeline.counts,
      ...seed.counts,
      failures: failures.length,
    }),
    excludedNegativeRequestBodies: fixture.exclusions,
    failures: Object.freeze(failures),
    persistedLogoClassifications: fixture.classifications,
    schemaVersion: 1,
    status,
  });
}

function trackedFixtureSources(repositoryRoot) {
  const output = childProcess.execFileSync(
    'git',
    ['ls-files', '-z', '--', 'test/e2e', 'test/security'],
    { cwd: repositoryRoot, encoding: 'buffer' },
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter((fileName) =>
      /^(?:test\/e2e|test\/security)\/.*\.ts$/u.test(fileName),
    )
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((fileName) => ({
      path: normalizeFileName(fileName),
      source: fs.readFileSync(path.join(repositoryRoot, fileName), 'utf8'),
    }));
}

function loadProductionContracts(repositoryRoot) {
  const urlPolicy = require(
    path.join(
      repositoryRoot,
      'src',
      'infrastructure',
      'storage',
      'provider-url.policy.ts',
    ),
  );
  const permissions = require(
    path.join(repositoryRoot, 'prisma', 'seeds', '01-permissions.seed.ts'),
  );
  const roles = require(
    path.join(repositoryRoot, 'prisma', 'seeds', '02-system-roles.seed.ts'),
  );
  const platformAdmin = require(
    path.join(repositoryRoot, 'prisma', 'seeds', '03-platform-admin.seed.ts'),
  );
  const demoOrg = require(
    path.join(repositoryRoot, 'prisma', 'seeds', '04-demo-org.seed.ts'),
  );
  const prismaClient = require('@prisma/client');
  return {
    classifyPersistedUrl: urlPolicy.classifyPersistedUrl,
    permissionCodes: permissions.PERMISSION_CODES,
    seedDemoOrg: demoOrg.seedDemoOrg,
    seedPlatformAdmin: platformAdmin.seedPlatformAdmin,
    systemRoles: roles.SYSTEM_ROLES,
    userTypes: prismaClient.UserType,
  };
}

async function runRepositoryGate(repositoryRoot, injected = {}) {
  const production =
    injected.production ?? loadProductionContracts(repositoryRoot);
  const fixtureSources =
    injected.fixtureSources ?? trackedFixtureSources(repositoryRoot);
  const fixture = analyzeFixtureSources(
    fixtureSources,
    production.classifyPersistedUrl,
  );
  const catalog = validateRolePermissionCatalog(
    production.permissionCodes,
    production.systemRoles,
  );
  const pipeline = validateSeedPipelineSource(
    fs.readFileSync(
      path.join(repositoryRoot, 'prisma', 'seeds', 'index.ts'),
      'utf8',
    ),
  );
  const graph = await collectSeedRuntimeGraph(
    production.seedPlatformAdmin,
    production.seedDemoOrg,
  );
  const seed = validateSeedRuntimeGraph(graph, {
    platformUser: production.userTypes.PLATFORM_USER,
    schoolUser: production.userTypes.SCHOOL_USER,
  });
  return buildEvidence({ catalog, fixture, pipeline, seed });
}

function terminalFailureEvidence() {
  return Object.freeze({
    classification: FAILURE_CLASSIFICATION,
    contracts: Object.freeze({
      persistedLogoUrl: 'FAIL',
      rolePermissionCatalog: 'FAIL',
      seedPipeline: 'FAIL',
      seedRuntimeGraph: 'FAIL',
    }),
    counts: Object.freeze({ failures: 1 }),
    excludedNegativeRequestBodies: Object.freeze([]),
    failures: Object.freeze([
      makeFailure('fixture_contract_gate', 'GATE_EXECUTION_ERROR'),
    ]),
    persistedLogoClassifications: Object.freeze(emptyClassificationCounts()),
    schemaVersion: 1,
    status: 'FAIL',
  });
}

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  runRepositoryGate(repositoryRoot)
    .then((evidence) => {
      process.stdout.write(`${stableStringify(evidence)}\n`);
      if (evidence.status !== 'PASS') process.exitCode = 1;
    })
    .catch(() => {
      process.stdout.write(`${stableStringify(terminalFailureEvidence())}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  FAILURE_CLASSIFICATION,
  analyzeFixtureSources,
  buildEvidence,
  collectSeedRuntimeGraph,
  createSeedPrismaRecorder,
  evaluateLogoInitializer,
  loadProductionContracts,
  runRepositoryGate,
  stableStringify,
  trackedFixtureSources,
  validateRolePermissionCatalog,
  validateSeedPipelineSource,
  validateSeedRuntimeGraph,
};
