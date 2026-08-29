import type { StudentCredentialAudienceResolution } from '../application/student-credential-audience.service';
import type {
  StudentCredentialBatchPreviewResponseDto,
  StudentCredentialBatchResponseDto,
} from '../dto/student-credential-batch.dto';
import {
  mapStudentCredentialAudienceToApi,
  mapStudentCredentialModeToApi,
} from '../domain/student-credential.types';
import type { StudentCredentialBatchRecord } from '../infrastructure/student-credential-batch.repository';

export function presentStudentCredentialPreview(
  resolution: StudentCredentialAudienceResolution,
): StudentCredentialBatchPreviewResponseDto {
  return {
    totalMatched: resolution.totalMatched,
    eligible: resolution.eligible.length,
    skipped: resolution.skipped,
    skippedReasons: resolution.skippedReasons,
    sample: resolution.eligible.slice(0, 10).map((target) => ({
      studentId: target.studentId,
      userId: target.userId,
      fullName: target.fullName,
      username: target.username,
      loginEmail: target.loginEmail,
      hasPassword: target.hasPassword,
      mustChangePassword: target.mustChangePassword,
      credentialVersion: target.credentialVersion,
    })),
  };
}

export function presentStudentCredentialBatch(
  batch: StudentCredentialBatchRecord,
): StudentCredentialBatchResponseDto {
  return {
    id: batch.id,
    audienceMode: mapStudentCredentialAudienceToApi(batch.audienceMode),
    credentialMode: mapStudentCredentialModeToApi(batch.credentialMode),
    selectors: presentSelectors(batch),
    status: batch.status.toLowerCase(),
    counters: {
      totalRows: batch.totalRows,
      generatedRows: batch.generatedRows,
      skippedRows: batch.skippedRows,
      failedRows: batch.failedRows,
    },
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    startedAt: batch.startedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}

function presentSelectors(
  batch: StudentCredentialBatchRecord,
): Record<string, string> {
  return Object.fromEntries(
    [
      ['sourceRegistrationBatchId', batch.sourceRegistrationBatchId],
      ['academicYearId', batch.academicYearId],
      ['stageId', batch.stageId],
      ['gradeId', batch.gradeId],
      ['sectionId', batch.sectionId],
      ['classroomId', batch.classroomId],
    ].filter((entry): entry is [string, string] => entry[1] !== null),
  );
}
