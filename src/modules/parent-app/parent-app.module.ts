import { Module } from '@nestjs/common';
import { ParentAppAccessService } from './access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from './access/parent-app-guardian-read.adapter';
import { GetParentChildBehaviorRecordUseCase } from './behavior/application/get-parent-child-behavior-record.use-case';
import { GetParentChildBehaviorSummaryUseCase } from './behavior/application/get-parent-child-behavior-summary.use-case';
import { ListParentChildBehaviorUseCase } from './behavior/application/list-parent-child-behavior.use-case';
import { ParentBehaviorController } from './behavior/controller/parent-behavior.controller';
import { ParentBehaviorReadAdapter } from './behavior/infrastructure/parent-behavior-read.adapter';
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

@Module({
  controllers: [
    ParentHomeController,
    ParentChildrenController,
    ParentProfileController,
    ParentGradesController,
    ParentBehaviorController,
    ParentProgressController,
    ParentReportsController,
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
  ],
  exports: [ParentAppAccessService],
})
export class ParentAppModule {}
