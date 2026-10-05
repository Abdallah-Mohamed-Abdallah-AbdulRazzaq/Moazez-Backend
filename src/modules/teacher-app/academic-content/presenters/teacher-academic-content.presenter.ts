import {
  presentAcademicContentDetail,
  presentAcademicContentFilePolicy,
} from '../../../academics/academic-content/presenters/academic-content.presenter';
import { teacherAcademicContentCapabilities } from '../domain/teacher-academic-content-ownership.policy';
import type { TeacherAcademicContentReadAdapter } from '../infrastructure/teacher-academic-content-read.adapter';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import type { AcademicContentEffectiveWorkflowPolicy } from '../../../academics/academic-content/domain/academic-content-workflow.policy';
import type {
  TeacherAcademicContentActionsDto,
  TeacherAcademicContentCapabilitiesDto,
  TeacherAcademicContentDetailDto,
} from '../dto/teacher-academic-content.dto';

export function presentTeacherAcademicContentDetail(
  content: NonNullable<
    Awaited<ReturnType<TeacherAcademicContentReadAdapter['detail']>>
  >,
  teacher: TeacherAppContext,
  workflow: AcademicContentEffectiveWorkflowPolicy,
  now: Date,
  verifiedActions: Partial<
    Omit<TeacherAcademicContentActionsDto, 'canEdit'>
  > = {},
): TeacherAcademicContentDetailDto {
  const term =
    content.term.schoolId === teacher.schoolId &&
    content.term.academicYearId === content.academicYearId &&
    content.term.deletedAt === null
      ? content.term
      : null;
  return {
    ...presentAcademicContentDetail(content),
    capabilities: teacherAcademicContentCapabilities({
      content,
      teacherUserId: teacher.teacherUserId,
      permissions: teacher.permissions,
      workflow,
      term,
      now,
      verifiedActions,
    }),
  };
}

export function presentTeacherAcademicContentSettings(
  settings: Awaited<ReturnType<TeacherAcademicContentReadAdapter['settings']>>,
): TeacherAcademicContentCapabilitiesDto {
  const files = presentAcademicContentFilePolicy(settings.files);
  return {
    workflow: settings.workflow,
    files: {
      attachmentsEnabled: files.attachmentsEnabled,
      maximumFileSizeBytes: files.maximumFileSizeBytes,
      documentsEnabled: files.documentsEnabled,
      imagesEnabled: files.imagesEnabled,
      videosEnabled: files.videosEnabled,
      audioEnabled: files.audioEnabled,
      archivesEnabled: files.archivesEnabled,
      otherFilesEnabled: files.otherFilesEnabled,
      allowInlinePreview: files.allowInlinePreview,
    },
  };
}
