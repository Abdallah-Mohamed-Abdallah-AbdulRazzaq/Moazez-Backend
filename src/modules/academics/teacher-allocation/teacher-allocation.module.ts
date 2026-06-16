import { Module } from '@nestjs/common';
import { ApplyTeacherAllocationToGradeUseCase } from './application/apply-teacher-allocation-to-grade.use-case';
import { BulkSaveTeacherAllocationsUseCase } from './application/bulk-save-teacher-allocations.use-case';
import { ClearTeacherAllocationsBySubjectUseCase } from './application/clear-teacher-allocations-by-subject.use-case';
import { CreateTeacherAllocationUseCase } from './application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from './application/delete-teacher-allocation.use-case';
import { GetTeacherLoadsUseCase } from './application/get-teacher-loads.use-case';
import { ListTeacherAllocationsUseCase } from './application/list-teacher-allocations.use-case';
import { ValidateTeacherAllocationsUseCase } from './application/validate-teacher-allocations.use-case';
import { TeacherAllocationController } from './controller/teacher-allocation.controller';
import { TeacherAllocationRepository } from './infrastructure/teacher-allocation.repository';

@Module({
  controllers: [TeacherAllocationController],
  providers: [
    TeacherAllocationRepository,
    ListTeacherAllocationsUseCase,
    CreateTeacherAllocationUseCase,
    DeleteTeacherAllocationUseCase,
    BulkSaveTeacherAllocationsUseCase,
    ApplyTeacherAllocationToGradeUseCase,
    ClearTeacherAllocationsBySubjectUseCase,
    ValidateTeacherAllocationsUseCase,
    GetTeacherLoadsUseCase,
  ],
})
export class TeacherAllocationModule {}
