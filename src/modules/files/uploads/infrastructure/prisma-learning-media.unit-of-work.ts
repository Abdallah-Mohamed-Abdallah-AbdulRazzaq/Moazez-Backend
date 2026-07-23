import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  LearningMediaUnitOfWork,
  type LearningMediaTransactionContext,
} from '../application/learning-media.unit-of-work';
import { LearningMediaRepository } from './learning-media.repository';

@Injectable()
export class PrismaLearningMediaUnitOfWork extends LearningMediaUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LearningMediaRepository,
  ) {
    super();
  }

  execute<T>(
    callback: (context: LearningMediaTransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx) => callback(this.repository.createTransactionContext(tx)),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  }
}
