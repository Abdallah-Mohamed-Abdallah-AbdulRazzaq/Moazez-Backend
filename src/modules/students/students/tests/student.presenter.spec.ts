import { StudentStatus } from '@prisma/client';
import {
  presentStudent,
  presentStudentSummary,
} from '../presenters/student.presenter';

describe('student presenter', () => {
  const student = {
    id: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    applicationId: null,
    firstName: 'Layla',
    lastName: 'Hassan',
    birthDate: new Date('2016-02-14T00:00:00.000Z'),
    status: StudentStatus.ACTIVE,
    createdAt: new Date('2026-04-22T09:00:00.000Z'),
    updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    deletedAt: null,
  };

  it('presents a student base record with compatibility aliases', () => {
    expect(presentStudent(student)).toEqual({
      id: 'student-1',
      student_id: null,
      name: 'Layla Hassan',
      first_name_en: 'Layla',
      father_name_en: null,
      grandfather_name_en: null,
      family_name_en: 'Hassan',
      first_name_ar: null,
      father_name_ar: null,
      grandfather_name_ar: null,
      family_name_ar: null,
      full_name_en: 'Layla Hassan',
      full_name_ar: null,
      dateOfBirth: '2016-02-14',
      date_of_birth: '2016-02-14',
      gender: null,
      nationality: null,
      status: 'Active',
      contact: {
        address_line: null,
        city: null,
        district: null,
        student_phone: null,
        student_email: null,
      },
      created_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z',
    });
  });

  it('presents a student summary for guardian profiles', () => {
    expect(
      presentStudentSummary({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        status: student.status,
      }),
    ).toEqual({
      id: 'student-1',
      student_id: null,
      name: 'Layla Hassan',
      full_name_en: 'Layla Hassan',
      status: 'Active',
    });
  });
});
