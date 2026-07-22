import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  LessonContentUnitOfWork,
  type LessonContentTransactionContext,
} from '../application/lesson-content.unit-of-work';
import { LessonContentRepository } from './lesson-content.repository';

@Injectable()
export class PrismaLessonContentUnitOfWork extends LessonContentUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LessonContentRepository,
  ) {
    super();
  }

  execute<T>(
    schoolId: string,
    callback: (context: LessonContentTransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (transaction) =>
        callback(
          this.repository.createTransactionContext(transaction, schoolId),
        ),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }
}
