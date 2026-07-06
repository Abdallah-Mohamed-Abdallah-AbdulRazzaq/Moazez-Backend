import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PublicDismissalHistoryStatus } from './list-dismissal-request-history.dto';

export type DismissalEscalationReason =
  | 'student_not_arrived'
  | 'gate_congestion'
  | 'parent_waiting'
  | 'safety_concern'
  | 'manual_follow_up'
  | 'other';

export class EscalateDismissalRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class EscalateDismissalRequestResponseDto {
  escalation!: {
    requestId: string;
    changed: boolean;
    escalated: true;
    escalatedAt: string;
    reason: DismissalEscalationReason;
  };
  request!: {
    id: string;
    status: PublicDismissalHistoryStatus;
    isActive: boolean;
    isTerminal: boolean;
    wait: {
      minutes: number;
      delayed: boolean;
      urgent: boolean;
    };
  };
}
