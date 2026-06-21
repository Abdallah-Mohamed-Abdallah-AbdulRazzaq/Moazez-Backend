import { Module } from '@nestjs/common';
import { AppCalendarReadModelModule } from '../academics/calendar/app-facing/app-calendar-read-model.module';
import { CommunicationModule } from '../communication/communication.module';
import { DisciplineModule } from '../discipline/discipline.module';
import { GradesSubmissionsRepository } from '../grades/assessments/infrastructure/grades-submissions.repository';
import { AuthModule } from '../iam/auth/auth.module';
import { HeroJourneyModule } from '../reinforcement/hero-journey/hero-journey.module';
import { ReviewsModule } from '../reinforcement/reviews/reviews.module';
import { RewardsModule } from '../reinforcement/rewards/rewards.module';
import { StudentAppAccessService } from './access/student-app-access.service';
import { StudentAppStudentReadAdapter } from './access/student-app-student-read.adapter';
import { GetStudentAnnouncementUseCase } from './announcements/application/get-student-announcement.use-case';
import { ListStudentAnnouncementAttachmentsUseCase } from './announcements/application/list-student-announcement-attachments.use-case';
import { ListStudentAnnouncementsUseCase } from './announcements/application/list-student-announcements.use-case';
import { MarkStudentAnnouncementReadUseCase } from './announcements/application/mark-student-announcement-read.use-case';
import { StudentAnnouncementsController } from './announcements/controller/student-announcements.controller';
import { StudentAnnouncementsReadAdapter } from './announcements/infrastructure/student-announcements-read.adapter';
import { GetStudentBehaviorRecordUseCase } from './behavior/application/get-student-behavior-record.use-case';
import { GetStudentBehaviorSummaryUseCase } from './behavior/application/get-student-behavior-summary.use-case';
import { ListStudentBehaviorRecordsUseCase } from './behavior/application/list-student-behavior-records.use-case';
import { StudentBehaviorController } from './behavior/controller/student-behavior.controller';
import { StudentBehaviorReadAdapter } from './behavior/infrastructure/student-behavior-read.adapter';
import { GetStudentCalendarEventUseCase } from './calendar/application/get-student-calendar-event.use-case';
import { ListStudentCalendarEventsUseCase } from './calendar/application/list-student-calendar-events.use-case';
import { StudentCalendarController } from './calendar/controller/student-calendar.controller';
import { GetStudentDisciplineSummaryUseCase } from './discipline/application/get-student-discipline-summary.use-case';
import { ListStudentDisciplineUseCase } from './discipline/application/list-student-discipline.use-case';
import { StudentDisciplineController } from './discipline/controller/student-discipline.controller';
import { BulkSaveStudentExamAnswersUseCase } from './exams/application/bulk-save-student-exam-answers.use-case';
import { GetStudentExamSubmissionUseCase } from './exams/application/get-student-exam-submission.use-case';
import { GetStudentExamUseCase } from './exams/application/get-student-exam.use-case';
import { ListStudentExamsUseCase } from './exams/application/list-student-exams.use-case';
import { SaveStudentExamAnswerUseCase } from './exams/application/save-student-exam-answer.use-case';
import { StartStudentExamSubmissionUseCase } from './exams/application/start-student-exam-submission.use-case';
import { SubmitStudentExamSubmissionUseCase } from './exams/application/submit-student-exam-submission.use-case';
import { StudentExamsController } from './exams/controller/student-exams.controller';
import { StudentExamsReadAdapter } from './exams/infrastructure/student-exams-read.adapter';
import { StudentExamsSubmissionWriteAdapter } from './exams/infrastructure/student-exams-submission-write.adapter';
import { GetStudentAssessmentGradeUseCase } from './grades/application/get-student-assessment-grade.use-case';
import { GetStudentGradesSummaryUseCase } from './grades/application/get-student-grades-summary.use-case';
import { ListStudentGradesUseCase } from './grades/application/list-student-grades.use-case';
import { StudentGradesController } from './grades/controller/student-grades.controller';
import { StudentGradesReadAdapter } from './grades/infrastructure/student-grades-read.adapter';
import { GetStudentHeroMissionUseCase } from './hero/application/get-student-hero-mission.use-case';
import { GetStudentHeroOverviewUseCase } from './hero/application/get-student-hero-overview.use-case';
import { GetStudentHeroProgressUseCase } from './hero/application/get-student-hero-progress.use-case';
import { ListStudentHeroBadgesUseCase } from './hero/application/list-student-hero-badges.use-case';
import { ListStudentHeroMissionsUseCase } from './hero/application/list-student-hero-missions.use-case';
import { StudentHeroController } from './hero/controller/student-hero.controller';
import { StudentHeroReadAdapter } from './hero/infrastructure/student-hero-read.adapter';
import { StudentHomeworksModule } from './homeworks/student-homeworks.module';
import { GetStudentHomeUseCase } from './home/application/get-student-home.use-case';
import { StudentHomeController } from './home/controller/student-home.controller';
import { StudentHomeReadAdapter } from './home/infrastructure/student-home-read.adapter';
import { GetStudentLessonDetailUseCase } from './lessons/application/get-student-lesson-detail.use-case';
import { GetStudentLessonsTodayUseCase } from './lessons/application/get-student-lessons-today.use-case';
import { GetStudentLessonsWeekUseCase } from './lessons/application/get-student-lessons-week.use-case';
import { StudentLessonsController } from './lessons/controller/student-lessons.controller';
import { StudentLessonsReadAdapter } from './lessons/infrastructure/student-lessons-read.adapter';
import {
  GetStudentMessageInfoUseCase,
  GetStudentMessageReadersUseCase,
} from './messages/application/get-student-message-info.use-cases';
import { GetStudentMessageAttachmentDownloadUrlUseCase } from './messages/application/get-student-message-attachment-download-url.use-case';
import { GetStudentMessageConversationUseCase } from './messages/application/get-student-message-conversation.use-case';
import { ListStudentConversationMessagesUseCase } from './messages/application/list-student-conversation-messages.use-case';
import { ListStudentMessageConversationsUseCase } from './messages/application/list-student-message-conversations.use-case';
import { MarkStudentConversationReadUseCase } from './messages/application/mark-student-conversation-read.use-case';
import { SearchStudentConversationMessagesUseCase } from './messages/application/search-student-conversation-messages.use-case';
import { SendStudentConversationMessageUseCase } from './messages/application/send-student-conversation-message.use-case';
import {
  CreateStudentMessageConversationUseCase,
  ListStudentMessageContactsUseCase,
} from './messages/application/student-message-contacts.use-cases';
import { StudentMessagesController } from './messages/controller/student-messages.controller';
import { StudentMessagesReadAdapter } from './messages/infrastructure/student-messages-read.adapter';
import {
  ArchiveStudentNotificationUseCase,
  GetStudentNotificationPreferencesUseCase,
  GetStudentNotificationUseCase,
  GetStudentNotificationsSummaryUseCase,
  ListStudentNotificationsUseCase,
  MarkAllStudentNotificationsReadUseCase,
  MarkStudentNotificationReadUseCase,
  UpdateStudentNotificationPreferencesUseCase,
} from './notifications/application/student-notifications.use-cases';
import { StudentNotificationsController } from './notifications/controller/student-notifications.controller';
import { GetStudentProfileUseCase } from './profile/application/get-student-profile.use-case';
import { StudentProfileController } from './profile/controller/student-profile.controller';
import { StudentProfileReadAdapter } from './profile/infrastructure/student-profile-read.adapter';
import { GetStudentAcademicProgressUseCase } from './progress/application/get-student-academic-progress.use-case';
import { GetStudentBehaviorProgressUseCase } from './progress/application/get-student-behavior-progress.use-case';
import { GetStudentProgressUseCase } from './progress/application/get-student-progress.use-case';
import { GetStudentXpProgressUseCase } from './progress/application/get-student-xp-progress.use-case';
import { StudentProgressController } from './progress/controller/student-progress.controller';
import { StudentProgressReadAdapter } from './progress/infrastructure/student-progress-read.adapter';
import { GetStudentRewardRedemptionUseCase } from './rewards/application/get-student-reward-redemption.use-case';
import { GetStudentRewardUseCase } from './rewards/application/get-student-reward.use-case';
import { ListStudentRewardRedemptionsUseCase } from './rewards/application/list-student-reward-redemptions.use-case';
import { ListStudentRewardsUseCase } from './rewards/application/list-student-rewards.use-case';
import { RedeemStudentRewardUseCase } from './rewards/application/redeem-student-reward.use-case';
import { StudentRewardsController } from './rewards/controller/student-rewards.controller';
import { StudentRewardsReadAdapter } from './rewards/infrastructure/student-rewards-read.adapter';
import { GetStudentDailyScheduleUseCase } from './schedule/application/get-student-daily-schedule.use-case';
import { GetStudentWeeklyScheduleUseCase } from './schedule/application/get-student-weekly-schedule.use-case';
import { StudentScheduleController } from './schedule/controller/student-schedule.controller';
import { StudentScheduleReadAdapter } from './schedule/infrastructure/student-schedule-read.adapter';
import { CompleteStudentHeroMissionUseCase } from './hero/application/complete-student-hero-mission.use-case';
import { CompleteStudentHeroObjectiveUseCase } from './hero/application/complete-student-hero-objective.use-case';
import { GetStudentSubjectUseCase } from './subjects/application/get-student-subject.use-case';
import { ListStudentSubjectsUseCase } from './subjects/application/list-student-subjects.use-case';
import { StudentSubjectsController } from './subjects/controller/student-subjects.controller';
import { StudentSubjectsReadAdapter } from './subjects/infrastructure/student-subjects-read.adapter';
import { StartStudentHeroMissionUseCase } from './hero/application/start-student-hero-mission.use-case';
import { GetStudentTaskSubmissionUseCase } from './tasks/application/get-student-task-submission.use-case';
import { GetStudentTaskUseCase } from './tasks/application/get-student-task.use-case';
import { GetStudentTasksSummaryUseCase } from './tasks/application/get-student-tasks-summary.use-case';
import { ListStudentTaskSubmissionsUseCase } from './tasks/application/list-student-task-submissions.use-case';
import { ListStudentTasksUseCase } from './tasks/application/list-student-tasks.use-case';
import { SubmitStudentTaskStageUseCase } from './tasks/application/submit-student-task-stage.use-case';
import { StudentTasksController } from './tasks/controller/student-tasks.controller';
import { StudentTasksReadAdapter } from './tasks/infrastructure/student-tasks-read.adapter';

