import { InterviewStatus } from '@prisma/client';

export const INTERVIEW_STATUS_API_VALUES = [
  'scheduled',
  'completed',
  'cancelled',
  'rescheduled',
] as const;

export type InterviewStatusApiValue =
  (typeof INTERVIEW_STATUS_API_VALUES)[number];

export function mapInterviewStatusFromApi(
  value: InterviewStatusApiValue,
): InterviewStatus {
  switch (value) {
    case 'scheduled':
      return InterviewStatus.SCHEDULED;
    case 'completed':
      return InterviewStatus.COMPLETED;
    case 'cancelled':
      return InterviewStatus.CANCELLED;
    case 'rescheduled':
      return InterviewStatus.RESCHEDULED;
  }
}

export function mapInterviewStatusToApi(
  value: InterviewStatus,
): InterviewStatusApiValue {
  switch (value) {
    case InterviewStatus.SCHEDULED:
      return 'scheduled';
    case InterviewStatus.COMPLETED:
      return 'completed';
    case InterviewStatus.CANCELLED:
      return 'cancelled';
    case InterviewStatus.RESCHEDULED:
      return 'rescheduled';
  }
}
