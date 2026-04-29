import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  XpSourceType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface HeroDashboardDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface HeroDashboardScope {
  academicYearId: string;
  yearId: string;
  termId: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  studentId: string | null;
  subjectId: string | null;
}

export interface HeroMissionStatusSummary {
  total: number;
  draft: number;
  published: number;
  archived: number;
  withBadgeReward: number;
  withXpReward: number;
}

export interface HeroProgressStatusSummary {
  totalProgress: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  completionRate: number;
}

export interface HeroEventTypeSummary {
  missionStarted: number;
  objectiveCompleted: number;
  missionCompleted: number;
  xpGranted: number;
  badgeAwarded: number;
}

export interface HeroRewardSummary {
  totalHeroXp: number;
  xpGrantedMissions: number;
  badgesAwarded: number;
  studentsWithBadges: number;
}

export interface HeroTopStudentInput {
  studentId: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    nameAr?: string | null;
    code?: string | null;
    admissionNo?: string | null;
  } | null;
  progressPercent?: number | null;
  progressStatus?: HeroMissionProgressStatus | string | null;
  xpAmount?: number | null;
  badgeId?: string | null;
}

export interface HeroTopStudentRow {
  studentId: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    nameAr: string | null;
    code: string | null;
    admissionNo: string | null;
  };
  completedMissions: number;
  totalHeroXp: number;
  badgesCount: number;
  averageProgressPercent: number;
}

const HERO_MISSION_STATUSES = Object.values(HeroMissionStatus);
const HERO_PROGRESS_STATUSES = Object.values(HeroMissionProgressStatus);
const HERO_EVENT_TYPES = Object.values(HeroJourneyEventType);

export function calculateHeroCompletionRate(
  completedProgress: number,
  totalProgress: number,
): number {
  if (totalProgress <= 0) return 0;
  return round4(completedProgress / totalProgress);
}

export function calculateAverageProgressPercent(
  rows: Array<{ progressPercent: number | null | undefined }>,
): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce(
    (sum, row) => sum + Math.max(0, row.progressPercent ?? 0),
    0,
  );
  return round2(total / rows.length);
}

