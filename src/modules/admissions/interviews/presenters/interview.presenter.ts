import { InterviewResponseDto, InterviewsListResponseDto } from '../dto/interview.dto';
import { InterviewRecord } from '../infrastructure/interviews.repository';
import { mapInterviewStatusToApi } from '../domain/interview.enums';

function deriveFullName(
  firstName: string | undefined,
  lastName: string | undefined,
): string | null {
  if (!firstName || !lastName) {
    return null;
  }

  return `${firstName} ${lastName}`.trim();
}

export function presentInterview(interview: InterviewRecord): InterviewResponseDto {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    studentName: interview.application.studentName,
    scheduledAt: interview.scheduledAt?.toISOString() ?? null,
    interviewerUserId: interview.interviewerUserId,
    interviewerName: interview.interviewerUser
      ? deriveFullName(
          interview.interviewerUser.firstName,
          interview.interviewerUser.lastName,
        )
      : null,
    status: mapInterviewStatusToApi(interview.status),
    notes: interview.notes,
    createdAt: interview.createdAt.toISOString(),
    updatedAt: interview.updatedAt.toISOString(),
  };
}

export function presentInterviews(args: {
  items: InterviewRecord[];
  page: number;
  limit: number;
  total: number;
}): InterviewsListResponseDto {
  return {
    items: args.items.map(presentInterview),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}
