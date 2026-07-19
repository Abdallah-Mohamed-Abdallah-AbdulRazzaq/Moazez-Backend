import type { Prisma } from '@prisma/client';
import {
  classifyTeacherAllocationTermState,
  summarizeTeacherAllocationLifecycleCounts,
  type TeacherAllocationDependencyCounts,
  type TeacherAllocationLifecycleCounts,
  type TeacherAllocationLifecycleSummary,
} from '../domain/teacher-allocation-lifecycle-state';

const ALLOCATION_PAGE_SIZE = 500;

export async function classifyTeacherAllocationLifecycleStateInTransaction(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; teacherUserId: string; asOf: Date },
): Promise<TeacherAllocationLifecycleSummary> {
  const counts: TeacherAllocationLifecycleCounts = {
    future: 0,
    historical: 0,
    current_active: 0,
    current_inactive: 0,
    inconsistent: 0,
    invalid: 0,
  };
  const dependencyCounts: TeacherAllocationDependencyCounts = {
    timetableEntries: 0,
    lessonPlans: 0,
    homeworkAssignments: 0,
  };
  let cursor: string | undefined;

  for (;;) {
    const allocations = await transaction.teacherSubjectAllocation.findMany({
      where: {
        schoolId: input.schoolId,
        teacherUserId: input.teacherUserId,
      },
      orderBy: { id: 'asc' },
      take: ALLOCATION_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        term: {
          select: {
            startDate: true,
            endDate: true,
            isActive: true,
            deletedAt: true,
            academicYear: {
              select: { isActive: true, deletedAt: true },
            },
          },
        },
      },
    });
    if (allocations.length === 0) break;

    const dependencyRelevantIds: string[] = [];
    for (const allocation of allocations) {
      const state = classifyTeacherAllocationTermState(
        allocation.term,
        input.asOf,
      );
      counts[state] += 1;
      if (state !== 'historical') dependencyRelevantIds.push(allocation.id);
    }
    addDependencyCounts(
      dependencyCounts,
      await countDependenciesInTransaction(
        transaction,
        input.schoolId,
        dependencyRelevantIds,
      ),
    );
    cursor = allocations.at(-1)?.id;
    if (allocations.length < ALLOCATION_PAGE_SIZE) break;
  }

  return summarizeTeacherAllocationLifecycleCounts(counts, dependencyCounts);
}

function addDependencyCounts(
  target: TeacherAllocationDependencyCounts,
  page: TeacherAllocationDependencyCounts,
): void {
  target.timetableEntries += page.timetableEntries;
  target.lessonPlans += page.lessonPlans;
  target.homeworkAssignments += page.homeworkAssignments;
}

async function countDependenciesInTransaction(
  transaction: Prisma.TransactionClient,
  schoolId: string,
  allocationIds: string[],
) {
  if (allocationIds.length === 0) {
    return { timetableEntries: 0, lessonPlans: 0, homeworkAssignments: 0 };
  }
  const [timetableEntries, lessonPlans, homeworkAssignments] =
    await Promise.all([
      transaction.timetableEntry.count({
        where: {
          schoolId,
          teacherSubjectAllocationId: { in: allocationIds },
        },
      }),
      transaction.lessonPlan.count({
        where: {
          schoolId,
          teacherSubjectAllocationId: { in: allocationIds },
          deletedAt: null,
        },
      }),
      transaction.homeworkAssignment.count({
        where: {
          schoolId,
          teacherSubjectAllocationId: { in: allocationIds },
          deletedAt: null,
        },
      }),
    ]);
  return { timetableEntries, lessonPlans, homeworkAssignments };
}
