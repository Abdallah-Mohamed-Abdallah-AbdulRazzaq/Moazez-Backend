import { PrismaClient } from '@prisma/client';

const DEMO_SCHOOL_SLUG = 'moazez-academy';

const DEMO_YEAR = {
  nameAr: 'Demo Academic Year 2026/2027',
  nameEn: 'Demo Academic Year 2026/2027',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2027-06-30'),
  isActive: true,
};

const DEMO_TERM = {
  nameAr: 'Demo Term 1',
  nameEn: 'Demo Term 1',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-12-31'),
  isActive: true,
};

const DEMO_STAGE = {
  nameAr: 'Demo Primary Stage',
  nameEn: 'Demo Primary Stage',
  sortOrder: 1,
};

const DEMO_GRADE = {
  nameAr: 'Demo Grade 1',
  nameEn: 'Demo Grade 1',
  sortOrder: 1,
  capacity: 24,
};

const DEMO_SECTION = {
  nameAr: 'Demo Section A',
  nameEn: 'Demo Section A',
  sortOrder: 1,
  capacity: 24,
};

const DEMO_ROOM = {
  nameAr: 'Demo Room 101',
  nameEn: 'Demo Room 101',
  building: 'Main Building',
  floor: '1',
  capacity: 30,
  isActive: true,
};

const DEMO_CLASSROOM = {
  nameAr: 'Demo Classroom 1A',
  nameEn: 'Demo Classroom 1A',
  sortOrder: 1,
  capacity: 24,
};

const DEMO_SUBJECT = {
  nameAr: 'Demo Mathematics',
  nameEn: 'Demo Mathematics',
  code: 'DEMO-MATH-01',
  color: '#2563EB',
  isActive: true,
};

export async function seedDemoAcademics(prisma: PrismaClient): Promise<void> {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    return;
  }

  const school = await prisma.school.findFirst({
    where: { slug: DEMO_SCHOOL_SLUG },
    select: { id: true, name: true },
  });

  if (!school) {
    throw new Error(
      'Demo school not found. Run 04-demo-org.seed.ts before 05-demo-academics.seed.ts.',
    );
  }

  const academicYear = await ensureAcademicYear(prisma, school.id);
  await ensureTerm(prisma, school.id, academicYear.id);
  const stage = await ensureStage(prisma, school.id);
  const grade = await ensureGrade(prisma, school.id, stage.id);
  const section = await ensureSection(prisma, school.id, grade.id);
  const room = await ensureRoom(prisma, school.id);
  await ensureClassroom(prisma, school.id, section.id, room.id);
  await ensureSubject(prisma, school.id);

  console.log(
    `  OK seeded demo academics baseline for "${school.name}" (year, term, stage, grade, section, classroom, subject, room)`,
  );
}

async function ensureAcademicYear(prisma: PrismaClient, schoolId: string) {
  const existing = await prisma.academicYear.findFirst({
    where: {
      schoolId,
      nameEn: DEMO_YEAR.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.academicYear.update({
      where: { id: existing.id },
      data: {
        ...DEMO_YEAR,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.academicYear.create({
    data: {
      schoolId,
      ...DEMO_YEAR,
    },
    select: { id: true },
  });
}

async function ensureTerm(
  prisma: PrismaClient,
  schoolId: string,
  academicYearId: string,
) {
  const existing = await prisma.term.findFirst({
    where: {
      schoolId,
      academicYearId,
      nameEn: DEMO_TERM.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.term.update({
      where: { id: existing.id },
      data: {
        ...DEMO_TERM,
        academicYearId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.term.create({
    data: {
      schoolId,
      academicYearId,
      ...DEMO_TERM,
    },
    select: { id: true },
  });
}

async function ensureStage(prisma: PrismaClient, schoolId: string) {
  const existing = await prisma.stage.findFirst({
    where: {
      schoolId,
      nameEn: DEMO_STAGE.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.stage.update({
      where: { id: existing.id },
      data: {
        ...DEMO_STAGE,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.stage.create({
    data: {
      schoolId,
      ...DEMO_STAGE,
    },
    select: { id: true },
  });
}

async function ensureGrade(
  prisma: PrismaClient,
  schoolId: string,
  stageId: string,
) {
  const existing = await prisma.grade.findFirst({
    where: {
      schoolId,
      stageId,
      nameEn: DEMO_GRADE.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.grade.update({
      where: { id: existing.id },
      data: {
        ...DEMO_GRADE,
        stageId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.grade.create({
    data: {
      schoolId,
      stageId,
      ...DEMO_GRADE,
    },
    select: { id: true },
  });
}

async function ensureSection(
  prisma: PrismaClient,
  schoolId: string,
  gradeId: string,
) {
  const existing = await prisma.section.findFirst({
    where: {
      schoolId,
      gradeId,
      nameEn: DEMO_SECTION.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.section.update({
      where: { id: existing.id },
      data: {
        ...DEMO_SECTION,
        gradeId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.section.create({
    data: {
      schoolId,
      gradeId,
      ...DEMO_SECTION,
    },
    select: { id: true },
  });
}

async function ensureRoom(prisma: PrismaClient, schoolId: string) {
  const existing = await prisma.room.findFirst({
    where: {
      schoolId,
      nameEn: DEMO_ROOM.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.room.update({
      where: { id: existing.id },
      data: {
        ...DEMO_ROOM,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.room.create({
    data: {
      schoolId,
      ...DEMO_ROOM,
    },
    select: { id: true },
  });
}

async function ensureClassroom(
  prisma: PrismaClient,
  schoolId: string,
  sectionId: string,
  roomId: string,
) {
  const existing = await prisma.classroom.findFirst({
    where: {
      schoolId,
      sectionId,
      nameEn: DEMO_CLASSROOM.nameEn,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.classroom.update({
      where: { id: existing.id },
      data: {
        ...DEMO_CLASSROOM,
        sectionId,
        roomId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.classroom.create({
    data: {
      schoolId,
      sectionId,
      roomId,
      ...DEMO_CLASSROOM,
    },
    select: { id: true },
  });
}

async function ensureSubject(prisma: PrismaClient, schoolId: string) {
  const existing = await prisma.subject.findFirst({
    where: {
      schoolId,
      code: DEMO_SUBJECT.code,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.subject.update({
      where: { id: existing.id },
      data: {
        ...DEMO_SUBJECT,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return prisma.subject.create({
    data: {
      schoolId,
      ...DEMO_SUBJECT,
    },
    select: { id: true },
  });
}
