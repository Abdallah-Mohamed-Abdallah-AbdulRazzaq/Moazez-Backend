# Approved V1 Scope

## V1 Global Decisions

- **API versioning**: All endpoints are prefixed with `/api/v1/`. This is mandatory and non-negotiable.
- **Teacher single-school rule**: In V1, a teacher belongs to exactly one school. Multi-school teacher support is DEFERRED to V2.
- **Tenancy enforcement**: Application-level via Prisma `schoolScope` extension. See `adr/ADR-0001`.
- **Target deployment**: Single modular monolith via Docker. No Kubernetes, no service mesh in V1.

## V1 Includes

### Platform Core
- platform admin basic
- organizations
- schools
- activation status
- basic feature control

### IAM
- auth
- users
- roles
- permissions
- memberships
- sessions

### Settings
- branding
- school profile
- roles and permissions management
- users management
- security settings basic
- audit logs
- notification templates basic

### Files
- uploads
- attachments
- secure file access

### Admissions
- leads
- applications
- documents
- tests
- interviews
- decisions
- enroll from application

### Students
- students
- guardians
- enrollments
- transfer
- withdrawal
- promotion
- documents
- medical profile
- notes
- timeline

### Academics
- years
- terms
- stages
- grades
- sections
- classrooms
- subjects
- allocations
- rooms
- calendar
- timetable
- curriculum basic
- lesson plans basic

### Attendance
- policies
- roll-call
- entries
- absences
- excuses
- basic reports

### Grades
- assessments
- grade entry
- gradebook
- rules
- analytics basic
- publish / approve / lock
- student grade snapshot

### Reinforcement
- overview
- tasks
- templates
- rewards
- review queue
- basic xp linkage

### Communication
- conversations
- messages
- announcements
- notifications

### Teacher App Basic
- home
- schedule
- my classes
- classroom
- homework basic
- messages
- profile
- settings

### Student App Basic
- home
- schedule
- subjects
- subject details
- attachments
- homeworks
- exams basic
- grades read
- behavior read
- progress
- profile basic
- messages
- announcements

### Parent App Basic
- onboarding
- auth
- home
- children
- grades
- behavior
- progress
- schedule
- homeworks
- reports basic
- messages
- profile
- applicant portal basic
- smart pickup basic
- tasks basic

### Dashboard
- summary
- alerts
- activity feed
- core summary cards

## V1 Excludes

- finance module
- HR module
- wallet
- marketplace
- advanced smart pickup
- advanced analytics builder
- enterprise billing engine
- deep integration automation
- advanced gamified economy

## Scope Discipline Rule

No feature outside this file may be implemented in V1 without explicit approval.