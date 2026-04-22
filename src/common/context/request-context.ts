import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { UserType } from '@prisma/client';

export interface RequestActor {
  id: string;
  userType: UserType;
}

export interface ActiveMembership {
  membershipId: string;
  schoolId: string | null;
  organizationId: string;
  roleId: string;
  permissions: string[];
}

export interface AcademicContext {
  academicYearId?: string;
  termId?: string;
}

export interface ScopeBypassFlags {
  bypassSchoolScope: boolean;
  includeSoftDeleted: boolean;
}

export interface RequestContext {
  requestId: string;
  actor?: RequestActor;
  activeMembership?: ActiveMembership;
  academicContext?: AcademicContext;
  bypass: ScopeBypassFlags;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function createRequestContext(requestId?: string): RequestContext {
  return {
    requestId: requestId ?? randomUUID(),
    bypass: { bypassSchoolScope: false, includeSoftDeleted: false },
  };
}

export function setActor(actor: RequestActor): void {
  const ctx = storage.getStore();
  if (ctx) ctx.actor = actor;
}

export function setActiveMembership(membership: ActiveMembership): void {
  const ctx = storage.getStore();
  if (ctx) ctx.activeMembership = membership;
}

export function setAcademicContext(academic: AcademicContext): void {
  const ctx = storage.getStore();
  if (ctx) ctx.academicContext = academic;
}

export async function withBypassSchoolScope<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = storage.getStore();
  if (!ctx) return fn();
  const previous = ctx.bypass.bypassSchoolScope;
  ctx.bypass.bypassSchoolScope = true;
  try {
    return await fn();
  } finally {
    ctx.bypass.bypassSchoolScope = previous;
  }
}

export async function withSoftDeleted<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = storage.getStore();
  if (!ctx) return fn();
  const previous = ctx.bypass.includeSoftDeleted;
  ctx.bypass.includeSoftDeleted = true;
  try {
    return await fn();
  } finally {
    ctx.bypass.includeSoftDeleted = previous;
  }
}
