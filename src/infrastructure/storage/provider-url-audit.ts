import {
  PersistedUrlClassification,
  classifyPersistedUrl,
  isProviderUrlClassification,
} from './provider-url.policy';

const AUDIT_PAGE_SIZE = 250;

type AuditRow = { id: string } & Record<string, unknown>;
type AuditDelegate = {
  findMany(args: Record<string, unknown>): Promise<AuditRow[]>;
};

export interface ProviderUrlAuditClient {
  gradeAssessmentQuestion: AuditDelegate;
  lessonContentItem: AuditDelegate;
  heroBadge: AuditDelegate;
  schoolProfile: AuditDelegate;
  communicationAnnouncement: AuditDelegate;
}

export interface ProviderUrlAuditSurfaceResult {
  model: string;
  field: string;
  scannedCount: number;
  classifications: Record<PersistedUrlClassification, number>;
}

export interface ProviderUrlAuditResult {
  status: 'PASS' | 'FAIL';
  PROVIDER_URL_COUNT: number;
  LEGACY_PROVIDER_URL_COUNT: number;
  UNSAFE_LEGACY_URL_COUNT: number;
  surfaces: ProviderUrlAuditSurfaceResult[];
}

interface SurfaceDefinition {
  model: string;
  field: string;
  delegate: keyof ProviderUrlAuditClient;
  select: Record<string, boolean>;
  where?: Record<string, unknown>;
  legacy: boolean;
  readValue(row: AuditRow): unknown;
}

export async function auditPersistedProviderUrls(
  client: ProviderUrlAuditClient,
): Promise<ProviderUrlAuditResult> {
  const definitions: SurfaceDefinition[] = [
    {
      model: 'GradeAssessmentQuestion',
      field: 'metadata.mediaUrl',
      delegate: 'gradeAssessmentQuestion',
      select: { id: true, metadata: true },
      legacy: true,
      readValue: (row) => readJsonField(row.metadata, 'mediaUrl'),
    },
    {
      model: 'LessonContentItem',
      field: 'url',
      delegate: 'lessonContentItem',
      select: { id: true, url: true },
      where: { url: { not: null } },
      legacy: false,
      readValue: (row) => row.url,
    },
    {
      model: 'HeroBadge',
      field: 'assetPath',
      delegate: 'heroBadge',
      select: { id: true, assetPath: true },
      where: { assetPath: { not: null } },
      legacy: false,
      readValue: (row) => row.assetPath,
    },
    {
      model: 'SchoolProfile',
      field: 'logoUrl',
      delegate: 'schoolProfile',
      select: { id: true, logoUrl: true },
      where: { logoUrl: { not: null } },
      legacy: true,
      readValue: (row) => row.logoUrl,
    },
    {
      model: 'CommunicationAnnouncement',
      field: 'actionUrl',
      delegate: 'communicationAnnouncement',
      select: { id: true, actionUrl: true },
      where: { actionUrl: { not: null } },
      legacy: true,
      readValue: (row) => row.actionUrl,
    },
  ];

  let providerUrlCount = 0;
  let legacyProviderUrlCount = 0;
  let unsafeLegacyUrlCount = 0;
  const surfaces: ProviderUrlAuditSurfaceResult[] = [];

  for (const definition of definitions) {
    const counts = emptyClassificationCounts();
    let scannedCount = 0;
    await scanBounded(client[definition.delegate], definition, (row) => {
      scannedCount += 1;
      const classification = classifyAuditValue(definition.readValue(row));
      counts[classification] += 1;
      if (isProviderUrlClassification(classification)) {
        providerUrlCount += 1;
        if (definition.legacy) legacyProviderUrlCount += 1;
      }
      if (definition.legacy && classification === 'unsafe') {
        unsafeLegacyUrlCount += 1;
      }
    });
    surfaces.push({
      model: definition.model,
      field: definition.field,
      scannedCount,
      classifications: counts,
    });
  }

  const blocking =
    providerUrlCount > 0 ||
    legacyProviderUrlCount > 0 ||
    unsafeLegacyUrlCount > 0;
  return {
    status: blocking ? 'FAIL' : 'PASS',
    PROVIDER_URL_COUNT: providerUrlCount,
    LEGACY_PROVIDER_URL_COUNT: legacyProviderUrlCount,
    UNSAFE_LEGACY_URL_COUNT: unsafeLegacyUrlCount,
    surfaces,
  };
}

export function formatProviderUrlAuditResult(
  result: ProviderUrlAuditResult,
): string {
  return JSON.stringify(result, null, 2);
}

async function scanBounded(
  delegate: AuditDelegate,
  definition: SurfaceDefinition,
  visit: (row: AuditRow) => void,
): Promise<void> {
  let cursor: string | undefined;
  while (true) {
    const rows = await delegate.findMany({
      ...(definition.where ? { where: definition.where } : {}),
      select: definition.select,
      orderBy: { id: 'asc' },
      take: AUDIT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) visit(row);
    if (rows.length < AUDIT_PAGE_SIZE) return;
    cursor = rows[rows.length - 1].id;
  }
}

function classifyAuditValue(value: unknown): PersistedUrlClassification {
  if (value === null || value === undefined) return 'absent';
  if (typeof value !== 'string') return 'unsafe';
  return classifyPersistedUrl(value).classification;
}

function readJsonField(value: unknown, field: string): unknown {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return (value as Record<string, unknown>)[field];
}

function emptyClassificationCounts(): Record<
  PersistedUrlClassification,
  number
> {
  return {
    absent: 0,
    managed_internal_reference: 0,
    external_https: 0,
    gcs_provider_url: 0,
    s3_compatible_provider_url: 0,
    unsafe: 0,
  };
}
