const released = new WeakSet<object>();

/** Repository-authorized, request-local objects only. Missing facts deny disclosure. */
export function attachGradeReviewDisclosure(
  record: object,
  permitted: boolean,
): void {
  if (permitted) released.add(record);
  else released.delete(record);
}

export function canDiscloseGradeReview(record: object): boolean {
  return released.has(record);
}
