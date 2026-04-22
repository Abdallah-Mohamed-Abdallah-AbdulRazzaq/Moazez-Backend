# Architecture Decision

## Approved Architecture

The backend uses a **modular monolith**.

## Approved Tech Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Redis
- BullMQ
- S3-compatible object storage
- Socket.io
- Swagger
- Docker

## Why Modular Monolith?

Because V1 needs:
- strong domain separation
- lower complexity than microservices
- fast implementation
- clean agent execution
- future extraction options if needed

## Core Rules

1. Domain modules own business truth.
2. App-facing modules are composition layers.
3. Database stays normalized.
4. API responses may be nested/aggregated.
5. File binaries live outside the database.
6. Every schema change must be a migration.

## Source of Truth Rule

The backend must respect frontend contracts:
- adapter-backed paths are fixed
- service-derived paths are implemented from current documented contracts

## Scope Rule

Every request must resolve:
- actor
- user type
- role
- membership
- scope
- school context
- academic year / term context when relevant

## Authorization Rule

Authorization is based on:
- user_type
- role
- membership
- scope

Not on role alone.

## Storage Rule

Binary files:
- never inside PostgreSQL as the main storage strategy
- never inside backend local project folders in production

Use:
- object storage for binaries
- database for metadata and ownership

## Communication Rule

Messaging and announcements are core modules.
Do not design them as optional add-ons.

## Audit Rule

Audit logging is mandatory for:
- auth events
- role changes
- settings changes
- admissions decisions
- enrollment changes
- attendance approvals
- grade publish/approve/lock actions
- reinforcement review actions

## Change Rule

Any architecture change must be documented in a new ADR file.