import { AdmissionDecisionType, StudentDocumentStatus, StudentNoteCategory } from '@prisma/client';
import { StudentTimelineEventResponseDto } from '../dto/student-timeline.dto';
import { StudentTimelineSource } from '../infrastructure/student-timeline.repository';

type TimelineEventInput = Omit<StudentTimelineEventResponseDto, 'date'> & {
  at: Date;
};

function buildStudentName(student: Pick<StudentTimelineSource, 'firstName' | 'lastName'>): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function buildPersonName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function categoryLabel(category: StudentNoteCategory | null): string {
  switch (category) {
    case StudentNoteCategory.BEHAVIOR:
      return 'Behavior';
    case StudentNoteCategory.ACADEMIC:
      return 'Academic';
    case StudentNoteCategory.ATTENDANCE:
      return 'Attendance';
    case StudentNoteCategory.GENERAL:
    case null:
      return 'General';
  }
}

function createEvent(input: TimelineEventInput): StudentTimelineEventResponseDto {
  return {
    id: input.id,
    studentId: input.studentId,
    date: input.at.toISOString(),
    type: input.type,
    label: input.label,
    description: input.description,
  };
}

function previewText(value: string): string {
  const normalized = value.trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function presentStudentTimeline(
  student: StudentTimelineSource,
): StudentTimelineEventResponseDto[] {
  const studentName = buildStudentName(student);
  const events: StudentTimelineEventResponseDto[] = [
    createEvent({
      id: `student:${student.id}:created`,
      studentId: student.id,
      at: student.createdAt,
      type: 'student_created',
      label: 'Student record created',
      description: `${studentName} was added to student records`,
    }),
  ];

  if (student.application) {
    events.push(
      createEvent({
        id: `application:${student.application.id}:created`,
        studentId: student.id,
        at: student.application.createdAt,
        type: 'application_created',
        label: 'Application created',
        description: `Admissions application created for ${student.application.studentName}`,
      }),
    );

    if (
      student.application.submittedAt &&
      student.application.submittedAt.getTime() !==
        student.application.createdAt.getTime()
    ) {
      events.push(
        createEvent({
          id: `application:${student.application.id}:submitted`,
          studentId: student.id,
          at: student.application.submittedAt,
          type: 'application_submitted',
          label: 'Application submitted',
          description: `Admissions application submitted for ${student.application.studentName}`,
        }),
      );
    }

    if (student.application.decision) {
      const decisionType =
        student.application.decision.decision === AdmissionDecisionType.ACCEPT
          ? 'application_accepted'
          : student.application.decision.decision ===
              AdmissionDecisionType.WAITLIST
            ? 'application_waitlisted'
            : 'application_rejected';
      const decisionLabel =
        student.application.decision.decision === AdmissionDecisionType.ACCEPT
          ? 'Application accepted'
          : student.application.decision.decision ===
              AdmissionDecisionType.WAITLIST
            ? 'Application waitlisted'
            : 'Application rejected';
      const reasonSuffix = student.application.decision.reason
        ? `: ${student.application.decision.reason}`
        : '';

      events.push(
        createEvent({
          id: `decision:${student.application.decision.id}`,
          studentId: student.id,
          at: student.application.decision.decidedAt,
          type: decisionType,
          label: decisionLabel,
          description: `${decisionLabel} for ${student.application.studentName}${reasonSuffix}`,
        }),
      );
    }
  }

  for (const guardianLink of student.guardians) {
    const guardianName = buildPersonName(guardianLink.guardian);
    const primarySuffix = guardianLink.isPrimary ? ' (primary)' : '';
    events.push(
      createEvent({
        id: `guardian-link:${guardianLink.id}`,
        studentId: student.id,
        at: guardianLink.createdAt,
        type: 'guardian_linked',
        label: 'Guardian linked',
        description: `${guardianName} linked as ${guardianLink.guardian.relation}${primarySuffix}`,
      }),
    );
  }

  for (const enrollment of student.enrollments) {
    events.push(
      createEvent({
        id: `enrollment:${enrollment.id}`,
        studentId: student.id,
        at: enrollment.createdAt,
        type: 'enrollment_created',
        label: 'Enrollment created',
        description: `Enrolled in ${enrollment.classroom.section.grade.nameEn} / ${enrollment.classroom.section.nameEn} / ${enrollment.classroom.nameEn} for ${enrollment.academicYear.nameEn}`,
      }),
    );
  }

  for (const document of student.documents) {
    const isMissing = document.status === StudentDocumentStatus.MISSING;
    events.push(
      createEvent({
        id: `document:${document.id}`,
        studentId: student.id,
        at: document.createdAt,
        type: isMissing ? 'document_marked_missing' : 'document_linked',
        label: isMissing
          ? `${document.documentType} document marked missing`
          : `${document.documentType} document linked`,
        description: isMissing
          ? `${document.documentType} was marked missing`
          : `${document.file.originalName} linked as ${document.documentType}`,
      }),
    );
  }

  if (student.medicalProfile) {
    events.push(
      createEvent({
        id: `medical:${student.medicalProfile.id}:created`,
        studentId: student.id,
        at: student.medicalProfile.createdAt,
        type: 'medical_profile_created',
        label: 'Medical profile created',
        description: 'Medical profile added for student records',
      }),
    );

    if (
      student.medicalProfile.updatedAt.getTime() >
      student.medicalProfile.createdAt.getTime()
    ) {
      events.push(
        createEvent({
          id: `medical:${student.medicalProfile.id}:updated`,
          studentId: student.id,
          at: student.medicalProfile.updatedAt,
          type: 'medical_profile_updated',
          label: 'Medical profile updated',
          description: 'Medical profile updated',
        }),
      );
    }
  }

  for (const note of student.notes) {
    const authorName = buildPersonName(note.authorUser);
    events.push(
      createEvent({
        id: `note:${note.id}`,
        studentId: student.id,
        at: note.createdAt,
        type: 'note_added',
        label: `${categoryLabel(note.category)} note added`,
        description: `${previewText(note.note)} by ${authorName}`,
      }),
    );
  }

  return events.sort((left, right) => {
    const byDate = right.date.localeCompare(left.date);
    return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
  });
}
