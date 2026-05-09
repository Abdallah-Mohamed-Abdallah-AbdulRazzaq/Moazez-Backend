import { BehaviorRecordType } from '@prisma/client';
import {
  ParentBehaviorChildDto,
  ParentBehaviorListResponseDto,
  ParentBehaviorRecordDto,
  ParentBehaviorRecordResponseDto,
  ParentBehaviorSummaryDto,
  ParentBehaviorSummaryResponseDto,
  ParentBehaviorVisibilityDto,
} from '../dto/parent-behavior.dto';
import type {
  ParentBehaviorListReadModel,
  ParentBehaviorRecordDetailReadModel,
  ParentBehaviorRecordReadModel,
  ParentBehaviorSummaryReadModel,
} from '../infrastructure/parent-behavior-read.adapter';

const VISIBILITY: ParentBehaviorVisibilityDto = {
  status: 'approved',
  reason: 'approved_records_only',
};

export class ParentBehaviorPresenter {
  static presentList(
    result: ParentBehaviorListReadModel,
  ): ParentBehaviorListResponseDto {
    return {
      child: presentChild(result),
      summary: presentSummary(result.summary),
      records: result.records.map((record) => presentRecord(record)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      visibility: VISIBILITY,
    };
  }

  static presentSummary(input: {
    child: ParentBehaviorListReadModel['child'];
    summary: ParentBehaviorSummaryReadModel;
  }): ParentBehaviorSummaryResponseDto {
    return {
      child: presentChild(input),
      summary: presentSummary(input.summary),
      visibility: VISIBILITY,
    };
  }

  static presentRecord(
    result: ParentBehaviorRecordDetailReadModel,
  ): ParentBehaviorRecordResponseDto {
    return {
      child: presentChild(result),
      ...presentRecord(result.record),
      visibility: VISIBILITY,
    };
  }
}

function presentChild(input: {
  child: ParentBehaviorListReadModel['child'];
}): ParentBehaviorChildDto {
  return {
    studentId: input.child.studentId,
    enrollmentId: input.child.enrollmentId,
    student_id: input.child.studentId,
    enrollment_id: input.child.enrollmentId,
  };
}

function presentSummary(
  summary: ParentBehaviorSummaryReadModel,
): ParentBehaviorSummaryDto {
  return {
    attendanceCount: summary.attendanceCount,
    absenceCount: summary.absenceCount,
    latenessCount: summary.latenessCount,
    attendance_count: summary.attendanceCount,
    absence_count: summary.absenceCount,
    lateness_count: summary.latenessCount,
    dateText: summary.dateText,
    date_text: summary.dateText,
    positiveCount: summary.positiveCount,
    negativeCount: summary.negativeCount,
    positivePoints: summary.positivePoints,
    negativePoints: summary.negativePoints,
    totalBehaviorPoints: summary.totalBehaviorPoints,
    positive_count: summary.positiveCount,
    negative_count: summary.negativeCount,
    positive_points: summary.positivePoints,
    negative_points: summary.negativePoints,
    total_behavior_points: summary.totalBehaviorPoints,
  };
}

function presentRecord(
  record: ParentBehaviorRecordReadModel,
): ParentBehaviorRecordDto {
  const occurredAt = record.occurredAt.toISOString();

  return {
    id: record.id,
    type: presentBehaviorType(record.type),
    title: record.titleEn ?? record.titleAr ?? null,
    date: occurredAt.slice(0, 10),
    occurredAt,
    occurred_at: occurredAt,
    points: record.points,
    note: record.noteEn ?? record.noteAr ?? null,
    status: 'approved',
    category: record.category
      ? {
          categoryId: record.category.id,
          code: record.category.code,
          name: record.category.nameEn ?? record.category.nameAr ?? null,
          type: presentBehaviorType(record.category.type),
        }
      : null,
  };
}

function presentBehaviorType(
  type: BehaviorRecordType,
): 'positive' | 'negative' {
  return type === BehaviorRecordType.POSITIVE ? 'positive' : 'negative';
}
