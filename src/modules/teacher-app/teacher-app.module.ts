import { Module } from '@nestjs/common';
import { RollCallModule } from '../attendance/roll-call/roll-call.module';
import { AssessmentsModule } from '../grades/assessments/assessments.module';
import { TeacherAppAccessService } from './access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from './access/teacher-app-allocation-read.adapter';
import { GetTeacherClassroomAttendanceRosterUseCase } from './classroom/attendance/application/get-teacher-classroom-attendance-roster.use-case';
import { GetTeacherClassroomAttendanceSessionUseCase } from './classroom/attendance/application/get-teacher-classroom-attendance-session.use-case';
import { ResolveTeacherClassroomAttendanceSessionUseCase } from './classroom/attendance/application/resolve-teacher-classroom-attendance-session.use-case';
import { SubmitTeacherClassroomAttendanceSessionUseCase } from './classroom/attendance/application/submit-teacher-classroom-attendance-session.use-case';
import { UpdateTeacherClassroomAttendanceEntriesUseCase } from './classroom/attendance/application/update-teacher-classroom-attendance-entries.use-case';
import { TeacherClassroomAttendanceController } from './classroom/attendance/controller/teacher-classroom-attendance.controller';
import { TeacherClassroomAttendanceAdapter } from './classroom/attendance/infrastructure/teacher-classroom-attendance.adapter';
import { GetTeacherClassroomUseCase } from './classroom/application/get-teacher-classroom.use-case';
import { ListTeacherClassroomRosterUseCase } from './classroom/application/list-teacher-classroom-roster.use-case';
import { TeacherClassroomController } from './classroom/controller/teacher-classroom.controller';
import { GetTeacherClassroomAssignmentUseCase } from './classroom/grades/application/get-teacher-classroom-assignment.use-case';
import { GetTeacherClassroomAssignmentSubmissionUseCase } from './classroom/grades/application/get-teacher-classroom-assignment-submission.use-case';
import { GetTeacherClassroomAssessmentUseCase } from './classroom/grades/application/get-teacher-classroom-assessment.use-case';
import { GetTeacherClassroomGradebookUseCase } from './classroom/grades/application/get-teacher-classroom-gradebook.use-case';
import { BulkReviewTeacherClassroomSubmissionAnswersUseCase } from './classroom/grades/application/bulk-review-teacher-classroom-submission-answers.use-case';
import { FinalizeTeacherClassroomSubmissionReviewUseCase } from './classroom/grades/application/finalize-teacher-classroom-submission-review.use-case';
import { ListTeacherClassroomAssignmentSubmissionsUseCase } from './classroom/grades/application/list-teacher-classroom-assignment-submissions.use-case';
import { ListTeacherClassroomAssignmentsUseCase } from './classroom/grades/application/list-teacher-classroom-assignments.use-case';
import { ListTeacherClassroomAssessmentsUseCase } from './classroom/grades/application/list-teacher-classroom-assessments.use-case';
import { ReviewTeacherClassroomSubmissionAnswerUseCase } from './classroom/grades/application/review-teacher-classroom-submission-answer.use-case';
import { SyncTeacherClassroomSubmissionGradeItemUseCase } from './classroom/grades/application/sync-teacher-classroom-submission-grade-item.use-case';
import { TeacherClassroomAssignmentsController } from './classroom/grades/controller/teacher-classroom-assignments.controller';
import { TeacherClassroomGradesController } from './classroom/grades/controller/teacher-classroom-grades.controller';
import { TeacherClassroomSubmissionReviewController } from './classroom/grades/controller/teacher-classroom-submission-review.controller';
import { TeacherClassroomGradesReadAdapter } from './classroom/grades/infrastructure/teacher-classroom-grades-read.adapter';
import { TeacherClassroomReadAdapter } from './classroom/infrastructure/teacher-classroom-read.adapter';
import { GetTeacherHomeUseCase } from './home/application/get-teacher-home.use-case';
import { TeacherHomeController } from './home/controller/teacher-home.controller';
import { GetTeacherClassDetailUseCase } from './my-classes/application/get-teacher-class-detail.use-case';
import { ListTeacherClassesUseCase } from './my-classes/application/list-teacher-classes.use-case';
import { TeacherMyClassesController } from './my-classes/controller/teacher-my-classes.controller';
import { TeacherAppCompositionReadAdapter } from './shared/infrastructure/teacher-app-composition-read.adapter';
import { GetTeacherTaskSelectorsUseCase } from './tasks/application/get-teacher-task-selectors.use-case';
import { GetTeacherTaskUseCase } from './tasks/application/get-teacher-task.use-case';
import { GetTeacherTasksDashboardUseCase } from './tasks/application/get-teacher-tasks-dashboard.use-case';
import { ListTeacherTasksUseCase } from './tasks/application/list-teacher-tasks.use-case';
import { TeacherTasksController } from './tasks/controller/teacher-tasks.controller';
import { TeacherTasksReadAdapter } from './tasks/infrastructure/teacher-tasks-read.adapter';

@Module({
  imports: [RollCallModule, AssessmentsModule],
  controllers: [
    TeacherHomeController,
    TeacherMyClassesController,
    TeacherClassroomController,
    TeacherClassroomAttendanceController,
    TeacherClassroomGradesController,
    TeacherClassroomAssignmentsController,
    TeacherClassroomSubmissionReviewController,
    TeacherTasksController,
  ],
  providers: [
    TeacherAppAccessService,
    TeacherAppAllocationReadAdapter,
    TeacherAppCompositionReadAdapter,
    TeacherClassroomReadAdapter,
    TeacherClassroomAttendanceAdapter,
    TeacherClassroomGradesReadAdapter,
    GetTeacherHomeUseCase,
    ListTeacherClassesUseCase,
    GetTeacherClassDetailUseCase,
    GetTeacherClassroomUseCase,
    ListTeacherClassroomRosterUseCase,
    ListTeacherClassroomAssessmentsUseCase,
    GetTeacherClassroomAssessmentUseCase,
    GetTeacherClassroomGradebookUseCase,
    ListTeacherClassroomAssignmentsUseCase,
    GetTeacherClassroomAssignmentUseCase,
    ListTeacherClassroomAssignmentSubmissionsUseCase,
    GetTeacherClassroomAssignmentSubmissionUseCase,
    ReviewTeacherClassroomSubmissionAnswerUseCase,
    BulkReviewTeacherClassroomSubmissionAnswersUseCase,
    FinalizeTeacherClassroomSubmissionReviewUseCase,
    SyncTeacherClassroomSubmissionGradeItemUseCase,
    GetTeacherClassroomAttendanceRosterUseCase,
    ResolveTeacherClassroomAttendanceSessionUseCase,
    GetTeacherClassroomAttendanceSessionUseCase,
    UpdateTeacherClassroomAttendanceEntriesUseCase,
    SubmitTeacherClassroomAttendanceSessionUseCase,
    TeacherTasksReadAdapter,
    GetTeacherTasksDashboardUseCase,
    ListTeacherTasksUseCase,
    GetTeacherTaskUseCase,
    GetTeacherTaskSelectorsUseCase,
  ],
  exports: [TeacherAppAccessService],
})
export class TeacherAppModule {}
