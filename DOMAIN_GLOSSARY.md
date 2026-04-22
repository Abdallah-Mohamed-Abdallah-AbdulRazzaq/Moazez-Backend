# Domain Glossary

Canonical definitions for every business term used in Moazez. When terms conflict between frontend and backend, this file wins.

## Identity & Tenancy

- **Platform** — The top-level layer owned by the Moazez operators. Manages organizations and platform-level settings.
- **Organization** — A customer entity. May represent a single school or a school group. All billing and cross-school operations happen at this level.
- **School** — A single operational unit within an organization. Source of truth for day-to-day academic operations.
- **User** — A person with credentials. One user has exactly one `user_type`.
- **User Type** — Immutable category: `platform_user`, `organization_user`, `school_user`, `teacher`, `parent`, `student`, `applicant`, `pickup_delegate`, `service_account`.
- **Role** — A named bundle of permissions, scoped to a school. NOT the same as `user_type`.
- **Permission** — A single action string (`module.resource.action`).
- **Membership** — A link between a user and a school (or organization), with a role and scope. A `teacher` has exactly one active membership enforced by DB constraint.
- **Session** — A single authenticated login, tracked for revocation.
- **Scope** — The contextual boundary (platform / organization / school / stage / grade / section / classroom / own-record-only) within which a permission is valid.

## Academic Structure

- **Academic Year** — A full school year (e.g., "2026/2027"). Has start and end dates. Exactly one is "active" per school.
- **Term** — A subdivision of an academic year (e.g., "Term 1"). Has start and end dates.
- **Stage** — The highest academic level (e.g., "Primary", "Middle", "Secondary").
- **Grade** — A level within a stage (e.g., "Grade 4"). Belongs to exactly one stage.
- **Section** — A subdivision of a grade (e.g., "Section A"). Belongs to exactly one grade.
- **Classroom** — A concrete group of students taught together (e.g., "4A-01"). Belongs to exactly one section. This is where actual teaching and attendance happen.
- **Subject** — A taught topic (e.g., "Mathematics"). Global within a school.
- **Teacher-Subject Allocation** — A record stating that a teacher teaches a subject to a classroom during a term.
- **Room** — A physical or virtual location where classes happen.
- **Timetable** — The scheduled instances of classroom + subject + teacher + room + period for a term.
- **Period** — A time slot in the daily schedule (e.g., Period 1 = 07:00-07:45).
- **Lesson Plan** — A teacher's plan for what to teach in a specific period.

## Student Lifecycle

- **Applicant** — A pre-admission person who has not yet been accepted.
- **Lead** — An admissions opportunity that has not yet become a formal application.
- **Application** — A formal admission request for a specific student.
- **Decision** — The formal accept / reject / waitlist outcome of an application.
- **Enrollment** — A student's placement into a specific classroom for a specific academic year / term. A student has exactly one active enrollment at any time.
- **Placement** — The current classroom of an active enrollment.
- **Transfer** — A move from one classroom / school to another. Creates a new enrollment, closes the old one.
- **Withdrawal** — A student leaves the school. Closes the active enrollment.
- **Promotion** — End-of-year movement to the next grade.

## Guardianship

- **Guardian** — A parent-type user linked to a student.
- **Relation** — `father`, `mother`, `guardian`, `relative`. A FIELD on guardian record, not a user type.
- **Primary Guardian** — The default contact for notifications and pickup. At least one per student.
- **Pickup Delegate** — A temporary authorized person to collect a student. A separate user type, not a parent.

## Attendance

- **Attendance Policy** — Rules for how attendance is computed, scoped by SCHOOL / STAGE / GRADE / SECTION / CLASSROOM. Priority: CLASSROOM > SECTION > GRADE > STAGE > SCHOOL.
- **Attendance Session** — A single roll-call event for a scope on a specific date.
- **Attendance Entry** — A single student's mark within a session (PRESENT, ABSENT, LATE, EXCUSED).
- **Excuse** — A formal justification for an absence, optionally with attachments.
- **Effective Policy** — The resolved policy for a given scope + date, using priority rules.
- **Session Status** — DRAFT or SUBMITTED. Only DRAFT sessions are editable.

## Assessments & Grades

- **Assessment** — A graded activity (test, quiz, homework, project). Lives in a term.
- **Assessment Type** — score-based or question-based.
- **Grade Item** — A single student's score on an assessment.
- **Gradebook** — A term-scoped view of all grade items for a classroom or subject.
- **Assessment Status** — `draft` → `published` → `approved` → `locked`.
- **Grade Rule** — Weighting and passing thresholds, resolved upward (grade > school).
- **Question** — A unit inside a question-based assessment.
- **Submission** — A student's answers to a question-based assessment.

## Behavior & Reinforcement

- **Behavior Note** — A positive or negative observation about a student, tied to points.
- **Reinforcement Task** — A teacher-assigned positive goal for students.
- **Reward** — A redeemable item tied to XP or approval.
- **Review Queue** — Reinforcement tasks awaiting teacher review.
- **XP** — Experience points accumulated by a student across sources (homework, exam, behavior, participation).
- **Rank Tier** — `bronze1..bronze3`, `silver1..silver3`, `gold1..gold3`, `master`.
- **Bonus XP** — Manual teacher-granted XP, capped by policy.
- **Daily Cap / Cooldown** — Limits preventing XP abuse.

## Hero Journey

- **Mission** — A gamified learning goal tied to a stage, lesson, quiz, and reward.
- **Objective** — A subtask within a mission.
- **Level** — A student's current position in the journey.
- **Badge** — An achievement unlock. Slug-identified.
- **Progress Status** — `on_track`, `at_risk`, `inactive`.

## Communication

- **Conversation** — A chat context between two or more users. May be 1:1 or group.
- **Announcement** — A one-way broadcast to a scope (school, grade, section, classroom).
- **Notification** — A system-emitted alert to a user via push / email / in-app.
- **Template** — A reusable announcement or notification content body.

## Smart Pickup

- **School Zone** — The geofence circle around a school entrance.
- **Pickup Request** — A parent's signal that they are arriving to collect a child.
- **Gate** — A named pickup point at a school.
- **Recent Calls** — Historical pickup requests.
- **Delegate Pickup** — A pickup performed by a `pickup_delegate` user.
- **Geofence Spoofing Risk Score** — A server-computed metric (0.0-1.0) estimating the likelihood of location spoofing.

## Files

- **File** — A binary object stored externally with metadata in the DB.
- **Attachment** — A link between a file and a business entity.
- **Signed URL** — A time-limited URL for accessing a private file.

## Audit

- **Audit Log** — An immutable record of a sensitive action.
- **Actor** — The user who performed the action.
- **Resource** — The entity the action affected.
- **Outcome** — `success`, `failure`, `denied`.

## Import / Export

- **Import Job** — A bulk upload job (students, teachers, etc.) processed asynchronously.
- **Validation Report** — The output of an import's validation pass, listing errors per row.
- **Commit** — The second phase of an import, where validated rows are persisted.

## System

- **Feature Flag** — A platform-level or organization-level toggle for enabling/disabling features.
- **Plan** — A subscription tier that determines what an organization can access.
- **Subscription** — An organization's active plan, billing period, and status.
