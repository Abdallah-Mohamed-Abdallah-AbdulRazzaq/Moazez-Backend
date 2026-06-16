import { Module } from '@nestjs/common';
import { BulkSaveSubjectAllocationsUseCase } from './application/bulk-save-subject-allocations.use-case';
import { ListSubjectAllocationsUseCase } from './application/list-subject-allocations.use-case';
import { SubjectAllocationController } from './controller/subject-allocation.controller';
import { SubjectAllocationRepository } from './infrastructure/subject-allocation.repository';

@Module({
  controllers: [SubjectAllocationController],
  providers: [
    SubjectAllocationRepository,
    ListSubjectAllocationsUseCase,
    BulkSaveSubjectAllocationsUseCase,
  ],
})
export class SubjectAllocationModule {}
