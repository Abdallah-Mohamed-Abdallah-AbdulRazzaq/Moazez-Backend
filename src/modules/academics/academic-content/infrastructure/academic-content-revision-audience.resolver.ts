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
  AcademicAudienceStudentContext,
} from '../domain/academic-content-audience-matcher';
import { isAcademicContentExternallyPublishable } from '../domain/academic-content-publication.policy';
import {
  AcademicContentAudienceRepository,
  ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE,
} from './academic-content-audience.repository';

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

  async *resolveBatches(
    tx: Prisma.TransactionClient,
    input: AcademicContentRevisionAudienceIdentity,
  ): AsyncGenerator<AcademicContentRevisionAudience> {
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
    let enrollmentCursor: string | undefined;
    while (true) {
      const enrollments = await this.reads.eligibleEnrollmentsPage(
        input.schoolId,
        revision.academicYearId,
        revision.termId,
        enrollmentCursor,
        tx,
      );
      if (!enrollments.length) break;
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
      if (revision.audience !== Audience.GUARDIANS && students.length) {
        yield {
          students: students.map((row) => ({
            studentId: row.studentId,
            enrollmentId: row.enrollmentId,
            classroomId: row.classroomId,
            recipientUserId: row.studentUserId,
            matchedRevisionTargetIds: row.matchedTargetIds,
          })),
          guardians: [],
        };
      }
      if (revision.audience !== Audience.STUDENTS && students.length) {
        const byStudent = new Map<string, AcademicAudienceStudentContext[]>();
        for (const student of students) {
          const contexts = byStudent.get(student.studentId) ?? [];
          contexts.push(student);
          byStudent.set(student.studentId, contexts);
        }
        let guardianCursor: string | undefined;
        while (true) {
          const links = await this.reads.guardianLinksPage(
            input.schoolId,
            [...byStudent.keys()],
            guardianCursor,
            tx,
          );
          if (!links.length) break;
          let guardians: AcademicContentRevisionGuardianContext[] = [];
          // A link can expand to several Enrollment identities. Match one link
          // against at most one Enrollment page, then flush bounded contexts.
          for (const link of links) {
            for (const row of matchAcademicAudienceGuardians(
              byStudent.get(link.studentId) ?? [],
              [link],
            )) {
              guardians.push({
                guardianId: row.guardianId,
                studentId: row.studentId,
                enrollmentId: row.enrollmentId,
                classroomId: row.classroomId,
                recipientUserId: row.recipientUserId,
                guardianCanReceiveNotifications: row.canReceiveNotifications,
                matchedRevisionTargetIds: row.matchedTargetIds,
              });
              if (
                guardians.length ===
                ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE
              ) {
                yield { students: [], guardians };
                guardians = [];
              }
            }
          }
          if (guardians.length) yield { students: [], guardians };
          guardianCursor = links[links.length - 1].id;
          if (links.length < ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE)
            break;
        }
      }
      enrollmentCursor = enrollments[enrollments.length - 1].id;
      if (enrollments.length < ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE)
        break;
    }
  }
}
