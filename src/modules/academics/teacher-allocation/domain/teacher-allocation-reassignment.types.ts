export type TeacherAllocationReassignmentDecision = 'ready' | 'blocked';

export type TeacherAllocationReassignmentBlockerCode =
  | 'target_is_current_teacher'
  | 'target_already_allocated'
  | 'target_teacher_conflict'
  | 'active_reinforcement_tasks'
  | 'mutable_teacher_announcements';

export type TeacherAllocationReassignmentTargetIneligibleReason =
  | 'incompatible_identity'
  | 'account_status_ineligible'
  | 'membership_ineligible'
  | 'profile_missing'
  | 'employment_inactive'
  | 'profile_incomplete';

export interface TeacherAllocationReassignmentBlocker {
  domain: 'allocation' | 'timetable' | 'reinforcement' | 'announcements';
  code: TeacherAllocationReassignmentBlockerCode;
  count: number;
  statuses?: Record<string, number>;
}

export interface TeacherAllocationReassignmentImpact {
  timetable: {
    draft: number;
    active: number;
    cancelled: number;
    targetTeacherConflicts: number;
  };
  lessonPlans: {
    draft: number;
    active: number;
    archived: number;
  };
  homework: {
    draft: number;
    published: number;
    closed: number;
    cancelled: number;
    archived: number;
  };
  reinforcement: {
    notCompleted: number;
    inProgress: number;
    underReview: number;
    completed: number;
    cancelled: number;
  };
  announcements: {
    draft: number;
    scheduled: number;
    published: number;
    archived: number;
    cancelled: number;
  };
  assessments: { policy: 'contextual_access_no_rewrite' };
  curriculum: { policy: 'no_mutation' };
  attendance: { policy: 'historical_preserve' };
  messages: { policy: 'no_history_rewrite' };
}

export interface TeacherAllocationReassignmentAction {
  domain: 'timetable' | 'lesson_plans' | 'homework';
  action: 'handoff_current_responsibility';
  count: number;
}

export interface TeacherAllocationReassignmentHistoricalRecord {
  domain:
    | 'timetable'
    | 'lesson_plans'
    | 'homework'
    | 'reinforcement'
    | 'announcements';
  action: 'preserve_historical_authorship';
  count: number;
}

export interface TeacherAllocationReassignmentAnalysis {
  decision: TeacherAllocationReassignmentDecision;
  canReassign: boolean;
  impact: TeacherAllocationReassignmentImpact;
  blockers: TeacherAllocationReassignmentBlocker[];
  automaticActions: TeacherAllocationReassignmentAction[];
  historicalRecords: TeacherAllocationReassignmentHistoricalRecord[];
  fingerprintMaterial: unknown;
}
