# Sprint 14A — Homework Submissions Contract Audit

## 1. Purpose

Sprint 14A is an audit and design sprint for adding Homework Submissions safely on top of the Sprint 13 Homework Core.

This document does not implement runtime behavior. It defines the current contracts, the submission domain boundary, the recommended staged implementation path, and the schema/API/security implications for Sprint 14B and later.

Primary recommendation: Sprint 14B should implement a text-only student submission foundation. It should create the submission shell and student submit lifecycle without files, questions, grade sync, notifications, email, XP, rewards, Postman updates, or documentation rewrites.

## 2. Repository State Reviewed

The audit reviewed the required repository context and current source contracts:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `ERROR_CATALOG.md`
- `README.md`
- `docs/sprint-13a-homework-core-contract-audit.md`
- `prisma/schema.prisma`
- `src/modules/homework/**`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/parent-app/homeworks/**`
- `src/modules/files/**`
- `src/modules/grades/**`
- `src/modules/communication/**`
- `src/modules/reinforcement/**`
- `src/modules/teacher-app/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `test/security/tenancy.homework.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/e2e/homework-final-closeout.e2e-spec.ts`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- Teacher, Student, and Parent homework app ADRs.

`DIRECTORY_STRUCTURE.md` is still not present in this repository. `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed as the available structure reference. This matches the earlier Sprint 13A finding and is not changed in this sprint.

## 3. Current Homework Contracts

### Core Homework Source of Truth

The current Homework Core source of truth is:

- `HomeworkAssignment`
- `HomeworkTarget`
- `HomeworkAssignmentStatus`
- `HomeworkTargetStatus`

`HomeworkAssignment` owns assignment-level state:

- Tenant: `schoolId`
- Academic scope: `academicYearId`, `termId`
- Class/subject scope: `classroomId`, `subjectId`, `teacherSubjectAllocationId`
- Optional timetable linkage: `timetableEntryId`, `scheduleDate`
- Assignment content: `title`, `description`, `mode`
- Lifecycle: `DRAFT`, `PUBLISHED`, `CLOSED`, `CANCELLED`, `ARCHIVED`
- Targeting: `CLASSROOM`, `SELECTED_STUDENTS`
- Timing: `publishAt`, `publishedAt`, `dueAt`, `closedAt`
- Optional grade bridge placeholder: `gradeAssessmentId`
- Audit metadata: creator/publisher timestamps and users
- Soft delete: `deletedAt`

`HomeworkTarget` owns per-student assignment state:

- Tenant: `schoolId`
- Assignment: `homeworkAssignmentId`
- Learner scope: `studentId`, `enrollmentId`
- Lifecycle: `ASSIGNED`, `VIEWED`, `SUBMITTED`, `LATE`, `MISSING`, `REVIEWED`, `EXCUSED`
- Timestamps: `assignedAt`, `viewedAt`, `submittedAt`, `reviewedAt`, `excusedAt`

Current core routes are mounted under `/api/v1/homework/assignments`:

| Route | Current role |
| --- | --- |
| `GET /api/v1/homework/assignments` | Core assignment list |
| `POST /api/v1/homework/assignments` | Core assignment draft creation |
| `GET /api/v1/homework/assignments/:homeworkId` | Core assignment detail |
| `PATCH /api/v1/homework/assignments/:homeworkId` | Draft-only assignment update |
| `POST /api/v1/homework/assignments/:homeworkId/publish` | Publish and refresh targets |
| `POST /api/v1/homework/assignments/:homeworkId/close` | Close assignment |
| `POST /api/v1/homework/assignments/:homeworkId/cancel` | Cancel assignment |
| `GET /api/v1/homework/assignments/:homeworkId/targets` | Core target list |
| `POST /api/v1/homework/assignments/:homeworkId/targets/resolve` | Refresh/materialize targets |

Current core implementation already follows the project rules:

- Controllers are thin.
- Business behavior lives in use-cases/services.
- Prisma access is repository-backed.
- Presenter shapes hide tenant fields.
- Mutations are audited.
- Core uses `schoolId` from resolved school scope.
- Cross-school access resolves through scoped queries and safe not-found behavior.

### Teacher App Homework

Teacher App homeworks are app-facing composition/read-model routes under `/api/v1/teacher/homeworks`.

Current Teacher App contracts:

| Route | Current role |
| --- | --- |
| `GET /api/v1/teacher/homeworks/dashboard` | Dashboard counters |
| `GET /api/v1/teacher/homeworks/classes/:classId/assignments` | Teacher class assignment list |
| `POST /api/v1/teacher/homeworks/classes/:classId/assignments` | Create assignment for owned allocation |
| `GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId` | Teacher assignment detail |
| `PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId` | Teacher draft update |
| `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/publish` | Teacher publish |
| `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/close` | Teacher close |
| `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/cancel` | Teacher cancel |
| `GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets` | Teacher target list |
| `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets/resolve` | Teacher target refresh |

`classId` in these routes is the `TeacherSubjectAllocation.id`, not the physical classroom id. Teacher ownership is enforced before delegating to Homework Core. Same-school unowned teacher data and cross-school data are intentionally hidden with safe not-found behavior.

Teacher App response shaping hides internal tenant fields and maps `teacherSubjectAllocationId` to route-facing `classId`.

Teacher dashboard already has a conceptual `waitingReview` counter based on `HomeworkTargetStatus.SUBMITTED` and `HomeworkTargetStatus.LATE`. That counter is ready for target status changes, but there is no submission persistence yet.

### Student App Homework

Student App homeworks are read-only routes under `/api/v1/student/homeworks`.

Current Student App contracts:

| Route | Current role |
| --- | --- |
| `GET /api/v1/student/homeworks` | Current student's visible homework list |
| `GET /api/v1/student/homeworks/:homeworkId` | Current student's visible homework detail |

Current access rules:

- Actor must be `STUDENT`.
- User must be linked to a `Student` record.
- Student must have an active enrollment in the current school.
- Homework must have a matching target for the current `studentId` and `enrollmentId`.
- Visible assignment statuses are currently `PUBLISHED` and `CLOSED`.
- Draft, cancelled, archived, deleted, other-student, and cross-school homework are hidden.

Current Student App response placeholders:

- `questions: []`
- `attachments: []`
- `submission: null`
- `questionCount: 0`
- `attachmentsCount: 0`

Current student-facing status mapping is derived from `HomeworkTarget` plus assignment timing:

| Existing source state | Student API status |
| --- | --- |
| `HomeworkTargetStatus.SUBMITTED` | `completed` |
| `HomeworkTargetStatus.REVIEWED` | `completed` |
| Assignment closed or past due without submission | `not_completed` |
| Other visible states | `waiting` |

### Parent App Homework

Parent App homeworks are read-only routes under `/api/v1/parent/children/:studentId/homeworks`.

Current Parent App contracts:

| Route | Current role |
| --- | --- |
| `GET /api/v1/parent/children/:studentId/homeworks` | Owned child's visible homework list |
| `GET /api/v1/parent/children/:studentId/homeworks/:homeworkId` | Owned child's visible homework detail |

Current access rules:

- Actor must be `PARENT`.
- Parent must own the requested child through active guardian/student relations.
- Child must have a current active enrollment in the selected school.
- Homework must have a matching target for that child and enrollment.
- Draft, cancelled, archived, deleted, unrelated child, and cross-school homework are hidden.

Current Parent App response placeholders mirror Student App:

- `questions: []`
- `attachments: []`
- `submission: null`

Parent App is currently read-only. No parent submission route is registered.

## 4. Current Deferred Scope

The repository intentionally does not have Homework Submissions runtime yet.

The Sprint 13F route closeout and security tests confirm these routes are absent:

- Core homework submission routes.
- Teacher homework submission routes.
- Student submission mutation routes.
- Parent submission mutation routes.
- Homework question routes.
- Homework answer routes.
- Homework attachment routes.

The following remain deferred and should stay deferred for Sprint 14B unless explicitly approved:

- Homework question/answer engine.
- Homework file proof/attachment upload.
- Parent submit-on-behalf-of-child.
- Grade submission synchronization.
- Automatic grade item creation.
- Notification Center integration.
- Email delivery.
- XP/reward grants.
- Communication announcements.
- Advanced analytics.
- Postman collection changes.
- README/project-structure changes.

## 5. Submission Domain Decisions

### Required Domain Concepts

Homework Submissions should introduce a distinct domain concept, not overload `HomeworkTarget`.

`HomeworkTarget` should continue to represent the assignment-target lifecycle for a student. `HomeworkSubmission` should represent the student's submitted work and reviewable content.

Required concepts:

| Concept | Recommendation |
| --- | --- |
| Homework submission | A tenant-owned row linked to one `HomeworkAssignment`, one `HomeworkTarget`, one `Student`, and one `Enrollment`. |
| Submission status | Add a submission status enum separate from `HomeworkTargetStatus`. |
| Submission attempts | Defer full attempt history. Sprint 14B should support one current text submission per target. |
| Submission text/body | Required Sprint 14B field, with length validation in DTO/use-case. |
| Submission timestamps | `submittedAt` is set only on submit. `createdAt`/`updatedAt` cover draft lifecycle. |
| Submitted by student vs parent | Sprint 14B allows student only. Include a future-proof submitted-by user reference; parent submit stays deferred. |
| Teacher review | Sprint 14C concern. Review should be a separate action, not automatic on submit. |
| Review outcome | Sprint 14C concern. Use explicit outcomes instead of encoding outcome only in notes. |
| Review note | Sprint 14C concern. Optional teacher-facing and student/parent-visible note policy should be explicit. |
| Late submission | Sprint 14B should allow late submission only while assignment is still `PUBLISHED`; mark submission and target as late when `now > dueAt`. |
| Missing/not-completed | Missing can remain computed for read APIs until a close/background process intentionally writes `MISSING`. |
| Excused target | Teacher/core action later. Excused target should block student submission until reopened by policy. |
| Reopen/resubmit | Defer unless Sprint 14C explicitly needs returned work. It may require attempt history or target enum extension. |
| Draft/in-progress | Recommended for Sprint 14B through `resolve` and `PATCH`, but drafts should not update `HomeworkTarget.submittedAt`. |

### Scope Decision for Sprint 14B

The options are:

- A) Simple submission only.
- B) Submission + file proof.
- C) Submission + question/answer engine.
- D) Submission shell with questions deferred.

Recommendation: choose A and D together in a narrow form: text-only submission shell with questions and files deferred.

Sprint 14B should implement:

- Student resolves own submission draft.
- Student edits text/body on own draft.
- Student submits own homework.
- Submission status and target status are updated consistently.
- Student and existing read routes can return the submission summary/detail.
- No teacher review yet, unless limited to repository/use-case readiness with no route exposure.

Sprint 14B should not implement:

- File proof.
- Questions.
- Answers.
- Grade submission bridge.
- Parent submission.
- Notification/email/XP side effects.

### Why Questions Should Be Separated

The repository already has a rich Grades question/submission engine:

- `GradeAssessment`
- `GradeQuestion`
- `GradeQuestionOption`
- `GradeSubmission`
- `GradeSubmissionAnswer`
- Score correction and grade item sync

Reusing that engine directly for homework would couple basic homework submission to grading behavior, score correction, delivery modes, and grade item synchronization. Building a separate homework question engine would add a larger schema surface and new teacher/student presenter contracts.

Question/answer support should therefore be a separate sprint after the text-only submission lifecycle is stable. At that point the team should decide between:

- Homework-owned questions/answers for ungraded educational tasks.
- GradeAssessment-backed questions for formally graded homework.
- A hybrid bridge where `HomeworkAssignment.gradeAssessmentId` points to Grades only when grading is intentionally enabled.

## 6. Proposed Data Model

This section proposes schema only. Do not add these models in Sprint 14A.

### Required for Sprint 14B

#### `HomeworkSubmissionStatus`

Recommended Sprint 14B enum:

```prisma
enum HomeworkSubmissionStatus {
  DRAFT
  SUBMITTED
  LATE
  REVIEWED
  RETURNED
  CANCELLED
}
```

Sprint 14B should actively use only:

- `DRAFT`
- `SUBMITTED`
- `LATE`

`REVIEWED`, `RETURNED`, and `CANCELLED` are included to avoid an immediate enum migration in Sprint 14C, but routes do not need to expose all transitions at first. If the team prefers the smallest possible migration, add only `DRAFT`, `SUBMITTED`, and `LATE` in 14B, then extend later.

#### `HomeworkSubmittedByType`

Recommended enum:

```prisma
enum HomeworkSubmittedByType {
  STUDENT
  PARENT
  STAFF
}
```

Sprint 14B should only allow `STUDENT`. `PARENT` and `STAFF` are future policy markers.

#### `HomeworkSubmission`

Recommended Sprint 14B model:

```prisma
model HomeworkSubmission {
  id                   String                    @id @default(uuid())
  schoolId             String
  homeworkAssignmentId String
  homeworkTargetId     String
  studentId            String
  enrollmentId         String
  status               HomeworkSubmissionStatus  @default(DRAFT)
  body                 String?
  submittedByUserId    String?
  submittedByType      HomeworkSubmittedByType?
  submittedAt          DateTime?
  reviewedAt           DateTime?
  deletedAt            DateTime?
  createdAt            DateTime                  @default(now())
  updatedAt            DateTime                  @updatedAt

  school               School             @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  assignment           HomeworkAssignment @relation(fields: [homeworkAssignmentId, schoolId], references: [id, schoolId], onDelete: Restrict)
  target               HomeworkTarget     @relation(fields: [homeworkTargetId, schoolId], references: [id, schoolId], onDelete: Restrict)
  student              Student            @relation(fields: [studentId, schoolId], references: [id, schoolId], onDelete: Restrict)
  enrollment           Enrollment         @relation(fields: [enrollmentId, schoolId], references: [id, schoolId], onDelete: Restrict)
  submittedBy          User?              @relation(fields: [submittedByUserId], references: [id], onDelete: SetNull)

  @@unique([id, schoolId])
  @@unique([schoolId, homeworkTargetId])
  @@index([schoolId])
  @@index([schoolId, homeworkAssignmentId])
  @@index([schoolId, studentId])
  @@index([schoolId, enrollmentId])
  @@index([schoolId, status])
  @@index([schoolId, homeworkAssignmentId, status])
  @@index([schoolId, studentId, status])
  @@index([schoolId, submittedAt])
  @@index([deletedAt])
}
```

Notes:

- `@@unique([schoolId, homeworkTargetId])` enforces one current submission per target for Sprint 14B.
- Attempt history is intentionally deferred.
- `body` should be nullable while draft exists and validated as non-empty on submit if text is required.
- `deletedAt` is optional but recommended because submissions are user-generated content and may need administrative removal without physical deletion.
- `reviewedAt` is included for read model stability, but review writes should wait for Sprint 14C.
- All relations use tenant-safe composite foreign keys where the target model supports `@@unique([id, schoolId])`.

### Deferred or Later Models

#### `HomeworkSubmissionAttempt`

Status: deferred.

Use when the product approves resubmissions, teacher-returned work, or immutable attempt history.

```prisma
model HomeworkSubmissionAttempt {
  id                   String                   @id @default(uuid())
  schoolId             String
  homeworkSubmissionId String
  attemptNumber        Int
  status               HomeworkSubmissionStatus
  body                 String?
  submittedByUserId    String?
  submittedByType      HomeworkSubmittedByType?
  submittedAt          DateTime?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt

  submission           HomeworkSubmission @relation(fields: [homeworkSubmissionId, schoolId], references: [id, schoolId], onDelete: Restrict)

  @@unique([id, schoolId])
  @@unique([schoolId, homeworkSubmissionId, attemptNumber])
  @@index([schoolId, homeworkSubmissionId])
  @@index([schoolId, status])
  @@index([schoolId, submittedAt])
}
```

If this model is introduced later, `HomeworkSubmission` can represent the current rollup and `HomeworkSubmissionAttempt` can store immutable historical attempts.

#### `HomeworkSubmissionReview`

Status: Sprint 14C candidate, not Sprint 14B.

```prisma
enum HomeworkSubmissionReviewOutcome {
  ACCEPTED
  NEEDS_REVISION
  REJECTED
}

model HomeworkSubmissionReview {
  id                   String                          @id @default(uuid())
  schoolId             String
  homeworkSubmissionId String
  homeworkAssignmentId String
  homeworkTargetId     String
  studentId            String
  reviewedByUserId     String?
  outcome              HomeworkSubmissionReviewOutcome
  note                 String?
  reviewedAt           DateTime                        @default(now())
  createdAt            DateTime                        @default(now())
  updatedAt            DateTime                        @updatedAt

  submission           HomeworkSubmission @relation(fields: [homeworkSubmissionId, schoolId], references: [id, schoolId], onDelete: Restrict)
  assignment           HomeworkAssignment @relation(fields: [homeworkAssignmentId, schoolId], references: [id, schoolId], onDelete: Restrict)
  target               HomeworkTarget     @relation(fields: [homeworkTargetId, schoolId], references: [id, schoolId], onDelete: Restrict)
  student              Student            @relation(fields: [studentId, schoolId], references: [id, schoolId], onDelete: Restrict)
  reviewedBy           User?              @relation(fields: [reviewedByUserId], references: [id], onDelete: SetNull)

  @@unique([id, schoolId])
  @@index([schoolId, homeworkSubmissionId])
  @@index([schoolId, homeworkAssignmentId])
  @@index([schoolId, homeworkTargetId])
  @@index([schoolId, studentId])
  @@index([schoolId, outcome])
  @@index([schoolId, reviewedAt])
}
```

`NEEDS_REVISION` requires a product decision. Current `HomeworkTargetStatus` has no `RETURNED` state. Either add a target status later or keep return/revision state only on `HomeworkSubmission`.

#### `HomeworkSubmissionAttachment`

Status: deferred to a file proof sprint.

```prisma
enum HomeworkSubmissionAttachmentKind {
  PROOF
  TEACHER_FEEDBACK
}

model HomeworkSubmissionAttachment {
  id                   String                           @id @default(uuid())
  schoolId             String
  homeworkSubmissionId String
  fileId               String
  kind                 HomeworkSubmissionAttachmentKind @default(PROOF)
  caption              String?
  sortOrder            Int                              @default(0)
  createdByUserId      String?
  createdAt            DateTime                         @default(now())
  updatedAt            DateTime                         @updatedAt
  deletedAt            DateTime?

  submission           HomeworkSubmission @relation(fields: [homeworkSubmissionId, schoolId], references: [id, schoolId], onDelete: Restrict)
  file                 File               @relation(fields: [fileId], references: [id], onDelete: Restrict)
  createdBy            User?              @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@unique([id, schoolId])
  @@unique([schoolId, homeworkSubmissionId, fileId])
  @@index([schoolId, homeworkSubmissionId])
  @@index([schoolId, fileId])
  @@index([schoolId, kind])
  @@index([deletedAt])
}
```

Use a dedicated homework submission attachment relation instead of the current generic `Attachment` model unless the Files/Attachment module is extended with homework-aware validation, permissions, and resource authorization.

#### Homework Questions and Answers

Status: deferred.

Only add these if the team chooses a Homework-owned question engine instead of a Grades-backed bridge.

Candidate models:

- `HomeworkQuestion`
- `HomeworkQuestionOption`
- `HomeworkSubmissionAnswer`

Important rules:

- Questions must belong to `HomeworkAssignment` through composite school-safe keys.
- Answers must belong to `HomeworkSubmission` and the same `HomeworkAssignment`.
- Answer keys/correctness must never be exposed to Student or Parent presenters.
- Question ordering needs stable `sortOrder`.
- Required/optional questions need explicit validation.
- File-upload answers should wait until file proof security is ready.

## 7. Proposed API Contracts

These contracts are proposed only. Do not implement them in Sprint 14A.

### Student App Routes

#### `GET /api/v1/student/homeworks/:homeworkId/submission`

Recommended for Sprint 14B.

Actor: student.

Ownership/permission:

- Actor must be current student.
- Student must have active enrollment in current school.
- Homework must have a target for current `studentId` and `enrollmentId`.
- Assignment must be visible to student.

Request body: none.

Response shape:

```json
{
  "submission": {
    "id": "submission-id",
    "homeworkId": "homework-id",
    "targetId": "target-id",
    "status": "draft",
    "body": "Current text",
    "submittedAt": null,
    "reviewedAt": null,
    "late": false,
    "review": null,
    "attachments": [],
    "answers": [],
    "createdAt": "2026-05-25T00:00:00.000Z",
    "updatedAt": "2026-05-25T00:00:00.000Z"
  }
}
```

If no submission exists, return:

```json
{
  "submission": null
}
```

Error cases:

- `404` for missing, cross-school, no target, or other-student homework.
- `404` for draft/cancelled/archived/deleted assignment.
- `403` only when actor type or app route access fails by existing convention.

#### `POST /api/v1/student/homeworks/:homeworkId/submission/resolve`

Recommended for Sprint 14B.

Purpose: create or return the current draft/current submission for the student's target.

Request body:

```json
{}
```

Response: same as student submission detail.

Error cases:

- `404` for unsafe ownership failures.
- `409` if assignment is closed, cancelled, archived, deleted, target is excused, or submission is already submitted/reviewed and cannot be edited.

#### `PATCH /api/v1/student/homeworks/:homeworkId/submission`

Recommended for Sprint 14B.

Purpose: save text/body before submit.

Request body:

```json
{
  "body": "My completed homework response."
}
```

Response: current submission detail.

Validation:

- `body` must be a string.
- Set a maximum length in DTO/use-case to prevent unbounded text.
- Empty body may be allowed for draft but should be rejected on submit if text is the only enabled submission method.

Error cases:

- `404` for unsafe ownership failures.
- `409` if no editable draft exists, assignment is no longer open, target is excused, or submission already submitted/reviewed.
- `400` for invalid body.

#### `POST /api/v1/student/homeworks/:homeworkId/submission/submit`

Recommended for Sprint 14B.

Purpose: finalize the current text submission.

Request body:

```json
{
  "body": "Optional final body override."
}
```

Response:

```json
{
  "submission": {
    "id": "submission-id",
    "homeworkId": "homework-id",
    "targetId": "target-id",
    "status": "submitted",
    "body": "My completed homework response.",
    "submittedAt": "2026-05-25T00:00:00.000Z",
    "reviewedAt": null,
    "late": false,
    "review": null,
    "attachments": [],
    "answers": [],
    "createdAt": "2026-05-25T00:00:00.000Z",
    "updatedAt": "2026-05-25T00:00:00.000Z"
  },
  "target": {
    "status": "submitted",
    "submittedAt": "2026-05-25T00:00:00.000Z"
  }
}
```

Error cases:

- `404` for unsafe ownership failures.
- `409` if assignment is closed/cancelled/archived/deleted, target is excused, or submission is not editable.
- `409` if assignment is not `PUBLISHED`.
- `400` if body is required and still empty.

Late behavior:

- If `now > HomeworkAssignment.dueAt` and assignment is still `PUBLISHED`, set submission status to `LATE` and target status to `LATE`.

#### `GET /api/v1/student/homeworks/:homeworkId/submission/history`

Deferred.

Do not add until `HomeworkSubmissionAttempt` exists.

### Teacher App Routes

#### `GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions`

Sprint 14C candidate.

Actor: teacher.

Ownership/permission:

- Teacher must own the `TeacherSubjectAllocation` represented by `classId`.
- Homework must belong to that allocation.
- Same-school unowned and cross-school records should return safe not-found behavior.

Query params:

- `status`
- `studentId`
- `submittedFrom`
- `submittedTo`
- pagination params using project conventions

Response:

```json
{
  "items": [
    {
      "submissionId": "submission-id",
      "homeworkId": "homework-id",
      "targetId": "target-id",
      "student": {
        "id": "student-id",
        "displayName": "Student Name"
      },
      "status": "submitted",
      "targetStatus": "submitted",
      "late": false,
      "submittedAt": "2026-05-25T00:00:00.000Z",
      "reviewedAt": null,
      "bodyPreview": "First words of the response",
      "attachmentsCount": 0,
      "answersCount": 0
    }
  ],
  "meta": {
    "total": 1,
    "submitted": 1,
    "late": 0,
    "reviewed": 0,
    "missing": 0,
    "excused": 0
  }
}
```

#### `GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId`

Sprint 14C candidate.

Response:

```json
{
  "submission": {
    "id": "submission-id",
    "homeworkId": "homework-id",
    "targetId": "target-id",
    "student": {
      "id": "student-id",
      "displayName": "Student Name"
    },
    "status": "submitted",
    "targetStatus": "submitted",
    "body": "Full submitted response",
    "submittedAt": "2026-05-25T00:00:00.000Z",
    "reviewedAt": null,
    "late": false,
    "review": null,
    "attachments": [],
    "answers": []
  }
}
```

#### `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review`

Sprint 14C candidate.

Request body:

```json
{
  "outcome": "accepted",
  "note": "Good work."
}
```

Response:

```json
{
  "submission": {
    "id": "submission-id",
    "status": "reviewed",
    "reviewedAt": "2026-05-25T00:00:00.000Z"
  },
  "review": {
    "id": "review-id",
    "outcome": "accepted",
    "note": "Good work.",
    "reviewedAt": "2026-05-25T00:00:00.000Z"
  },
  "target": {
    "status": "reviewed",
    "reviewedAt": "2026-05-25T00:00:00.000Z"
  }
}
```

Deferred policy:

- Scoring and grade sync.
- Return/resubmit flow unless explicitly included.

#### `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/excuse`

Sprint 14C candidate or later.

Purpose: mark target excused. It should not require a submission row.

Request body:

```json
{
  "note": "Medical excuse approved."
}
```

Response:

```json
{
  "target": {
    "status": "excused",
    "excusedAt": "2026-05-25T00:00:00.000Z"
  }
}
```

#### `POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/reopen`

Deferred.

Only add after a clear resubmission policy exists. Reopen requires a decision on attempt history and whether `HomeworkTargetStatus` needs a `RETURNED` or `REOPENED` state.

### Parent App Routes

#### `POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit`

Deferred.

Parent submit-on-behalf-of-child should not be added in Sprint 14B. Parent App should remain read-only. Later approval would need:

- Guardian ownership check.
- Child active enrollment check.
- Assignment target check.
- Product policy for whether parent submissions are distinguishable from student submissions.
- Audit log entry identifying parent actor and child target.

Parent read routes can later include submission visibility without adding parent mutation routes.

### Core/Admin Routes

Core/admin submission routes are useful for school admin operations but should not be required for Sprint 14B.

Candidate routes for Sprint 14C or later:

| Route | Recommendation |
| --- | --- |
| `GET /api/v1/homework/assignments/:homeworkId/submissions` | Later, for permissioned school admin/core read. |
| `GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId` | Later, for permissioned school admin/core read. |
| `POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review` | Later, only if non-teacher review is approved by permission model. |
| `POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/excuse` | Later, for admin/teacher operations depending on permission policy. |

Core routes should require explicit permissions such as future `homework.submissions.view`, `homework.submissions.review`, and `homework.submissions.manage` if/when permissions are added. Do not add permissions in Sprint 14A.

## 8. Ownership and Security Rules

### Student Submission Rules

- Student may submit only their own homework target.
- Student cannot submit another student's homework.
- Student cannot submit homework without an active enrollment in the current school.
- Student cannot submit homework if target enrollment does not match current enrollment.
- Student cannot submit draft, cancelled, archived, deleted, or not-yet-published homework.
- Student cannot submit closed homework in Sprint 14B.
- Student can submit late only if assignment remains `PUBLISHED` and product policy permits late submission after `dueAt`.
- Student cannot submit an excused target unless a later reopen policy explicitly allows it.
- Student cannot submit a reviewed submission unless a later resubmission policy explicitly allows it.
- Student routes must not expose `schoolId`, `organizationId`, internal membership ids, or guardian data.

### Parent Rules

- Parent visibility remains read-only in Sprint 14B.
- Parent cannot submit on behalf of child in Sprint 14B.
- Parent can see only owned child's homework and only within the current school.
- Later parent submission requires explicit product approval and audit logging.

### Teacher Rules

- Teacher can list/review only homework for owned `TeacherSubjectAllocation` records.
- Teacher cannot review another teacher's same-school homework unless permission model explicitly allows it.
- Cross-school teacher access must return safe not-found behavior.
- Teacher routes must not expose tenant ids.

### School Admin/Core Rules

- School admin/core review/manage behavior should be governed by explicit future permissions.
- Core routes should use school-scoped repository queries and composite tenant-safe keys.
- Admin review should not be silently implied by existing assignment manage permission unless product approves it.

### Error Convention

Recommended convention based on current tests:

- Cross-school data: safe `404`.
- Same-school unauthorized resource ownership: safe `404` where exposing existence would leak data.
- Actor type/app boundary failures: `403`.
- Invalid lifecycle transition: `409`.
- DTO validation failure: `400`.
- Missing authenticated/school scope context: existing auth/scope errors.

## 9. Status and Lifecycle Rules

### Current Target Statuses

Current `HomeworkTargetStatus` values:

- `ASSIGNED`
- `VIEWED`
- `SUBMITTED`
- `LATE`
- `MISSING`
- `REVIEWED`
- `EXCUSED`

### Recommended Submission and Target Coexistence

`HomeworkSubmission.status` should represent the submission content lifecycle.

`HomeworkTarget.status` should represent the student's assignment lifecycle for lists, dashboards, and parent/student status mapping.

Recommended mapping:

| Event | Submission status | Target status | Timestamp updates |
| --- | --- | --- | --- |
| Target materialized | none | `ASSIGNED` | `assignedAt` |
| Student opens homework | none or unchanged | keep current behavior unless explicit viewed mutation is added | no new timestamp in 14B |
| Student resolves draft | `DRAFT` | unchanged | submission `createdAt` |
| Student saves draft | `DRAFT` | unchanged | submission `updatedAt` |
| Student submits before due | `SUBMITTED` | `SUBMITTED` | submission `submittedAt`, target `submittedAt` |
| Student submits after due while published | `LATE` | `LATE` | submission `submittedAt`, target `submittedAt` |
| Assignment closes without submission | no submission | `MISSING` only if a close/background use-case writes it; otherwise computed read status | optional future write |
| Teacher accepts/reviews | `REVIEWED` | `REVIEWED` | submission `reviewedAt`, target `reviewedAt` |
| Teacher excuses target | no submission required | `EXCUSED` | target `excusedAt` |
| Teacher returns/reopens | deferred | deferred | depends on future attempt policy |

### `submittedAt`

Set only when the student submits. Do not set it on draft resolve or draft save.

### `reviewedAt`

Set only when a teacher/core review action is implemented. Do not set it in Sprint 14B.

### Late Submission

Recommended Sprint 14B policy:

- Allow late submissions after `dueAt` only if assignment status remains `PUBLISHED`.
- Mark both submission and target as late.
- Block submissions once assignment is `CLOSED`, `CANCELLED`, `ARCHIVED`, deleted, or not published.

### Missing/Not Completed

Current Student/Parent read APIs already compute `not_completed` when assignment is closed or past due without a completed target state.

Sprint 14B should not require a background job to write `MISSING`. A later closeout/reconciliation sprint can decide whether closing an assignment materializes `MISSING` for unsubmitted targets.

### Current Student/Parent Status Mapping Impact

Existing Student/Parent status strings are:

- `waiting`
- `completed`
- `not_completed`

Recommended compatibility mapping after submissions:

| Target status | Student/Parent status |
| --- | --- |
| `ASSIGNED` | `waiting` unless assignment is past due/closed |
| `VIEWED` | `waiting` unless assignment is past due/closed |
| `SUBMITTED` | `completed` |
| `LATE` | `completed` with `late: true`, or `not_completed` only if product requires review-first completion |
| `MISSING` | `not_completed` |
| `REVIEWED` | `completed` |
| `EXCUSED` | Prefer a distinct future `excused` status only if API contract expands; otherwise do not mark as `not_completed` |

Because existing clients only know three statuses, Sprint 14B should preserve those strings and add detailed nested submission/target fields instead of changing the list status contract.

## 10. Integration Boundaries

### Files and Attachments

Current Files module has:

- `File` as uploaded object metadata.
- Generic `Attachment` as a resource link to a file.
- Resource validation currently limited to known resource types such as admissions application and attendance excuse request.
- File download guarded by file school scope and permissions, not by homework-specific resource ownership.

Recommendation:

- Sprint 14B should be text-only.
- Do not add file proof upload in Sprint 14B.
- For a later file proof sprint, Homework should reference `File` through a dedicated `HomeworkSubmissionAttachment`/`HomeworkSubmissionFile` model, or the generic `Attachment` module must first be extended with homework-specific resource validation and permissions.
- Do not expose raw `File` ids or download links to Student/Parent unless the download path checks homework target ownership or teacher allocation ownership.
- Parent visibility for proof attachments can be read-only later through parent child ownership checks.
- Teacher feedback attachments should be a separate attachment kind or separate model field so student proof and teacher feedback are not confused.

Ownership checks needed for later file proof:

- Student upload: current student owns target and editable submission.
- File ownership: uploaded file belongs to current school and was uploaded by the current actor or through an approved upload session.
- Link ownership: file can be linked only to the actor's own submission.
- Teacher read: teacher owns class/allocation homework.
- Parent read: parent owns child and child target.
- Cross-school: safe `404`.

### Grades

Current Grades module already has a complete assessment/submission/question/answer/review/sync pipeline. `HomeworkAssignment.gradeAssessmentId` is nullable and points to `GradeAssessment`.

Recommendation:

- Do not link `HomeworkSubmission` directly to `GradeSubmission` in Sprint 14B.
- Do not create `GradeItem` or call grade sync on homework submit.
- Do not auto-create grade assessments from homework submissions.
- Keep `gradeAssessmentId` as a future bridge for intentionally graded homework.
- If a later sprint bridges to Grades, it should be explicit and probably support one of these modes:
  - Homework text submission only, teacher manually creates/updates grades elsewhere.
  - Homework linked to existing `GradeAssessment` for question-based graded work.
  - Homework review creates a grade item only after teacher action, not on student submit.

Open design point for later: if one homework should map to one grade assessment, consider a future uniqueness constraint or bridge model. Do not change it in Sprint 14B.

### Notifications, Email, Communication, XP, Rewards

Current enum surfaces do not include clear Homework event types:

- Notification source modules do not include `HOMEWORK`.
- XP source types do not include `HOMEWORK`.
- Communication announcements are a separate module, not an automatic event bus for homework.

Recommendation:

- No notification center event in Sprint 14B.
- No email in Sprint 14B.
- No XP/reward grants in Sprint 14B.
- No communication announcement side effects in Sprint 14B.
- Keep future event hook names in use-case boundaries only if needed, but do not publish events until the integration contract is approved.

Potential future hooks:

- `homework.submission.submitted`
- `homework.submission.late_submitted`
- `homework.submission.reviewed`
- `homework.target.excused`
- `homework.submission.returned`

### Audit Logs

Existing homework mutations audit sensitive actions. Homework submission mutations should follow that pattern.

Recommended audit entries:

- Student submission resolved/created if considered sensitive enough.
- Student submission submitted.
- Teacher review submitted.
- Teacher target excused.
- Teacher/core reopen/return actions.

Draft save may be too noisy for audit logs. Prefer auditing final submit and review actions first.

## 11. Backward Compatibility Requirements

Sprint 14B and later must preserve current routes and shapes:

- Core assignment routes remain under `/api/v1/homework/assignments`.
- Teacher management routes remain under `/api/v1/teacher/homeworks/classes/:classId/assignments`.
- Student read routes remain under `/api/v1/student/homeworks`.
- Parent read routes remain under `/api/v1/parent/children/:studentId/homeworks`.
- Existing Sprint 13F closeout expectations should remain true except for deliberately added submission routes.

Must not break:

- Homework creation/update/publish/close/cancel.
- Target materialization.
- Teacher ownership checks.
- Student own homework list/detail.
- Parent owned-child homework list/detail.
- Existing three-value Student/Parent status contract.
- Existing `questions: []` and `attachments: []` placeholders until those features exist.
- Hiding of `schoolId`, `organizationId`, `enrollmentId`, guardian internals, and tenant ids in app-facing presenters.
- No grade/notification/email/XP side effects.

When submissions exist, existing Student/Parent detail responses may fill `submission` from `null` to a nested object. That is backward-compatible with the existing placeholder contract.

## 12. Testing Strategy

### Sprint 14B Unit/Use-Case Tests

Add focused use-case tests for:

- Resolve creates draft for current student's target.
- Resolve returns existing draft/current submission.
- Patch saves body only while editable.
- Submit before due sets submission `SUBMITTED` and target `SUBMITTED`.
- Submit after due while published sets submission `LATE` and target `LATE`.
- Submit sets `submittedAt` exactly once.
- Submit rejects empty body if text is required.
- Submit rejects closed/cancelled/archived/deleted/draft assignment.
- Submit rejects excused target.
- Submit rejects duplicate finalized submission.
- No grade/notification/email/XP side effects.

### Repository/Adapter Tests

Add repository tests for:

- Composite school-safe lookup by `homeworkId`, `targetId`, `studentId`, and `enrollmentId`.
- Current submission lookup by target.
- Transactional submit updates submission and target together.
- Cross-school records are not returned.
- Soft-deleted submissions are ignored if `deletedAt` is adopted.

### Presenter Tests

Add presenter tests for:

- Student draft detail.
- Student submitted detail.
- Late submission detail.
- Existing Student/Parent list status stays compatible.
- Teacher list/detail shapes once Sprint 14C begins.
- Tenant/internal fields are not exposed.
- Deferred arrays remain `attachments: []` and `answers: []`.

### Security Tests

Required cases:

- Student submits own homework.
- Student cannot submit another student's homework.
- Student cannot submit same-school unassigned homework.
- Student cannot submit cross-school homework.
- Student cannot submit draft/cancelled/archived/closed homework.
- Student cannot submit outside active enrollment.
- Parent submit route is absent or forbidden.
- Parent read remains read-only.
- Teacher reviews only owned homework once review routes exist.
- Same-school unowned teacher homework returns safe not-found.
- Cross-school teacher review returns safe not-found.
- Tenant fields are not exposed.
- Grade/notification/email/XP side effects do not happen.

### E2E Closeout

A later final closeout sprint should add:

- Full student submit flow.
- Late submit flow.
- Teacher review flow after 14C.
- Parent read after submission after 14D.
- Confirm deferred files/questions/parent submit stay absent until their sprint.
- Confirm `/api/v1` prefix on all new routes.

## 13. Recommended Sprint Breakdown

Recommended staged plan:

| Sprint | Scope |
| --- | --- |
| 14B — Student Homework Submission Foundation | Add `HomeworkSubmission` schema/migration, text-only student resolve/patch/submit/read, target status updates, student presenter integration, no files/questions/grades/notifications. |
| 14C — Teacher Submission Review | Teacher submission list/detail/review/excuse, review model or review fields, target reviewed/excused lifecycle, audit logs. |
| 14D — Parent Submission Visibility | Parent read-only submission summary/detail in existing child homework views, no parent submit. |
| 14E — File Proof Attachments | Dedicated homework submission attachment model or hardened generic attachment integration, secure upload/link/download ownership, parent/teacher visibility. |
| 14F — Question/Answer or Grade Bridge Audit | Decide between Homework-owned questions and Grades-backed assessment bridge; design question/answer schema and grading policy. |
| 14G — Final Closeout + Docs/Postman | Full verification, route inventory, docs, Postman collection, final closeout tests. |

Optional adjustment:

- If teacher review is needed immediately for operations, 14C can be split into `14C Teacher Submission Read APIs` and `14D Teacher Review Actions`, pushing Parent visibility and files one sprint later.

## 14. Risks and Open Questions

### Risks

- Generic `Attachment` is not homework-aware today. Using it directly could bypass resource-specific homework ownership and visibility rules.
- File download currently needs homework-specific authorization before student proof files are exposed through app routes.
- `HomeworkTargetStatus` has review/excuse states but no returned/reopened state. Resubmission policy may require an enum extension or an attempt model.
- Student/Parent currently treat `SUBMITTED` as `completed`. If product later requires teacher review before completion, client status semantics will need careful migration.
- The Grades module already has a question/submission system. Reusing it too early may accidentally import grading side effects into simple homework.
- Notification/XP enum surfaces do not currently include Homework; adding side effects later will likely require schema and contract updates.

### Open Questions

- Should late submissions be accepted until assignment close, or should `dueAt` hard-block submit? Recommendation for 14B: accept late while `PUBLISHED`, block after `CLOSED`.
- Should `body` be required for all 14B submissions? Recommendation: yes, because files/questions are deferred.
- Should draft resolution be explicit or should `PATCH` auto-create draft? Recommendation: explicit `resolve` for stable idempotent client behavior.
- Should closing an assignment materialize `MISSING` targets immediately? Recommendation: defer; keep current computed not-completed behavior in Sprint 14B.
- Should teacher review support `NEEDS_REVISION` in first review sprint? Recommendation: defer unless attempt/reopen behavior is approved.
- Should parent see teacher review notes by default? Recommendation: yes for final accepted/rejected notes only after Parent visibility sprint, but sensitive internal notes should require a separate private field if needed.

## 15. Final Recommendation

Sprint 14B should implement a text-only Student Homework Submission Foundation.

Include:

- `HomeworkSubmission` persistence.
- Student current submission read.
- Student draft resolve.
- Student draft body save.
- Student submit.
- `SUBMITTED`/`LATE` submission statuses.
- Matching `HomeworkTarget.status` and `submittedAt` updates.
- Student/Parent-compatible response placeholders for future files/questions.
- Security tests for own-target-only submission and safe not-found behavior.

Do not include:

- File proof attachments.
- Homework questions/answers.
- Parent submission.
- Teacher review.
- Grade sync.
- Notifications/email/XP/rewards.
- Communication announcements.
- Postman/README/project-structure changes.

This keeps Sprint 14B small enough to verify the core lifecycle and tenancy model before adding heavier integrations.
