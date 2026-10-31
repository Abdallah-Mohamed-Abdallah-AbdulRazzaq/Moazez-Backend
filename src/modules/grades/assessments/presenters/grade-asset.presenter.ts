import type {
  GradeAssetActor,
  GradeAssetResource,
} from '../domain/grade-asset';
import {
  assetCategoryForMime,
  assetDisplayText,
} from '../../../files/assessment-media/domain/assessment-asset-content';
import type { GradeAssetDto } from '../dto/grade-asset.dto';
import type { GradeAssetView } from '../infrastructure/grade-assets.repository';
import { sanitizeOriginalName } from '../../../files/uploads/domain/original-name';
import { resolveFileContentType } from '../../../files/shared/domain/file-content.registry';

function safeText(value: string | null, maximum: number): string | null {
  try {
    return assetDisplayText(value, maximum);
  } catch {
    return null;
  }
}
export function gradeAssetPath(
  actor: GradeAssetActor,
  input: GradeAssetResource & { assetId: string },
): string {
  const suffix = `${input.assessmentId}${input.questionId ? `/questions/${input.questionId}` : ''}/assets/${input.assetId}`;
  if (actor.surface === 'released-review')
    return actor.audience === 'PARENT'
      ? `/api/v1/parent/children/${actor.studentId}/grades/assessments/${input.assessmentId}/review${input.questionId ? `/questions/${input.questionId}` : ''}/assets/${input.assetId}`
      : `/api/v1/student/grades/assessments/${input.assessmentId}/review${input.questionId ? `/questions/${input.questionId}` : ''}/assets/${input.assetId}`;
  if (actor.surface === 'core') return `/api/v1/grades/assessments/${suffix}`;
  if (actor.surface === 'teacher')
    return `/api/v1/teacher/classroom/${actor.classId}/grades/assessments/${input.assessmentId}${actor.authoring ? '/authoring' : ''}${input.questionId ? `/questions/${input.questionId}` : ''}/assets/${input.assetId}`;
  if (actor.surface === 'student-exams')
    return `/api/v1/student/exams/${suffix}`;
  return `/api/v1/student/grades/assessments/${suffix}`;
}
export function presentGradeAsset(
  view: GradeAssetView,
  actor: GradeAssetActor,
  assessmentId: string,
): GradeAssetDto {
  const { asset, file } = view;
  const path = gradeAssetPath(actor, {
    assessmentId,
    ...('questionId' in asset ? { questionId: asset.questionId } : {}),
    assetId: asset.id,
  });
  const type = file && resolveFileContentType(file.originalName, file.mimeType);
  return {
    assetId: asset.id,
    assessmentId,
    ...('questionId' in asset ? { questionId: asset.questionId } : {}),
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
