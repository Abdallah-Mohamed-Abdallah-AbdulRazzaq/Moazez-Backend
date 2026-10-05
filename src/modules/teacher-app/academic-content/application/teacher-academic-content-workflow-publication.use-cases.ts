import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAcademicContentReadAdapter } from '../infrastructure/teacher-academic-content-read.adapter';
import type { AcademicContentTeacherWriteScope } from '../../../academics/academic-content/infrastructure/academic-content-teacher-write.authorization';
import { SubmitAcademicContentUseCase } from '../../../academics/academic-content/application/academic-content-workflow.use-cases';
import { ListAcademicContentApprovalHistoryUseCase } from '../../../academics/academic-content/application/academic-content-review.use-cases';
import {
  ListAcademicContentRevisionsUseCase,
  GetAcademicContentRevisionUseCase,
} from '../../../academics/academic-content/application/academic-content-revision.use-cases';
import {
  ScheduleAcademicContentPublicationUseCase,
  UnscheduleAcademicContentPublicationUseCase,
  CancelAcademicContentPublicationUseCase,
  StartAcademicContentRevisionUseCase,
  GetAcademicContentPublicationReadinessUseCase,
  GetAcademicContentAudiencePreviewUseCase,
  ListAcademicContentPublicationHistoryUseCase,
  GetAcademicContentPublicationUseCase,
} from '../../../academics/academic-content/application/academic-content-publication.use-cases';
import type { AcademicContentPublicationCommand } from '../../../academics/academic-content/domain/academic-content-publication.policy';
import { assertAcademicContentPublicationUuid } from '../../../academics/academic-content/domain/academic-content-publication.policy';
import {
  presentAcademicContentRevisionList,
  presentAcademicContentRevisionDetail,
} from '../../../academics/academic-content/presenters/academic-content.presenter';
import {
  presentAcademicContentPublication,
  presentAcademicContentPublicationList,
  presentAcademicContentPublicationRevisionStart,
  presentAcademicContentPublicationReadiness,
  presentAcademicContentAudiencePreview,
} from '../../../academics/academic-content/presenters/academic-content-publication.presenter';

type Page = { page?: number; limit?: number };
type Permission = 'view' | 'manage' | 'publish';

