import { Module } from '@nestjs/common';
import { AnswerMediaRegistry } from './infrastructure/answer-media-registry';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { UploadsModule } from '../uploads/uploads.module';
import { AssessmentMediaService } from './application/assessment-media.service';
import { AssessmentMediaRuntimePolicy } from './application/assessment-media-runtime.policy';
import {
  AssessmentMediaVerifier,
  AssessmentMediaSecurityGate,
  UnapprovedAssessmentMediaSecurityGate,
} from './application/assessment-media-verifier';
import { AssessmentMediaRepository } from './infrastructure/assessment-media.repository';

@Module({
  imports: [StorageModule, UploadsModule],
  providers: [
    AnswerMediaRegistry,
    AssessmentMediaService,
    AssessmentMediaRuntimePolicy,
    AssessmentMediaVerifier,
    AssessmentMediaRepository,
    {
      provide: TeacherAllocationOperationalWriteGate,
      useClass: PrismaTeacherAllocationOperationalWriteGate,
    },
    {
      provide: AssessmentMediaSecurityGate,
      useClass: UnapprovedAssessmentMediaSecurityGate,
    },
  ],
  exports: [
    AnswerMediaRegistry,
    AssessmentMediaService,
    AssessmentMediaRepository,
    AssessmentMediaRuntimePolicy,
  ],
})
export class AssessmentMediaModule {}
