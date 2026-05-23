import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_TEACHER_EMAIL = 'teacher-a@academics-tenancy.moazez.local';

const TENANT_B_ORG_SLUG = 'academics-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'academics-tenancy-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@academics-tenancy.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'AcademicsB123!';
const TENANT_B_TEACHER_EMAIL = 'teacher-b@academics-tenancy.moazez.local';

const VIEWER_EMAIL = 'viewer@academics-tenancy.moazez.local';
const VIEWER_PASSWORD = 'Viewer123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

function expectNoTenantIds(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('organizationId');
}

describe('Academics tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  let tenantBSchoolId: string;
  let tenantBUserId: string;
  let tenantBTeacherUserId: string;
  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBStageId: string;
  let tenantBGradeId: string;
  let tenantBSectionId: string;
  let tenantBClassroomId: string;
  let tenantBSubjectId: string;
  let tenantBRoomId: string;
  let tenantBAllocationId: string;
  let tenantBTimetableConfigId: string;
  let tenantBTimetablePeriodId: string;
  let tenantBTimetableEntryId: string;

  let demoViewerRoleId: string;
  let demoViewerUserId: string;
  let demoYearId: string;
  let demoTermId: string;
  let demoStageId: string;
  let demoGradeId: string;
  let demoSectionId: string;
  let demoClassroomId: string;
  let demoSubjectId: string;
  let demoMismatchSubjectId: string;
  let demoRoomId: string;
  let demoTeacherUserId: string;
  let demoAllocationId: string;
  let demoTimetableConfigId: string | undefined;
  let demoTimetablePeriodId: string | undefined;
  let demoTimetableEntryId: string | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found — run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const [schoolAdminRole, teacherRole, structureViewPermission] =
      await Promise.all([
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.role.findFirst({
          where: { key: 'teacher', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'academics.structure.view' },
          select: { id: true },
        }),
      ]);

    if (!schoolAdminRole || !teacherRole || !structureViewPermission) {
      throw new Error(
        'Required roles or permissions missing — run `npm run seed` first.',
      );
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found.');
    }

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const demoYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        nameEn: 'Academics Scope A 2026/2027',
      },
      select: { id: true },
    });
    if (demoYear) {
      demoYearId = demoYear.id;
    } else {
      const createdYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: 'Academics Scope A 2026/2027',
          nameEn: 'Academics Scope A 2026/2027',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-06-30'),
          isActive: false,
        },
      });
      demoYearId = createdYear.id;
    }

    const demoTerm = await prisma.term.findFirst({
      where: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        nameEn: 'Academics Scope A Timetable Term 1',
      },
      select: { id: true },
    });
    if (demoTerm) {
      demoTermId = demoTerm.id;
      await prisma.term.update({
        where: { id: demoTerm.id },
        data: { isActive: true },
      });
    } else {
      const createdTerm = await prisma.term.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId: demoYearId,
          nameAr: 'Academics Scope A Timetable Term 1',
          nameEn: 'Academics Scope A Timetable Term 1',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-31'),
          isActive: true,
        },
      });
      demoTermId = createdTerm.id;
    }

    const demoStage = await prisma.stage.findFirst({
      where: {
        schoolId: demoSchoolId,
        nameEn: 'Academics Scope A Timetable Stage',
      },
      select: { id: true },
    });
    if (demoStage) {
      demoStageId = demoStage.id;
    } else {
      const createdStage = await prisma.stage.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: 'Academics Scope A Timetable Stage',
          nameEn: 'Academics Scope A Timetable Stage',
          sortOrder: 1,
        },
      });
      demoStageId = createdStage.id;
    }

    const demoGrade = await prisma.grade.findFirst({
      where: {
        schoolId: demoSchoolId,
        stageId: demoStageId,
        nameEn: 'Academics Scope A Timetable Grade',
      },
      select: { id: true },
    });
    if (demoGrade) {
      demoGradeId = demoGrade.id;
    } else {
      const createdGrade = await prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: demoStageId,
          nameAr: 'Academics Scope A Timetable Grade',
          nameEn: 'Academics Scope A Timetable Grade',
          sortOrder: 1,
          capacity: 24,
        },
      });
      demoGradeId = createdGrade.id;
    }

    const demoSection = await prisma.section.findFirst({
      where: {
        schoolId: demoSchoolId,
        gradeId: demoGradeId,
        nameEn: 'Academics Scope A Timetable Section',
      },
      select: { id: true },
    });
    if (demoSection) {
      demoSectionId = demoSection.id;
    } else {
      const createdSection = await prisma.section.create({
        data: {
          schoolId: demoSchoolId,
          gradeId: demoGradeId,
          nameAr: 'Academics Scope A Timetable Section',
          nameEn: 'Academics Scope A Timetable Section',
          sortOrder: 1,
          capacity: 24,
        },
      });
      demoSectionId = createdSection.id;
    }

    const demoRoom = await prisma.room.findFirst({
      where: {
        schoolId: demoSchoolId,
        nameEn: 'Academics Scope A Timetable Room',
      },
      select: { id: true },
    });
    if (demoRoom) {
      demoRoomId = demoRoom.id;
    } else {
      const createdRoom = await prisma.room.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: 'Academics Scope A Timetable Room',
          nameEn: 'Academics Scope A Timetable Room',
          building: 'Block A',
          floor: '1',
          isActive: true,
        },
      });
      demoRoomId = createdRoom.id;
    }

    const demoClassroom = await prisma.classroom.findFirst({
      where: {
        schoolId: demoSchoolId,
        sectionId: demoSectionId,
        nameEn: 'Academics Scope A Timetable Classroom',
      },
      select: { id: true },
    });
    if (demoClassroom) {
      demoClassroomId = demoClassroom.id;
    } else {
      const createdClassroom = await prisma.classroom.create({
        data: {
          schoolId: demoSchoolId,
          sectionId: demoSectionId,
          nameAr: 'Academics Scope A Timetable Classroom',
          nameEn: 'Academics Scope A Timetable Classroom',
          sortOrder: 1,
          capacity: 24,
        },
      });
      demoClassroomId = createdClassroom.id;
    }

    const demoSubject = await prisma.subject.findFirst({
      where: {
        schoolId: demoSchoolId,
        nameEn: 'Academics Scope A Timetable Subject',
      },
      select: { id: true },
    });
    if (demoSubject) {
      demoSubjectId = demoSubject.id;
    } else {
      const createdSubject = await prisma.subject.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: 'Academics Scope A Timetable Subject',
          nameEn: 'Academics Scope A Timetable Subject',
          code: 'ACAD-A-TT',
          isActive: true,
        },
      });
      demoSubjectId = createdSubject.id;
    }

    const demoMismatchSubject = await prisma.subject.findFirst({
      where: {
        schoolId: demoSchoolId,
        nameEn: 'Academics Scope A Timetable Mismatch Subject',
      },
      select: { id: true },
    });
    if (demoMismatchSubject) {
      demoMismatchSubjectId = demoMismatchSubject.id;
    } else {
      const createdSubject = await prisma.subject.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: 'Academics Scope A Timetable Mismatch Subject',
          nameEn: 'Academics Scope A Timetable Mismatch Subject',
          code: 'ACAD-A-TT-MISMATCH',
          isActive: true,
        },
      });
      demoMismatchSubjectId = createdSubject.id;
    }

    const demoTeacher = await prisma.user.upsert({
      where: { email: DEMO_TEACHER_EMAIL },
      update: {
        firstName: 'Demo',
        lastName: 'Teacher A',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: DEMO_TEACHER_EMAIL,
        firstName: 'Demo',
        lastName: 'Teacher A',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    });
    demoTeacherUserId = demoTeacher.id;

    const existingDemoTeacherMembership = await prisma.membership.findFirst({
      where: {
        userId: demoTeacher.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: teacherRole.id,
      },
      select: { id: true },
    });
    if (existingDemoTeacherMembership) {
      await prisma.membership.update({
        where: { id: existingDemoTeacherMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.TEACHER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: demoTeacher.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: teacherRole.id,
          userType: UserType.TEACHER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const demoAllocation = await prisma.teacherSubjectAllocation.findFirst({
      where: {
        schoolId: demoSchoolId,
        teacherUserId: demoTeacher.id,
        subjectId: demoSubjectId,
        classroomId: demoClassroomId,
        termId: demoTermId,
      },
      select: { id: true },
    });
    if (demoAllocation) {
      demoAllocationId = demoAllocation.id;
    } else {
      const createdAllocation = await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: demoSchoolId,
          teacherUserId: demoTeacher.id,
          subjectId: demoSubjectId,
          classroomId: demoClassroomId,
          termId: demoTermId,
        },
      });
      demoAllocationId = createdAllocation.id;
    }

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Academics Tenancy Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });

    const schoolB = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: orgB.id,
          slug: TENANT_B_SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: orgB.id,
        slug: TENANT_B_SCHOOL_SLUG,
        name: 'Academics Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const passwordHashB = await argon2.hash(
      TENANT_B_ADMIN_PASSWORD,
      ARGON2_OPTIONS,
    );

    const adminB = await prisma.user.upsert({
      where: { email: TENANT_B_ADMIN_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: passwordHashB,
      },
      create: {
        email: TENANT_B_ADMIN_EMAIL,
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: passwordHashB,
      },
    });
    tenantBUserId = adminB.id;

    const existingMembershipB = await prisma.membership.findFirst({
      where: {
        userId: adminB.id,
        organizationId: orgB.id,
        schoolId: schoolB.id,
        roleId: schoolAdminRole.id,
      },
      select: { id: true },
    });

    if (existingMembershipB) {
      await prisma.membership.update({
        where: { id: existingMembershipB.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: adminB.id,
          organizationId: orgB.id,
          schoolId: schoolB.id,
          roleId: schoolAdminRole.id,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const yearB = await prisma.academicYear.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B 2026/2027',
      },
      select: { id: true },
    });
    if (yearB) {
      tenantBYearId = yearB.id;
    } else {
      const createdYear = await prisma.academicYear.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B 2026/2027',
          nameEn: 'Academics Scope B 2026/2027',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-06-30'),
          isActive: true,
        },
      });
      tenantBYearId = createdYear.id;
    }

    const termB = await prisma.term.findFirst({
      where: {
        schoolId: schoolB.id,
        academicYearId: tenantBYearId,
        nameEn: 'Academics Scope B Term 1',
      },
      select: { id: true },
    });
    if (termB) {
      tenantBTermId = termB.id;
    } else {
      const createdTerm = await prisma.term.create({
        data: {
          schoolId: schoolB.id,
          academicYearId: tenantBYearId,
          nameAr: 'Academics Scope B Term 1',
          nameEn: 'Academics Scope B Term 1',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-31'),
          isActive: true,
        },
      });
      tenantBTermId = createdTerm.id;
    }

    const stageB = await prisma.stage.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B Stage',
      },
      select: { id: true },
    });
    if (stageB) {
      tenantBStageId = stageB.id;
    } else {
      const createdStage = await prisma.stage.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B Stage',
          nameEn: 'Academics Scope B Stage',
          sortOrder: 1,
        },
      });
      tenantBStageId = createdStage.id;
    }

    const subjectB = await prisma.subject.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B Subject',
      },
      select: { id: true },
    });
    if (subjectB) {
      tenantBSubjectId = subjectB.id;
    } else {
      const createdSubject = await prisma.subject.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B Subject',
          nameEn: 'Academics Scope B Subject',
          code: 'ACAD-B-SUBJECT',
          isActive: true,
        },
      });
      tenantBSubjectId = createdSubject.id;
    }

    const gradeB = await prisma.grade.findFirst({
      where: {
        schoolId: schoolB.id,
        stageId: tenantBStageId,
        nameEn: 'Academics Scope B Grade',
      },
      select: { id: true },
    });
    if (gradeB) {
      tenantBGradeId = gradeB.id;
    } else {
      const createdGrade = await prisma.grade.create({
        data: {
          schoolId: schoolB.id,
          stageId: tenantBStageId,
          nameAr: 'Academics Scope B Grade',
          nameEn: 'Academics Scope B Grade',
          sortOrder: 1,
          capacity: 24,
        },
      });
      tenantBGradeId = createdGrade.id;
    }

    const sectionB = await prisma.section.findFirst({
      where: {
        schoolId: schoolB.id,
        gradeId: tenantBGradeId,
        nameEn: 'Academics Scope B Section',
      },
      select: { id: true },
    });
    if (sectionB) {
      tenantBSectionId = sectionB.id;
    } else {
      const createdSection = await prisma.section.create({
        data: {
          schoolId: schoolB.id,
          gradeId: tenantBGradeId,
          nameAr: 'Academics Scope B Section',
          nameEn: 'Academics Scope B Section',
          sortOrder: 1,
          capacity: 24,
        },
      });
      tenantBSectionId = createdSection.id;
    }

    const roomB = await prisma.room.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B Room',
      },
      select: { id: true },
    });
    if (roomB) {
      tenantBRoomId = roomB.id;
    } else {
      const createdRoom = await prisma.room.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B Room',
          nameEn: 'Academics Scope B Room',
          building: 'Block B',
          floor: '1',
          isActive: true,
        },
      });
      tenantBRoomId = createdRoom.id;
    }

    const classroomB = await prisma.classroom.findFirst({
      where: {
        schoolId: schoolB.id,
        sectionId: tenantBSectionId,
        nameEn: 'Academics Scope B Classroom',
      },
      select: { id: true },
    });
    if (classroomB) {
      tenantBClassroomId = classroomB.id;
    } else {
      const createdClassroom = await prisma.classroom.create({
        data: {
          schoolId: schoolB.id,
          sectionId: tenantBSectionId,
          nameAr: 'Academics Scope B Classroom',
          nameEn: 'Academics Scope B Classroom',
          sortOrder: 1,
          capacity: 24,
        },
      });
      tenantBClassroomId = createdClassroom.id;
    }

    const teacherB = await prisma.user.upsert({
      where: { email: TENANT_B_TEACHER_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Teacher B',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: TENANT_B_TEACHER_EMAIL,
        firstName: 'Tenant',
        lastName: 'Teacher B',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    });
    tenantBTeacherUserId = teacherB.id;

    const existingTeacherMembershipB = await prisma.membership.findFirst({
      where: {
        userId: teacherB.id,
        organizationId: orgB.id,
        schoolId: schoolB.id,
        roleId: teacherRole.id,
      },
      select: { id: true },
    });

    if (existingTeacherMembershipB) {
      await prisma.membership.update({
        where: { id: existingTeacherMembershipB.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.TEACHER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: teacherB.id,
          organizationId: orgB.id,
          schoolId: schoolB.id,
          roleId: teacherRole.id,
          userType: UserType.TEACHER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const allocationB = await prisma.teacherSubjectAllocation.findFirst({
      where: {
        schoolId: schoolB.id,
        teacherUserId: teacherB.id,
        subjectId: tenantBSubjectId,
        classroomId: tenantBClassroomId,
        termId: tenantBTermId,
      },
      select: { id: true },
    });
    if (allocationB) {
      tenantBAllocationId = allocationB.id;
    } else {
      const createdAllocation = await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: schoolB.id,
          teacherUserId: teacherB.id,
          subjectId: tenantBSubjectId,
          classroomId: tenantBClassroomId,
          termId: tenantBTermId,
        },
      });
      tenantBAllocationId = createdAllocation.id;
    }

    const timetableConfigB = await prisma.timetableConfig.findFirst({
      where: {
        schoolId: schoolB.id,
        termId: tenantBTermId,
        scopeType: TimetableScopeType.TERM,
        scopeKey: `term:${tenantBTermId}`,
      },
      select: { id: true },
    });
    if (timetableConfigB) {
      tenantBTimetableConfigId = timetableConfigB.id;
    } else {
      const createdConfig = await prisma.timetableConfig.create({
        data: {
          schoolId: schoolB.id,
          academicYearId: tenantBYearId,
          termId: tenantBTermId,
          name: 'Academics Scope B Timetable',
          weekStartDay: 0,
          activeDays: [0, 1, 2, 3, 4],
          scopeType: TimetableScopeType.TERM,
          scopeKey: `term:${tenantBTermId}`,
          status: TimetableConfigStatus.DRAFT,
        },
      });
      tenantBTimetableConfigId = createdConfig.id;
    }

    const timetablePeriodB = await prisma.timetablePeriod.findFirst({
      where: {
        schoolId: schoolB.id,
        timetableConfigId: tenantBTimetableConfigId,
        periodIndex: 1,
      },
      select: { id: true },
    });
    if (timetablePeriodB) {
      tenantBTimetablePeriodId = timetablePeriodB.id;
    } else {
      const createdPeriod = await prisma.timetablePeriod.create({
        data: {
          schoolId: schoolB.id,
          timetableConfigId: tenantBTimetableConfigId,
          periodIndex: 1,
          label: 'Tenant B Period 1',
          startTime: '08:00',
          endTime: '08:45',
          type: TimetablePeriodType.CLASS,
          isInstructional: true,
        },
      });
      tenantBTimetablePeriodId = createdPeriod.id;
    }

    const timetableEntryB = await prisma.timetableEntry.findFirst({
      where: {
        schoolId: schoolB.id,
        timetableConfigId: tenantBTimetableConfigId,
        periodId: tenantBTimetablePeriodId,
        dayOfWeek: 0,
        classroomId: tenantBClassroomId,
      },
      select: { id: true },
    });
    if (timetableEntryB) {
      tenantBTimetableEntryId = timetableEntryB.id;
    } else {
      const createdEntry = await prisma.timetableEntry.create({
        data: {
          schoolId: schoolB.id,
          academicYearId: tenantBYearId,
          termId: tenantBTermId,
          timetableConfigId: tenantBTimetableConfigId,
          periodId: tenantBTimetablePeriodId,
          dayOfWeek: 0,
          gradeId: tenantBGradeId,
          sectionId: tenantBSectionId,
          classroomId: tenantBClassroomId,
          subjectId: tenantBSubjectId,
          teacherUserId: tenantBTeacherUserId,
          teacherSubjectAllocationId: tenantBAllocationId,
          roomId: tenantBRoomId,
          notes: 'Tenant B timetable entry',
          status: TimetableEntryStatus.DRAFT,
        },
      });
      tenantBTimetableEntryId = createdEntry.id;
    }

    const viewerRole = await prisma.role.findFirst({
      where: {
        schoolId: demoSchoolId,
        key: 'academics_structure_viewer',
      },
      select: { id: true },
    });

    if (viewerRole) {
      demoViewerRoleId = viewerRole.id;
      await prisma.rolePermission.deleteMany({
        where: { roleId: viewerRole.id },
      });
    } else {
      const createdRole = await prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: 'academics_structure_viewer',
          name: 'Academics Structure Viewer',
          description: 'Can view academic structure only',
          isSystem: false,
        },
      });
      demoViewerRoleId = createdRole.id;
    }

    await prisma.rolePermission.create({
      data: {
        roleId: demoViewerRoleId,
        permissionId: structureViewPermission.id,
      },
    });

    const viewerPasswordHash = await argon2.hash(
      VIEWER_PASSWORD,
      ARGON2_OPTIONS,
    );
    const viewerUser = await prisma.user.upsert({
      where: { email: VIEWER_EMAIL },
      update: {
        firstName: 'Academics',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: viewerPasswordHash,
      },
      create: {
        email: VIEWER_EMAIL,
        firstName: 'Academics',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: viewerPasswordHash,
      },
    });
    demoViewerUserId = viewerUser.id;

    const existingViewerMembership = await prisma.membership.findFirst({
      where: {
        userId: viewerUser.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: demoViewerRoleId,
      },
      select: { id: true },
    });

    if (existingViewerMembership) {
      await prisma.membership.update({
        where: { id: existingViewerMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: viewerUser.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: demoViewerRoleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      if (demoTimetableConfigId) {
        await prisma.timetableConfig.deleteMany({
          where: { id: demoTimetableConfigId },
        });
      }
      if (tenantBTimetableConfigId) {
        await prisma.timetableConfig.deleteMany({
          where: { id: tenantBTimetableConfigId },
        });
      }
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: demoAllocationId },
      });
      await prisma.classroom.deleteMany({ where: { id: demoClassroomId } });
      await prisma.section.deleteMany({ where: { id: demoSectionId } });
      await prisma.grade.deleteMany({ where: { id: demoGradeId } });
      await prisma.subject.deleteMany({ where: { id: demoSubjectId } });
      await prisma.subject.deleteMany({ where: { id: demoMismatchSubjectId } });
      await prisma.room.deleteMany({ where: { id: demoRoomId } });
      await prisma.stage.deleteMany({ where: { id: demoStageId } });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: tenantBAllocationId },
      });
      await prisma.classroom.deleteMany({ where: { id: tenantBClassroomId } });
      await prisma.section.deleteMany({ where: { id: tenantBSectionId } });
      await prisma.grade.deleteMany({ where: { id: tenantBGradeId } });
      await prisma.subject.deleteMany({ where: { id: tenantBSubjectId } });
      await prisma.room.deleteMany({ where: { id: tenantBRoomId } });
      await prisma.stage.deleteMany({ where: { id: tenantBStageId } });
      await prisma.term.deleteMany({ where: { id: tenantBTermId } });
      await prisma.academicYear.deleteMany({
        where: {
          id: tenantBYearId,
        },
      });
      await prisma.membership.deleteMany({
        where: { userId: demoViewerUserId },
      });
      await prisma.user.deleteMany({ where: { id: demoViewerUserId } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: demoViewerRoleId },
      });
      await prisma.role.deleteMany({ where: { id: demoViewerRoleId } });
      await prisma.membership.deleteMany({
        where: { userId: demoTeacherUserId },
      });
      await prisma.user.deleteMany({ where: { id: demoTeacherUserId } });
      await prisma.membership.deleteMany({
        where: { userId: tenantBTeacherUserId },
      });
      await prisma.user.deleteMany({ where: { id: tenantBTeacherUserId } });
      await prisma.membership.deleteMany({ where: { userId: tenantBUserId } });
      await prisma.user.deleteMany({ where: { id: tenantBUserId } });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({
        where: { slug: TENANT_B_ORG_SLUG },
      });
      await prisma.term.deleteMany({
        where: {
          schoolId: demoSchoolId,
          nameEn: 'Academics Scope A Timetable Term 1',
          id: demoTermId,
        },
      });
      await prisma.academicYear.deleteMany({
        where: {
          schoolId: demoSchoolId,
          nameEn: 'Academics Scope A 2026/2027',
          id: demoYearId,
        },
      });
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('school A years endpoint returns only school A data', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/structure/years`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const names = response.body.items.map(
      (item: { nameEn: string }) => item.nameEn,
    );
    expect(names).toContain('Academics Scope A 2026/2027');
    expect(names).not.toContain('Academics Scope B 2026/2027');
  });

  it('returns 404 when school A requests a school B tree context by year and term id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/structure/tree?yearId=${tenantBYearId}&termId=${tenantBTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to update a school B stage by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/structure/stages/${tenantBStageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 for a protected academics mutation when the permission is missing', async () => {
    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/structure/stages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameEn: 'Viewer Forbidden Stage',
        nameAr: 'Viewer Forbidden Stage',
        sortOrder: 1,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 404 when school A tries to update a school B subject by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/subjects/${tenantBSubjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to delete a school B subject by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/subjects/${tenantBSubjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to update a school B room by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/rooms/${tenantBRoomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to delete a school B room by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/rooms/${tenantBRoomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when a view-only user attempts a room mutation', async () => {
    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/rooms`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameEn: 'Viewer Forbidden Room',
        nameAr: 'Viewer Forbidden Room',
        capacity: 12,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 404 when school A requests allocations using school B filters', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/allocations?termId=${tenantBTermId}&classroomId=${tenantBClassroomId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to delete a school B allocation by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/allocations/${tenantBAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when a view-only user attempts an allocation mutation', async () => {
    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        teacherUserId: tenantBTeacherUserId,
        subjectId: tenantBSubjectId,
        classroomId: tenantBClassroomId,
        termId: tenantBTermId,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('school A admin can manage own timetable config and periods without tenant ids in responses', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const configResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: demoYearId,
        termId: demoTermId,
        name: 'Academics Scope A Timetable',
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
      })
      .expect(200);

    demoTimetableConfigId = configResponse.body.data.id;
    expect(configResponse.body.data.status).toBe('draft');
    expect(JSON.stringify(configResponse.body)).not.toContain('schoolId');
    expect(JSON.stringify(configResponse.body)).not.toContain('organizationId');

    const periodResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/periods`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        index: 1,
        label: 'Period 1',
        startTime: '08:00',
        endTime: '08:45',
      })
      .expect(201);

    demoTimetablePeriodId = periodResponse.body.id;
    expect(periodResponse.body.timeRange).toBe('08:00 - 08:45');
    expect(JSON.stringify(periodResponse.body)).not.toContain('schoolId');
    expect(JSON.stringify(periodResponse.body)).not.toContain('organizationId');

    const periodsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/periods?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(periodsResponse.body.items).toHaveLength(1);
    expect(periodsResponse.body.items[0].id).toBe(demoTimetablePeriodId);

    const previewResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/preview?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(previewResponse.body.config.id).toBe(demoTimetableConfigId);
    expect(previewResponse.body.entries).toEqual([]);
    expect(previewResponse.body.conflicts).toEqual([]);
    expect(previewResponse.body.publishReadiness).toMatchObject({
      canPublish: false,
      blockingReasons: expect.arrayContaining([
        expect.objectContaining({ code: 'no_entries' }),
      ]),
    });
    expectNoTenantIds(previewResponse.body);

    const conflictsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/conflicts?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(conflictsResponse.body.items).toEqual([]);
    expectNoTenantIds(conflictsResponse.body);

    const publicationResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/publication?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(publicationResponse.body).toMatchObject({
      timetableConfigId: demoTimetableConfigId,
      status: 'draft',
      revision: 0,
      canPublish: false,
      summary: {
        periodsCount: 1,
        entriesCount: 0,
      },
    });
    expectNoTenantIds(publicationResponse.body);
  });

  it('school A admin can create/list/detail/update/delete own timetable entries without tenant ids', async () => {
    if (!demoTimetableConfigId || !demoTimetablePeriodId) {
      throw new Error(
        'Demo timetable config and period must be created first.',
      );
    }

    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 0,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
        roomId: demoRoomId,
        notes: 'Entry from security test',
      })
      .expect(201);

    demoTimetableEntryId = createResponse.body.id;
    expect(createResponse.body.subject.id).toBe(demoSubjectId);
    expect(createResponse.body.teacher.userId).toBe(demoTeacherUserId);
    expect(createResponse.body.classroom.id).toBe(demoClassroomId);
    expect(createResponse.body.room.id).toBe(demoRoomId);
    expect(JSON.stringify(createResponse.body)).not.toContain('schoolId');
    expect(JSON.stringify(createResponse.body)).not.toContain('organizationId');

    const listResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/entries?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listResponse.body.items.map((item: { id: string }) => item.id),
    ).toContain(demoTimetableEntryId);
    expect(JSON.stringify(listResponse.body)).not.toContain('schoolId');
    expect(JSON.stringify(listResponse.body)).not.toContain('organizationId');

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(demoTimetableEntryId);
        expect(JSON.stringify(response.body)).not.toContain('schoolId');
        expect(JSON.stringify(response.body)).not.toContain('organizationId');
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Updated security test entry', roomId: null })
      .expect(200)
      .expect((response) => {
        expect(response.body.notes).toBe('Updated security test entry');
        expect(response.body.room).toBeNull();
      });

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });

    const readableEntryResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 0,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
        notes: 'Readable timetable entry',
      })
      .expect(201);
    demoTimetableEntryId = readableEntryResponse.body.id;
  });

  it('rejects update and delete for non-draft timetable entries without tenant ids', async () => {
    if (!demoTimetableEntryId) {
      throw new Error('Demo timetable entry must be created first.');
    }

    await prisma.timetableEntry.update({
      where: { id: demoTimetableEntryId },
      data: { status: TimetableEntryStatus.ACTIVE },
    });

    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Should Not Mutate Active Entry' })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.entry_not_mutable',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.entry_not_mutable',
        );
        expectNoTenantIds(response.body);
      });
  });

  it('returns safe 404 for cross-school timetable config and period ids', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/periods?timetableConfigId=${tenantBTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.config_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/publication?timetableConfigId=${tenantBTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.config_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timetableConfigId: tenantBTimetableConfigId })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.config_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/periods/${tenantBTimetablePeriodId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Should Not Work' })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.period_not_found',
        );
        expectNoTenantIds(response.body);
      });
  });

  it('returns safe errors for cross-school timetable entry and related ids', async () => {
    if (!demoTimetableConfigId || !demoTimetablePeriodId) {
      throw new Error(
        'Demo timetable config and period must be created first.',
      );
    }

    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${tenantBTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.entry_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${tenantBTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Should Not Work' })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.entry_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${tenantBTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.entry_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: tenantBTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 1,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.config_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: tenantBTimetablePeriodId,
        dayOfWeek: 1,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.period_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 1,
        classroomId: tenantBClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.classroom_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 1,
        classroomId: demoClassroomId,
        subjectId: demoMismatchSubjectId,
        teacherSubjectAllocationId: demoAllocationId,
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.allocation_mismatch',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 1,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: tenantBAllocationId,
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.allocation_not_found',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 1,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
        roomId: tenantBRoomId,
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.room_not_found',
        );
        expectNoTenantIds(response.body);
      });
  });

  it('returns 401 for unauthenticated timetable reads', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/periods?timetableConfigId=${tenantBTimetableConfigId}`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/entries?timetableConfigId=${tenantBTimetableConfigId}`,
      )
      .expect(401);
  });

  it('view-only user can read timetable entries but cannot mutate them', async () => {
    if (
      !demoTimetableConfigId ||
      !demoTimetablePeriodId ||
      !demoTimetableEntryId
    ) {
      throw new Error('Demo timetable entry must be created first.');
    }

    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/entries?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((item: { id: string }) => item.id),
        ).toContain(demoTimetableEntryId);
        expect(JSON.stringify(response.body)).not.toContain('schoolId');
        expect(JSON.stringify(response.body)).not.toContain('organizationId');
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(demoTimetableEntryId);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/publication?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.timetableConfigId).toBe(demoTimetableConfigId);
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/preview?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.config.id).toBe(demoTimetableConfigId);
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/conflicts?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(Array.isArray(response.body.items)).toBe(true);
        expectNoTenantIds(response.body);
      });

    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: demoYearId,
        termId: demoTermId,
        name: 'Viewer Forbidden Timetable',
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        periodId: demoTimetablePeriodId,
        dayOfWeek: 2,
        classroomId: demoClassroomId,
        teacherSubjectAllocationId: demoAllocationId,
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Viewer cannot update' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timetableConfigId: demoTimetableConfigId })
      .expect(403);
  });

  it('school admin can publish own timetable and published configs are locked', async () => {
    if (
      !demoTimetableConfigId ||
      !demoTimetablePeriodId ||
      !demoTimetableEntryId
    ) {
      throw new Error('Demo timetable entry must be created first.');
    }

    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const attendanceSessionCountBefore = await prisma.attendanceSession.count({
      where: { schoolId: demoSchoolId },
    });

    const publishResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timetableConfigId: demoTimetableConfigId })
      .expect(200);

    expect(publishResponse.body).toMatchObject({
      timetableConfigId: demoTimetableConfigId,
      status: 'published',
      revision: 1,
      publishedByUserId: expect.any(String),
      summary: {
        periodsCount: 1,
        entriesCount: 1,
        conflictsCount: 0,
      },
    });
    expectNoTenantIds(publishResponse.body);

    const [config, entry, publication, attendanceSessionCountAfter] =
      await Promise.all([
        prisma.timetableConfig.findUnique({
          where: { id: demoTimetableConfigId },
          select: { status: true },
        }),
        prisma.timetableEntry.findUnique({
          where: { id: demoTimetableEntryId },
          select: { status: true },
        }),
        prisma.timetablePublication.findFirst({
          where: { timetableConfigId: demoTimetableConfigId },
          select: {
            status: true,
            revision: true,
            publishedAt: true,
            publishedByUserId: true,
          },
        }),
        prisma.attendanceSession.count({ where: { schoolId: demoSchoolId } }),
      ]);

    expect(config?.status).toBe(TimetableConfigStatus.ACTIVE);
    expect(entry?.status).toBe(TimetableEntryStatus.ACTIVE);
    expect(publication).toMatchObject({
      status: 'PUBLISHED',
      revision: 1,
      publishedByUserId: expect.any(String),
    });
    expect(publication?.publishedAt).toBeTruthy();
    expect(attendanceSessionCountAfter).toBe(attendanceSessionCountBefore);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/timetable/publication?timetableConfigId=${demoTimetableConfigId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('published');
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: demoYearId,
        termId: demoTermId,
        name: 'Should Not Mutate Published Timetable',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.published_locked',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/periods`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timetableConfigId: demoTimetableConfigId,
        index: 2,
        label: 'Should Not Mutate',
        startTime: '09:00',
        endTime: '09:45',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.published_locked',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${demoTimetableEntryId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Should Not Mutate Published Entry' })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.published_locked',
        );
        expectNoTenantIds(response.body);
      });
  });

  it('keeps school admin actors out of Parent App schedule routes', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${tenantBUserId}/schedule/today`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${tenantBUserId}/schedule/weekly`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('does not add Homework, Pickup, or app notification routes from timetable work', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/homeworks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/pickup`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${tenantBUserId}/pickup`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/notifications`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
