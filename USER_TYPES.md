# Approved User Types

## Official User Types

- platform_user
- organization_user
- school_user
- teacher
- parent
- student
- applicant
- pickup_delegate
- service_account

## Important Rule

Do not confuse:
- user_type
- role
- membership
- scope
- relationship attributes

These are different concepts.

## Definitions

### platform_user
Internal platform actor.
Examples:
- platform_super_admin
- platform_ops_admin
- platform_support_admin

### organization_user
Central actor for an organization or school group.
Examples:
- organization_owner
- organization_admin
- organization_manager

### school_user
Administrative or operational school actor.
Examples:
- school_admin
- school_principal
- school_registrar
- school_academic_admin
- school_attendance_officer
- school_counselor

### teacher
Teaching actor with class/subject operational access.

**Constraint: Exactly one active membership at any time.**

This is enforced at the database level via a partial unique index on the `memberships` table:
- A teacher cannot have two active memberships simultaneously.
- A teacher moving to a new school requires closing the old membership (status → `inactive` or `transferred`) before opening a new one.
- See `SECURITY_MODEL.md` section 3 and `PRISMA_CONVENTIONS.md` section 10.

Multi-school scenarios (e.g., a consultant teaching at multiple schools in the same organization) are explicitly OUT of V1 scope.

### parent
Guardian-side actor with access limited to linked children.

### student
Learner-side actor with access limited to own data.

### applicant
Temporary pre-admission actor used in applicant portal flows.

### pickup_delegate
Limited actor used only for pickup/delegated collection flows.

### service_account
Non-human system actor for jobs, notifications, integrations, and internal automation.

## Relationship Attributes

The following are NOT user types:
- father
- mother
- guardian
- relative

These belong in relationship fields or guardian attributes.

## Role Rule

Roles are separate from user types.
Examples:
- school_admin is a role, not a user type
- principal is a role, not a user type
- teacher can have teacher-specific roles

## Multi-School Cardinality Summary

| User type         | Active memberships allowed                 |
| ----------------- | ------------------------------------------ |
| platform_user     | N/A (platform-level)                       |
| organization_user | 1 organization, N schools within it        |
| school_user       | 1 school                                   |
| teacher           | **1 school (enforced by DB)**              |
| parent            | N schools (via children)                   |
| student           | 1 enrollment                               |
| applicant         | N/A (pre-admission)                        |
| pickup_delegate   | Per-student, not school                    |
| service_account   | As configured                              |