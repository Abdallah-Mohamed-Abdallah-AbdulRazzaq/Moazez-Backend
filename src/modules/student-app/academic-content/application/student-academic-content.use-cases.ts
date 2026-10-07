import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentAccessService } from '../../../academics/academic-content/application/academic-content-current-access.service';
import { AcademicContentCurrentRecipientContext } from '../../../academics/academic-content/domain/academic-content-current-access.policy';
import { normalizeAcademicContentRecipientQuery } from '../../../academics/academic-content/domain/academic-content-recipient.query';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppContext } from '../../shared/student-app.types';
import { StudentAcademicContentQueryDto } from '../dto/student-academic-content-query.dto';
import {
  StudentAcademicContentDetailResponseDto,
  StudentAcademicContentListResponseDto,
} from '../dto/student-academic-content-response.dto';
import { StudentAcademicContentPresenter } from '../presenters/student-academic-content.presenter';
import { AcademicContentRecipientAssetAccessService } from '../../../academics/academic-content/files/application/academic-content-recipient-asset-access.service';
import type { AcademicContentAssetAccessMode } from '../../../academics/academic-content/files/application/academic-content-authorized-file.signer';

function recipientContext(
  context: StudentAppContext,
): Extract<
  AcademicContentCurrentRecipientContext,
  { actorKind: 'STUDENT' }
> | null {
  if (context.termId === null) return null;
  return {
    actorKind: 'STUDENT',
    schoolId: context.schoolId,
    userId: context.studentUserId,
    studentId: context.studentId,
    enrollmentId: context.enrollmentId,
    classroomId: context.classroomId,
    academicYearId: context.academicYearId,
    termId: context.termId,
  };
}

@Injectable()
export class ListStudentAcademicContentUseCase {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly currentAccess: AcademicContentCurrentAccessService,
  ) {}

  async execute(
    query: StudentAcademicContentQueryDto = {},
  ): Promise<StudentAcademicContentListResponseDto> {
    const context = recipientContext(await this.access.getStudentAppContext());
    if (!context) {
      const { page, limit } = normalizeAcademicContentRecipientQuery(query);
      return { items: [], pagination: { page, limit, total: 0 } };
    }
    return StudentAcademicContentPresenter.presentList(
      await this.currentAccess.listCurrentStudentPublications(context, query),
    );
  }
}

@Injectable()
export class GetStudentAcademicContentUseCase {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly currentAccess: AcademicContentCurrentAccessService,
  ) {}

  async execute(
    contentId: string,
  ): Promise<StudentAcademicContentDetailResponseDto> {
    const context = recipientContext(await this.access.getStudentAppContext());
    if (!context)
      throw new NotFoundDomainException('Academic content not found');
    return StudentAcademicContentPresenter.presentDetail(
      await this.currentAccess.getCurrentStudentContent(context, contentId),
    );
  }
}

@Injectable()
export class AccessStudentAcademicContentAssetUseCase {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly assets: AcademicContentRecipientAssetAccessService,
  ) {}

  async execute(
    contentId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ): Promise<{ url: string }> {
    const context = recipientContext(await this.access.getStudentAppContext());
    if (!context) throw new NotFoundDomainException('Academic asset not found');
    return this.assets.access(context, contentId, fileId, mode);
  }
}
