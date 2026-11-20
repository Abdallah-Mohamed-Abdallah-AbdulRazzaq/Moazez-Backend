/** Reserved by the Assessment Media upload and READY database contracts. */
export const ASSESSMENT_MEDIA_OBJECT_KEY_PREFIX = 'assessment-media/';

export function isAssessmentMediaObjectKey(objectKey: string): boolean {
  return objectKey.startsWith(ASSESSMENT_MEDIA_OBJECT_KEY_PREFIX);
}
