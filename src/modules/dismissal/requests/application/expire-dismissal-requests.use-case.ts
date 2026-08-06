import { Injectable, Logger } from '@nestjs/common';
import { DismissalRealtimeEventsService } from '../../realtime/dismissal-realtime-events.service';
import {
  DEFAULT_DISMISSAL_EXPIRY_THRESHOLD_MINUTES,
  DismissalRequestExpiryCandidate,
  DismissalRequestsExpiryRepository,
  MAX_DISMISSAL_EXPIRY_BATCH_SIZE,
} from '../infrastructure/dismissal-requests-expiry.repository';

export interface ExpireDismissalRequestsOptions {
  now?: Date;
  batchSize?: number;
  dryRun?: boolean;
}

export interface ExpireDismissalRequestsResult {
  scannedCount: number;
  expiredCount: number;
  skippedCount: number;
  schoolCount: number;
  requestIds: string[];
}

const DEFAULT_DISMISSAL_EXPIRY_BATCH_SIZE = 100;

@Injectable()
export class ExpireDismissalRequestsUseCase {
  private readonly logger = new Logger(ExpireDismissalRequestsUseCase.name);

  constructor(
    private readonly expiryRepository: DismissalRequestsExpiryRepository,
    private readonly dismissalRealtimeEvents: DismissalRealtimeEventsService,
  ) {}

  async runOnce(
    options: ExpireDismissalRequestsOptions = {},
  ): Promise<ExpireDismissalRequestsResult> {
    const now = options.now ?? new Date();
    const batchSize = normalizeBatchSize(options.batchSize);
    const dryRun = options.dryRun === true;

    const candidates = await this.expiryRepository.listExpiredCandidates({
      now,
      batchSize,
    });
    const schoolCount = countDistinctSchools(candidates);

    if (dryRun) {
      this.logger.log(
        `Dismissal expiry dry run scanned ${candidates.length} stale request candidates with default threshold ${DEFAULT_DISMISSAL_EXPIRY_THRESHOLD_MINUTES} minutes.`,
      );
      return {
        scannedCount: candidates.length,
        expiredCount: 0,
        skippedCount: candidates.length,
        schoolCount,
        requestIds: [],
      };
    }

    const expiredRequestIds: string[] = [];
    let mutationFailureCount = 0;

    for (const candidate of candidates) {
      let expired: Awaited<
        ReturnType<DismissalRequestsExpiryRepository['expireCandidate']>
      >;
      try {
        expired = await this.expiryRepository.expireCandidate(candidate, now);
      } catch {
        mutationFailureCount += 1;
        this.logger.warn('dismissal_expiry_candidate_mutation_failed');
        continue;
      }
      if (!expired) continue;

      expiredRequestIds.push(expired.requestId);
      try {
        await this.dismissalRealtimeEvents.publishStatusChanged({
          schoolId: expired.schoolId,
          requestId: expired.requestId,
          previousStatus: expired.previousStatus,
        });
      } catch {
        this.logger.warn('dismissal_expiry_realtime_publication_failed');
      }
    }

    const result = {
      scannedCount: candidates.length,
      expiredCount: expiredRequestIds.length,
      skippedCount: candidates.length - expiredRequestIds.length,
      schoolCount,
      requestIds: expiredRequestIds,
    };

    this.logger.log(
      `Dismissal expiry scanned ${result.scannedCount}, expired ${result.expiredCount}, skipped ${result.skippedCount}.`,
    );

    if (mutationFailureCount > 0) {
      throw new Error('dismissal_expiry_batch_mutation_failed');
    }

    return result;
  }
}

function normalizeBatchSize(value: number | undefined): number {
  if (value === undefined || value === null) {
    return DEFAULT_DISMISSAL_EXPIRY_BATCH_SIZE;
  }

  if (!Number.isFinite(value)) return DEFAULT_DISMISSAL_EXPIRY_BATCH_SIZE;
  const integer = Math.floor(value);
  if (integer < 1) return DEFAULT_DISMISSAL_EXPIRY_BATCH_SIZE;
  return Math.min(integer, MAX_DISMISSAL_EXPIRY_BATCH_SIZE);
}

function countDistinctSchools(
  candidates: DismissalRequestExpiryCandidate[],
): number {
  return new Set(candidates.map((candidate) => candidate.schoolId)).size;
}
