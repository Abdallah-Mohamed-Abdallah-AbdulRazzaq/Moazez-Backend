import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import type { TeacherAppClassMetricRecord } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import {
  TeacherClassDetailResponseDto,
  TeacherClassesListResponseDto,
  TeacherClassMetricsDto,
  TeacherClassResponseDto,
} from '../dto/teacher-my-classes.dto';

const EMPTY_METRIC: TeacherAppClassMetricRecord = {
  studentsCount: 0,
  activeAssignmentsCount: null,
  pendingReviewCount: null,
  followUpCount: null,
  pendingAttendanceCount: null,
  todayAttendanceStatus: null,
  lastAttendanceStatus: null,
  averageGrade: null,
  completionRate: null,
};

export interface TeacherClassesListPresenterInput {
  allocations: TeacherAppAllocationRecord[];
  metrics: Map<string, TeacherAppClassMetricRecord>;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export class TeacherClassPresenter {
  static presentList(
    input: TeacherClassesListPresenterInput,
  ): TeacherClassesListResponseDto {
    return {
      classes: input.allocations.map((allocation) =>
        this.presentClass(allocation, input.metrics.get(allocation.id)),
      ),
      pagination: input.pagination,
    };
  }

  static presentDetail(params: {
    allocation: TeacherAppAllocationRecord;
    metric?: TeacherAppClassMetricRecord;
  }): TeacherClassDetailResponseDto {
    const classCard = this.presentClass(params.allocation, params.metric);
    const metrics = this.presentMetrics(params.metric);

    return {
      class: classCard,
      metrics,
      rosterPreview: [],
      attendanceSummary: null,
      gradeSummary: null,
      behaviorSummary: null,
      reinforcementSummary: null,
    };
  }

  static presentClass(
    allocation: TeacherAppAllocationRecord,
    metric: TeacherAppClassMetricRecord = EMPTY_METRIC,
  ): TeacherClassResponseDto {
    const classroom = allocation.classroom;
    const section = classroom?.section;
    const grade = section?.grade;
    const stage = grade?.stage;
    const subject = allocation.subject;
    const term = allocation.term;

    return {
      id: allocation.id,
      classId: allocation.id,
      classroomId: allocation.classroomId,
      classroomName: localizedName(classroom),
      className: localizedName(classroom),
      subjectId: allocation.subjectId,
      subjectName: localizedName(subject),
      termId: allocation.termId,
      termName: localizedName(term),
      gradeId: grade?.id ?? '',
      gradeName: localizedName(grade),
      sectionId: section?.id ?? '',
      sectionName: localizedName(section),
      stageId: stage?.id ?? '',
      stageName: localizedName(stage),
      cycleId: stage?.id ?? '',
      cycleName: localizedName(stage),
      roomName: classroom?.room ? localizedName(classroom.room) : null,
      studentsCount: metric.studentsCount,
      activeAssignmentsCount: metric.activeAssignmentsCount,
      pendingReviewCount: metric.pendingReviewCount,
      followUpCount: metric.followUpCount,
      pendingAttendanceCount: metric.pendingAttendanceCount,
      todayAttendanceStatus: metric.todayAttendanceStatus,
      lastAttendanceStatus: metric.lastAttendanceStatus,
      averageGrade: metric.averageGrade,
      completionRate: metric.completionRate,
      needsPreparation: null,
      note: null,
    };
  }

  private static presentMetrics(
    metric: TeacherAppClassMetricRecord = EMPTY_METRIC,
  ): TeacherClassMetricsDto {
    return {
      studentsCount: metric.studentsCount,
      activeAssignmentsCount: metric.activeAssignmentsCount,
      pendingReviewCount: metric.pendingReviewCount,
      followUpCount: metric.followUpCount,
      pendingAttendanceCount: metric.pendingAttendanceCount,
      todayAttendanceStatus: metric.todayAttendanceStatus,
      lastAttendanceStatus: metric.lastAttendanceStatus,
      averageGrade: metric.averageGrade,
      completionRate: metric.completionRate,
    };
  }
}

function localizedName(
  value: { nameEn?: string | null; nameAr?: string | null } | null | undefined,
): string {
  return value?.nameEn ?? value?.nameAr ?? '';
}