@Module({
  imports: [
    AppCalendarReadModelModule,
    AuthModule,
    CommunicationModule,
    DisciplineModule,
    HeroJourneyModule,
    ReviewsModule,
    RewardsModule,
    StudentHomeworksModule,
  ],
  controllers: [
    StudentHomeController,
    StudentProfileController,
    StudentSubjectsController,
    StudentGradesController,
    StudentExamsController,
    StudentBehaviorController,
    StudentDisciplineController,
    StudentProgressController,
    StudentHeroController,
    StudentScheduleController,
    StudentTasksController,
    StudentMessagesController,
    StudentNotificationsController,
    StudentAnnouncementsController,
    StudentCalendarController,
    StudentLessonsController,
    StudentRewardsController,
  ],
  providers: [
    StudentAppAccessService,
    StudentAppStudentReadAdapter,
    StudentHomeReadAdapter,
    GetStudentHomeUseCase,
    StudentProfileReadAdapter,
    GetStudentProfileUseCase,
    StudentSubjectsReadAdapter,
    ListStudentSubjectsUseCase,
    GetStudentSubjectUseCase,
    StudentGradesReadAdapter,
    ListStudentGradesUseCase,
    GetStudentGradesSummaryUseCase,
    GetStudentAssessmentGradeUseCase,
    StudentExamsReadAdapter,
    StudentExamsSubmissionWriteAdapter,
    GradesSubmissionsRepository,
    ListStudentExamsUseCase,
    GetStudentExamUseCase,
    GetStudentExamSubmissionUseCase,
    StartStudentExamSubmissionUseCase,
    BulkSaveStudentExamAnswersUseCase,
    SaveStudentExamAnswerUseCase,
    SubmitStudentExamSubmissionUseCase,
    StudentBehaviorReadAdapter,
    ListStudentBehaviorRecordsUseCase,
    GetStudentBehaviorSummaryUseCase,
    GetStudentBehaviorRecordUseCase,
    ListStudentDisciplineUseCase,
    GetStudentDisciplineSummaryUseCase,
    StudentProgressReadAdapter,
    GetStudentProgressUseCase,
    GetStudentAcademicProgressUseCase,
    GetStudentBehaviorProgressUseCase,
    GetStudentXpProgressUseCase,
    StudentRewardsReadAdapter,
    ListStudentRewardsUseCase,
    GetStudentRewardUseCase,
    ListStudentRewardRedemptionsUseCase,
    GetStudentRewardRedemptionUseCase,
    RedeemStudentRewardUseCase,
    StudentScheduleReadAdapter,
    GetStudentDailyScheduleUseCase,
    GetStudentWeeklyScheduleUseCase,
    StudentHeroReadAdapter,
    GetStudentHeroOverviewUseCase,
    GetStudentHeroProgressUseCase,
    ListStudentHeroBadgesUseCase,
    ListStudentHeroMissionsUseCase,
    GetStudentHeroMissionUseCase,
    StartStudentHeroMissionUseCase,
    CompleteStudentHeroMissionUseCase,
    CompleteStudentHeroObjectiveUseCase,
    StudentTasksReadAdapter,
    ListStudentTasksUseCase,
    GetStudentTasksSummaryUseCase,
    GetStudentTaskUseCase,
    ListStudentTaskSubmissionsUseCase,
    GetStudentTaskSubmissionUseCase,
    SubmitStudentTaskStageUseCase,
    StudentMessagesReadAdapter,
    ListStudentMessageContactsUseCase,
    CreateStudentMessageConversationUseCase,
    ListStudentMessageConversationsUseCase,
    GetStudentMessageConversationUseCase,
    ListStudentConversationMessagesUseCase,
    SearchStudentConversationMessagesUseCase,
    SendStudentConversationMessageUseCase,
    MarkStudentConversationReadUseCase,
    GetStudentMessageReadersUseCase,
    GetStudentMessageInfoUseCase,
    GetStudentMessageAttachmentDownloadUrlUseCase,
    ListStudentNotificationsUseCase,
    GetStudentNotificationUseCase,
    GetStudentNotificationsSummaryUseCase,
    MarkStudentNotificationReadUseCase,
    MarkAllStudentNotificationsReadUseCase,
    ArchiveStudentNotificationUseCase,
    GetStudentNotificationPreferencesUseCase,
    UpdateStudentNotificationPreferencesUseCase,
    StudentAnnouncementsReadAdapter,
    ListStudentAnnouncementsUseCase,
    GetStudentAnnouncementUseCase,
    MarkStudentAnnouncementReadUseCase,
    ListStudentAnnouncementAttachmentsUseCase,
    ListStudentCalendarEventsUseCase,
    GetStudentCalendarEventUseCase,
    StudentLessonsReadAdapter,
    GetStudentLessonsTodayUseCase,
    GetStudentLessonsWeekUseCase,
    GetStudentLessonDetailUseCase,
  ],
  exports: [StudentAppAccessService],
})
export class StudentAppModule {}
