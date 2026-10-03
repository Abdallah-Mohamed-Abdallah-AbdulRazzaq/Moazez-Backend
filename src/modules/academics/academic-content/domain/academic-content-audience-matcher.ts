import { AcademicContentTargetScopeType as Scope } from '@prisma/client';

export type AcademicAudienceTarget = {
  id: string;
  scopeType: Scope;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  subjectId: string | null;
};
export type AcademicAudienceEnrollment = {
  id: string;
  studentId: string;
  classroomId: string;
  student: { userId: string | null };
  classroom: {
    sectionId: string;
    section: { gradeId: string; grade: { stageId: string } };
  };
};
export type AcademicAudienceGuardianLink = {
  guardianId: string;
  studentId: string;
  guardian: { userId: string | null; canReceiveNotifications: boolean | null };
};
export type AcademicAudienceStudentContext = {
  studentId: string;
  enrollmentId: string;
  studentUserId: string | null;
  classroomId: string;
  matchedTargetIds: string[];
};
export type AcademicAudienceGuardianContext = {
  guardianId: string;
  recipientUserId: string | null;
  studentId: string;
  enrollmentId: string;
  classroomId: string;
  canReceiveNotifications: boolean | null;
  matchedTargetIds: string[];
};

export function academicAudienceSubjectRequirements(
  targets: readonly AcademicAudienceTarget[],
  enrollments: readonly AcademicAudienceEnrollment[],
) {
  return {
    subjectIds: [
      ...new Set(
        targets.flatMap((target) =>
          target.subjectId ? [target.subjectId] : [],
        ),
      ),
    ],
    gradeIds: [
      ...new Set(enrollments.map((row) => row.classroom.section.gradeId)),
    ],
  };
}

function matchesScope(
  target: AcademicAudienceTarget,
  enrollment: AcademicAudienceEnrollment,
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
const union = (a: readonly string[], b: readonly string[]) =>
  [...new Set([...a, ...b])].sort();

/** Business identity is Enrollment; overlapping targets contribute a sorted union. */
export function matchAcademicAudienceStudents(
  targets: readonly AcademicAudienceTarget[],
  enrollments: readonly AcademicAudienceEnrollment[],
  taught: readonly { gradeId: string; subjectId: string }[],
): AcademicAudienceStudentContext[] {
  const taughtKeys = new Set(
    taught.map((row) => JSON.stringify([row.gradeId, row.subjectId])),
  );
  const students = new Map<string, AcademicAudienceStudentContext>();
  for (const enrollment of enrollments) {
    const matched = targets
      .filter(
        (target) =>
          matchesScope(target, enrollment) &&
          (!target.subjectId ||
            taughtKeys.has(
              JSON.stringify([
                enrollment.classroom.section.gradeId,
                target.subjectId,
              ]),
            )),
      )
      .map((target) => target.id);
    if (!matched.length) continue;
    students.set(enrollment.id, {
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
      classroomId: enrollment.classroomId,
      studentUserId: enrollment.student.userId,
      matchedTargetIds: union(
        students.get(enrollment.id)?.matchedTargetIds ?? [],
        matched,
      ),
    });
  }
  return [...students.values()].sort((a, b) =>
    a.enrollmentId.localeCompare(b.enrollmentId),
  );
}

/** A guardian account may own several distinct child/enrollment contexts. */
export function matchAcademicAudienceGuardians(
  students: readonly AcademicAudienceStudentContext[],
  links: readonly AcademicAudienceGuardianLink[],
): AcademicAudienceGuardianContext[] {
  const studentsById = new Map<string, AcademicAudienceStudentContext[]>();
  for (const student of students) {
    const contexts = studentsById.get(student.studentId) ?? [];
    contexts.push(student);
    studentsById.set(student.studentId, contexts);
  }
  const guardians = new Map<string, AcademicAudienceGuardianContext>();
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
        classroomId: student.classroomId,
        canReceiveNotifications: link.guardian.canReceiveNotifications,
        matchedTargetIds: union(
          guardians.get(key)?.matchedTargetIds ?? [],
          student.matchedTargetIds,
        ),
      });
    }
  }
  return [...guardians.values()].sort(
    (a, b) =>
      a.guardianId.localeCompare(b.guardianId) ||
      a.studentId.localeCompare(b.studentId) ||
      a.enrollmentId.localeCompare(b.enrollmentId),
  );
}
