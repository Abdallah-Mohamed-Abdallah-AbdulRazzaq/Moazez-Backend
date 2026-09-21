import { Module } from '@nestjs/common';
import { ApplyTeacherAllocationToGradeUseCase } from './application/apply-teacher-allocation-to-grade.use-case';
import { BulkSaveTeacherAllocationsUseCase } from './application/bulk-save-teacher-allocations.use-case';
import { ClearTeacherAllocationsBySubjectUseCase } from './application/clear-teacher-allocations-by-subject.use-case';
import { CreateTeacherAllocationUseCase } from './application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from './application/delete-teacher-allocation.use-case';
import { GetTeacherLoadsUseCase } from './application/get-teacher-loads.use-case';
import { ListTeacherAllocationsUseCase } from './application/list-teacher-allocations.use-case';
import { PreviewTeacherAllocationReassignmentUseCase } from './application/preview-teacher-allocation-reassignment.use-case';
import { ReassignTeacherAllocationUseCase } from './application/reassign-teacher-allocation.use-case';
import { TeacherAllocationReassignmentUnitOfWork } from './application/teacher-allocation-reassignment.unit-of-work';
import { TeacherAllocationReassignmentImpactService } from './application/teacher-allocation-reassignment-impact.service';
import { TeacherAllocationOperationalWriteGate } from './application/teacher-allocation-operational-write-gate';
import {
  TEACHER_ALLOCATION_LIFECYCLE_READER,
  TeacherAllocationLifecycleReadService,
} from './application/teacher-allocation-lifecycle-read.service';
import { ValidateTeacherAllocationsUseCase } from './application/validate-teacher-allocations.use-case';
import { TeacherAllocationController } from './controller/teacher-allocation.controller';
import { TeacherAllocationRepository } from './infrastructure/teacher-allocation.repository';
import { TeacherAllocationReassignmentReadRepository } from './infrastructure/teacher-allocation-reassignment-read.repository';
import { TeacherAllocationReassignmentSnapshotOperations } from './infrastructure/teacher-allocation-reassignment-read.repository';
import { PrismaTeacherAllocationReassignmentTransactionOperations } from './infrastructure/prisma-teacher-allocation-reassignment-transaction.operations';
import { PrismaTeacherAllocationReassignmentUnitOfWork } from './infrastructure/prisma-teacher-allocation-reassignment.unit-of-work';
import { PrismaTeacherAllocationOperationalWriteGate } from './infrastructure/prisma-teacher-allocation-operational-write-gate';

@Module({
  controllers: [TeacherAllocationController],
  providers: [
    TeacherAllocationRepository,
    TeacherAllocationReassignmentSnapshotOperations,
    TeacherAllocationReassignmentReadRepository,
    PrismaTeacherAllocationReassignmentTransactionOperations,
    PrismaTeacherAllocationReassignmentUnitOfWork,
    PrismaTeacherAllocationOperationalWriteGate,
    {
      provide: TeacherAllocationOperationalWriteGate,
      useExisting: PrismaTeacherAllocationOperationalWriteGate,
    },
    {
      provide: TeacherAllocationReassignmentUnitOfWork,
      useExisting: PrismaTeacherAllocationReassignmentUnitOfWork,
    },
    ListTeacherAllocationsUseCase,
    CreateTeacherAllocationUseCase,
    DeleteTeacherAllocationUseCase,
    BulkSaveTeacherAllocationsUseCase,
    ApplyTeacherAllocationToGradeUseCase,
    ClearTeacherAllocationsBySubjectUseCase,
    ValidateTeacherAllocationsUseCase,
    GetTeacherLoadsUseCase,
    PreviewTeacherAllocationReassignmentUseCase,
    ReassignTeacherAllocationUseCase,
    TeacherAllocationReassignmentImpactService,
    TeacherAllocationLifecycleReadService,
    {
      provide: TEACHER_ALLOCATION_LIFECYCLE_READER,
      useExisting: TeacherAllocationLifecycleReadService,
    },
  ],
  exports: [
    TEACHER_ALLOCATION_LIFECYCLE_READER,
    TeacherAllocationOperationalWriteGate,
  ],
})
export class TeacherAllocationModule {}
