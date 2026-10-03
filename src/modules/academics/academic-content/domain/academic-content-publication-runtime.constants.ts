export const ACADEMIC_CONTENT_PUBLICATION_QUEUE =
  'academic-content-publication';
export const ACADEMIC_CONTENT_PUBLICATION_PUBLISH_JOB = 'publish';
export const ACADEMIC_CONTENT_PUBLICATION_EXPIRE_JOB = 'expire';
export const ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB = 'reconcile';
export const ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB_ID =
  'academic-content-publication-reconcile';
export const ACADEMIC_CONTENT_PUBLICATION_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const ACADEMIC_CONTENT_PUBLICATION_RECOVERY_PAGE_SIZE = 100;

export type AcademicContentPublicationJobData = {
  schoolId: string;
  contentId: string;
  publicationId: string;
};

export function academicContentPublicationJobId(
  job: 'publish' | 'expire',
  identity: AcademicContentPublicationJobData,
): string {
  return `academic-content-publication-${job}-${identity.schoolId}-${identity.publicationId}`;
}

export function isAcademicContentPublicationJobData(
  data: unknown,
): data is AcademicContentPublicationJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const row = data as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (
    Object.keys(row).length === 3 &&
    ['schoolId', 'contentId', 'publicationId'].every(
      (key) => typeof row[key] === 'string' && uuid.test(row[key]),
    )
  );
}
