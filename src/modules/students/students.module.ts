import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { GuardiansModule } from './guardians/guardians.module';
import { MedicalModule } from './medical/medical.module';
import { NotesModule } from './notes/notes.module';
import { RegistrationModule } from './registration/registration.module';
import { StudentsRecordsModule } from './students/students.module';
import { TransfersWithdrawalsModule } from './transfers-withdrawals/transfers-withdrawals.module';

@Module({
  imports: [
    GuardiansModule,
    StudentsRecordsModule,
    EnrollmentsModule,
    DocumentsModule,
    MedicalModule,
    NotesModule,
    RegistrationModule,
    TransfersWithdrawalsModule,
  ],
})
export class StudentsModule {}
