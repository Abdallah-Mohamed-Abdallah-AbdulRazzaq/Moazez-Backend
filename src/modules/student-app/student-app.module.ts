import { Module } from '@nestjs/common';
import { StudentAppAccessService } from './access/student-app-access.service';
import { StudentAppStudentReadAdapter } from './access/student-app-student-read.adapter';
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
import { GetStudentHomeUseCase } from './home/application/get-student-home.use-case';
import { StudentHomeController } from './home/controller/student-home.controller';
import { StudentHomeReadAdapter } from './home/infrastructure/student-home-read.adapter';
import { GetStudentProfileUseCase } from './profile/application/get-student-profile.use-case';
import { StudentProfileController } from './profile/controller/student-profile.controller';
import { StudentProfileReadAdapter } from './profile/infrastructure/student-profile-read.adapter';
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
  ],
  exports: [StudentAppAccessService],
})
export class StudentAppModule {}
