export const ENROLLMENT_MOVEMENT_ACTION_TYPES = [
  'transferred_internal',
  'withdrawn',
  'promoted',
] as const;

export type EnrollmentMovementActionType =
  (typeof ENROLLMENT_MOVEMENT_ACTION_TYPES)[number];
