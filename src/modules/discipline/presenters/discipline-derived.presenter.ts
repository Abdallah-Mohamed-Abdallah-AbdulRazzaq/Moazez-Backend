import {
  DisciplineChildDto,
  DisciplineSummaryDto,
  DisciplineSummaryResponseDto,
  DisciplineTimelineAttendanceDto,
  DisciplineTimelineCategoryDto,
  DisciplineTimelineItemDto,
  DisciplineTimelineListResponseDto,
  ParentDisciplineSummaryResponseDto,
  ParentDisciplineTimelineListResponseDto,
} from '../dto/discipline-derived.dto';
import type {
  DisciplineSummaryReadModel,
  DisciplineTimelineListReadModel,
  DisciplineTimelineReadAttendance,
  DisciplineTimelineReadCategory,
  DisciplineTimelineReadItem,
} from '../infrastructure/discipline-derived.repository';

export class DisciplineDerivedPresenter {
  static presentList(
    result: DisciplineTimelineListReadModel,
  ): DisciplineTimelineListResponseDto {
    return {
      items: result.items.map((item) => presentTimelineItem(item)),
      summary: presentSummaryValue(result.summary),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  static presentSummary(
    summary: DisciplineSummaryReadModel,
  ): DisciplineSummaryResponseDto {
    return {
      summary: presentSummaryValue(summary),
    };
  }

  static presentParentList(params: {
    child: DisciplineChildDto;
    result: DisciplineTimelineListReadModel;
  }): ParentDisciplineTimelineListResponseDto {
    return {
      child: presentChild(params.child),
      ...this.presentList(params.result),
    };
  }

  static presentParentSummary(params: {
    child: DisciplineChildDto;
    summary: DisciplineSummaryReadModel;
  }): ParentDisciplineSummaryResponseDto {
    return {
      child: presentChild(params.child),
      ...this.presentSummary(params.summary),
    };
  }
}

function presentChild(child: DisciplineChildDto): DisciplineChildDto {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    student_id: child.studentId,
    enrollment_id: child.enrollmentId,
  };
}

function presentTimelineItem(
  item: DisciplineTimelineReadItem,
): DisciplineTimelineItemDto {
  const occurredAt = item.occurredAt.toISOString();

  return {
    id: item.id,
    sourceType: item.sourceType,
    source_type: item.sourceType,
    itemType: item.itemType,
    item_type: item.itemType,
    occurredAt,
    occurred_at: occurredAt,
    date: occurredAt.slice(0, 10),
    title: item.title,
    description: item.description,
    severity: item.severity,
    pointsDelta: item.pointsDelta,
    points_delta: item.pointsDelta,
    status: item.status,
    category: item.category ? presentCategory(item.category) : null,
    attendance: item.attendance ? presentAttendance(item.attendance) : null,
  };
}

function presentCategory(
  category: DisciplineTimelineReadCategory,
): DisciplineTimelineCategoryDto {
  return {
    id: category.id,
    code: category.code,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    name_ar: category.nameAr,
    name_en: category.nameEn,
    type: category.type,
  };
}

function presentAttendance(
  attendance: DisciplineTimelineReadAttendance,
): DisciplineTimelineAttendanceDto {
  return {
    status: attendance.status,
    lateMinutes: attendance.lateMinutes,
    minutesLate: attendance.lateMinutes,
    earlyLeaveMinutes: attendance.earlyLeaveMinutes,
    minutesEarlyLeave: attendance.earlyLeaveMinutes,
    excuseReason: attendance.excuseReason,
  };
}

function presentSummaryValue(
  summary: DisciplineSummaryReadModel,
): DisciplineSummaryDto {
  return {
    totalIncidents: summary.totalIncidents,
    attendanceIncidentCount: summary.attendanceIncidentCount,
    absenceCount: summary.absenceCount,
    lateCount: summary.lateCount,
    earlyLeaveCount: summary.earlyLeaveCount,
    excusedCount: summary.excusedCount,
    positiveCount: summary.positiveCount,
    negativeCount: summary.negativeCount,
    behaviorPoints: summary.behaviorPoints,
    period: summary.period,
    dateText: summary.dateText,
    total_incidents: summary.totalIncidents,
    attendance_incident_count: summary.attendanceIncidentCount,
    absence_count: summary.absenceCount,
    late_count: summary.lateCount,
    early_leave_count: summary.earlyLeaveCount,
    excused_count: summary.excusedCount,
    positive_count: summary.positiveCount,
    negative_count: summary.negativeCount,
    behavior_points: summary.behaviorPoints,
    date_text: summary.dateText,
  };
}