export function summarizeHeroMissionStatuses(
  missions: Array<{
    status: HeroMissionStatus | string;
    badgeRewardId?: string | null;
    rewardXp?: number | null;
  }>,
): HeroMissionStatusSummary {
  const counts = new Map<HeroMissionStatus, number>(
    HERO_MISSION_STATUSES.map((status) => [status, 0]),
  );

  let withBadgeReward = 0;
  let withXpReward = 0;
  for (const mission of missions) {
    const status = normalizeHeroMissionStatus(mission.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
    if (mission.badgeRewardId) withBadgeReward += 1;
    if ((mission.rewardXp ?? 0) > 0) withXpReward += 1;
  }

  return {
    total: missions.length,
    draft: counts.get(HeroMissionStatus.DRAFT) ?? 0,
    published: counts.get(HeroMissionStatus.PUBLISHED) ?? 0,
    archived: counts.get(HeroMissionStatus.ARCHIVED) ?? 0,
    withBadgeReward,
    withXpReward,
  };
}

export function summarizeHeroProgressStatuses(
  progressRows: Array<{ status: HeroMissionProgressStatus | string }>,
  expectedProgressCount?: number,
): HeroProgressStatusSummary {
  const counts = new Map<HeroMissionProgressStatus, number>(
    HERO_PROGRESS_STATUSES.map((status) => [status, 0]),
  );

  for (const progress of progressRows) {
    const status = normalizeHeroProgressStatus(progress.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const totalProgress =
    expectedProgressCount !== undefined
      ? Math.max(expectedProgressCount, progressRows.length)
      : progressRows.length;
  const explicitNotStarted = counts.get(HeroMissionProgressStatus.NOT_STARTED) ?? 0;
  const inferredNotStarted = Math.max(totalProgress - progressRows.length, 0);
  const completed = counts.get(HeroMissionProgressStatus.COMPLETED) ?? 0;

  return {
    totalProgress,
    notStarted: explicitNotStarted + inferredNotStarted,
    inProgress: counts.get(HeroMissionProgressStatus.IN_PROGRESS) ?? 0,
    completed,
    cancelled: counts.get(HeroMissionProgressStatus.CANCELLED) ?? 0,
    completionRate: calculateHeroCompletionRate(completed, totalProgress),
  };
}

export function summarizeHeroEventTypes(
  events: Array<{ type: HeroJourneyEventType | string }>,
): HeroEventTypeSummary {
  const counts = new Map<HeroJourneyEventType, number>(
    HERO_EVENT_TYPES.map((type) => [type, 0]),
  );

  for (const event of events) {
    const type = normalizeHeroEventType(event.type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return {
    missionStarted: counts.get(HeroJourneyEventType.MISSION_STARTED) ?? 0,
    objectiveCompleted: counts.get(HeroJourneyEventType.OBJECTIVE_COMPLETED) ?? 0,
    missionCompleted: counts.get(HeroJourneyEventType.MISSION_COMPLETED) ?? 0,
    xpGranted: counts.get(HeroJourneyEventType.XP_GRANTED) ?? 0,
    badgeAwarded: counts.get(HeroJourneyEventType.BADGE_AWARDED) ?? 0,
  };
}

export function summarizeHeroRewards(params: {
  xpLedger: Array<{
    sourceType: XpSourceType | string;
    sourceId: string;
    amount: number;
  }>;
  studentBadges: Array<{ studentId: string }>;
}): HeroRewardSummary {
  const heroXpLedger = params.xpLedger.filter(
    (entry) => normalizeXpSourceType(entry.sourceType) === XpSourceType.HERO_MISSION,
  );
  const xpMissionIds = new Set(heroXpLedger.map((entry) => entry.sourceId));
  const studentsWithBadges = new Set(
    params.studentBadges.map((badge) => badge.studentId),
  );

  return {
    totalHeroXp: heroXpLedger.reduce((sum, entry) => sum + entry.amount, 0),
    xpGrantedMissions: xpMissionIds.size,
    badgesAwarded: params.studentBadges.length,
    studentsWithBadges: studentsWithBadges.size,
  };
}

export function buildHeroTopStudents(params: {
  progress: HeroTopStudentInput[];
  xpLedger: HeroTopStudentInput[];
  badges: HeroTopStudentInput[];
  limit?: number;
}): HeroTopStudentRow[] {
  const rows = new Map<
    string,
    HeroTopStudentRow & { progressTotal: number; progressCount: number; badgeIds: Set<string> }
  >();

  for (const input of [
    ...params.progress,
    ...params.xpLedger,
    ...params.badges,
  ]) {
    const row = getOrCreateTopStudentRow(rows, input);
    if (input.progressPercent !== undefined && input.progressPercent !== null) {
      row.progressTotal += input.progressPercent;
      row.progressCount += 1;
      row.averageProgressPercent = round2(row.progressTotal / row.progressCount);
    }
    if (input.progressStatus) {
      const status = normalizeHeroProgressStatus(input.progressStatus);
      if (status === HeroMissionProgressStatus.COMPLETED) {
        row.completedMissions += 1;
      }
    }
    if (input.xpAmount) {
      row.totalHeroXp += input.xpAmount;
    }
    if (input.badgeId) {
      row.badgeIds.add(input.badgeId);
      row.badgesCount = row.badgeIds.size;
    }
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (right.totalHeroXp !== left.totalHeroXp) {
        return right.totalHeroXp - left.totalHeroXp;
      }
      if (right.completedMissions !== left.completedMissions) {
        return right.completedMissions - left.completedMissions;
      }
      if (right.badgesCount !== left.badgesCount) {
        return right.badgesCount - left.badgesCount;
      }
      const nameCompare = left.student.name.localeCompare(right.student.name);
      return nameCompare !== 0
        ? nameCompare
        : left.studentId.localeCompare(right.studentId);
    })
    .slice(0, params.limit ?? 10)
    .map(({ progressTotal, progressCount, badgeIds, ...row }) => row);
}

export function deriveHeroMissionRewardState(params: {
  mission: { id: string; rewardXp: number; badgeRewardId?: string | null };
  progress?: { id: string; xpLedgerId?: string | null } | null;
  xpLedger?: { id: string; sourceId: string } | null;
  studentBadge?: { id: string; badgeId: string } | null;
}) {
  const progress = params.progress ?? null;
  const ledger = params.xpLedger ?? null;
  const studentBadge = params.studentBadge ?? null;

  return {
    progressId: progress?.id ?? null,
    missionId: params.mission.id,
    rewardXp: params.mission.rewardXp,
    xpGranted: Boolean(progress?.xpLedgerId || ledger),
    xpLedgerId: progress?.xpLedgerId ?? ledger?.id ?? null,
    badgeRewardId: params.mission.badgeRewardId ?? null,
    badgeAwarded: Boolean(studentBadge),
    studentBadgeId: studentBadge?.id ?? null,
  };
}

export function summarizeBadgeEarnings(params: {
  badges: Array<{ id: string; isActive: boolean }>;
  studentBadges: Array<{ badgeId: string; studentId: string }>;
}) {
  const studentsWithBadges = new Set(
    params.studentBadges.map((badge) => badge.studentId),
  );

  return {
    badgesTotal: params.badges.length,
    activeBadges: params.badges.filter((badge) => badge.isActive).length,
    earnedTotal: params.studentBadges.length,
    studentsWithBadges: studentsWithBadges.size,
  };
}

export function normalizeHeroDashboardScope(input: {
  academicYearId: string;
  termId: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  subjectId?: string | null;
}): HeroDashboardScope {
  return {
    academicYearId: input.academicYearId,
    yearId: input.academicYearId,
    termId: input.termId,
    stageId: input.stageId ?? null,
    gradeId: input.gradeId ?? null,
    sectionId: input.sectionId ?? null,
    classroomId: input.classroomId ?? null,
    studentId: input.studentId ?? null,
    subjectId: input.subjectId ?? null,
  };
}

export function assertValidHeroDashboardDateRange(
  range: HeroDashboardDateRange,
): void {
  if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo) {
    throw new ValidationDomainException(
      'Hero Journey dashboard date range start must be before or equal to end',
      {
        dateFrom: range.dateFrom.toISOString(),
        dateTo: range.dateTo.toISOString(),
      },
    );
  }
}

function getOrCreateTopStudentRow(
  rows: Map<
    string,
    HeroTopStudentRow & { progressTotal: number; progressCount: number; badgeIds: Set<string> }
  >,
  input: HeroTopStudentInput,
) {
  const existing = rows.get(input.studentId);
  if (existing) return existing;

  const student = input.student ?? {
    id: input.studentId,
    firstName: '',
    lastName: '',
    nameAr: null,
    code: null,
    admissionNo: null,
  };
  const name = `${student.firstName} ${student.lastName}`.trim();
  const row = {
    studentId: input.studentId,
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      name,
      nameAr: student.nameAr ?? null,
      code: student.code ?? null,
      admissionNo: student.admissionNo ?? null,
    },
    completedMissions: 0,
    totalHeroXp: 0,
    badgesCount: 0,
    averageProgressPercent: 0,
    progressTotal: 0,
    progressCount: 0,
    badgeIds: new Set<string>(),
  };
  rows.set(input.studentId, row);
  return row;
}

function normalizeHeroMissionStatus(
  input: HeroMissionStatus | string,
): HeroMissionStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      draft: HeroMissionStatus.DRAFT,
      published: HeroMissionStatus.PUBLISHED,
      archived: HeroMissionStatus.ARCHIVED,
    },
    values: HERO_MISSION_STATUSES,
    field: 'missionStatus',
  });
}

