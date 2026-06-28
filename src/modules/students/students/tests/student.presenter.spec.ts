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
    fatherNameEn: 'Mahmoud',
    grandfatherNameEn: 'Omar',
    lastName: 'Hassan',
    firstNameAr: 'LaylaAr',
    fatherNameAr: 'MahmoudAr',
    grandfatherNameAr: 'OmarAr',
    familyNameAr: 'HassanAr',
    birthDate: new Date('2016-02-14T00:00:00.000Z'),
    gender: 'Female',
    nationality: 'Egyptian',
    addressLine: '10 School Street',
    city: 'Cairo',
    district: 'Heliopolis',
    studentPhone: '+201001112233',
    studentEmail: 'layla@example.com',
    status: StudentStatus.ACTIVE,
    createdAt: new Date('2026-04-22T09:00:00.000Z'),
    updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    deletedAt: null,
  };

  it('presents a student base record with compatibility aliases', () => {
    expect(presentStudent(student)).toEqual({
      id: 'student-1',
      student_id: null,
      name: 'Layla Mahmoud Omar Hassan',
      first_name_en: 'Layla',
      father_name_en: 'Mahmoud',
      grandfather_name_en: 'Omar',
      family_name_en: 'Hassan',
      first_name_ar: 'LaylaAr',
      father_name_ar: 'MahmoudAr',
      grandfather_name_ar: 'OmarAr',
      family_name_ar: 'HassanAr',
      full_name_en: 'Layla Mahmoud Omar Hassan',
      full_name_ar: 'LaylaAr MahmoudAr OmarAr HassanAr',
      dateOfBirth: '2016-02-14',
      date_of_birth: '2016-02-14',
      gender: 'Female',
      nationality: 'Egyptian',
      status: 'Active',
      contact: {
        address_line: '10 School Street',
        city: 'Cairo',
        district: 'Heliopolis',
        student_phone: '+201001112233',
        student_email: 'layla@example.com',
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
