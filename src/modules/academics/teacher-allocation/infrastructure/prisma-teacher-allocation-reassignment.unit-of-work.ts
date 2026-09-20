import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  TeacherAllocationReassignmentUnitOfWork,
  type TeacherAllocationReassignmentTransactionContext,
} from '../application/teacher-allocation-reassignment.unit-of-work';
import { TeacherAllocationReassignmentSnapshotOperations } from './teacher-allocation-reassignment-read.repository';
import { PrismaTeacherAllocationReassignmentTransactionOperations } from './prisma-teacher-allocation-reassignment-transaction.operations';

@Injectable()
export class PrismaTeacherAllocationReassignmentUnitOfWork extends TeacherAllocationReassignmentUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshotOperations: TeacherAllocationReassignmentSnapshotOperations,
    private readonly operations: PrismaTeacherAllocationReassignmentTransactionOperations,
  ) {
    super();
  }

  execute<T>(
    callback: (
      context: TeacherAllocationReassignmentTransactionContext,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (transaction) => callback(this.createContext(transaction)),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }

  private createContext(
    transaction: Prisma.TransactionClient,
  ): TeacherAllocationReassignmentTransactionContext {
    const context: TeacherAllocationReassignmentTransactionContext = {
      allocation: {
        lock: (input) => this.operations.lockAllocation(transaction, input),
        handoff: (input) =>
          this.operations.handoffAllocation(transaction, input),
      },
      snapshot: {
        load: (input) => this.snapshotOperations.load(transaction, input),
      },
      timetable: {
        handoff: (input) =>
          this.operations.handoffTimetable(transaction, input),
      },
      lessonPlans: {
        handoff: (input) =>
          this.operations.handoffLessonPlans(transaction, input),
      },
      homework: {
        handoff: (input) => this.operations.handoffHomework(transaction, input),
      },
      audit: {
        writeSuccessful: (entry) =>
          this.operations.writeSuccessfulAudit(transaction, entry),
      },
    };

    Object.freeze(context.allocation);
    Object.freeze(context.snapshot);
    Object.freeze(context.timetable);
    Object.freeze(context.lessonPlans);
    Object.freeze(context.homework);
    Object.freeze(context.audit);
    return Object.freeze(context);
  }
}
