import {
  AcademicContentRecord,
  AcademicContentManagementDetail,
} from '../infrastructure/academic-content.repository';
import {
  AcademicContentDetailResponseDto,
  AcademicContentListResponseDto,
  AcademicContentResponseDto,
  AcademicContentTargetResponseDto,
  AcademicContentTargetsResponseDto,
  AcademicContentUploadIntentResponseDto,
  AcademicContentUploadCompleteResponseDto,
  AcademicContentUploadCancelResponseDto,
  AcademicContentFilePolicyResponseDto,
} from '../dto/academic-content-response.dto';
import { AcademicContentEffectiveFilePolicy } from '../files/domain/academic-content-file-policy';
import { AcademicContentTargetInput } from '../domain/academic-content-target.policy';
import { FileUploadSessionStatus } from '@prisma/client';

export function presentAcademicContent(
  content: AcademicContentRecord,
): AcademicContentResponseDto {
  return {
    id: content.id,
    academicYearId: content.academicYearId,
    termId: content.termId,
    type: content.type,
    audience: content.audience,
    title: content.title,
    description: content.description,
    status: content.status,
    archivedAt: content.archivedAt?.toISOString() ?? null,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  };
}

type PresentableTarget = AcademicContentTargetInput & { id: string };

export function presentAcademicContentTarget(
  target: PresentableTarget,
): AcademicContentTargetResponseDto {
  return {
    id: target.id,
    scopeType: target.scopeType,
    stageId: target.stageId ?? null,
    gradeId: target.gradeId ?? null,
    sectionId: target.sectionId ?? null,
    classroomId: target.classroomId ?? null,
    subjectId: target.subjectId ?? null,
    teacherSubjectAllocationId: target.teacherSubjectAllocationId ?? null,
  };
}

export function presentAcademicContentTargets(
  targets: readonly PresentableTarget[],
): AcademicContentTargetsResponseDto {
  return { targets: targets.map(presentAcademicContentTarget) };
}

export function presentAcademicContentDetail(
  content: AcademicContentManagementDetail,
): AcademicContentDetailResponseDto {
  return {
    ...presentAcademicContent(content),
    targets: content.targets.map(presentAcademicContentTarget),
    assets: content.assets.map((asset) => ({
      assetId: asset.id,
      fileId: asset.fileId,
      originalName: asset.file.originalName,
      mimeType: asset.file.mimeType,
      sizeBytes: asset.file.sizeBytes.toString(),
      createdAt: asset.createdAt.toISOString(),
    })),
  };
}

export function presentAcademicContentList(input: {
  items: AcademicContentRecord[];
  page: number;
  limit: number;
  total: number;
}): AcademicContentListResponseDto {
  return {
    items: input.items.map(presentAcademicContent),
    page: input.page,
    limit: input.limit,
    total: input.total,
  };
}

export function presentAcademicContentUploadIntent(input: {
  uploadId: string;
  status: FileUploadSessionStatus;
  sessionUrl: string;
  capabilityExpiresAt: Date;
  expiresAt: Date;
  expectedMimeType: string;
  expectedSizeBytes: bigint;
  uploadMode: 'resumable';
}): AcademicContentUploadIntentResponseDto {
  return {
    uploadId: input.uploadId,
    status: input.status,
    sessionUrl: input.sessionUrl,
    capabilityExpiresAt: input.capabilityExpiresAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    expectedMimeType: input.expectedMimeType,
    expectedSizeBytes: input.expectedSizeBytes.toString(),
    uploadMode: input.uploadMode,
  };
}

export function presentAcademicContentUploadComplete(input: {
  asset: {
    id: string;
    academicContentId: string;
    fileId: string;
    createdAt: Date;
  };
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
  };
}): AcademicContentUploadCompleteResponseDto {
  return {
    asset: {
      id: input.asset.id,
      academicContentId: input.asset.academicContentId,
      fileId: input.asset.fileId,
      createdAt: input.asset.createdAt.toISOString(),
    },
    file: {
      id: input.file.id,
      originalName: input.file.originalName,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes.toString(),
    },
  };
}

export function presentAcademicContentUploadCancel(input: {
  id: string;
  status: FileUploadSessionStatus;
  cancelledAt: Date | null;
}): AcademicContentUploadCancelResponseDto {
  return {
    uploadId: input.id,
    status: input.status,
    cancelledAt: input.cancelledAt?.toISOString() ?? null,
  };
}

export function presentAcademicContentFilePolicy(
  policy: AcademicContentEffectiveFilePolicy,
): AcademicContentFilePolicyResponseDto {
  return {
    attachmentsEnabled: policy.attachmentsEnabled,
    maximumFileSizeBytes: policy.maximumFileSizeBytes.toString(),
    documentsEnabled: policy.documentsEnabled,
    imagesEnabled: policy.imagesEnabled,
    videosEnabled: policy.videosEnabled,
    audioEnabled: policy.audioEnabled,
    archivesEnabled: policy.archivesEnabled,
    otherFilesEnabled: policy.otherFilesEnabled,
    allowStudentDownload: policy.allowStudentDownload,
    allowGuardianDownload: policy.allowGuardianDownload,
    allowInlinePreview: policy.allowInlinePreview,
  };
}
