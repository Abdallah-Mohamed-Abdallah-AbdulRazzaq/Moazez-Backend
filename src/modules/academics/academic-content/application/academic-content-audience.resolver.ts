import { Injectable } from '@nestjs/common';
import { AcademicContentAudienceType as Audience } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import { AcademicContentAudienceRepository } from '../infrastructure/academic-content-audience.repository';
import {
  academicAudienceSubjectRequirements,
  matchAcademicAudienceStudents,
  matchAcademicAudienceGuardians,
} from '../domain/academic-content-audience-matcher';

export interface AcademicContentStudentAudience {
  studentId: string;
  enrollmentId: string;
  studentUserId: string | null;
  classroomId: string;
  matchedTargetIds: string[];
}

export interface AcademicContentGuardianAudience {
  guardianId: string;
  recipientUserId: string | null;
  studentId: string;
  enrollmentId: string;
  canReceiveNotifications: boolean | null;
  matchedTargetIds: string[];
}

export interface AcademicContentAudienceResolution {
  students: AcademicContentStudentAudience[];
  guardians: AcademicContentGuardianAudience[];
}

@Injectable()
export class AcademicContentAudienceResolver {
  constructor(private readonly reads: AcademicContentAudienceRepository) {}

  // An explicit school boundary is required; no RequestContext or app-account adapter is used.
  async resolve(
    academicContentId: string,
    schoolId: string,
  ): Promise<AcademicContentAudienceResolution> {
    const content = await this.reads.loadContent(academicContentId, schoolId);
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    assertAcademicContentAudience(content.type, content.audience);
    if (content.audience === Audience.INTERNAL_STAFF)
      return { students: [], guardians: [] };

    const targets = await this.reads.loadTargets(content.id, schoolId);
    if (!targets.length) return { students: [], guardians: [] };
    const enrollments = await this.reads.eligibleEnrollments(
      schoolId,
      content.academicYearId,
      content.termId,
    );
    if (!enrollments.length) return { students: [], guardians: [] };

    const { subjectIds, gradeIds } = academicAudienceSubjectRequirements(
      targets,
      enrollments,
    );
    const taught = subjectIds.length
      ? await this.reads.taughtGradeSubjects(
          schoolId,
          content.academicYearId,
          content.termId,
          gradeIds,
          subjectIds,
        )
      : [];
    const eligibleStudents = matchAcademicAudienceStudents(
      targets,
      enrollments,
      taught,
    );
    if (content.audience === Audience.STUDENTS)
      return { students: eligibleStudents, guardians: [] };

    const links = eligibleStudents.length
      ? await this.reads.guardianLinks(schoolId, [
          ...new Set(eligibleStudents.map((row) => row.studentId)),
        ])
      : [];
    // Keep the ACC-2 public Guardian shape; richer internal contexts also carry Classroom.
    const guardianContexts = matchAcademicAudienceGuardians(
      eligibleStudents,
      links,
    ).map((row) => ({
      guardianId: row.guardianId,
      recipientUserId: row.recipientUserId,
      studentId: row.studentId,
      enrollmentId: row.enrollmentId,
      canReceiveNotifications: row.canReceiveNotifications,
      matchedTargetIds: row.matchedTargetIds,
    }));
    return {
      students:
        content.audience === Audience.STUDENTS_AND_GUARDIANS
          ? eligibleStudents
          : [],
      guardians: guardianContexts,
    };
  }
}