function normalizeHeroProgressStatus(
  input: HeroMissionProgressStatus | string,
): HeroMissionProgressStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      not_started: HeroMissionProgressStatus.NOT_STARTED,
      notstarted: HeroMissionProgressStatus.NOT_STARTED,
      in_progress: HeroMissionProgressStatus.IN_PROGRESS,
      inprogress: HeroMissionProgressStatus.IN_PROGRESS,
      completed: HeroMissionProgressStatus.COMPLETED,
      cancelled: HeroMissionProgressStatus.CANCELLED,
      canceled: HeroMissionProgressStatus.CANCELLED,
    },
    values: HERO_PROGRESS_STATUSES,
    field: 'progressStatus',
  });
}

function normalizeHeroEventType(
  input: HeroJourneyEventType | string,
): HeroJourneyEventType {
  return normalizeEnumValue({
    input,
    aliases: {
      mission_started: HeroJourneyEventType.MISSION_STARTED,
      missionstarted: HeroJourneyEventType.MISSION_STARTED,
      objective_completed: HeroJourneyEventType.OBJECTIVE_COMPLETED,
      objectivecompleted: HeroJourneyEventType.OBJECTIVE_COMPLETED,
      mission_completed: HeroJourneyEventType.MISSION_COMPLETED,
      missioncompleted: HeroJourneyEventType.MISSION_COMPLETED,
      xp_granted: HeroJourneyEventType.XP_GRANTED,
      xpgranted: HeroJourneyEventType.XP_GRANTED,
      badge_awarded: HeroJourneyEventType.BADGE_AWARDED,
      badgeawarded: HeroJourneyEventType.BADGE_AWARDED,
    },
    values: HERO_EVENT_TYPES,
    field: 'eventType',
  });
}

function normalizeXpSourceType(input: XpSourceType | string): XpSourceType {
  return normalizeEnumValue({
    input,
    aliases: {
      hero_mission: XpSourceType.HERO_MISSION,
      heromission: XpSourceType.HERO_MISSION,
      reinforcement_task: XpSourceType.REINFORCEMENT_TASK,
      reinforcementtask: XpSourceType.REINFORCEMENT_TASK,
      manual_bonus: XpSourceType.MANUAL_BONUS,
      manualbonus: XpSourceType.MANUAL_BONUS,
      behavior: XpSourceType.BEHAVIOR,
      grade: XpSourceType.GRADE,
      attendance: XpSourceType.ATTENDANCE,
      system: XpSourceType.SYSTEM,
    },
    values: Object.values(XpSourceType),
    field: 'sourceType',
  });
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  field: string;
}): TEnum {
  const normalized =
    params.input === undefined || params.input === null
      ? ''
      : String(params.input).trim();
  if (!normalized) {
    throw new ValidationDomainException('Enum value is required', {
      field: params.field,
    });
  }

  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias = params.aliases[aliasKey] ?? params.aliases[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as TEnum;
  if (params.values.includes(enumValue)) return enumValue;

  throw new ValidationDomainException('Enum value is invalid', {
    field: params.field,
    value: params.input,
  });
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
