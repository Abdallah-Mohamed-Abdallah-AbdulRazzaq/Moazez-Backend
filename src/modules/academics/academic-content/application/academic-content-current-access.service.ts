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
import {
  AcademicContentRecipientQuery,
  normalizeAcademicContentRecipientQuery,
} from '../domain/academic-content-recipient.query';

@Injectable()
export class AcademicContentCurrentAccessService {
  constructor(
    private readonly reads: AcademicContentRecipientReadRepository,
    private readonly audience: AcademicContentAudienceRepository,
  ) {}

  listCurrentStudentPublications(
    context: Extract<
      AcademicContentCurrentRecipientContext,
      { actorKind: 'STUDENT' }
    >,
    query: AcademicContentRecipientQuery = {},
    now = new Date(),
  ) {
    return this.reads.listCurrentStudentPublications(
      context,
      normalizeAcademicContentRecipientQuery(query),
      now,
    );
  }

  async assertCurrentStudentContentAccess(
    context: Extract<
      AcademicContentCurrentRecipientContext,
      { actorKind: 'STUDENT' }
    >,
    contentId: string,
    now = new Date(),
  ) {
    const identity = await this.reads.findCurrentStudentPublication(
      context,
      contentId,
      now,
    );
    if (!identity)
      throw new NotFoundDomainException('Academic content not found');
    return identity;
  }

  async getCurrentStudentContent(
    context: Extract<
      AcademicContentCurrentRecipientContext,
      { actorKind: 'STUDENT' }
    >,
    contentId: string,
    now = new Date(),
  ) {
    const identity = await this.assertCurrentStudentContentAccess(
      context,
      contentId,
      now,
    );
    const detail = await this.reads.findCurrentStudentDetail(
      context,
      identity,
      now,
    );
    if (!detail)
      throw new NotFoundDomainException('Academic content not found');
    return detail;
  }

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
