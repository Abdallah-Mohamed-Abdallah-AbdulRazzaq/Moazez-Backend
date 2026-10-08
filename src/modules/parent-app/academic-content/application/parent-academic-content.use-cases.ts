import { HttpStatus, Injectable } from '@nestjs/common';
import { AcademicContentAcknowledgementService } from '../../../academics/academic-content/application/academic-content-acknowledgement.service';
import { AcademicContentEngagementService } from '../../../academics/academic-content/application/academic-content-engagement.service';
import { RecordAcademicContentEngagementDto } from '../../../academics/academic-content/dto/academic-content-engagement.dto';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentAccessService } from '../../../academics/academic-content/application/academic-content-current-access.service';
import {
  normalizeAcademicContentRecipientQuery,
  ParentRecipientContext,
} from '../../../academics/academic-content/domain/academic-content-recipient.query';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import type {
  ParentAppContext,
  ParentAppAccessibleChild,
} from '../../shared/parent-app.types';
import { ParentAcademicContentQueryDto } from '../dto/parent-academic-content-query.dto';
import {
  ParentAcademicContentAccessibleChildrenResponseDto,
  ParentAcademicContentDetailResponseDto,
  ParentAcademicContentListResponseDto,
} from '../dto/parent-academic-content-response.dto';
import { ParentAcademicContentPresenter } from '../presenters/parent-academic-content.presenter';
import { AcademicContentRecipientAssetAccessService } from '../../../academics/academic-content/files/application/academic-content-recipient-asset-access.service';
import type { AcademicContentAssetAccessMode } from '../../../academics/academic-content/files/application/academic-content-authorized-file.signer';

function recipientContext(
  context: ParentAppContext,
  child: ParentAppAccessibleChild,
): ParentRecipientContext | null {
  if (child.termId === null) return null;
  return {
    actorKind: 'PARENT',
    schoolId: context.schoolId,
    userId: context.parentUserId,
    guardianIds: context.guardianIds,
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    classroomId: child.classroomId,
    academicYearId: child.academicYearId,
    termId: child.termId,
  };
}

@Injectable()
export class ParentAcademicContentAcknowledgementUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly acknowledgement: AcademicContentAcknowledgementService,
  ) {}
  async execute(
    studentId: string,
    contentId: string,
    expectedPublicationId: string,
    write: boolean,
  ) {
    try {
      const { context, child } =
        await this.access.getOwnedStudentContext(studentId);
      const recipient = recipientContext(context, child);
      if (!recipient)
        throw new NotFoundDomainException('Academic content not found');
      return await this.acknowledgement.resolve(
        recipient,
        contentId,
        expectedPublicationId,
        write,
      );
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException({
        code: 'service_unavailable',
        message: 'Acknowledgement temporarily unavailable',
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }
}

@Injectable()
export class RecordParentAcademicContentEngagementUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly engagement: AcademicContentEngagementService,
  ) {}

  async execute(
    studentId: string,
    contentId: string,
    body: RecordAcademicContentEngagementDto,
  ) {
    const { context, child } =
      await this.access.getOwnedStudentContext(studentId);
    const recipient = recipientContext(context, child);
    if (!recipient)
      throw new NotFoundDomainException('Academic content not found');
    return this.engagement.record(recipient, contentId, body);
  }
}

@Injectable()
export class ListParentAcademicContentUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly currentAccess: AcademicContentCurrentAccessService,
  ) {}
  async execute(
    studentId: string,
    query: ParentAcademicContentQueryDto = {},
  ): Promise<ParentAcademicContentListResponseDto> {
    const { context, child } =
      await this.access.getOwnedStudentContext(studentId);
    const recipient = recipientContext(context, child);
    if (!recipient) {
      const { page, limit } = normalizeAcademicContentRecipientQuery(
        query,
        'PARENT',
      );
      return { items: [], pagination: { page, limit, total: 0 } };
    }
    return ParentAcademicContentPresenter.presentList(
      await this.currentAccess.listCurrentParentPublications(recipient, query),
    );
  }
}

@Injectable()
export class GetParentAcademicContentUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly currentAccess: AcademicContentCurrentAccessService,
  ) {}
  async execute(
    studentId: string,
    contentId: string,
  ): Promise<ParentAcademicContentDetailResponseDto> {
    const { context, child } =
      await this.access.getOwnedStudentContext(studentId);
    const recipient = recipientContext(context, child);
    if (!recipient)
      throw new NotFoundDomainException('Academic content not found');
    return ParentAcademicContentPresenter.presentDetail(
      await this.currentAccess.getCurrentParentContent(recipient, contentId),
    );
  }
}

@Injectable()
export class ListParentAcademicContentAccessibleChildrenUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly currentAccess: AcademicContentCurrentAccessService,
  ) {}
  async execute(
    contentId: string,
  ): Promise<ParentAcademicContentAccessibleChildrenResponseDto> {
    const context = await this.access.getParentAppContext();
    const children = context.children.flatMap((child) =>
      child.termId === null
        ? []
        : [
            {
              studentId: child.studentId,
              enrollmentId: child.enrollmentId,
              classroomId: child.classroomId,
              academicYearId: child.academicYearId,
              termId: child.termId,
            },
          ],
    );
    if (!children.length)
      throw new NotFoundDomainException('Academic content not found');
    const result = await this.currentAccess.listCurrentParentAccessibleChildren(
      {
        schoolId: context.schoolId,
        userId: context.parentUserId,
        guardianIds: context.guardianIds,
        children,
      },
      contentId,
    );
    return {
      academicContentId: result.academicContentId,
      publicationId: result.publicationId,
      children: result.children.map((child) => ({
        studentId: child.studentId,
      })),
    };
  }
}

@Injectable()
export class AccessParentAcademicContentAssetUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly assets: AcademicContentRecipientAssetAccessService,
  ) {}

  async execute(
    studentId: string,
    contentId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ): Promise<{ url: string }> {
    const { context, child } =
      await this.access.getOwnedStudentContext(studentId);
    const recipient = recipientContext(context, child);
    if (!recipient)
      throw new NotFoundDomainException('Academic asset not found');
    return this.assets.access(recipient, contentId, fileId, mode);
  }
}
