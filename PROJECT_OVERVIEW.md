# Project Overview

## What is Moazez?

Moazez is a multi-tenant educational SaaS platform.

It is designed to serve:
- platform operators
- organizations / school groups
- schools
- teachers
- parents
- students
- applicants

## Platform Hierarchy

The approved hierarchy is:

1. Platform
2. Organization
3. School

The platform owns multiple organizations.
An organization can represent:
- a single school
- a school group

Each organization owns one or more schools.

## Product Surfaces

The system includes:

1. Platform administration
2. School dashboard
3. Teacher app
4. Student app
5. Parent app
6. Applicant portal

## Operational Source of Truth

The school dashboard is the operational source of truth for:
- admissions
- academic structure
- student lifecycle
- attendance
- grades
- reinforcement
- communication
- settings

Teacher, student, and parent apps consume data from this core.

## Core Domain Areas

- Platform
- IAM
- Settings
- Files
- Admissions
- Academics
- Students
- Attendance
- Grades
- Reinforcement
- Communication
- Dashboard

## Architecture Philosophy

- modular monolith
- normalized database
- scoped authorization
- external object storage
- API-layer aggregation
- migration-driven schema evolution

## V1 Product Goal

V1 must deliver:
- a real platform admin layer
- a real school dashboard core
- a real teacher operational experience
- a real student academic experience
- a real parent monitoring experience

V1 is not intended to deliver:
- full ERP finance
- HR
- marketplace
- wallet economy
- full advanced smart pickup
- deep enterprise billing flows