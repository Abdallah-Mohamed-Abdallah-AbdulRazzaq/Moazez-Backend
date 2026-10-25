import type {
  HomeworkAssetActor,
  HomeworkAssetResource,
} from '../domain/homework-question-asset';
import {
  assetCategoryForMime,
  assetDisplayText,
} from '../domain/homework-question-asset';
import type { HomeworkQuestionAssetDto } from '../dto/homework-question-asset.dto';
import type { HomeworkQuestionAssetView } from '../infrastructure/homework-question-assets.repository';
import { sanitizeOriginalName } from '../../files/uploads/domain/original-name';
import { resolveFileContentType } from '../../files/shared/domain/file-content.registry';

function safeText(value: string | null, maximum: number): string | null {
  try {
    return assetDisplayText(value, maximum);
  } catch {
    return null;
  }
}
export function homeworkQuestionAssetPath(
  actor: HomeworkAssetActor,
  input: HomeworkAssetResource & { assetId: string },
): string {
  const question = `assignments/${input.homeworkId}/questions/${input.questionId}/assets/${input.assetId}`;
  if (actor.surface === 'core') return `/api/v1/homework/${question}`;
  if (actor.surface === 'teacher')
    return `/api/v1/teacher/homeworks/classes/${actor.classId}/${question}`;
  return `/api/v1/student/homeworks/${input.homeworkId}/questions/${input.questionId}/assets/${input.assetId}`;
}
export function presentHomeworkQuestionAsset(
  view: HomeworkQuestionAssetView,
  actor: HomeworkAssetActor,
  homeworkId: string,
): HomeworkQuestionAssetDto {
  const { asset, file } = view;
  const path = homeworkQuestionAssetPath(actor, {
    homeworkId,
    questionId: asset.homeworkQuestionId,
    assetId: asset.id,
  });
  const type = file && resolveFileContentType(file.originalName, file.mimeType);
  return {
    assetId: asset.id,
    questionId: asset.homeworkQuestionId,
    sourceType: asset.sourceType,
    category: type ? assetCategoryForMime(type.category) : asset.category,
    title: safeText(asset.title, 255),
    description: safeText(asset.description, 2000),
    sortOrder: asset.sortOrder,
    file: file
      ? {
          filename: sanitizeOriginalName(file.originalName),
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes.toString(),
        }
      : null,
    externalUrl: view.externalUrl,
    access:
      asset.sourceType === 'MANAGED_FILE'
        ? {
            previewPath:
              view.previewAllowed && type?.inlinePreviewSupported
                ? `${path}/preview`
                : null,
            downloadPath: view.downloadAllowed ? `${path}/download` : null,
          }
        : null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}
