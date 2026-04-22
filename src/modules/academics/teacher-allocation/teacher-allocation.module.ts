import { Module } from '@nestjs/common';
import { CreateTeacherAllocationUseCase } from './application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from './application/delete-teacher-allocation.use-case';
import { ListTeacherAllocationsUseCase } from './application/list-teacher-allocations.use-case';
import { TeacherAllocationController } from './controller/teacher-allocation.controller';
import { TeacherAllocationRepository } from './infrastructure/teacher-allocation.repository';

@Module({
  controllers: [TeacherAllocationController],
  providers: [
    TeacherAllocationRepository,
    ListTeacherAllocationsUseCase,
    CreateTeacherAllocationUseCase,
    DeleteTeacherAllocationUseCase,
  ],
})
export class TeacherAllocationModule {}
