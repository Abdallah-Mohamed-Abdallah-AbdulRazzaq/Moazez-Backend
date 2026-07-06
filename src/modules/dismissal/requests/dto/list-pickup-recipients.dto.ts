import {
  DismissalRequestChildDto,
  DismissalRequestGateDto,
} from './dismissal-request-query.dto';

export class DismissalPickupRecipientRequestDto {
  id!: string;
  status!: 'ready';
  child!: DismissalRequestChildDto;
  gate!: Pick<DismissalRequestGateDto, 'id' | 'code' | 'name'> | null;
}

export class DismissalPickupRecipientPolicyDto {
  delegatePickupAllowed!: boolean;
  pickupCodeRequired!: boolean;
}

export class DismissalPickupRecipientDto {
  pickupRecipientToken!: string;
  displayName!: string;
  relation!: string | null;
  isRequestingGuardian!: boolean;
  canPickup!: true;
  maskedPhone!: string | null;
}

export class DismissalPickupRecipientsResponseDto {
  request!: DismissalPickupRecipientRequestDto;
  policy!: DismissalPickupRecipientPolicyDto;
  recipients!: DismissalPickupRecipientDto[];
}
