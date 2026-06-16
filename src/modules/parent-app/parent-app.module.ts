import { Module } from '@nestjs/common';
import { AppCalendarReadModelModule } from '../academics/calendar/app-facing/app-calendar-read-model.module';
import { CommunicationModule } from '../communication/communication.module';
import { ParentAppAccessService } from './access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from './access/parent-app-guardian-read.adapter';
import { GetParentAnnouncementUseCase } from './announcements/application/get-parent-announcement.use-case';
import { ListParentAnnouncementAttachmentsUseCase } from './announcements/application/list-parent-announcement-attachments.use-case';
import { ListParentAnnouncementsUseCase } from './announcements/application/list-parent-announcements.use-case';
import { MarkParentAnnouncementReadUseCase } from './announcements/application/mark-parent-announcement-read.use-case';
import { ParentAnnouncementsController } from './announcements/controller/parent-announcements.controller';
import { ParentAnnouncementsReadAdapter } from './announcements/infrastructure/parent-announcements-read.adapter';
import { GetParentChildBehaviorRecordUseCase } from './behavior/application/get-parent-child-behavior-record.use-case';
import { GetParentChildBehaviorSummaryUseCase } from './behavior/application/get-parent-child-behavior-summary.use-case';
import { ListParentChildBehaviorUseCase } from './behavior/application/list-parent-child-behavior.use-case';
import { ParentBehaviorController } from './behavior/controller/parent-behavior.controller';
import { ParentBehaviorReadAdapter } from './behavior/infrastructure/parent-behavior-read.adapter';
import { GetParentCalendarEventUseCase } from './calendar/application/get-parent-calendar-event.use-case';
import { ListParentCalendarEventsUseCase } from './calendar/application/list-parent-calendar-events.use-case';
import { ParentCalendarController } from './calendar/controller/parent-calendar.controller';
import { GetParentChildUseCase } from './children/application/get-parent-child.use-case';
import { ListParentChildrenUseCase } from './children/application/list-parent-children.use-case';
import { ParentChildrenController } from './children/controller/parent-children.controller';
import { ParentChildrenReadAdapter } from './children/infrastructure/parent-children-read.adapter';
import { GetParentChildAssessmentGradeUseCase } from './grades/application/get-parent-child-assessment-grade.use-case';
import { GetParentChildGradesSummaryUseCase } from './grades/application/get-parent-child-grades-summary.use-case';
import { ListParentChildGradesUseCase } from './grades/application/list-parent-child-grades.use-case';
import { ParentGradesController } from './grades/controller/parent-grades.controller';
import { ParentGradesReadAdapter } from './grades/infrastructure/parent-grades-read.adapter';
import { GetParentHomeUseCase } from './home/application/get-parent-home.use-case';
import { ParentHomeController } from './home/controller/parent-home.controller';
import { ParentHomeReadAdapter } from './home/infrastructure/parent-home-read.adapter';
import { ParentHomeworksModule } from './homeworks/parent-homeworks.module';
import { GetParentMessageConversationUseCase } from './messages/application/get-parent-message-conversation.use-case';
import { ListParentConversationMessagesUseCase } from './messages/application/list-parent-conversation-messages.use-case';
import { ListParentMessageConversationsUseCase } from './messages/application/list-parent-message-conversations.use-case';
import { MarkParentConversationReadUseCase } from './messages/application/mark-parent-conversation-read.use-case';
import { SendParentConversationMessageUseCase } from './messages/application/send-parent-conversation-message.use-case';
import { ParentMessagesController } from './messages/controller/parent-messages.controller';
import { ParentMessagesReadAdapter } from './messages/infrastructure/parent-messages-read.adapter';
import { GetParentProfileUseCase } from './profile/application/get-parent-profile.use-case';
import { ParentProfileController } from './profile/controller/parent-profile.controller';
import { ParentProfileReadAdapter } from './profile/infrastructure/parent-profile-read.adapter';
import { GetParentChildAcademicProgressUseCase } from './progress/application/get-parent-child-academic-progress.use-case';
import { GetParentChildBehaviorProgressUseCase } from './progress/application/get-parent-child-behavior-progress.use-case';
import { GetParentChildProgressUseCase } from './progress/application/get-parent-child-progress.use-case';
import { GetParentChildXpProgressUseCase } from './progress/application/get-parent-child-xp-progress.use-case';
import { ParentProgressController } from './progress/controller/parent-progress.controller';
import { ParentProgressReadAdapter } from './progress/infrastructure/parent-progress-read.adapter';
import { GetParentChildReportsSummaryUseCase } from './reports/application/get-parent-child-reports-summary.use-case';
import { ListParentChildReportsUseCase } from './reports/application/list-parent-child-reports.use-case';
import { ParentReportsController } from './reports/controller/parent-reports.controller';
import { ParentReportsReadAdapter } from './reports/infrastructure/parent-reports-read.adapter';
import { GetParentChildTodayScheduleUseCase } from './schedule/application/get-parent-child-today-schedule.use-case';
import { GetParentChildWeeklyScheduleUseCase } from './schedule/application/get-parent-child-weekly-schedule.use-case';
import { ParentScheduleClock } from './schedule/application/parent-schedule-date';
import { ParentScheduleController } from './schedule/controller/parent-schedule.controller';
import { ParentScheduleReadAdapter } from './schedule/infrastructure/parent-schedule-read.adapter';
import { GetParentChildTaskSubmissionUseCase } from './tasks/application/get-parent-child-task-submission.use-case';
import { GetParentChildTaskUseCase } from './tasks/application/get-parent-child-task.use-case';
import { GetParentChildTasksSummaryUseCase } from './tasks/application/get-parent-child-tasks-summary.use-case';
import { ListParentChildTaskSubmissionsUseCase } from './tasks/application/list-parent-child-task-submissions.use-case';
import { ListParentChildTasksUseCase } from './tasks/application/list-parent-child-tasks.use-case';
import { ParentTasksController } from './tasks/controller/parent-tasks.controller';
import { ParentTasksReadAdapter } from './tasks/infrastructure/parent-tasks-read.adapter';

