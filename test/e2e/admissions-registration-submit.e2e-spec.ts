import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  InterviewStatus,
  LeadChannel,
  LeadStatus,
  PlacementTestStatus,
  PrismaClient,
  StudentEnrollmentStatus,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('Accepted application registration submit (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoAdminUserId: string;

  const cleanupState = {
    leadIds: new Set<string>(),
    applicationIds: new Set<string>(),
    placementTestIds: new Set<string>(),
    interviewIds: new Set<string>(),
    decisionIds: new Set<string>(),
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

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo school admin not found - run `npm run seed` first.');
    }
    demoAdminUserId = demoAdmin.id;

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
    const applicationIds = [...cleanupState.applicationIds];
    const studentIds = [...cleanupState.studentIds];
    const guardianIds = [...cleanupState.guardianIds];
    const enrollmentIds = [...cleanupState.enrollmentIds];

    if (prisma) {
      if (applicationIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            action: 'admissions.application.register',
            resourceId: { in: applicationIds },
          },
        });
      }
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
      if (cleanupState.decisionIds.size > 0) {
        await prisma.admissionDecision.deleteMany({
          where: { id: { in: [...cleanupState.decisionIds] } },
        });
      }
      if (cleanupState.interviewIds.size > 0) {
        await prisma.interview.deleteMany({
          where: { id: { in: [...cleanupState.interviewIds] } },
        });
      }
      if (cleanupState.placementTestIds.size > 0) {
        await prisma.placementTest.deleteMany({
          where: { id: { in: [...cleanupState.placementTestIds] } },
        });
      }
      if (applicationIds.length > 0) {
        await prisma.application.deleteMany({
          where: { id: { in: applicationIds } },
        });
      }
      if (cleanupState.leadIds.size > 0) {
        await prisma.lead.deleteMany({
          where: { id: { in: [...cleanupState.leadIds] } },
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
    }

    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return response.body.accessToken;
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

  async function createApplicationFixture(params?: {
    accepted?: boolean;
  }): Promise<{ applicationId: string }> {
    const suffix = randomUUID().split('-')[0];
    const lead = await prisma.lead.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        studentName: `Submit Student ${suffix}`,
        primaryContactName: `Submit Parent ${suffix}`,
        phone: `+2010${suffix.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`,
        email: `submit.${suffix}@example.com`,
        channel: LeadChannel.REFERRAL,
        status: LeadStatus.NEW,
      },
      select: { id: true, studentName: true },
    });
    cleanupState.leadIds.add(lead.id);

    const application = await prisma.application.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        leadId: lead.id,
        studentName: lead.studentName,
        requestedAcademicYearId: null,
        requestedGradeId: null,
        source: AdmissionApplicationSource.REFERRAL,
        status: params?.accepted
          ? AdmissionApplicationStatus.ACCEPTED
          : AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-04-21T08:30:00.000Z'),
      },
      select: { id: true },
    });
    cleanupState.applicationIds.add(application.id);

    const placementTest = await prisma.placementTest.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: application.id,
        type: 'Placement',
        scheduledAt: new Date('2026-04-22T10:00:00.000Z'),
        score: 88.5,
        result: 'Passed',
        status: PlacementTestStatus.COMPLETED,
      },
      select: { id: true },
    });
    cleanupState.placementTestIds.add(placementTest.id);

    const interview = await prisma.interview.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: application.id,
        scheduledAt: new Date('2026-04-23T11:00:00.000Z'),
        interviewerUserId: demoAdminUserId,
        status: InterviewStatus.COMPLETED,
        notes: 'Completed interview',
      },
      select: { id: true },
    });
    cleanupState.interviewIds.add(interview.id);

    if (params?.accepted) {
      const decision = await prisma.admissionDecision.create({
        data: {
          schoolId: demoSchoolId,
          applicationId: application.id,
          decision: AdmissionDecisionType.ACCEPT,
          reason: 'Accepted for registration submit',
          decidedByUserId: demoAdminUserId,
          decidedAt: new Date('2026-04-24T09:00:00.000Z'),
        },
        select: { id: true },
      });
      cleanupState.decisionIds.add(decision.id);
    }

    return { applicationId: application.id };
  }

  function validPayload(placement: {
    academicYearId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }): Record<string, unknown> {
    return {
      student: {
        full_name_en: 'Accepted Submit Student',
        dateOfBirth: '2017-03-10',
        gender: 'Female',
        nationality: 'Egyptian',
      },
      guardians: [
        {
          profile: {
            full_name: 'Accepted Submit Guardian',
            relation: 'Mother',
            phone_primary: '+201009998877',
          },
          relationship: { is_primary: true },
        },
      ],
      enrollment: {
        academicYearId: placement.academicYearId,
        gradeId: placement.gradeId,
        sectionId: placement.sectionId,
        classroomId: placement.classroomId,
        enrollmentDate: '2026-09-01',
      },
    };
  }

  it('registers an accepted application and is idempotent on repeated submit', async () => {
    const accessToken = await login();
    const placement = await createAcademicPlacement('accepted-register-submit');
    const { applicationId } = await createApplicationFixture({
      accepted: true,
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/register`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validPayload(placement))
      .expect(200);

    cleanupState.studentIds.add(response.body.registration.student.id);
    cleanupState.guardianIds.add(response.body.registration.guardians[0].guardianId);
    cleanupState.enrollmentIds.add(
      response.body.registration.enrollment.enrollmentId,
    );

    expect(response.body).toEqual(
      expect.objectContaining({
        applicationId,
        registered: true,
        alreadyRegistered: false,
        registration: expect.objectContaining({
          student: expect.objectContaining({
            id: expect.any(String),
            full_name_en: 'Accepted Submit Student',
          }),
          enrollment: expect.objectContaining({
            enrollmentId: expect.any(String),
            studentId: response.body.registration.student.id,
            classroomId: placement.classroomId,
            status: 'active',
          }),
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
    expect(JSON.stringify(response.body)).not.toContain('applicantUserId');

    const persistedStudent = await prisma.student.findUniqueOrThrow({
      where: { id: response.body.registration.student.id },
      select: { applicationId: true, schoolId: true },
    });
    expect(persistedStudent).toEqual({
      applicationId,
      schoolId: demoSchoolId,
    });

    const second = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/register`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validPayload(placement))
      .expect(200);

    expect(second.body).toEqual(
      expect.objectContaining({
        applicationId,
        registered: true,
        alreadyRegistered: true,
        registration: {
          student: expect.objectContaining({
            id: response.body.registration.student.id,
          }),
          enrollment: expect.objectContaining({
            enrollmentId: response.body.registration.enrollment.enrollmentId,
          }),
        },
        warnings: ['application.already_registered'],
      }),
    );
    await expect(
      prisma.student.count({
        where: { schoolId: demoSchoolId, applicationId },
      }),
    ).resolves.toBe(1);
  });

  it('keeps registration handoff preview read-only', async () => {
    const accessToken = await login();
    const { applicationId } = await createApplicationFixture({
      accepted: true,
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/registration-handoff`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(
      prisma.student.count({
        where: { schoolId: demoSchoolId, applicationId },
      }),
    ).resolves.toBe(0);
  });

  it('blocks source-bound registration for a non-accepted application', async () => {
    const accessToken = await login();
    const placement = await createAcademicPlacement('accepted-register-blocked');
    const { applicationId } = await createApplicationFixture({
      accepted: false,
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/register`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validPayload(placement))
      .expect(409);

    expect(response.body?.error?.code).toBe(
      'admissions.application.not_accepted',
    );
    await expect(
      prisma.student.count({
        where: { schoolId: demoSchoolId, applicationId },
      }),
    ).resolves.toBe(0);
  });
});
