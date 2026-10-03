import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceType as Audience,
  Prisma,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  academicAudienceSubjectRequirements,
  matchAcademicAudienceStudents,
  matchAcademicAudienceGuardians,
} from '../domain/academic-content-audience-matcher';
import { isAcademicContentExternallyPublishable } from '../domain/academic-content-publication.policy';
import { AcademicContentAudienceRepository } from './academic-content-audience.repository';

export type AcademicContentRevisionAudienceIdentity = {
  schoolId: string;
  contentId: string;
  revisionId: string;
};
export type AcademicContentRevisionStudentContext = {
  studentId: string;
  enrollmentId: string;
  classroomId: string;
  recipientUserId: string | null;
  matchedRevisionTargetIds: string[];
};
export type AcademicContentRevisionGuardianContext = {
  guardianId: string;
  studentId: string;
  enrollmentId: string;
  classroomId: string;
  recipientUserId: string | null;
  guardianCanReceiveNotifications: boolean | null;
  matchedRevisionTargetIds: string[];
};
export type AcademicContentRevisionAudience = {
  students: AcademicContentRevisionStudentContext[];
  guardians: AcademicContentRevisionGuardianContext[];
};

@Injectable()
export class AcademicContentRevisionAudienceResolver {
  constructor(private readonly reads: AcademicContentAudienceRepository) {}

  async resolve(
    tx: Prisma.TransactionClient,
    input: AcademicContentRevisionAudienceIdentity,
  ): Promise<AcademicContentRevisionAudience> {
    const revision = await tx.academicContentRevision.findFirst({
      where: {
        id: input.revisionId,
        schoolId: input.schoolId,
        academicContentId: input.contentId,
        snapshotContractVersion: 2,
      },
      select: {
        academicYearId: true,
        termId: true,
        type: true,
        audience: true,
        targets: {
          where: { schoolId: input.schoolId, revisionId: input.revisionId },
          orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            scopeType: true,
            stageId: true,
            gradeId: true,
            sectionId: true,
            classroomId: true,
            subjectId: true,
          },
        },
      },
    });
    if (!revision)
      throw new NotFoundDomainException('Publication revision not found');
    if (
      !isAcademicContentExternallyPublishable(revision.type, revision.audience)
    )
      throw new DomainException({
        code: 'academic_content.publication.audience_unavailable',
        message: 'Publication audience is unavailable',
        httpStatus: HttpStatus.CONFLICT,
      });
    if (!revision.targets.length)
      throw new DomainException({
        code: 'academic_content.publication.snapshot_conflict',
        message: 'Publication revision has no frozen targets',
        httpStatus: HttpStatus.CONFLICT,
      });
    const enrollments = await this.reads.eligibleEnrollments(
      input.schoolId,
      revision.academicYearId,
      revision.termId,
      tx,
    );
    const { subjectIds, gradeIds } = academicAudienceSubjectRequirements(
      revision.targets,
      enrollments,
    );
    const taught =
      subjectIds.length && enrollments.length
        ? await this.reads.taughtGradeSubjects(
            input.schoolId,
            revision.academicYearId,
            revision.termId,
            gradeIds,
            subjectIds,
            tx,
          )
        : [];
    const students = matchAcademicAudienceStudents(
      revision.targets,
      enrollments,
      taught,
    );
    const links =
      revision.audience !== Audience.STUDENTS && students.length
        ? await this.reads.guardianLinks(
            input.schoolId,
            [...new Set(students.map((row) => row.studentId))],
            tx,
          )
        : [];
    const guardians = matchAcademicAudienceGuardians(students, links);
    return {
      students:
        revision.audience === Audience.GUARDIANS
          ? []
          : students.map((row) => ({
              studentId: row.studentId,
              enrollmentId: row.enrollmentId,
              classroomId: row.classroomId,
              recipientUserId: row.studentUserId,
              matchedRevisionTargetIds: row.matchedTargetIds,
            })),
      guardians: guardians.map((row) => ({
        guardianId: row.guardianId,
        studentId: row.studentId,
        enrollmentId: row.enrollmentId,
        classroomId: row.classroomId,
        recipientUserId: row.recipientUserId,
        guardianCanReceiveNotifications: row.canReceiveNotifications,
        matchedRevisionTargetIds: row.matchedTargetIds,
      })),
    };
  }
}
