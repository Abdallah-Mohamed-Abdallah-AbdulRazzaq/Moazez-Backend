import { Logger, Module } from '@nestjs/common';
import {
  TeacherRejectedTransitionAuditService,
  TEACHER_LIFECYCLE_OPERATIONAL_LOGGER,
} from './application/teacher-rejected-transition-audit.service';
import { TeacherLifecycleUnitOfWork } from './application/teacher-lifecycle-unit-of-work';
import { PrismaTeacherLifecycleTransactionOperations } from './infrastructure/prisma-teacher-lifecycle-transaction.operations';
import { PrismaTeacherLifecycleUnitOfWork } from './infrastructure/prisma-teacher-lifecycle.unit-of-work';
import { TeacherLifecycleAuditWriter } from './infrastructure/teacher-lifecycle-audit.writer';

@Module({
  providers: [
    TeacherLifecycleAuditWriter,
    PrismaTeacherLifecycleTransactionOperations,
    PrismaTeacherLifecycleUnitOfWork,
    {
      provide: TeacherLifecycleUnitOfWork,
      useExisting: PrismaTeacherLifecycleUnitOfWork,
    },
    {
      provide: TEACHER_LIFECYCLE_OPERATIONAL_LOGGER,
      useFactory: () => {
        const logger = new Logger(TeacherRejectedTransitionAuditService.name);
        return {
          error: (event: { event: string; traceId: string }) =>
            logger.error(event),
        };
      },
    },
    TeacherRejectedTransitionAuditService,
  ],
  exports: [TeacherLifecycleUnitOfWork, TeacherRejectedTransitionAuditService],
})
export class TeacherLifecycleModule {}
