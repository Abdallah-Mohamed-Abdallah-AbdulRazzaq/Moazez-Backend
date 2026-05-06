import { BehaviorRecordType } from '@prisma/client';
import {
  StudentBehaviorListResponseDto,
  StudentBehaviorRecordDto,
  StudentBehaviorRecordResponseDto,
  StudentBehaviorSummaryDto,
  StudentBehaviorSummaryResponseDto,
  StudentBehaviorVisibilityDto,
} from '../dto/student-behavior.dto';
import type {
  StudentBehaviorListReadModel,
  StudentBehaviorRecordReadModel,
  StudentBehaviorSummaryReadModel,
} from '../infrastructure/student-behavior-read.adapter';

const VISIBILITY: StudentBehaviorVisibilityDto = {
  status: 'approved',
  reason: 'approved_records_only',
};

export class StudentBehaviorPresenter {
  static presentList(
    result: StudentBehaviorListReadModel,
  ): StudentBehaviorListResponseDto {
    return {
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

  static presentSummary(
    summary: StudentBehaviorSummaryReadModel,
  ): StudentBehaviorSummaryResponseDto {
    return {
      summary: presentSummary(summary),
      visibility: VISIBILITY,
    };
  }

  static presentRecord(
    record: StudentBehaviorRecordReadModel,
  ): StudentBehaviorRecordResponseDto {
    return presentRecord(record);
  }
}

export function presentBehaviorSummaryForComposition(
  summary: StudentBehaviorSummaryReadModel,
): StudentBehaviorSummaryDto {
  return presentSummary(summary);
}

function presentSummary(
  summary: StudentBehaviorSummaryReadModel,
): StudentBehaviorSummaryDto {
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
  record: StudentBehaviorRecordReadModel,
): StudentBehaviorRecordDto {
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
