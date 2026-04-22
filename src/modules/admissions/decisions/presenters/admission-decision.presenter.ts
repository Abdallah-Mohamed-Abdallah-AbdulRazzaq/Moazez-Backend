import { mapApplicationStatusToApi } from '../../applications/domain/application.enums';
import {
  AdmissionDecisionResponseDto,
  AdmissionDecisionsListResponseDto,
} from '../dto/admission-decision.dto';
import { mapAdmissionDecisionToApi } from '../domain/admission-decision.enums';
import { AdmissionDecisionRecord } from '../infrastructure/admission-decisions.repository';

function deriveFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function presentAdmissionDecision(
  admissionDecision: AdmissionDecisionRecord,
): AdmissionDecisionResponseDto {
  return {
    id: admissionDecision.id,
    applicationId: admissionDecision.applicationId,
    studentName: admissionDecision.application.studentName,
    decision: mapAdmissionDecisionToApi(admissionDecision.decision),
    reason: admissionDecision.reason,
    decidedByUserId: admissionDecision.decidedByUserId,
    decidedByName: deriveFullName(
      admissionDecision.decidedByUser.firstName,
      admissionDecision.decidedByUser.lastName,
    ),
    decidedAt: admissionDecision.decidedAt.toISOString(),
    applicationStatus: mapApplicationStatusToApi(
      admissionDecision.application.status,
    ),
    createdAt: admissionDecision.createdAt.toISOString(),
    updatedAt: admissionDecision.updatedAt.toISOString(),
  };
}

export function presentAdmissionDecisions(args: {
  items: AdmissionDecisionRecord[];
  page: number;
  limit: number;
  total: number;
}): AdmissionDecisionsListResponseDto {
  return {
    items: args.items.map(presentAdmissionDecision),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}
