import { Injectable } from '@nestjs/common';
import { AcademicContentType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { evaluateAcademicContentReadiness } from '../domain/academic-content-readiness.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { AcademicContentValidationRepository } from '../infrastructure/academic-content-validation.repository';
import { academicContentManagementScope } from './academic-content-management.scope';

@Injectable()
export class GetAcademicContentReadinessUseCase {
  constructor(
    private readonly contents: AcademicContentRepository,
    private readonly validation: AcademicContentValidationRepository,
  ) {}

  async execute(contentId: string, now = new Date()) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    const content = await this.contents.findManagementDetail(
      contentId,
      schoolId,
    );
    if (!content)
      throw new NotFoundDomainException('Academic content not found');

    const [year, term] = await Promise.all([
      this.validation.findAcademicYear(content.academicYearId, schoolId),
      this.validation.findTerm(content.termId, schoolId),
    ]);
    const detail = {
      [AcademicContentType.TEACHER_PREPARATION]: content.preparationDetail,
      [AcademicContentType.WEEKLY_PLAN]: content.weeklyPlanDetail,
      [AcademicContentType.GUARDIAN_WEEKLY_NOTE]: content.guardianNoteDetail,
      [AcademicContentType.SUBJECT_RESOURCE]: content.subjectResourceDetail,
      [AcademicContentType.ONLINE_SESSION]: content.onlineSessionDetail,
      [AcademicContentType.GENERAL_RESOURCE]: null,
    }[content.type];
    return evaluateAcademicContentReadiness({
      status: content.status,
      type: content.type,
      audience: content.audience,
      title: content.title,
      academicYearId: content.academicYearId,
      targets: content.targets,
      hasTypeDetail: detail != null,
      academicYearExists: year !== null,
      term,
      now,
    });
  }
}
