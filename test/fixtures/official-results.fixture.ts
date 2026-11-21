import { randomUUID } from 'node:crypto';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';

export async function createResultsSchool(prisma: PrismaService) {
  const slug = `results-${randomUUID()}`;
  const organization = await prisma.organization.create({
    data: { name: 'Official Results Fixture', slug },
    select: { id: true },
  });
  const school = await prisma.school.create({
    data: { organizationId: organization.id, name: 'Results School', slug },
    select: { id: true, organizationId: true },
  });
  const actor = await prisma.user.create({
    data: {
      email: `${slug}@example.invalid`,
      firstName: 'Results',
      lastName: 'Administrator',
      userType: UserType.SCHOOL_USER,
    },
    select: { id: true, userType: true },
  });
  const role = await prisma.role.create({
    data: {
      schoolId: school.id,
      key: 'results-admin',
      name: 'Results Administrator',
    },
    select: { id: true },
  });
  const membership = await prisma.membership.create({
    data: {
      schoolId: school.id,
      organizationId: organization.id,
      userId: actor.id,
      userType: actor.userType,
      roleId: role.id,
    },
    select: { id: true },
  });
  const scope = {
    ...createRequestContext(),
    actor,
    activeMembership: {
      membershipId: membership.id,
      schoolId: school.id,
      organizationId: organization.id,
      roleId: role.id,
      permissions: [],
    },
  };
  const schoolId = school.id;
  const year = await prisma.academicYear.create({
    data: {
      schoolId,
      nameAr: '٢٠٢٦–٢٠٢٧',
      nameEn: '2026–2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
    },
    select: { id: true },
  });
  const term = await prisma.term.create({
    data: {
      schoolId,
      academicYearId: year.id,
      nameAr: 'الفصل الأول',
      nameEn: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-31'),
    },
    select: { id: true },
  });
  const nextTerm = await prisma.term.create({
    data: {
      schoolId,
      academicYearId: year.id,
      nameAr: 'الفصل الثاني',
      nameEn: 'Term 2',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-06-30'),
    },
    select: { id: true },
  });
  const stage = await prisma.stage.create({
    data: { schoolId, nameAr: 'ابتدائي', nameEn: 'Primary' },
    select: { id: true },
  });
  const grade = await prisma.grade.create({
    data: { schoolId, stageId: stage.id, nameAr: 'الرابع', nameEn: 'Grade 4' },
    select: { id: true },
  });
  const section = await prisma.section.create({
    data: { schoolId, gradeId: grade.id, nameAr: 'أ', nameEn: 'A' },
    select: { id: true },
  });
  const [classroom, otherClassroom] = await Promise.all(
    ['1', '2'].map((code) =>
      prisma.classroom.create({
        data: {
          schoolId,
          sectionId: section.id,
          nameAr: `فصل ${code}`,
          nameEn: `Class ${code}`,
        },
        select: { id: true },
      }),
    ),
  );
  const subject = await prisma.subject.create({
    data: { schoolId, nameAr: 'رياضيات', nameEn: 'Mathematics' },
    select: { id: true },
  });
  await prisma.subjectAllocation.create({
    data: {
      schoolId,
      academicYearId: year.id,
      termId: term.id,
      gradeId: grade.id,
      subjectId: subject.id,
      weeklyHours: 4,
    },
    select: { id: true },
  });

  return {
    school,
    actor,
    year,
    term,
    nextTerm,
    stage,
    grade,
    section,
    classroom,
    otherClassroom,
    subject,
    run: <T>(fn: () => T): T =>
      runWithRequestContext(structuredClone(scope), fn),
    addStudent: (firstName: string) =>
      prisma.student.create({
        data: {
          schoolId,
          organizationId: organization.id,
          firstName,
          lastName: 'Fixture',
        },
        select: { id: true },
      }),
  };
}

export function assertResultsTestDatabase(): void {
  if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL) {
    throw new Error(
      'Official Results integration tests need a disposable test database',
    );
  }
  const target = new URL(process.env.DATABASE_URL);
  if (
    !/^\/moazez_official_results_[a-z0-9_]+$/u.test(target.pathname) &&
    process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB !== '1' &&
    !(/^\/ci_[a-f0-9]{14}$/u.test(target.pathname) && process.env.CI === 'true')
  ) {
    throw new Error(
      'Use an isolated Official Results fixture or the repository CI harness',
    );
  }
}
