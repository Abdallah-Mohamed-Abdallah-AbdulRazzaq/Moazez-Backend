import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  academicAudienceSubjectRequirements,
  matchAcademicAudienceStudents,
} from '../domain/academic-content-audience-matcher';
import {
  academicContentCurrentAccessAllows,
  AcademicContentCurrentRecipientContext,
} from '../domain/academic-content-current-access.policy';
import { AcademicContentAudienceRepository } from '../infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../infrastructure/academic-content-recipient-read.repository';

@Injectable()
export class AcademicContentCurrentAccessService {
  constructor(
    private readonly reads: AcademicContentRecipientReadRepository,
    private readonly audience: AcademicContentAudienceRepository,
  ) {}

  /** Returns exact immutable publication identity; every denial is non-disclosing. */
  async assertPublicationAccess(
    context: AcademicContentCurrentRecipientContext,
    publicationId: string,
    now = new Date(),
  ) {
    const unavailable = () =>
      new NotFoundDomainException('Academic content not found');
    const publication = await this.reads.findPublication(
      context.schoolId,
      publicationId,
    );
    if (
      !publication ||
      !academicContentCurrentAccessAllows(context, publication, now)
    )
      throw unavailable();
    const enrollment = await this.reads.findCurrentEnrollment(context);
    if (!enrollment) throw unavailable();
    const targets = publication.revision.targets.filter(
      (target) =>
        target.schoolId === context.schoolId &&
        target.revisionId === publication.revisionId,
    );
    const { subjectIds, gradeIds } = academicAudienceSubjectRequirements(
      targets,
      [enrollment],
    );
    const taught = subjectIds.length
      ? await this.audience.taughtGradeSubjects(
          context.schoolId,
          context.academicYearId,
          context.termId,
          gradeIds,
          subjectIds,
        )
      : [];
    const matched = matchAcademicAudienceStudents(
      targets,
      [enrollment],
      taught,
    );
    if (!matched.length) throw unavailable();
    return {
      publication,
      matchedRevisionTargetIds: matched[0].matchedTargetIds,
    };
  }
}
