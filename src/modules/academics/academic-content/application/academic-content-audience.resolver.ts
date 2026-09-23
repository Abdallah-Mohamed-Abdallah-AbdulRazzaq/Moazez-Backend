import { Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import {
  AcademicContentAudienceRepository,
  EligibleAcademicEnrollment,
} from '../infrastructure/academic-content-audience.repository';

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

    const subjectIds = [
      ...new Set(
        targets.flatMap((target) =>
          target.subjectId ? [target.subjectId] : [],
        ),
      ),
    ];
    const gradeIds = [
      ...new Set(
        enrollments.map((enrollment) => enrollment.classroom.section.gradeId),
      ),
    ];
    const taught = subjectIds.length
      ? await this.reads.taughtGradeSubjects(
          schoolId,
          content.academicYearId,
          content.termId,
          gradeIds,
          subjectIds,
        )
      : [];
    const taughtKeys = new Set(
      taught.map((row) => JSON.stringify([row.gradeId, row.subjectId])),
    );
    const eligibleStudents: AcademicContentStudentAudience[] = [];
    for (const enrollment of enrollments) {
      const matchedTargetIds = targets
        .filter(
          (target) =>
            this.matches(target, enrollment) &&
            (!target.subjectId ||
              taughtKeys.has(
                JSON.stringify([
                  enrollment.classroom.section.gradeId,
                  target.subjectId,
                ]),
              )),
        )
        .map((target) => target.id)
        .sort();
      if (!matchedTargetIds.length) continue;
      eligibleStudents.push({
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        studentUserId: enrollment.student.userId,
        classroomId: enrollment.classroomId,
        matchedTargetIds,
      });
    }
    eligibleStudents.sort((a, b) =>
      a.enrollmentId.localeCompare(b.enrollmentId),
    );
    if (content.audience === Audience.STUDENTS)
      return { students: eligibleStudents, guardians: [] };

    const links = eligibleStudents.length
      ? await this.reads.guardianLinks(schoolId, [
          ...new Set(eligibleStudents.map((row) => row.studentId)),
        ])
      : [];
    const studentsById = new Map<string, AcademicContentStudentAudience[]>();
    for (const student of eligibleStudents) {
      const existing = studentsById.get(student.studentId) ?? [];
      existing.push(student);
      studentsById.set(student.studentId, existing);
    }
    const guardians = new Map<string, AcademicContentGuardianAudience>();
    for (const link of links) {
      for (const student of studentsById.get(link.studentId) ?? []) {
        const key = JSON.stringify([
          link.guardianId,
          student.studentId,
          student.enrollmentId,
        ]);
        guardians.set(key, {
          guardianId: link.guardianId,
          recipientUserId: link.guardian.userId,
          studentId: student.studentId,
          enrollmentId: student.enrollmentId,
          canReceiveNotifications: link.guardian.canReceiveNotifications,
          matchedTargetIds: student.matchedTargetIds,
        });
      }
    }
    const guardianContexts = [...guardians.values()].sort(
      (a, b) =>
        a.guardianId.localeCompare(b.guardianId) ||
        a.studentId.localeCompare(b.studentId) ||
        a.enrollmentId.localeCompare(b.enrollmentId),
    );
    return {
      students:
        content.audience === Audience.STUDENTS_AND_GUARDIANS
          ? eligibleStudents
          : [],
      guardians: guardianContexts,
    };
  }

  private matches(
    target: {
      scopeType: Scope;
      stageId: string | null;
      gradeId: string | null;
      sectionId: string | null;
      classroomId: string | null;
    },
    enrollment: EligibleAcademicEnrollment,
  ): boolean {
    switch (target.scopeType) {
      case Scope.SCHOOL:
        return true;
      case Scope.STAGE:
        return target.stageId === enrollment.classroom.section.grade.stageId;
      case Scope.GRADE:
        return target.gradeId === enrollment.classroom.section.gradeId;
      case Scope.SECTION:
        return target.sectionId === enrollment.classroom.sectionId;
      case Scope.CLASSROOM:
        return target.classroomId === enrollment.classroomId;
    }
  }
}
