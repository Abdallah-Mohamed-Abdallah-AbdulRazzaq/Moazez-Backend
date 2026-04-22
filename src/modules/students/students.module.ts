import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { GuardiansModule } from './guardians/guardians.module';
import { MedicalModule } from './medical/medical.module';
import { NotesModule } from './notes/notes.module';
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
    TransfersWithdrawalsModule,
  ],
})
export class StudentsModule {}
