/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- the minimal Prisma service test double returns and inspects adapter-specific Jest mocks. */
import { LessonContentPublicationStatus } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { ParentChildLessonsReadAdapter } from '../../src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter';
import { StudentLessonsReadAdapter } from '../../src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter';
import type { StudentAppContext } from '../../src/modules/student-app/shared/student-app.types';
import { TeacherLessonPreparationReadAdapter } from '../../src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter';

describe('Lesson content publication read-adapter predicates', () => {
  it('selects PUBLISHED content only for Student lesson detail', async () => {
    const { prisma, findMany } = prismaMock();
    const adapter = new StudentLessonsReadAdapter(prisma, {} as never);

    await adapter.listItemsForStudentOnDate({
      context: studentContext(),
      date: new Date('2026-09-10T00:00:00.000Z'),
    });

    expect(contentWhere(findMany)).toMatchObject({
      deletedAt: null,
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
    });
  });

  it('selects PUBLISHED content only for Parent child lesson detail', async () => {
    const { prisma, findMany } = prismaMock();
    const adapter = new ParentChildLessonsReadAdapter(prisma, {} as never);

    await adapter.listItemsForChildOnDate({
      child: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      date: new Date('2026-09-10T00:00:00.000Z'),
    });

    expect(contentWhere(findMany)).toMatchObject({
      deletedAt: null,
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
    });
  });

  it('selects DRAFT and PUBLISHED content for the exact-owned Teacher view', async () => {
    const { prisma, findMany } = prismaMock();
    const adapter = new TeacherLessonPreparationReadAdapter(
      prisma,
      {} as never,
    );

    await adapter.listItemsForTeacherOnDate({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      allocationIds: ['allocation-1'],
      date: new Date('2026-09-10T00:00:00.000Z'),
    });

    expect(contentWhere(findMany)).toMatchObject({
      deletedAt: null,
      publicationStatus: {
        in: [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.PUBLISHED,
        ],
      },
    });
  });
});

function prismaMock(): {
  prisma: PrismaService;
  findMany: jest.Mock;
} {
  const findMany = jest.fn().mockResolvedValue([]);
  return {
    prisma: {
      scoped: { lessonPlanItem: { findMany } },
    } as unknown as PrismaService,
    findMany,
  };
}

function contentWhere(findMany: jest.Mock): Record<string, unknown> {
  return findMany.mock.calls[0][0].select.lesson.select.contentItems.where;
}

function studentContext(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}
