import { AcademicContentEngagementEventType } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export const ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS = [
  'academics.academic_content.view',
  'academics.academic_content.analytics.own.view',
] as const;
export const ACADEMIC_CONTENT_ANALYTICS_RANGES = ['7d', '30d', '90d'] as const;
export type AcademicContentAnalyticsRange =
  (typeof ACADEMIC_CONTENT_ANALYTICS_RANGES)[number];

export function academicContentAnalyticsRangeDays(range: unknown): number {
  switch (range === undefined ? '30d' : range) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    default:
      throw new ValidationDomainException('Invalid analytics range');
  }
}

export type AcademicContentAnalyticsCounts = {
  totalEventReports: string;
  eventCountsByTypeAndActorKind: {
    eventType: AcademicContentEngagementEventType;
    actorKind: 'STUDENT' | 'PARENT';
    count: string;
  }[];
  distinctStudentActorsEngaged: string;
  distinctParentChildPairsEngaged: string;
  acknowledgementRecords: string;
  distinctAcknowledgingParentChildPairs: string;
};

export const ACADEMIC_CONTENT_ANALYTICS_MEASUREMENTS = {
  countEncoding: 'NON_NEGATIVE_DECIMAL_STRING',
  eventReports:
    'Authenticated client-reported interactions, including repeated reports.',
  CONTENT_VIEWED: 'Reported viewing; does not prove comprehension.',
  FILE_PREVIEWED: 'Reported preview; does not prove full consumption.',
  FILE_DOWNLOADED:
    'Reported download interaction; does not prove completed byte transfer.',
  LINK_CLICKED:
    'Reported external-link click; does not prove destination consumption.',
  JOIN_LINK_CLICKED: 'Reported join-link click; does not prove attendance.',
  studentIdentity:
    'Distinct persisted Student identity across the complete included publication set.',
  parentIdentity:
    'Distinct persisted (Parent actor, Student) pair across the complete included publication set; Guardian and Enrollment are not distinct keys.',
  acknowledgementRecords:
    'Explicit durable Parent acknowledgements per publication; successor publications are separate obligations.',
  timestamps:
    'Events use createdAt; acknowledgements use acknowledgedAt. One database clock defines the UTC half-open window [from, toExclusive).',
  publicationScope:
    'Only actually published history whose complete immutable target set is currently owned; cancelled, expired and superseded history remains eligible.',
  denominators:
    'Absolute counts only. Historical recipient contexts are not current eligible accounts; no completion percentage or engagement score is inferred.',
  privacy:
    'Aggregate counts can expose small-group activity. Only fixed 7d, 30d and 90d windows are available; no individual timeline or identity is returned.',
} as const;
