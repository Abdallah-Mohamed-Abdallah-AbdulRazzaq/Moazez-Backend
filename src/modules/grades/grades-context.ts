import { GradeAssessmentDeliveryMode, UserType } from '@prisma/client';
import { getRequestContext } from '../../common/context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../iam/auth/domain/auth.exceptions';

export const GRADES_MODULE_NAME = 'grades';
export const GRADES_ROUTE_PREFIX = 'grades';
export const SPRINT_4A_SUPPORTED_DELIVERY_MODE =
  GradeAssessmentDeliveryMode.SCORE_ONLY;

// QUESTION_BASED remains deferred for Sprint 4B implementation work.
export const DEFERRED_GRADES_DELIVERY_MODES = [
  GradeAssessmentDeliveryMode.QUESTION_BASED,
] as const;

export interface GradesScope {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
  roleId: string;
}

export function isSprint4ASupportedDeliveryMode(
  deliveryMode: GradeAssessmentDeliveryMode | string,
): boolean {
  return (
    String(deliveryMode).trim().toUpperCase() ===
    SPRINT_4A_SUPPORTED_DELIVERY_MODE
  );
}

export function requireGradesScope(): GradesScope {
  const ctx = getRequestContext();

  if (!ctx?.actor) {
    throw new TokenInvalidException();
  }

  if (!ctx.activeMembership?.schoolId) {
    throw new ScopeMissingException();
  }

  return {
    actorId: ctx.actor.id,
    userType: ctx.actor.userType,
    organizationId: ctx.activeMembership.organizationId,
    schoolId: ctx.activeMembership.schoolId,
    roleId: ctx.activeMembership.roleId,
  };
}
