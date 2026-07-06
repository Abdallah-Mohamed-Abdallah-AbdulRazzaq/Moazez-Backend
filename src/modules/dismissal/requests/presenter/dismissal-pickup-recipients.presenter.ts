import { DismissalPickupRecipientsResponseDto } from '../dto/list-pickup-recipients.dto';
import {
  DismissalPickupRecipientRecord,
  DismissalRequestDeliveryRecord,
} from '../infrastructure/dismissal-requests-delivery.repository';

export function presentDismissalPickupRecipients(params: {
  request: DismissalRequestDeliveryRecord;
  recipients: Array<{
    record: DismissalPickupRecipientRecord;
    pickupRecipientToken: string;
    isRequestingGuardian: boolean;
  }>;
  delegatePickupAllowed: boolean;
  pickupCodeRequired: boolean;
}): DismissalPickupRecipientsResponseDto {
  const classroom = params.request.enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;

  return {
    request: {
      id: params.request.id,
      status: 'ready',
      child: {
        id: params.request.student.id,
        displayName:
          displayName([
            params.request.student.firstName,
            params.request.student.lastName,
          ]) ?? 'Student',
        grade: label(grade),
        section: label(section),
        classroom: label(classroom),
      },
      gate: params.request.gate
        ? {
            id: params.request.gate.id,
            code: params.request.gate.code,
            name: params.request.gate.name,
          }
        : null,
    },
    policy: {
      delegatePickupAllowed: params.delegatePickupAllowed,
      pickupCodeRequired: params.pickupCodeRequired,
    },
    recipients: params.recipients.map((recipient) => ({
      pickupRecipientToken: recipient.pickupRecipientToken,
      displayName:
        displayName([
          recipient.record.guardian.firstName,
          recipient.record.guardian.lastName,
        ]) ?? 'Guardian',
      relation: normalizeRelation(recipient.record.guardian.relation),
      isRequestingGuardian: recipient.isRequestingGuardian,
      canPickup: true,
      maskedPhone: null,
    })),
  };
}

export function presentVerifiedReceiver(params: {
  recipient: DismissalPickupRecipientRecord;
}): { name: string; relation: string | null } {
  return {
    name:
      displayName([
        params.recipient.guardian.firstName,
        params.recipient.guardian.lastName,
      ]) ?? 'Guardian',
    relation: normalizeRelation(params.recipient.guardian.relation),
  };
}

function displayName(parts: Array<string | null | undefined>): string | null {
  const value = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return value || null;
}

function label(record: { nameEn?: string | null; nameAr?: string | null } | null): string | null {
  return record?.nameEn || record?.nameAr || null;
}

function normalizeRelation(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
