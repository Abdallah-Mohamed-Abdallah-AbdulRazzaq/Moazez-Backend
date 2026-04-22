# Sprint Zero Checklist

Before implementing Sprint 1, confirm all of the following:

## Architecture
- [ ] README exists
- [ ] CLAUDE.md exists
- [ ] architecture decision file exists
- [ ] folder structure is approved
- [ ] modules list is approved
- [ ] user types are approved
- [ ] V1 scope is approved

## Stack
- [ ] NestJS selected
- [ ] PostgreSQL selected
- [ ] Prisma selected
- [ ] Redis selected
- [ ] BullMQ selected
- [ ] object storage strategy selected
- [ ] Socket.io selected
- [ ] Docker selected

## Engineering Rules
- [ ] migration-only database changes
- [ ] no business logic in controllers
- [ ] no local production file storage
- [ ] no scope bypass
- [ ] no V1 scope expansion

## Product Boundaries
- [ ] Platform -> Organization -> School hierarchy is fixed
- [ ] school dashboard is source of truth
- [ ] teacher/student/parent apps are consumer layers

## First Sprint Readiness
- [ ] root docs copied
- [ ] team aligned
- [ ] agent rules aligned