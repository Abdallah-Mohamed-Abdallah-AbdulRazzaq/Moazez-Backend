import { Prisma } from '@prisma/client';
import type { LessonContentItemRecord } from '../infrastructure/lesson-content.repository';
import type {
  LessonContentItemResponseDto,
  LessonContentListResponseDto,
} from '../dto/lesson-content-response.dto';

function metadataOrNull(value: Prisma.JsonValue): unknown {
  return value === null ? null : value;
}

export function presentLessonContentItem(
  item: LessonContentItemRecord,
): LessonContentItemResponseDto {
  return {
    id: item.id,
    contentItemId: item.id,
    curriculumId: item.curriculumId,
    unitId: item.unitId,
    lessonId: item.lessonId,
    type: item.type.toLowerCase(),
    title: item.title,
    bodyText: item.bodyText ?? null,
    url: item.url ?? null,
    file: item.file
      ? {
          fileId: item.file.id,
          filename: item.file.originalName,
          mimeType: item.file.mimeType,
          sizeBytes: item.file.sizeBytes.toString(),
        }
      : null,
    sortOrder: item.sortOrder,
    isRequired: item.isRequired,
    estimatedMinutes: item.estimatedMinutes ?? null,
    metadata: metadataOrNull(item.metadata),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function presentLessonContentItems(
  items: LessonContentItemRecord[],
): LessonContentListResponseDto {
  return {
    items: items.map((item) => presentLessonContentItem(item)),
  };
}
