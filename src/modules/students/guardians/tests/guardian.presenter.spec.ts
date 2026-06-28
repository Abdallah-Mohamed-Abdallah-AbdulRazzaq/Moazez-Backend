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
    phoneSecondary: '+201004445566',
    email: 'mother@example.com',
    nationalId: '29901011234567',
    jobTitle: 'Physician',
    workplace: 'Cairo Clinic',
    relation: 'mother',
    isPrimary: false,
    canPickup: true,
    canReceiveNotifications: false,
    createdAt: new Date('2026-04-22T09:00:00.000Z'),
    updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    deletedAt: null,
  };

  const student = {
    id: 'student-1',
    firstName: 'Layla',
    fatherNameEn: null,
    grandfatherNameEn: null,
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
      phone_secondary: '+201004445566',
      email: 'mother@example.com',
      national_id: '29901011234567',
      job_title: 'Physician',
      workplace: 'Cairo Clinic',
      is_primary: true,
      can_pickup: true,
      can_receive_notifications: false,
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
        phone_secondary: '+201004445566',
        email: 'mother@example.com',
        national_id: '29901011234567',
        job_title: 'Physician',
        workplace: 'Cairo Clinic',
        is_primary: true,
        can_pickup: true,
        can_receive_notifications: false,
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
