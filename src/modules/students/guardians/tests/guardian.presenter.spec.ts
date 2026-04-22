import { StudentStatus } from '@prisma/client';
import {
  presentGuardianLink,
  presentGuardianProfile,
} from '../presenters/guardian.presenter';

describe('guardian presenter', () => {
  const guardian = {
    id: 'guardian-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    userId: null,
    firstName: 'Mona',
    lastName: 'Ali',
    phone: '+201001112233',
    email: 'mother@example.com',
    relation: 'mother',
    isPrimary: false,
    createdAt: new Date('2026-04-22T09:00:00.000Z'),
    updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    deletedAt: null,
  };

  const student = {
    id: 'student-1',
    firstName: 'Layla',
    lastName: 'Hassan',
    status: StudentStatus.ACTIVE,
  };

  it('presents a student-guardian link in the frontend contract shape', () => {
    expect(
      presentGuardianLink({
        id: 'link-1',
        studentId: 'student-1',
        guardianId: 'guardian-1',
        isPrimary: true,
        guardian,
        student,
      }),
    ).toEqual({
      guardianId: 'guardian-1',
      full_name: 'Mona Ali',
      relation: 'mother',
      phone_primary: '+201001112233',
      phone_secondary: null,
      email: 'mother@example.com',
      national_id: null,
      job_title: null,
      workplace: null,
      is_primary: true,
      can_pickup: null,
      can_receive_notifications: null,
    });
  });

  it('presents a guardian profile with linked students', () => {
    expect(
      presentGuardianProfile({
        ...guardian,
        students: [
          {
            isPrimary: true,
            student,
          },
        ],
      }),
    ).toEqual({
      guardian: {
        guardianId: 'guardian-1',
        full_name: 'Mona Ali',
        relation: 'mother',
        phone_primary: '+201001112233',
        phone_secondary: null,
        email: 'mother@example.com',
        national_id: null,
        job_title: null,
        workplace: null,
        is_primary: true,
        can_pickup: null,
        can_receive_notifications: null,
      },
      students: [
        {
          id: 'student-1',
          student_id: null,
          name: 'Layla Hassan',
          full_name_en: 'Layla Hassan',
          status: 'Active',
        },
      ],
    });
  });
});
