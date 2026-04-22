import { presentStudentMedicalProfile } from '../presenters/student-medical-profile.presenter';

describe('student medical profile presenter', () => {
  it('maps emergencyNotes into the contract notes field', () => {
    expect(
      presentStudentMedicalProfile({
        id: 'medical-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        bloodType: 'A+',
        allergies: 'Dust',
        conditions: ['Asthma'],
        medications: ['Inhaler'],
        emergencyNotes: 'Emergency contact on file',
        createdAt: new Date('2026-04-22T10:00:00.000Z'),
        updatedAt: new Date('2026-04-22T10:00:00.000Z'),
      }),
    ).toEqual({
      id: 'medical-1',
      studentId: 'student-1',
      allergies: 'Dust',
      notes: 'Emergency contact on file',
      bloodType: 'A+',
      conditions: ['Asthma'],
      medications: ['Inhaler'],
    });
  });
});
