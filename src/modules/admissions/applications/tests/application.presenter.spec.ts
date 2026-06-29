import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  StudentEnrollmentStatus,
} from '@prisma/client';
import { ApplicationRecord } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';

describe('Application presenter', () => {
  const baseApplication: ApplicationRecord = {
    id: 'application-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    leadId: null,
    studentName: 'Layla Hassan',
    requestedAcademicYearId: 'year-1',
    requestedGradeId: 'grade-1',
    source: AdmissionApplicationSource.IN_APP,
    status: AdmissionApplicationStatus.ACCEPTED,
    submittedAt: new Date('2026-04-21T10:00:00.000Z'),
    createdAt: new Date('2026-04-21T09:00:00.000Z'),
    updatedAt: new Date('2026-04-21T11:00:00.000Z'),
    deletedAt: null,
    student: null,
  };

  it('returns an explicit unregistered registrationState', () => {
    expect(presentApplication(baseApplication)).toEqual(
      expect.objectContaining({
        status: 'accepted',
        registrationState: {
          registered: false,
          studentId: null,
          enrollmentId: null,
          enrollmentStatus: null,
          registeredVia: null,
          registeredAt: null,
          source: 'derived_from_student_application_id',
        },
      }),
    );
  });

  it('returns registered state with active enrollment summary', () => {
    const result = presentApplication({
      ...baseApplication,
      student: {
        id: 'student-1',
        enrollments: [
          {
            id: 'enrollment-1',
            status: StudentEnrollmentStatus.ACTIVE,
          },
        ],
      },
    });

    expect(result.status).toBe('accepted');
    expect(result.registrationState).toEqual({
      registered: true,
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      enrollmentStatus: 'active',
      registeredVia: 'admissions_application',
      registeredAt: null,
      source: 'derived_from_student_application_id',
    });
  });

  it('returns registered state without an enrollment when no active enrollment is present', () => {
    const result = presentApplication({
      ...baseApplication,
      student: {
        id: 'student-1',
        enrollments: [],
      },
    });

    expect(result.registrationState).toEqual({
      registered: true,
      studentId: 'student-1',
      enrollmentId: null,
      enrollmentStatus: null,
      registeredVia: 'admissions_application',
      registeredAt: null,
      source: 'derived_from_student_application_id',
    });
  });

  it('does not leak internal tenant, identity, or source-link fields', () => {
    const serialized = JSON.stringify(
      presentApplication({
        ...baseApplication,
        student: {
          id: 'student-1',
          enrollments: [
            {
              id: 'enrollment-1',
              status: StudentEnrollmentStatus.ACTIVE,
            },
          ],
        },
      }),
    );

    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('applicationId');
  });
});
