export type TeacherAppClassId = string;

export interface TeacherAppSubjectReference {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
  code: string | null;
}

export interface TeacherAppStageReference {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
}

export interface TeacherAppGradeReference {
  id: string;
  schoolId: string;
  stageId: string;
  nameAr: string;
  nameEn: string;
  stage: TeacherAppStageReference | null;
}

export interface TeacherAppSectionReference {
  id: string;
  schoolId: string;
  gradeId: string;
  nameAr: string;
  nameEn: string;
  grade: TeacherAppGradeReference | null;
}

export interface TeacherAppRoomReference {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
}

export interface TeacherAppClassroomReference {
  id: string;
  schoolId: string;
  sectionId: string;
  roomId: string | null;
  nameAr: string;
  nameEn: string;
  section: TeacherAppSectionReference | null;
  room: TeacherAppRoomReference | null;
}

export interface TeacherAppTermReference {
  id: string;
  schoolId: string;
  academicYearId: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
}

export interface TeacherAppAllocationRecord {
  id: TeacherAppClassId;
  schoolId: string;
  teacherUserId: string;
  subjectId: string;
  classroomId: string;
  termId: string;
  subject: TeacherAppSubjectReference | null;
  classroom: TeacherAppClassroomReference | null;
  term: TeacherAppTermReference | null;
}
