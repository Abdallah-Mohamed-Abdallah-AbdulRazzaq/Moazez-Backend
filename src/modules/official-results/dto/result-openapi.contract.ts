import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod/v4';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { resultPolicySchema } from '../domain/result-policy';

const uuid = z.uuid();
const localDate = z.iso.date();
const label = z.object({ ar: z.string(), en: z.string() });
const instant = z.iso.datetime();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const capability = z.object({
  allowed: z.boolean(),
  reasonCode: z.string().optional(),
});
const capabilities = z.record(z.string(), capability);
const policy = z.object({
  policyVersionId: uuid.nullable(),
  revision: z.number().int(),
  policy: resultPolicySchema,
  capabilities,
});
const page = (item: z.ZodType) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
const period = z.object({
  reportingPeriodId: uuid,
  academicYearId: uuid,
  termId: uuid.optional(),
  kind: z.enum(['TERM', 'CUSTOM', 'YEAR']),
  code: z.string(),
  name: label,
  startsOn: localDate,
  endsOn: localDate,
  classification: z.enum(['PROGRESS', 'FINAL']),
  status: z.enum(['OPEN', 'ENTRY_CLOSED', 'ARCHIVED']),
  revision: z.number().int(),
  description: z.string().optional(),
  correctionWindows: z
    .array(
      z.object({
        windowId: uuid,
        slotId: uuid,
        releaseUnitId: uuid,
        actorId: uuid,
        expiresAt: instant,
      }),
    )
    .optional(),
});
const group = z.object({
  groupId: uuid,
  kind: z.enum(['SUBJECT', 'CUSTOM']),
  subjectId: uuid.optional(),
  code: z.string(),
  label,
  archived: z.boolean(),
  revision: z.number().int(),
  description: z.string().optional(),
});
const grant = z.object({
  grantId: uuid,
  grantee: z.object({ kind: z.enum(['USER', 'ROLE']), id: uuid }),
  scope: z.object({
    reportingPeriodIds: z.array(uuid),
    groupIds: z.array(uuid),
    classroomIds: z.array(uuid),
    fieldIds: z.array(uuid),
  }),
  actions: z.array(z.string()),
  reason: z.string(),
  startsAt: instant,
  expiresAt: instant.nullable(),
  revokedAt: instant.nullable(),
  revision: z.number().int(),
});
export const resultContracts = {
  policy,
  policyPreviewRequest: z.strictObject({
    expectedPolicyVersionId: uuid.nullable(),
    policy: resultPolicySchema.partial(),
  }),
  policyPreview: z.object({
    previewId: uuid,
    previewDigest: digest,
    expectedPolicyVersionId: uuid.nullable(),
    expiresAt: instant,
    policy: resultPolicySchema,
    impacts: z.array(
      z.object({
        kind: z.literal('POLICY_ACTIVATION'),
        resourceId: uuid,
        before: z.object({ policyVersionId: uuid.nullable() }),
        after: z.object({ affectedScopes: z.number().int() }),
      }),
    ),
    blockers: z.array(z.object({ code: z.string() })),
    impact: z.object({
      affectedSheets: z.number().int(),
      affectedScopes: z.number().int(),
      pendingCandidates: z.number().int(),
      activeImports: z.number().int(),
      requiresRevalidation: z.boolean(),
      changedSettings: z.array(z.string()),
      scopeFingerprint: digest,
    }),
  }),
  policyVersions: page(
    z.object({
      policyVersionId: uuid,
      revision: z.number().int(),
      policy: resultPolicySchema,
      contentDigest: digest,
      activatedAt: instant,
    }),
  ),
  period,
  periods: page(period),
  group,
  groups: page(group),
  grant,
  grants: page(grant),
  capabilities: z.object({
    actions: capabilities,
    scope: z.object({
      allowedScopeSelectors: z.array(z.string()),
      reportingPeriodId: uuid.optional(),
      groupId: uuid.optional(),
      sheetId: uuid.optional(),
      classroomId: uuid.optional(),
    }),
    capabilities,
    allowedScopeSelectors: z.array(z.string()),
    sheetId: uuid.optional(),
    reportingPeriodId: uuid.optional(),
    groupId: uuid.optional(),
    policyVersionId: uuid.nullable().optional(),
    policyRevision: z.number().int().optional(),
    teacherMode: z.enum(['MANAGED', 'AUTONOMOUS']).optional(),
    matchedPolicyRules: z.record(z.string(), z.array(uuid)).optional(),
  }),
};

function openApiThree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openApiThree);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(input).map(([key, item]) => [key, openApiThree(item)]),
  );
  if (Object.hasOwn(result, 'const')) {
    result.enum = [result.const];
    delete result.const;
  }
  if (Array.isArray(result.anyOf) && result.anyOf.length === 2) {
    const options = result.anyOf as Record<string, unknown>[];
    const nonNull = options.find((option) => option.type !== 'null');
    if (nonNull && options.some((option) => option.type === 'null')) {
      delete result.anyOf;
      Object.assign(result, nonNull, { nullable: true });
    }
  }
  return result;
}

export function resultOpenApiSchema(schema: z.ZodType): SchemaObject {
  const { $schema: _, ...swagger } = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
  });
  return openApiThree(swagger) as SchemaObject;
}

export function ResultEndpoint(
  operationId: string,
  permission: string,
  response: z.ZodType,
  status = 200,
  idempotency?: 'REQUIRED' | 'OPTIONAL',
): MethodDecorator {
  return applyDecorators(
    ApiOperation({ operationId }),
    RequiredPermissions(`official_results.${permission}`),
    ApiResponse({
      status,
      schema: resultOpenApiSchema(z.object({ data: response })),
    }),
    ...(idempotency
      ? [
          ApiHeader({
            name: 'Idempotency-Key',
            required: idempotency === 'REQUIRED',
            schema: { type: 'string', minLength: 1, maxLength: 128 },
          }),
        ]
      : []),
  );
}
