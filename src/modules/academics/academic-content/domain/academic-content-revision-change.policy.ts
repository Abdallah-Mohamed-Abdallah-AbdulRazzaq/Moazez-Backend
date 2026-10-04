import {
  AcademicContentChangeSignificance as Significance,
  Prisma,
} from '@prisma/client';

/** Frozen fields for semantic comparison and successor revision lineage validation. */
export const REVISION_SEMANTIC_SELECT = {
  revisionNumber: true,
  type: true,
  audience: true,
  academicYearId: true,
  termId: true,
  title: true,
  description: true,
  typeSpecificSnapshot: true,
  targets: { select: { identityFingerprint: true } },
  assets: { select: { fileId: true, sortOrder: true } },
  links: { select: { url: true, label: true, sortOrder: true } },
  tags: {
    select: { displayValue: true, normalizedValue: true, sortOrder: true },
  },
} satisfies Prisma.AcademicContentRevisionSelect;

export type AcademicContentRevisionSemantics =
  Prisma.AcademicContentRevisionGetPayload<{
    select: typeof REVISION_SEMANTIC_SELECT;
  }>;

function canonical(value: Prisma.JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const identitySet = (values: string[]) => [...new Set(values)].sort();
const ordered = <T extends { sortOrder: number }>(values: T[]) =>
  [...values].sort((a, b) => a.sortOrder - b.sortOrder);

function signatures(revision: AcademicContentRevisionSemantics) {
  const significant = {
    type: revision.type,
    audience: revision.audience,
    academicYearId: revision.academicYearId,
    termId: revision.termId,
    targets: identitySet(
      revision.targets.map((target) => target.identityFingerprint),
    ),
    assets: identitySet(revision.assets.map((asset) => asset.fileId)),
    links: identitySet(revision.links.map((link) => link.url)),
    typeSpecificSnapshot: canonical(revision.typeSpecificSnapshot),
  };
  return {
    significant: JSON.stringify(significant),
    full: JSON.stringify({
      ...significant,
      title: revision.title,
      description: revision.description,
      assets: ordered(revision.assets).map(({ fileId }) => fileId),
      links: ordered(revision.links).map(({ url, label }) => ({ url, label })),
      tags: ordered(revision.tags).map(({ displayValue, normalizedValue }) => ({
        displayValue,
        normalizedValue,
      })),
    }),
  };
}

/** A null result means semantic identity. Signatures, which may contain secrets, never leave this function. */
export function classifyAcademicContentRevisionChange(
  previous: AcademicContentRevisionSemantics,
  successor: AcademicContentRevisionSemantics,
): Significance | null {
  const oldSignatures = signatures(previous),
    newSignatures = signatures(successor);
  if (oldSignatures.full === newSignatures.full) return null;
  return oldSignatures.significant === newSignatures.significant
    ? Significance.MINOR
    : Significance.SIGNIFICANT;
}
