import { Module } from '@nestjs/common';
import { StudentAppAccessService } from './access/student-app-access.service';
import { StudentAppStudentReadAdapter } from './access/student-app-student-read.adapter';
import { GetStudentBehaviorRecordUseCase } from './behavior/application/get-student-behavior-record.use-case';
import { GetStudentBehaviorSummaryUseCase } from './behavior/application/get-student-behavior-summary.use-case';
import { ListStudentBehaviorRecordsUseCase } from './behavior/application/list-student-behavior-records.use-case';
import { StudentBehaviorController } from './behavior/controller/student-behavior.controller';
import { StudentBehaviorReadAdapter } from './behavior/infrastructure/student-behavior-read.adapter';
import { GetStudentExamSubmissionUseCase } from './exams/application/get-student-exam-submission.use-case';
import { GetStudentExamUseCase } from './exams/application/get-student-exam.use-case';
import { ListStudentExamsUseCase } from './exams/application/list-student-exams.use-case';
import { StudentExamsController } from './exams/controller/student-exams.controller';
import { StudentExamsReadAdapter } from './exams/infrastructure/student-exams-read.adapter';
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
import { GetStudentHomeUseCase } from './home/application/get-student-home.use-case';
import { StudentHomeController } from './home/controller/student-home.controller';
import { StudentHomeReadAdapter } from './home/infrastructure/student-home-read.adapter';
import { GetStudentProfileUseCase } from './profile/application/get-student-profile.use-case';
import { StudentProfileController } from './profile/controller/student-profile.controller';
import { StudentProfileReadAdapter } from './profile/infrastructure/student-profile-read.adapter';
import { GetStudentAcademicProgressUseCase } from './progress/application/get-student-academic-progress.use-case';
import { GetStudentBehaviorProgressUseCase } from './progress/application/get-student-behavior-progress.use-case';
import { GetStudentProgressUseCase } from './progress/application/get-student-progress.use-case';
import { GetStudentXpProgressUseCase } from './progress/application/get-student-xp-progress.use-case';
import { StudentProgressController } from './progress/controller/student-progress.controller';
import { StudentProgressReadAdapter } from './progress/infrastructure/student-progress-read.adapter';
import { GetStudentSubjectUseCase } from './subjects/application/get-student-subject.use-case';
import { ListStudentSubjectsUseCase } from './subjects/application/list-student-subjects.use-case';
import { StudentSubjectsController } from './subjects/controller/student-subjects.controller';
import { StudentSubjectsReadAdapter } from './subjects/infrastructure/student-subjects-read.adapter';

@Module({
  controllers: [
    StudentHomeController,
    StudentProfileController,
    StudentSubjectsController,
    StudentGradesController,
    StudentExamsController,
    StudentBehaviorController,
    StudentProgressController,
    StudentHeroController,
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
    ListStudentExamsUseCase,
    GetStudentExamUseCase,
    GetStudentExamSubmissionUseCase,
    StudentBehaviorReadAdapter,
    ListStudentBehaviorRecordsUseCase,
    GetStudentBehaviorSummaryUseCase,
    GetStudentBehaviorRecordUseCase,
    StudentProgressReadAdapter,
    GetStudentProgressUseCase,
    GetStudentAcademicProgressUseCase,
    GetStudentBehaviorProgressUseCase,
    GetStudentXpProgressUseCase,
    StudentHeroReadAdapter,
    GetStudentHeroOverviewUseCase,
    GetStudentHeroProgressUseCase,
    ListStudentHeroBadgesUseCase,
    ListStudentHeroMissionsUseCase,
    GetStudentHeroMissionUseCase,
  ],
  exports: [StudentAppAccessService],
})
export class StudentAppModule {}
