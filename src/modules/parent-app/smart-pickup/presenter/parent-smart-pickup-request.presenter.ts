import { DismissalRequestStatus } from '@prisma/client';
import { presentGateStatus } from '../../../dismissal/shared/dismissal.types';
import {
  CreateParentSmartPickupRequestResponseDto,
  ParentSmartPickupRequestPoliciesDto,
} from '../dto/parent-smart-pickup-request.dto';
import type { ParentSmartPickupRequestRecord } from '../infrastructure/parent-smart-pickup-request.repository';

export class ParentSmartPickupRequestPresenter {
  static present(params: {
    request: ParentSmartPickupRequestRecord;
    policies: ParentSmartPickupRequestPoliciesDto;
    pickup: {
      codeRequired: boolean;
      codeIssued: boolean;
      pickupCode?: string;
    };
  }): CreateParentSmartPickupRequestResponseDto {
    const response: CreateParentSmartPickupRequestResponseDto = {
      request: {
        id: params.request.id,
        status: presentRequestStatus(params.request.status),
        isActive: true,
        isTerminal: false,
        canCancel: params.policies.allowParentCancelBeforeCalled,
        canTrack: true,
        requestedAt: params.request.requestedAt.toISOString(),
        child: {
          id: params.request.student.id,
          displayName: studentDisplayName(params.request.student),
          grade: displayName(params.request.enrollment.classroom.section.grade),
          section: displayName(params.request.enrollment.classroom.section),
          classroom: displayName(params.request.enrollment.classroom),
        },
        gate: {
          id: params.request.gate.id,
          code: params.request.gate.code,
          name: params.request.gate.name,
          status: presentGateStatus(params.request.gate.status) as 'open' | 'busy',
        },
        pickup: {
          codeRequired: params.pickup.codeRequired,
          codeIssued: params.pickup.codeIssued,
          codeIssuedAt:
            params.request.pickupCodeIssuedAt?.toISOString() ?? null,
        },
        policies: params.policies,
      },
      pickup: {
        codeRequired: params.pickup.codeRequired,
        codeIssued: params.pickup.codeIssued,
      },
    };

    if (params.pickup.pickupCode) {
      response.request.pickup.code = params.pickup.pickupCode;
      response.pickup.pickupCode = params.pickup.pickupCode;
    }

    return response;
  }
}

function presentRequestStatus(status: DismissalRequestStatus): 'requested' {
  if (status !== DismissalRequestStatus.REQUESTED) {
    throw new Error(`Unexpected Parent Smart Pickup request status: ${status}`);
  }

  return 'requested';
}

function studentDisplayName(student: {
  firstName: string;
  lastName: string;
}): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}
