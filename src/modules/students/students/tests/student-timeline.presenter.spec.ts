import {
  AdmissionDecisionType,
  AdmissionApplicationStatus,
  StudentDocumentStatus,
  StudentNoteCategory,
} from '@prisma/client';
import { presentStudentTimeline } from '../presenters/student-timeline.presenter';

describe('student timeline presenter', () => {
  it('aggregates bounded timeline events in reverse chronological order', () => {
    const timeline = presentStudentTimeline({
      id: 'student-1',
      firstName: 'Ahmed',
      lastName: 'Hassan',
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
      application: {
        id: 'application-1',
        studentName: 'Ahmed Hassan',
        status: AdmissionApplicationStatus.ACCEPTED,
        createdAt: new Date('2026-04-19T09:00:00.000Z'),
        submittedAt: new Date('2026-04-19T10:00:00.000Z'),
        decision: {
          id: 'decision-1',
          decision: AdmissionDecisionType.ACCEPT,
          reason: 'Passed all checks',
          decidedAt: new Date('2026-04-21T12:00:00.000Z'),
        },
      },
      guardians: [
        {
          id: 'guardian-link-1',
          isPrimary: true,
          createdAt: new Date('2026-04-20T09:00:00.000Z'),
          guardian: {
            id: 'guardian-1',
            firstName: 'Mohammed',
            lastName: 'Hassan',
            relation: 'father',
          },
        },
      ],
      enrollments: [
        {
          id: 'enrollment-1',
          createdAt: new Date('2026-04-22T07:00:00.000Z'),
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
          academicYear: {
            id: 'year-1',
            nameEn: 'Academic Year 2026/2027',
          },
          classroom: {
            id: 'classroom-1',
            nameEn: 'Classroom A',
            section: {
              id: 'section-1',
              nameEn: 'Section A',
              grade: {
                id: 'grade-1',
                nameEn: 'Grade 5',
              },
            },
          },
        },
      ],
      documents: [
        {
          id: 'document-1',
          documentType: 'Birth Certificate',
          status: StudentDocumentStatus.COMPLETE,
          createdAt: new Date('2026-04-22T08:00:00.000Z'),
          file: {
            id: 'file-1',
            originalName: 'birth-certificate.pdf',
          },
        },
      ],
      medicalProfile: {
        id: 'medical-1',
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:30:00.000Z'),
      },
      notes: [
        {
          id: 'note-1',
          note: 'Helped classmates during activity',
          category: StudentNoteCategory.BEHAVIOR,
          createdAt: new Date('2026-04-22T10:00:00.000Z'),
          authorUser: {
            id: 'user-1',
            firstName: 'Teacher',
            lastName: 'A',
          },
        },
      ],
    });

    expect(timeline).toEqual([
      {
        id: 'note:note-1',
        studentId: 'student-1',
        date: '2026-04-22T10:00:00.000Z',
        type: 'note_added',
        label: 'Behavior note added',
        description: 'Helped classmates during activity by Teacher A',
      },
      {
        id: 'medical:medical-1:updated',
        studentId: 'student-1',
        date: '2026-04-22T09:30:00.000Z',
        type: 'medical_profile_updated',
        label: 'Medical profile updated',
        description: 'Medical profile updated',
      },
      {
        id: 'medical:medical-1:created',
        studentId: 'student-1',
        date: '2026-04-22T09:00:00.000Z',
        type: 'medical_profile_created',
        label: 'Medical profile created',
        description: 'Medical profile added for student records',
      },
      {
        id: 'document:document-1',
        studentId: 'student-1',
        date: '2026-04-22T08:00:00.000Z',
        type: 'document_linked',
        label: 'Birth Certificate document linked',
        description: 'birth-certificate.pdf linked as Birth Certificate',
      },
      {
        id: 'enrollment:enrollment-1',
        studentId: 'student-1',
        date: '2026-04-22T07:00:00.000Z',
        type: 'enrollment_created',
        label: 'Enrollment created',
        description: 'Enrolled in Grade 5 / Section A / Classroom A for Academic Year 2026/2027',
      },
      {
        id: 'decision:decision-1',
        studentId: 'student-1',
        date: '2026-04-21T12:00:00.000Z',
        type: 'application_accepted',
        label: 'Application accepted',
        description: 'Application accepted for Ahmed Hassan: Passed all checks',
      },
      {
        id: 'guardian-link:guardian-link-1',
        studentId: 'student-1',
        date: '2026-04-20T09:00:00.000Z',
        type: 'guardian_linked',
        label: 'Guardian linked',
        description: 'Mohammed Hassan linked as father (primary)',
      },
      {
        id: 'student:student-1:created',
        studentId: 'student-1',
        date: '2026-04-20T08:00:00.000Z',
        type: 'student_created',
        label: 'Student record created',
        description: 'Ahmed Hassan was added to student records',
      },
      {
        id: 'application:application-1:submitted',
        studentId: 'student-1',
        date: '2026-04-19T10:00:00.000Z',
        type: 'application_submitted',
        label: 'Application submitted',
        description: 'Admissions application submitted for Ahmed Hassan',
      },
      {
        id: 'application:application-1:created',
        studentId: 'student-1',
        date: '2026-04-19T09:00:00.000Z',
        type: 'application_created',
        label: 'Application created',
        description: 'Admissions application created for Ahmed Hassan',
      },
    ]);
  });
});
