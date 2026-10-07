import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
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
