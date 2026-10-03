import { Injectable, Logger } from '@nestjs/common';
import {
  AcademicContentPublicationRuntimeRepository,
  PublicationRuntimeCursor,
} from '../infrastructure/academic-content-publication-runtime.repository';
import { AcademicContentPublicationQueueService } from './academic-content-publication-queue.service';
import { ACADEMIC_CONTENT_PUBLICATION_RECOVERY_PAGE_SIZE } from '../domain/academic-content-publication-runtime.constants';

@Injectable()
export class AcademicContentPublicationReconciliationService {
  private readonly logger = new Logger(
    AcademicContentPublicationReconciliationService.name,
  );
  constructor(
    private readonly publications: AcademicContentPublicationRuntimeRepository,
    private readonly queue: AcademicContentPublicationQueueService,
  ) {}

  async reconcile(now = new Date()) {
    const summary = {
      scanned: 0,
      created: 0,
      replaced: 0,
      preserved: 0,
      replacementContended: 0,
      notRequired: 0,
    };
    for (const job of ['publish', 'expire'] as const) {
      let cursor: PublicationRuntimeCursor | undefined;
      for (;;) {
        const rows =
          job === 'publish'
            ? await this.publications.listDuePublish(now, cursor)
            : await this.publications.listDueExpiry(now, cursor);
        for (const row of rows) {
          summary.scanned++;
          const outcome = await this.queue.ensure(
            job,
            {
              schoolId: row.schoolId,
              contentId: row.academicContentId,
              publicationId: row.id,
            },
            now,
          );
          if (outcome === 'replacement_contended')
            summary.replacementContended++;
          else if (outcome === 'not_required') summary.notRequired++;
          else summary[outcome]++;
        }
        if (rows.length < ACADEMIC_CONTENT_PUBLICATION_RECOVERY_PAGE_SIZE)
          break;
        const last = rows[rows.length - 1];
        cursor = {
          at: job === 'publish' ? last.publishAt : last.visibleUntil!,
          id: last.id,
        };
      }
    }
    this.logger.log({
      event: 'academic_content.publication.reconciled',
      ...summary,
    });
    return summary;
  }
}
