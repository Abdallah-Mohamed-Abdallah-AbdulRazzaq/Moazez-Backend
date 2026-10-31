import {
  GradeScopeType,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ownedAllocationWhere } from '../../../academics/teacher-allocation/domain/owned-allocation';
import { requireGradesScope } from '../../grades-context';
import { assertQuestionStructureMutable } from '../domain/grade-question-domain';

type Client = Prisma.TransactionClient;

/** Existing permission and membership revalidated at the final write boundary. */
export async function assertGradeLiveMutationPermission(
  client: Client,
  permission: string,
): Promise<void> {
  const scope = requireGradesScope();
  const membershipId = getRequestContext()?.activeMembership?.membershipId;
  if (!membershipId) throw new NotFoundDomainException();
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT m.id FROM memberships m
    JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id
    JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
    JOIN schools s ON s.id = ${scope.schoolId}::uuid AND s.organization_id = m.organization_id
    JOIN organizations o ON o.id = s.organization_id
    WHERE m.id = ${membershipId}::uuid AND m.user_id = ${scope.actorId}::uuid
      AND m.organization_id = ${scope.organizationId}::uuid AND m.role_id = ${scope.roleId}::uuid
      AND m.user_type::text = ${scope.userType} AND u.user_type::text = ${scope.userType}
      AND (m.school_id = s.id OR (m.school_id IS NULL AND m.user_type = 'ORGANIZATION_USER'))
      AND m.status = 'ACTIVE' AND m.ended_at IS NULL AND m.deleted_at IS NULL
      AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND r.deleted_at IS NULL
      AND (r.school_id IS NULL OR r.school_id = s.id) AND p.code = ${permission}
      AND s.deleted_at IS NULL AND o.deleted_at IS NULL AND s.status = 'ACTIVE' AND o.status = 'ACTIVE'
    FOR SHARE OF m, u, r, rp, p, s, o`;
  if (!rows.length) throw new NotFoundDomainException();
}

/** All question writers and publication serialize on the same assessment row. */
export async function lockGradeAssessmentMutation(
  client: Client,
  assessmentId: string,
): Promise<void> {
  await assertGradeAssessmentAccess(client, assessmentId);
  const { schoolId } = requireGradesScope();
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM grade_assessments WHERE id = ${assessmentId}::uuid
      AND school_id = ${schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  if (!rows.length) throw new NotFoundDomainException();
}

/** Queries live allocations through the same scoped client/transaction as the resource. */
async function teacherScopes(client: Client) {
  const scope = requireGradesScope();
  if (!('$transaction' in client)) {
    // Hold the allocation rows through a write, so a concurrent reassignment
    // cannot revoke ownership between the authorization query and mutation.
    await client.$queryRaw(Prisma.sql`
      SELECT id FROM teacher_subject_allocations
      WHERE school_id = ${scope.schoolId}::uuid
        AND teacher_user_id = ${scope.actorId}::uuid
      ORDER BY id
      FOR SHARE
    `);
  }
  return client.teacherSubjectAllocation.findMany({
    where: ownedAllocationWhere(scope.actorId),
    select: {
      termId: true,
      subjectId: true,
      classroomId: true,
      term: { select: { academicYearId: true } },
      classroom: {
        select: {
          sectionId: true,
          section: {
            select: { gradeId: true, grade: { select: { stageId: true } } },
          },
        },
      },
    },
  });
}

function assessmentScope(
  allocation: Awaited<ReturnType<typeof teacherScopes>>[number],
): Prisma.GradeAssessmentWhereInput {
  const { schoolId } = requireGradesScope();
  return {
    termId: allocation.termId,
    academicYearId: allocation.term.academicYearId,
    subjectId: allocation.subjectId,
    deletedAt: null,
    OR: [
      { scopeType: GradeScopeType.SCHOOL, scopeKey: schoolId },
      {
        scopeType: GradeScopeType.STAGE,
        scopeKey: allocation.classroom.section.grade.stageId,
      },
      {
        scopeType: GradeScopeType.GRADE,
        scopeKey: allocation.classroom.section.gradeId,
      },
      {
        scopeType: GradeScopeType.SECTION,
        scopeKey: allocation.classroom.sectionId,
      },
      { scopeType: GradeScopeType.CLASSROOM, scopeKey: allocation.classroomId },
    ],
  };
}

export async function gradeAssessmentAccessWhere(
  client: Client,
  studentAdapterRead = false,
): Promise<Prisma.GradeAssessmentWhereInput> {
  const { userType } = requireGradesScope();
  if (
    userType === UserType.SCHOOL_USER ||
    userType === UserType.ORGANIZATION_USER
  )
    return {};
  if (userType === UserType.TEACHER) {
    const allocations = await teacherScopes(client);
    return allocations.length
      ? { OR: allocations.map(assessmentScope) }
      : { id: { in: [] } };
  }
  // Student writes use the dedicated adapter, which resolves a visible exam and enrollment.
  // This core read is shared by that adapter; questions/authoring remain management-only.
  if (userType === UserType.STUDENT && studentAdapterRead)
    return { deletedAt: null };
  return { id: { in: [] } };
}

export async function gradeQuestionAccessWhere(
  client: Client,
): Promise<Prisma.GradeAssessmentQuestionWhereInput> {
  const { userType } = requireGradesScope();
  if (userType === UserType.STUDENT || userType === UserType.PARENT)
    return { id: { in: [] } };
  return {
    assessment: {
      ...(await gradeAssessmentAccessWhere(client)),
      deletedAt: null,
    },
  };
}

export async function gradeSubmissionAccessWhere(
  client: Client,
): Promise<Prisma.GradeSubmissionWhereInput> {
  const { userType, actorId } = requireGradesScope();
  if (
    userType === UserType.SCHOOL_USER ||
    userType === UserType.ORGANIZATION_USER
  )
    return {};
  const student = { deletedAt: null, status: StudentStatus.ACTIVE };
  const enrollment = {
    deletedAt: null,
    status: StudentEnrollmentStatus.ACTIVE,
    endedAt: null,
  };
  if (userType === UserType.STUDENT) {
    return {
      student: { ...student, userId: actorId },
      enrollment,
      assessment: { deletedAt: null },
    };
  }
  if (userType !== UserType.TEACHER) return { id: { in: [] } };
  const allocations = await teacherScopes(client);
  if (allocations.length === 0) return { id: { in: [] } };
  return {
    student,
    OR: allocations.map((allocation) => ({
      assessment: assessmentScope(allocation),
      enrollment: {
        ...enrollment,
        classroomId: allocation.classroomId,
        academicYearId: allocation.term.academicYearId,
        OR: [{ termId: allocation.termId }, { termId: null }],
      },
    })),
  };
}

export async function assertGradeAssessmentAccess(
  client: Client,
  assessmentId: string,
): Promise<void> {
  const assessment = await client.gradeAssessment.findFirst({
    where: {
      AND: [{ id: assessmentId }, await gradeAssessmentAccessWhere(client)],
    },
    select: { id: true },
  });
  if (!assessment)
    throw new NotFoundDomainException('Grade assessment not found');
}

export async function assertGradeQuestionAccess(
  client: Client,
  questionId: string,
): Promise<void> {
  const question = await client.gradeAssessmentQuestion.findFirst({
    where: {
      AND: [{ id: questionId }, await gradeQuestionAccessWhere(client)],
    },
    select: { assessmentId: true },
  });
  if (!question)
    throw new NotFoundDomainException('Grade assessment question not found');
  await assertGradeQuestionStructureWrite(client, question.assessmentId);
  if (
    !(await client.gradeAssessmentQuestion.findFirst({
      where: { id: questionId },
      select: { id: true },
    }))
  )
    throw new NotFoundDomainException('Grade assessment question not found');
}

export async function assertGradeQuestionStructureWrite(
  client: Client,
  assessmentId: string,
): Promise<void> {
  await assertGradeLiveMutationPermission(client, 'grades.questions.manage');
  await lockGradeAssessmentMutation(client, assessmentId);
  const assessment = await client.gradeAssessment.findFirst({
    where: { id: assessmentId },
    select: {
      id: true,
      deliveryMode: true,
      approvalStatus: true,
      lockedAt: true,
      term: { select: { id: true, academicYearId: true, isActive: true } },
      _count: { select: { submissions: true } },
    },
  });
  if (!assessment)
    throw new NotFoundDomainException('Grade assessment not found');
  assertQuestionStructureMutable({
    assessment,
    term: assessment.term,
    submissionCount: assessment._count.submissions,
  });
}

export async function assertGradeSubmissionAccess(
  client: Client,
  submissionId: string,
): Promise<void> {
  const submission = await client.gradeSubmission.findFirst({
    where: {
      AND: [{ id: submissionId }, await gradeSubmissionAccessWhere(client)],
    },
    select: { id: true },
  });
  if (!submission)
    throw new NotFoundDomainException('Grade submission not found');
}

export function canReadGradeAuthoring(): boolean {
  const userType = getRequestContext()?.actor?.userType;
  if (
    userType !== UserType.SCHOOL_USER &&
    userType !== UserType.ORGANIZATION_USER
  )
    return false;
  return (
    getRequestContext()?.activeMembership?.permissions.includes(
      'grades.questions.manage',
    ) === true
  );
}

export function gradeStudentAccessWhere(): Prisma.StudentWhereInput {
  const { actorId, userType } = requireGradesScope();
  return userType === UserType.STUDENT ? { userId: actorId } : {};
}

export async function gradeEnrollmentAccessWhere(
  client: Client,
  assessmentId: string,
): Promise<Prisma.EnrollmentWhereInput> {
  const { userType } = requireGradesScope();
  if (userType === UserType.STUDENT)
    return { student: gradeStudentAccessWhere() };
  if (userType !== UserType.TEACHER) return {};
  const allocations = await teacherScopes(client);
  const assessment = await client.gradeAssessment.findFirst({
    where: { id: assessmentId, OR: allocations.map(assessmentScope) },
    select: {
      termId: true,
      academicYearId: true,
      subjectId: true,
      scopeType: true,
      scopeKey: true,
    },
  });
  if (!assessment) return { id: { in: [] } };
  const classroomIds = allocations
    .filter((allocation) => {
      const filter = assessmentScope(allocation);
      return (
        allocation.termId === assessment.termId &&
        allocation.subjectId === assessment.subjectId &&
        (
          filter.OR as Array<{ scopeType: GradeScopeType; scopeKey: string }>
        ).some(
          (scope) =>
            scope.scopeType === assessment.scopeType &&
            scope.scopeKey === assessment.scopeKey,
        )
      );
    })
    .map((allocation) => allocation.classroomId);
  return {
    classroomId: { in: classroomIds },
    academicYearId: assessment.academicYearId,
  };
}

/** GradeItem ownership uses live enrollments, not its optional historical link. */
export async function gradeItemAccessWhere(
  client: Client,
): Promise<Prisma.GradeItemWhereInput> {
  const { userType, actorId } = requireGradesScope();
  if (
    userType === UserType.SCHOOL_USER ||
    userType === UserType.ORGANIZATION_USER
  )
    return {};
  const student = { deletedAt: null, status: StudentStatus.ACTIVE };
  const enrollment = {
    deletedAt: null,
    status: StudentEnrollmentStatus.ACTIVE,
    endedAt: null,
  };
  if (userType === UserType.STUDENT) {
    return {
      student: {
        ...student,
        userId: actorId,
        enrollments: { some: enrollment },
      },
      assessment: { deletedAt: null },
    };
  }
  if (userType !== UserType.TEACHER) return { id: { in: [] } };
  const allocations = await teacherScopes(client);
  if (allocations.length === 0) return { id: { in: [] } };
  return {
    student,
    OR: allocations.map((allocation) => ({
      assessment: assessmentScope(allocation),
      student: {
        enrollments: {
          some: {
            ...enrollment,
            classroomId: allocation.classroomId,
            academicYearId: allocation.term.academicYearId,
            OR: [{ termId: allocation.termId }, { termId: null }],
          },
        },
      },
    })),
  };
}

export async function assertGradeItemWriteAccess(
  client: Client,
  input: {
    assessmentId: string;
    studentId: string;
    enrollmentId: string | null;
  },
): Promise<void> {
  await assertGradeAssessmentAccess(client, input.assessmentId);
  const enrollment = await client.enrollment.findFirst({
    where: {
      id: input.enrollmentId ?? undefined,
      studentId: input.studentId,
      deletedAt: null,
      status: StudentEnrollmentStatus.ACTIVE,
      endedAt: null,
      AND: [await gradeEnrollmentAccessWhere(client, input.assessmentId)],
    },
    select: { id: true },
  });
  if (!enrollment) throw new NotFoundDomainException('Grade item not found');
}

/** Limits the gradebook roster before virtual missing cells are composed. */
export async function gradeRosterAccessWhere(
  client: Client,
  context: { termId?: string; subjectId?: string } = {},
): Promise<Prisma.EnrollmentWhereInput> {
  const { userType } = requireGradesScope();
  if (
    userType === UserType.SCHOOL_USER ||
    userType === UserType.ORGANIZATION_USER
  )
    return {};
  if (userType === UserType.STUDENT)
    return { student: gradeStudentAccessWhere() };
  if (userType !== UserType.TEACHER) return { id: { in: [] } };
  const allocations = (await teacherScopes(client)).filter(
    (allocation) =>
      (!context.termId || allocation.termId === context.termId) &&
      (!context.subjectId || allocation.subjectId === context.subjectId),
  );
  return {
    classroomId: {
      in: allocations.map((allocation) => allocation.classroomId),
    },
  };
}
