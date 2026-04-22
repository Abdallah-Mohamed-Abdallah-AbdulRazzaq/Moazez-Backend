import { Module } from '@nestjs/common';
import { ApplicationsModule } from './applications/applications.module';
import { DecisionsModule } from './decisions/decisions.module';
import { DocumentsModule } from './documents/documents.module';
import { InterviewsModule } from './interviews/interviews.module';
import { LeadsModule } from './leads/leads.module';
import { AdmissionsTestsModule } from './tests/tests.module';

@Module({
  imports: [
    LeadsModule,
    ApplicationsModule,
    DocumentsModule,
    AdmissionsTestsModule,
    InterviewsModule,
    DecisionsModule,
  ],
})
export class AdmissionsModule {}