@Module({
  imports: [
    AppCalendarReadModelModule,
    CommunicationModule,
    ParentHomeworksModule,
  ],
  controllers: [
    ParentHomeController,
    ParentChildrenController,
    ParentProfileController,
    ParentGradesController,
    ParentBehaviorController,
    ParentProgressController,
    ParentReportsController,
    ParentScheduleController,
    ParentTasksController,
    ParentMessagesController,
    ParentAnnouncementsController,
    ParentCalendarController,
  ],
  providers: [
    ParentAppAccessService,
    ParentAppGuardianReadAdapter,
    ParentHomeReadAdapter,
    GetParentHomeUseCase,
    ParentChildrenReadAdapter,
    ListParentChildrenUseCase,
    GetParentChildUseCase,
    ParentProfileReadAdapter,
    GetParentProfileUseCase,
    ParentGradesReadAdapter,
    ListParentChildGradesUseCase,
    GetParentChildGradesSummaryUseCase,
    GetParentChildAssessmentGradeUseCase,
    ParentBehaviorReadAdapter,
    ListParentChildBehaviorUseCase,
    GetParentChildBehaviorSummaryUseCase,
    GetParentChildBehaviorRecordUseCase,
    ParentProgressReadAdapter,
    GetParentChildProgressUseCase,
    GetParentChildAcademicProgressUseCase,
    GetParentChildBehaviorProgressUseCase,
    GetParentChildXpProgressUseCase,
    ParentReportsReadAdapter,
    ListParentChildReportsUseCase,
    GetParentChildReportsSummaryUseCase,
    ParentScheduleClock,
    ParentScheduleReadAdapter,
    GetParentChildTodayScheduleUseCase,
    GetParentChildWeeklyScheduleUseCase,
    ParentTasksReadAdapter,
    ListParentChildTasksUseCase,
    GetParentChildTasksSummaryUseCase,
    GetParentChildTaskUseCase,
    ListParentChildTaskSubmissionsUseCase,
    GetParentChildTaskSubmissionUseCase,
    ParentMessagesReadAdapter,
    ListParentMessageConversationsUseCase,
    GetParentMessageConversationUseCase,
    ListParentConversationMessagesUseCase,
    SendParentConversationMessageUseCase,
    MarkParentConversationReadUseCase,
    ParentAnnouncementsReadAdapter,
    ListParentAnnouncementsUseCase,
    GetParentAnnouncementUseCase,
    MarkParentAnnouncementReadUseCase,
    ListParentAnnouncementAttachmentsUseCase,
    ListParentCalendarEventsUseCase,
    GetParentCalendarEventUseCase,
  ],
  exports: [ParentAppAccessService],
})
export class ParentAppModule {}
