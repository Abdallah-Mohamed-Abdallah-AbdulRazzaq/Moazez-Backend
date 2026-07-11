import { BadRequestException } from '@nestjs/common';
import {
  DashboardTodoPriority as PrismaDashboardTodoPriority,
  DashboardTodoStatus as PrismaDashboardTodoStatus,
} from '@prisma/client';
import {
  DashboardTodoPriority,
  DashboardTodoStatus,
} from '../dto/dashboard-todos.dto';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toDashboardTodoDate(value: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new BadRequestException('Todo date must be a YYYY-MM-DD value');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Todo date must be a valid calendar date');
  }

  return date;
}

export function normalizeDashboardTodoTitle(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestException('Todo title is required');
  }
  if (normalized.length > 160) {
    throw new BadRequestException('Todo title is too long');
  }
  return normalized;
}

export function normalizeDashboardTodoNotes(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (normalized.length > 1000) {
    throw new BadRequestException('Todo notes are too long');
  }
  return normalized || null;
}

export function toPrismaDashboardTodoStatus(
  value: DashboardTodoStatus,
): PrismaDashboardTodoStatus {
  return value === 'completed'
    ? PrismaDashboardTodoStatus.COMPLETED
    : PrismaDashboardTodoStatus.PENDING;
}

export function toPrismaDashboardTodoPriority(
  value: DashboardTodoPriority,
): PrismaDashboardTodoPriority {
  if (value === 'low') return PrismaDashboardTodoPriority.LOW;
  if (value === 'high') return PrismaDashboardTodoPriority.HIGH;
  return PrismaDashboardTodoPriority.NORMAL;
}

export function hasOwnProperty(value: object, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}
