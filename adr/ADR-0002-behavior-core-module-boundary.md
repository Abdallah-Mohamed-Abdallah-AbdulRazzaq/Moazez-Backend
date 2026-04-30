# ADR-0002: Behavior Core Module Boundary

## Status

Accepted - 2026-04-30

## Context

Behavior appears in V1 student and parent app scopes and school dashboard planning, but `MODULES.md` did not list Behavior as a standalone core module. Sprint 6A defines Behavior as a school-scoped student conduct record system for positive observations and negative incidents.

## Decision

Behavior becomes a core module under `src/modules/behavior`.

## Consequences

- App-facing behavior APIs must consume the core Behavior module.
- Behavior points stay separate from XP, Rewards, Reinforcement Tasks, and Hero Journey.
- Sprint 6A Task 2 adds only the data model foundation and governance registration.
