import {
  CommunicationAnnouncementReadRecord,
  CommunicationAnnouncementReadSummaryResult,
} from '../infrastructure/communication-announcement.repository';

export function presentCommunicationAnnouncementReadReceipt(
  read: CommunicationAnnouncementReadRecord,
) {
  return {
    announcementId: read.announcementId,
    userId: read.userId,
    readAt: read.readAt.toISOString(),
  };
}

export function presentCommunicationAnnouncementReadSummary(
  result: CommunicationAnnouncementReadSummaryResult,
) {
  return {
    announcementId: result.announcementId,
    readCount: result.readCount,
    totalTargetCount: result.totalTargetCount,
    totalTargetCountReason: result.totalTargetCountReason,
  };
}
