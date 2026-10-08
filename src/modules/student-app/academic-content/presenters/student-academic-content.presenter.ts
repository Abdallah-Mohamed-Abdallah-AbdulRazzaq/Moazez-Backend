import { InternalServerErrorException } from '@nestjs/common';
import {
  AcademicContentType,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
  Prisma,
} from '@prisma/client';
import {
  AcademicContentRecipientCard,
  AcademicContentRecipientDetail,
} from '../../../academics/academic-content/domain/academic-content-recipient.query';
import { decodeAcademicContentRevisionSnapshotV2 } from '../../../academics/academic-content/domain/academic-content-revision-snapshot';
import {
  StudentAcademicContentCardDto,
  StudentAcademicContentDetailResponseDto,
  StudentAcademicContentListResponseDto,
  StudentAcademicContentSummary,
} from '../dto/student-academic-content-response.dto';

const invalid = (): never => {
  throw new InternalServerErrorException('Academic content summary is invalid');
};
const summaryString = (
  summary: Prisma.JsonValue | null,
  key: string,
): string => {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary))
    return invalid();
  const value = summary[key];
  return typeof value === 'string' ? value : invalid();
};

function presentSummary(
  row: AcademicContentRecipientCard,
): StudentAcademicContentSummary | null {
  switch (row.type) {
    case AcademicContentType.WEEKLY_PLAN:
      return {
        weekStartDate: summaryString(row.summary, 'weekStartDate'),
        weekEndDate: summaryString(row.summary, 'weekEndDate'),
      };
    case AcademicContentType.SUBJECT_RESOURCE: {
      const resourceCategory = summaryString(
        row.summary,
        'resourceCategory',
      ) as AcademicSubjectResourceCategory;
      if (
        !Object.values(AcademicSubjectResourceCategory).includes(
          resourceCategory,
        )
      )
        return invalid();
      return { resourceCategory };
    }
    case AcademicContentType.ONLINE_SESSION: {
      const platform = summaryString(
        row.summary,
        'platform',
      ) as AcademicOnlineSessionPlatform;
      if (!Object.values(AcademicOnlineSessionPlatform).includes(platform))
        return invalid();
      return {
        platform,
        startAt: summaryString(row.summary, 'startAt'),
        endAt: summaryString(row.summary, 'endAt'),
      };
    }
    case AcademicContentType.GENERAL_RESOURCE:
      return null;
  }
}

export class StudentAcademicContentPresenter {
  static presentCard(
    row: AcademicContentRecipientCard,
  ): StudentAcademicContentCardDto {
    return {
      contentId: row.contentId,
      publicationId: row.publicationId,
      revisionId: row.revisionId,
      type: row.type,
      audience: row.audience,
      title: row.title,
      description: row.description,
      publishedAt: row.publishedAt.toISOString(),
      visibleFrom: row.visibleFrom.toISOString(),
      visibleUntil: row.visibleUntil?.toISOString() ?? null,
      summary: presentSummary(row),
    };
  }

  static presentList(result: {
    items: AcademicContentRecipientCard[];
    pagination: { page: number; limit: number; total: number };
  }): StudentAcademicContentListResponseDto {
    return {
      items: result.items.map((row) => this.presentCard(row)),
      pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
      },
    };
  }

  static presentDetail(
    row: AcademicContentRecipientDetail,
  ): StudentAcademicContentDetailResponseDto {
    const snapshot =
      row.type === AcademicContentType.GENERAL_RESOURCE
        ? null
        : decodeAcademicContentRevisionSnapshotV2(
            row.typeSpecificSnapshot,
            row.type,
          );
    if (
      snapshot?.type === AcademicContentType.TEACHER_PREPARATION ||
      snapshot?.type === AcademicContentType.GUARDIAN_WEEKLY_NOTE
    )
      return invalid();
    return {
      content: {
        ...this.presentCard(row),
        assets: row.assets.map((asset) => ({
          fileId: asset.fileId,
          originalName: asset.originalName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          sortOrder: asset.sortOrder,
        })),
        links: row.links.map((link) => ({
          revisionLinkId: link.revisionLinkId,
          label: link.label,
          url: link.url,
          sortOrder: link.sortOrder,
        })),
        tags: row.tags.map((tag) => ({
          value: tag.displayValue,
          sortOrder: tag.sortOrder,
        })),
        details: snapshot?.state ?? null,
      },
    };
  }
}
