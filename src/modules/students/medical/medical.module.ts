import { Module } from '@nestjs/common';
import { StudentsRecordsModule } from '../students/students.module';
import { GetStudentMedicalProfileUseCase } from './application/get-student-medical-profile.use-case';
import { UpsertStudentMedicalProfileUseCase } from './application/upsert-student-medical-profile.use-case';
import { StudentMedicalController } from './controller/student-medical.controller';
import { StudentMedicalRepository } from './infrastructure/student-medical.repository';

@Module({
  imports: [StudentsRecordsModule],
  controllers: [StudentMedicalController],
  providers: [
    StudentMedicalRepository,
    GetStudentMedicalProfileUseCase,
    UpsertStudentMedicalProfileUseCase,
  ],
})
export class MedicalModule {}