@Injectable()
export class TeacherAcademicContentWorkflowPublicationUseCases {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly read: TeacherAcademicContentReadAdapter,
    private readonly submitContent: SubmitAcademicContentUseCase,
    private readonly listRevisions: ListAcademicContentRevisionsUseCase,
    private readonly getRevision: GetAcademicContentRevisionUseCase,
    private readonly listApprovals: ListAcademicContentApprovalHistoryUseCase,
    private readonly getReadiness: GetAcademicContentPublicationReadinessUseCase,
    private readonly getPreview: GetAcademicContentAudiencePreviewUseCase,
    private readonly listPublications: ListAcademicContentPublicationHistoryUseCase,
    private readonly getPublication: GetAcademicContentPublicationUseCase,
    private readonly schedulePublication: ScheduleAcademicContentPublicationUseCase,
    private readonly unschedulePublication: UnscheduleAcademicContentPublicationUseCase,
    private readonly cancelPublication: CancelAcademicContentPublicationUseCase,
    private readonly startRevision: StartAcademicContentRevisionUseCase,
  ) {}

  private scope(
    ...permissions: Permission[]
  ): AcademicContentTeacherWriteScope {
    const teacher = this.access.assertCurrentTeacher();
    const missingPermissions = permissions
      .map((p) => `academics.academic_content.${p}`)
      .filter((p) => !teacher.permissions.includes(p));
    if (missingPermissions.length)
      throw new ScopeMissingException({ missingPermissions });
    return {
      schoolId: teacher.schoolId,
      organizationId: teacher.organizationId,
      actorId: teacher.teacherUserId,
      teacherUserId: teacher.teacherUserId,
    };
  }

  private async readable(contentId: string) {
    const scope = this.scope('view');
    assertAcademicContentPublicationUuid(contentId);
    if (
      !(await this.read.detail(contentId, scope.schoolId, scope.teacherUserId))
    )
      throw new NotFoundDomainException('Academic content not found');
    return scope.schoolId;
  }

  private empty(body: unknown) {
    if (body == null) return;
    if (
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw new ValidationDomainException(
        'This transition requires an empty body',
      );
  }

  async revisions(contentId: string, query: Page = {}) {
    const schoolId = await this.readable(contentId);
    return presentAcademicContentRevisionList(
      await this.listRevisions.executeForAuthorizedContent(
        schoolId,
        contentId,
        query,
      ),
    );
  }
  async revision(contentId: string, revisionId: string) {
    const schoolId = await this.readable(contentId);
    assertAcademicContentPublicationUuid(revisionId);
    return presentAcademicContentRevisionDetail(
      await this.getRevision.executeForAuthorizedContent(
        schoolId,
        contentId,
        revisionId,
      ),
    );
  }
  submit(contentId: string, body: unknown = {}) {
    const scope = this.scope('manage');
    assertAcademicContentPublicationUuid(contentId);
    return this.submitContent.executeForTeacher(scope, contentId, body);
  }
  async approvals(contentId: string, query: Page = {}) {
    const schoolId = await this.readable(contentId);
    const page = await this.listApprovals.executeForAuthorizedContent(
      schoolId,
      contentId,
      query,
    );
    return {
      ...page,
      items: page.items.map((item) => ({
        roundNumber: item.roundNumber,
        revisionId: item.revisionId,
        status: item.status,
        submittedAt: item.submittedAt.toISOString(),
        decidedAt: item.decidedAt?.toISOString() ?? null,
        decisionNote: item.decisionNote,
      })),
    };
  }
  async publicationReadiness(contentId: string) {
    const schoolId = await this.readable(contentId);
    return presentAcademicContentPublicationReadiness(
      await this.getReadiness.executeForAuthorizedContent(schoolId, contentId),
    );
  }
  async audiencePreview(contentId: string) {
    const schoolId = await this.readable(contentId);
    return presentAcademicContentAudiencePreview(
      await this.getPreview.executeForAuthorizedContent(schoolId, contentId),
    );
  }
  async publications(contentId: string, query: Page = {}) {
    const schoolId = await this.readable(contentId);
    return presentAcademicContentPublicationList(
      await this.listPublications.executeForAuthorizedContent(
        schoolId,
        contentId,
        query,
      ),
    );
  }
  async publication(contentId: string, publicationId: string) {
    const schoolId = await this.readable(contentId);
    return presentAcademicContentPublication(
      await this.getPublication.executeForAuthorizedContent(
        schoolId,
        contentId,
        publicationId,
      ),
    );
  }
  async publish(contentId: string, command: AcademicContentPublicationCommand) {
    const scope = this.scope('publish');
    return presentAcademicContentPublication(
      await this.schedulePublication.executeForTeacher(
        scope,
        contentId,
        command,
      ),
    );
  }
  async unschedule(
    contentId: string,
    publicationId: string,
    body: unknown = {},
  ) {
    const scope = this.scope('publish');
    this.empty(body);
    return presentAcademicContentPublication(
      await this.unschedulePublication.executeForTeacher(
        scope,
        contentId,
        publicationId,
      ),
    );
  }
  async withdraw(contentId: string, publicationId: string, body: unknown = {}) {
    const scope = this.scope('publish');
    this.empty(body);
    return presentAcademicContentPublication(
      await this.cancelPublication.executeForTeacher(
        scope,
        contentId,
        publicationId,
      ),
    );
  }
  async revise(contentId: string, publicationId: string, body: unknown = {}) {
    const scope = this.scope('manage', 'publish');
    this.empty(body);
    return presentAcademicContentPublicationRevisionStart(
      await this.startRevision.executeForTeacher(
        scope,
        contentId,
        publicationId,
      ),
    );
  }
}
