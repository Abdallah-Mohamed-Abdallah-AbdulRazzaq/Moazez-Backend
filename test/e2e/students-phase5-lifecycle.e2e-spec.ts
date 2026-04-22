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

describe('Students Phase 5 lifecycle flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let originalDemoAcademicYearId: string | null = null;
  let originalDemoAcademicYearWasActive = false;

  const cleanupState = {
    studentIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    classroomIds: new Set<string>(),
    sectionIds: new Set<string>(),
    gradeIds: new Set<string>(),
    stageIds: new Set<string>(),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true },
    });

    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }

    demoSchoolId = demoSchool.id;

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
    if (prisma) {
      const studentIds = [...cleanupState.studentIds];

      if (studentIds.length > 0) {
        const enrollmentIds = (
          await prisma.enrollment.findMany({
            where: { studentId: { in: studentIds } },
            select: { id: true },
          })
        ).map((enrollment) => enrollment.id);

        if (enrollmentIds.length > 0) {
          await prisma.auditLog.deleteMany({
            where: {
              action: {
                in: [
                  'students.enrollment.create',
                  'students.enrollment.transfer',
                  'students.enrollment.withdraw',
                  'students.enrollment.promote',
                ],
              },
              resourceId: { in: enrollmentIds },
            },
          });
        }

        await prisma.enrollment.deleteMany({
          where: { studentId: { in: studentIds } },
        });
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

      if (originalDemoAcademicYearId) {
        await prisma.academicYear.updateMany({
          where: { id: originalDemoAcademicYearId },
          data: { isActive: originalDemoAcademicYearWasActive },
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

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createStudent(
    accessToken: string,
    fullName: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        full_name_en: fullName,
        dateOfBirth: '2015-05-10',
      })
      .expect(201);

    cleanupState.studentIds.add(response.body.id);
    return response.body.id;
  }

  async function createEnrollment(
    accessToken: string,
    params: {
      studentId: string;
      academicYearId: string;
      classroomId: string;
      enrollmentDate: string;
    },
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(params)
      .expect(201);

    return response.body.enrollmentId;
  }

  it('covers withdrawal, transfer, promotion, and bounded lifecycle failures', async () => {
    const { accessToken } = await login();
    const suffix = randomUUID().split('-')[0];

    const existingActiveYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!existingActiveYear) {
      throw new Error('An active academic year is required for lifecycle e2e.');
    }

    originalDemoAcademicYearId = existingActiveYear.id;
    originalDemoAcademicYearWasActive = existingActiveYear.isActive;

    const [yearTwo, inactiveYear] = await Promise.all([
      prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `Lifecycle ${suffix} 2027/2028 AR`,
          nameEn: `Lifecycle ${suffix} 2027/2028`,
          startDate: new Date('2027-09-01T00:00:00.000Z'),
          endDate: new Date('2028-06-30T00:00:00.000Z'),
          isActive: false,
        },
      }),
      prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `Lifecycle ${suffix} inactive AR`,
          nameEn: `Lifecycle ${suffix} inactive`,
          startDate: new Date('2028-09-01T00:00:00.000Z'),
          endDate: new Date('2029-06-30T00:00:00.000Z'),
          isActive: false,
        },
      }),
    ]);
    const yearOne = existingActiveYear;
    cleanupState.academicYearIds.add(yearTwo.id);
    cleanupState.academicYearIds.add(inactiveYear.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Lifecycle Stage ${suffix} AR`,
        nameEn: `Lifecycle Stage ${suffix}`,
        sortOrder: 1,
      },
    });
    cleanupState.stageIds.add(stage.id);

    const [gradeOne, gradeTwo] = await Promise.all([
      prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: stage.id,
          nameAr: `Lifecycle Grade 1 ${suffix} AR`,
          nameEn: `Lifecycle Grade 1 ${suffix}`,
          sortOrder: 1,
          capacity: 30,
        },
      }),
      prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: stage.id,
          nameAr: `Lifecycle Grade 2 ${suffix} AR`,
          nameEn: `Lifecycle Grade 2 ${suffix}`,
          sortOrder: 2,
          capacity: 30,
        },
      }),
    ]);
    cleanupState.gradeIds.add(gradeOne.id);
    cleanupState.gradeIds.add(gradeTwo.id);

    const [sectionA, sectionB, conflictSection, promotedSection] =
      await Promise.all([
        prisma.section.create({
          data: {
            schoolId: demoSchoolId,
            gradeId: gradeOne.id,
            nameAr: `Section A ${suffix} AR`,
            nameEn: `Section A ${suffix}`,
            sortOrder: 1,
            capacity: 30,
          },
        }),
        prisma.section.create({
          data: {
            schoolId: demoSchoolId,
            gradeId: gradeOne.id,
            nameAr: `Section B ${suffix} AR`,
            nameEn: `Section B ${suffix}`,
            sortOrder: 2,
            capacity: 30,
          },
        }),
        prisma.section.create({
          data: {
            schoolId: demoSchoolId,
            gradeId: gradeOne.id,
            nameAr: `Section Conflict ${suffix} AR`,
            nameEn: `Section Conflict ${suffix}`,
            sortOrder: 3,
            capacity: 1,
          },
        }),
        prisma.section.create({
          data: {
            schoolId: demoSchoolId,
            gradeId: gradeTwo.id,
            nameAr: `Section A Grade 2 ${suffix} AR`,
            nameEn: `Section A Grade 2 ${suffix}`,
            sortOrder: 1,
            capacity: 30,
          },
        }),
      ]);
    cleanupState.sectionIds.add(sectionA.id);
    cleanupState.sectionIds.add(sectionB.id);
    cleanupState.sectionIds.add(conflictSection.id);
    cleanupState.sectionIds.add(promotedSection.id);

    const [classroomA, classroomB, conflictClassroom, promotedClassroom] =
      await Promise.all([
        prisma.classroom.create({
          data: {
            schoolId: demoSchoolId,
            sectionId: sectionA.id,
            nameAr: `Classroom A ${suffix} AR`,
            nameEn: `Classroom A ${suffix}`,
            sortOrder: 1,
            capacity: 30,
          },
        }),
        prisma.classroom.create({
          data: {
            schoolId: demoSchoolId,
            sectionId: sectionB.id,
            nameAr: `Classroom B ${suffix} AR`,
            nameEn: `Classroom B ${suffix}`,
            sortOrder: 1,
            capacity: 30,
          },
        }),
        prisma.classroom.create({
          data: {
            schoolId: demoSchoolId,
            sectionId: conflictSection.id,
            nameAr: `Classroom Conflict ${suffix} AR`,
            nameEn: `Classroom Conflict ${suffix}`,
            sortOrder: 1,
            capacity: 1,
          },
        }),
        prisma.classroom.create({
          data: {
            schoolId: demoSchoolId,
            sectionId: promotedSection.id,
            nameAr: `Classroom Grade 2 ${suffix} AR`,
            nameEn: `Classroom Grade 2 ${suffix}`,
            sortOrder: 1,
            capacity: 30,
          },
        }),
      ]);
    cleanupState.classroomIds.add(classroomA.id);
    cleanupState.classroomIds.add(classroomB.id);
    cleanupState.classroomIds.add(conflictClassroom.id);
    cleanupState.classroomIds.add(promotedClassroom.id);

    const transferStudentId = await createStudent(
      accessToken,
      `Lifecycle Transfer ${suffix}`,
    );
    const promotionStudentId = await createStudent(
      accessToken,
      `Lifecycle Promotion ${suffix}`,
    );
    const conflictSourceStudentId = await createStudent(
      accessToken,
      `Lifecycle Conflict Source ${suffix}`,
    );
    const conflictOccupantStudentId = await createStudent(
      accessToken,
      `Lifecycle Conflict Occupant ${suffix}`,
    );

    await createEnrollment(accessToken, {
      studentId: transferStudentId,
      academicYearId: yearOne.id,
      classroomId: classroomA.id,
      enrollmentDate: '2026-09-01',
    });
    await createEnrollment(accessToken, {
      studentId: promotionStudentId,
      academicYearId: yearOne.id,
      classroomId: classroomA.id,
      enrollmentDate: '2026-09-01',
    });
    await createEnrollment(accessToken, {
      studentId: conflictSourceStudentId,
      academicYearId: yearOne.id,
      classroomId: classroomA.id,
      enrollmentDate: '2026-09-01',
    });
    await createEnrollment(accessToken, {
      studentId: conflictOccupantStudentId,
      academicYearId: yearOne.id,
      classroomId: conflictClassroom.id,
      enrollmentDate: '2026-09-01',
    });

    const transferResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/transfer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: transferStudentId,
        targetSectionId: sectionB.id,
        targetClassroomId: classroomB.id,
        effectiveDate: '2026-10-01',
        reason: 'Capacity balancing',
        notes: 'Moved to section B',
      })
      .expect(200);

    expect(transferResponse.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        studentId: transferStudentId,
        actionType: 'transferred_internal',
        fromSectionId: sectionA.id,
        toSectionId: sectionB.id,
        fromClassroomId: classroomA.id,
        toClassroomId: classroomB.id,
        effectiveDate: '2026-10-01',
      }),
    );

    const transferEnrollments = await prisma.enrollment.findMany({
      where: { studentId: transferStudentId },
      orderBy: [{ enrolledAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        classroomId: true,
        academicYearId: true,
        status: true,
        endedAt: true,
      },
    });

    expect(transferEnrollments).toEqual([
      expect.objectContaining({
        classroomId: classroomA.id,
        academicYearId: yearOne.id,
        status: StudentEnrollmentStatus.COMPLETED,
        endedAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
      expect.objectContaining({
        id: transferResponse.body.id,
        classroomId: classroomB.id,
        academicYearId: yearOne.id,
        status: StudentEnrollmentStatus.ACTIVE,
        endedAt: null,
      }),
    ]);

    const currentAfterTransferResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/enrollments/current?studentId=${transferStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(currentAfterTransferResponse.body).toEqual(
      expect.objectContaining({
        studentId: transferStudentId,
        classroomId: classroomB.id,
        academicYearId: yearOne.id,
        status: 'active',
      }),
    );

    const withdrawResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/withdraw`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: transferStudentId,
        effectiveDate: '2026-11-01',
        reason: 'Family relocation',
        notes: 'Withdrawn after transfer',
        actionType: 'withdrawn',
      })
      .expect(200);

    expect(withdrawResponse.body).toEqual(
      expect.objectContaining({
        id: transferResponse.body.id,
        studentId: transferStudentId,
        actionType: 'withdrawn',
        toClassroomId: null,
        reason: 'Family relocation',
      }),
    );

    const currentAfterWithdrawalResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/enrollments/current?studentId=${transferStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(currentAfterWithdrawalResponse.body).toEqual({});

    const activeTransferEnrollmentCount = await prisma.enrollment.count({
      where: {
        studentId: transferStudentId,
        status: StudentEnrollmentStatus.ACTIVE,
      },
    });
    expect(activeTransferEnrollmentCount).toBe(0);

    const conflictResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/transfer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: conflictSourceStudentId,
        targetSectionId: conflictSection.id,
        targetClassroomId: conflictClassroom.id,
        effectiveDate: '2026-10-01',
        reason: 'Capacity balancing',
        notes: 'This should fail',
      })
      .expect(409);

    expect(conflictResponse.body?.error?.code).toBe(
      'students.enrollment.placement_conflict',
    );

    const inactiveYearResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/promote`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: promotionStudentId,
        targetAcademicYear: inactiveYear.nameEn,
        effectiveDate: '2027-09-01',
        notes: 'Should fail',
      })
      .expect(422);

    expect(inactiveYearResponse.body?.error?.code).toBe(
      'students.enrollment.inactive_year',
    );

    await prisma.$transaction([
      prisma.academicYear.update({
        where: { id: yearOne.id },
        data: { isActive: false },
      }),
      prisma.academicYear.update({
        where: { id: yearTwo.id },
        data: { isActive: true },
      }),
    ]);

    const promoteResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/promote`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: promotionStudentId,
        targetAcademicYear: yearTwo.nameEn,
        effectiveDate: '2027-09-01',
        notes: 'Auto promotion',
      })
      .expect(200);

    expect(promoteResponse.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        studentId: promotionStudentId,
        actionType: 'promoted',
        academicYear: yearTwo.nameEn,
        fromGradeId: gradeOne.id,
        toGradeId: gradeTwo.id,
        toClassroomId: promotedClassroom.id,
        effectiveDate: '2027-09-01',
      }),
    );

    const promotionEnrollments = await prisma.enrollment.findMany({
      where: { studentId: promotionStudentId },
      orderBy: [{ enrolledAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        classroomId: true,
        academicYearId: true,
        status: true,
        endedAt: true,
      },
    });

    expect(promotionEnrollments).toEqual([
      expect.objectContaining({
        classroomId: classroomA.id,
        academicYearId: yearOne.id,
        status: StudentEnrollmentStatus.COMPLETED,
        endedAt: new Date('2027-09-01T00:00:00.000Z'),
      }),
      expect.objectContaining({
        id: promoteResponse.body.id,
        classroomId: promotedClassroom.id,
        academicYearId: yearTwo.id,
        status: StudentEnrollmentStatus.ACTIVE,
        endedAt: null,
      }),
    ]);

    const currentAfterPromotionResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/enrollments/current?studentId=${promotionStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(currentAfterPromotionResponse.body).toEqual(
      expect.objectContaining({
        studentId: promotionStudentId,
        academicYearId: yearTwo.id,
        gradeId: gradeTwo.id,
        classroomId: promotedClassroom.id,
        status: 'active',
      }),
    );

    const lifecycleAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        action: {
          in: [
            'students.enrollment.transfer',
            'students.enrollment.withdraw',
            'students.enrollment.promote',
          ],
        },
        resourceId: {
          in: [
            transferResponse.body.id,
            withdrawResponse.body.id,
            promoteResponse.body.id,
          ],
        },
      },
      select: { action: true },
    });

    expect(lifecycleAuditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'students.enrollment.transfer' }),
        expect.objectContaining({ action: 'students.enrollment.withdraw' }),
        expect.objectContaining({ action: 'students.enrollment.promote' }),
      ]),
    );

    const unrelatedStudentSideEffects = await Promise.all([
      prisma.studentDocument.count({
        where: {
          studentId: {
            in: [
              transferStudentId,
              promotionStudentId,
              conflictSourceStudentId,
              conflictOccupantStudentId,
            ],
          },
        },
      }),
      prisma.studentMedicalProfile.count({
        where: {
          studentId: {
            in: [
              transferStudentId,
              promotionStudentId,
              conflictSourceStudentId,
              conflictOccupantStudentId,
            ],
          },
        },
      }),
      prisma.studentNote.count({
        where: {
          studentId: {
            in: [
              transferStudentId,
              promotionStudentId,
              conflictSourceStudentId,
              conflictOccupantStudentId,
            ],
          },
        },
      }),
    ]);

    expect(unrelatedStudentSideEffects).toEqual([0, 0, 0]);
  });
});
