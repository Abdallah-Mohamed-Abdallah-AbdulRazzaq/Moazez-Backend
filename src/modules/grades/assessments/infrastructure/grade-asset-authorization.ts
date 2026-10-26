import { Prisma, UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
} from '../../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { ownedAllocationWhere } from '../../../academics/teacher-allocation/domain/owned-allocation';
import { requireGradesScope } from '../../grades-context';
import {
  assertQuestionStructureMutable,
  assertQuestionBasedAssessment,
} from '../domain/grade-question-domain';
import type {
  GradeAssetActor,
  GradeAssetResource,
} from '../domain/grade-asset';
import { isGradeAssetStudent } from '../domain/grade-asset';
import {
  assertGradeLiveMutationPermission,
  lockGradeAssessmentMutation,
  assertGradeAssessmentAccess,
} from './grades-resource-access';

const absent = () => new NotFoundDomainException();
/** Read scope and mutation ownership are intentionally distinct. */
export async function authorizeGradeAssets(
  tx: Prisma.TransactionClient,
  gate: TeacherAllocationOperationalWriteGate,
  actor: GradeAssetActor,
  input: GradeAssetResource,
  write = false,
  managedBinding = false,
  questionAuthoring = false,
) {
  const scope = requireGradesScope();
  const ctx = getRequestContext();
  if (
    !ctx?.activeMembership ||
    ctx.bypass.bypassSchoolScope ||
    ctx.bypass.includeSoftDeleted ||
    (actor.surface === 'core' &&
      scope.userType !== UserType.SCHOOL_USER &&
      scope.userType !== UserType.ORGANIZATION_USER) ||
    (actor.surface === 'teacher' && scope.userType !== UserType.TEACHER) ||
    (isGradeAssetStudent(actor) &&
      (scope.userType !== UserType.STUDENT || write))
  )
    throw absent();
  const permission = isGradeAssetStudent(actor)
    ? 'grades.assessments.view'
    : `grades.${input.questionId || questionAuthoring ? 'questions' : 'assessments'}.${write ? 'manage' : 'view'}`;
  await assertGradeLiveMutationPermission(tx, permission);
  if (managedBinding)
    await assertGradeLiveMutationPermission(tx, 'grades.questions.manage');
  if (actor.surface === 'teacher' && write) {
    // Match existing Grades upload lock order. Fence all owned allocations in
    // stable order before the shared broad-read helper locks those same rows.
    const allocations = await tx.teacherSubjectAllocation.findMany({
      where: ownedAllocationWhere(scope.actorId),
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!allocations.some((allocation) => allocation.id === actor.classId))
      throw absent();
    try {
      await gate.lock(tx, {
        schoolId: scope.schoolId,
        allocationIds: allocations.map((allocation) => allocation.id),
        expectedTeacherUserId: scope.actorId,
      });
    } catch (error) {
      if (error instanceof TeacherAllocationOperationalWriteGateError)
        throw absent();
      throw error;
    }
  }
  if (write) await lockGradeAssessmentMutation(tx, input.assessmentId);
  else if (
    actor.surface === 'student-exams' ||
    actor.surface === 'student-grades'
  )
    await actor.authorize(tx, input.assessmentId);
  else await assertGradeAssessmentAccess(tx, input.assessmentId);
  // Lock academic parents so retirement and term changes serialize with a mutation.
  if (write) {
    const live = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT a.id FROM grade_assessments a
    JOIN terms t ON t.id = a.term_id AND t.school_id = a.school_id AND t.academic_year_id = a.academic_year_id
    JOIN subjects s ON s.id = a.subject_id AND s.school_id = a.school_id
    JOIN academic_years y ON y.id = a.academic_year_id AND y.school_id = a.school_id
    WHERE a.id = ${input.assessmentId}::uuid AND a.school_id = ${scope.schoolId}::uuid AND a.deleted_at IS NULL
      AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND s.is_active = true AND y.deleted_at IS NULL
    FOR SHARE OF t, s, y`;
    if (!live.length) throw absent();
  }
  const assessment = await tx.gradeAssessment.findFirst({
    where: {
      id: input.assessmentId,
      schoolId: scope.schoolId,
      deletedAt: null,
    },
    include: { term: true, _count: { select: { submissions: true } } },
  });
  if (!assessment) throw absent();
  if (actor.surface === 'teacher') {
    if (write)
      await lockGradeTeacherAcademicHierarchy(
        tx,
        scope.schoolId,
        actor.classId,
      );
    const allocation = await tx.teacherSubjectAllocation.findFirst({
      where: {
        AND: [{ id: actor.classId }, ownedAllocationWhere(scope.actorId)],
      },
      include: {
        term: true,
        classroom: { include: { section: { include: { grade: true } } } },
      },
    });
    if (
      !allocation ||
      allocation.termId !== assessment.termId ||
      allocation.subjectId !== assessment.subjectId ||
      allocation.term.academicYearId !== assessment.academicYearId
    )
      throw absent();
    const scopes = {
      SCHOOL: scope.schoolId,
      STAGE: allocation.classroom.section.grade.stageId,
      GRADE: allocation.classroom.section.gradeId,
      SECTION: allocation.classroom.sectionId,
      CLASSROOM: allocation.classroomId,
    };
    if (
      scopes[assessment.scopeType] !== assessment.scopeKey ||
      (write &&
        (assessment.scopeType !== 'CLASSROOM' ||
          assessment.createdById !== scope.actorId))
    )
      throw absent();
  }
  if (write)
    assertQuestionStructureMutable({
      assessment,
      term: assessment.term,
      submissionCount: assessment._count.submissions,
    });
  if (questionAuthoring) assertQuestionBasedAssessment(assessment);
  if (input.questionId) {
    if (!write && assessment.deliveryMode !== 'QUESTION_BASED') throw absent();
    assertQuestionBasedAssessment(assessment);
    if (write)
      await tx.$queryRaw`SELECT id FROM grade_assessment_questions WHERE id = ${input.questionId}::uuid
     AND assessment_id = ${input.assessmentId}::uuid AND school_id = ${scope.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
    if (
      !(await tx.gradeAssessmentQuestion.findFirst({
        where: {
          id: input.questionId,
          assessmentId: input.assessmentId,
          deletedAt: null,
        },
        select: { id: true },
      }))
    )
      throw absent();
  }
  return { scope, assessment };
}

/** Hold the live classroom hierarchy through the final Teacher write. */
export async function lockGradeTeacherAcademicHierarchy(
  tx: Prisma.TransactionClient,
  schoolId: string,
  allocationId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT a.id FROM teacher_subject_allocations a
  JOIN classrooms c ON c.id=a.classroom_id AND c.school_id=a.school_id
  JOIN sections se ON se.id=c.section_id AND se.school_id=a.school_id
  JOIN grades g ON g.id=se.grade_id AND g.school_id=a.school_id
  JOIN stages st ON st.id=g.stage_id AND st.school_id=a.school_id
  WHERE a.id=${allocationId}::uuid AND a.school_id=${schoolId}::uuid
    AND c.deleted_at IS NULL AND se.deleted_at IS NULL AND g.deleted_at IS NULL AND st.deleted_at IS NULL
  FOR SHARE OF c,se,g,st`;
  if (!rows.length) throw absent();
}
