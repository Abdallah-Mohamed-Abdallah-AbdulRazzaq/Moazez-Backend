
# Approved Modules

## Platform
- platform-admin
- organizations
- schools
- plans
- subscriptions
- feature-flags
- platform-audit

## IAM
- auth
- users
- roles
- permissions
- memberships
- sessions

## Settings
- branding
- school-settings
- templates
- integrations
- security
- audit
- backup

## Files
- uploads
- attachments
- file-links

## Admissions
- leads
- applications
- documents
- tests
- interviews
- decisions
- applicant-portal

## Academics
- overview
- structure
- subjects
- teacher-allocation
- rooms
- calendar
- curriculum
- lesson-plans
- timetable

## Students
- students
- guardians
- enrollments
- documents
- medical
- notes
- transfers-withdrawals

## Attendance
- policies
- roll-call
- absences
- excuses
- reports

## Grades
- assessments
- gradebook
- analytics
- rules
- submissions

## Reinforcement
- overview
- tasks
- templates
- rewards
- review-queue
- xp

## Behavior
- categories
- records
- review-queue
- points
- overview

## Communication
- conversations
- messages
- announcements
- notifications
- meetings

## Teacher App
- home
- schedule
- my-classes
- classroom
- homeworks
- tasks
- xp-center
- messages
- profile
- settings

## Student App
- home
- schedule
- subjects
- subject-details
- attachments
- homeworks
- exams
- grades
- behavior
- progress
- hero-journey
- profile
- tasks
- messages
- announcements
- pickup

## Parent App
- onboarding
- auth
- home
- children
- grades
- behavior
- progress
- schedule
- homeworks
- reports
- messages
- profile
- smart-pickup
- tasks
- applicant-portal

## Dashboard
- summary
- alerts
- activity-feed

## Module Boundary Rule

Core business truth belongs to:
- admissions
- academics
- students
- attendance
- grades
- reinforcement
- behavior
- communication
- settings

App-facing modules must consume these modules, not redefine them.
