import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('Students Phase 4 operational flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let demoSchoolId: string;

  const cleanupState = {
    studentIds: new Set<string>(),
    documentIds: new Set<string>(),
    medicalProfileIds: new Set<string>(),
    noteIds: new Set<string>(),
    fileIds: new Set<string>(),
    storageObjects: [] as Array<{ bucket: string; objectKey: string }>,
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

    storageService = app.get(StorageService);
  });

  afterAll(async () => {
    if (cleanupState.noteIds.size > 0) {
      await prisma.studentNote.deleteMany({
        where: { id: { in: [...cleanupState.noteIds] } },
      });
    }

    if (cleanupState.medicalProfileIds.size > 0) {
      await prisma.studentMedicalProfile.deleteMany({
        where: { id: { in: [...cleanupState.medicalProfileIds] } },
      });
    }

    if (cleanupState.documentIds.size > 0) {
      await prisma.studentDocument.deleteMany({
        where: { id: { in: [...cleanupState.documentIds] } },
      });
    }

    if (cleanupState.studentIds.size > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: [...cleanupState.studentIds] } },
      });
    }

    if (cleanupState.fileIds.size > 0) {
      await prisma.file.deleteMany({
        where: { id: { in: [...cleanupState.fileIds] } },
      });
    }

    for (const object of cleanupState.storageObjects) {
      try {
        await storageService.deleteObject(object);
      } catch {
        // Best-effort cleanup for local e2e runs.
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

  async function registerStoredFile(fileId: string): Promise<void> {
    const storedFile = await prisma.file.findUnique({
      where: { id: fileId },
      select: { bucket: true, objectKey: true },
    });

    if (!storedFile) {
      throw new Error(`Uploaded file ${fileId} was not persisted.`);
    }

    cleanupState.fileIds.add(fileId);
    cleanupState.storageObjects.push(storedFile);
  }

  it('covers documents, medical profile, notes, and timeline without lifecycle side effects', async () => {
    const { accessToken } = await login();
    const suffix = randomUUID().split('-')[0];

    const createStudentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        full_name_en: `Phase Four Student ${suffix}`,
        dateOfBirth: '2015-05-10',
      })
      .expect(201);

    const student = createStudentResponse.body;
    cleanupState.studentIds.add(student.id);

    expect(student).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        full_name_en: `Phase Four Student ${suffix}`,
        status: 'Active',
      }),
    );

    const initialMedicalResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/medical-profile`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(initialMedicalResponse.body).toEqual({});

    const fileContents = `Phase 4 student document ${suffix}`;
    const uploadResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from(fileContents), {
        filename: `phase4-${suffix}.pdf`,
        contentType: 'application/pdf',
      })
      .expect(201);

    await registerStoredFile(uploadResponse.body.id);

    const linkDocumentResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/documents`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'Birth Certificate',
        fileId: uploadResponse.body.id,
        notes: 'Phase 4 linked document',
      })
      .expect(201);

    cleanupState.documentIds.add(linkDocumentResponse.body.id);

    expect(linkDocumentResponse.body).toEqual({
      id: expect.any(String),
      studentId: student.id,
      fileId: uploadResponse.body.id,
      type: 'Birth Certificate',
      name: expect.stringMatching(/phase4-.*\.pdf/),
      status: 'complete',
      uploadedDate: expect.any(String),
      url: `/api/v1/files/${uploadResponse.body.id}/download`,
      fileType: 'pdf',
      notes: 'Phase 4 linked document',
    });

    const listDocumentsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/documents`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listDocumentsResponse.body).toEqual([
      expect.objectContaining({
        id: linkDocumentResponse.body.id,
        studentId: student.id,
        fileId: uploadResponse.body.id,
      }),
    ]);

    const createMedicalProfileResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/medical-profile`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bloodType: 'O+',
        allergies: 'Dust',
        notes: 'Carries inhaler',
        conditions: ['Asthma'],
        medications: ['Inhaler'],
      })
      .expect(200);

    cleanupState.medicalProfileIds.add(createMedicalProfileResponse.body.id);

    expect(createMedicalProfileResponse.body).toEqual({
      id: expect.any(String),
      studentId: student.id,
      allergies: 'Dust',
      notes: 'Carries inhaler',
      bloodType: 'O+',
      conditions: ['Asthma'],
      medications: ['Inhaler'],
    });

    const updateMedicalProfileResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/medical-profile`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        allergies: 'Pollen',
        notes: 'Updated emergency plan',
      })
      .expect(200);

    expect(updateMedicalProfileResponse.body).toEqual({
      id: createMedicalProfileResponse.body.id,
      studentId: student.id,
      allergies: 'Pollen',
      notes: 'Updated emergency plan',
      bloodType: 'O+',
      conditions: ['Asthma'],
      medications: ['Inhaler'],
    });

    const createNoteResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/${student.id}/notes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        category: 'general',
        note: 'First operational note',
        visibility: 'internal',
      })
      .expect(201);

    cleanupState.noteIds.add(createNoteResponse.body.id);

    expect(createNoteResponse.body).toEqual({
      id: expect.any(String),
      studentId: student.id,
      date: expect.any(String),
      category: 'general',
      note: 'First operational note',
      xpAdjustment: null,
      visibility: 'internal',
      created_by: expect.any(String),
    });

    const updateNoteResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/notes/${createNoteResponse.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        category: 'academic',
        note: 'Updated operational note',
      })
      .expect(200);

    expect(updateNoteResponse.body).toEqual({
      id: createNoteResponse.body.id,
      studentId: student.id,
      date: createNoteResponse.body.date,
      category: 'academic',
      note: 'Updated operational note',
      xpAdjustment: null,
      visibility: 'internal',
      created_by: createNoteResponse.body.created_by,
    });

    const listNotesResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/${student.id}/notes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listNotesResponse.body).toEqual([
      expect.objectContaining({
        id: createNoteResponse.body.id,
        note: 'Updated operational note',
        category: 'academic',
      }),
    ]);

    const timelineResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/timeline`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const allowedTimelineEventTypes = new Set([
      'student_created',
      'document_linked',
      'medical_profile_created',
      'medical_profile_updated',
      'note_added',
    ]);

    expect(timelineResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: student.id,
          type: 'student_created',
          label: 'Student record created',
        }),
        expect.objectContaining({
          studentId: student.id,
          type: 'document_linked',
          label: 'Birth Certificate document linked',
        }),
        expect.objectContaining({
          studentId: student.id,
          type: 'medical_profile_created',
          label: 'Medical profile created',
        }),
        expect.objectContaining({
          studentId: student.id,
          type: 'medical_profile_updated',
          label: 'Medical profile updated',
        }),
        expect.objectContaining({
          studentId: student.id,
          type: 'note_added',
        }),
      ]),
    );

    expect(
      timelineResponse.body.every((event: { type: string }) =>
        allowedTimelineEventTypes.has(event.type),
      ),
    ).toBe(true);

    expect(
      timelineResponse.body.some(
        (event: { type: string }) => event.type === 'enrollment_created',
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${uploadResponse.body.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(307)
      .expect('Location', /^https?:\/\//);

    const persistedEnrollmentCount = await prisma.enrollment.count({
      where: { studentId: student.id, schoolId: demoSchoolId },
    });
    expect(persistedEnrollmentCount).toBe(0);
  });
});
