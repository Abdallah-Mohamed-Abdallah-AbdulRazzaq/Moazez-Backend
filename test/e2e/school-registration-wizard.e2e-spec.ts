import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, StudentEnrollmentStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('School registration wizard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    studentIds: new Set<string>(),
    guardianIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    classroomIds: new Set<string>(),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

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
    const studentIds = [...cleanupState.studentIds];
    const guardianIds = [...cleanupState.guardianIds];
    const enrollmentIds = [...cleanupState.enrollmentIds];

    if (studentIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          action: 'students.registration.create',
          resourceId: { in: studentIds },
        },
      });
    }
    if (enrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    }
    if (studentIds.length > 0) {
      await prisma.studentGuardian.deleteMany({
        where: { studentId: { in: studentIds } },
      });
    }
    if (guardianIds.length > 0) {
      await prisma.guardian.deleteMany({
        where: { id: { in: guardianIds } },
      });
    }
    if (studentIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: studentIds } },
      });
    }
    if (cleanupState.classroomIds.size > 0) {
      await prisma.classroom.deleteMany({
        where: { id: { in: [...cleanupState.classroomIds] } },
      });
    }
    if (cleanupState.sectionIds.size > 0) {
      await prisma.section.deleteMany({
        where: { id: { in: [...cleanupState.sectionIds] } },
      });
    }
    if (cleanupState.gradeIds.size > 0) {
      await prisma.grade.deleteMany({
        where: { id: { in: [...cleanupState.gradeIds] } },
      });
    }
    if (cleanupState.stageIds.size > 0) {
      await prisma.stage.deleteMany({
        where: { id: { in: [...cleanupState.stageIds] } },
      });
    }
    if (cleanupState.academicYearIds.size > 0) {
      await prisma.academicYear.deleteMany({
        where: { id: { in: [...cleanupState.academicYearIds] } },
      });
    }

    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createAcademicPlacement(label: string): Promise<{
    academicYearId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }> {
    const suffix = randomUUID().split('-')[0];
    const existingAcademicYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const academicYear =
      existingAcademicYear ??
      (await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `${label}-${suffix}-year-ar`,
          nameEn: `${label}-${suffix}-year`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));

    if (!existingAcademicYear) {
      cleanupState.academicYearIds.add(academicYear.id);
    }

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${label}-${suffix}-stage-ar`,
        nameEn: `${label}-${suffix}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `${label}-${suffix}-grade-ar`,
        nameEn: `${label}-${suffix}-grade`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: grade.id,
        nameAr: `${label}-${suffix}-section-ar`,
        nameEn: `${label}-${suffix}-section`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.sectionIds.add(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: section.id,
        nameAr: `${label}-${suffix}-classroom-ar`,
        nameEn: `${label}-${suffix}-classroom`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    return {
      academicYearId: academicYear.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  it('creates a school-side registration with student, guardian link, and active enrollment', async () => {
    const { accessToken } = await login();
    const placement = await createAcademicPlacement('registration-wizard');

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        student: {
          full_name_en: 'Wizard Layla Ali Hassan',
          full_name_ar: 'WizardAr LaylaAr AliAr HassanAr',
          dateOfBirth: '2016-02-14',
          gender: 'Female',
          nationality: 'Egyptian',
          contact: {
            address_line: '12 Nile Street',
            city: 'Cairo',
            district: 'Nasr City',
            student_phone: '+201001112233',
            student_email: 'wizard.layla@example.com',
          },
        },
        guardians: [
          {
            profile: {
              full_name: 'Mona Hassan',
              relation: 'Mother',
              phone_primary: '+201009998877',
              phone_secondary: '+201008887766',
              email: 'wizard.mona@example.com',
              national_id: '29901011234567',
              job_title: 'Engineer',
              workplace: 'Cairo Office',
              can_pickup: true,
              can_receive_notifications: true,
            },
          },
        ],
        enrollment: {
          academicYearId: placement.academicYearId,
          gradeId: placement.gradeId,
          sectionId: placement.sectionId,
          classroomId: placement.classroomId,
          enrollmentDate: '2026-09-01',
        },
      })
      .expect(201);

    cleanupState.studentIds.add(response.body.student.id);
    cleanupState.guardianIds.add(response.body.guardians[0].guardianId);
    cleanupState.enrollmentIds.add(response.body.enrollment.enrollmentId);

    expect(response.body).toEqual(
      expect.objectContaining({
        registrationId: response.body.student.id,
        student: expect.objectContaining({
          id: expect.any(String),
          student_id: null,
          full_name_en: 'Wizard Layla Ali Hassan',
          full_name_ar: 'WizardAr LaylaAr AliAr HassanAr',
          gender: 'Female',
          nationality: 'Egyptian',
          contact: {
            address_line: '12 Nile Street',
            city: 'Cairo',
            district: 'Nasr City',
            student_phone: '+201001112233',
            student_email: 'wizard.layla@example.com',
          },
        }),
        guardians: [
          expect.objectContaining({
            full_name: 'Mona Hassan',
            relation: 'mother',
            phone_secondary: '+201008887766',
            national_id: '29901011234567',
            job_title: 'Engineer',
            workplace: 'Cairo Office',
            is_primary: true,
            can_pickup: true,
            can_receive_notifications: true,
          }),
        ],
        enrollment: expect.objectContaining({
          studentId: response.body.student.id,
          academicYearId: placement.academicYearId,
          classroomId: placement.classroomId,
          enrollmentDate: '2026-09-01',
          status: 'active',
        }),
        parentAccounts: [
          expect.objectContaining({
            target: 'parent',
            mode: 'none',
            status: 'skipped',
          }),
        ],
        studentAccount: expect.objectContaining({
          target: 'student',
          mode: 'none',
          status: 'skipped',
        }),
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain('schoolId');
    expect(JSON.stringify(response.body)).not.toContain('organizationId');
    expect(JSON.stringify(response.body)).not.toContain('userId');
    expect(JSON.stringify(response.body)).not.toContain('membershipId');
    expect(JSON.stringify(response.body)).not.toContain('roleId');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('deletedAt');
    expect(JSON.stringify(response.body)).not.toContain('applicationId');

    const persistedStudent = await prisma.student.findUnique({
      where: { id: response.body.student.id },
      select: {
        schoolId: true,
        organizationId: true,
        firstName: true,
        fatherNameEn: true,
        lastName: true,
        gender: true,
        nationality: true,
        addressLine: true,
        studentEmail: true,
        userId: true,
        applicationId: true,
      },
    });
    expect(persistedStudent).toEqual({
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      firstName: 'Wizard',
      fatherNameEn: 'Layla',
      lastName: 'Hassan',
      gender: 'Female',
      nationality: 'Egyptian',
      addressLine: '12 Nile Street',
      studentEmail: 'wizard.layla@example.com',
      userId: null,
      applicationId: null,
    });

    const persistedGuardian = await prisma.guardian.findUnique({
      where: { id: response.body.guardians[0].guardianId },
      select: {
        phoneSecondary: true,
        nationalId: true,
        jobTitle: true,
        workplace: true,
        userId: true,
      },
    });
    expect(persistedGuardian).toEqual({
      phoneSecondary: '+201008887766',
      nationalId: '29901011234567',
      jobTitle: 'Engineer',
      workplace: 'Cairo Office',
      userId: null,
    });

    const persistedLink = await prisma.studentGuardian.findFirst({
      where: {
        studentId: response.body.student.id,
        guardianId: response.body.guardians[0].guardianId,
      },
      select: { isPrimary: true },
    });
    expect(persistedLink).toEqual({ isPrimary: true });

    const persistedEnrollment = await prisma.enrollment.findUnique({
      where: { id: response.body.enrollment.enrollmentId },
      select: {
        schoolId: true,
        studentId: true,
        academicYearId: true,
        classroomId: true,
        status: true,
      },
    });
    expect(persistedEnrollment).toEqual({
      schoolId: demoSchoolId,
      studentId: response.body.student.id,
      academicYearId: placement.academicYearId,
      classroomId: placement.classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
    });

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'students.registration.create',
        resourceId: response.body.student.id,
      },
      select: { module: true, resourceType: true, after: true },
    });
    expect(auditLog).toEqual(
      expect.objectContaining({
        module: 'students',
        resourceType: 'registration',
        after: expect.objectContaining({
          studentId: response.body.student.id,
          guardianCount: 1,
          primaryGuardianCount: 1,
          enrollmentId: response.body.enrollment.enrollmentId,
          parentAccountsCreatedCount: 0,
          parentAccountsLinkedCount: 0,
          studentAccountCreated: false,
          studentAccountLinked: false,
        }),
      }),
    );
    expect(JSON.stringify(auditLog)).not.toContain('29901011234567');
    expect(JSON.stringify(auditLog)).not.toContain('MZ-');
  });
});
