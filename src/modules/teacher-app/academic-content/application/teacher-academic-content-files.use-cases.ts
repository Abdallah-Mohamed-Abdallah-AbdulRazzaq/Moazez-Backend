import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
  type CreateAcademicContentUploadCommand,
} from '../../../academics/academic-content/files/application/academic-content-upload.use-cases';
import {
  AcademicContentAssetAccessOperations,
  type AcademicContentAssetAccessMode,
} from '../../../academics/academic-content/files/application/academic-content-asset-access.operations';
import {
  AcademicContentPreparationTemplateUseCases,
  type PreparationTemplateReadQuery,
} from '../../../academics/academic-content/application/academic-content-preparation-template.use-cases';
import type { AcademicContentTeacherWriteScope } from '../../../academics/academic-content/infrastructure/academic-content-teacher-write.authorization';

@Injectable()
export class TeacherAcademicContentFilesUseCases {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly createUpload: CreateAcademicContentUploadUseCase,
    private readonly completeUpload: CompleteAcademicContentUploadUseCase,
    private readonly cancelUpload: CancelAcademicContentUploadUseCase,
    private readonly unlinkAsset: UnlinkAcademicContentAssetUseCase,
    private readonly assetAccess: AcademicContentAssetAccessOperations,
    private readonly templates: AcademicContentPreparationTemplateUseCases,
  ) {}

  private scope(
    permission: 'view' | 'manage',
  ): AcademicContentTeacherWriteScope {
    const teacher = this.access.assertCurrentTeacher();
    const required = 'academics.academic_content.' + permission;
    if (!teacher.permissions.includes(required))
      throw new ScopeMissingException({ missingPermissions: [required] });
    return {
      schoolId: teacher.schoolId,
      organizationId: teacher.organizationId,
      actorId: teacher.teacherUserId,
      teacherUserId: teacher.teacherUserId,
    };
  }

  uploadIntent(
    contentId: string,
    input: Omit<
      CreateAcademicContentUploadCommand,
      'contentId' | 'trustedOrigin'
    >,
    origin?: string,
  ) {
    const scope = this.scope('manage');
    if (
      !input ||
      Object.keys(input).some(
        (key) =>
          ![
            'clientRequestId',
            'originalName',
            'expectedMimeType',
            'expectedSizeBytes',
          ].includes(key),
      )
    )
      throw new ValidationDomainException('Invalid Teacher upload intent');
    return this.createUpload.executeForTeacher(
      {
        contentId,
        ...input,
        ...(origin === undefined ? {} : { trustedOrigin: origin }),
      },
      scope,
    );
  }
  complete(contentId: string, uploadId: string) {
    return this.completeUpload.executeForTeacher(
      { contentId, uploadId },
      this.scope('manage'),
    );
  }
  cancel(contentId: string, uploadId: string) {
    return this.cancelUpload.executeForTeacher(
      { contentId, uploadId },
      this.scope('manage'),
    );
  }
  unlink(contentId: string, assetId: string) {
    return this.unlinkAsset.executeForTeacher(
      { contentId, assetId },
      this.scope('manage'),
    );
  }
  currentAccess(
    contentId: string,
    assetId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    return this.assetAccess.current(
      this.scope('view'),
      contentId,
      assetId,
      mode,
    );
  }
  revisionAccess(
    contentId: string,
    revisionId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    return this.assetAccess.revision(
      this.scope('view'),
      contentId,
      revisionId,
      fileId,
      mode,
    );
  }

  private async templateScope(classId: string) {
    const scope = this.scope('view');
    const allocation = await this.access.assertTeacherOwnsAllocation(classId);
    const stageId = allocation.classroom?.section?.grade?.stage?.id;
    if (!stageId || !allocation.subject || !allocation.term)
      throw new NotFoundDomainException('Teacher allocation not found');
    return {
      schoolId: scope.schoolId,
      stageId,
      subjectId: allocation.subjectId,
    };
  }

  async listTemplates(classId: string, query: PreparationTemplateReadQuery) {
    const scope = await this.templateScope(classId);
    if (
      !query ||
      Object.keys(query).some(
        (key) => !['search', 'page', 'limit'].includes(key),
      )
    )
      throw new ValidationDomainException('Invalid Teacher template query');
    return this.templates.listApplicable(scope, query);
  }
  async templateDetail(classId: string, templateId: string) {
    return this.templates.detailApplicable(
      await this.templateScope(classId),
      templateId,
    );
  }
}
