import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  PlatformOrganizationArchivedException,
  PlatformOrganizationInvalidStatusTransitionException,
  PlatformSchoolArchivedException,
  PlatformSchoolInvalidStatusTransitionException,
} from './platform-admin-errors';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizePlatformName(value: string, field = 'name'): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new ValidationDomainException('Name is required', { field });
  }
  return normalized;
}

export function normalizeOptionalPlatformName(value?: string): string | undefined {
  return value === undefined ? undefined : normalizePlatformName(value);
}

export function normalizePlatformSlug(value: string, field = 'slug'): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!SLUG_PATTERN.test(normalized)) {
    throw new ValidationDomainException('Slug is invalid', { field, value });
  }

  return normalized;
}

export function normalizeOptionalPlatformSlug(value?: string): string | undefined {
  return value === undefined ? undefined : normalizePlatformSlug(value);
}

export function normalizePlatformSearch(value?: string): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function normalizePlatformLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export function assertOrganizationCanReceiveSchool(params: {
  organizationId: string;
  status: OrganizationStatus;
}): void {
  if (params.status === OrganizationStatus.ARCHIVED) {
    throw new PlatformOrganizationArchivedException(params.organizationId);
  }

  if (params.status !== OrganizationStatus.ACTIVE) {
    throw new PlatformOrganizationInvalidStatusTransitionException(
      params.organizationId,
      params.status,
      OrganizationStatus.ACTIVE,
    );
  }
}

export function assertOrganizationCanMutate(params: {
  organizationId: string;
  status: OrganizationStatus;
}): void {
  if (params.status === OrganizationStatus.ARCHIVED) {
    throw new PlatformOrganizationArchivedException(params.organizationId);
  }
}

export function assertOrganizationCanTransition(params: {
  organizationId: string;
  currentStatus: OrganizationStatus;
  targetStatus: OrganizationStatus;
}): void {
  if (
    params.currentStatus === OrganizationStatus.ARCHIVED &&
    params.targetStatus !== OrganizationStatus.ARCHIVED
  ) {
    throw new PlatformOrganizationArchivedException(params.organizationId);
  }
}

export function assertSchoolCanMutate(params: {
  schoolId: string;
  status: SchoolStatus;
}): void {
  if (params.status === SchoolStatus.ARCHIVED) {
    throw new PlatformSchoolArchivedException(params.schoolId);
  }
}

export function assertSchoolCanTransition(params: {
  schoolId: string;
  currentStatus: SchoolStatus;
  targetStatus: SchoolStatus;
}): void {
  if (
    params.currentStatus === SchoolStatus.ARCHIVED &&
    params.targetStatus !== SchoolStatus.ARCHIVED
  ) {
    throw new PlatformSchoolInvalidStatusTransitionException(
      params.schoolId,
      params.currentStatus,
      params.targetStatus,
    );
  }
}
